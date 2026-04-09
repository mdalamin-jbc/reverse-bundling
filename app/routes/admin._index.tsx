import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdmin(request);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    allSessions, totalRules, activeRules,
    totalConversions, recentConversions7d, recentConversions30d,
    totalSuggestions, appliedSuggestions, pendingSuggestions,
    totalOrderHistory, totalCooccurrences,
    recentRules, recentMerchants, configuredMerchants,
    successConversions, failedConversions,
  ] = await Promise.all([
    db.session.findMany({ distinct: ["shop"], select: { shop: true }, orderBy: { id: "desc" } }),
    db.bundleRule.count(),
    db.bundleRule.count({ where: { status: "active" } }),
    db.orderConversion.count(),
    db.orderConversion.count({ where: { convertedAt: { gte: sevenDaysAgo } } }),
    db.orderConversion.count({ where: { convertedAt: { gte: thirtyDaysAgo } } }),
    db.bundleSuggestion.count(),
    db.bundleSuggestion.count({ where: { status: "applied" } }),
    db.bundleSuggestion.count({ where: { status: "pending" } }),
    db.orderHistory.count(),
    db.itemCooccurrence.count(),
    db.bundleRule.findMany({
      orderBy: { createdAt: "desc" }, take: 8,
      select: { id: true, shop: true, name: true, status: true, bundledSku: true, frequency: true, createdAt: true },
    }),
    db.session.findMany({ distinct: ["shop"], select: { shop: true, id: true }, orderBy: { id: "desc" }, take: 8 }),
    db.appSettings.count(),
    db.orderConversion.count({ where: { status: "success" } }),
    db.orderConversion.count({ where: { status: "failed" } }),
  ]);

  const savingsResult = await db.orderConversion.aggregate({ _sum: { savingsAmount: true } });
  const merchantsWithRules = await db.bundleRule.findMany({ distinct: ["shop"], select: { shop: true } });

  // Recent conversions for activity feed
  const recentConversionsList = await db.orderConversion.findMany({
    orderBy: { convertedAt: "desc" }, take: 5,
    select: { id: true, shop: true, orderId: true, savingsAmount: true, status: true, convertedAt: true, bundledSku: true },
  });

  return json({
    stats: {
      totalMerchants: allSessions.length,
      totalRules, activeRules, draftRules: totalRules - activeRules,
      totalConversions, recentConversions7d, recentConversions30d,
      successConversions, failedConversions,
      totalSavings: savingsResult._sum.savingsAmount || 0,
      totalSuggestions, appliedSuggestions, pendingSuggestions,
      totalOrderHistory, totalCooccurrences,
      merchantsWithRules: merchantsWithRules.length,
      configuredMerchants,
      conversionRate: totalConversions > 0 ? ((successConversions / totalConversions) * 100) : 0,
    },
    recentRules: recentRules.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })),
    recentMerchants,
    recentConversions: recentConversionsList.map(c => ({ ...c, convertedAt: c.convertedAt.toISOString() })),
  });
};

