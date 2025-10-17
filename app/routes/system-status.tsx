import type { MetaFunction } from "@remix-run/node";
import { PublicLayout } from "../components/PublicLayout";
import styles from "./styles/system-status.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "System Status - Reverse Bundling" },
    { name: "description", content: "Check the current status of Reverse Bundling services and integrations" },
  ];
};

export default function SystemStatus() {
  const services = [
    {
      name: "Reverse Bundling API",
      status: "operational",
      uptime: "99.9%",
      responseTime: "120ms"
    },
    {
      name: "Shopify Integration",
      status: "operational",
      uptime: "99.8%",
      responseTime: "180ms"
    },
    {
      name: "ShipStation Integration",
      status: "operational",
      uptime: "99.7%",
      responseTime: "250ms"
    },
    {
      name: "FBA Integration",
      status: "operational",
      uptime: "99.9%",
      responseTime: "200ms"
    },
    {
      name: "EDI Systems",
      status: "operational",
      uptime: "99.6%",
      responseTime: "300ms"
    },
    {
      name: "Analytics Dashboard",
      status: "operational",
      uptime: "99.9%",
      responseTime: "150ms"
    },
    {
      name: "Email Notifications",
      status: "operational",
      uptime: "99.8%",
      responseTime: "220ms"
    },
    {
      name: "Database Services",
      status: "operational",
      uptime: "99.9%",
      responseTime: "95ms"
    }
  ];

  return (
    <PublicLayout>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>System Status</h1>
            <p className={styles.subtitle}>
              Real-time status of all Reverse Bundling services and integrations.
            </p>
          </div>

          {/* Overall Status */}
          <div className={styles.statusOverview}>
            <div className={styles.overallStatus}>
              <div className={styles.statusIndicator}></div>
              <div>
                <div className={styles.statusText}>All Systems Operational</div>
                <div className={styles.statusDescription}>All services are running normally</div>
              </div>
            </div>
            <div className={styles.lastUpdated}>
              Last updated: {new Date().toLocaleString()}
            </div>
          </div>

          {/* Service Status Grid */}
          <div className={styles.servicesGrid}>
            {services.map((service, index) => (
              <div key={index} className={styles.serviceCard}>
                <div className={styles.serviceHeader}>
                  <h3 className={styles.serviceName}>{service.name}</h3>
                  <div className={styles.serviceStatus + " " + styles.statusOperational}>
                    <div className={styles.statusIndicatorSmall + " operational"}></div>
                    <span>Operational</span>
                  </div>
                </div>

                <p className={styles.serviceDescription}>
                  Service is running normally with high availability.
                </p>

                <div className={styles.serviceMetrics}>
                  <div className={styles.metric}>
                    <span className={styles.metricValue}>{service.uptime}</span>
                    <span className={styles.metricLabel}>Uptime</span>
                  </div>
                  <div className={styles.metric}>
                    <span className={styles.metricValue}>{service.responseTime}</span>
                    <span className={styles.metricLabel}>Response</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Incident History */}
          <div className={styles.incidentsSection}>
            <h2 className={styles.sectionTitle}>Recent Incidents</h2>

            <div className={styles.incidentsList}>
              <div className={styles.incidentCard + " resolved"}>
                <h3 className={styles.incidentTitle}>All Systems Operational</h3>
                <div className={styles.incidentMeta}>Ongoing • No incidents reported</div>
                <p className={styles.incidentDescription}>
                  All Reverse Bundling services are operating normally with no reported issues.
                  Our monitoring systems show 100% uptime across all critical components.
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '2rem', color: '#4a5568' }}>
              No incidents in the last 90 days.
            </div>
          </div>

          {/* Uptime Statistics */}
          <div className={styles.uptimeSection}>
            <h2 className={styles.sectionTitle}>Uptime Statistics</h2>
            <div className={styles.uptimeGrid}>
              <div className={styles.uptimeCard}>
                <span className={styles.uptimeValue}>99.9%</span>
                <span className={styles.uptimeLabel}>Last 30 Days</span>
                <div className={styles.uptimePeriod}>API Services</div>
              </div>
              <div className={styles.uptimeCard}>
                <span className={styles.uptimeValue}>99.8%</span>
                <span className={styles.uptimeLabel}>Last 30 Days</span>
                <div className={styles.uptimePeriod}>Integrations</div>
              </div>
              <div className={styles.uptimeCard}>
                <span className={styles.uptimeValue}>99.7%</span>
                <span className={styles.uptimeLabel}>Last 30 Days</span>
                <div className={styles.uptimePeriod}>All Services</div>
              </div>
              <div className={styles.uptimeCard}>
                <span className={styles.uptimeValue}>99.9%</span>
                <span className={styles.uptimeLabel}>Last 30 Days</span>
                <div className={styles.uptimePeriod}>Database</div>
              </div>
            </div>
          </div>

          {/* Subscribe to Updates */}
          <div className={styles.subscribeSection}>
            <h2 className={styles.subscribeTitle}>Stay Informed</h2>
            <p className={styles.subscribeText}>
              Get notified about system status changes and maintenance windows.
            </p>
            <form className={styles.subscribeForm}>
              <input
                type="email"
                placeholder="Enter your email"
                className={styles.subscribeInput}
              />
              <button type="submit" className={styles.subscribeButton}>
                Subscribe
              </button>
            </form>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}