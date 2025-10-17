import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Integrations - Reverse Bundling" },
    { name: "description", content: "Connect Reverse Bundling with your favorite tools and platforms" },
  ];
};

export default function Integrations() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Powerful Integrations</h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Connect Reverse Bundling with your existing tools and automate your entire bundling workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          {/* Shopify */}
          <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Shopify</h3>
                <span className="text-sm text-green-600 font-medium">Native Integration</span>
              </div>
            </div>
            <p className="text-gray-600 mb-4">
              Seamless integration with Shopify stores. Automatically sync products, orders, and inventory.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">Products</span>
              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">Orders</span>
              <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">Inventory</span>
            </div>
          </div>

          {/* ShipStation */}
          <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">ShipStation</h3>
                <span className="text-sm text-blue-600 font-medium">Shipping Integration</span>
              </div>
            </div>
            <p className="text-gray-600 mb-4">
              Automate order fulfillment and shipping workflows. Sync tracking numbers and order status.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Fulfillment</span>
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Tracking</span>
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">Automation</span>
            </div>
          </div>

          {/* FBA */}
          <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-8 h-8 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Fulfillment by Amazon</h3>
                <span className="text-sm text-orange-600 font-medium">FBA Integration</span>
              </div>
            </div>
            <p className="text-gray-600 mb-4">
              Connect with Amazon's fulfillment network for seamless FBA order processing and inventory sync.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">FBA</span>
              <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">Inventory</span>
              <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">Orders</span>
            </div>
          </div>

          {/* EDI Systems */}
          <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-8 h-8 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-4h5v4zm0-6H7V7h5v4zm7 6h-5v-4h5v4zm0-6h-5V7h5v4z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">EDI Systems</h3>
                <span className="text-sm text-purple-600 font-medium">Enterprise Integration</span>
              </div>
            </div>
            <p className="text-gray-600 mb-4">
              Connect with enterprise EDI systems for automated B2B order processing and inventory management.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded-full">EDI</span>
              <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded-full">B2B</span>
              <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded-full">Automation</span>
            </div>
          </div>

          {/* Slack */}
          <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-8 h-8 text-indigo-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.194 14.644c0 1.16-.943 2.107-2.103 2.107a2.11 2.11 0 0 1-2.104-2.107 2.11 2.11 0 0 1 2.104-2.106c.15 0 .29.027.43.067v2.046a1.68 1.68 0 0 0-.43-.067zm0 0"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Slack</h3>
                <span className="text-sm text-indigo-600 font-medium">Notifications</span>
              </div>
            </div>
            <p className="text-gray-600 mb-4">
              Get real-time notifications about bundle performance, order conversions, and system alerts.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-pink-100 text-pink-800 text-xs rounded-full">Notifications</span>
              <span className="px-2 py-1 bg-pink-100 text-pink-800 text-xs rounded-full">Alerts</span>
              <span className="px-2 py-1 bg-pink-800 text-xs rounded-full">Real-time</span>
            </div>
          </div>

          {/* Zapier */}
          <div className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mr-4">
                <svg className="w-8 h-8 text-yellow-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Zapier</h3>
                <span className="text-sm text-yellow-600 font-medium">Automation</span>
              </div>
            </div>
            <p className="text-gray-600 mb-4">
              Connect with 3,000+ apps through Zapier. Automate workflows and integrate with your favorite tools.
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-cyan-100 text-cyan-800 text-xs rounded-full">Automation</span>
              <span className="px-2 py-1 bg-cyan-100 text-cyan-800 text-xs rounded-full">Workflows</span>
              <span className="px-2 py-1 bg-cyan-800 text-xs rounded-full">3,000+ Apps</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Need a Custom Integration?</h2>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
            Don't see your platform listed? Our development team can create custom integrations
            tailored to your specific business needs.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/contact-us" className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
              Request Integration
            </a>
            <a href="/documentation" className="bg-gray-100 text-gray-900 px-6 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors">
              View API Docs
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}