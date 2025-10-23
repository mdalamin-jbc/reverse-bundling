import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logInfo } from "../logger.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session } = await authenticate.webhook(request);

  logInfo(`App uninstalled - cleaning up all data for shop: ${shop}`);

  try {
    // Clean up all app data when uninstalled
    // This ensures users start fresh when reinstalling and prevents free tier abuse
    await Promise.all([
      // Delete session
      session ? db.session.deleteMany({ where: { shop } }) : Promise.resolve(),
      
      // Delete all bundle rules
      db.bundleRule.deleteMany({ where: { shop } }),
      
      // Delete all order conversions
      db.orderConversion.deleteMany({ where: { shop } }),
      
      // Delete bundle analytics
      db.bundleAnalytics.deleteMany({ where: { shop } }),
      
      // Delete app settings
      db.appSettings.deleteMany({ where: { shop } }),
      
      // Delete fulfillment providers
      db.fulfillmentProvider.deleteMany({ where: { shop } })
    ]);

    logInfo(`Successfully cleaned up all data for uninstalled shop: ${shop}`);
  } catch (error) {
    logInfo(`Error during cleanup for shop ${shop}:`, { error: (error as Error).message });
    // Don't fail the webhook if cleanup has issues
  }

  return new Response();
};
