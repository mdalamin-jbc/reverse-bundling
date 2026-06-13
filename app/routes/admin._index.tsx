import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";
import { stageLabel } from "../merchant-health";
import { getMerchantStage } from "../merchant-health.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdmin(request);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    allSessions, totalRules, activeRules,
    totalConversions, recentConversions7d, recentConversions30d,
    totalSuggestions, appliedSuggestions,
    recentRules, recentMerchants,
    configuredMerchants, successConversions, failedConversions,
  ] = await Promise.all([
    db.session.findMany({ distinct: ["shop"], select: { shop: true }, orderBy: { id: "desc" } }),
    db.bundleRule.count(),
    db.bundleRule.count({ where: { status: "active" } }),
    db.orderConversion.count(),
    db.orderConversion.count({ where: { convertedAt: { gte: sevenDaysAgo } } }),
    db.orderConversion.count({ where: { convertedAt: { gte: thirtyDaysAgo } } }),
    db.bundleSuggestion.count(),
    db.bundleSuggestion.count({ where: { status: "applied" } }),
    db.bundleRule.findMany({
      orderBy: { createdAt: "desc" }, take: 6,
      select: { id: true, shop: true, name: true, status: true, frequency: true },
    }),
    db.session.findMany({ distinct: ["shop"], select: { shop: true }, orderBy: { id: "desc" }, take: 6 }),
    db.appSettings.count(),
    db.orderConversion.count({ where: { status: "success" } }),
    db.orderConversion.count({ where: { status: "failed" } }),
  ]);

  const savingsResult = await db.orderConversion.aggregate({ _sum: { savingsAmount: true } });
  const merchantsWithRules = await db.bundleRule.findMany({ distinct: ["shop"], select: { shop: true } });

  const pipelineCounts = { installed: 0, onboarding: 0, rules_live: 0, converting: 0, at_risk: 0 };
  const atRiskShops: string[] = [];

  for (const { shop } of allSessions) {
    const [activeRuleCount, conversionCount, settings] = await Promise.all([
      db.bundleRule.count({ where: { shop, status: "active" } }),
      db.orderConversion.count({ where: { shop } }),
      db.appSettings.findFirst({ where: { shop }, select: { createdAt: true } }),
    ]);
    const daysSinceFirst = settings?.createdAt
      ? Math.floor((Date.now() - settings.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const stage = getMerchantStage({
      configured: !!settings,
      activeRuleCount,
      conversionCount,
      daysSinceFirstActivity: daysSinceFirst,
    });
    pipelineCounts[stage]++;
    if (stage === "at_risk") atRiskShops.push(shop);
  }

  const recentConversionsList = await db.orderConversion.findMany({
    orderBy: { convertedAt: "desc" }, take: 8,
    select: { id: true, shop: true, orderId: true, savingsAmount: true, status: true, convertedAt: true },
  });

  return json({
    stats: {
      totalMerchants: allSessions.length,
      totalRules, activeRules,
      totalConversions, recentConversions7d, recentConversions30d,
      successConversions, failedConversions,
      totalSavings: savingsResult._sum.savingsAmount || 0,
      totalSuggestions, appliedSuggestions,
      merchantsWithRules: merchantsWithRules.length,
      configuredMerchants,
      conversionRate: totalConversions > 0 ? (successConversions / totalConversions) * 100 : 0,
    },
    recentRules,
    recentMerchants,
    recentConversions: recentConversionsList.map((c) => ({
      ...c,
      convertedAt: c.convertedAt.toISOString(),
    })),
    pipelineCounts,
    atRiskShops: atRiskShops.slice(0, 5),
  });
};

export default function AdminDashboard() {
  const { stats, recentRules, recentMerchants, recentConversions, pipelineCounts, atRiskShops } =
    useLoaderData<typeof loader>();

  return (
    <>
      {atRiskShops.length > 0 && (
        <div className={`${styles.alert} ${styles.alertWarning}`}>
          <strong>{pipelineCounts.at_risk} merchant{pipelineCounts.at_risk !== 1 ? "s" : ""} at risk</strong>
          — installed but no active rules.{" "}
          <Link to="/admin/merchants?stage=at_risk" className={styles.alertLink}>
            Review now →
          </Link>
        </div>
      )}

      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCardBlue}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Merchants</span>
          </div>
          <div className={styles.statValue}>{stats.totalMerchants}</div>
          <div className={styles.statChange}>
            <span className={styles.statNeutral}>{stats.configuredMerchants} configured · {stats.merchantsWithRules} with rules</span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardGreen}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Active rules</span>
          </div>
          <div className={styles.statValue}>{stats.activeRules}</div>
          <div className={styles.statChange}>
            <span className={styles.statNeutral}>{stats.totalRules} total rules</span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardPurple}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Conversions</span>
          </div>
          <div className={styles.statValue}>{stats.totalConversions}</div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>+{stats.recentConversions7d} this week</span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardOrange}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Total savings</span>
          </div>
          <div className={styles.statValue}>${stats.totalSavings.toFixed(2)}</div>
          <div className={styles.statChange}>
            <span className={styles.statNeutral}>{stats.conversionRate.toFixed(0)}% success rate</span>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Merchant pipeline</span>
          <Link to="/admin/merchants" className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}>
            All merchants →
          </Link>
        </div>
        <div className={styles.cardBody}>
          <div className={styles.pipelineGrid}>
            {(["installed", "onboarding", "rules_live", "converting", "at_risk"] as const).map((stage) => (
              <Link
                key={stage}
                to={`/admin/merchants?stage=${stage}`}
                className={`${styles.pipelineCard} ${stage === "at_risk" ? styles.pipelineCardRisk : ""}`}
              >
                <span className={styles.pipelineCount}>{pipelineCounts[stage]}</span>
                <span className={styles.pipelineLabel}>{stageLabel(stage)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.twoCol}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Recent activity</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            {recentConversions.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Shop</th>
                    <th style={{ textAlign: "right" }}>Saved</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentConversions.map((c) => (
                    <tr key={c.id}>
                      <td><span className={styles.codeInline}>#{c.orderId.slice(-8)}</span></td>
                      <td>{c.shop.replace(".myshopify.com", "")}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "#059669" }}>
                        ${c.savingsAmount.toFixed(2)}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${c.status === "success" ? styles.badgeGreen : styles.badgeRed}`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyTitle}>No conversions yet</div>
                <div className={styles.emptyText}>Conversions appear when bundle rules match live orders.</div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Recent merchants</span>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyTitle}>No merchants yet</div>
                <div className={styles.emptyText}>Installs from the Shopify App Store will appear here.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {recentRules.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Latest bundle rules</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Shop</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Used</th>
                </tr>
              </thead>
              <tbody>
                {recentRules.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>{r.shop.replace(".myshopify.com", "")}</td>
                    <td>
                      <span className={`${styles.badge} ${r.status === "active" ? styles.badgeGreen : styles.badgeGray}`}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>{r.frequency}×</td>
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
