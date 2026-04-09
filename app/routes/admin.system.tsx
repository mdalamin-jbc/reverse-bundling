import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdmin(request);

  const startTime = Date.now();

  // DB health check
  let dbHealthy = true;
  let dbLatency = 0;
  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - dbStart;
  } catch {
    dbHealthy = false;
  }

  // Table row counts
  const [
    sessions, bundleRules, bundleAnalytics,
    orderConversions, fulfillmentProviders, appSettings,
    orderHistory, itemCooccurrences, bundleSuggestions,
  ] = await Promise.all([
    db.session.count(),
    db.bundleRule.count(),
    db.bundleAnalytics.count(),
    db.orderConversion.count(),
    db.fulfillmentProvider.count(),
    db.appSettings.count(),
    db.orderHistory.count(),
    db.itemCooccurrence.count(),
    db.bundleSuggestion.count(),
  ]);

  const totalRows = sessions + bundleRules + bundleAnalytics + orderConversions +
    fulfillmentProviders + appSettings + orderHistory + itemCooccurrences + bundleSuggestions;

  // Memory usage
  const mem = process.memoryUsage();
  const uptime = process.uptime();

  const loaderTime = Date.now() - startTime;

  return json({
    dbHealthy,
    dbLatency,
    loaderTime,
    tables: [
      { name: "Session", rows: sessions, icon: "🔑" },
      { name: "BundleRule", rows: bundleRules, icon: "📋" },
      { name: "BundleAnalytics", rows: bundleAnalytics, icon: "📈" },
      { name: "OrderConversion", rows: orderConversions, icon: "🔄" },
      { name: "FulfillmentProvider", rows: fulfillmentProviders, icon: "📦" },
      { name: "AppSettings", rows: appSettings, icon: "⚙️" },
      { name: "OrderHistory", rows: orderHistory, icon: "📜" },
      { name: "ItemCooccurrence", rows: itemCooccurrences, icon: "🔗" },
      { name: "BundleSuggestion", rows: bundleSuggestions, icon: "🤖" },
    ],
    totalRows,
    memory: {
      rss: (mem.rss / 1024 / 1024).toFixed(1),
      heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(1),
      heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(1),
      external: (mem.external / 1024 / 1024).toFixed(1),
      heapPercent: ((mem.heapUsed / mem.heapTotal) * 100).toFixed(0),
    },
    uptime: {
      days: Math.floor(uptime / 86400),
      hours: Math.floor((uptime % 86400) / 3600),
      minutes: Math.floor((uptime % 3600) / 60),
      seconds: Math.floor(uptime % 60),
      raw: uptime,
    },
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    env: process.env.NODE_ENV || "development",
    checkedAt: new Date().toISOString(),
  });
};

