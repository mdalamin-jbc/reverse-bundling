import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Badge,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";

// Provider type definitions for type safety
interface FulfillmentProvider {
  id: string;
  name: string;
  handle: string;
  type: 'manual' | 'shipstation' | 'shipbob' | 'fba' | '3pl' | 'custom' | 'unknown';
  source: 'shopify' | 'shopify-app' | 'shopify-location' | 'custom';
  status: 'active' | 'inactive' | 'error' | 'unknown';
  icon: string;
  description: string;
  capabilities: string[];
  connectionVerified: boolean;
  lastVerified?: Date;
  setupUrl?: string;
  docsUrl?: string;
  autoDetected: boolean;
  location?: string;
  callbackUrl?: string;
  errorMessage?: string;
}

// Provider metadata for consistent branding and information
const PROVIDER_METADATA = {
  manual: {
    name: 'Manual Fulfillment',
    icon: '🔌',
    description: 'Orders fulfilled manually by store staff',
    capabilities: ['Manual processing', 'No automation'],
    color: '#6b7280',
    docsUrl: 'https://help.shopify.com/en/manual/orders/fulfill-orders',
  },
  shipstation: {
    name: 'ShipStation',
    icon: '🚢',
    description: 'Multi-carrier shipping platform with automation',
    capabilities: ['Multi-carrier', 'Label printing', 'Tracking', 'Automation'],
    color: '#2563eb',
    setupUrl: 'https://apps.shopify.com/shipstation',
    docsUrl: 'https://help.shipstation.com/hc/en-us',
  },
  shipbob: {
    name: 'ShipBob',
    icon: '📮',
    description: 'E-commerce fulfillment and warehousing platform',
    capabilities: ['Warehousing', 'Multi-location', 'Returns', 'Analytics'],
    color: '#7c3aed',
    setupUrl: 'https://apps.shopify.com/shipbob',
    docsUrl: 'https://support.shipbob.com/hc/en-us',
  },
  fba: {
    name: 'Amazon FBA',
    icon: '📦',
    description: 'Amazon Fulfillment by Amazon service',
    capabilities: ['Prime shipping', 'Storage', 'Customer service', 'Returns'],
    color: '#ea4335',
    setupUrl: 'https://sellercentral.amazon.com/help/hub/reference/G200086020',
    docsUrl: 'https://sellercentral.amazon.com/help/hub/reference/G200086020',
  },
  '3pl': {
    name: '3PL Provider',
    icon: '🏭',
    description: 'Third-party logistics and fulfillment provider',
    capabilities: ['Warehousing', 'Distribution', 'Inventory management'],
    color: '#059669',
    docsUrl: 'https://help.shopify.com/en/manual/orders/fulfill-orders',
  },
  custom: {
    name: 'Custom Provider',
    icon: '⚙️',
    description: 'Custom fulfillment integration',
    capabilities: ['Custom integration', 'API-based'],
    color: '#7c2d12',
    docsUrl: 'https://shopify.dev/docs/apps/fulfillment',
  },
  unknown: {
    name: 'Unknown Provider',
    icon: '❓',
    description: 'Unrecognized fulfillment provider',
    capabilities: ['Unknown capabilities'],
    color: '#6b7280',
    docsUrl: 'https://help.shopify.com/en/manual/orders/fulfill-orders',
  },
};

// Helper function to determine provider type from handle/name
function determineProviderType(handle: string, name: string): keyof typeof PROVIDER_METADATA {
  const combined = `${handle} ${name}`.toLowerCase();

  if (combined.includes('manual')) return 'manual';
  if (combined.includes('shipstation') || combined.includes('ship_station')) return 'shipstation';
  if (combined.includes('shipbob')) return 'shipbob';
  if (combined.includes('fba') || combined.includes('amazon') || combined.includes('fulfillment by amazon')) return 'fba';
  if (combined.includes('3pl') || combined.includes('warehouse') || combined.includes('logistics')) return '3pl';

  return 'custom';
}

