import type { MetaFunction } from "@remix-run/node";
import { PublicLayout } from "../components/PublicLayout";
import styles from "./styles/privacy-policy.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Privacy Policy - Reverse Bundling" },
    { name: "description", content: "Privacy policy for Reverse Bundling - Automatic bundle conversion for Shopify stores" },
  ];
};

export default function PrivacyPolicy() {
  return (
    <PublicLayout>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.contentCard}>
            <div className={styles.header}>
              <h1 className={styles.title}>Privacy Policy</h1>
              <p className={styles.subtitle}>Reverse Bundling</p>
              <p className={styles.dateInfo}>
                Effective Date: {new Date().toLocaleDateString()} | Last Updated: {new Date().toLocaleDateString()}
              </p>
            </div>

            <div className={styles.content}>
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Introduction</h2>
                <p className={styles.paragraph}>
                  Reverse Bundling ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Shopify application.
                </p>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Information We Collect</h2>

                <h3 className={styles.subsectionTitle}>Shopify Store Data</h3>
                <p className={styles.paragraph}>When you install our app, we collect:</p>
                <ul className={styles.list}>
                  <li className={styles.listItem}>Store Information: Store name, domain, owner email, timezone</li>
                  <li className={styles.listItem}>Order Data: Order details, line items, SKUs, quantities (for bundle detection)</li>
                  <li className={styles.listItem}>Product Data: Product titles, variants, SKUs (for rule creation)</li>
                  <li className={styles.listItem}>Usage Analytics: Feature usage, page views, button clicks</li>
                </ul>

                <h3 className={styles.subsectionTitle}>Automatically Collected Information</h3>
                <ul className={styles.list}>
                  <li className={styles.listItem}>Log Data: IP addresses, browser type, timestamps, referring URLs</li>
                  <li className={styles.listItem}>Cookies: Session cookies for authentication (required for app functionality)</li>
                  <li className={styles.listItem}>Performance Data: API response times, error rates</li>
                </ul>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>How We Use Your Information</h2>
                <p className={styles.paragraph}>We use the collected information to:</p>
                <ul className={styles.list}>
                  <li className={styles.listItem}><strong>Provide Core Functionality:</strong> Detect bundle opportunities, create/manage bundling rules, generate cost savings reports, process order conversions, integrate with fulfillment providers</li>
                  <li className={styles.listItem}><strong>Improve Our Service:</strong> Analyze usage patterns, debug issues, optimize performance</li>
                  <li className={styles.listItem}><strong>Communication:</strong> Send service updates, notify about features, provide support</li>
                  <li className={styles.listItem}><strong>Compliance:</strong> Meet legal obligations, enforce terms, protect against fraud</li>
                </ul>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Data Storage and Security</h2>

                <h3 className={styles.subsectionTitle}>Storage</h3>
                <ul className={styles.list}>
                  <li className={styles.listItem}><strong>Database:</strong> Encrypted PostgreSQL database hosted on secure cloud infrastructure</li>
                  <li className={styles.listItem}><strong>Backups:</strong> Daily automated backups with 30-day retention</li>
                  <li className={styles.listItem}><strong>Location:</strong> Data stored in secure US data centers</li>
                </ul>

                <h3 className={styles.subsectionTitle}>Security Measures</h3>
                <div className={styles.checkList}>
                  <div className={styles.checkItem}>
                    <span className={styles.checkIcon}>✅</span>
                    <span>End-to-end encryption (TLS/SSL)</span>
                  </div>
                  <div className={styles.checkItem}>
                    <span className={styles.checkIcon}>✅</span>
                    <span>Encrypted database connections</span>
                  </div>
                  <div className={styles.checkItem}>
                    <span className={styles.checkIcon}>✅</span>
                    <span>Regular security audits</span>
                  </div>
                  <div className={styles.checkItem}>
                    <span className={styles.checkIcon}>✅</span>
                    <span>Access control and authentication</span>
                  </div>
                  <div className={styles.checkItem}>
                    <span className={styles.checkIcon}>✅</span>
                    <span>Secure API communication with Shopify</span>
                  </div>
                </div>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Data Sharing and Disclosure</h2>
                <div className={styles.highlightBox}>
                  <p className={styles.highlightText}>We DO NOT sell your data to third parties.</p>
                </div>
                <p className={styles.paragraph}>We may share your information only in these limited circumstances:</p>
                <ul className={styles.list}>
                  <li className={styles.listItem}><strong>With Your Consent:</strong> When you explicitly authorize us</li>
                  <li className={styles.listItem}><strong>Service Providers:</strong> Cloud hosting, error monitoring (aggregate, anonymized data only)</li>
                  <li className={styles.listItem}><strong>Legal Requirements:</strong> To comply with laws, respond to requests, protect rights</li>
                  <li className={styles.listItem}><strong>Business Transfers:</strong> In connection with mergers, acquisitions, or sales</li>
                </ul>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Your Rights</h2>
                <p className={styles.paragraph}>You have the right to:</p>
                <ul className={styles.list}>
                  <li className={styles.listItem}><strong>Access Your Data:</strong> Request a copy of all data we store</li>
                  <li className={styles.listItem}><strong>Correct Your Data:</strong> Update or correct inaccurate information</li>
                  <li className={styles.listItem}><strong>Delete Your Data:</strong> Request complete deletion (by uninstalling the app)</li>
                  <li className={styles.listItem}><strong>Export Your Data:</strong> Receive your data in a portable format</li>
                  <li className={styles.listItem}><strong>Opt-Out:</strong> Disable analytics, opt-out of marketing communications</li>
                </ul>
                <div className={styles.infoBox}>
                  <p className={styles.infoText}>
                    <strong>To exercise these rights:</strong> Email privacy@reversebundlepro.com
                  </p>
                </div>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>GDPR Compliance (EU Users)</h2>
                <p className={styles.paragraph}>If you are located in the European Economic Area (EEA), you have additional rights:</p>
                <ul className={styles.list}>
                  <li className={styles.listItem}><strong>Legal Basis:</strong> Contract performance and legitimate interests</li>
                  <li className={styles.listItem}><strong>Data Controller:</strong> Reverse Bundle Pro is the data controller</li>
                  <li className={styles.listItem}><strong>Right to Lodge Complaint:</strong> File complaints with local authorities</li>
                  <li className={styles.listItem}><strong>Data Transfers:</strong> EU-approved safeguards for international transfers</li>
                </ul>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>CCPA Compliance (California Users)</h2>
                <p className={styles.paragraph}>California residents have specific rights under CCPA:</p>
                <ul className={styles.list}>
                  <li className={styles.listItem}>Right to know what personal information we collect</li>
                  <li className={styles.listItem}>Right to know if we sell personal information (We don't!)</li>
                  <li className={styles.listItem}>Right to access, correct, and delete your information</li>
                  <li className={styles.listItem}>Right to non-discrimination for exercising your rights</li>
                </ul>
                <div className={styles.infoBox}>
                  <p className={styles.infoText}>
                    <strong>California Residents:</strong> Email privacy@reversebundlepro.com with "California Privacy Request"
                  </p>
                </div>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Data Retention</h2>
                <ul className={styles.list}>
                  <li className={styles.listItem}><strong>Active Stores:</strong> Data retained while app is installed</li>
                  <li className={styles.listItem}><strong>Uninstalled Stores:</strong> All data deleted within 30 days</li>
                  <li className={styles.listItem}><strong>Backup Data:</strong> Permanently deleted after 30-day retention</li>
                </ul>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Cookies and Tracking</h2>
                <h3 className={styles.subsectionTitle}>Required Cookies</h3>
                <ul className={styles.list}>
                  <li className={styles.listItem}><strong>Session Cookies:</strong> Essential for authentication (cannot be disabled)</li>
                  <li className={styles.listItem}><strong>Security Cookies:</strong> CSRF protection</li>
                </ul>

                <h3 className={styles.subsectionTitle}>Optional Cookies</h3>
                <ul className={styles.list}>
                  <li className={styles.listItem}><strong>Analytics Cookies:</strong> Track feature usage (can be disabled)</li>
                </ul>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Changes to This Privacy Policy</h2>
                <p className={styles.paragraph}>
                  We may update this Privacy Policy periodically. We will notify you of material changes by:
                </p>
                <ul className={styles.list}>
                  <li className={styles.listItem}>Posting the new policy on our website</li>
                  <li className={styles.listItem}>Sending email notification to store owners</li>
                  <li className={styles.listItem}>Showing in-app notifications</li>
                </ul>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Contact Us</h2>
                <div className={styles.contactBox}>
                  <div className={styles.contactItem}>
                    <span className={styles.contactLabel}>Email:</span>
                    privacy@reversebundling.com
                  </div>
                  <div className={styles.contactItem}>
                    <span className={styles.contactLabel}>Website:</span>
                    https://reversebundling.com
                  </div>
                  <div className={styles.contactItem}>
                    <span className={styles.contactLabel}>Response Time:</span>
                    We aim to respond within 48 hours
                  </div>
                </div>
              </section>

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Data Protection Officer</h2>
                <p className={styles.paragraph}>For GDPR-related inquiries:</p>
                <div className={styles.infoBox}>
                  <p className={styles.infoText}>
                    <strong>Email:</strong> dpo@reversebundling.com
                  </p>
                </div>
              </section>

              <div className={styles.footer}>
                <p className={styles.footerText}>
                  <strong>Reverse Bundling</strong> - Building trust through transparency and security.
                </p>
                <p className={styles.footerDate}>
                  Last Updated: October 14, 2025
                </p>
              </div>

              <div className={styles.acknowledgment}>
                <p className={styles.acknowledgmentText}>
                  <strong>Acknowledgment:</strong> By installing and using Reverse Bundling, you acknowledge that you have read and understood this Privacy Policy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
