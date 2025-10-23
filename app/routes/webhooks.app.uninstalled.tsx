import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logInfo } from "../logger.server";
import { cache, cacheKeys } from "../cache.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop = "unknown";

  try {
    const { shop: authenticatedShop, session } = await authenticate.webhook(request);
    shop = authenticatedShop;

    logInfo(`App uninstalled - starting cleanup for shop: ${shop}`);

    // Delete data in the correct order to handle foreign key constraints
    // BundleRule has cascade delete for BundleAnalytics and OrderConversion
    const results = await Promise.allSettled([
      // Delete fulfillment providers first (no dependencies)
      db.fulfillmentProvider.deleteMany({ where: { shop } }).catch(err => {
        logInfo(`Failed to delete fulfillment providers for ${shop}: ${err.message}`);
        return null;
      }),

      // Delete app settings (no dependencies)
      db.appSettings.deleteMany({ where: { shop } }).catch(err => {
        logInfo(`Failed to delete app settings for ${shop}: ${err.message}`);
        return null;
      }),

      // Delete bundle rules (this will cascade delete analytics and conversions)
      db.bundleRule.deleteMany({ where: { shop } }).catch(err => {
        logInfo(`Failed to delete bundle rules for ${shop}: ${err.message}`);
        return null;
      }),

      // Delete session last
      session ? db.session.deleteMany({ where: { shop } }).catch(err => {
        logInfo(`Failed to delete session for ${shop}: ${err.message}`);
        return null;
      }) : Promise.resolve(null)
    ]);

    // Log results
    const fulfilled = results.filter(r => r.status === 'fulfilled').length;
    const rejected = results.filter(r => r.status === 'rejected').length;

    logInfo(`Cleanup completed for shop ${shop}: ${fulfilled} successful, ${rejected} failed`);

    // Invalidate all caches for this shop
    const shopCacheKeys = [
      cacheKeys.bundleRules(shop),
      cacheKeys.bundleAnalytics(shop),
      cacheKeys.shopStats(shop),
      cacheKeys.shopProducts(shop),
      cacheKeys.orderConversions(shop, 10),
      cacheKeys.analyticsSummary(shop, '30d')
    ];

    shopCacheKeys.forEach(key => {
      cache.delete(key);
      logInfo(`Invalidated cache key: ${key}`);
    });

    // Verify cleanup by checking if any data remains
    const remainingData = await Promise.all([
      db.bundleRule.count({ where: { shop } }),
      db.orderConversion.count({ where: { shop } }),
      db.bundleAnalytics.count({ where: { shop } }),
      db.appSettings.count({ where: { shop } }),
      db.fulfillmentProvider.count({ where: { shop } })
    ]);

    const [rules, conversions, analytics, settings, providers] = remainingData;

    if (rules > 0 || conversions > 0 || analytics > 0 || settings > 0 || providers > 0) {
      logInfo(`WARNING: Data still remains after cleanup for shop ${shop}:`, {
        rules, conversions, analytics, settings, providers
      });
    } else {
      logInfo(`✅ Complete data cleanup verified for shop ${shop}`);
    }

  } catch (error) {
    logInfo(`Critical error during uninstall cleanup for shop ${shop}:`, {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    // Still return success to Shopify - don't fail the webhook
  }

  return new Response();
};
