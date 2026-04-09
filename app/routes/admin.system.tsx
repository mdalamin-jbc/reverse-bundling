import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdmin(request);

  const start = Date.now();

  // Database health
  let dbStatus = "healthy";
  let dbLatency = 0;
  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - dbStart;
    if (dbLatency > 500) dbStatus = "degraded";
  } catch {
    dbStatus = "down";
  }

  // Table sizes
  const [
    sessionCount, ruleCount, conversionCount,
    settingsCount, orderHistoryCount, cooccurrenceCount,
    suggestionCount, analyticsCount, fulfillmentCount,
  ] = await Promise.all([
    db.session.count(),
    db.bundleRule.count(),
    db.orderConversion.count(),
    db.appSettings.count(),
    db.orderHistory.count(),
    db.itemCooccurrence.count(),
    db.bundleSuggestion.count(),
    db.bundleAnalytics.count(),
    db.fulfillmentProvider.count(),
  ]);

  // Memory usage (Node.js)
  const memUsage = process.memoryUsage();

  // Uptime
  const uptime = process.uptime();

  const totalLatency = Date.now() - start;

  return json({
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      latency: dbLatency,
      tables: {
        sessions: sessionCount,
        bundle_rules: ruleCount,
        order_conversions: conversionCount,
        app_settings: settingsCount,
        order_history: orderHistoryCount,
        item_cooccurrence: cooccurrenceCount,
        bundle_suggestions: suggestionCount,
        bundle_analytics: analyticsCount,
        fulfillment_providers: fulfillmentCount,
      },
    },
    server: {
      uptime,
      nodeVersion: process.version,
      env: process.env.NODE_ENV || "production",
      totalLatency,
    },
    memory: {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
    },
  });
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

export default function AdminSystem() {
  const { timestamp, database, server, memory } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  const heapUsagePercent = (memory.heapUsed / memory.heapTotal) * 100;
  const healthColor = (status: string) =>
    status === "healthy" ? styles.healthGreen : status === "degraded" ? styles.healthYellow : styles.healthRed;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          Last checked: {new Date(timestamp).toLocaleString()}
        </span>
        <button
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => revalidator.revalidate()}
          disabled={revalidator.state === "loading"}
        >
          {revalidator.state === "loading" ? "Refreshing..." : "🔄 Refresh"}
        </button>
      </div>

      {/* Health Overview */}
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCardGreen}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Database</span>
            <span className={`${styles.healthDot} ${healthColor(database.status)}`} />
          </div>
          <div className={styles.statValue} style={{ fontSize: 20 }}>
            {database.status.charAt(0).toUpperCase() + database.status.slice(1)}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{database.latency}ms latency</div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardBlue}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Server Uptime</span>
            <span className={styles.statIcon}>⏱️</span>
          </div>
          <div className={styles.statValue} style={{ fontSize: 20 }}>{formatUptime(server.uptime)}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Node {server.nodeVersion}</div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardPurple}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Heap Usage</span>
            <span className={styles.statIcon}>🧠</span>
          </div>
          <div className={styles.statValue} style={{ fontSize: 20 }}>{formatBytes(memory.heapUsed)}</div>
          <div className={styles.progressBar}>
            <div
              className={`${styles.progressFill} ${heapUsagePercent > 85 ? styles.progressRed : heapUsagePercent > 70 ? styles.progressYellow : styles.progressGreen}`}
              style={{ width: `${heapUsagePercent}%` }}
            />
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{heapUsagePercent.toFixed(0)}% of {formatBytes(memory.heapTotal)}</div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardOrange}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Page Load</span>
            <span className={styles.statIcon}>⚡</span>
          </div>
          <div className={styles.statValue} style={{ fontSize: 20 }}>{server.totalLatency}ms</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Total response time</div>
        </div>
      </div>

      <div className={styles.twoCol}>
        {/* Memory Details */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>🧠 Memory Usage</span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>RSS (Total)</span>
              <span className={styles.detailValue}>{formatBytes(memory.rss)}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Heap Used</span>
              <span className={styles.detailValue}>{formatBytes(memory.heapUsed)}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Heap Total</span>
              <span className={styles.detailValue}>{formatBytes(memory.heapTotal)}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>External</span>
              <span className={styles.detailValue}>{formatBytes(memory.external)}</span>
            </div>
          </div>
        </div>

        {/* Server Info */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>🖥️ Server Info</span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Node.js</span>
              <span className={styles.detailValue}>{server.nodeVersion}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Environment</span>
              <span className={`${styles.badge} ${server.env === "production" ? styles.badgeRed : styles.badgeGreen}`}>
                {server.env}
              </span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Uptime</span>
              <span className={styles.detailValue}>{formatUptime(server.uptime)}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>DB Latency</span>
              <span className={styles.detailValue}>{database.latency}ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* Database Tables */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>🗃️ Database Tables</span>
          <span className={`${styles.badge} ${styles.badgeBlue}`}>
            {Object.values(database.tables).reduce((a, b) => a + b, 0).toLocaleString()} total rows
          </span>
        </div>
        <div className={styles.cardBodyNoPad}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Table</th>
                <th>Rows</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(database.tables).map(([table, count]) => (
                <tr key={table}>
                  <td style={{ fontWeight: 500 }}>
                    <code style={{ fontSize: 13, background: "#f3f4f6", padding: "2px 8px", borderRadius: 4 }}>{table}</code>
                  </td>
                  <td style={{ fontWeight: 600 }}>{(count as number).toLocaleString()}</td>
                  <td>
                    <span className={`${styles.badge} ${styles.badgeGreen}`}>OK</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
