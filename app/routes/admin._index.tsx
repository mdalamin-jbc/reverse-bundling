import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdmin(request);

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    allSessions,
    totalRules,
    activeRules,
    totalConversions,
    recentConversions,
    totalSuggestions,
    totalOrderHistory,
    totalCooccurrences,
    recentRules,
    recentMerchants,
  ] = await Promise.all([
    db.session.findMany({ distinct: ["shop"], select: { shop: true }, orderBy: { id: "desc" } }),
    db.bundleRule.count(),
    db.bundleRule.count({ where: { status: "active" } }),
    db.orderConversion.count(),
    db.orderConversion.count({ where: { convertedAt: { gte: sevenDaysAgo } } }),
    db.bundleSuggestion.count(),
    db.orderHistory.count(),
    db.itemCooccurrence.count(),
    db.bundleRule.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, shop: true, name: true, status: true, createdAt: true },
    }),
    db.session.findMany({
      distinct: ["shop"],
      select: { shop: true, id: true },
      orderBy: { id: "desc" },
      take: 5,
    }),
  ]);

  // Calculate total savings
  const savingsResult = await db.orderConversion.aggregate({
    _sum: { savingsAmount: true },
  });

  // Conversions by status
  const successConversions = await db.orderConversion.count({ where: { status: "success" } });
  const failedConversions = await db.orderConversion.count({ where: { status: "failed" } });

  // Merchants with rules
  const merchantsWithRules = await db.bundleRule.findMany({
    distinct: ["shop"],
    select: { shop: true },
  });

  // Settings count (merchants who configured settings)
  const configuredMerchants = await db.appSettings.count();

  return json({
    stats: {
      totalMerchants: allSessions.length,
      totalRules,
      activeRules,
      totalConversions,
      recentConversions,
      successConversions,
      failedConversions,
      totalSavings: savingsResult._sum.savingsAmount || 0,
      totalSuggestions,
      totalOrderHistory,
      totalCooccurrences,
      merchantsWithRules: merchantsWithRules.length,
      configuredMerchants,
    },
    recentRules: recentRules.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    recentMerchants,
  });
};

export default function AdminDashboard() {
  const { stats, recentRules, recentMerchants } = useLoaderData<typeof loader>();

  return (
    <>
      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCardBlue}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Total Merchants</span>
            <span className={styles.statIcon}>🏪</span>
          </div>
          <div className={styles.statValue}>{stats.totalMerchants}</div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>{stats.configuredMerchants} configured</span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardGreen}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Bundle Rules</span>
            <span className={styles.statIcon}>📋</span>
          </div>
          <div className={styles.statValue}>{stats.totalRules}</div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>{stats.activeRules} active</span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardPurple}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Order Conversions</span>
            <span className={styles.statIcon}>🔄</span>
          </div>
          <div className={styles.statValue}>{stats.totalConversions}</div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>+{stats.recentConversions} this week</span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardOrange}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Total Savings</span>
            <span className={styles.statIcon}>💰</span>
          </div>
          <div className={styles.statValue}>${stats.totalSavings.toFixed(2)}</div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>Across all merchants</span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardIndigo}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>AI Suggestions</span>
            <span className={styles.statIcon}>🤖</span>
          </div>
          <div className={styles.statValue}>{stats.totalSuggestions}</div>
          <div className={styles.statChange}>
            <span>{stats.totalCooccurrences} co-occurrences tracked</span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardRed}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Conversion Health</span>
            <span className={styles.statIcon}>❤️</span>
          </div>
          <div className={styles.statValue}>
            {stats.totalConversions > 0
              ? `${((stats.successConversions / stats.totalConversions) * 100).toFixed(0)}%`
              : "N/A"}
          </div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>{stats.successConversions} success</span>
            {stats.failedConversions > 0 && (
              <span className={styles.statDown}> · {stats.failedConversions} failed</span>
            )}
          </div>
        </div>
      </div>

      {/* Two column layout */}
      <div className={styles.twoCol}>
        {/* Recent Merchants */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>🏪 Recent Merchants</span>
            <Link to="/admin/merchants" className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}>
              View All
            </Link>
          </div>
          <div className={styles.cardBodyNoPad}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentMerchants.map((m) => (
                  <tr key={m.shop}>
                    <td>
                      <Link to={`/admin/merchants/${encodeURIComponent(m.shop)}`} style={{ color: "#4f46e5", textDecoration: "none", fontWeight: 500 }}>
                        {m.shop}
                      </Link>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgeGreen}`}>Active</span>
                    </td>
                  </tr>
                ))}
                {recentMerchants.length === 0 && (
                  <tr><td colSpan={2} style={{ textAlign: "center", color: "#9ca3af" }}>No merchants yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Bundle Rules */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>📋 Recent Bundle Rules</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Rule Name</th>
                  <th>Shop</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentRules.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>{r.shop}</td>
                    <td>
                      <span className={`${styles.badge} ${r.status === "active" ? styles.badgeGreen : r.status === "paused" ? styles.badgeYellow : styles.badgeGray}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentRules.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: "center", color: "#9ca3af" }}>No rules created yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* System Overview */}
      <div className={styles.card} style={{ marginTop: 24 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>📊 Data Overview</span>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.threeCol}>
            <div>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Order History Records</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#111827" }}>{stats.totalOrderHistory.toLocaleString()}</div>
              <div className={styles.progressBar}>
                <div className={`${styles.progressFill} ${styles.progressBlue}`} style={{ width: `${Math.min(stats.totalOrderHistory / 100, 100)}%` }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Co-occurrence Pairs</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#111827" }}>{stats.totalCooccurrences.toLocaleString()}</div>
              <div className={styles.progressBar}>
                <div className={`${styles.progressFill} ${styles.progressGreen}`} style={{ width: `${Math.min(stats.totalCooccurrences / 50, 100)}%` }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>Merchants with Rules</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#111827" }}>
                {stats.merchantsWithRules} / {stats.totalMerchants}
              </div>
              <div className={styles.progressBar}>
                <div
                  className={`${styles.progressFill} ${styles.progressYellow}`}
                  style={{ width: `${stats.totalMerchants > 0 ? (stats.merchantsWithRules / stats.totalMerchants) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
