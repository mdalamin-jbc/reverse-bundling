import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logInfo, logError } from "../logger.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  logInfo(`Received compliance webhook: ${topic} for ${shop}`, { shop, topic });

  try {
    const webhookPayload = payload as {
      customer?: { id: number; email: string; phone: string };
      shop_id?: number;
      shop_domain?: string;
      orders_requested?: number[];
    };

    switch (topic) {
      case "customers/data_request": {
        // GDPR: Respond with customer data. This app stores customer IDs
        // in OrderHistory and OrderConversion. Log what data we hold.
        const customerId = webhookPayload.customer?.id
          ? String(webhookPayload.customer.id)
          : null;

        if (customerId) {
          const orderHistoryCount = await db.orderHistory.count({
            where: { shop, customerId },
          });

          logInfo("Customer data request processed", {
            shop,
            topic,
            customerId,
            orderHistoryRecords: orderHistoryCount,
          });
        } else {
          logInfo("Customer data request - no customer ID in payload", {
            shop,
            topic,
          });
        }
        break;
      }

      case "customers/redact": {
        // GDPR: Delete all customer-identifiable data
        const customerId = webhookPayload.customer?.id
          ? String(webhookPayload.customer.id)
          : null;

        if (customerId) {
          // Remove customer ID references from order history
          const updated = await db.orderHistory.updateMany({
            where: { shop, customerId },
            data: { customerId: null },
          });

          logInfo("Customer data redacted", {
            shop,
            topic,
            customerId,
            recordsUpdated: updated.count,
          });
        } else {
          logInfo("Customer redact - no customer ID in payload", {
            shop,
            topic,
          });
        }
        break;
      }

      case "shop/redact": {
        // GDPR: Delete ALL shop data — shop is being deleted
        logInfo("Processing shop data redaction", { shop, topic });

        await db.$transaction([
          db.bundleSuggestion.deleteMany({ where: { shop } }),
          db.itemCooccurrence.deleteMany({ where: { shop } }),
          db.orderHistory.deleteMany({ where: { shop } }),
          db.bundleAnalytics.deleteMany({ where: { shop } }),
          db.orderConversion.deleteMany({ where: { shop } }),
          db.bundleRule.deleteMany({ where: { shop } }),
          db.fulfillmentProvider.deleteMany({ where: { shop } }),
          db.appSettings.deleteMany({ where: { shop } }),
          db.session.deleteMany({ where: { shop } }),
        ]);

        logInfo("Shop data redaction completed — all data deleted", {
          shop,
          topic,
        });
        break;
      }

      default:
        logInfo(`Unknown compliance webhook topic: ${topic}`, { shop, topic });
    }
  } catch (error) {
    logError(error as Error, {
      shop,
      topic,
      context: "compliance_webhook",
    });
    // Still return success — Shopify needs 200 or it will retry
  }

  return new Response();
};