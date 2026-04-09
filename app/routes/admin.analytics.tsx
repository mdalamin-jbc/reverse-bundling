import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";

const PERIODS = [
  { key: "7d", label: "7 Days", days: 7 },
  { key: "14d", label: "14 Days", days: 14 },
  { key: "30d", label: "30 Days", days: 30 },
  { key: "90d", label: "90 Days", days: 90 },
  { key: "all", label: "All Time", days: 0 },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdmin(request);
  const url = new URL(request.url);
  const periodKey = url.searchParams.get("period") || "30d";
  const period = PERIODS.find(p => p.key === periodKey) || PERIODS[2];
  const now = new Date();
  const since = period.days > 0 ? new Date(now.getTime() - period.days * 24 * 60 * 60 * 1000) : undefined;

  const dateFilter = since ? { gte: since } : undefined;

  const [
    conversionCount, successCount, failedCount, savingsAgg,
    newRules, activeRules,
    lifetimeConversions, lifetimeSavings, lifetimeRules,
    topRules, merchantPerformance,
    totalSuggestions, appliedSuggestions, totalOrders,
  ] = await Promise.all([
    db.orderConversion.count({ where: dateFilter ? { convertedAt: dateFilter } : undefined }),
    db.orderConversion.count({ where: { status: "success", ...(dateFilter ? { convertedAt: dateFilter } : {}) } }),
    db.orderConversion.count({ where: { status: "failed", ...(dateFilter ? { convertedAt: dateFilter } : {}) } }),
    db.orderConversion.aggregate({ where: dateFilter ? { convertedAt: dateFilter } : undefined, _sum: { savingsAmount: true }, _avg: { savingsAmount: true } }),
    db.bundleRule.count({ where: dateFilter ? { createdAt: dateFilter } : undefined }),
    db.bundleRule.count({ where: { status: "active" } }),
    db.orderConversion.count(),
    db.orderConversion.aggregate({ _sum: { savingsAmount: true } }),
    db.bundleRule.count(),
    db.bundleRule.findMany({
      orderBy: { frequency: "desc" },
      take: 10,
      select: { id: true, name: true, shop: true, frequency: true, savings: true, status: true },
    }),
    db.session.findMany({
      distinct: ["shop"],
      select: { shop: true },
      orderBy: { id: "desc" },
    }),
    db.bundleSuggestion.count(),
    db.bundleSuggestion.count({ where: { status: "applied" } }),
    db.orderHistory.count(),
  ]);

  // Get per-merchant stats for top merchants
  const merchantStats = await Promise.all(
    merchantPerformance.slice(0, 10).map(async ({ shop }) => {
      const [convCount, savAgg, ruleCount] = await Promise.all([
        db.orderConversion.count({ where: { shop } }),
        db.orderConversion.aggregate({ where: { shop }, _sum: { savingsAmount: true } }),
        db.bundleRule.count({ where: { shop } }),
      ]);
      return { shop, conversions: convCount, savings: savAgg._sum.savingsAmount || 0, rules: ruleCount };
    })
  );

  // Bundle analytics records
  const analyticsRecords = await db.bundleAnalytics.findMany({
    orderBy: { orderCount: "desc" },
    take: 10,
    include: { bundleRule: { select: { name: true } } },
  });

  return json({
    period: periodKey,
    periodLabel: period.label,
    stats: {
      conversions: conversionCount,
      success: successCount,
      failed: failedCount,
      savings: savingsAgg._sum.savingsAmount || 0,
      avgSavings: savingsAgg._avg.savingsAmount || 0,
      conversionRate: conversionCount > 0 ? (successCount / conversionCount * 100) : 0,
      newRules, activeRules,
    },
    lifetime: {
      conversions: lifetimeConversions,
      savings: lifetimeSavings._sum.savingsAmount || 0,
      rules: lifetimeRules,
      suggestions: totalSuggestions,
      appliedSuggestions,
      orders: totalOrders,
      merchants: merchantPerformance.length,
    },
    topRules,
    merchantStats: merchantStats.sort((a, b) => b.savings - a.savings),
    analyticsRecords: analyticsRecords.map(a => ({
      ...a,
      ruleName: a.bundleRule?.name || "Unknown",
      period: a.period,
    })),
  });
};

