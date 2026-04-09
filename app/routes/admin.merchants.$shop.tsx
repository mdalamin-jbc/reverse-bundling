import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireAdmin(request);

  const shop = decodeURIComponent(params.shop || "");
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const [session, settings, rules, conversions, suggestions, orderHistoryCount, cooccurrenceCount] = await Promise.all([
    db.session.findFirst({ where: { shop } }),
    db.appSettings.findUnique({ where: { shop } }),
    db.bundleRule.findMany({ where: { shop }, orderBy: { createdAt: "desc" } }),
    db.orderConversion.findMany({ where: { shop }, orderBy: { convertedAt: "desc" }, take: 20 }),
    db.bundleSuggestion.findMany({ where: { shop }, orderBy: { confidence: "desc" }, take: 10 }),
    db.orderHistory.count({ where: { shop } }),
    db.itemCooccurrence.count({ where: { shop } }),
  ]);

  if (!session) throw new Response("Merchant not found", { status: 404 });

  const savingsAgg = await db.orderConversion.aggregate({
    where: { shop },
    _sum: { savingsAmount: true },
  });

  return json({
    shop,
    session: {
      id: session.id,
      scope: session.scope,
      isOnline: session.isOnline,
    },
    settings: settings ? {
      ...settings,
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
    } : null,
    rules: rules.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    conversions: conversions.map(c => ({
      ...c,
      convertedAt: c.convertedAt.toISOString(),
    })),
    suggestions: suggestions.map(s => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    totalSavings: savingsAgg._sum.savingsAmount || 0,
    orderHistoryCount,
    cooccurrenceCount,
  });
};

