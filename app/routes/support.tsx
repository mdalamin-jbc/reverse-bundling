import type { MetaFunction } from "@remix-run/node";
import { PublicLayout } from "../components/PublicLayout";
import styles from "./styles/support.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Support - Reverse Bundling" },
    { name: "description", content: "Get help with Reverse Bundling - documentation, guides, and support resources" },
  ];
};

export default function Support() {
  return (
    <PublicLayout>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>How can we help you?</h1>
            <p className={styles.subtitle}>
              Find answers, get support, and learn how to make the most of Reverse Bundling.
            </p>
          </div>

          <div className={styles.grid}>
            {/* Getting Started */}
            <div className={styles.card}>
              <div className={styles.cardIcon}>📚</div>
              <h3 className={styles.cardTitle}>Getting Started</h3>
              <p className={styles.cardDesc}>
                Learn the basics of setting up and using Reverse Bundling in your Shopify store.
              </p>
              <a href="/documentation" className={styles.cardLink}>
                View documentation →
              </a>
            </div>

            {/* Troubleshooting */}
            <div className={styles.card}>
              <div className={styles.cardIcon}>🔧</div>
              <h3 className={styles.cardTitle}>Troubleshooting</h3>
              <p className={styles.cardDesc}>
                Common issues and their solutions. Find answers to frequently asked questions.
              </p>
              <a href="/help-center" className={styles.cardLink}>
                Browse help center →
              </a>
            </div>

            {/* Contact Support */}
            <div className={styles.card}>
              <div className={styles.cardIcon}>💬</div>
              <h3 className={styles.cardTitle}>Contact Support</h3>
              <p className={styles.cardDesc}>
                Need personalized help? Our support team is here to assist you.
              </p>
              <a href="/contact-us" className={styles.cardLink}>
                Get in touch →
              </a>
            </div>
          </div>

          <div className={styles.statusSection}>
            <h2 className={styles.statusTitle}>System Status</h2>
            <div className={styles.statusGrid}>
              <div className={styles.statusItem}>
                <div className={styles.statusValue}>99.9%</div>
                <div className={styles.statusLabel}>API Uptime</div>
              </div>
              <div className={styles.statusItem}>
                <div className={styles.statusValue}>99.8%</div>
                <div className={styles.statusLabel}>Database Uptime</div>
              </div>
              <div className={styles.statusItem}>
                <div className={styles.statusValue}>99.7%</div>
                <div className={styles.statusLabel}>Integration Uptime</div>
              </div>
            </div>
            <div className={styles.statusItem}>
              <a href="/system-status" className={styles.cardLink}>
                View detailed status page →
              </a>
            </div>
          </div>

          <div className={styles.contactSection}>
            <h2 className={styles.contactTitle}>Still need help?</h2>
            <p className={styles.contactDesc}>
              Can't find what you're looking for? Our support team is ready to help.
            </p>
            <div className={styles.contactButtons}>
              <a href="/contact-us" className={styles.contactButton + " " + styles.contactButtonPrimary}>
                Contact Support
              </a>
              <a href="/documentation" className={styles.contactButton + " " + styles.contactButtonSecondary}>
                Browse Documentation
              </a>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}