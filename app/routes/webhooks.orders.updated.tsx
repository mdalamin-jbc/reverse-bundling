import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logInfo, logError, logWarning } from "../logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  logInfo(`Received ${topic} for shop: ${shop}`);

  try {
    const order = payload as {
      id: string | number;
      name?: string;
      cancelled_at?: string | null;
      financial_status?: string;
    };

    // Handle cancellation — if an order we converted gets cancelled, log it
    if (order.cancelled_at) {
      const orderId = String(order.id);

      const existingConversion = await db.orderConversion.findFirst({
        where: { shop, orderId },
        include: { bundleRule: true },
      });

      if (existingConversion) {
        logWarning("Converted order was cancelled", {
          shop,
          orderId,
          bundleRuleId: existingConversion.bundleRuleId,
          bundledSku: existingConversion.bundledSku,
          savings: existingConversion.savingsAmount,
        });

        // Decrement the bundle rule frequency
        await db.bundleRule.update({
          where: { id: existingConversion.bundleRuleId },
          data: { frequency: { decrement: 1 } },
        });
      }
    }
  } catch (error) {
    logError(error as Error, { shop, topic });
  }

  return new Response("Webhook processed", { status: 200 });
};
