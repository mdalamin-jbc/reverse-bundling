import db from "./db.server";

const SHOPIFY_API_VERSION = "2025-01";

/** Routes merchants can visit before completing setup. */
export const SETUP_EXEMPT_PATHS = ["/app/setup-wizard", "/app/guidelines", "/app/billing"];

export async function shopNeedsSetup(shop: string): Promise<boolean> {
  const activeRules = await db.bundleRule.count({
    where: { shop, status: "active" },
  });
  return activeRules === 0;
}

export function isSetupExemptPath(pathname: string): boolean {
  return SETUP_EXEMPT_PATHS.some((path) => pathname.startsWith(path));
}

export type QuickBundlePair = {
  key: string;
  items: string[];
  labels: string[];
  frequency: number;
};

export async function getQuickBundlePairsFromShopify(
  admin: { graphql: (query: string) => Promise<Response> },
  limit = 3
): Promise<QuickBundlePair[]> {
  try {
    const response = await admin.graphql(`
      query {
        orders(first: 100, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              lineItems(first: 20) {
                edges {
                  node {
                    sku
                    title
                    variant { id }
                  }
                }
              }
            }
          }
        }
      }
    `);

    const data = await response.json();
    const orders = data.data?.orders?.edges || [];
    const pairCounts = new Map<string, { items: string[]; labels: string[]; frequency: number }>();

    for (const edge of orders) {
      const lineItems = (edge.node?.lineItems?.edges || [])
        .map((li: { node: { sku: string | null; title: string; variant: { id: string } | null } }) => {
          const sku = li.node.sku?.trim();
          const id = li.node.variant?.id;
          const identifier = sku || id;
          if (!identifier) return null;
          return {
            identifier,
            label: li.node.title || sku || "Item",
          };
        })
        .filter(Boolean) as Array<{ identifier: string; label: string }>;

      const unique = new Map<string, string>();
      for (const item of lineItems) {
        unique.set(item.identifier, item.label);
      }

      const identifiers = [...unique.keys()];
      if (identifiers.length < 2) continue;

      for (let i = 0; i < identifiers.length; i++) {
        for (let j = i + 1; j < identifiers.length; j++) {
          const sorted = [identifiers[i], identifiers[j]].sort();
          const key = sorted.join("||");
          const existing = pairCounts.get(key);
          if (existing) {
            existing.frequency += 1;
          } else {
            pairCounts.set(key, {
              items: sorted,
              labels: [unique.get(sorted[0]) || sorted[0], unique.get(sorted[1]) || sorted[1]],
              frequency: 1,
            });
          }
        }
      }
    }

    return [...pairCounts.values()]
      .filter((pair) => pair.frequency >= 2)
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit)
      .map((pair) => ({
        key: pair.items.join("||"),
        items: pair.items,
        labels: pair.labels,
        frequency: pair.frequency,
      }));
  } catch {
    return [];
  }
}

export async function fetchShopActivationSignals(
  shop: string,
  accessToken: string
): Promise<{
  shopName: string;
  productCount: number;
  orderCount: number;
  partnerDevelopment: boolean;
}> {
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      query: `{
        shop { name plan { partnerDevelopment } }
        productsCount { count }
        ordersCount { count }
      }`,
    }),
  });

  const payload = await response.json();
  const shopData = payload.data?.shop;

  return {
    shopName: shopData?.name || shop.replace(".myshopify.com", ""),
    productCount: payload.data?.productsCount?.count ?? 0,
    orderCount: payload.data?.ordersCount?.count ?? 0,
    partnerDevelopment: shopData?.plan?.partnerDevelopment === true,
  };
}
