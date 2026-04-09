import { type LoaderFunctionArgs, type ActionFunctionArgs, json, redirect } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdmin(request);

  const [totalMerchants, totalRules, totalConversions] = await Promise.all([
    db.session.count({ where: { shop: { not: "" } } }),
    db.bundleRule.count(),
    db.orderConversion.count(),
  ]);

  // Get distinct shops
  const sessions = await db.session.findMany({
    select: { shop: true },
    where: { shop: { not: "" } },
    distinct: ["shop"],
  });

  return json({
    env: {
      NODE_ENV: process.env.NODE_ENV || "not set",
      DATABASE_URL: process.env.DATABASE_URL ? "✅ Configured" : "❌ Missing",
      SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY ? "✅ Configured" : "❌ Missing",
      SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET ? "✅ Configured" : "❌ Missing",
      SESSION_SECRET: process.env.SESSION_SECRET ? "✅ Configured" : "❌ Missing",
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? "✅ Custom" : "⚠️ Default",
      SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL ? "✅ Configured" : "⚪ Not set",
      SMTP_HOST: process.env.SMTP_HOST ? "✅ Configured" : "⚪ Not set",
    },
    stats: {
      totalMerchants: sessions.length,
      totalSessions: totalMerchants,
      totalRules,
      totalConversions,
    },
    appInfo: {
      version: process.env.npm_package_version || "1.0.0",
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "clear-analytics") {
    const deleted = await db.bundleAnalytics.deleteMany({});
    return json({ success: true, message: `Cleared ${deleted.count} analytics records.` });
  }

  if (intent === "clear-cooccurrence") {
    const deleted = await db.itemCooccurrence.deleteMany({});
    return json({ success: true, message: `Cleared ${deleted.count} co-occurrence records.` });
  }

  if (intent === "clear-order-history") {
    const deleted = await db.orderHistory.deleteMany({});
    return json({ success: true, message: `Cleared ${deleted.count} order history records.` });
  }

  return json({ success: false, message: "Unknown action." });
};

export default function AdminSettings() {
  const { env, stats, appInfo } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <>
      {actionData?.message && (
        <div
          className={styles.card}
          style={{
            marginBottom: 24,
            background: actionData.success ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${actionData.success ? "#bbf7d0" : "#fecaca"}`,
          }}
        >
          <div className={styles.cardBody} style={{ padding: "12px 20px" }}>
            <span style={{ fontWeight: 500, color: actionData.success ? "#166534" : "#991b1b" }}>
              {actionData.success ? "✅" : "❌"} {actionData.message}
            </span>
          </div>
        </div>
      )}

      {/* App Information */}
      <div className={styles.twoCol}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>📦 Application Info</span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>App Name</span>
              <span className={styles.detailValue}>Reverse Bundle Pro</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Version</span>
              <span className={styles.detailValue}>{appInfo.version}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Node.js</span>
              <span className={styles.detailValue}>{appInfo.nodeVersion}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Platform</span>
              <span className={styles.detailValue}>{appInfo.platform} / {appInfo.arch}</span>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>📊 Quick Stats</span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Merchants</span>
              <span className={styles.detailValue} style={{ fontWeight: 700 }}>{stats.totalMerchants}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Sessions</span>
              <span className={styles.detailValue}>{stats.totalSessions}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Bundle Rules</span>
              <span className={styles.detailValue}>{stats.totalRules}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Conversions</span>
              <span className={styles.detailValue}>{stats.totalConversions}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Environment Variables */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>🔐 Environment Configuration</span>
          <span className={`${styles.badge} ${styles.badgePurple}`}>{Object.keys(env).length} variables</span>
        </div>
        <div className={styles.cardBodyNoPad}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Variable</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(env).map(([key, val]) => (
                <tr key={key}>
                  <td>
                    <code style={{ fontSize: 13, background: "#f3f4f6", padding: "2px 8px", borderRadius: 4 }}>{key}</code>
                  </td>
                  <td style={{ fontWeight: 500 }}>{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Maintenance Actions */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>🛠️ Maintenance Actions</span>
          <span className={`${styles.badge} ${styles.badgeYellow}`}>Use with caution</span>
        </div>
        <div className={styles.cardBody}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f9fafb", borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Clear Analytics Data</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Remove all bundle analytics records. This does not affect rules or conversions.</div>
              </div>
              <Form method="post">
                <input type="hidden" name="intent" value="clear-analytics" />
                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  disabled={isSubmitting}
                  onClick={(e) => {
                    if (!confirm("Are you sure you want to clear all analytics data?")) {
                      e.preventDefault();
                    }
                  }}
                >
                  {isSubmitting ? "Clearing..." : "Clear Analytics"}
                </button>
              </Form>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f9fafb", borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Clear Co-occurrence Data</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Remove all item co-occurrence analysis data. AI suggestions will need to be regenerated.</div>
              </div>
              <Form method="post">
                <input type="hidden" name="intent" value="clear-cooccurrence" />
                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  disabled={isSubmitting}
                  onClick={(e) => {
                    if (!confirm("Are you sure you want to clear all co-occurrence data?")) {
                      e.preventDefault();
                    }
                  }}
                >
                  {isSubmitting ? "Clearing..." : "Clear Co-occurrence"}
                </button>
              </Form>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f9fafb", borderRadius: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Clear Order History</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Remove all stored order history. Order analysis will start fresh on next sync.</div>
              </div>
              <Form method="post">
                <input type="hidden" name="intent" value="clear-order-history" />
                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  disabled={isSubmitting}
                  onClick={(e) => {
                    if (!confirm("Are you sure you want to clear all order history?")) {
                      e.preventDefault();
                    }
                  }}
                >
                  {isSubmitting ? "Clearing..." : "Clear History"}
                </button>
              </Form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
