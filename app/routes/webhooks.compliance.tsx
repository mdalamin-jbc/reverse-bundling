import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logInfo } from "../logger.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  logInfo(`Received compliance webhook: ${topic} for ${shop}`, { shop, topic });

  // Handle different compliance webhook topics
  switch (topic) {
    case "customers/data_request":
      // GDPR compliance: Handle customer data request
      // In a real implementation, you would retrieve and return customer data
      // For now, we just acknowledge the webhook
      logInfo("Processing customer data request", { shop, topic });
      break;

    case "customers/redact":
      // GDPR compliance: Handle customer data redaction
      // In a real implementation, you would delete/remove customer data
      // For now, we just acknowledge the webhook
      logInfo("Processing customer data redaction", { shop, topic });
      break;

    case "shop/redact":
      // GDPR compliance: Handle shop data redaction
      // Delete all shop data when a shop is deleted
      logInfo("Processing shop data redaction", { shop, topic });
      await db.session.deleteMany({ where: { shop } });
      await db.bundleRule.deleteMany({ where: { shop } });
      await db.orderConversion.deleteMany({ where: { shop } });
      await db.appSettings.deleteMany({ where: { shop } });
      logInfo("Shop data redaction completed", { shop, topic });
      break;

    default:
      logInfo(`Unknown compliance webhook topic: ${topic}`, { shop, topic });
  }

  return new Response();
};