import type { MetaFunction } from "@remix-run/node";
import { PublicLayout } from "../components/PublicLayout";
import styles from "./styles/terms-of-service.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Terms of Service - Reverse Bundling" },
    { name: "description", content: "Terms of service and usage agreement for Reverse Bundling" },
  ];
};

export default function TermsOfService() {
  return (
    <PublicLayout>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>Terms of Service</h1>
            <p className={styles.subtitle}>Last updated: {new Date().toLocaleDateString()}</p>
          </div>

          <div className={styles.content}>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>1. Acceptance of Terms</h2>
              <p className={styles.paragraph}>
                By accessing and using Reverse Bundling ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>2. Description of Service</h2>
              <p className={styles.paragraph}>
                Reverse Bundling is a Shopify app that automatically converts individual product purchases into bundle sales based on predefined rules and conditions.
              </p>
              <ul className={styles.list}>
                <li className={styles.listItem}>Automatic order conversion and bundling</li>
                <li className={styles.listItem}>Integration with Shopify, ShipStation, FBA, and EDI systems</li>
                <li className={styles.listItem}>Analytics and reporting dashboard</li>
                <li className={styles.listItem}>Customer support and documentation</li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>3. User Accounts</h2>
              <p className={styles.paragraph}>
                To use Reverse Bundling, you must connect your Shopify store and create an account. You are responsible for:
              </p>
              <ul className={styles.list}>
                <li className={styles.listItem}>Maintaining the confidentiality of your account credentials</li>
                <li className={styles.listItem}>All activities that occur under your account</li>
                <li className={styles.listItem}>Notifying us immediately of any unauthorized use</li>
                <li className={styles.listItem}>Ensuring your Shopify store complies with Shopify's terms of service</li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>4. Payment Terms</h2>
              <p className={styles.paragraph}>
                Payment is processed through Shopify's billing system. Subscription fees are billed in advance on a monthly or annual basis.
              </p>
              <ul className={styles.list}>
                <li className={styles.listItem}>Fees are non-refundable except as required by law</li>
                <li className={styles.listItem}>Price changes will be communicated 30 days in advance</li>
                <li className={styles.listItem}>Late payments may result in service suspension</li>
                <li className={styles.listItem}>All fees are exclusive of applicable taxes</li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>5. Data Privacy and Security</h2>
              <p className={styles.paragraph}>
                We are committed to protecting your data and privacy. Our data handling practices include:
              </p>
              <ul className={styles.list}>
                <li className={styles.listItem}>Encryption of all data in transit and at rest</li>
                <li className={styles.listItem}>Compliance with GDPR, CCPA, and other privacy regulations</li>
                <li className={styles.listItem}>Limited data collection to only what's necessary for service provision</li>
                <li className={styles.listItem}>Regular security audits and penetration testing</li>
                <li className={styles.listItem}>Secure data deletion upon account termination</li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>6. Service Availability</h2>
              <p className={styles.paragraph}>
                We strive for high availability but cannot guarantee uninterrupted service. Our service level commitments include:
              </p>
              <ul className={styles.list}>
                <li className={styles.listItem}>99.5% uptime for core functionality</li>
                <li className={styles.listItem}>Scheduled maintenance windows communicated in advance</li>
                <li className={styles.listItem}>Emergency maintenance only when absolutely necessary</li>
                <li className={styles.listItem}>Status updates available at <a href="/system-status" className={styles.contactLink}>/system-status</a></li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>7. Prohibited Uses</h2>
              <p className={styles.paragraph}>You agree not to use the Service for:</p>
              <ul className={styles.list}>
                <li className={styles.listItem}>Violating any applicable laws or regulations</li>
                <li className={styles.listItem}>Infringing on intellectual property rights</li>
                <li className={styles.listItem}>Transmitting malicious code or viruses</li>
                <li className={styles.listItem}>Attempting to gain unauthorized access to our systems</li>
                <li className={styles.listItem}>Using the service for fraudulent or deceptive purposes</li>
                <li className={styles.listItem}>Reselling or redistributing the service without permission</li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>8. Intellectual Property</h2>
              <p className={styles.paragraph}>
                Reverse Bundling and its original content, features, and functionality are owned by us and are protected by copyright, trademark, and other intellectual property laws. You may not duplicate, copy, or reuse any portion of the service without express written permission.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>9. Termination</h2>
              <p className={styles.paragraph}>Either party may terminate this agreement at any time. Upon termination:</p>
              <ul className={styles.list}>
                <li className={styles.listItem}>Your access to the service will be immediately revoked</li>
                <li className={styles.listItem}>We will delete your data within 30 days unless legally required to retain it</li>
                <li className={styles.listItem}>Outstanding payments remain due</li>
                <li className={styles.listItem}>These terms survive termination</li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>10. Limitation of Liability</h2>
              <p className={styles.paragraph}>
                In no event shall Reverse Bundling be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the service.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>11. Indemnification</h2>
              <p className={styles.paragraph}>
                You agree to defend, indemnify, and hold harmless Reverse Bundling from and against any claims, actions, or demands arising from your use of the service or violation of these terms.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>12. Governing Law</h2>
              <p className={styles.paragraph}>
                These terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Reverse Bundling operates, without regard to its conflict of law provisions.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>13. Changes to Terms</h2>
              <p className={styles.paragraph}>
                We reserve the right to modify these terms at any time. We will notify users of material changes via email or through the service. Continued use of the service after changes constitutes acceptance of the new terms.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>14. Contact Information</h2>
              <p className={styles.paragraph}>
                If you have any questions about these Terms of Service, please contact us at{" "}
                <a href="/contact-us" className={styles.contactLink}>support@reversebundling.com</a>.
              </p>
            </section>
          </div>

          <div className={styles.contactSection}>
            <h2 className={styles.contactTitle}>Questions About These Terms?</h2>
            <p className={styles.contactText}>
              If you have any questions about these Terms of Service or need clarification on any section, please don't hesitate to <a href="/contact-us" className={styles.contactLink}>contact our support team</a>.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}