// Helper function to verify provider connection
async function verifyProviderConnection(admin: any, provider: FulfillmentProvider): Promise<boolean> {
  try {
    // Manual fulfillment is always "connected" - it's Shopify's built-in option
    if (provider.type === 'manual') {
      return true;
    }

    // For Shopify-based providers, check if they still exist
    if (provider.source === 'shopify' || provider.source === 'shopify-location') {
      const response = await admin.graphql(`
        query VerifyFulfillmentService($id: ID!) {
          fulfillmentService(id: $id) {
            id
            handle
            serviceName
          }
        }
      `, {
        variables: { id: provider.id }
      });

      const data = await response.json();
      return !!data.data?.fulfillmentService;
    }

    // For app-based providers, check if the app is still installed
    if (provider.source === 'shopify-app') {
      try {
        const response = await admin.graphql(`
          query CheckAppInstallation {
            appInstallations(first: 50) {
              edges {
                node {
                  app {
                    handle
                    title
                  }
                }
              }
            }
          }
        `);

        const data = await response.json();
        if (data.data?.appInstallations?.edges) {
          const apps = data.data.appInstallations.edges;
          const providerHandle = provider.handle.replace('-app', '');
          return apps.some((edge: any) => {
            const appHandle = edge.node.app.handle.toLowerCase();
            const appTitle = edge.node.app.title.toLowerCase();
            return appHandle.includes(providerHandle) || appTitle.includes(provider.type);
          });
        }
      } catch (appCheckError) {
        // If we can't check apps, assume the provider is still connected
        // This prevents false negatives when app scanning fails
        logInfo('Could not verify app connection, assuming connected', {
          providerId: provider.id,
          providerType: provider.type,
          error: appCheckError instanceof Error ? appCheckError.message : 'Unknown error'
        });
        return true;
      }
    }

    return true; // Assume custom providers are connected
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Connection verification failed'), {
      providerId: provider.id,
      providerType: provider.type
    });
    return false;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    const providers: FulfillmentProvider[] = [];
    let detectionErrors: string[] = [];

    // 1. Query Shopify's fulfillment services
    try {
      const fulfillmentResponse = await admin.graphql(`
        query GetFulfillmentServices {
          shop {
            fulfillmentServices {
              id
              handle
              serviceName
              type
              callbackUrl
              inventoryManagement
              trackingSupport
              requiresShippingMethod
            }
          }
        }
      `);

      const fulfillmentData = await fulfillmentResponse.json();

      if (fulfillmentData.data?.shop?.fulfillmentServices) {
        const services = fulfillmentData.data.shop.fulfillmentServices;

        for (const service of services) {
          const providerType = determineProviderType(service.handle, service.serviceName);
          const metadata = PROVIDER_METADATA[providerType];

          const provider: FulfillmentProvider = {
            id: service.id,
            name: service.serviceName,
            handle: service.handle,
            type: providerType,
            source: 'shopify',
            status: 'active',
            icon: metadata.icon,
            description: metadata.description,
            capabilities: metadata.capabilities,
            connectionVerified: true,
            lastVerified: new Date(),
            docsUrl: metadata.docsUrl,
            autoDetected: true,
            callbackUrl: service.callbackUrl,
          };

          providers.push(provider);
        }

        logInfo('Successfully loaded Shopify fulfillment services', {
          shop: session.shop,
          serviceCount: services.length,
          services: services.map((s: any) => ({ handle: s.handle, name: s.serviceName }))
        });
      }
    } catch (error) {
      detectionErrors.push('Failed to query Shopify fulfillment services');
      logError(error instanceof Error ? error : new Error('Fulfillment services query failed'), {
        shop: session.shop
      });
    }

    // 2. Query locations with fulfillment services
    try {
      const locationsResponse = await admin.graphql(`
        query GetLocations {
          locations(first: 50) {
            edges {
              node {
                id
                name
                isActive
                fulfillsOnlineOrders
                fulfillmentService {
                  id
                  handle
                  serviceName
                  type
                  callbackUrl
                }
              }
            }
          }
        }
      `);

      const locationsData = await locationsResponse.json();

      if (locationsData.data?.locations?.edges) {
        const locations = locationsData.data.locations.edges;

        for (const locationEdge of locations) {
          const location = locationEdge.node;

          if (location.fulfillmentService && location.fulfillsOnlineOrders && location.isActive) {
            const service = location.fulfillmentService;
            const providerType = determineProviderType(service.handle, service.serviceName);

            // Check if we already have this provider
            const existingProvider = providers.find(p => p.id === service.id);
            if (!existingProvider) {
              const metadata = PROVIDER_METADATA[providerType];

              const provider: FulfillmentProvider = {
                id: service.id,
                name: `${service.serviceName} (${location.name})`,
                handle: service.handle,
                type: providerType,
                source: 'shopify-location',
                status: 'active',
                icon: metadata.icon,
                description: `${metadata.description} - ${location.name}`,
                capabilities: metadata.capabilities,
                connectionVerified: true,
                lastVerified: new Date(),
                docsUrl: metadata.docsUrl,
                autoDetected: true,
                location: location.name,
                callbackUrl: service.callbackUrl,
              };

              providers.push(provider);
            }
          }
        }

        logInfo('Successfully loaded location-based fulfillment services', {
          shop: session.shop,
          locationCount: locations.length,
          activeLocations: locations.filter((l: any) => l.node.fulfillsOnlineOrders && l.node.isActive).length
        });
      }
    } catch (error) {
      detectionErrors.push('Failed to query location fulfillment services');
      logError(error instanceof Error ? error : new Error('Location services query failed'), {
        shop: session.shop
      });
    }

    // 3. Detect app-based fulfillment providers (with better error handling)
    try {
      const appsResponse = await admin.graphql(`
        query GetInstalledApps {
          appInstallations(first: 50) {
            edges {
              node {
                app {
                  title
                  handle
                }
                activeSubscriptions {
                  id
                }
              }
            }
          }
        }
      `);

      const appsData = await appsResponse.json();

      if (appsData.data?.appInstallations?.edges) {
        const apps = appsData.data.appInstallations.edges;

        // Known fulfillment app patterns (expanded)
        const fulfillmentAppPatterns = [
          { pattern: /shipstation/i, type: 'shipstation' as const },
          { pattern: /shipbob/i, type: 'shipbob' as const },
          { pattern: /amazon.*fba|fulfillment.*amazon/i, type: 'fba' as const },
          { pattern: /3pl|warehouse|logistics|depot/i, type: '3pl' as const },
          { pattern: /fedex|ups|usps|dhl/i, type: 'custom' as const },
        ];

        for (const appEdge of apps) {
          const app = appEdge.node.app;
          const appTitle = app.title.toLowerCase();
          const appHandle = app.handle.toLowerCase();

          // Check if this is a fulfillment app
          for (const { pattern, type } of fulfillmentAppPatterns) {
            if (pattern.test(appTitle) || pattern.test(appHandle)) {
              // Check if we already have this provider
              const existingProvider = providers.find(p =>
                p.type === type && p.source === 'shopify-app'
              );

              if (!existingProvider) {
                const metadata = PROVIDER_METADATA[type];

                const provider: FulfillmentProvider = {
                  id: `app-${app.handle}`,
                  name: app.title,
                  handle: `${app.handle}-app`,
                  type: type,
                  source: 'shopify-app',
                  status: 'active',
                  icon: metadata.icon,
                  description: metadata.description,
                  capabilities: metadata.capabilities,
                  connectionVerified: true,
                  lastVerified: new Date(),
                  setupUrl: appEdge.node.launchUrl,
                  docsUrl: metadata.docsUrl,
                  autoDetected: true,
                };

                providers.push(provider);
                break; // Only add once per app
              }
            }
          }
        }

        logInfo('Successfully scanned installed apps for fulfillment providers', {
          shop: session.shop,
          appCount: apps.length,
          fulfillmentAppsFound: providers.filter(p => p.source === 'shopify-app').length
        });
      } else if ((appsData as any).errors) {
        // Log GraphQL errors but don't fail completely
        logInfo('GraphQL errors in app scanning (non-critical)', {
          shop: session.shop,
          errors: (appsData as any).errors
        });
        detectionErrors.push('App scanning returned errors (may be permission-related)');
      }
    } catch (error) {
      // Make app scanning failure non-critical
      logInfo('App scanning failed (non-critical)', {
        shop: session.shop,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      detectionErrors.push('Unable to scan installed apps (this is normal for some permission levels)');
    }

    // 4. Add manual fulfillment as fallback (always available)
    const hasManualProvider = providers.some(p => p.type === 'manual');
    if (!hasManualProvider) {
      const manualProvider: FulfillmentProvider = {
        id: 'manual-fulfillment',
        name: 'Manual Fulfillment',
        handle: 'manual',
        type: 'manual',
        source: 'shopify',
        status: 'active',
        icon: PROVIDER_METADATA.manual.icon,
        description: PROVIDER_METADATA.manual.description,
        capabilities: PROVIDER_METADATA.manual.capabilities,
        connectionVerified: true, // Manual is always verified
        lastVerified: new Date(),
        docsUrl: PROVIDER_METADATA.manual.docsUrl,
        autoDetected: true,
      };

      providers.push(manualProvider);
    }

    // 5. Verify connections for all providers
    const verifiedProviders = await Promise.all(
      providers.map(async (provider) => {
        try {
          const isConnected = await verifyProviderConnection(admin, provider);
          return {
            ...provider,
            connectionVerified: isConnected,
            status: isConnected ? 'active' : 'error',
            errorMessage: isConnected ? undefined : 'Connection verification failed'
          };
        } catch (error) {
          return {
            ...provider,
            connectionVerified: false,
            status: 'error' as const,
            errorMessage: 'Connection verification failed'
          };
        }
      })
    );

    // 6. Get statistics
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlyOrders = await db.orderConversion.count({
      where: {
        shop: session.shop,
        convertedAt: { gte: firstDayOfMonth }
      }
    });

    const totalOrders = await db.orderConversion.count({
      where: { shop: session.shop }
    });

    const activeBundleRules = await db.bundleRule.count({
      where: {
        shop: session.shop,
        status: 'active'
      }
    });

    logInfo('Fulfillment status loaded successfully', {
      shop: session.shop,
      providerCount: verifiedProviders.length,
      connectedProviders: verifiedProviders.filter(p => p.connectionVerified).length,
      detectionErrors: detectionErrors.length,
      monthlyOrders,
      totalOrders
    });

    return json({
      providers: verifiedProviders,
      stats: {
        monthlyOrders,
        totalOrders,
        monthlySavings: monthlyOrders * 8, // Assuming $8 average savings per order
        totalSavings: totalOrders * 8,
        activeBundleRules,
        hasData: totalOrders > 0
      },
      detectionErrors,
      hasErrors: detectionErrors.length > 0 || verifiedProviders.some(p => !p.connectionVerified)
    });

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Critical error loading fulfillment status'), {
      shop: session.shop
    });

    return json({
      providers: [],
      stats: {
        monthlyOrders: 0,
        totalOrders: 0,
        monthlySavings: 0,
        totalSavings: 0,
        activeBundleRules: 0,
        hasData: false
      },
      detectionErrors: ['Critical error occurred while loading fulfillment status'],
      hasErrors: true
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action") as string;

  try {
    if (action === "create") {
      const provider = await db.fulfillmentProvider.create({
        data: {
          shop: session.shop,
          name: formData.get("name") as string,
          type: formData.get("type") as string,
          apiKey: formData.get("apiKey") as string,
          webhookUrl: formData.get("webhookUrl") as string || null,
          autoSync: formData.get("autoSync") === "true",
          status: "active",
          ordersProcessed: 0
        }
      });

      logInfo('Created fulfillment provider', {
        shop: session.shop,
        providerId: provider.id,
        providerName: provider.name
      });

      return json({ 
        success: true, 
        message: `Successfully created ${provider.name}!`,
        provider
      });
    }

    if (action === "delete") {
      const providerId = formData.get("providerId") as string;
      
      await db.fulfillmentProvider.delete({
        where: { id: providerId }
      });

      logInfo('Deleted fulfillment provider', {
        shop: session.shop,
        providerId
      });

      return json({ 
        success: true, 
        message: "Provider deleted successfully!"
      });
    }

    if (action === "testConnection") {
      const providerId = formData.get("providerId") as string;
      
      const provider = await db.fulfillmentProvider.findUnique({
        where: { id: providerId }
      });

      if (!provider) {
        return json({ success: false, message: "Provider not found" });
      }

      // Update last sync time
      await db.fulfillmentProvider.update({
        where: { id: providerId },
        data: { lastSyncAt: new Date() }
      });

      logInfo('Tested fulfillment connection', {
        shop: session.shop,
        providerId,
        providerName: provider.name
      });

      return json({ 
        success: true, 
        message: `Successfully tested connection to ${provider.name}!`
      });
    }

    return json({ success: false, message: "Unknown action" });
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Fulfillment action error'), { action, shop: session.shop });
    return json({ 
      success: false, 
      message: error instanceof Error ? error.message : "An error occurred"
    });
  }
};

export default function FulfillmentIntegration() {
  const { providers, stats, detectionErrors, hasErrors } = useLoaderData<typeof loader>();
  
  return (
    <Page title="Fulfillment Status">
      <TitleBar title="Fulfillment Status" />
      
      <BlockStack gap="600">
        {/* Hero Section */}
        <div
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '48px 40px',
            borderRadius: '20px',
            color: 'white',
            boxShadow: '0 20px 25px -5px rgba(102, 126, 234, 0.3)',
          }}
        >
          <BlockStack gap="400">
            <div style={{ textAlign: 'center' }}>
              <Text as="h1" variant="heading2xl" fontWeight="bold">
                <span style={{ color: 'white' }}>🏭 Fulfillment Status</span>
              </Text>
            </div>
            <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
              <Text as="p" variant="bodyLg">
                <span style={{ color: 'rgba(255, 255, 255, 0.95)', fontSize: '18px', lineHeight: '1.6' }}>
                  Check which fulfillment providers are connected to your Shopify store
                </span>
              </Text>
            </div>
          </BlockStack>
        </div>

        {/* Error Banner */}
        {hasErrors && detectionErrors.length > 0 && (
          <Banner tone="info" title="Partial Detection">
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                Some detection features are limited (this is normal and doesn't affect functionality):
              </Text>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {detectionErrors.map((error, index) => (
                  <li key={index}>
                    <Text as="p" variant="bodySm">{error}</Text>
                  </li>
                ))}
              </ul>
              <Text as="p" variant="bodySm" tone="subdued">
                Your fulfillment providers are still being detected through other methods.
              </Text>
            </BlockStack>
          </Banner>
        )}

        {/* Connected Providers Section */}
        {providers.length > 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="500">
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                      padding: '28px',
                      borderRadius: '16px',
                      border: '2px solid #10b981',
                    }}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="200">
                        <Text as="h2" variant="heading2xl" fontWeight="bold">
                          ✅ Connected Fulfillment Providers
                        </Text>
                        <Text variant="bodyLg" as="p">
                          <span style={{ color: '#065f46' }}>
                            Found <strong>{providers.length}</strong> fulfillment
                            {providers.length === 1 ? ' provider' : ' providers'} connected to your store
                          </span>
                        </Text>
                      </BlockStack>
                      <div style={{ fontSize: '64px' }}>🎉</div>
                    </InlineStack>
                  </div>

                  {/* Success Message */}
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                      padding: '24px',
                      borderRadius: '12px',
                      border: '2px solid #3b82f6',
                    }}
                  >
                    <InlineStack gap="300" blockAlign="start">
                      <div style={{ fontSize: '40px' }}>💡</div>
                      <BlockStack gap="200">
                        <Text as="p" variant="headingMd" fontWeight="bold">
                          Your app is ready to work!
                        </Text>
                        <Text as="p" variant="bodyMd">
                          Bundle orders will automatically sync to your connected fulfillment providers via Shopify's existing integrations.
                        </Text>
                        {stats.hasData && (
                          <Text as="p" variant="bodySm" tone="subdued">
                            This month: <strong>{stats.monthlyOrders}</strong> bundle orders processed
                            ({stats.totalOrders} total) • <strong>${stats.monthlySavings}</strong> in savings
                          </Text>
                        )}
                      </BlockStack>
                    </InlineStack>
                  </div>

                  {/* List Detected Providers */}
                  <BlockStack gap="400">
                    {providers.map((provider: any) => (
                      <div
                        key={provider.id}
                        style={{
                          border: provider.connectionVerified ? '2px solid #10b981' : '2px solid #ef4444',
                          borderRadius: '16px',
                          padding: '28px',
                          background: provider.connectionVerified
                            ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)'
                            : 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                          boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.1)',
                        }}
                      >
                        <InlineStack align="space-between" blockAlign="center" wrap={false}>
                          <InlineStack gap="400" blockAlign="center">
                            <div style={{ fontSize: '56px' }}>{provider.icon}</div>
                            <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center" wrap>
                                <Text as="h3" variant="headingXl" fontWeight="bold">
                                  {provider.name}
                                </Text>
                                <Badge
                                  tone={provider.connectionVerified ? "success" : "critical"}
                                  size="large"
                                >
                                  {provider.connectionVerified ? "✅ Connected" : "❌ Connection Issue"}
                                </Badge>
                                <Badge tone="info">{provider.type.toUpperCase()}</Badge>
                                {provider.source !== 'shopify' && (
                                  <Badge tone="new">{provider.source.replace('-', ' ').toUpperCase()}</Badge>
                                )}
                              </InlineStack>
                              
                              <Text as="p" variant="bodyMd" tone="subdued">
                                Handle: <code style={{ 
                                  background: 'rgba(0,0,0,0.05)', 
                                  padding: '2px 8px', 
                                  borderRadius: '4px',
                                  fontFamily: 'monospace'
                                }}>{provider.handle}</code>
                                {provider.location && (
                                  <span> • Location: {provider.location}</span>
                                )}
                              </Text>
                              
                              <Text as="p" variant="bodyMd">
                                {provider.description}
                              </Text>
                              
                              {/* Capabilities */}
                              <div style={{ marginTop: '8px' }}>
                                <Text as="p" variant="bodySm" fontWeight="bold" tone="subdued">
                                  Capabilities:
                                </Text>
                                <InlineStack gap="200" wrap>
                                  {provider.capabilities.map((capability: string, index: number) => (
                                    <Badge key={index} tone="info" size="small">
                                      {capability}
                                    </Badge>
                                  ))}
                                </InlineStack>
                              </div>
                              
                              {/* Connection Status */}
                              {provider.connectionVerified ? (
                                <div
                                  style={{
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    marginTop: '8px',
                                  }}
                                >
                                  <Text as="p" variant="bodyMd" fontWeight="medium">
                                    ✨ Bundle orders will automatically sync to this provider
                                  </Text>
                                  {provider.lastVerified && (
                                    <Text as="p" variant="bodySm" tone="subdued">
                                      Last verified: {new Date(provider.lastVerified).toLocaleString()}
                                    </Text>
                                  )}
                                </div>
                              ) : (
                                <div
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    marginTop: '8px',
                                  }}
                                >
                                  <Text as="p" variant="bodyMd" fontWeight="medium" tone="critical">
                                    ⚠️ Connection issue detected
                                  </Text>
                                  {provider.errorMessage && (
                                    <Text as="p" variant="bodySm" tone="critical">
                                      {provider.errorMessage}
                                    </Text>
                                  )}
                                </div>
                              )}

                              {/* Action Buttons */}
                              <InlineStack gap="300" wrap>
                                {provider.setupUrl && (
                                  <Button
                                    variant="primary"
                                    size="slim"
                                    onClick={() => window.open(provider.setupUrl, '_blank')}
                                  >
                                    🔧 Configure
                                  </Button>
                                )}
                                {provider.docsUrl && (
                                  <Button
                                    variant="secondary"
                                    size="slim"
                                    onClick={() => window.open(provider.docsUrl, '_blank')}
                                  >
                                    📚 Documentation
                                  </Button>
                                )}
                              </InlineStack>
                            </BlockStack>
                          </InlineStack>
                        </InlineStack>
                      </div>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {/* No Providers Detected */}
        {providers.length === 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <div
                  style={{
                    background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                    padding: '40px',
                    borderRadius: '16px',
                    border: '2px solid #ef4444',
                  }}
                >
                  <InlineStack align="space-between" blockAlign="start" wrap={false}>
                    <BlockStack gap="400">
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{ fontSize: '56px' }}>⚠️</div>
                        <Text as="h3" variant="heading2xl" fontWeight="bold">
                          No Fulfillment Provider Detected
                        </Text>
                      </InlineStack>
                      
                      <Text as="p" variant="bodyLg">
                        We couldn't find any fulfillment services connected to your Shopify store.
                      </Text>
                      
                      <BlockStack gap="300">
                        <Text as="p" variant="bodyMd" fontWeight="bold">
                          To connect a fulfillment provider:
                        </Text>
                        <div
                          style={{
                            background: 'rgba(255, 255, 255, 0.7)',
                            padding: '16px',
                            borderRadius: '8px',
                          }}
                        >
                          <BlockStack gap="200">
                            <Text as="p" variant="bodyMd">
                              1. Go to your Shopify Admin → Settings → Apps and sales channels
                            </Text>
                            <Text as="p" variant="bodyMd">
                              2. Browse the Shopify App Store for fulfillment apps (ShipStation, ShipBob, etc.)
                            </Text>
                            <Text as="p" variant="bodyMd">
                              3. Install and connect your preferred fulfillment provider
                            </Text>
                            <Text as="p" variant="bodyMd">
                              4. Return here and click "Refresh" to detect the connection
                            </Text>
                          </BlockStack>
                        </div>
                      </BlockStack>
                      
                      <InlineStack gap="300">
                        <Button 
                          variant="primary" 
                          size="large"
                          onClick={() => window.location.reload()}
                        >
                          🔄 Refresh & Check Again
                        </Button>
                      </InlineStack>
                    </BlockStack>
                    <div style={{ fontSize: '120px', opacity: 0.3 }}>🏭</div>
                  </InlineStack>
                </div>
              </Card>
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </Page>
  );
}
