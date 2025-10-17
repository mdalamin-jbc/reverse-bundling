import type { MetaFunction } from "@remix-run/node";
import { PublicLayout } from "../components/PublicLayout";
import styles from "./styles/help-center.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Help Center - Reverse Bundling" },
    { name: "description", content: "Find answers to common questions and get help with Reverse Bundling" },
  ];
};

export default function HelpCenter() {
  return (
    <PublicLayout>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>Help Center</h1>
            <p className={styles.subtitle}>
              Find answers to your questions and get the help you need.
            </p>
          </div>

          {/* Search Bar */}
          <div className={styles.searchSection}>
            <div className={styles.searchBox}>
              <input
                type="text"
                placeholder="Search for help..."
                className={styles.searchInput}
              />
            </div>
          </div>

          {/* Popular Topics */}
          <div className={styles.categoriesGrid}>
            <div className={styles.categoryCard}>
              <div className={styles.categoryIcon}>🚀</div>
              <h3 className={styles.categoryTitle}>Getting Started</h3>
              <p className={styles.categoryDescription}>
                Learn the basics and get up and running quickly.
              </p>
              <a href="/documentation#getting-started" className={styles.categoryLink}>
                View Getting Started Guide →
              </a>
            </div>

            <div className={styles.categoryCard}>
              <div className={styles.categoryIcon}>🔄</div>
              <h3 className={styles.categoryTitle}>Order Conversion</h3>
              <p className={styles.categoryDescription}>
                Understand how automatic bundle conversion works.
              </p>
              <a href="/documentation#order-conversion" className={styles.categoryLink}>
                Learn About Conversion →
              </a>
            </div>

            <div className={styles.categoryCard}>
              <div className={styles.categoryIcon}>📦</div>
              <h3 className={styles.categoryTitle}>Fulfillment</h3>
              <p className={styles.categoryDescription}>
                Set up integrations with your fulfillment providers.
              </p>
              <a href="/documentation#fulfillment" className={styles.categoryLink}>
                Setup Fulfillment →
              </a>
            </div>
          </div>

          {/* Popular Articles */}
          <div className={styles.popularArticles}>
            <h2 className={styles.sectionTitle}>Popular Articles</h2>
            <div className={styles.articlesGrid}>
              <div className={styles.articleCard}>
                <h3 className={styles.articleTitle}>How to install Reverse Bundling</h3>
                <div className={styles.articleMeta}>
                  <span>📖 Guide</span>
                  <span>5 min read</span>
                </div>
              </div>

              <div className={styles.articleCard}>
                <h3 className={styles.articleTitle}>Setting up your first bundle</h3>
                <div className={styles.articleMeta}>
                  <span>📋 Tutorial</span>
                  <span>8 min read</span>
                </div>
              </div>

              <div className={styles.articleCard}>
                <h3 className={styles.articleTitle}>ShipStation integration guide</h3>
                <div className={styles.articleMeta}>
                  <span>🔗 Integration</span>
                  <span>10 min read</span>
                </div>
              </div>

              <div className={styles.articleCard}>
                <h3 className={styles.articleTitle}>Troubleshooting conversion issues</h3>
                <div className={styles.articleMeta}>
                  <span>🔧 Support</span>
                  <span>6 min read</span>
                </div>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className={styles.popularArticles}>
            <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>

            <div className={styles.articlesGrid}>
              <div className={styles.articleCard}>
                <h3 className={styles.articleTitle}>What is Reverse Bundling?</h3>
                <p className={styles.categoryDescription}>
                  Reverse Bundling automatically converts individual product purchases into bundle sales when customers buy items that match your predefined bundle rules.
                </p>
              </div>

              <div className={styles.articleCard}>
                <h3 className={styles.articleTitle}>How does the pricing work?</h3>
                <p className={styles.categoryDescription}>
                  You set the bundle price and discount rules. When a conversion happens, the order total is automatically adjusted to reflect the bundle pricing.
                </p>
              </div>

              <div className={styles.articleCard}>
                <h3 className={styles.articleTitle}>Is my data secure?</h3>
                <p className={styles.categoryDescription}>
                  Yes, we use enterprise-grade security measures and comply with GDPR and CCPA regulations. Your data is encrypted and never shared with third parties.
                </p>
              </div>

              <div className={styles.articleCard}>
                <h3 className={styles.articleTitle}>Can I integrate with my existing systems?</h3>
                <p className={styles.categoryDescription}>
                  Absolutely! We support integrations with ShipStation, FBA, EDI systems, and provide APIs for custom integrations.
                </p>
              </div>
            </div>
          </div>

          {/* Contact Support */}
          <div className={styles.contactSection}>
            <h2 className={styles.contactTitle}>Still need help?</h2>
            <p className={styles.contactText}>
              Our support team is ready to assist you with any questions or issues.
            </p>
            <div className={styles.contactButtons}>
              <a href="/contact-us" className={styles.contactButton + " " + styles.primaryButton}>
                Contact Support
              </a>
              <a href="/documentation" className={styles.contactButton + " " + styles.secondaryButton}>
                View Documentation
              </a>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}