export default function AdminMerchantDetail() {
  const {
    shop, session, settings, rules, conversions, suggestions,
    totalSavings, orderHistoryCount, cooccurrenceCount,
  } = useLoaderData<typeof loader>();

  return (
    <>
      <Link to="/admin/merchants" className={styles.backLink}>← Back to Merchants</Link>

      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
          {shop.replace(".myshopify.com", "")}
        </h2>
        <span style={{ fontSize: 13, color: "#6b7280" }}>{shop}</span>
      </div>

      {/* Quick Stats */}
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCardBlue}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Bundle Rules</span>
            <span className={styles.statIcon}>📋</span>
          </div>
          <div className={styles.statValue}>{rules.length}</div>
          <span className={styles.statUp}>{rules.filter(r => r.status === "active").length} active</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardGreen}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Conversions</span>
            <span className={styles.statIcon}>🔄</span>
          </div>
          <div className={styles.statValue}>{conversions.length}</div>
          <span className={styles.statUp}>{conversions.filter(c => c.status === "success").length} successful</span>
        </div>
        <div className={`${styles.statCard} ${styles.statCardOrange}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Total Savings</span>
            <span className={styles.statIcon}>💰</span>
          </div>
          <div className={styles.statValue}>${totalSavings.toFixed(2)}</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardPurple}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>AI Data</span>
            <span className={styles.statIcon}>🤖</span>
          </div>
          <div className={styles.statValue}>{suggestions.length}</div>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {orderHistoryCount} orders · {cooccurrenceCount} pairs
          </span>
        </div>
      </div>

      <div className={styles.detailGrid}>
        {/* Left: Main content */}
        <div>
          {/* Bundle Rules */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>📋 Bundle Rules</span>
              <span className={`${styles.badge} ${styles.badgeBlue}`}>{rules.length} total</span>
            </div>
            <div className={styles.cardBodyNoPad}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>SKU</th>
                    <th>Status</th>
                    <th>Frequency</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td><code style={{ fontSize: 12, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>{r.bundledSku}</code></td>
                      <td>
                        <span className={`${styles.badge} ${r.status === "active" ? styles.badgeGreen : r.status === "paused" ? styles.badgeYellow : styles.badgeGray}`}>
                          {r.status}
                        </span>
                      </td>
                      <td>{r.frequency}</td>
                      <td style={{ fontSize: 12, color: "#6b7280" }}>
                        {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                    </tr>
                  ))}
                  {rules.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: "center", color: "#9ca3af", padding: 32 }}>No bundle rules</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Conversions */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>🔄 Recent Conversions</span>
              <span className={`${styles.badge} ${styles.badgeGreen}`}>{conversions.length}</span>
            </div>
            <div className={styles.cardBodyNoPad}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Bundle SKU</th>
                    <th>Savings</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {conversions.map(c => (
                    <tr key={c.id}>
                      <td><code style={{ fontSize: 12 }}>{c.orderId}</code></td>
                      <td><code style={{ fontSize: 12, background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>{c.bundledSku}</code></td>
                      <td style={{ fontWeight: 600, color: "#059669" }}>${c.savingsAmount.toFixed(2)}</td>
                      <td>
                        <span className={`${styles.badge} ${c.status === "success" ? styles.badgeGreen : c.status === "failed" ? styles.badgeRed : styles.badgeYellow}`}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "#6b7280" }}>
                        {new Date(c.convertedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  ))}
                  {conversions.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: "center", color: "#9ca3af", padding: 32 }}>No conversions yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Suggestions */}
          {suggestions.length > 0 && (
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.cardTitle}>🤖 AI Bundle Suggestions</span>
              </div>
              <div className={styles.cardBodyNoPad}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Suggestion</th>
                      <th>Confidence</th>
                      <th>Est. Savings</th>
                      <th>Frequency</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div className={styles.progressBar} style={{ width: 60, marginTop: 0 }}>
                              <div
                                className={`${styles.progressFill} ${s.confidence > 0.7 ? styles.progressGreen : s.confidence > 0.4 ? styles.progressYellow : styles.progressRed}`}
                                style={{ width: `${s.confidence * 100}%` }}
                              />
                            </div>
                            <span style={{ fontSize: 12 }}>{(s.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td style={{ color: "#059669", fontWeight: 600 }}>${s.potentialSavings.toFixed(2)}</td>
                        <td>{s.orderFrequency}×</td>
                        <td>
                          <span className={`${styles.badge} ${s.status === "applied" ? styles.badgeGreen : s.status === "dismissed" ? styles.badgeRed : styles.badgeBlue}`}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right: Sidebar info */}
        <div>
          {/* Session Info */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>🔑 Session</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Session Type</span>
                <span className={styles.detailValue}>{session.isOnline ? "Online" : "Offline"}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Scopes</span>
                <span className={styles.detailValue} style={{ fontSize: 11, maxWidth: 180, wordBreak: "break-all" }}>
                  {session.scope || "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>⚙️ Settings</span>
              <span className={`${styles.badge} ${settings ? styles.badgeGreen : styles.badgeYellow}`}>
                {settings ? "Configured" : "Default"}
              </span>
            </div>
            <div className={styles.cardBody}>
              {settings ? (
                <>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Auto-Convert</span>
                    <span className={`${styles.badge} ${settings.autoConvertOrders ? styles.badgeGreen : styles.badgeGray}`}>
                      {settings.autoConvertOrders ? "ON" : "OFF"}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Fulfillment Mode</span>
                    <span className={`${styles.badge} ${styles.badgePurple}`}>{settings.fulfillmentMode}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Email Notifications</span>
                    <span className={styles.detailValue}>{settings.emailNotifications ? "✅" : "❌"}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Slack Webhook</span>
                    <span className={styles.detailValue}>{settings.slackWebhook ? "✅ Connected" : "❌ Not set"}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Min. Savings</span>
                    <span className={styles.detailValue}>${settings.minimumSavings}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Ship Cost (Individual)</span>
                    <span className={styles.detailValue}>${settings.individualShipCost}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Ship Cost (Bundle)</span>
                    <span className={styles.detailValue}>${settings.bundleShipCost}</span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Last Updated</span>
                    <span className={styles.detailValue} style={{ fontSize: 11 }}>
                      {new Date(settings.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </>
              ) : (
                <div className={styles.emptyState} style={{ padding: 24 }}>
                  <div className={styles.emptyIcon} style={{ fontSize: 32 }}>⚙️</div>
                  <div className={styles.emptyText}>Merchant hasn't configured settings yet</div>
                </div>
              )}
            </div>
          </div>

          {/* Data Stats */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>📊 Data Stats</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Order History</span>
                <span className={styles.detailValue}>{orderHistoryCount}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Co-occurrences</span>
                <span className={styles.detailValue}>{cooccurrenceCount}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>AI Suggestions</span>
                <span className={styles.detailValue}>{suggestions.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
