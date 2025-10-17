import type { MetaFunction } from "@remix-run/node";
import { PublicLayout } from "../components/PublicLayout";
import styles from "./styles/contact-us.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Contact Us - Reverse Bundling" },
    { name: "description", content: "Get in touch with our support team for help with Reverse Bundling" },
  ];
};

export default function ContactUs() {
  return (
    <PublicLayout>
      <div className={styles.page}>
        <div className={styles.container}>
          {/* Hero Section */}
          <div className={styles.hero}>
            <div className={styles.heroContent}>
              <h1 className={styles.heroTitle}>Get in Touch</h1>
              <p className={styles.heroSubtitle}>
                Have questions about Reverse Bundling? Our team is here to help you succeed.
              </p>
              <div className={styles.heroStats}>
                <div className={styles.stat}>
                  <span className={styles.statNumber}>2-4h</span>
                  <span className={styles.statLabel}>Average Response</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statNumber}>24/7</span>
                  <span className={styles.statLabel}>Emergency Support</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statNumber}>99.9%</span>
                  <span className={styles.statLabel}>Uptime</span>
                </div>
              </div>
            </div>
            <div className={styles.heroVisual}>
              <div className={styles.floatingIcon}>💬</div>
              <div className={styles.floatingIcon} style={{ animationDelay: '1s' }}>📧</div>
              <div className={styles.floatingIcon} style={{ animationDelay: '2s' }}>🚀</div>
            </div>
          </div>

          {/* Main Content */}
          <div className={styles.mainContent}>
            {/* Contact Form */}
            <div className={styles.formSection}>
              <div className={styles.formCard}>
                <div className={styles.formHeader}>
                  <h2 className={styles.formTitle}>Send us a message</h2>
                  <p className={styles.formSubtitle}>
                    Fill out the form below and we'll get back to you as soon as possible.
                  </p>
                </div>

                <form className={styles.contactForm}>
                  <div className={styles.formRow}>
                    <div className={styles.inputGroup}>
                      <label htmlFor="firstName" className={styles.inputLabel}>
                        First Name *
                      </label>
                      <input
                        type="text"
                        id="firstName"
                        name="firstName"
                        className={styles.input}
                        placeholder="John"
                        required
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label htmlFor="lastName" className={styles.inputLabel}>
                        Last Name *
                      </label>
                      <input
                        type="text"
                        id="lastName"
                        name="lastName"
                        className={styles.input}
                        placeholder="Doe"
                        required
                      />
                    </div>
                  </div>

                  <div className={styles.inputGroup}>
                    <label htmlFor="email" className={styles.inputLabel}>
                      Email Address *
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      className={styles.input}
                      placeholder="john@company.com"
                      required
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label htmlFor="company" className={styles.inputLabel}>
                      Company
                    </label>
                    <input
                      type="text"
                      id="company"
                      name="company"
                      className={styles.input}
                      placeholder="Your Company"
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label htmlFor="subject" className={styles.inputLabel}>
                      How can we help? *
                    </label>
                    <select
                      id="subject"
                      name="subject"
                      className={styles.select}
                      required
                    >
                      <option value="">Select a topic</option>
                      <option value="technical">Technical Support</option>
                      <option value="billing">Billing & Pricing</option>
                      <option value="integration">Integration Help</option>
                      <option value="feature">Feature Request</option>
                      <option value="partnership">Partnership Inquiry</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className={styles.inputGroup}>
                    <label htmlFor="message" className={styles.inputLabel}>
                      Message *
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows={5}
                      className={styles.textarea}
                      placeholder="Please describe your question or issue in detail..."
                      required
                    ></textarea>
                  </div>

                  <div className={styles.formActions}>
                    <button type="submit" className={styles.submitButton}>
                      <span>Send Message</span>
                      <span className={styles.buttonIcon}>→</span>
                    </button>
                    <p className={styles.formNote}>
                      We typically respond within 2-4 hours during business hours.
                    </p>
                  </div>
                </form>
              </div>
            </div>

            {/* Contact Methods */}
            <div className={styles.contactSection}>
              <h2 className={styles.sectionTitle}>Other ways to reach us</h2>

              <div className={styles.contactGrid}>
                <div className={styles.contactCard}>
                  <div className={styles.cardIcon}>
                    <span className={styles.iconEmoji}>📧</span>
                  </div>
                  <div className={styles.cardContent}>
                    <h3 className={styles.cardTitle}>Email Support</h3>
                    <p className={styles.cardDescription}>
                      Send us an email and we'll respond within 2-4 hours.
                    </p>
                    <a href="mailto:support@reversebundling.com" className={styles.cardLink}>
                      support@reversebundling.com
                    </a>
                  </div>
                </div>

                <div className={styles.contactCard}>
                  <div className={styles.cardIcon}>
                    <span className={styles.iconEmoji}>💬</span>
                  </div>
                  <div className={styles.cardContent}>
                    <h3 className={styles.cardTitle}>Live Chat</h3>
                    <p className={styles.cardDescription}>
                      Chat with our support team during business hours.
                    </p>
                    <div className={styles.cardMeta}>
                      <span className={styles.statusBadge}>Online</span>
                      <span className={styles.hoursText}>Mon-Fri 9AM-6PM EST</span>
                    </div>
                  </div>
                </div>

                <div className={styles.contactCard}>
                  <div className={styles.cardIcon}>
                    <span className={styles.iconEmoji}>📚</span>
                  </div>
                  <div className={styles.cardContent}>
                    <h3 className={styles.cardTitle}>Documentation</h3>
                    <p className={styles.cardDescription}>
                      Find answers in our comprehensive documentation.
                    </p>
                    <a href="/documentation" className={styles.cardLink}>
                      Browse Docs →
                    </a>
                  </div>
                </div>

                <div className={styles.contactCard}>
                  <div className={styles.cardIcon}>
                    <span className={styles.iconEmoji}>🚨</span>
                  </div>
                  <div className={styles.cardContent}>
                    <h3 className={styles.cardTitle}>Emergency Support</h3>
                    <p className={styles.cardDescription}>
                      For critical system outages and emergencies.
                    </p>
                    <a href="tel:+1555123HELP" className={styles.cardLink}>
                      +1 (555) 123-HELP
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* FAQ Section */}
          <div className={styles.faqSection}>
            <div className={styles.faqContent}>
              <h2 className={styles.faqTitle}>Frequently Asked Questions</h2>
              <div className={styles.faqGrid}>
                <div className={styles.faqItem}>
                  <h3>How quickly do you respond?</h3>
                  <p>We typically respond within 2-4 hours during business hours (Mon-Fri 9AM-6PM EST).</p>
                </div>
                <div className={styles.faqItem}>
                  <h3>Do you offer phone support?</h3>
                  <p>Phone support is available for enterprise customers and emergency situations.</p>
                </div>
                <div className={styles.faqItem}>
                  <h3>Can I schedule a demo?</h3>
                  <p>Yes! Contact us to schedule a personalized demo of Reverse Bundling.</p>
                </div>
                <div className={styles.faqItem}>
                  <h3>Do you support custom integrations?</h3>
                  <p>We offer custom integration services. Contact our team to discuss your needs.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}