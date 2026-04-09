import { type LoaderFunctionArgs, type ActionFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
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

  const [totalSessions, totalRules, totalConversions, totalOrders, totalCooccurrences, totalSuggestions] = await Promise.all([
    db.session.count(),
    db.bundleRule.count(),
    db.orderConversion.count(),
    db.orderHistory.count(),
    db.itemCooccurrence.count(),
    db.bundleSuggestion.count(),
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
      default:
        return json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return json({ error: message }, { status: 500 });
  }
};

export default function AdminSettings() {
  const { envVars, appInfo, dataCounts } = useLoaderData<typeof loader>();
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
          </div>
        </div>
      </div>
    </>
  );
}
