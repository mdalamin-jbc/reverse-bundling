import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logError, logInfo, logWarning, PerformanceMonitor } from "../logger.server";
import { sendBundleDetectedEmail, getMerchantEmailSettings } from "../email.server";
import { webhookRateLimiter } from "../rate-limiter.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const perfMonitor = new PerformanceMonitor("webhooks.orders.create");

  // Rate limiting check
  const rateLimitResult = await webhookRateLimiter(request);
  if (!rateLimitResult.allowed) {
    logWarning("Webhook rate limit exceeded", {
      shop: "unknown",
      remaining: rateLimitResult.remaining,
      resetTime: new Date(rateLimitResult.resetTime).toISOString(),
      totalRequests: rateLimitResult.totalRequests
    });
    return new Response("Rate limit exceeded", { status: 429 });
  }
  
  const authResult = await authenticate.webhook(request);
  const { shop, topic, payload, admin } = authResult;

  logInfo(`Received ${topic} webhook`, { shop, topic });

  if (!payload || typeof payload !== 'object') {
    logError(new Error("Invalid payload received"), { shop, topic });
    return new Response("Invalid payload", { status: 400 });
  }

  try {
    const order = payload as {
      id: string | number;
      name?: string;
      total_price?: string;
      subtotal_price?: string;
      line_items?: Array<{
        id: string | number;
        sku?: string;
        name?: string;
        quantity?: number;
        variant_id?: string | number;
        price?: string;
      }>;
    };

    logInfo(`Processing order: ${order.name || order.id}`, { shop, orderId: String(order.id) });

    // Check plan limits before processing (only if admin API is available)
    if (admin) {
      try {
        const { hasActiveSubscription } = await import("../billing.server");
        const hasSubscription = await hasActiveSubscription(admin, shop);
        
        let planLimit = 50; // Free plan default
        
        if (hasSubscription) {
          // Get current subscription details
          const subscriptionResponse = await admin.graphql(
            `#graphql
              query {
                currentAppInstallation {
                  activeSubscriptions {
                    id
                    name
                    status
                    lineItems {
                      plan {
                        pricingDetails {
                          ... on AppRecurringPricing {
                            price {
                              amount
                            }
                            interval
                          }
                        }
                      }
                    }
                  }
                }
              }`
          );
          const subscriptionData = await subscriptionResponse.json();
          const subscriptions = subscriptionData.data?.currentAppInstallation?.activeSubscriptions || [];
          const activeSubscription = subscriptions.find((sub: any) => sub.status === 'ACTIVE');
          
          if (activeSubscription) {
            const pricing = activeSubscription.lineItems?.[0]?.plan?.pricingDetails;
            if (pricing) {
              const amount = pricing.price?.amount || 0;
              const interval = pricing.interval;
              
              // Map pricing to plan limits
              if (interval === 'ANNUAL') {
                if (amount >= 1000) planLimit = 999999; // Enterprise
                else if (amount >= 500) planLimit = 2050; // Professional
                else if (amount >= 200) planLimit = 550; // Starter
              } else {
                if (amount >= 199) planLimit = 999999; // Enterprise
                else if (amount >= 79) planLimit = 2050; // Professional
                else if (amount >= 29) planLimit = 550; // Starter
              }
            }
          }
        }
        
        // Check current order count for this month
        const currentMonth = new Date();
        currentMonth.setDate(1);
        currentMonth.setHours(0, 0, 0, 0);
        
        const orderCountThisMonth = await db.orderConversion.count({
          where: {
            shop,
            convertedAt: {
              gte: currentMonth
            }
          }
        });
        
        if (orderCountThisMonth >= planLimit) {
          logWarning(`Plan limit exceeded - skipping bundle processing`, {
            shop,
            orderId: String(order.id),
            orderCountThisMonth,
            planLimit,
            planName: planLimit === 999999 ? 'Enterprise' : planLimit === 2050 ? 'Professional' : planLimit === 550 ? 'Starter' : 'Free'
          });
          
          perfMonitor.end({ shop, orderId: String(order.id), limitExceeded: true });
          return new Response("Plan limit exceeded", { status: 200 });
        }
        
      } catch (limitCheckError) {
        logError(limitCheckError as Error, { 
          context: 'plan_limit_check', 
          shop, 
          orderId: String(order.id) 
        });
        // Continue processing if limit check fails (fail open)
      }
    } else {
      logInfo('Admin API not available in webhook context, skipping plan limit check', { shop, orderId: String(order.id) });
    }

    // Get active bundle rules for this shop
    const bundleRules = await db.bundleRule.findMany({
      where: {
        shop,
        status: "active",
      },
    });

    if (bundleRules.length === 0) {
      logInfo("No active bundle rules found", { shop });
      perfMonitor.end({ shop });
      return new Response("No active rules", { status: 200 });
    }

    // Extract order line items
    const lineItems = order.line_items || [];
    const orderSkus = lineItems
      .map(item => item.sku)
      .filter((sku): sku is string => !!sku);

    // Also extract variant IDs (in case bundle rules use variant IDs instead of SKUs)
    const orderVariantIds = lineItems
      .map(item => {
        if (item.variant_id) {
          return `gid://shopify/ProductVariant/${item.variant_id}`;
        }
        return null;
      })
      .filter((id): id is string => !!id);

    if (orderSkus.length === 0 && orderVariantIds.length === 0) {
      logInfo("No SKUs or variant IDs found in order", { shop, orderId: String(order.id) });
      perfMonitor.end({ shop });
      return new Response("No SKUs", { status: 200 });
    }

    logInfo(`Order SKUs found: ${orderSkus.join(", ")}`, { shop, orderId: String(order.id) });
    logInfo(`Order Variant IDs found: ${orderVariantIds.join(", ")}`, { shop, orderId: String(order.id) });

    // Check each bundle rule for matches
    for (const rule of bundleRules) {
      try {
        const ruleItems = JSON.parse(rule.items) as string[];
        
        // Check if all items in the rule are present in the order
        // Support both SKU matching AND variant ID matching
        const hasAllItems = ruleItems.every(ruleItem => 
          orderSkus.includes(ruleItem) || orderVariantIds.includes(ruleItem)
        );

        if (hasAllItems) {
          logInfo(`Bundle match found! Rule: ${rule.name}`, { 
            shop, 
            orderId: String(order.id),
            ruleId: rule.id,
            bundledSku: rule.bundledSku
          });

          // Check if conversion already exists for this order to prevent duplicates
          const existingConversion = await db.orderConversion.findFirst({
            where: {
              shop,
              orderId: String(order.id),
            },
          });

          if (existingConversion) {
            logInfo(`Conversion already exists for order ${order.id}, skipping duplicate`, { shop, orderId: String(order.id) });
            perfMonitor.end({ shop, orderId: String(order.id), skipped: true });
            return new Response("Conversion already exists", { status: 200 });
          }

          // Create order conversion record
          const originalIdentifiers = [...new Set([...orderSkus, ...orderVariantIds])];
          await db.orderConversion.create({
            data: {
              shop,
              orderId: String(order.id),
              originalItems: JSON.stringify(originalIdentifiers),
              bundledSku: rule.bundledSku,
              bundleRuleId: rule.id,
              savingsAmount: rule.savings,
            },
          });

          // 🔥 CRITICAL FIX: Mark the order as processed in OrderHistory to prevent circular analysis
          // This ensures the bundle analysis algorithm only uses raw customer orders, not processed bundles
          try {
            const orderHistoryUpdate = await db.orderHistory.updateMany({
              where: {
                shop,
                orderId: String(order.id),
                processed: false, // Only update if not already processed
              },
              data: {
                processed: true,
              },
            });

            if (orderHistoryUpdate.count > 0) {
              logInfo(`Order marked as processed in OrderHistory`, {
                shop,
                orderId: String(order.id),
                recordsUpdated: orderHistoryUpdate.count
              });
            } else {
              logWarning(`Order not found in OrderHistory or already processed`, {
                shop,
                orderId: String(order.id)
              });
            }
          } catch (historyUpdateError) {
            logError(historyUpdateError as Error, {
              context: 'order_history_update',
              shop,
              orderId: String(order.id)
            });
            // Don't fail the webhook if history update fails
          }

          // Update bundle rule statistics
          await db.bundleRule.update({
            where: { id: rule.id },
            data: {
              frequency: {
                increment: 1,
              },
            },
          });

          logInfo(`Order conversion saved! Bundled SKU: ${rule.bundledSku}`, {
            shop,
            orderId: String(order.id),
            bundledSku: rule.bundledSku,
            savings: rule.savings
          });
          
          // Send email notification if enabled
          try {
            const emailSettings = await getMerchantEmailSettings(shop);
            if (emailSettings.emailEnabled) {
              // Get merchant email from session
              const session = await db.session.findFirst({
                where: { shop },
                orderBy: { id: 'desc' },
              });
              
              if (session?.email) {
                await sendBundleDetectedEmail({
                  merchantEmail: session.email,
                  merchantName: session.firstName || 'Merchant',
                  orderNumber: order.name || `#${String(order.id)}`,
                  bundleName: rule.name,
                  bundledSku: rule.bundledSku,
                  savings: rule.savings,
                  items: ruleItems,
                  appUrl: `https://${shop}/admin/apps/reverse-bundling/app`,
                });
                logInfo('Bundle detection email sent', { shop, orderId: String(order.id) });
              }
            }
          } catch (emailError) {
            // Don't fail the webhook if email fails
            logError(emailError as Error, { context: 'send_bundle_email', shop, orderId: String(order.id) });
          }

          // Send Slack notification if enabled
          try {
            const { sendBundleDetectedSlackNotification } = await import("../slack.server");
            const slackResult = await sendBundleDetectedSlackNotification({
              shop,
              orderNumber: order.name || `#${String(order.id)}`,
              bundleName: rule.name,
              bundledSku: rule.bundledSku,
              savings: rule.savings,
              items: ruleItems,
              appUrl: `https://${shop}/admin/apps/reverse-bundling/app`,
            });

            if (slackResult.success) {
              logInfo('Bundle detection Slack notification sent', { shop, orderId: String(order.id) });
            } else {
              logInfo('Slack notification skipped', { shop, orderId: String(order.id), reason: (slackResult as any).reason });
            }
          } catch (slackError) {
            // Don't fail the webhook if Slack fails
            logError(slackError as Error, { context: 'send_slack_notification', shop, orderId: String(order.id) });
          }
          
          // 🔥 MODIFY THE ORDER IN SHOPIFY - Make it real!
          try {
            // Check if admin API is available from webhook
            if (!admin) {
              throw new Error('Admin API not available in webhook context - order modification skipped');
            }

            // Get session for reference
            const session = await db.session.findFirst({
              where: { shop },
              orderBy: { id: 'desc' },
            });

            if (!session) {
              logInfo('No session found but continuing with admin from webhook', { shop });
            }

            // Step 1: Find the bundle product by SKU in Shopify
            logInfo('Looking up bundle product in Shopify', { 
              shop, 
              bundledSku: rule.bundledSku 
            });

            const productQuery = await admin.graphql(`
              query FindBundleProduct($query: String!) {
                products(first: 1, query: $query) {
                  edges {
                    node {
                      id
                      title
                      variants(first: 1) {
                        edges {
                          node {
                            id
                            sku
                            price
                          }
                        }
                      }
                    }
                  }
                }
              }
            `, {
              variables: {
                query: `sku:${rule.bundledSku}`
              }
            });

            const productData = await productQuery.json();
            const bundleProduct = productData.data?.products?.edges?.[0]?.node;

            if (!bundleProduct) {
              const errorMsg = `Bundle product not found for SKU: ${rule.bundledSku}. Please create this product in Shopify first with the exact SKU "${rule.bundledSku}". The bundle rule "${rule.name}" requires this product to exist.`;
              logError(new Error(errorMsg), { 
                shop, 
                bundledSku: rule.bundledSku, 
                ruleName: rule.name,
                orderId: String(order.id)
              });
              throw new Error(errorMsg);
            }

            const bundleVariantId = bundleProduct.variants.edges[0]?.node?.id;

            logInfo('Bundle product found', { 
              shop, 
              bundleProductId: bundleProduct.id,
              bundleVariantId,
              bundleTitle: bundleProduct.title
            });

            // Step 2: Modify the order - remove original items, add bundle
            const orderId = `gid://shopify/Order/${order.id}`;
            
            // Calculate total quantity (sum of all matched items)
            const matchedLineItems = lineItems.filter(item => {
              const itemSku = item.sku || '';
              const itemVariantId = item.variant_id ? `gid://shopify/ProductVariant/${item.variant_id}` : '';
              return ruleItems.includes(itemSku) || ruleItems.includes(itemVariantId);
            });
            
            const totalQuantity = matchedLineItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

            // Get line item IDs to remove
            const lineItemIdsToRemove = matchedLineItems.map(item => 
              `gid://shopify/LineItem/${item.id}`
            );

            logInfo('Modifying order in Shopify', {
              shop,
              orderId,
              removing: lineItemIdsToRemove.length,
              adding: bundleVariantId,
              quantity: totalQuantity
            });

            // Use orderEditBegin to modify the order
            const editBeginResponse = await admin.graphql(`
              mutation orderEditBegin($id: ID!) {
                orderEditBegin(id: $id) {
                  calculatedOrder {
                    id
                    lineItems(first: 50) {
                      edges {
                        node {
                          id
                          variant {
                            id
                          }
                        }
                      }
                    }
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `, {
              variables: {
                id: orderId
              }
            });

            const editBeginData = await editBeginResponse.json();
            
            if (editBeginData.data?.orderEditBegin?.userErrors?.length > 0) {
              throw new Error(`Failed to begin order edit: ${JSON.stringify(editBeginData.data.orderEditBegin.userErrors)}`);
            }

            const calculatedOrderId = editBeginData.data?.orderEditBegin?.calculatedOrder?.id;
            const calculatedLineItems = editBeginData.data?.orderEditBegin?.calculatedOrder?.lineItems?.edges || [];
            
            // Map variant IDs to calculated line item IDs
            const variantToCalculatedLineItem = new Map();
            calculatedLineItems.forEach((edge: any) => {
              const variantId = edge.node.variant?.id;
              const calculatedLineItemId = edge.node.id;
              if (variantId && calculatedLineItemId) {
                variantToCalculatedLineItem.set(variantId, calculatedLineItemId);
              }
            });

            // Add the bundle item with custom price matching the original items
            const addItemResponse = await admin.graphql(`
              mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!, $allowDuplicates: Boolean) {
                orderEditAddVariant(
                  id: $id
                  variantId: $variantId
                  quantity: $quantity
                  allowDuplicates: $allowDuplicates
                ) {
                  calculatedLineItem {
                    id
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `, {
              variables: {
                id: calculatedOrderId,
                variantId: bundleVariantId,
                quantity: 1,
                allowDuplicates: false
              }
            });

            const addItemData = await addItemResponse.json();
            
            if (addItemData.data?.orderEditAddVariant?.userErrors?.length > 0) {
              throw new Error(`Failed to add bundle item: ${JSON.stringify(addItemData.data.orderEditAddVariant.userErrors)}`);
            }

            // Remove original line items using CALCULATED line item IDs
            for (const item of matchedLineItems) {
              const variantId = `gid://shopify/ProductVariant/${item.variant_id}`;
              const calculatedLineItemId = variantToCalculatedLineItem.get(variantId);
              
              if (calculatedLineItemId) {
                await admin.graphql(`
                  mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
                    orderEditSetQuantity(
                      id: $id
                      lineItemId: $lineItemId
                      quantity: $quantity
                    ) {
                      calculatedLineItem {
                        id
                      }
                      userErrors {
                        field
                        message
                      }
                    }
                  }
                `, {
                  variables: {
                    id: calculatedOrderId,
                    lineItemId: calculatedLineItemId,
                    quantity: 0 // Set to 0 to remove
                  }
                });
              }
            }

            // Commit the changes
            const commitResponse = await admin.graphql(`
              mutation orderEditCommit($id: ID!) {
                orderEditCommit(
                  id: $id
                  notifyCustomer: false
                ) {
                  order {
                    id
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `, {
              variables: {
                id: calculatedOrderId
              }
            });

            const commitData = await commitResponse.json();
            
            if (commitData.data?.orderEditCommit?.userErrors?.length > 0) {
              throw new Error(`Failed to commit order edit: ${JSON.stringify(commitData.data.orderEditCommit.userErrors)}`);
            }

            logInfo('✅ Order successfully modified in Shopify!', {
              shop,
              orderId: String(order.id),
              bundledSku: rule.bundledSku,
              removedItems: lineItemIdsToRemove.length,
              addedBundle: bundleProduct.title
            });

          } catch (modificationError) {
            logError(modificationError as Error, {
              context: 'order_modification',
              shop,
              orderId: String(order.id),
              bundledSku: rule.bundledSku
            });
            
            // Don't fail the webhook - conversion still recorded in DB
            logInfo('Order conversion recorded but Shopify modification failed', {
              shop,
              orderId: String(order.id),
              error: (modificationError as Error).message
            });
          }
          
          perfMonitor.end({ shop, orderId: String(order.id), success: true });
          break; // Only apply first matching rule
        }
      } catch (error) {
        logError(error as Error, { 
          shop, 
          ruleId: rule.id, 
          orderId: String(order.id) 
        });
      }
    }

    perfMonitor.end({ shop });
    return new Response("Webhook processed", { status: 200 });
  } catch (error) {
    logError(error as Error, { shop, topic });
    perfMonitor.end({ shop, error: true });
    return new Response("Error processing webhook", { status: 500 });
  }
};
