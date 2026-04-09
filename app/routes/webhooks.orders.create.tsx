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
        
        let planLimit = 25; // Free plan default (matches billing.server.ts freeOrderLimit)
        
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
              const amount = parseFloat(pricing.price?.amount) || 0;
              const interval = pricing.interval;
              
              // Map pricing to plan limits based on actual billing.server.ts plan prices
              // Starter: $17.99/30 days or $150/year → 125 orders/month
              // Professional: $39.99/30 days or $350/year → 525 orders/month
              // Enterprise: $79.99/30 days or $700/year → unlimited
              if (interval === 'ANNUAL') {
                if (amount >= 600) planLimit = 999999;      // Enterprise ($700/year)
                else if (amount >= 300) planLimit = 525;    // Professional ($350/year)
                else if (amount >= 100) planLimit = 125;    // Starter ($150/year)
              } else {
                if (Math.abs(amount - 79.99) < 1) planLimit = 999999;  // Enterprise ($79.99/30 days)
                else if (Math.abs(amount - 39.99) < 1) planLimit = 525; // Professional ($39.99/30 days)
                else if (Math.abs(amount - 17.99) < 1) planLimit = 125; // Starter ($17.99/30 days)
              }
            } else {
              // No pricing details — fallback to subscription name
              const subName = (activeSubscription.name || '').toLowerCase();
              if (subName.includes('enterprise')) planLimit = 999999;
              else if (subName.includes('professional')) planLimit = 525;
              else if (subName.includes('starter')) planLimit = 125;
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
            planName: planLimit === 999999 ? 'Enterprise' : planLimit === 525 ? 'Professional' : planLimit === 125 ? 'Starter' : 'Free'
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

    // Get merchant fulfillment cost settings for accurate savings calculation
    let individualShipCost = 7.0;
    let bundleShipCost = 9.0;
    let fulfillmentMode = 'tag_only';
    try {
      const settings = await db.appSettings.findUnique({ where: { shop } });
      if (settings) {
        individualShipCost = (settings as any).individualShipCost ?? 7.0;
        bundleShipCost = (settings as any).bundleShipCost ?? 9.0;
        fulfillmentMode = (settings as any).fulfillmentMode ?? 'tag_only';
      }
    } catch { /* use defaults */ }

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
        // Also verify each rule item has at least quantity 1
        const hasAllItems = ruleItems.every(ruleItem => {
          // Find a matching line item with quantity >= 1
          return lineItems.some(li => {
            const matchesSku = li.sku === ruleItem;
            const matchesVariant = li.variant_id
              ? `gid://shopify/ProductVariant/${li.variant_id}` === ruleItem
              : false;
            return (matchesSku || matchesVariant) && (li.quantity || 0) >= 1;
          });
        });

        if (hasAllItems) {
          logInfo(`Bundle match found! Rule: ${rule.name}`, { 
            shop, 
            orderId: String(order.id),
            ruleId: rule.id,
            bundledSku: rule.bundledSku
          });

          // Guard: skip rules with invalid bundledSku (e.g. literal "undefined" from form bug)
          if (!rule.bundledSku || rule.bundledSku === 'undefined' || rule.bundledSku === 'null') {
            logWarning(`Skipping rule "${rule.name}" — bundledSku is invalid: "${rule.bundledSku}"`, {
              shop, orderId: String(order.id), ruleId: rule.id
            });
            continue;
          }

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

          // Create order conversion record with status tracking
          const originalIdentifiers = [...new Set([...orderSkus, ...orderVariantIds])];
          const ruleItems = JSON.parse(rule.items) as string[];
          // Calculate real savings from merchant's fulfillment costs
          const calculatedSavings = (ruleItems.length * individualShipCost) - bundleShipCost;
          const actualSavings = calculatedSavings > 0 ? calculatedSavings : rule.savings;
          
          await db.orderConversion.create({
            data: {
              shop,
              orderId: String(order.id),
              originalItems: JSON.stringify(originalIdentifiers),
              bundledSku: rule.bundledSku,
              bundleRuleId: rule.id,
              savingsAmount: actualSavings,
              status: "pending",
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

          // Update bundle rule statistics (frequency + accumulated savings)
          await db.bundleRule.update({
            where: { id: rule.id },
            data: {
              frequency: {
                increment: 1,
              },
              savings: {
                increment: actualSavings,
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
              savings: actualSavings,
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
          
          // TAG THE ORDER FOR FULFILLMENT — mode depends on merchant's fulfillmentMode setting
          try {
            if (!admin) {
              throw new Error('Admin API not available in webhook context - order tagging skipped');
            }

            const orderId = `gid://shopify/Order/${order.id}`;

            if (fulfillmentMode === 'order_edit') {
              // === ORDER EDIT MODE ===
              // Replaces individual line items with the bundle product variant
              // 3PL software (ShipStation, ShipBob) reads line items automatically
              logInfo('Using order_edit fulfillment mode', { shop, orderId: String(order.id), bundledSku: rule.bundledSku });

              // Step 1: Find the bundle product variant by SKU
              const skuLookupResponse = await admin.graphql(`
                query FindVariantBySku($query: String!) {
                  productVariants(first: 1, query: $query) {
                    edges {
                      node {
                        id
                        sku
                        title
                        product { title }
                      }
                    }
                  }
                }
              `, { variables: { query: `sku:${rule.bundledSku}` } });

              const skuLookupData = await skuLookupResponse.json();
              const bundleVariant = skuLookupData.data?.productVariants?.edges?.[0]?.node;

              if (!bundleVariant) {
                logWarning(`Bundle product with SKU "${rule.bundledSku}" not found — falling back to tag_only mode`, {
                  shop, orderId: String(order.id), bundledSku: rule.bundledSku,
                });
                // Fall through to tag_only mode below
              } else {
                // Step 2: Begin order edit — fetch calculated line items with their proper IDs
                const editBeginResponse = await admin.graphql(`
                  mutation orderEditBegin($id: ID!) {
                    orderEditBegin(id: $id) {
                      calculatedOrder {
                        id
                        lineItems(first: 50) {
                          edges {
                            node {
                              id
                              quantity
                              variant {
                                id
                                sku
                              }
                            }
                          }
                        }
                      }
                      userErrors { field message }
                    }
                  }
                `, { variables: { id: orderId } });

                const editBeginData = await editBeginResponse.json();
                const calculatedOrder = editBeginData.data?.orderEditBegin?.calculatedOrder;
                const beginErrors = editBeginData.data?.orderEditBegin?.userErrors || [];

                if (beginErrors.length > 0 || !calculatedOrder) {
                  throw new Error(`orderEditBegin failed: ${beginErrors.map((e: any) => e.message).join(', ') || 'No calculated order returned'}`);
                }

                const calculatedOrderId = calculatedOrder.id;
                const calculatedLineItems = calculatedOrder.lineItems?.edges?.map((e: any) => e.node) || [];

                logInfo('Order edit started — calculated line items:', {
                  shop,
                  orderId: String(order.id),
                  calculatedOrderId,
                  lineItemCount: calculatedLineItems.length,
                  lineItems: calculatedLineItems.map((cli: any) => ({
                    id: cli.id,
                    sku: cli.variant?.sku,
                    variantId: cli.variant?.id,
                    quantity: cli.quantity,
                  })),
                });

                // Step 3: Remove the individual items using CalculatedLineItem IDs from the calculated order
                let removedCount = 0;
                for (const ruleItem of ruleItems) {
                  // Match against the CALCULATED order's line items (not webhook payload)
                  const matchingCalcItem = calculatedLineItems.find((cli: any) => {
                    const matchesSku = cli.variant?.sku === ruleItem;
                    const matchesVariant = cli.variant?.id === ruleItem;
                    return (matchesSku || matchesVariant) && cli.quantity > 0;
                  });

                  if (matchingCalcItem) {
                    const setQtyResponse = await admin.graphql(`
                      mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
                        orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
                          calculatedOrder { id }
                          userErrors { field message }
                        }
                      }
                    `, {
                      variables: { id: calculatedOrderId, lineItemId: matchingCalcItem.id, quantity: 0 }
                    });

                    const setQtyData = await setQtyResponse.json();
                    const setQtyErrors = setQtyData.data?.orderEditSetQuantity?.userErrors || [];

                    if (setQtyErrors.length > 0) {
                      logWarning(`orderEditSetQuantity failed for ${ruleItem}: ${setQtyErrors.map((e: any) => e.message).join(', ')}`, {
                        shop, orderId: String(order.id), ruleItem, lineItemId: matchingCalcItem.id,
                      });
                    } else {
                      removedCount++;
                      logInfo(`Removed line item for rule item: ${ruleItem}`, {
                        shop, orderId: String(order.id), lineItemId: matchingCalcItem.id,
                      });
                    }
                  } else {
                    logWarning(`No matching calculated line item found for rule item: ${ruleItem}`, {
                      shop, orderId: String(order.id), ruleItem,
                      availableItems: calculatedLineItems.map((cli: any) => ({
                        id: cli.id, sku: cli.variant?.sku, variantId: cli.variant?.id,
                      })),
                    });
                  }
                }

                // Step 4: Add the bundle variant
                const addVariantResponse = await admin.graphql(`
                  mutation orderEditAddVariant($id: ID!, $variantId: ID!) {
                    orderEditAddVariant(id: $id, variantId: $variantId, quantity: 1) {
                      calculatedOrder { id }
                      userErrors { field message }
                    }
                  }
                `, {
                  variables: { id: calculatedOrderId, variantId: bundleVariant.id }
                });

                const addVariantData = await addVariantResponse.json();
                const addVariantErrors = addVariantData.data?.orderEditAddVariant?.userErrors || [];

                if (addVariantErrors.length > 0) {
                  throw new Error(`orderEditAddVariant failed: ${addVariantErrors.map((e: any) => e.message).join(', ')}`);
                }

                logInfo(`Added bundle variant to order`, {
                  shop, orderId: String(order.id), bundleVariantId: bundleVariant.id, removedItems: removedCount,
                });

                // Step 5: Commit the edit
                const commitResponse = await admin.graphql(`
                  mutation orderEditCommit($id: ID!) {
                    orderEditCommit(id: $id) {
                      order { id }
                      userErrors { field message }
                    }
                  }
                `, { variables: { id: calculatedOrderId } });

                const commitData = await commitResponse.json();
                const commitErrors = commitData.data?.orderEditCommit?.userErrors || [];

                if (commitErrors.length > 0) {
                  throw new Error(`orderEditCommit failed: ${commitErrors.map((e: any) => e.message).join(', ')}`);
                }

                // Also add tags for tracking
                const tagsToAdd = [
                  'reverse-bundled',
                  'order-edited',
                  `bundle:${rule.bundledSku}`,
                  `bundle-rule:${rule.name.replace(/[^a-zA-Z0-9-_]/g, '-')}`
                ];

                await admin.graphql(`
                  mutation tagsAdd($id: ID!, $tags: [String!]!) {
                    tagsAdd(id: $id, tags: $tags) {
                      userErrors { field message }
                    }
                  }
                `, { variables: { id: orderId, tags: tagsToAdd } });

                logInfo('✅ Order edited for bundle fulfillment (line items replaced)', {
                  shop,
                  orderId: String(order.id),
                  bundledSku: rule.bundledSku,
                  bundleVariantId: bundleVariant.id,
                  mode: 'order_edit'
                });
              } // end bundleVariant found
            }

            // === TAG ONLY MODE (default, or fallback when bundle product not found) ===
            if (fulfillmentMode !== 'order_edit') {
              // Safe approach — doesn't modify customer-facing line items
              // Warehouse reads tags/notes/metafields to know which pre-packed bundle to ship

              // Build fulfillment note with clear instructions
              const bundleNote = `⚡ REVERSE BUNDLE: Fulfill with pre-packed SKU "${rule.bundledSku}" instead of shipping ${ruleItems.length} individual items. Rule: ${rule.name}`;

              // Existing note (if any) — append rather than overwrite
              const existingNote = (payload as any).note || '';
              const fullNote = existingNote
                ? `${existingNote}\n\n${bundleNote}`
                : bundleNote;

              // Step 1: Add tags to the order for easy filtering in Shopify admin
              const tagsToAdd = [
                'reverse-bundled',
                `bundle:${rule.bundledSku}`,
                `bundle-rule:${rule.name.replace(/[^a-zA-Z0-9-_]/g, '-')}`
              ];

              await admin.graphql(`
                mutation tagsAdd($id: ID!, $tags: [String!]!) {
                  tagsAdd(id: $id, tags: $tags) {
                    userErrors {
                      field
                      message
                    }
                  }
                }
              `, {
                variables: { id: orderId, tags: tagsToAdd }
              });

              // Step 2: Update order note with fulfillment instructions
              await admin.graphql(`
                mutation orderUpdate($input: OrderInput!) {
                  orderUpdate(input: $input) {
                    order { id }
                    userErrors { field message }
                  }
                }
              `, {
                variables: {
                  input: {
                    id: orderId,
                    note: fullNote,
                    metafields: [{
                      namespace: "reverse_bundle",
                      key: "fulfillment_instruction",
                      type: "json",
                      value: JSON.stringify({
                        bundledSku: rule.bundledSku,
                        bundleRuleName: rule.name,
                        originalItems: ruleItems,
                        savings: actualSavings,
                        convertedAt: new Date().toISOString(),
                        instruction: `Ship pre-packed bundle SKU ${rule.bundledSku} instead of ${ruleItems.length} individual items`
                      })
                    }]
                  }
                }
              });

              logInfo('✅ Order tagged for bundle fulfillment', {
                shop,
                orderId: String(order.id),
                bundledSku: rule.bundledSku,
                tags: tagsToAdd,
                note: bundleNote,
                mode: 'tag_only'
              });
            }

            // Mark conversion as successful (both modes reach here on success)
            await db.orderConversion.updateMany({
              where: { shop, orderId: String(order.id) },
              data: { status: "success" }
            });

          } catch (taggingError) {
            logError(taggingError as Error, {
              context: 'order_tagging',
              shop,
              orderId: String(order.id),
              bundledSku: rule.bundledSku
            });
            
            // Mark conversion as failed with error details
            await db.orderConversion.updateMany({
              where: { shop, orderId: String(order.id) },
              data: { 
                status: "failed",
                errorMessage: (taggingError as Error).message?.substring(0, 500)
              }
            });
            
            logInfo('Order conversion recorded but Shopify tagging failed — merchant can tag manually', {
              shop,
              orderId: String(order.id),
              error: (taggingError as Error).message
            });
          }
          
          perfMonitor.end({ shop, orderId: String(order.id), success: true });
          // Continue to check other rules — don't break (multiple bundles per order)
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
