import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { PublicLayout } from "../components/PublicLayout";
import db from "../db.server";
import styles from "./styles/system-status.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "System Status - Reverse Bundling" },
    { name: "description", content: "Live status of Reverse Bundling services" },
  ];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const start = Date.now();
  let dbHealthy = false;
  let dbLatency = 0;

  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - dbStart;
    dbHealthy = true;
  } catch {
    dbHealthy = false;
  }

  const apiLatency = Date.now() - start;
  const uptimeSeconds = process.uptime();
  const uptimeHours = (uptimeSeconds / 3600).toFixed(1);

  const services = [
    {
      name: "Reverse Bundling API",
      status: "operational" as const,
      responseTime: `${apiLatency}ms`,
      detail: `Node ${process.version} · uptime ${uptimeHours}h`,
    },
    {
      name: "Database (PostgreSQL)",
      status: dbHealthy ? ("operational" as const) : ("down" as const),
      responseTime: `${dbLatency}ms`,
      detail: dbHealthy ? "Connected" : "Connection failed",
    },
    {
      name: "Shopify Integration",
      status: dbHealthy ? ("operational" as const) : ("degraded" as const),
      responseTime: "—",
      detail: "OAuth & webhooks via Shopify API",
    },
  ];

  const overall = dbHealthy ? "operational" : "degraded";

  return json({
    services,
    overall,
    checkedAt: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
};

export default function SystemStatus() {
  const { services, overall, checkedAt, version } = useLoaderData<typeof loader>();

  const overallLabel =
    overall === "operational" ? "All Systems Operational" : "Degraded Performance";
  const overallDesc =
    overall === "operational"
      ? "Core services are running normally"
      : "One or more services need attention";

  return (
    <PublicLayout>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>System Status</h1>
            <p className={styles.subtitle}>
              Live status from our production server. Refreshes on each page load.
            </p>
          </div>

          <div className={styles.statusOverview}>
            <div className={styles.overallStatus}>
              <div
                className={styles.statusIndicator}
                style={{ background: overall === "operational" ? "#22c55e" : "#f59e0b" }}
              />
              <div>
                <div className={styles.statusText}>{overallLabel}</div>
                <div className={styles.statusDescription}>{overallDesc}</div>
              </div>
            </div>
            <div className={styles.lastUpdated}>
              Last checked: {new Date(checkedAt).toLocaleString()} · v{version}
            </div>
          </div>

          <div className={styles.servicesGrid}>
            {services.map((service) => (
              <div key={service.name} className={styles.serviceCard}>
                <div className={styles.serviceHeader}>
                  <h3 className={styles.serviceName}>{service.name}</h3>
                  <div
                    className={
                      styles.serviceStatus +
                      " " +
                      (service.status === "operational"
                        ? styles.statusOperational
                        : service.status === "down"
                          ? styles.statusOutage
                          : styles.statusDegraded)
                    }
                  >
                    <div
                      className={
                        styles.statusIndicatorSmall +
                        " " +
                        (service.status === "operational" ? "operational" : "degraded")
                      }
                    />
                    <span>
                      {service.status === "operational"
                        ? "Operational"
                        : service.status === "down"
                          ? "Down"
                          : "Degraded"}
                    </span>
                  </div>
                </div>
                <p className={styles.serviceDescription}>{service.detail}</p>
                <div className={styles.serviceMetrics}>
                  <div className={styles.metric}>
                    <span className={styles.metricValue}>{service.responseTime}</span>
                    <span className={styles.metricLabel}>Response</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.incidentsSection}>
            <h2 className={styles.sectionTitle}>Health endpoint</h2>
            <p style={{ color: "#4a5568", fontSize: 14 }}>
              Monitoring tools can poll{" "}
              <a href="/health" style={{ color: "#6366f1" }}>
                /health
              </a>{" "}
              for JSON status.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
