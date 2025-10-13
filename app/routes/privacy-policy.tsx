import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Privacy Policy - Reverse Bundle Pro" },
    { name: "description", content: "Privacy policy for Reverse Bundle Pro - Enterprise fulfillment optimization for Shopify stores" },
  ];
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="px-6 py-8 sm:px-10">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
              <p className="text-lg text-gray-600">Reverse Bundle Pro</p>
              <p className="text-sm text-gray-500 mt-2">
                Effective Date: October 14, 2025 | Last Updated: October 14, 2025
              </p>
            </div>

            <div className="prose prose-lg max-w-none text-gray-700">
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Introduction</h2>
                <p className="mb-4">
                  Reverse Bundle Pro ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Shopify application.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Information We Collect</h2>

                <h3 className="text-xl font-medium text-gray-800 mb-2">Shopify Store Data</h3>
                <p className="mb-4">When you install our app, we collect:</p>
                <ul className="list-disc pl-6 mb-4">
                  <li>Store Information: Store name, domain, owner email, timezone</li>
                  <li>Order Data: Order details, line items, SKUs, quantities (for bundle detection)</li>
                  <li>Product Data: Product titles, variants, SKUs (for rule creation)</li>
                  <li>Usage Analytics: Feature usage, page views, button clicks</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-800 mb-2">Automatically Collected Information</h3>
                <ul className="list-disc pl-6 mb-4">
                  <li>Log Data: IP addresses, browser type, timestamps, referring URLs</li>
                  <li>Cookies: Session cookies for authentication (required for app functionality)</li>
                  <li>Performance Data: API response times, error rates</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">How We Use Your Information</h2>
                <p className="mb-4">We use the collected information to:</p>
                <ul className="list-disc pl-6 mb-4">
                  <li><strong>Provide Core Functionality:</strong> Detect bundle opportunities, create/manage bundling rules, generate cost savings reports, process order conversions</li>
                  <li><strong>Improve Our Service:</strong> Analyze usage patterns, debug issues, optimize performance</li>
                  <li><strong>Communication:</strong> Send service updates, notify about features, provide support</li>
                  <li><strong>Compliance:</strong> Meet legal obligations, enforce terms, protect against fraud</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Data Storage and Security</h2>

                <h3 className="text-xl font-medium text-gray-800 mb-2">Storage</h3>
                <ul className="list-disc pl-6 mb-4">
                  <li><strong>Database:</strong> Encrypted PostgreSQL database hosted on secure cloud infrastructure</li>
                  <li><strong>Backups:</strong> Daily automated backups with 30-day retention</li>
                  <li><strong>Location:</strong> Data stored in secure US data centers</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-800 mb-2">Security Measures</h3>
                <ul className="list-disc pl-6 mb-4">
                  <li>✅ End-to-end encryption (TLS/SSL)</li>
                  <li>✅ Encrypted database connections</li>
                  <li>✅ Regular security audits</li>
                  <li>✅ Access control and authentication</li>
                  <li>✅ Secure API communication with Shopify</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Data Sharing and Disclosure</h2>
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                  <p className="text-blue-700 font-medium">We DO NOT sell your data to third parties.</p>
                </div>
                <p className="mb-4">We may share your information only in these limited circumstances:</p>
                <ul className="list-disc pl-6 mb-4">
                  <li><strong>With Your Consent:</strong> When you explicitly authorize us</li>
                  <li><strong>Service Providers:</strong> Cloud hosting, error monitoring (aggregate, anonymized data only)</li>
                  <li><strong>Legal Requirements:</strong> To comply with laws, respond to requests, protect rights</li>
                  <li><strong>Business Transfers:</strong> In connection with mergers, acquisitions, or sales</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Your Rights</h2>
                <p className="mb-4">You have the right to:</p>
                <ul className="list-disc pl-6 mb-4">
                  <li><strong>Access Your Data:</strong> Request a copy of all data we store</li>
                  <li><strong>Correct Your Data:</strong> Update or correct inaccurate information</li>
                  <li><strong>Delete Your Data:</strong> Request complete deletion (by uninstalling the app)</li>
                  <li><strong>Export Your Data:</strong> Receive your data in a portable format</li>
                  <li><strong>Opt-Out:</strong> Disable analytics, opt-out of marketing communications</li>
                </ul>
                <p className="text-sm text-gray-600 bg-gray-100 p-3 rounded">
                  <strong>To exercise these rights:</strong> Email privacy@reversebundlepro.com
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">GDPR Compliance (EU Users)</h2>
                <p className="mb-4">If you are located in the European Economic Area (EEA), you have additional rights:</p>
                <ul className="list-disc pl-6 mb-4">
                  <li><strong>Legal Basis:</strong> Contract performance and legitimate interests</li>
                  <li><strong>Data Controller:</strong> Reverse Bundle Pro is the data controller</li>
                  <li><strong>Right to Lodge Complaint:</strong> File complaints with local authorities</li>
                  <li><strong>Data Transfers:</strong> EU-approved safeguards for international transfers</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">CCPA Compliance (California Users)</h2>
                <p className="mb-4">California residents have specific rights under CCPA:</p>
                <ul className="list-disc pl-6 mb-4">
                  <li>Right to know what personal information we collect</li>
                  <li>Right to know if we sell personal information (We don't!)</li>
                  <li>Right to access, correct, and delete your information</li>
                  <li>Right to non-discrimination for exercising your rights</li>
                </ul>
                <p className="text-sm text-gray-600 bg-gray-100 p-3 rounded">
                  <strong>California Residents:</strong> Email privacy@reversebundlepro.com with "California Privacy Request"
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Data Retention</h2>
                <ul className="list-disc pl-6 mb-4">
                  <li><strong>Active Stores:</strong> Data retained while app is installed</li>
                  <li><strong>Uninstalled Stores:</strong> All data deleted within 30 days</li>
                  <li><strong>Backup Data:</strong> Permanently deleted after 30-day retention</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Cookies and Tracking</h2>
                <h3 className="text-xl font-medium text-gray-800 mb-2">Required Cookies</h3>
                <ul className="list-disc pl-6 mb-4">
                  <li><strong>Session Cookies:</strong> Essential for authentication (cannot be disabled)</li>
                  <li><strong>Security Cookies:</strong> CSRF protection</li>
                </ul>

                <h3 className="text-xl font-medium text-gray-800 mb-2">Optional Cookies</h3>
                <ul className="list-disc pl-6 mb-4">
                  <li><strong>Analytics Cookies:</strong> Track feature usage (can be disabled)</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Changes to This Privacy Policy</h2>
                <p className="mb-4">
                  We may update this Privacy Policy periodically. We will notify you of material changes by:
                </p>
                <ul className="list-disc pl-6 mb-4">
                  <li>Posting the new policy on our website</li>
                  <li>Sending email notification to store owners</li>
                  <li>Showing in-app notifications</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Contact Us</h2>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="mb-2"><strong>Email:</strong> privacy@reversebundlepro.com</p>
                  <p className="mb-2"><strong>Website:</strong> https://reversebundlepro.com</p>
                  <p className="mb-0"><strong>Response Time:</strong> We aim to respond within 48 hours</p>
                </div>
              </section>

              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">Data Protection Officer</h2>
                <p className="mb-4">For GDPR-related inquiries:</p>
                <p className="text-sm text-gray-600 bg-gray-100 p-3 rounded">
                  <strong>Email:</strong> dpo@reversebundlepro.com
                </p>
              </section>

              <div className="border-t pt-8 mt-8">
                <p className="text-center text-gray-600">
                  <strong>Reverse Bundle Pro</strong> - Building trust through transparency and security.
                </p>
                <p className="text-center text-sm text-gray-500 mt-2">
                  Last Updated: October 14, 2025
                </p>
              </div>

              <div className="bg-green-50 border-l-4 border-green-400 p-4 mt-8">
                <p className="text-green-700">
                  <strong>Acknowledgment:</strong> By installing and using Reverse Bundle Pro, you acknowledge that you have read and understood this Privacy Policy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