export default function AdminAnalytics() {
  const { period, periodLabel, stats, lifetime, topRules, merchantStats, analyticsRecords } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();

  return (
    <>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderRow}>
          <div>
            <h2 className={styles.pageHeaderTitle}>Analytics</h2>
            <p className={styles.pageHeaderSub}>Performance metrics and insights · {periodLabel}</p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={`${styles.btn} ${styles.btnSm} ${period === p.key ? styles.btnPrimary : styles.btnSecondary}`}
                onClick={() => setSearchParams({ period: p.key })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Period Stats */}
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCardBlue}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Conversions</span>
            <div className={`${styles.statIcon} ${styles.statIconBlue}`}>🔄</div>
          </div>
          <div className={styles.statValue}>{stats.conversions}</div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>{stats.success} success</span>
            {stats.failed > 0 && <span className={styles.statDown}>· {stats.failed} failed</span>}
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardGreen}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Savings ({periodLabel})</span>
            <div className={`${styles.statIcon} ${styles.statIconGreen}`}>💰</div>
          </div>
          <div className={styles.statValue}>${stats.savings.toFixed(2)}</div>
          <div className={styles.statChange}>
            <span className={styles.statNeutral}>Avg ${stats.avgSavings.toFixed(2)} per conversion</span>
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardPurple}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Conversion Rate</span>
            <div className={`${styles.statIcon} ${styles.statIconPurple}`}>📊</div>
          </div>
          <div className={styles.statValue}>{stats.conversionRate.toFixed(1)}%</div>
          <div className={styles.statChange}>
            <span className={stats.conversionRate >= 80 ? styles.statUp : styles.statDown}>
              {stats.conversionRate >= 80 ? "Excellent" : stats.conversionRate >= 50 ? "Good" : "Needs improvement"}
            </span>
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardOrange}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>New Rules</span>
            <div className={`${styles.statIcon} ${styles.statIconOrange}`}>📋</div>
          </div>
          <div className={styles.statValue}>{stats.newRules}</div>
          <div className={styles.statChange}>
            <span className={styles.statNeutral}>{stats.activeRules} active total</span>
          </div>
        </div>
      </div>

      {/* Lifetime Stats Bar */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>🏆 Lifetime Summary</span>
        </div>
        <div className={styles.cardBody}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 16, textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#2563eb" }}>{lifetime.merchants}</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>Merchants</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#7c3aed" }}>{lifetime.rules}</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>Rules</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#059669" }}>{lifetime.conversions.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>Conversions</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#d97706" }}>${lifetime.savings.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>Total Savings</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0d9488" }}>{lifetime.orders.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>Orders Analyzed</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#dc2626" }}>{lifetime.suggestions}</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>AI Suggestions</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#4f46e5" }}>{lifetime.appliedSuggestions}</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>Applied</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Top Bundle Rules */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>🏅 Top Bundle Rules by Usage</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            {topRules.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Rule</th>
                    <th>Shop</th>
                    <th style={{ textAlign: "center" }}>Used</th>
                    <th style={{ textAlign: "right" }}>Savings</th>
                    <th style={{ textAlign: "center" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {topRules.map((r, i) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 700, color: i < 3 ? "#d97706" : "#6b7280" }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td className={styles.tableSub}>{r.shop.replace(".myshopify.com", "")}</td>
                      <td style={{ textAlign: "center", fontWeight: 700 }}>{r.frequency}×</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "#059669" }}>${r.savings.toFixed(2)}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`${styles.badge} ${r.status === "active" ? styles.badgeGreen : styles.badgeGray}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState}><div className={styles.emptyText}>No rules yet</div></div>
            )}
          </div>
        </div>

        {/* Merchant Performance */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>🏪 Top Merchants by Savings</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            {merchantStats.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Merchant</th>
                    <th style={{ textAlign: "center" }}>Rules</th>
                    <th style={{ textAlign: "center" }}>Conversions</th>
                    <th style={{ textAlign: "right" }}>Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {merchantStats.map((m, i) => (
                    <tr key={m.shop}>
                      <td style={{ fontWeight: 700, color: i < 3 ? "#d97706" : "#6b7280" }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{m.shop.replace(".myshopify.com", "")}</td>
                      <td style={{ textAlign: "center" }}>{m.rules}</td>
                      <td style={{ textAlign: "center" }}>{m.conversions}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "#059669" }}>${m.savings.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState}><div className={styles.emptyText}>No merchant data</div></div>
            )}
          </div>
        </div>
      </div>

      {/* Bundle Analytics Records */}
      {analyticsRecords.length > 0 && (
        <div className={styles.card} style={{ marginTop: 24 }}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>📈 Bundle Analytics Records</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Shop</th>
                  <th>Period</th>
                  <th style={{ textAlign: "center" }}>Orders</th>
                  <th style={{ textAlign: "right" }}>Savings</th>
                </tr>
              </thead>
              <tbody>
                {analyticsRecords.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.ruleName}</td>
                    <td className={styles.tableSub}>{a.shop.replace(".myshopify.com", "")}</td>
                    <td><span className={`${styles.badge} ${styles.badgeIndigo}`}>{a.period}</span></td>
                    <td style={{ textAlign: "center", fontWeight: 700 }}>{a.orderCount}</td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: "#059669" }}>${a.savingsAmount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
