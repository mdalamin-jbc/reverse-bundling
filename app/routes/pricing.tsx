import type { MetaFunction } from "@remix-run/node";
import styles from "./styles/pricing.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Pricing - Reverse Bundling" },
    { name: "description", content: "Choose the perfect plan for your bundling needs" },
  ];
};

export default function Pricing() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <section className={styles.header}>
          <h1 className={styles.headerTitle}>Simple, Transparent Pricing</h1>
          <p className={styles.headerSubtitle}>
            Choose the plan that fits your business. All plans include our core bundling features with different usage limits.
          </p>
        </section>

        <div className={styles.pricingGrid}>
          {/* Starter Plan */}
          <div className={styles.pricingCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.planName}>Starter</h3>
              <div className={styles.planPrice}>
                <span className={styles.priceAmount}>$29</span>
                <span className={styles.pricePeriod}>/month</span>
              </div>
              <p className={styles.planDescription}>Perfect for small stores getting started with bundling</p>
            </div>
            <ul className={styles.featureList}>
              <li className={styles.featureItem}>
                <svg className={styles.featureIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Up to 100 bundles
              </li>
              <li className={styles.featureItem}>
                <svg className={styles.featureIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Basic analytics
              </li>
              <li className={styles.featureItem}>
                <svg className={styles.featureIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Email support
              </li>
            </ul>
            <button className={`${styles.ctaButton} ${styles.secondaryButton}`}>
              Start Free Trial
            </button>
          </div>

          {/* Professional Plan */}
          <div className={`${styles.pricingCard} ${styles.popularCard}`}>
            <div className={styles.popularBadge}>Most Popular</div>
            <div className={styles.cardHeader}>
              <h3 className={styles.planName}>Professional</h3>
              <div className={styles.planPrice}>
                <span className={styles.priceAmount}>$79</span>
                <span className={styles.pricePeriod}>/month</span>
              </div>
              <p className={styles.planDescription}>Ideal for growing businesses with advanced bundling needs</p>
            </div>
            <ul className={styles.featureList}>
              <li className={styles.featureItem}>
                <svg className={styles.featureIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Unlimited bundles
              </li>
              <li className={styles.featureItem}>
                <svg className={styles.featureIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Advanced analytics
              </li>
              <li className={styles.featureItem}>
                <svg className={styles.featureIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Priority support
              </li>
              <li className={styles.featureItem}>
                <svg className={styles.featureIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                API access
              </li>
            </ul>
            <button className={`${styles.ctaButton} ${styles.primaryButton}`}>
              Start Free Trial
            </button>
          </div>

          {/* Enterprise Plan */}
          <div className={styles.pricingCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.planName}>Enterprise</h3>
              <div className={styles.planPrice}>
                <span className={styles.priceAmount}>Custom</span>
                <span className={styles.pricePeriod}>pricing</span>
              </div>
              <p className={styles.planDescription}>For large-scale operations with custom requirements</p>
            </div>
            <ul className={styles.featureList}>
              <li className={styles.featureItem}>
                <svg className={styles.featureIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Everything in Professional
              </li>
              <li className={styles.featureItem}>
                <svg className={styles.featureIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Custom integrations
              </li>
              <li className={styles.featureItem}>
                <svg className={styles.featureIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Dedicated success manager
              </li>
              <li className={styles.featureItem}>
                <svg className={styles.featureIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                SLA guarantee
              </li>
            </ul>
            <button className={`${styles.ctaButton} ${styles.secondaryButton}`}>
              Contact Sales
            </button>
          </div>
        </div>

        <section className={styles.featuresSection}>
          <h2 className={styles.featuresTitle}>All plans include</h2>
          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              <div className={`${styles.featureIconContainer} ${styles.featureIconGreen}`}>
                <svg className={styles.featureIconSvg} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className={styles.featureTitle}>14-day free trial</h3>
            </div>
            <div className={styles.featureCard}>
              <div className={`${styles.featureIconContainer} ${styles.featureIconBlue}`}>
                <svg className={styles.featureIconSvg} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className={styles.featureTitle}>Enterprise security</h3>
            </div>
            <div className={styles.featureCard}>
              <div className={`${styles.featureIconContainer} ${styles.featureIconPurple}`}>
                <svg className={styles.featureIconSvg} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className={styles.featureTitle}>Lightning fast</h3>
            </div>
            <div className={styles.featureCard}>
              <div className={`${styles.featureIconContainer} ${styles.featureIconOrange}`}>
                <svg className={styles.featureIconSvg} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className={styles.featureTitle}>24/7 support</h3>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}