import type { MetaFunction } from "@remix-run/node";
import { PublicLayout } from "../components/PublicLayout";
import styles from "./styles/security.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Security - Reverse Bundling" },
    { name: "description", content: "Learn about our security measures and data protection practices" },
  ];
};

export default function Security() {
  const securityLayers = [
    {
      title: "Application Security",
      description: "Secure coding practices and automated security testing",
      icon: "🔐",
      features: [
        "Input validation and sanitization",
        "SQL injection prevention",
        "XSS protection",
        "CSRF protection"
      ]
    },
    {
      title: "Data Protection",
      description: "End-to-end encryption and secure data handling",
      icon: "🛡️",
      features: [
        "AES-256 encryption at rest",
        "TLS 1.3 in transit",
        "Secure key management",
        "Data anonymization"
      ]
    },
    {
      title: "Access Control",
      description: "Multi-layered authentication and authorization",
      icon: "🔑",
      features: [
        "Multi-factor authentication",
        "Role-based access control",
        "Zero trust architecture",
        "Session management"
      ]
    },
    {
      title: "Infrastructure Security",
      description: "Secure cloud infrastructure and monitoring",
      icon: "☁️",
      features: [
        "SOC 2 certified providers",
        "Network segmentation",
        "Automated monitoring",
        "Regular security audits"
      ]
    }
  ];

  const threats = [
    {
      title: "Data Breaches",
      description: "Protection against unauthorized data access",
      icon: "🚨"
    },
    {
      title: "DDoS Attacks",
      description: "Distributed denial of service mitigation",
      icon: "🌐"
    },
    {
      title: "Malware",
      description: "Advanced threat detection and prevention",
      icon: "🦠"
    },
    {
      title: "Insider Threats",
      description: "Monitoring and access control measures",
      icon: "👤"
    }
  ];

  const responseSteps = [
    {
      number: "1",
      title: "Detection",
      description: "Automated monitoring detects suspicious activity"
    },
    {
      number: "2",
      title: "Assessment",
      description: "Security team evaluates incident severity"
    },
    {
      number: "3",
      title: "Containment",
      description: "Isolate affected systems immediately"
    },
    {
      number: "4",
      title: "Recovery",
      description: "Restore from clean backups"
    },
    {
      number: "5",
      title: "Analysis",
      description: "Learn and improve security measures"
    }
  ];

  return (
    <PublicLayout>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>Security Overview</h1>
            <p className={styles.subtitle}>
              Enterprise-grade security measures to protect your data and ensure business continuity.
            </p>
          </div>

          {/* Security Overview */}
          <div className={styles.securityOverview}>
            <h2 className={styles.overviewTitle}>Defense in Depth</h2>
            <p className={styles.overviewText}>
              Our security approach implements multiple layers of protection across all systems and processes.
            </p>
            <div className={styles.securityStats}>
              <div className={styles.statItem}>
                <span className={styles.statValue}>99.9%</span>
                <span className={styles.statLabel}>Uptime</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>24/7</span>
                <span className={styles.statLabel}>Monitoring</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>AES-256</span>
                <span className={styles.statLabel}>Encryption</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>SOC 2</span>
                <span className={styles.statLabel}>Certified</span>
              </div>
            </div>
          </div>

          {/* Security Layers */}
          <div className={styles.securityLayers}>
            {securityLayers.map((layer, index) => (
              <div key={index} className={styles.layerCard}>
                <div className={styles.layerHeader}>
                  <div className={styles.layerIcon}>{layer.icon}</div>
                  <h3 className={styles.layerTitle}>{layer.title}</h3>
                </div>
                <p className={styles.layerDescription}>{layer.description}</p>
                <div className={styles.layerFeatures}>
                  {layer.features.map((feature, idx) => (
                    <div key={idx} className={styles.featureItem}>
                      <div className={styles.featureIcon}>✓</div>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Threat Protection */}
          <div className={styles.threatsSection}>
            <h2 className={styles.sectionTitle}>Threat Protection</h2>
            <div className={styles.threatsGrid}>
              {threats.map((threat, index) => (
                <div key={index} className={styles.threatCard}>
                  <div className={styles.threatIcon}>{threat.icon}</div>
                  <h3 className={styles.threatTitle}>{threat.title}</h3>
                  <p className={styles.threatDescription}>{threat.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Incident Response */}
          <div className={styles.incidentResponse}>
            <h2 className={styles.sectionTitle}>Incident Response Process</h2>
            <div className={styles.responseGrid}>
              {responseSteps.map((step, index) => (
                <div key={index} className={styles.responseStep}>
                  <div className={styles.stepNumber}>{step.number}</div>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepDescription}>{step.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Contact Section */}
          <div className={styles.contactSection}>
            <h2 className={styles.contactTitle}>Contact Our Security Team</h2>
            <p className={styles.contactText}>
              Have a security concern or question? Our dedicated security team is here to help.
            </p>
            <div className={styles.contactButtons}>
              <a href="/contact-us" className={styles.contactButton + " " + styles.primaryButton}>
                Report Security Issue
              </a>
              <a href="/compliance" className={styles.contactButton + " " + styles.secondaryButton}>
                View Compliance Info
              </a>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}