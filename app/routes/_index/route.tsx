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
            <h1 className={styles.heading}>Reverse Bundling</h1>
            <p className={styles.tagline}>
              Transform individual product orders into profitable bundles automatically.
              Boost revenue, simplify fulfillment, and enhance customer experience.
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
            <h2 className={styles.sectionTitle}>Powerful Features for Modern E-commerce</h2>
            <p className={styles.sectionDesc}>
              Everything you need to create, manage, and optimize product bundles at scale.
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
              <div className={styles.featureIcon}>🔒</div>
              <h3 className={styles.featureTitle}>Enterprise Security</h3>
              <p className={styles.featureDesc}>
                Bank-level security with encrypted data storage, compliance monitoring,
                and automated backups. GDPR compliant with comprehensive audit trails.
              </p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.featureIcon}>⚡</div>
              <h3 className={styles.featureTitle}>Lightning Fast Processing</h3>
              <p className={styles.featureDesc}>
                Sub-second order processing with optimized algorithms and cloud infrastructure.
                Handle thousands of orders simultaneously without performance degradation.
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
                  <span className={styles.priceAmount}>$29</span>
                  <span className={styles.pricePeriod}>/month</span>
                </div>
                <p className={styles.pricingDesc}>Perfect for small stores getting started with bundling</p>
              </div>
              <ul className={styles.pricingFeatures}>
                <li>Up to 100 bundles</li>
                <li>Basic analytics</li>
                <li>Email support</li>
                <li>14-day free trial</li>
              </ul>
              <a href="/pricing" className={styles.pricingButton}>Start Free Trial</a>
            </div>

            {/* Professional Plan */}
            <div className={styles.pricingCard + " " + styles.pricingCardPopular}>
              <div className={styles.pricingBadge}>Most Popular</div>
              <div className={styles.pricingHeader}>
                <h3 className={styles.pricingTitle}>Professional</h3>
                <div className={styles.pricingPrice}>
                  <span className={styles.priceAmount}>$79</span>
                  <span className={styles.pricePeriod}>/month</span>
                </div>
                <p className={styles.pricingDesc}>Ideal for growing businesses with advanced bundling needs</p>
              </div>
              <ul className={styles.pricingFeatures}>
                <li>Unlimited bundles</li>
                <li>Advanced analytics</li>
                <li>Priority support</li>
                <li>API access</li>
                <li>All Starter features</li>
              </ul>
              <a href="/pricing" className={styles.pricingButton + " " + styles.pricingButtonPrimary}>Start Free Trial</a>
            </div>

            {/* Enterprise Plan */}
            <div className={styles.pricingCard}>
              <div className={styles.pricingHeader}>
                <h3 className={styles.pricingTitle}>Enterprise</h3>
                <div className={styles.pricingPrice}>
                  <span className={styles.priceAmount}>Custom</span>
                  <span className={styles.pricePeriod}>pricing</span>
                </div>
                <p className={styles.pricingDesc}>For large-scale operations with custom requirements</p>
              </div>
              <ul className={styles.pricingFeatures}>
                <li>Everything in Professional</li>
                <li>Custom integrations</li>
                <li>Dedicated success manager</li>
                <li>SLA guarantee</li>
                <li>White-label options</li>
              </ul>
              <a href="/pricing" className={styles.pricingButton}>Contact Sales</a>
            </div>
          </div>

          <div className={styles.pricingFooter}>
            <p className={styles.pricingFooterText}>
              All plans include enterprise security, lightning-fast processing, and 24/7 support.
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
              The most advanced product bundling solution for Shopify merchants.
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
              <span className={styles.badge}>🔒 SOC 2 Compliant</span>
              <span className={styles.badge}>🛡️ GDPR Ready</span>
              <span className={styles.badge}>⚡ 99.9% Uptime</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
