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
      <div className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <span>🚀 Enterprise-Grade Shopify Solution</span>
          </div>
          <h1 className={styles.heading}>
            Reverse Bundle Pro
          </h1>
          <p className={styles.tagline}>
            Transform individual product sales into profitable bundle conversions. Automatically detect and convert customer orders into your pre-configured bundle SKUs, maximizing revenue and customer satisfaction.
          </p>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.loginCard}>
            <div className={styles.cardHeader}>
              <h3>Connect Your Store</h3>
              <p>Secure integration with enterprise-grade security</p>
            </div>
            {showForm && (
              <Form className={styles.form} method="post" action="/auth/login">
                <div className={styles.inputWrapper}>
                  <div className={styles.inputIcon}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 16V8C21 6.89543 20.1046 6 19 6H5C3.89543 6 3 6.89543 3 8V16C3 17.1046 3.89543 18 5 18H19C20.1046 18 21 17.1046 21 16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M3 8L10.89 12.26C11.2187 12.4793 11.6049 12.5963 12 12.5963C12.3951 12.5963 12.7813 12.4793 13.11 12.26L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <input
                    className={styles.input}
                    type="text"
                    name="shop"
                    placeholder="your-store.myshopify.com"
                    required
                    autoComplete="off"
                  />
                  <div className={styles.inputGlow}></div>
                  <div className={styles.inputLabel}>
                    Shopify Store Domain
                  </div>
                </div>
                <div className={styles.formFooter}>
                  <p className={styles.formHelp}>
                    Enter your Shopify store domain to get started
                  </p>
                  <div className={styles.formLinks}>
                    <a href="/privacy-policy" className={styles.privacyLink}>
                      Privacy Policy
                    </a>
                  </div>
                  <button className={styles.button} type="submit">
                    <span>Connect Store</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </Form>
            )}
          </div>
        </div>
      </div>

      <div className={styles.features}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2>Why Choose Reverse Bundle Pro?</h2>
            <p>Advanced bundle management that grows with your business</p>
          </div>

          <div className={styles.featuresGrid}>
            <div className={styles.feature}>
              <div className={styles.featureIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3>Automated Bundle Detection</h3>
              <p>Automatically identify when customers purchase bundle components and convert them to your optimized bundle pricing, increasing average order value by up to 35%.</p>
            </div>

            <div className={styles.feature}>
              <div className={styles.featureIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3>Smart Rule Engine</h3>
              <p>Create complex bundle rules with our visual rule builder. Define custom conditions, pricing strategies, and inventory management for maximum flexibility.</p>
            </div>

            <div className={styles.feature}>
              <div className={styles.featureIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 19V6L21 3V16M9 19C9 20.1046 7.65685 21 6 21C4.34315 21 3 20.1046 3 19C3 17.8954 4.34315 17 6 17C7.65685 17 9 17.8954 9 19ZM21 16C21 17.1046 19.6569 18 18 18C16.3431 18 15 17.1046 15 16C15 14.8954 16.3431 14 18 14C19.6569 14 21 14.8954 21 16Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3>Real-Time Analytics</h3>
              <p>Track bundle performance with detailed analytics. Monitor conversion rates, revenue impact, and customer behavior to optimize your bundling strategy.</p>
            </div>

            <div className={styles.feature}>
              <div className={styles.featureIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 15V17M6 21H18C19.1046 21 20 20.1046 20 19V7C20 5.89543 19.1046 5 18 5H6C4.89543 5 4 5.89543 4 7V19C4 20.1046 4.89543 21 6 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3>Enterprise Security</h3>
              <p>Bank-level security with enterprise-grade infrastructure. Your data is encrypted, backed up regularly, and compliant with industry standards.</p>
            </div>

            <div className={styles.feature}>
              <div className={styles.featureIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13 10V3L4 14H11L11 21L20 10H13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3>Lightning Fast</h3>
              <p>Sub-millisecond order processing ensures your customers never experience delays. Our optimized algorithms handle thousands of orders per minute.</p>
            </div>

            <div className={styles.feature}>
              <div className={styles.featureIcon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17 20H7M17 20V16M17 20H21M7 20V16M7 20H3M12 16V12M12 12V8M12 12H16M12 12H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3>24/7 Support</h3>
              <p>Dedicated enterprise support team available around the clock. Get help when you need it with our priority support channels and extensive documentation.</p>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.cta}>
        <div className={styles.container}>
          <div className={styles.ctaContent}>
            <h2>Ready to Transform Your Revenue?</h2>
            <p>Start your journey to automated bundle optimization today</p>
            <div className={styles.ctaButtons}>
              <button className={styles.ctaPrimary} onClick={() => document.querySelector('form')?.querySelector('input')?.focus()}>
                Start Free Trial
              </button>
              <button className={styles.ctaSecondary}>
                Schedule Demo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
