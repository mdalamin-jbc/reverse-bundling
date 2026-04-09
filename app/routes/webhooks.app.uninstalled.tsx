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

    // Delete data in correct order to handle foreign key constraints
    // Use transaction for atomicity
    try {
      await db.$transaction([
        db.bundleSuggestion.deleteMany({ where: { shop } }),
        db.itemCooccurrence.deleteMany({ where: { shop } }),
        db.orderHistory.deleteMany({ where: { shop } }),
        db.bundleAnalytics.deleteMany({ where: { shop } }),
        db.orderConversion.deleteMany({ where: { shop } }),
        db.bundleRule.deleteMany({ where: { shop } }),
        db.fulfillmentProvider.deleteMany({ where: { shop } }),
        db.appSettings.deleteMany({ where: { shop } }),
        ...(session ? [db.session.deleteMany({ where: { shop } })] : []),
      ]);
      logInfo(`✅ Complete data cleanup for shop ${shop}`);
    } catch (txError) {
      logInfo(`Transaction cleanup failed for ${shop}, attempting individual deletes`, {
        error: (txError as Error).message
      });
      // Fallback: delete individually, log failures
      const tables = [
        { name: 'bundleSuggestion', fn: () => db.bundleSuggestion.deleteMany({ where: { shop } }) },
        { name: 'itemCooccurrence', fn: () => db.itemCooccurrence.deleteMany({ where: { shop } }) },
        { name: 'orderHistory', fn: () => db.orderHistory.deleteMany({ where: { shop } }) },
        { name: 'bundleAnalytics', fn: () => db.bundleAnalytics.deleteMany({ where: { shop } }) },
        { name: 'orderConversion', fn: () => db.orderConversion.deleteMany({ where: { shop } }) },
        { name: 'bundleRule', fn: () => db.bundleRule.deleteMany({ where: { shop } }) },
        { name: 'fulfillmentProvider', fn: () => db.fulfillmentProvider.deleteMany({ where: { shop } }) },
        { name: 'appSettings', fn: () => db.appSettings.deleteMany({ where: { shop } }) },
        ...(session ? [{ name: 'session', fn: () => db.session.deleteMany({ where: { shop } }) }] : []),
      ];
      for (const table of tables) {
        try { await table.fn(); } catch (err) {
          logInfo(`Failed to delete ${table.name} for ${shop}: ${(err as Error).message}`);
        }
      }
    }

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
      db.fulfillmentProvider.count({ where: { shop } }),
      db.bundleSuggestion.count({ where: { shop } }),
      db.itemCooccurrence.count({ where: { shop } }),
      db.orderHistory.count({ where: { shop } }),
      db.session.count({ where: { shop } }),
    ]);

    const [rules, conversions, analytics, settings, providers, suggestions, cooccurrences, history, sessions] = remainingData;
    const totalRemaining = rules + conversions + analytics + settings + providers + suggestions + cooccurrences + history + sessions;

    if (totalRemaining > 0) {
      logInfo(`WARNING: Data still remains after cleanup for shop ${shop}:`, {
        rules, conversions, analytics, settings, providers, suggestions, cooccurrences, history, sessions
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
