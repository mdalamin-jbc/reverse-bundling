import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";
import { useState } from "react";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await requireAdmin(request);
  const shop = params.shop || "";
  if (!shop) throw new Response("Shop required", { status: 400 });

  const [
    sessions, rules, conversions, settings,
    suggestions, orderHistoryCount, cooccurrenceCount,
    fulfillmentProviders, savingsAgg,
  ] = await Promise.all([
    db.session.findMany({ where: { shop }, select: { id: true, isOnline: true, scope: true, accessToken: true }, take: 5, orderBy: { id: "desc" } }),
    db.bundleRule.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.orderConversion.findMany({ where: { shop }, orderBy: { convertedAt: "desc" }, take: 20 }),
    db.appSettings.findFirst({ where: { shop } }),
    db.bundleSuggestion.findMany({ where: { shop }, orderBy: { confidence: "desc" }, take: 15 }),
    db.orderHistory.count({ where: { shop } }),
    db.itemCooccurrence.count({ where: { shop } }),
    db.fulfillmentProvider.findMany({ where: { shop } }),
    db.orderConversion.aggregate({ where: { shop }, _sum: { savingsAmount: true } }),
  ]);

  const totalConversions = await db.orderConversion.count({ where: { shop } });
  const successConversions = await db.orderConversion.count({ where: { shop, status: "success" } });

  // Enrich rules with actual conversion data from OrderConversion table
  const enrichedRules = await Promise.all(
    rules.map(async (r) => {
      const [convCount, convSavings] = await Promise.all([
        db.orderConversion.count({ where: { bundleRuleId: r.id } }),
        db.orderConversion.aggregate({ where: { bundleRuleId: r.id }, _sum: { savingsAmount: true } }),
      ]);
      return {
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        actualConversions: convCount,
        actualSavings: convSavings._sum.savingsAmount || 0,
      };
    })
  );

  return json({
    shop,
    sessions: sessions.map(s => ({
      ...s,
      accessToken: s.accessToken ? `${s.accessToken.slice(0, 6)}...${s.accessToken.slice(-4)}` : "—",
    })),
    rules: enrichedRules,
    conversions: conversions.map(c => ({ ...c, convertedAt: c.convertedAt.toISOString() })),
    settings,
    suggestions: suggestions.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })),
    fulfillmentProviders,
    stats: {
      totalRules: rules.length,
      activeRules: rules.filter(r => r.status === "active").length,
      totalConversions,
      successConversions,
      conversionRate: totalConversions > 0 ? (successConversions / totalConversions * 100) : 0,
      totalSavings: savingsAgg._sum.savingsAmount || 0,
      orderHistoryCount,
      cooccurrenceCount,
      suggestions: suggestions.length,
      sessionCount: sessions.length,
    },
  });
};

type Tab = "overview" | "rules" | "conversions" | "suggestions" | "settings";

