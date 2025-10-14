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
    <div className={styles.index}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            🚀 Production-Ready Enterprise Solution
          </div>

          <h1 className={styles.heading}>
            Save Up To 40% On Fulfillment Costs With AI-Powered Reverse Bundling
          </h1>

          <p className={styles.tagline}>
            Automatically convert individual item orders into cost-effective pre-bundled SKUs.
            Enterprise-grade fulfillment optimization trusted by thousands of Shopify merchants.
          </p>

          {/* Stats */}
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statNumber}>40%</div>
              <div className={styles.statLabel}>Cost Savings</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statNumber}>500ms</div>
              <div className={styles.statLabel}>Processing Speed</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statNumber}>99.9%</div>
              <div className={styles.statLabel}>Uptime SLA</div>
            </div>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.loginCard}>
            <div className={styles.cardHeader}>
              <h3>Connect Your Shopify Store</h3>
              <p>Start saving on fulfillment costs in under 2 minutes</p>
            </div>

            {showForm && (
              <Form method="post" action="/auth/login" className={styles.form}>
                <div className={styles.inputWrapper}>
                  <input
                    className={styles.input}
                    type="text"
                    name="shop"
                    placeholder="your-store.myshopify.com or https://your-store.myshopify.com"
                    pattern="^(https?://(admin\.shopify\.com/store/)?)?[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com/?$"
                    required
                  />
                  <div className={styles.inputGlow}></div>
                  <label className={styles.inputLabel}>Shopify Domain or URL</label>
                  <span className={styles.inputIcon}>🏪</span>
                </div>

                <button className={styles.button} type="submit">
                  <span>🚀 Start Saving Now</span>
                </button>
              </Form>
            )}

            <div className={styles.formFooter}>
              <p className={styles.formHelp}>
                Free 14-day trial • No credit card required • Cancel anytime
              </p>
              <div className={styles.formLinks}>
                <a href="/privacy-policy" className={styles.privacyLink}>Privacy Policy</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className={styles.features}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2>Enterprise-Grade Fulfillment Optimization</h2>
            <p>Built for scale with production-ready infrastructure and real-time AI processing</p>
          </div>

          <div className={styles.featuresGrid}>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>🤖</div>
              <h3>AI-Powered Order Conversion</h3>
              <p>Automatically analyzes incoming orders and converts individual items into optimal bundled SKUs, reducing pick-and-pack costs by up to 40%.</p>
            </div>

            <div className={styles.feature}>
              <div className={styles.featureIcon}>📊</div>
              <h3>Real-Time Analytics Dashboard</h3>
              <p>Track savings, conversion rates, and fulfillment performance with comprehensive analytics. Monitor bundle rule effectiveness and ROI in real-time.</p>
            </div>

            <div className={styles.feature}>
              <div className={styles.featureIcon}>🔗</div>
              <h3>Multi-Provider Integration</h3>
              <p>Seamlessly integrate with ShipStation, FBA, and custom EDI systems. Auto-sync orders and track fulfillment status across all providers.</p>
            </div>

            <div className={styles.feature}>
              <div className={styles.featureIcon}>⚡</div>
              <h3>Lightning-Fast Processing</h3>
              <p>Sub-500ms webhook processing with horizontal scaling support. Handle thousands of orders per minute without performance degradation.</p>
            </div>

            <div className={styles.feature}>
              <div className={styles.featureIcon}>🔒</div>
              <h3>Enterprise Security</h3>
              <p>HMAC webhook verification, rate limiting (60/min webhooks), encrypted sessions, and comprehensive security headers. GDPR compliant.</p>
            </div>

            <div className={styles.feature}>
              <div className={styles.featureIcon}>🏥</div>
              <h3>Production Monitoring</h3>
              <p>Health checks, business metrics API, structured logging, and Sentry error tracking. 99.9% uptime SLA with proactive monitoring.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.cta}>
        <div className={styles.ctaContent}>
          <h2>Ready to Save Thousands on Fulfillment Costs?</h2>
          <p>Join thousands of Shopify merchants already optimizing their fulfillment operations</p>

          <div className={styles.ctaButtons}>
            <button className={styles.ctaPrimary} onClick={() => document.querySelector('form')?.scrollIntoView({ behavior: 'smooth' })}>
              Start Free Trial
            </button>
            <button className={styles.ctaSecondary} onClick={() => window.open('/app/bundle-rules', '_blank')}>
              View Demo Dashboard
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
