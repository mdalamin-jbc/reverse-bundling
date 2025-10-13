import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for shop: ${shop}`);

  // Handle order updates (e.g., fulfillment status changes)
  // You can use this to track when orders are fulfilled, cancelled, etc.

  return new Response("Webhook processed", { status: 200 });
};
