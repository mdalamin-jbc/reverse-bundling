import type { MetaFunction } from "@remix-run/node";
import styles from "./styles/integrations.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Integrations - Reverse Bundling" },
    { name: "description", content: "Connect Reverse Bundling with your favorite tools and platforms" },
  ];
};

export default function Integrations() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Powerful Integrations</h1>
            <p className={styles.heroSubtitle}>
              Connect Reverse Bundling with your existing tools and automate your entire bundling workflow.
            </p>
          </div>
        </section>

        <div className={styles.integrationsGrid}>
          {/* Shopify */}
          <div className={styles.integrationCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIcon}>
                <svg className={styles.icon} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div>
                <h3 className={styles.cardTitle}>Shopify</h3>
                <span className={styles.cardSubtitle}>Native Integration</span>
              </div>
            </div>
            <p className={styles.cardDescription}>
              Seamless integration with Shopify stores. Automatically sync products, orders, and inventory.
            </p>
            <div className={styles.tagsGrid}>
              <span className={styles.tag}>Products</span>
              <span className={styles.tag}>Orders</span>
              <span className={styles.tag}>Inventory</span>
            </div>
          </div>

          {/* ShipStation */}
          <div className={styles.integrationCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIcon}>
                <svg className={styles.icon} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div>
                <h3 className={styles.cardTitle}>ShipStation</h3>
                <span className={styles.cardSubtitle}>Shipping Integration</span>
              </div>
            </div>
            <p className={styles.cardDescription}>
              Automate order fulfillment and shipping workflows. Sync tracking numbers and order status.
            </p>
            <div className={styles.tagsGrid}>
              <span className={styles.tag}>Fulfillment</span>
              <span className={styles.tag}>Tracking</span>
              <span className={styles.tag}>Automation</span>
            </div>
          </div>

          {/* FBA */}
          <div className={styles.integrationCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIcon}>
                <svg className={styles.icon} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                </svg>
              </div>
              <div>
                <h3 className={styles.cardTitle}>Fulfillment by Amazon</h3>
                <span className={styles.cardSubtitle}>FBA Integration</span>
              </div>
            </div>
            <p className={styles.cardDescription}>
              Connect with Amazon's fulfillment network for seamless FBA order processing and inventory sync.
            </p>
            <div className={styles.tagsGrid}>
              <span className={styles.tag}>FBA</span>
              <span className={styles.tag}>Inventory</span>
              <span className={styles.tag}>Orders</span>
            </div>
          </div>

          {/* EDI Systems */}
          <div className={styles.integrationCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIcon}>
                <svg className={styles.icon} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-4h5v4zm0-6H7V7h5v4zm7 6h-5v-4h5v4zm0-6h-5V7h5v4z"/>
                </svg>
              </div>
              <div>
                <h3 className={styles.cardTitle}>EDI Systems</h3>
                <span className={styles.cardSubtitle}>Enterprise Integration</span>
              </div>
            </div>
            <p className={styles.cardDescription}>
              Connect with enterprise EDI systems for automated B2B order processing and inventory management.
            </p>
            <div className={styles.tagsGrid}>
              <span className={styles.tag}>EDI</span>
              <span className={styles.tag}>B2B</span>
              <span className={styles.tag}>Automation</span>
            </div>
          </div>

          {/* Slack */}
          <div className={styles.integrationCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIcon}>
                <svg className={styles.icon} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.194 14.644c0 1.16-.943 2.107-2.103 2.107a2.11 2.11 0 0 1-2.104-2.107 2.11 2.11 0 0 1 2.104-2.106c.15 0 .29.027.43.067v2.046a1.68 1.68 0 0 0-.43-.067zm0 0"/>
                </svg>
              </div>
              <div>
                <h3 className={styles.cardTitle}>Slack</h3>
                <span className={styles.cardSubtitle}>Notifications</span>
              </div>
            </div>
            <p className={styles.cardDescription}>
              Get real-time notifications about bundle performance, order conversions, and system alerts.
            </p>
            <div className={styles.tagsGrid}>
              <span className={styles.tag}>Notifications</span>
              <span className={styles.tag}>Alerts</span>
              <span className={styles.tag}>Real-time</span>
            </div>
          </div>

          {/* Zapier */}
          <div className={styles.integrationCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIcon}>
                <svg className={styles.icon} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div>
                <h3 className={styles.cardTitle}>Zapier</h3>
                <span className={styles.cardSubtitle}>Automation</span>
              </div>
            </div>
            <p className={styles.cardDescription}>
              Connect with 3,000+ apps through Zapier. Automate workflows and integrate with your favorite tools.
            </p>
            <div className={styles.tagsGrid}>
              <span className={styles.tag}>Automation</span>
              <span className={styles.tag}>Workflows</span>
              <span className={styles.tag}>3,000+ Apps</span>
            </div>
          </div>
        </div>

        <div className={styles.ctaSection}>
          <h2 className={styles.ctaTitle}>Need a Custom Integration?</h2>
          <p className={styles.ctaSubtitle}>
            Don't see your platform listed? Our development team can create custom integrations
            tailored to your specific business needs.
          </p>
          <div className={styles.ctaButtons}>
            <a href="/contact-us" className={`${styles.ctaButton} ${styles.primaryButton}`}>
              Request Integration
            </a>
            <a href="/documentation" className={`${styles.ctaButton} ${styles.secondaryButton}`}>
              View API Docs
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}