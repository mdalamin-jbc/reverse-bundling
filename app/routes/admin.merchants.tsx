import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, Link, useSearchParams } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdmin(request);

  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.toLowerCase() || "";

  // Get all unique shops
  const sessions = await db.session.findMany({
    distinct: ["shop"],
    select: { shop: true, scope: true },
    orderBy: { id: "desc" },
  });

  // Get enrichment data for each shop
  const merchants = await Promise.all(
    sessions.map(async (s) => {
      const [ruleCount, conversionCount, settings, savingsAgg, lastConversion] = await Promise.all([
        db.bundleRule.count({ where: { shop: s.shop } }),
        db.orderConversion.count({ where: { shop: s.shop } }),
        db.appSettings.findUnique({ where: { shop: s.shop }, select: { fulfillmentMode: true, autoConvertOrders: true, updatedAt: true } }),
        db.orderConversion.aggregate({ where: { shop: s.shop }, _sum: { savingsAmount: true } }),
        db.orderConversion.findFirst({ where: { shop: s.shop }, orderBy: { convertedAt: "desc" }, select: { convertedAt: true } }),
      ]);

      return {
        shop: s.shop,
        scopes: s.scope || "",
        ruleCount,
        conversionCount,
        totalSavings: savingsAgg._sum.savingsAmount || 0,
        fulfillmentMode: settings?.fulfillmentMode || "N/A",
        autoConvert: settings?.autoConvertOrders ?? false,
        lastActivity: lastConversion?.convertedAt?.toISOString() || settings?.updatedAt?.toISOString() || null,
        configured: !!settings,
      };
    })
  );

  // Filter by search
  const filtered = search
    ? merchants.filter(m => m.shop.toLowerCase().includes(search))
    : merchants;

  return json({ merchants: filtered, total: merchants.length, search });
};

export default function AdminMerchants() {
  const { merchants, total, search } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <>
      <div className={styles.actionBar}>
        <div>
          <span style={{ fontSize: 14, color: "#6b7280" }}>
            {merchants.length === total ? `${total} merchants` : `${merchants.length} of ${total} merchants`}
          </span>
        </div>
        <form method="get">
          <input
            type="text"
            name="q"
            defaultValue={search}
            placeholder="Search merchants..."
            className={styles.searchInput}
          />
        </form>
      </div>

      <div className={styles.card}>
        <div className={styles.cardBodyNoPad}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Rules</th>
                <th>Conversions</th>
                <th>Savings</th>
                <th>Mode</th>
                <th>Auto-Convert</th>
                <th>Last Activity</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m) => (
                <tr key={m.shop}>
                  <td>
                    <Link
                      to={`/admin/merchants/${encodeURIComponent(m.shop)}`}
                      style={{ color: "#4f46e5", textDecoration: "none", fontWeight: 600 }}
                    >
                      {m.shop.replace(".myshopify.com", "")}
                    </Link>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>{m.shop}</div>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: m.ruleCount > 0 ? "#111827" : "#9ca3af" }}>
                      {m.ruleCount}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600 }}>{m.conversionCount}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: m.totalSavings > 0 ? "#059669" : "#9ca3af" }}>
                      ${m.totalSavings.toFixed(2)}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${m.fulfillmentMode === "order_edit" ? styles.badgePurple : styles.badgeBlue}`}>
                      {m.fulfillmentMode}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${m.autoConvert ? styles.badgeGreen : styles.badgeGray}`}>
                      {m.autoConvert ? "ON" : "OFF"}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "#6b7280" }}>
                    {m.lastActivity
                      ? new Date(m.lastActivity).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      : "—"}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${m.configured ? styles.badgeGreen : styles.badgeYellow}`}>
                      {m.configured ? "Configured" : "Pending"}
                    </span>
                  </td>
                  <td>
                    <Link
                      to={`/admin/merchants/${encodeURIComponent(m.shop)}`}
                      className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
              {merchants.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className={styles.emptyState}>
                      <div className={styles.emptyIcon}>🏪</div>
                      <div className={styles.emptyTitle}>No merchants found</div>
                      <div className={styles.emptyText}>
                        {search ? "Try a different search term" : "When merchants install your app, they'll appear here"}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
