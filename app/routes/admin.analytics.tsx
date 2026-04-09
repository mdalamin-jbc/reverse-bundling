import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdmin(request);

  const now = new Date();
  const periods = [7, 14, 30].map(days => {
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { days, from };
  });

  // Conversions over time periods
  const conversionsByPeriod = await Promise.all(
    periods.map(async ({ days, from }) => {
      const [total, success, failed] = await Promise.all([
        db.orderConversion.count({ where: { convertedAt: { gte: from } } }),
        db.orderConversion.count({ where: { convertedAt: { gte: from }, status: "success" } }),
        db.orderConversion.count({ where: { convertedAt: { gte: from }, status: "failed" } }),
      ]);
      const savings = await db.orderConversion.aggregate({
        where: { convertedAt: { gte: from } },
        _sum: { savingsAmount: true },
      });
      return { days, total, success, failed, savings: savings._sum.savingsAmount || 0 };
    })
  );

  // Rules created over time
  const rulesByPeriod = await Promise.all(
    periods.map(async ({ days, from }) => ({
      days,
      count: await db.bundleRule.count({ where: { createdAt: { gte: from } } }),
    }))
  );

  // Per-merchant breakdown
  const allShops = await db.session.findMany({ distinct: ["shop"], select: { shop: true } });
  const merchantBreakdown = await Promise.all(
    allShops.map(async ({ shop }) => {
      const [rules, conversions, savingsAgg] = await Promise.all([
        db.bundleRule.count({ where: { shop } }),
        db.orderConversion.count({ where: { shop } }),
        db.orderConversion.aggregate({ where: { shop }, _sum: { savingsAmount: true } }),
      ]);
      return {
        shop,
        rules,
        conversions,
        savings: savingsAgg._sum.savingsAmount || 0,
      };
    })
  );

  // Sort by conversions desc
  merchantBreakdown.sort((a, b) => b.conversions - a.conversions);

  // Top bundle rules by frequency
  const topRules = await db.bundleRule.findMany({
    orderBy: { frequency: "desc" },
    take: 10,
    select: { id: true, shop: true, name: true, bundledSku: true, frequency: true, status: true, savings: true },
  });

  // Suggestion stats
  const suggestionStats = {
    total: await db.bundleSuggestion.count(),
    applied: await db.bundleSuggestion.count({ where: { status: "applied" } }),
    dismissed: await db.bundleSuggestion.count({ where: { status: "dismissed" } }),
    pending: await db.bundleSuggestion.count({ where: { status: "pending" } }),
  };

  // Total lifetime stats
  const lifetimeSavings = await db.orderConversion.aggregate({ _sum: { savingsAmount: true } });

  return json({
    conversionsByPeriod,
    rulesByPeriod,
    merchantBreakdown,
    topRules,
    suggestionStats,
    lifetimeSavings: lifetimeSavings._sum.savingsAmount || 0,
    totalMerchants: allShops.length,
  });
};

export default function AdminAnalytics() {
  const {
    conversionsByPeriod, rulesByPeriod, merchantBreakdown,
    topRules, suggestionStats, lifetimeSavings, totalMerchants,
  } = useLoaderData<typeof loader>();

  return (
    <>
      {/* Period Summary Cards */}
      <div className={styles.threeCol} style={{ marginBottom: 32 }}>
        {conversionsByPeriod.map(p => (
          <div className={styles.card} key={p.days}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Last {p.days} Days</span>
            </div>
            <div className={styles.cardBody}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Conversions</div>
                  <div style={{ fontSize: 28, fontWeight: 700 }}>{p.total}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Savings</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#059669" }}>${p.savings.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Success Rate</div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>
                    {p.total > 0 ? `${((p.success / p.total) * 100).toFixed(0)}%` : "N/A"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>New Rules</div>
                  <div style={{ fontSize: 20, fontWeight: 600 }}>
                    {rulesByPeriod.find(r => r.days === p.days)?.count || 0}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lifetime Stats */}
      <div className={styles.statsGrid} style={{ marginBottom: 32 }}>
        <div className={`${styles.statCard} ${styles.statCardGreen}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Lifetime Savings</span>
            <span className={styles.statIcon}>💰</span>
          </div>
          <div className={styles.statValue}>${lifetimeSavings.toFixed(2)}</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardBlue}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Active Merchants</span>
            <span className={styles.statIcon}>🏪</span>
          </div>
          <div className={styles.statValue}>{totalMerchants}</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardPurple}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>AI Suggestions</span>
            <span className={styles.statIcon}>🤖</span>
          </div>
          <div className={styles.statValue}>{suggestionStats.total}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {suggestionStats.applied} applied · {suggestionStats.pending} pending · {suggestionStats.dismissed} dismissed
          </div>
        </div>
      </div>

      <div className={styles.twoCol}>
        {/* Merchant Breakdown */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>🏪 Merchant Performance</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Rules</th>
                  <th>Conversions</th>
                  <th>Savings</th>
                </tr>
              </thead>
              <tbody>
                {merchantBreakdown.map(m => (
                  <tr key={m.shop}>
                    <td style={{ fontWeight: 500 }}>{m.shop.replace(".myshopify.com", "")}</td>
                    <td>{m.rules}</td>
                    <td style={{ fontWeight: 600 }}>{m.conversions}</td>
                    <td style={{ color: "#059669", fontWeight: 600 }}>${m.savings.toFixed(2)}</td>
                  </tr>
                ))}
                {merchantBreakdown.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "#9ca3af", padding: 32 }}>No data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Bundle Rules */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>🏆 Top Bundle Rules</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Times Used</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {topRules.map(r => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>{r.shop.replace(".myshopify.com", "")}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{r.frequency}×</td>
                    <td>
                      <span className={`${styles.badge} ${r.status === "active" ? styles.badgeGreen : styles.badgeGray}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {topRules.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: "center", color: "#9ca3af", padding: 32 }}>No rules yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
