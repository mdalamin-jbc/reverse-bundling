import type { MetaFunction } from "@remix-run/node";
import { PublicLayout } from "../components/PublicLayout";
import styles from "./styles/compliance.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Compliance - Reverse Bundling" },
    { name: "description", content: "Security certifications and compliance information for Reverse Bundling" },
  ];
};

export default function Compliance() {
  const certifications = [
    {
      name: "SOC 2 Type II",
      description: "Security, availability, and confidentiality of customer data",
      status: "Certified",
      icon: "🔒",
      details: [
        { label: "Audit Firm", value: "Deloitte" },
        { label: "Last Audit", value: "Dec 2024" },
        { label: "Next Audit", value: "Dec 2025" }
      ]
    },
    {
      name: "GDPR",
      description: "General Data Protection Regulation compliance",
      status: "Compliant",
      icon: "🇪🇺",
      details: [
        { label: "DPO Appointed", value: "Yes" },
        { label: "Data Mapping", value: "Complete" },
        { label: "Breach Response", value: "< 72 hours" }
      ]
    },
    {
      name: "CCPA",
      description: "California Consumer Privacy Act compliance",
      status: "Compliant",
      icon: "🌉",
      details: [
        { label: "Privacy Notices", value: "Published" },
        { label: "Opt-out Process", value: "Automated" },
        { label: "Data Deletion", value: "Supported" }
      ]
    },
    {
      name: "PCI DSS",
      description: "Payment Card Industry Data Security Standard",
      status: "Level 1",
      icon: "💳",
      details: [
        { label: "Compliance Level", value: "Level 1" },
        { label: "Last Assessment", value: "Q4 2024" },
        { label: "Next Assessment", value: "Q4 2025" }
      ]
    },
    {
      name: "ISO 27001",
      description: "Information security management systems",
      status: "Certified",
      icon: "🎯",
      details: [
        { label: "Certificate Number", value: "ISMS-2024-001" },
        { label: "Valid Until", value: "Dec 2025" },
        { label: "Scope", value: "Cloud Infrastructure" }
      ]
    },
    {
      name: "HIPAA",
      description: "Health Insurance Portability and Accountability Act",
      status: "Not Applicable",
      icon: "🏥",
      details: [
        { label: "Business Associate", value: "N/A" },
        { label: "PHI Processing", value: "None" },
        { label: "Assessment", value: "Annual Review" }
      ]
    }
  ];

  const frameworks = [
    {
      name: "Zero Trust",
      description: "Never trust, always verify security model",
      icon: "🛡️"
    },
    {
      name: "DevSecOps",
      description: "Security integrated into development pipeline",
      icon: "🔄"
    },
    {
      name: "Privacy by Design",
      description: "Privacy considerations built into all systems",
      icon: "🔒"
    },
    {
      name: "Risk Management",
      description: "Continuous risk assessment and mitigation",
      icon: "📊"
    }
  ];

  const audits = [
    {
      title: "SOC 2 Type II Audit",
      date: "December 2024",
      description: "Comprehensive audit of security controls by independent CPA firm",
      icon: "📋"
    },
    {
      title: "Penetration Testing",
      date: "October 2024",
      description: "External security assessment by certified ethical hackers",
      icon: "🎯"
    },
    {
      title: "GDPR Compliance Review",
      date: "September 2024",
      description: "Third-party assessment of GDPR compliance measures",
      icon: "🇪🇺"
    },
    {
      title: "Infrastructure Security Audit",
      date: "August 2024",
      description: "Cloud infrastructure security and configuration review",
      icon: "☁️"
    }
  ];

  return (
    <PublicLayout>
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h1 className={styles.title}>Compliance & Security</h1>
            <p className={styles.subtitle}>
              Enterprise-grade security and compliance standards to protect your data.
            </p>
          </div>

          <div className={styles.contentGrid}>
            {certifications.map((cert, index) => (
              <div key={index} className={styles.complianceCard}>
                <div className={styles.certificationHeader}>
                  <div className={styles.certificationIcon}>{cert.icon}</div>
                  <h3 className={styles.certificationTitle}>{cert.name}</h3>
                </div>
                <p className={styles.certificationDescription}>{cert.description}</p>
                <span className={`${styles.statusBadge} ${cert.status === 'Certified' || cert.status === 'Compliant' || cert.status === 'Level 1' ? styles.statusCertified : ''}`}>
                  {cert.status}
                </span>
                <div className={styles.certificationDetails}>
                  {cert.details.map((detail, idx) => (
                    <div key={idx} className={styles.detailItem}>
                      <span className={styles.detailLabel}>{detail.label}:</span>
                      <span className={styles.detailValue}>{detail.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.frameworksSection}>
            <h2 className={styles.sectionTitle}>Security Frameworks</h2>
            <div className={styles.frameworksGrid}>
              {frameworks.map((framework, index) => (
                <div key={index} className={styles.frameworkCard}>
                  <div className={styles.frameworkIcon}>{framework.icon}</div>
                  <h3 className={styles.frameworkTitle}>{framework.name}</h3>
                  <p className={styles.frameworkDescription}>{framework.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.auditsSection}>
            <h2 className={styles.sectionTitle}>Recent Security Audits</h2>
            <div className={styles.auditsGrid}>
              {audits.map((audit, index) => (
                <div key={index} className={styles.auditCard}>
                  <div className={styles.auditHeader}>
                    <div className={styles.auditIcon}>{audit.icon}</div>
                    <h3 className={styles.auditTitle}>{audit.title}</h3>
                  </div>
                  <div className={styles.auditDate}>{audit.date}</div>
                  <p className={styles.auditDescription}>{audit.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.contactSection}>
            <h2 className={styles.contactTitle}>Questions About Compliance?</h2>
            <p className={styles.contactText}>
              Our security and compliance team is available to answer your questions and provide additional documentation.
            </p>
            <a href="/contact-us" className={styles.contactButton}>
              Contact Security Team
            </a>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}