import { type LoaderFunctionArgs, type ActionFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import {
  cleanupUninstalledShops,
  getInstalledShopDomains,
  getSessionShopDomains,
} from "../shop-cleanup.server";
import {
  countQuickStuckCandidates,
  listQuickStuckCandidates,
  sendStuckMerchantOnboardingEmails,
} from "../merchant-outreach.server";
import {
  listOutreachProspects,
  seedOutreachProspects,
  sendProspectOutreachBatch,
  markProspectReplied,
  markProspectOptedOut,
} from "../prospect-outreach.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdmin(request);

  const envVars = [
    { key: "NODE_ENV", value: process.env.NODE_ENV || "—" },
    { key: "DATABASE_URL", value: process.env.DATABASE_URL ? "****" + process.env.DATABASE_URL.slice(-20) : "—" },
    { key: "SHOPIFY_API_KEY", value: process.env.SHOPIFY_API_KEY ? process.env.SHOPIFY_API_KEY.slice(0, 8) + "..." : "—" },
    { key: "SHOPIFY_API_SECRET", value: process.env.SHOPIFY_API_SECRET ? "****" : "—" },
    { key: "SHOPIFY_APP_URL", value: process.env.SHOPIFY_APP_URL || "—" },
    { key: "SCOPES", value: process.env.SCOPES || "—" },
    { key: "SESSION_SECRET", value: process.env.SESSION_SECRET ? "****" : "—" },
    { key: "ADMIN_PASSWORD", value: "****" },
    { key: "PORT", value: process.env.PORT || "3000" },
  ];

  const [
    totalSessions,
    totalRules,
    totalConversions,
    totalOrders,
    totalCooccurrences,
    totalSuggestions,
    sessionShopDomains,
    installedShopDomains,
    stuckMerchantEstimate,
    stuckMerchantPreview,
    outreachProspects,
    outreachStats,
  ] = await Promise.all([
    db.session.count(),
    db.bundleRule.count(),
    db.orderConversion.count(),
    db.orderHistory.count(),
    db.itemCooccurrence.count(),
    db.bundleSuggestion.count(),
    getSessionShopDomains(),
    getInstalledShopDomains(),
    countQuickStuckCandidates(),
    listQuickStuckCandidates(10),
    listOutreachProspects(20),
    db.outreachProspect.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  return json({
    envVars,
    appInfo: {
      name: "Reverse Bundle Pro",
      version: "1.0.0",
      framework: "Remix + Shopify App",
      database: "PostgreSQL (NeonDB) + Prisma",
      hosting: "DigitalOcean",
      domain: "reverse-bundling.me",
    },
    dataCounts: {
      sessions: totalSessions,
      rules: totalRules,
      conversions: totalConversions,
      orders: totalOrders,
      cooccurrences: totalCooccurrences,
      suggestions: totalSuggestions,
    },
    merchantCounts: {
      sessionShops: sessionShopDomains.length,
      installedShops: installedShopDomains.length,
      orphanedShops: Math.max(0, sessionShopDomains.length - installedShopDomains.length),
    },
    stuckRealMerchants: stuckMerchantPreview.map((m) => ({
      shop: m.shop,
      email: m.email || "—",
      shopName: m.shopName,
      productCount: null as number | null,
      orderCount: null as number | null,
    })),
    stuckRealMerchantCount: stuckMerchantEstimate,
    outreachProspects: outreachProspects.map((p) => ({
      id: p.id,
      storeName: p.storeName,
      email: p.email,
      niche: p.niche,
      status: p.status,
      sentAt: p.sentAt?.toISOString() || null,
    })),
    outreachStats: Object.fromEntries(
      outreachStats.map((row) => [row.status, row._count._all])
    ),
    outreachReplyTo: process.env.OUTREACH_REPLY_TO || "azurite.tech.ltd@gmail.com",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireAdmin(request);
  const form = await request.formData();
  const actionType = form.get("_action") as string;

  try {
    switch (actionType) {
      case "clear-old-conversions": {
        const daysStr = form.get("days") as string;
        const days = parseInt(daysStr || "90", 10);
        if (days < 7) return json({ error: "Minimum 7 days" }, { status: 400 });
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const result = await db.orderConversion.deleteMany({ where: { convertedAt: { lt: cutoff } } });
        return json({ success: true, message: `Deleted ${result.count} conversions older than ${days} days` });
      }
      case "clear-dismissed-suggestions": {
        const result = await db.bundleSuggestion.deleteMany({ where: { status: "dismissed" } });
        return json({ success: true, message: `Deleted ${result.count} dismissed suggestions` });
      }
      case "clear-old-cooccurrences": {
        const daysStr = form.get("days") as string;
        const days = parseInt(daysStr || "180", 10);
        if (days < 30) return json({ error: "Minimum 30 days" }, { status: 400 });
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const result = await db.itemCooccurrence.deleteMany({ where: { updatedAt: { lt: cutoff } } });
        return json({ success: true, message: `Deleted ${result.count} old co-occurrence records` });
      }
      case "reset-failed-conversions": {
        const result = await db.orderConversion.updateMany({
          where: { status: "failed" },
          data: { status: "pending", errorMessage: null },
        });
        return json({ success: true, message: `Reset ${result.count} failed conversions to pending` });
      }
      case "cleanup-uninstalled-shops": {
        const result = await cleanupUninstalledShops();
        return json({
          success: true,
          message: `Checked ${result.checked} shops, removed ${result.removed} uninstalled merchant${result.removed !== 1 ? "s" : ""} and all their data`,
        });
      }
      case "preview-onboarding-emails": {
        const result = await sendStuckMerchantOnboardingEmails({ dryRun: true, limit: 50 });
        return json({
          success: true,
          message: `Found ${result.candidates} real merchants with no active bundle rule (preview only, no emails sent)`,
        });
      }
      case "send-onboarding-emails": {
        const result = await sendStuckMerchantOnboardingEmails({ dryRun: false, limit: 50 });
        return json({
          success: true,
          message: `Sent ${result.sent} onboarding emails to real merchants (${result.failed} failed, ${result.candidates} targeted)`,
        });
      }
      case "seed-outreach-prospects": {
        const result = await seedOutreachProspects();
        return json({
          success: true,
          message: `Seeded ${result.created} ICP prospects (${result.skipped} already existed)`,
        });
      }
      case "preview-outreach-emails": {
        const result = await sendProspectOutreachBatch({ dryRun: true, limit: 12 });
        return json({
          success: true,
          message: `Preview: ${result.targeted} pending prospects ready to email (supplements, beauty, accessories)`,
        });
      }
      case "send-outreach-emails": {
        const result = await sendProspectOutreachBatch({ dryRun: false, limit: 12 });
        return json({
          success: true,
          message: `Sent ${result.sent} outreach emails (${result.failed} failed, ${result.targeted} targeted). Replies go to ${process.env.OUTREACH_REPLY_TO || "azurite.tech.ltd@gmail.com"}`,
        });
      }
      case "mark-prospect-replied": {
        const email = (form.get("email") as string)?.trim();
        if (!email) return json({ error: "Email required" }, { status: 400 });
        await markProspectReplied(email);
        return json({ success: true, message: `Marked ${email} as replied` });
      }
      case "mark-prospect-opt-out": {
        const email = (form.get("email") as string)?.trim();
        if (!email) return json({ error: "Email required" }, { status: 400 });
        await markProspectOptedOut(email);
        return json({ success: true, message: `Marked ${email} as opted out` });
      }
      default:
        return json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return json({ error: message }, { status: 500 });
  }
};

export default function AdminSettings() {
  const {
    envVars,
    appInfo,
    dataCounts,
    merchantCounts,
    stuckRealMerchants,
    stuckRealMerchantCount,
    outreachProspects,
    outreachStats,
    outreachReplyTo,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; message?: string; error?: string }>();

  return (
    <>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderRow}>
          <div>
            <h2 className={styles.pageHeaderTitle}>Settings</h2>
            <p className={styles.pageHeaderSub}>Application configuration and maintenance tools</p>
          </div>
        </div>
      </div>

      {/* Action Result */}
      {fetcher.data && (
        <div className={`${styles.alert} ${fetcher.data.success ? styles.alertSuccess : styles.alertError}`} style={{ marginBottom: 20 }}>
          {fetcher.data.success ? `✅ ${fetcher.data.message}` : `❌ ${fetcher.data.error}`}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* App Info */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>📱 App Information</span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.detailGrid}>
              {Object.entries(appInfo).map(([key, val]) => (
                <div key={key} style={{ display: "contents" }}>
                  <div className={styles.detailLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</div>
                  <div className={styles.detailValue}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Env Vars */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>🔐 Environment Variables</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {envVars.map((e) => (
                  <tr key={e.key}>
                    <td><span className={styles.codeInline}>{e.key}</span></td>
                    <td><span className={styles.codeInline}>{e.value}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Merchant counts */}
      <div className={styles.card} style={{ marginTop: 24 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>🏪 Merchant Database</span>
        </div>
        <div className={styles.cardBody}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#2563eb" }}>{merchantCounts.installedShops}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Installed (with token)</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#6b7280" }}>{merchantCounts.sessionShops}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Session rows (legacy)</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: merchantCounts.orphanedShops > 0 ? "#dc2626" : "#059669" }}>
                {merchantCounts.orphanedShops}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Likely uninstalled</div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Counts */}
      <div className={styles.card} style={{ marginTop: 24 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>📊 Data Overview</span>
        </div>
        <div className={styles.cardBody}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 16, textAlign: "center" }}>
            {[
              { label: "Sessions", count: dataCounts.sessions, color: "#2563eb" },
              { label: "Rules", count: dataCounts.rules, color: "#7c3aed" },
              { label: "Conversions", count: dataCounts.conversions, color: "#059669" },
              { label: "Orders", count: dataCounts.orders, color: "#d97706" },
              { label: "Co-occurrences", count: dataCounts.cooccurrences, color: "#0d9488" },
              { label: "Suggestions", count: dataCounts.suggestions, color: "#dc2626" },
            ].map((d) => (
              <div key={d.label}>
                <div style={{ fontSize: 24, fontWeight: 800, color: d.color }}>{d.count.toLocaleString()}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{d.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Merchant Activation */}
      <div className={styles.card} style={{ marginTop: 24 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>🚀 Merchant Activation</span>
          <span className={`${styles.badge} ${styles.badgeBlue}`}>{stuckRealMerchantCount} real merchants stuck</span>
        </div>
        <div className={styles.cardBody}>
          <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14 }}>
            Targets installed stores with no active bundle rule. Count below is a fast DB estimate (~
            {stuckRealMerchantCount} shops). Click <strong>Preview count</strong> before sending — that runs the full Shopify qualification scan (can take 1–2 minutes).
          </p>
          {stuckRealMerchants.length > 0 && (
            <table className={styles.table} style={{ marginBottom: 16 }}>
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Email</th>
                  <th>Products</th>
                  <th>Orders</th>
                </tr>
              </thead>
              <tbody>
                {stuckRealMerchants.map((merchant) => (
                  <tr key={merchant.shop}>
                    <td>{merchant.shopName || merchant.shop}</td>
                    <td>{merchant.email}</td>
                    <td>{merchant.productCount ?? "—"}</td>
                    <td>{merchant.orderCount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <fetcher.Form method="post">
              <input type="hidden" name="_action" value="preview-onboarding-emails" />
              <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`} disabled={fetcher.state !== "idle"}>
                Preview count
              </button>
            </fetcher.Form>
            <fetcher.Form method="post">
              <input type="hidden" name="_action" value="send-onboarding-emails" />
              <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`} disabled={fetcher.state !== "idle" || stuckRealMerchantCount === 0}>
                {fetcher.state !== "idle" ? "Sending…" : `Email ${stuckRealMerchantCount} real merchants`}
              </button>
            </fetcher.Form>
          </div>
        </div>
      </div>

      {/* ICP Cold Outreach */}
      <div className={styles.card} style={{ marginTop: 24 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>📣 New Merchant Outreach (ICP)</span>
          <span className={`${styles.badge} ${styles.badgeBlue}`}>
            {(outreachStats.pending as number) || 0} pending
          </span>
        </div>
        <div className={styles.cardBody}>
          <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14 }}>
            Professional cold outreach to supplements, beauty kits, and accessories stores.
            Emails send from Brevo with replies to <strong>{outreachReplyTo}</strong> — check that inbox daily.
          </p>
          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { label: "Pending", key: "pending", color: "#2563eb" },
              { label: "Sent", key: "sent", color: "#059669" },
              { label: "Replied", key: "replied", color: "#7c3aed" },
              { label: "Opted out", key: "opted_out", color: "#6b7280" },
            ].map((s) => (
              <div key={s.key} style={{ textAlign: "center", minWidth: 80 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>
                  {(outreachStats[s.key] as number) || 0}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{s.label}</div>
              </div>
            ))}
          </div>
          {outreachProspects.length > 0 && (
            <table className={styles.table} style={{ marginBottom: 16 }}>
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Email</th>
                  <th>Niche</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {outreachProspects.map((p) => (
                  <tr key={p.id}>
                    <td>{p.storeName}</td>
                    <td>{p.email}</td>
                    <td>{p.niche}</td>
                    <td>{p.status}</td>
                    <td>
                      {p.status === "sent" && (
                        <fetcher.Form method="post" style={{ display: "inline" }}>
                          <input type="hidden" name="_action" value="mark-prospect-replied" />
                          <input type="hidden" name="email" value={p.email} />
                          <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}>
                            Mark replied
                          </button>
                        </fetcher.Form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <fetcher.Form method="post">
              <input type="hidden" name="_action" value="seed-outreach-prospects" />
              <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`} disabled={fetcher.state !== "idle"}>
                Seed 11 ICP prospects
              </button>
            </fetcher.Form>
            <fetcher.Form method="post">
              <input type="hidden" name="_action" value="preview-outreach-emails" />
              <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`} disabled={fetcher.state !== "idle"}>
                Preview pending count
              </button>
            </fetcher.Form>
            <fetcher.Form method="post">
              <input type="hidden" name="_action" value="send-outreach-emails" />
              <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`} disabled={fetcher.state !== "idle"}>
                {fetcher.state !== "idle" ? "Sending…" : "Send outreach batch (max 12)"}
              </button>
            </fetcher.Form>
          </div>
        </div>
      </div>

      {/* Maintenance Actions */}
      <div className={styles.card} style={{ marginTop: 24 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>🔧 Maintenance Actions</span>
          <span className={`${styles.badge} ${styles.badgeYellow}`}>Use with caution</span>
        </div>
        <div className={styles.cardBody}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Clear Old Conversions */}
            <div className={styles.maintenanceAction}>
              <div className={styles.maintenanceTitle}>🗑️ Clear Old Conversions</div>
              <div className={styles.maintenanceDesc}>
                Remove old conversion records to free up database space. Records older than the specified days will be permanently deleted.
              </div>
              <fetcher.Form method="post" style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input type="hidden" name="_action" value="clear-old-conversions" />
                <select name="days" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                  <option value="365">365 days</option>
                </select>
                <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}>
                  Delete Old Records
                </button>
              </fetcher.Form>
            </div>

            {/* Clear Dismissed Suggestions */}
            <div className={styles.maintenanceAction}>
              <div className={styles.maintenanceTitle}>🤖 Clear Dismissed Suggestions</div>
              <div className={styles.maintenanceDesc}>
                Remove all AI suggestions that were dismissed by merchants. This frees up space without affecting active suggestions.
              </div>
              <fetcher.Form method="post" style={{ marginTop: 10 }}>
                <input type="hidden" name="_action" value="clear-dismissed-suggestions" />
                <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}>
                  Delete Dismissed
                </button>
              </fetcher.Form>
            </div>

            {/* Clear Old Co-occurrences */}
            <div className={styles.maintenanceAction}>
              <div className={styles.maintenanceTitle}>🔗 Clear Old Co-occurrences</div>
              <div className={styles.maintenanceDesc}>
                Remove stale item co-occurrence records. Older records may no longer reflect current purchasing patterns.
              </div>
              <fetcher.Form method="post" style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input type="hidden" name="_action" value="clear-old-cooccurrences" />
                <select name="days" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}>
                  <option value="180">180 days</option>
                  <option value="365">365 days</option>
                </select>
                <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}>
                  Delete Old Records
                </button>
              </fetcher.Form>
            </div>

            {/* Reset Failed Conversions */}
            <div className={styles.maintenanceAction}>
              <div className={styles.maintenanceTitle}>🔄 Reset Failed Conversions</div>
              <div className={styles.maintenanceDesc}>
                Reset all failed conversions back to pending status so they can be retried. Error messages will be cleared.
              </div>
              <fetcher.Form method="post" style={{ marginTop: 10 }}>
                <input type="hidden" name="_action" value="reset-failed-conversions" />
                <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}>
                  Reset to Pending
                </button>
              </fetcher.Form>
            </div>

            {/* Remove uninstalled merchants */}
            <div className={styles.maintenanceAction}>
              <div className={styles.maintenanceTitle}>🧹 Remove Uninstalled Merchants</div>
              <div className={styles.maintenanceDesc}>
                Purge all database records for shops that uninstalled the app. Verifies each shop with Shopify before deleting sessions, rules, conversions, and settings. May take a few minutes.
              </div>
              <fetcher.Form method="post" style={{ marginTop: 10 }}>
                <input type="hidden" name="_action" value="cleanup-uninstalled-shops" />
                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                  disabled={fetcher.state !== "idle"}
                >
                  {fetcher.state !== "idle" ? "Cleaning up…" : "Remove Uninstalled Merchants"}
                </button>
              </fetcher.Form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
