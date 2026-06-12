import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>📦</span>
            <span className={styles.logoText}>Reverse Bundling</span>
          </div>
          <nav className={styles.nav}>
            <a href="#features" className={styles.navLink}>Features</a>
            <a href="#pricing" className={styles.navLink}>Pricing</a>
            <a href="#integrations" className={styles.navLink}>Integrations</a>
            <a href="/support" className={styles.navLink}>Support</a>
          </nav>
        </div>
      </header>

      <main>
        <div className={styles.hero}>
          <div className={styles.heroContent}>
            <h1 className={styles.heading}>Reverse Bundle Pro</h1>
            <p className={styles.tagline}>
              Automatically convert repeat multi-SKU orders into one pre-packed bundle SKU
              before fulfillment—fewer picks, lower warehouse cost, cleaner ShipStation workflow.
            </p>
            {showForm && (
              <div className={styles.ctaSection}>
                <Form className={styles.form} method="post" action="/auth/login">
                  <div className={styles.inputGroup}>
                    <div className={styles.labelText}>Shop domain</div>
                    <div className={styles.inputRow}>
                      <div className={styles.inputContainer}>
                        <input
                          className={styles.input}
                          type="text"
                          name="shop"
                          placeholder="your-store.myshopify.com"
                          required
                        />
                        <div className={styles.hint}>Enter your Shopify store URL</div>
                      </div>
                      <button className={styles.button} type="submit">
                        Connect Store
                      </button>
                    </div>
                  </div>
                </Form>
                <p className={styles.ctaText}>
                  Free 14-day trial • No credit card required • Cancel anytime
                </p>
              </div>
            )}
          </div>
        </div>

        <div id="features" className={styles.features}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Built for High-Volume Fulfillment</h2>
            <p className={styles.sectionDesc}>
              For Shopify stores that ship the same product combinations every day.
            </p>
          </div>
          <div className={styles.featureGrid}>
            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>📦</div>
              <h3 className={styles.featureTitle}>Smart Bundle Creation</h3>
              <p className={styles.featureDesc}>
                Create intelligent product bundles with custom rules, pricing strategies,
                and automated frequency detection. Maximize profitability with data-driven bundling.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🔄</div>
              <h3 className={styles.featureTitle}>Automatic Order Conversion</h3>
              <p className={styles.featureDesc}>
                Seamlessly convert individual product orders into bundle equivalents.
                Prevent duplicate conversions and maintain order integrity with advanced tracking.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🚚</div>
              <h3 className={styles.featureTitle}>Multi-Provider Fulfillment</h3>
              <p className={styles.featureDesc}>
                Integrate with ShipStation, FBA, EDI systems, and custom providers.
                Automate order routing and track fulfillment performance across all channels.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>📊</div>
              <h3 className={styles.featureTitle}>Real-Time Analytics</h3>
              <p className={styles.featureDesc}>
                Monitor bundle performance, conversion rates, and revenue impact.
                Make data-driven decisions with comprehensive dashboards and reporting.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>🎯</div>
              <h3 className={styles.featureTitle}>AI Bundle Suggestions</h3>
              <p className={styles.featureDesc}>
                Analyze order history to surface SKU combinations worth bundling.
                Turn suggestions into rules in one click.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>⚡</div>
              <h3 className={styles.featureTitle}>Setup Wizard</h3>
              <p className={styles.featureDesc}>
                Guided onboarding gets your first bundle rule live in minutes.
                No warehouse workflow change required to start.
              </p>
            </div>
          </div>
        </div>

        <div id="pricing" className={styles.pricing}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Simple, Transparent Pricing</h2>
            <p className={styles.sectionDesc}>
              Choose the plan that fits your business. Start free and scale as you grow.
            </p>
          </div>

          <div className={styles.pricingGrid}>
            {/* Starter Plan */}
            <div className={styles.pricingCard}>
              <div className={styles.pricingHeader}>
                <h3 className={styles.pricingTitle}>Starter</h3>
                <div className={styles.pricingPrice}>
                  <span className={styles.priceAmount}>$17.99</span>
                  <span className={styles.pricePeriod}>/30 days</span>
                </div>
                <p className={styles.pricingDesc}>14-day free trial, then $17.99 every 30 days</p>
              </div>
              <ul className={styles.pricingFeatures}>
                <li>Up to 25 bundle rules</li>
                <li>Full order analysis &amp; suggestions</li>
                <li>Basic analytics dashboard</li>
                <li>14-day free trial included</li>
              </ul>
              <a href="/pricing" className={styles.pricingButton}>Start Free Trial</a>
            </div>

            {/* Professional Plan */}
            <div className={styles.pricingCard + " " + styles.pricingCardPopular}>
              <div className={styles.pricingBadge}>Most Popular</div>
              <div className={styles.pricingHeader}>
                <h3 className={styles.pricingTitle}>Professional</h3>
                <div className={styles.pricingPrice}>
                  <span className={styles.priceAmount}>$39.99</span>
                  <span className={styles.pricePeriod}>/30 days</span>
                </div>
                <p className={styles.pricingDesc}>14-day free trial, then $39.99 every 30 days</p>
              </div>
              <ul className={styles.pricingFeatures}>
                <li>Unlimited bundle rules</li>
                <li>Advanced analytics &amp; CSV exports</li>
                <li>Priority support</li>
                <li>Data-driven bundle suggestions</li>
                <li>All Starter features</li>
              </ul>
              <a href="/pricing" className={styles.pricingButton + " " + styles.pricingButtonPrimary}>Start Free Trial</a>
            </div>

            {/* Enterprise Plan */}
            <div className={styles.pricingCard}>
              <div className={styles.pricingHeader}>
                <h3 className={styles.pricingTitle}>Enterprise</h3>
                <div className={styles.pricingPrice}>
                  <span className={styles.priceAmount}>$79.99</span>
                  <span className={styles.pricePeriod}>/30 days</span>
                </div>
                <p className={styles.pricingDesc}>14-day free trial, then $79.99 every 30 days</p>
              </div>
              <ul className={styles.pricingFeatures}>
                <li>Everything in Professional</li>
                <li>Fulfillment optimization</li>
                <li>Dedicated success manager</li>
                <li>Slack &amp; email notifications</li>
                <li>14-day free trial included</li>
              </ul>
              <a href="/pricing" className={styles.pricingButton}>Start Free Trial</a>
            </div>
          </div>

          <div className={styles.pricingFooter}>
            <p className={styles.pricingFooterText}>
              14-day free trial on paid plans. Free tier available.
              <a href="/pricing" className={styles.pricingFooterLink}> View full pricing details →</a>
            </p>
          </div>
        </div>

        <div id="integrations" className={styles.integrations}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Seamless Integrations</h2>
            <p className={styles.sectionDesc}>
              Connect with your favorite tools and platforms. Automate your workflow from end to end.
            </p>
          </div>

          <div className={styles.integrationsGrid}>
            <div className={styles.integrationCard}>
              <div className={styles.integrationIcon}>🛍️</div>
              <h3 className={styles.integrationTitle}>Shopify</h3>
              <p className={styles.integrationDesc}>Native Shopify integration with webhooks and API access</p>
              <span className={styles.integrationTag}>Core Platform</span>
            </div>

            <div className={styles.integrationCard}>
              <div className={styles.integrationIcon}>📦</div>
              <h3 className={styles.integrationTitle}>ShipStation</h3>
              <p className={styles.integrationDesc}>Automated order fulfillment and shipping label generation</p>
              <span className={styles.integrationTag}>Fulfillment</span>
            </div>

            <div className={styles.integrationCard}>
              <div className={styles.integrationIcon}>📊</div>
              <h3 className={styles.integrationTitle}>FBA</h3>
              <p className={styles.integrationDesc}>Amazon Fulfillment by Amazon integration for marketplace orders</p>
              <span className={styles.integrationTag}>Fulfillment</span>
            </div>

            <div className={styles.integrationCard}>
              <div className={styles.integrationIcon}>🔄</div>
              <h3 className={styles.integrationTitle}>EDI Systems</h3>
              <p className={styles.integrationDesc}>Enterprise EDI integration for B2B order processing</p>
              <span className={styles.integrationTag}>Enterprise</span>
            </div>

            <div className={styles.integrationCard}>
              <div className={styles.integrationIcon}>💬</div>
              <h3 className={styles.integrationTitle}>Slack</h3>
              <p className={styles.integrationDesc}>Real-time notifications and alerts in your Slack workspace</p>
              <span className={styles.integrationTag}>Communication</span>
            </div>

            <div className={styles.integrationCard}>
              <div className={styles.integrationIcon}>⚡</div>
              <h3 className={styles.integrationTitle}>Zapier</h3>
              <p className={styles.integrationDesc}>Connect with 3,000+ apps through Zapier's automation platform</p>
              <span className={styles.integrationTag}>Automation</span>
            </div>
          </div>

          <div className={styles.integrationsFooter}>
            <p className={styles.integrationsFooterText}>
              Don't see your integration? <a href="/integrations" className={styles.integrationsFooterLink}>View all integrations →</a>
            </p>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerSection}>
            <div className={styles.footerLogo}>
              <span className={styles.logoIcon}>📦</span>
              <span className={styles.footerLogoText}>Reverse Bundling</span>
            </div>
            <p className={styles.footerDesc}>
              Reverse bundling automation for Shopify fulfillment teams.
            </p>
          </div>

          <div className={styles.footerSection}>
            <h4 className={styles.footerTitle}>Product</h4>
            <ul className={styles.footerLinks}>
              <li><a href="#features">Features</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="/app">Dashboard</a></li>
              <li><a href="/integrations">Integrations</a></li>
            </ul>
          </div>

          <div className={styles.footerSection}>
            <h4 className={styles.footerTitle}>Support</h4>
            <ul className={styles.footerLinks}>
              <li><a href="/documentation">Documentation</a></li>
              <li><a href="/help-center">Help Center</a></li>
              <li><a href="/contact-us">Contact Us</a></li>
              <li><a href="/system-status">System Status</a></li>
            </ul>
          </div>

          <div className={styles.footerSection}>
            <h4 className={styles.footerTitle}>Legal</h4>
            <ul className={styles.footerLinks}>
              <li><a href="/privacy-policy">Privacy Policy</a></li>
              <li><a href="/terms-of-service">Terms of Service</a></li>
              <li><a href="/compliance">Compliance</a></li>
              <li><a href="/security">Security</a></li>
            </ul>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <div className={styles.footerBottomContent}>
            <p className={styles.copyright}>
              © 2025 Reverse Bundling. All rights reserved.
            </p>
            <div className={styles.footerBadges}>
              <span className={styles.badge}>🛍️ Shopify App</span>
              <span className={styles.badge}>📦 Fulfillment focus</span>
              <a href="/system-status" className={styles.badge}>💚 System status</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
