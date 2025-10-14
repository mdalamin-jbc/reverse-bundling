import { Link } from "@remix-run/react";
import styles from "../routes/styles/layout.module.css";

interface LayoutProps {
  children: React.ReactNode;
}

export function PublicLayout({ children }: LayoutProps) {
  const navigation = [
    { name: "Features", href: "#features" },
    { name: "Pricing", href: "#pricing" },
    { name: "Integrations", href: "#integrations" },
    { name: "Support", href: "/support" },
  ];

  return (
    <div className={styles.layout}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo}>
            <Link to="/" className={styles.logoLink}>
              <span className={styles.logoIcon}>📦</span>
              <span className={styles.logoText}>Reverse Bundling</span>
            </Link>
          </div>

          <nav className={styles.nav}>
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={styles.navLink}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className={styles.main}>
        {children}
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerSection}>
            <div className={styles.footerLogo}>
              <span className={styles.footerLogoIcon}>📦</span>
              <span className={styles.footerLogoText}>Reverse Bundling</span>
            </div>
            <p className={styles.footerDescription}>
              The most advanced product bundling solution for Shopify merchants.
            </p>
          </div>

          <div className={styles.footerSection}>
            <h3 className={styles.footerTitle}>Product</h3>
            <ul className={styles.footerLinks}>
              <li><Link to="#features" className={styles.footerLink}>Features</Link></li>
              <li><Link to="#pricing" className={styles.footerLink}>Pricing</Link></li>
              <li><Link to="/app" className={styles.footerLink}>Dashboard</Link></li>
              <li><Link to="#integrations" className={styles.footerLink}>Integrations</Link></li>
            </ul>
          </div>

          <div className={styles.footerSection}>
            <h3 className={styles.footerTitle}>Support</h3>
            <ul className={styles.footerLinks}>
              <li><Link to="/documentation" className={styles.footerLink}>Documentation</Link></li>
              <li><Link to="/help-center" className={styles.footerLink}>Help Center</Link></li>
              <li><Link to="/contact-us" className={styles.footerLink}>Contact Us</Link></li>
              <li><Link to="/system-status" className={styles.footerLink}>System Status</Link></li>
            </ul>
          </div>

          <div className={styles.footerSection}>
            <h3 className={styles.footerTitle}>Legal</h3>
            <ul className={styles.footerLinks}>
              <li><Link to="/privacy-policy" className={styles.footerLink}>Privacy Policy</Link></li>
              <li><Link to="/terms-of-service" className={styles.footerLink}>Terms of Service</Link></li>
              <li><Link to="/compliance" className={styles.footerLink}>Compliance</Link></li>
              <li><Link to="/security" className={styles.footerLink}>Security</Link></li>
            </ul>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <div className={styles.footerBottomContent}>
            <p className={styles.copyright}>
              © {new Date().getFullYear()} Reverse Bundling. All rights reserved.
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