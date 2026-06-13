import db from "../app/db.server";

(async () => {
const shop = process.argv[2] || "3e61bc.myshopify.com";
const now = new Date();
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

const [total, thisMonth, success, settings, session, rules, recent] = await Promise.all([
  db.orderConversion.count({ where: { shop } }),
  db.orderConversion.count({ where: { shop, convertedAt: { gte: monthStart } } }),
  db.orderConversion.count({ where: { shop, status: "success" } }),
  db.appSettings.findFirst({ where: { shop } }),
  db.session.findFirst({
    where: { shop, isOnline: false },
    select: { accessToken: true, email: true },
  }),
  db.bundleRule.findMany({ where: { shop }, select: { id: true, name: true, status: true } }),
  db.orderConversion.findMany({
    where: { shop },
    orderBy: { convertedAt: "desc" },
    take: 5,
    select: { convertedAt: true, status: true, savingsAmount: true },
  }),
]);

console.log(
  JSON.stringify(
    {
      shop,
      totalConversions: total,
      conversionsThisMonth: thisMonth,
      successConversions: success,
      freeLimit: 25,
      overFreeLimit: thisMonth > 25,
      settingsCreated: settings?.createdAt?.toISOString() || null,
      owner: session?.email || null,
      rules,
      recentConversions: recent.map((r) => ({
        ...r,
        convertedAt: r.convertedAt.toISOString(),
      })),
    },
    null,
    2
  )
);

if (session?.accessToken) {
  const resp = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": session.accessToken,
    },
    body: JSON.stringify({
      query: `{
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            test
            lineItems {
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    price { amount currencyCode }
                    interval
                  }
                }
              }
            }
          }
        }
      }`,
    }),
  });
  const data = await resp.json();
  console.log(
    "SUBSCRIPTIONS:",
    JSON.stringify(data.data?.currentAppInstallation?.activeSubscriptions || data.errors, null, 2)
  );
}

const allConversions = await db.orderConversion.findMany({
  where: { shop },
  select: { convertedAt: true },
  orderBy: { convertedAt: "asc" },
});

const byMonth: Record<string, number> = {};
for (const c of allConversions) {
  const key = `${c.convertedAt.getFullYear()}-${String(c.convertedAt.getMonth() + 1).padStart(2, "0")}`;
  byMonth[key] = (byMonth[key] || 0) + 1;
}
console.log("MONTHLY_CONVERSIONS:", JSON.stringify(byMonth, null, 2));

await db.$disconnect();
})();
