import db from "./db.server";
import { cache, cacheKeys } from "./cache.server";
import { logInfo, logError } from "./logger.server";

const SHOPIFY_API_VERSION = "2025-01";

export type PurgeShopResult = {
  shop: string;
  deleted: {
    sessions: number;
    bundleRules: number;
    orderConversions: number;
    bundleAnalytics: number;
    appSettings: number;
    fulfillmentProviders: number;
    bundleSuggestions: number;
    itemCooccurrences: number;
    orderHistory: number;
  };
};

/** Distinct shop domains that still have a session row (legacy count — may include uninstalled). */
export async function getSessionShopDomains(): Promise<string[]> {
  const rows = await db.session.findMany({
    distinct: ["shop"],
    select: { shop: true },
    orderBy: { id: "desc" },
  });
  return rows.map((r) => r.shop);
}

/** Active installed merchants = distinct shops with a usable offline access token. */
export async function getInstalledShopDomains(): Promise<string[]> {
  const sessions = await db.session.findMany({
    where: {
      isOnline: false,
      accessToken: { not: "" },
    },
    distinct: ["shop"],
    select: { shop: true },
    orderBy: { id: "desc" },
  });

  if (sessions.length > 0) {
    return sessions.map((s) => s.shop);
  }

  // Fallback: any session with token
  const any = await db.session.findMany({
    where: { accessToken: { not: "" } },
    distinct: ["shop"],
    select: { shop: true },
  });
  return any.map((s) => s.shop);
}

export async function verifyShopHasAppInstalled(
  shop: string,
  accessToken: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: `{ currentAppInstallation { id } }`,
        }),
      }
    );

    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return false;
    }

    if (!response.ok) {
      return true;
    }

    const json = (await response.json()) as {
      data?: { currentAppInstallation?: { id?: string } | null };
      errors?: Array<{ message?: string }>;
    };

    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message || "").join(" ").toLowerCase();
      if (
        msg.includes("invalid api key") ||
        msg.includes("unrecognized login") ||
        msg.includes("not found") ||
        msg.includes("access denied")
      ) {
        return false;
      }
    }

    return !!json.data?.currentAppInstallation?.id;
  } catch (error) {
    logError(error as Error, { context: "verifyShopHasAppInstalled", shop });
    return true;
  }
}

async function getShopAccessToken(shop: string): Promise<string | null> {
  const offline = await db.session.findFirst({
    where: { shop, isOnline: false },
    select: { accessToken: true },
    orderBy: { id: "desc" },
  });
  if (offline?.accessToken) return offline.accessToken;

  const any = await db.session.findFirst({
    where: { shop },
    select: { accessToken: true },
    orderBy: { id: "desc" },
  });
  return any?.accessToken || null;
}

/** Delete ALL data for a shop, including sessions (always). */
export async function purgeShopData(shop: string): Promise<PurgeShopResult> {
  const [
    bundleSuggestions,
    itemCooccurrences,
    orderHistory,
    bundleAnalytics,
    orderConversions,
    bundleRules,
    fulfillmentProviders,
    appSettings,
    sessions,
  ] = await db.$transaction([
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

  [
    cacheKeys.bundleRules(shop),
    cacheKeys.bundleAnalytics(shop),
    cacheKeys.shopStats(shop),
    cacheKeys.shopProducts(shop),
    cacheKeys.orderConversions(shop, 10),
    cacheKeys.analyticsSummary(shop, "30d"),
  ].forEach((key) => cache.delete(key));

  logInfo(`Purged all data for shop ${shop}`, {
    sessions: sessions.count,
    bundleRules: bundleRules.count,
  });

  return {
    shop,
    deleted: {
      sessions: sessions.count,
      bundleRules: bundleRules.count,
      orderConversions: orderConversions.count,
      bundleAnalytics: bundleAnalytics.count,
      appSettings: appSettings.count,
      fulfillmentProviders: fulfillmentProviders.count,
      bundleSuggestions: bundleSuggestions.count,
      itemCooccurrences: itemCooccurrences.count,
      orderHistory: orderHistory.count,
    },
  };
}

/** Remove shops whose app is no longer installed (orphaned sessions + data). */
export async function cleanupUninstalledShops(): Promise<{
  checked: number;
  removed: number;
  removedShops: string[];
  skipped: string[];
}> {
  const shops = await getSessionShopDomains();
  const removedShops: string[] = [];
  const skipped: string[] = [];

  for (const shop of shops) {
    const token = await getShopAccessToken(shop);

    if (!token) {
      await purgeShopData(shop);
      removedShops.push(shop);
      continue;
    }

    const installed = await verifyShopHasAppInstalled(shop, token);
    if (!installed) {
      await purgeShopData(shop);
      removedShops.push(shop);
    } else {
      skipped.push(shop);
    }
  }

  // Remove leftover data for shops with no session at all
  const sessionShops = new Set(await getSessionShopDomains());
  const orphanCandidates = new Set<string>();

  const tables = [
    () => db.bundleRule.findMany({ distinct: ["shop"], select: { shop: true } }),
    () => db.orderConversion.findMany({ distinct: ["shop"], select: { shop: true } }),
    () => db.appSettings.findMany({ select: { shop: true } }),
    () => db.orderHistory.findMany({ distinct: ["shop"], select: { shop: true } }),
    () => db.bundleSuggestion.findMany({ distinct: ["shop"], select: { shop: true } }),
  ];

  for (const query of tables) {
    const rows = await query();
    for (const row of rows) {
      if (!sessionShops.has(row.shop)) {
        orphanCandidates.add(row.shop);
      }
    }
  }

  for (const shop of orphanCandidates) {
    await purgeShopData(shop);
    if (!removedShops.includes(shop)) {
      removedShops.push(shop);
    }
  }

  return {
    checked: shops.length,
    removed: removedShops.length,
    removedShops,
    skipped,
  };
}
