import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logInfo } from "../logger.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  logInfo(`Received ${topic} webhook for ${shop}`, { shop });

  // GDPR compliance: Handle shop data redaction
  // Delete all shop data when a shop is deleted
  await db.session.deleteMany({ where: { shop } });
  await db.bundleRule.deleteMany({ where: { shop } });
  await db.orderConversion.deleteMany({ where: { shop } });
  await db.appSettings.deleteMany({ where: { shop } });

  return new Response();
};