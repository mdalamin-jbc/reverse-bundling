import type { MetaFunction } from "@remix-run/node";
import styles from "./styles/privacy-policy.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Privacy Policy - Reverse Bundle Pro" },
    { name: "description", content: "Enterprise-grade privacy policy for Reverse Bundle Pro - AI-powered fulfillment optimization with bank-level security" },
    { name: "keywords", content: "privacy policy, GDPR, CCPA, data protection, Shopify app privacy" },
    { property: "og:title", content: "Privacy Policy - Reverse Bundle Pro" },
    { property: "og:description", content: "Learn how Reverse Bundle Pro protects your data with enterprise-grade security and compliance" },
    { property: "og:type", content: "website" },
  ];
};

export default function PrivacyPolicy() {
  return (
    <div className={styles.privacyPolicy}>
      {/* Header Section */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Privacy Policy</h1>
          <h2 className={styles.subtitle}>Reverse Bundle Pro</h2>
          <p className={styles.meta}>
            Effective Date: October 14, 2025 | Last Updated: October 14, 2025
          </p>
        </div>
      </header>

      {/* Content */}
      <main className={styles.content}>
        <div className={styles.card}>
          <section className={styles.section} style={{ "--section-index": 0 } as React.CSSProperties}>
            <h2>Introduction</h2>
            <p>
              Reverse Bundle Pro ("we", "our", or "us") is committed to protecting your privacy with enterprise-grade security. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI-powered Shopify application.
            </p>
          </section>

          <section className={styles.section} style={{ "--section-index": 1 } as React.CSSProperties}>
            <h2>Information We Collect</h2>

            <h3>Shopify Store Data</h3>
            <p>When you install our app, we collect:</p>
            <ul className={styles.list}>
              <li><strong>Store Information:</strong> Store name, domain, owner email, timezone</li>
              <li><strong>Order Data:</strong> Order details, line items, SKUs, quantities (for bundle detection)</li>
              <li><strong>Product Data:</strong> Product titles, variants, SKUs (for rule creation)</li>
              <li><strong>Usage Analytics:</strong> Feature usage, page views, button clicks</li>
            </ul>

            <h3>Automatically Collected Information</h3>
            <ul className={styles.list}>
              <li><strong>Log Data:</strong> IP addresses, browser type, timestamps, referring URLs</li>
              <li><strong>Cookies:</strong> Session cookies for authentication (required for app functionality)</li>
              <li><strong>Performance Data:</strong> API response times, error rates</li>
            </ul>
          </section>

          <section className={styles.section} style={{ "--section-index": 2 } as React.CSSProperties}>
            <h2>How We Use Your Information</h2>
            <p>We use the collected information to:</p>
            <ul className={styles.list}>
              <li><strong>Provide Core Functionality:</strong> Detect bundle opportunities, create/manage bundling rules, generate cost savings reports, process order conversions</li>
              <li><strong>Improve Our Service:</strong> Analyze usage patterns, debug issues, optimize performance</li>
              <li><strong>Communication:</strong> Send service updates, notify about features, provide support</li>
              <li><strong>Compliance:</strong> Meet legal obligations, enforce terms, protect against fraud</li>
            </ul>
          </section>

          <section className={styles.section} style={{ "--section-index": 3 } as React.CSSProperties}>
            <h2>Data Storage and Security</h2>

            <h3>Storage</h3>
            <ul className={styles.list}>
              <li><strong>Database:</strong> Encrypted PostgreSQL database hosted on secure cloud infrastructure</li>
              <li><strong>Backups:</strong> Daily automated backups with 30-day retention</li>
              <li><strong>Location:</strong> Data stored in secure US data centers</li>
            </ul>

            <h3>Security Measures</h3>
            <div className={styles.highlight}>
              <p>✅ End-to-end encryption (TLS/SSL)<br/>
              ✅ Encrypted database connections<br/>
              ✅ Regular security audits<br/>
              ✅ Access control and authentication<br/>
              ✅ Secure API communication with Shopify</p>
            </div>
          </section>

          <section className={styles.section} style={{ "--section-index": 4 } as React.CSSProperties}>
            <h2>Data Sharing and Disclosure</h2>
            <div className={styles.info}>
              <p><strong>We DO NOT sell your data to third parties.</strong></p>
            </div>
            <p>We may share your information only in these limited circumstances:</p>
            <ul className={styles.list}>
              <li><strong>With Your Consent:</strong> When you explicitly authorize us</li>
              <li><strong>Service Providers:</strong> Cloud hosting, error monitoring (aggregate, anonymized data only)</li>
              <li><strong>Legal Requirements:</strong> To comply with laws, respond to requests, protect rights</li>
              <li><strong>Business Transfers:</strong> In connection with mergers, acquisitions, or sales</li>
            </ul>
          </section>

          <section className={styles.section} style={{ "--section-index": 5 } as React.CSSProperties}>
            <h2>Your Rights</h2>
            <p>You have the right to:</p>
            <ul className={styles.list}>
              <li><strong>Access Your Data:</strong> Request a copy of all data we store</li>
              <li><strong>Correct Your Data:</strong> Update or correct inaccurate information</li>
              <li><strong>Delete Your Data:</strong> Request complete deletion (by uninstalling the app)</li>
              <li><strong>Export Your Data:</strong> Receive your data in a portable format</li>
              <li><strong>Opt-Out:</strong> Disable analytics, opt-out of marketing communications</li>
            </ul>
            <div className={styles.highlight}>
              <p><strong>To exercise these rights:</strong> Email privacy@reversebundlepro.com</p>
            </div>
          </section>

          <section className={styles.section} style={{ "--section-index": 6 } as React.CSSProperties}>
            <h2>GDPR Compliance (EU Users)</h2>
            <p>If you are located in the European Economic Area (EEA), you have additional rights:</p>
            <ul className={styles.list}>
              <li><strong>Legal Basis:</strong> Contract performance and legitimate interests</li>
              <li><strong>Data Controller:</strong> Reverse Bundle Pro is the data controller</li>
              <li><strong>Right to Lodge Complaint:</strong> File complaints with local authorities</li>
              <li><strong>Data Transfers:</strong> EU-approved safeguards for international transfers</li>
            </ul>
          </section>

          <section className={styles.section} style={{ "--section-index": 7 } as React.CSSProperties}>
            <h2>CCPA Compliance (California Users)</h2>
            <p>California residents have specific rights under CCPA:</p>
            <ul className={styles.list}>
              <li>Right to know what personal information we collect</li>
              <li>Right to know if we sell personal information <em>(We don't!)</em></li>
              <li>Right to access, correct, and delete your information</li>
              <li>Right to non-discrimination for exercising your rights</li>
            </ul>
            <div className={styles.highlight}>
              <p><strong>California Residents:</strong> Email privacy@reversebundlepro.com with "California Privacy Request"</p>
            </div>
          </section>

          <section className={styles.section} style={{ "--section-index": 8 } as React.CSSProperties}>
            <h2>Data Retention</h2>
            <ul className={styles.list}>
              <li><strong>Active Stores:</strong> Data retained while app is installed</li>
              <li><strong>Uninstalled Stores:</strong> All data deleted within 30 days</li>
              <li><strong>Backup Data:</strong> Permanently deleted after 30-day retention</li>
            </ul>
          </section>

          <section className={styles.section} style={{ "--section-index": 9 } as React.CSSProperties}>
            <h2>Cookies and Tracking</h2>
            <h3>Required Cookies</h3>
            <ul className={styles.list}>
              <li><strong>Session Cookies:</strong> Essential for authentication (cannot be disabled)</li>
              <li><strong>Security Cookies:</strong> CSRF protection</li>
            </ul>

            <h3>Optional Cookies</h3>
            <ul className={styles.list}>
              <li><strong>Analytics Cookies:</strong> Track feature usage (can be disabled)</li>
            </ul>
          </section>

          <section className={styles.section} style={{ "--section-index": 10 } as React.CSSProperties}>
            <h2>Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy periodically. We will notify you of material changes by:
            </p>
            <ul className={styles.list}>
              <li>Posting the new policy on our website</li>
              <li>Sending email notification to store owners</li>
              <li>Showing in-app notifications</li>
            </ul>
          </section>

          <section className={styles.section} style={{ "--section-index": 11 } as React.CSSProperties}>
            <h2>Contact Us</h2>
            <div className={styles.contact}>
              <p><strong>Email:</strong> privacy@reversebundlepro.com</p>
              <p><strong>Website:</strong> https://reversebundlepro.com</p>
              <p><strong>Response Time:</strong> We aim to respond within 48 hours</p>
            </div>
          </section>

          <section className={styles.section} style={{ "--section-index": 12 } as React.CSSProperties}>
            <h2>Data Protection Officer</h2>
            <p>For GDPR-related inquiries:</p>
            <div className={styles.highlight}>
              <p><strong>Email:</strong> dpo@reversebundlepro.com</p>
            </div>
          </section>

          <footer className={styles.footer}>
            <p className={styles.brand}>Reverse Bundle Pro</p>
            <p>Building trust through transparency and security.</p>
            <p className={styles.date}>Last Updated: October 14, 2025</p>
          </footer>

          <div className={styles.acknowledgment}>
            <p>
              <strong>Acknowledgment:</strong> By installing and using Reverse Bundle Pro, you acknowledge that you have read and understood this Privacy Policy.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
