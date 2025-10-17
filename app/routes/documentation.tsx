import type { MetaFunction } from "@remix-run/node";
import { PublicLayout } from "../components/PublicLayout";
import styles from "./styles/documentation.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Documentation - Reverse Bundling" },
    { name: "description", content: "Complete guide to using Reverse Bundling - setup, configuration, and best practices" },
  ];
};

export default function Documentation() {
  return (
    <PublicLayout>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>Documentation</h1>
            <p className={styles.subtitle}>
              Everything you need to know about setting up and using Reverse Bundling effectively.
            </p>
          </div>

          <div className={styles.contentGrid}>
            {/* Sidebar Navigation */}
            <div className={styles.sidebar}>
              <h3 className={styles.sidebarTitle}>Contents</h3>
              <nav>
                <a href="#getting-started" className={styles.sidebarLink}>Getting Started</a>
                <a href="#bundle-creation" className={styles.sidebarLink}>Bundle Creation</a>
                <a href="#order-conversion" className={styles.sidebarLink}>Order Conversion</a>
                <a href="#fulfillment" className={styles.sidebarLink}>Fulfillment</a>
                <a href="#analytics" className={styles.sidebarLink}>Analytics</a>
                <a href="#api" className={styles.sidebarLink}>API Reference</a>
                <a href="#troubleshooting" className={styles.sidebarLink}>Troubleshooting</a>
              </nav>
            </div>

            {/* Main Content */}
            <div className={styles.mainContent}>
              {/* Getting Started */}
              <section id="getting-started" className={styles.section}>
                <h2 className={styles.sectionTitle}>Getting Started</h2>
                <div className={styles.prose}>
                  <h3>Installation</h3>
                  <p>Install Reverse Bundling from the Shopify App Store and follow the setup wizard.</p>

                  <h3>Initial Configuration</h3>
                  <ol>
                    <li>Connect your Shopify store</li>
                    <li>Configure your bundle rules</li>
                    <li>Set up fulfillment integrations</li>
                    <li>Test with a sample order</li>
                  </ol>

                  <h3>Quick Start Guide</h3>
                  <p>Our 5-minute setup guide will get you bundling orders in no time.</p>
                </div>
              </section>

              {/* Bundle Creation */}
              <section id="bundle-creation" className={styles.section}>
                <h2 className={styles.sectionTitle}>Bundle Creation</h2>
                <div className={styles.prose}>
                  <h3>Creating Your First Bundle</h3>
                  <p>Bundles are collections of products that are sold together at a special price.</p>

                  <h4>Step 1: Define Bundle Items</h4>
                  <p>Select the individual products that make up your bundle.</p>

                  <h4>Step 2: Set Pricing Strategy</h4>
                  <p>Choose from fixed price, percentage discount, or dynamic pricing.</p>

                  <h4>Step 3: Configure Rules</h4>
                  <p>Set conditions for when the bundle should be applied automatically.</p>
                </div>
              </section>

              {/* Order Conversion */}
              <section id="order-conversion" className={styles.section}>
                <h2 className={styles.sectionTitle}>Order Conversion</h2>
                <div className={styles.prose}>
                  <h3>How Automatic Conversion Works</h3>
                  <p>Reverse Bundling automatically detects when customers purchase individual items that form a bundle.</p>

                  <h4>Conversion Process</h4>
                  <ol>
                    <li>Order is received from Shopify</li>
                    <li>Items are analyzed against bundle rules</li>
                    <li>Matching bundles are identified</li>
                    <li>Order is converted and updated</li>
                  </ol>

                  <h4>Duplicate Prevention</h4>
                  <p>Our system prevents duplicate conversions and maintains order integrity.</p>
                </div>
              </section>

              {/* Fulfillment */}
              <section id="fulfillment" className={styles.section}>
                <h2 className={styles.sectionTitle}>Fulfillment Integration</h2>
                <div className={styles.prose}>
                  <h3>Supported Platforms</h3>
                  <ul>
                    <li><strong>ShipStation:</strong> Automated order fulfillment and tracking</li>
                    <li><strong>FBA:</strong> Amazon Fulfillment by Amazon integration</li>
                    <li><strong>EDI Systems:</strong> Enterprise B2B order processing</li>
                    <li><strong>Custom APIs:</strong> Connect with your existing fulfillment providers</li>
                  </ul>

                  <h4>Setting Up Integrations</h4>
                  <p>Navigate to Settings &gt; Fulfillment to configure your integrations.</p>
                </div>
              </section>

              {/* Analytics */}
              <section id="analytics" className={styles.section}>
                <h2 className={styles.sectionTitle}>Analytics & Reporting</h2>
                <div className={styles.prose}>
                  <h3>Key Metrics</h3>
                  <ul>
                    <li><strong>Conversion Rate:</strong> Percentage of orders converted to bundles</li>
                    <li><strong>Average Order Value:</strong> Impact on order values</li>
                    <li><strong>Bundle Performance:</strong> Which bundles perform best</li>
                    <li><strong>Revenue Impact:</strong> Total revenue generated from bundling</li>
                  </ul>

                  <h4>Custom Reports</h4>
                  <p>Create custom reports and export data for further analysis.</p>
                </div>
              </section>

              {/* API Reference */}
              <section id="api" className={styles.section}>
                <h2 className={styles.sectionTitle}>API Reference</h2>
                <div className={styles.prose}>
                  <h3>Authentication</h3>
                  <p>Use your API key to authenticate requests.</p>

                  <h4>Endpoints</h4>
                                  <div className={styles.codeBlock}>
                    <p>GET /api/bundles - List all bundles</p>
                    <p>POST /api/bundles - Create new bundle</p>
                    <p>GET /api/orders - Get order analytics</p>
                    <p>POST /api/convert - Manual order conversion</p>
                  </div>

                  <h4>Rate Limits</h4>
                  <p>1000 requests per hour for standard plans.</p>
                </div>
              </section>

              {/* Troubleshooting */}
              <section id="troubleshooting" className={styles.section}>
                <h2 className={styles.sectionTitle}>Troubleshooting</h2>
                <div className={styles.prose}>
                  <h3>Common Issues</h3>

                  <h4>Orders Not Converting</h4>
                  <p>Check that bundle rules are active and items match exactly.</p>

                  <h4>Fulfillment Integration Failing</h4>
                  <p>Verify API credentials and connection settings.</p>

                  <h4>Analytics Not Updating</h4>
                  <p>Check webhook configuration in Shopify settings.</p>

                  <h4>Contact Support</h4>
                  <p>If you can't resolve an issue, contact our support team.</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}