export default function AdminMerchantDetail() {
  const { shop, sessions, rules, conversions, settings, suggestions, fulfillmentProviders, stats } = useLoaderData<typeof loader>();
  const [tab, setTab] = useState<Tab>("overview");
  const shortShop = shop.replace(".myshopify.com", "");

  return (
    <>
      {/* Breadcrumb + Header */}
      <div className={styles.pageHeader}>
        <div style={{ marginBottom: 8 }}>
          <Link to="/admin/merchants" style={{ fontSize: 13, color: "#6366f1", textDecoration: "none", fontWeight: 500 }}>
            ← Back to Merchants
          </Link>
        </div>
        <div className={styles.pageHeaderRow}>
          <div>
            <h2 className={styles.pageHeaderTitle}>🏪 {shortShop}</h2>
            <p className={styles.pageHeaderSub}>{shop}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {settings?.autoConvertOrders && (
              <span className={`${styles.badge} ${styles.badgeTeal}`}>Auto-convert ON</span>
            )}
            <span className={`${styles.badge} ${styles.badgeGreen}`}>
              <span className={styles.badgeDot}></span> Active
            </span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCardBlue}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Bundle Rules</span>
            <div className={`${styles.statIcon} ${styles.statIconBlue}`}>📋</div>
          </div>
          <div className={styles.statValue}>{stats.totalRules}</div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>{stats.activeRules} active</span>
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardGreen}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Conversions</span>
            <div className={`${styles.statIcon} ${styles.statIconGreen}`}>🔄</div>
          </div>
          <div className={styles.statValue}>{stats.totalConversions}</div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>{stats.conversionRate.toFixed(0)}% success</span>
          </div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardOrange}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Total Savings</span>
            <div className={`${styles.statIcon} ${styles.statIconOrange}`}>💰</div>
          </div>
          <div className={styles.statValue}>${stats.totalSavings.toFixed(2)}</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardPurple}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>AI Suggestions</span>
            <div className={`${styles.statIcon} ${styles.statIconPurple}`}>🤖</div>
          </div>
          <div className={styles.statValue}>{stats.suggestions}</div>
          <div className={styles.statChange}>
            <span className={styles.statNeutral}>{stats.orderHistoryCount} orders · {stats.cooccurrenceCount} pairs</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {(["overview", "rules", "conversions", "suggestions", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "overview" ? "📊 Overview" : t === "rules" ? `📋 Rules (${rules.length})` : t === "conversions" ? `🔄 Conversions (${conversions.length})` : t === "suggestions" ? `🤖 Suggestions (${suggestions.length})` : "⚙️ Settings"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Sessions</span>
              <span className={`${styles.badge} ${styles.badgeBlue}`}>{stats.sessionCount}</span>
            </div>
            <div className={styles.cardBodyNoPad}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Token</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td><span className={styles.codeInline}>{s.id.slice(0, 20)}</span></td>
                      <td><span className={`${styles.badge} ${s.isOnline ? styles.badgeGreen : styles.badgeBlue}`}>{s.isOnline ? "Online" : "Offline"}</span></td>
                      <td><span className={styles.codeInline}>{s.accessToken}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Fulfillment Providers</span>
            </div>
            <div className={styles.cardBodyNoPad}>
              {fulfillmentProviders.length > 0 ? (
                <table className={styles.table}>
                  <thead>
                    <tr><th>Name</th><th>Type</th><th>Status</th><th>Orders</th></tr>
                  </thead>
                  <tbody>
                    {fulfillmentProviders.map((fp) => (
                      <tr key={fp.id}>
                        <td style={{ fontWeight: 600 }}>{fp.name}</td>
                        <td><span className={`${styles.badge} ${styles.badgeIndigo}`}>{fp.type}</span></td>
                        <td><span className={`${styles.badge} ${fp.status === "active" ? styles.badgeGreen : styles.badgeGray}`}>{fp.status}</span></td>
                        <td>{fp.ordersProcessed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className={styles.emptyState} style={{ padding: 32 }}>
                  <div className={styles.emptyText}>No fulfillment providers configured</div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.card} style={{ gridColumn: "1 / -1" }}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Data Summary</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.fourCol}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#2563eb" }}>{stats.orderHistoryCount.toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Order Records</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#7c3aed" }}>{stats.cooccurrenceCount.toLocaleString()}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Item Co-occurrences</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#059669" }}>{stats.successConversions}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Successful Conversions</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#d97706" }}>${stats.totalSavings.toFixed(2)}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Total Savings</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "rules" && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Bundle Rules</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            {rules.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Bundled SKU</th>
                    <th style={{ textAlign: "center" }}>Items</th>
                    <th style={{ textAlign: "center" }}>Status</th>
                    <th style={{ textAlign: "center" }}>Conversions</th>
                    <th style={{ textAlign: "right" }}>Total Savings</th>
                    <th>Category</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td><span className={styles.codeInline}>{r.bundledSku || "—"}</span></td>
                      <td style={{ textAlign: "center" }}>{Array.isArray(r.items) ? (r.items as string[]).length : 0}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`${styles.badge} ${r.status === "active" ? styles.badgeGreen : r.status === "paused" ? styles.badgeYellow : styles.badgeGray}`}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ fontWeight: 700 }}>{r.actualConversions}</span>
                        {r.frequency > 0 && r.frequency !== r.actualConversions && (
                          <div className={styles.tableSub}>{r.frequency}× matched</div>
                        )}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "#059669" }}>${r.actualSavings.toFixed(2)}</td>
                      <td><span className={`${styles.badge} ${styles.badgeIndigo}`}>{r.category || "—"}</span></td>
                      <td style={{ fontSize: 12, color: "#6b7280" }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📋</div>
                <div className={styles.emptyText}>No bundle rules for this merchant</div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "conversions" && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Order Conversions</span>
            <span className={`${styles.badge} ${styles.badgeBlue}`}>{stats.totalConversions} total</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            {conversions.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Bundled SKU</th>
                    <th style={{ textAlign: "center" }}>Status</th>
                    <th style={{ textAlign: "right" }}>Savings</th>
                    <th>Error</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {conversions.map((c) => (
                    <tr key={c.id}>
                      <td><span className={styles.codeInline}>{c.orderId.slice(-12)}</span></td>
                      <td><span className={styles.codeInline}>{c.bundledSku || "—"}</span></td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`${styles.badge} ${c.status === "success" ? styles.badgeGreen : c.status === "failed" ? styles.badgeRed : styles.badgeYellow}`}>
                          {c.status}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "#059669" }}>
                        ${c.savingsAmount.toFixed(2)}
                      </td>
                      <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "#dc2626" }}>
                        {c.errorMessage || "—"}
                      </td>
                      <td style={{ fontSize: 12, color: "#6b7280" }}>{new Date(c.convertedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>🔄</div>
                <div className={styles.emptyText}>No conversions for this merchant</div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "suggestions" && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>AI Suggestions</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            {suggestions.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th style={{ textAlign: "center" }}>Items</th>
                    <th style={{ textAlign: "center" }}>Confidence</th>
                    <th style={{ textAlign: "right" }}>Potential Savings</th>
                    <th style={{ textAlign: "center" }}>Frequency</th>
                    <th style={{ textAlign: "center" }}>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td style={{ textAlign: "center" }}>{Array.isArray(s.items) ? (s.items as string[]).length : 0}</td>
                      <td style={{ textAlign: "center" }}>
                        <span style={{ fontWeight: 700, color: s.confidence >= 0.8 ? "#059669" : s.confidence >= 0.5 ? "#d97706" : "#dc2626" }}>
                          {(s.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: "#059669" }}>
                        ${s.potentialSavings.toFixed(2)}
                      </td>
                      <td style={{ textAlign: "center" }}>{s.orderFrequency}×</td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`${styles.badge} ${s.status === "applied" ? styles.badgeGreen : s.status === "dismissed" ? styles.badgeRed : styles.badgeYellow}`}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: "#6b7280" }}>{new Date(s.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>🤖</div>
                <div className={styles.emptyText}>No AI suggestions yet</div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>⚙️ App Settings</span>
            </div>
            <div className={styles.cardBody}>
              {settings ? (
                <div className={styles.detailGrid}>
                  <div className={styles.detailLabel}>Auto-Convert Orders</div>
                  <div className={styles.detailValue}>
                    <span className={`${styles.badge} ${settings.autoConvertOrders ? styles.badgeGreen : styles.badgeGray}`}>
                      {settings.autoConvertOrders ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className={styles.detailLabel}>Fulfillment Mode</div>
                  <div className={styles.detailValue}>{settings.fulfillmentMode || "—"}</div>
                  <div className={styles.detailLabel}>Minimum Savings</div>
                  <div className={styles.detailValue}>${settings.minimumSavings.toFixed(2)}</div>
                  <div className={styles.detailLabel}>Individual Ship Cost</div>
                  <div className={styles.detailValue}>${settings.individualShipCost.toFixed(2)}</div>
                  <div className={styles.detailLabel}>Bundle Ship Cost</div>
                  <div className={styles.detailValue}>${settings.bundleShipCost.toFixed(2)}</div>
                  <div className={styles.detailLabel}>Notifications</div>
                  <div className={styles.detailValue}>
                    <span className={`${styles.badge} ${settings.notificationsEnabled ? styles.badgeGreen : styles.badgeGray}`}>
                      {settings.notificationsEnabled ? "On" : "Off"}
                    </span>
                  </div>
                  <div className={styles.detailLabel}>Email Notifications</div>
                  <div className={styles.detailValue}>
                    <span className={`${styles.badge} ${settings.emailNotifications ? styles.badgeGreen : styles.badgeGray}`}>
                      {settings.emailNotifications ? "On" : "Off"}
                    </span>
                  </div>
                  <div className={styles.detailLabel}>Slack Webhook</div>
                  <div className={styles.detailValue}>
                    {settings.slackWebhook ? <span className={styles.codeInline}>{settings.slackWebhook.slice(0, 30)}...</span> : "—"}
                  </div>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <div className={styles.emptyText}>Not configured yet</div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>📡 Session Info</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.detailGrid}>
                <div className={styles.detailLabel}>Active Sessions</div>
                <div className={styles.detailValue}>{stats.sessionCount}</div>
                <div className={styles.detailLabel}>Shop Domain</div>
                <div className={styles.detailValue}><span className={styles.codeInline}>{shop}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
