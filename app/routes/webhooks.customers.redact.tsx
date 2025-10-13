import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logInfo } from "../logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  logInfo(`Received ${topic} webhook for ${shop}`, { shop });

  // GDPR compliance: Handle customer data redaction
  // In a real implementation, you would delete/remove customer data
  // For now, we just acknowledge the webhook

  return new Response();
};