export default function AdminSystem() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  return (
    <>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderRow}>
          <div>
            <h2 className={styles.pageHeaderTitle}>System Health</h2>
            <p className={styles.pageHeaderSub}>
              Last checked: {new Date(data.checkedAt).toLocaleString()} · Loaded in {data.loaderTime}ms
            </p>
          </div>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => revalidator.revalidate()}
            disabled={revalidator.state === "loading"}
          >
            {revalidator.state === "loading" ? "⏳ Refreshing..." : "🔄 Refresh"}
          </button>
        </div>
      </div>

      {/* Health Status Cards */}
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${data.dbHealthy ? styles.statCardGreen : styles.statCardRed}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Database</span>
            <div className={`${styles.healthDot} ${data.dbHealthy ? styles.healthGreen : styles.healthRed}`} />
          </div>
          <div className={styles.statValue} style={{ fontSize: 20 }}>{data.dbHealthy ? "Healthy" : "Unhealthy"}</div>
          <div className={styles.statChange}>
            <span className={data.dbLatency < 100 ? styles.statUp : styles.statDown}>
              {data.dbLatency}ms latency
            </span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardBlue}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Memory (Heap)</span>
            <div className={`${styles.statIcon} ${styles.statIconBlue}`}>🧠</div>
          </div>
          <div className={styles.statValue} style={{ fontSize: 20 }}>
            {data.memory.heapUsed} / {data.memory.heapTotal} MB
          </div>
          <div className={styles.statChange}>
            <span className={parseInt(data.memory.heapPercent) < 80 ? styles.statUp : styles.statDown}>
              {data.memory.heapPercent}% used · RSS {data.memory.rss} MB
            </span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardPurple}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Uptime</span>
            <div className={`${styles.statIcon} ${styles.statIconPurple}`}>⏱️</div>
          </div>
          <div className={styles.statValue} style={{ fontSize: 20 }}>
            {data.uptime.days}d {data.uptime.hours}h {data.uptime.minutes}m
          </div>
          <div className={styles.statChange}>
            <span className={styles.statUp}>PID {data.pid}</span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.statCardOrange}`}>
          <div className={styles.statHeader}>
            <span className={styles.statLabel}>Total Records</span>
            <div className={`${styles.statIcon} ${styles.statIconOrange}`}>💾</div>
          </div>
          <div className={styles.statValue} style={{ fontSize: 20 }}>{data.totalRows.toLocaleString()}</div>
          <div className={styles.statChange}>
            <span className={styles.statNeutral}>Across 9 tables</span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Database Tables */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>💾 Database Tables</span>
            <span className={`${styles.badge} ${styles.badgeBlue}`}>{data.totalRows.toLocaleString()} rows</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th></th>
                  <th>Table</th>
                  <th style={{ textAlign: "right" }}>Rows</th>
                  <th style={{ textAlign: "right" }}>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {data.tables
                  .sort((a, b) => b.rows - a.rows)
                  .map((t) => (
                    <tr key={t.name}>
                      <td style={{ width: 30, textAlign: "center" }}>{t.icon}</td>
                      <td style={{ fontWeight: 600 }}>{t.name}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                        {t.rows.toLocaleString()}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                          <div style={{ width: 60, height: 6, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              borderRadius: 3,
                              background: "#6366f1",
                              width: `${data.totalRows > 0 ? (t.rows / data.totalRows * 100) : 0}%`,
                            }} />
                          </div>
                          <span style={{ fontSize: 12, color: "#6b7280", width: 36, textAlign: "right" }}>
                            {data.totalRows > 0 ? (t.rows / data.totalRows * 100).toFixed(0) : 0}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Runtime Info */}
        <div>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>🖥️ Runtime Environment</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.detailGrid}>
                <div className={styles.detailLabel}>Node.js</div>
                <div className={styles.detailValue}><span className={styles.codeInline}>{data.nodeVersion}</span></div>
                <div className={styles.detailLabel}>Platform</div>
                <div className={styles.detailValue}>{data.platform} / {data.arch}</div>
                <div className={styles.detailLabel}>Environment</div>
                <div className={styles.detailValue}>
                  <span className={`${styles.badge} ${data.env === "production" ? styles.badgeGreen : styles.badgeYellow}`}>
                    {data.env}
                  </span>
                </div>
                <div className={styles.detailLabel}>Process ID</div>
                <div className={styles.detailValue}><span className={styles.codeInline}>{data.pid}</span></div>
                <div className={styles.detailLabel}>RSS Memory</div>
                <div className={styles.detailValue}>{data.memory.rss} MB</div>
                <div className={styles.detailLabel}>External Memory</div>
                <div className={styles.detailValue}>{data.memory.external} MB</div>
              </div>
            </div>
          </div>

          {/* Memory Breakdown */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>🧠 Memory Breakdown</span>
            </div>
            <div className={styles.cardBody}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "#6b7280" }}>Heap Usage</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{data.memory.heapPercent}%</span>
                </div>
                <div className={styles.progressBar}>
                  <div
                    className={`${styles.progressFill} ${parseInt(data.memory.heapPercent) < 70 ? styles.progressGreen : parseInt(data.memory.heapPercent) < 90 ? styles.progressYellow : styles.progressRed}`}
                    style={{ width: `${data.memory.heapPercent}%` }}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
                <div>
                  <span style={{ color: "#6b7280" }}>Heap Used:</span>{" "}
                  <strong>{data.memory.heapUsed} MB</strong>
                </div>
                <div>
                  <span style={{ color: "#6b7280" }}>Heap Total:</span>{" "}
                  <strong>{data.memory.heapTotal} MB</strong>
                </div>
                <div>
                  <span style={{ color: "#6b7280" }}>RSS:</span>{" "}
                  <strong>{data.memory.rss} MB</strong>
                </div>
                <div>
                  <span style={{ color: "#6b7280" }}>External:</span>{" "}
                  <strong>{data.memory.external} MB</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
