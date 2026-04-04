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
              
              // Map pricing to plan limits based on actual billing.server.ts plan prices
              if (interval === 'ANNUAL') {
                // Annual plan prices (approx 10x monthly)
                if (amount >= 120) planLimit = 999999;   // Enterprise ($14.99/mo annual)
                else if (amount >= 80) planLimit = 550;   // Professional ($9.99/mo annual)
                else if (amount >= 40) planLimit = 150;   // Starter ($4.99/mo annual)
              } else {
                // Monthly plan prices
                if (amount >= 14.99) planLimit = 999999;  // Enterprise
                else if (amount >= 9.99) planLimit = 550; // Professional (25 free + 500 paid + 25 buffer)
                else if (amount >= 4.99) planLimit = 150; // Starter (25 free + 100 paid + 25 buffer)
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

    // Get merchant fulfillment cost settings for accurate savings calculation
    let individualShipCost = 7.0;
    let bundleShipCost = 9.0;
    try {
      const settings = await db.appSettings.findUnique({ where: { shop } });
      if (settings) {
        individualShipCost = (settings as any).individualShipCost ?? 7.0;
        bundleShipCost = (settings as any).bundleShipCost ?? 9.0;
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
          
          // TAG THE ORDER FOR FULFILLMENT — safe approach that doesn't modify customer-facing line items
          // The warehouse reads tags/notes/metafields to know which pre-packed bundle to ship
          try {
            if (!admin) {
              throw new Error('Admin API not available in webhook context - order tagging skipped');
            }

            const orderId = `gid://shopify/Order/${order.id}`;
            
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

            // Mark conversion as successful
            await db.orderConversion.updateMany({
              where: { shop, orderId: String(order.id) },
              data: { status: "success" }
            });

            logInfo('✅ Order tagged for bundle fulfillment', {
              shop,
              orderId: String(order.id),
              bundledSku: rule.bundledSku,
              tags: tagsToAdd,
              note: bundleNote
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