export default function AdminDashboard() {
  const { stats, recentRules, recentMerchants, recentConversions } = useLoaderData<typeof loader>();

  return (
    <>
      {/* Welcome Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderRow}>
          <div>
            <h2 className={styles.pageHeaderTitle}>Welcome back, Admin</h2>
            <p className={styles.pageHeaderSub}>
              Here's what's happening with Reverse Bundle Pro today.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Link to="/admin/merchants" className={`${styles.btn} ${styles.btnSecondary}`}>
              🏪 View Merchants
            </Link>
            <Link to="/admin/system" className={`${styles.btn} ${styles.btnPrimary}`}>
              💚 System Health
            </Link>
          </div>
        </div>
      </div>

      {/* Main Stats Row */}
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCardBlue}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Total Merchants</span>
            <div className={`${styles.statIcon} ${styles.statIconBlue}`}>🏪</div>
          </div>
          <div className={styles.statValue}>{stats.totalMerchants}</div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>{stats.configuredMerchants} configured</span>
            <span className={styles.statNeutral}>· {stats.merchantsWithRules} with rules</span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardGreen}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Bundle Rules</span>
            <div className={`${styles.statIcon} ${styles.statIconGreen}`}>📋</div>
          </div>
          <div className={styles.statValue}>{stats.totalRules}</div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>{stats.activeRules} active</span>
            {stats.draftRules > 0 && <span className={styles.statNeutral}>· {stats.draftRules} draft</span>}
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardPurple}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Order Conversions</span>
            <div className={`${styles.statIcon} ${styles.statIconPurple}`}>🔄</div>
          </div>
          <div className={styles.statValue}>{stats.totalConversions}</div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>+{stats.recentConversions7d} this week</span>
            <span className={styles.statNeutral}>· +{stats.recentConversions30d} this month</span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardOrange}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Total Savings</span>
            <div className={`${styles.statIcon} ${styles.statIconOrange}`}>💰</div>
          </div>
          <div className={styles.statValue}>${stats.totalSavings.toFixed(2)}</div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>Across all merchants</span>
          </div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
        <div className={styles.card} style={{ marginBottom: 0 }}>
          <div className={styles.cardBody} style={{ padding: "16px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Conversion Rate</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: stats.conversionRate >= 80 ? "#059669" : stats.conversionRate >= 50 ? "#d97706" : "#dc2626" }}>
              {stats.conversionRate.toFixed(1)}%
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>{stats.successConversions} success · {stats.failedConversions} failed</div>
          </div>
        </div>

        <div className={styles.card} style={{ marginBottom: 0 }}>
          <div className={styles.cardBody} style={{ padding: "16px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>AI Suggestions</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#7c3aed" }}>{stats.totalSuggestions}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>{stats.appliedSuggestions} applied · {stats.pendingSuggestions} pending</div>
          </div>
        </div>

        <div className={styles.card} style={{ marginBottom: 0 }}>
          <div className={styles.cardBody} style={{ padding: "16px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Order History</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#2563eb" }}>{stats.totalOrderHistory.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>Records analyzed</div>
          </div>
        </div>

        <div className={styles.card} style={{ marginBottom: 0 }}>
          <div className={styles.cardBody} style={{ padding: "16px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Co-occurrences</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#0d9488" }}>{stats.totalCooccurrences.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>Item pairs tracked</div>
          </div>
        </div>
      </div>

      {/* Three Column Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
        {/* Recent Merchants */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>🏪 Recent Merchants</span>
            <Link to="/admin/merchants" className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}>
              View All →
            </Link>
          </div>
          <div className={styles.cardBodyNoPad}>
            {recentMerchants.length > 0 ? (
              <table className={styles.table}>
                <tbody>
                  {recentMerchants.map((m) => (
                    <tr key={m.shop}>
                      <td>
                        <Link to={`/admin/merchants/${encodeURIComponent(m.shop)}`} className={styles.tableLink}>
                          {m.shop.replace(".myshopify.com", "")}
                        </Link>
                        <div className={styles.tableSub}>{m.shop}</div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className={`${styles.badge} ${styles.badgeGreen}`}>
                          <span className={styles.badgeDot}></span> Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState} style={{ padding: 32 }}>
                <div className={styles.emptyIcon} style={{ fontSize: 32 }}>🏪</div>
                <div className={styles.emptyText}>No merchants yet</div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Bundle Rules */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>📋 Bundle Rules</span>
            <span className={`${styles.badge} ${styles.badgeBlue}`}>{stats.totalRules}</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            {recentRules.length > 0 ? (
              <table className={styles.table}>
                <tbody>
                  {recentRules.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</div>
                        <div className={styles.tableSub}>{r.shop.replace(".myshopify.com", "")} · {r.frequency}× used</div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className={`${styles.badge} ${r.status === "active" ? styles.badgeGreen : r.status === "paused" ? styles.badgeYellow : styles.badgeGray}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState} style={{ padding: 32 }}>
                <div className={styles.emptyIcon} style={{ fontSize: 32 }}>📋</div>
                <div className={styles.emptyText}>No rules created yet</div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>⚡ Recent Activity</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            {recentConversions.length > 0 ? (
              <table className={styles.table}>
                <tbody>
                  {recentConversions.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          Order #{c.orderId.slice(-8)}
                        </div>
                        <div className={styles.tableSub}>
                          {c.shop.replace(".myshopify.com", "")} · ${c.savingsAmount.toFixed(2)} saved
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className={`${styles.badge} ${c.status === "success" ? styles.badgeGreen : c.status === "failed" ? styles.badgeRed : styles.badgeYellow}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState} style={{ padding: 32 }}>
                <div className={styles.emptyIcon} style={{ fontSize: 32 }}>⚡</div>
                <div className={styles.emptyText}>No conversions yet</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Data Health Overview */}
      <div className={styles.card} style={{ marginTop: 24 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>📊 Data Health Overview</span>
          <Link to="/admin/system" className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}>
            View System Health →
          </Link>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.threeCol}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>Merchants with Rules</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                  {stats.merchantsWithRules}/{stats.totalMerchants}
                </span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={`${styles.progressFill} ${styles.progressBlue}`}
                  style={{ width: `${stats.totalMerchants > 0 ? (stats.merchantsWithRules / stats.totalMerchants) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>Conversion Success Rate</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                  {stats.conversionRate.toFixed(0)}%
                </span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={`${styles.progressFill} ${stats.conversionRate >= 80 ? styles.progressGreen : styles.progressYellow}`}
                  style={{ width: `${stats.conversionRate}%` }}
                />
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>Suggestions Applied</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                  {stats.appliedSuggestions}/{stats.totalSuggestions}
                </span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={`${styles.progressFill} ${styles.progressPurple}`}
                  style={{ width: `${stats.totalSuggestions > 0 ? (stats.appliedSuggestions / stats.totalSuggestions) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className={styles.card} style={{ marginTop: 0 }}>
        <div className={styles.cardBody} style={{ padding: 20 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link to="/admin/merchants" className={`${styles.btn} ${styles.btnSecondary}`}>🏪 All Merchants</Link>
            <Link to="/admin/analytics" className={`${styles.btn} ${styles.btnSecondary}`}>📈 Full Analytics</Link>
            <Link to="/admin/system" className={`${styles.btn} ${styles.btnSecondary}`}>💚 System Health</Link>
            <Link to="/admin/settings" className={`${styles.btn} ${styles.btnSecondary}`}>⚙️ App Settings</Link>
          </div>
        </div>
      </div>
    </>
  );
}
