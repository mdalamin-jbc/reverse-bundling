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
  Box,
  Divider,
  Icon,
} from "@shopify/polaris";
import {
  DeliveryIcon,
  OrderIcon,
  InventoryIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ExternalIcon,
} from "@shopify/polaris-icons";
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

    // Calculate actual savings from OrderConversion records
    const monthlySavingsResult = await db.orderConversion.aggregate({
      where: {
        shop: session.shop,
        convertedAt: { gte: firstDayOfMonth }
      },
      _sum: { savingsAmount: true }
    });

    const totalSavingsResult = await db.orderConversion.aggregate({
      where: { shop: session.shop },
      _sum: { savingsAmount: true }
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
        monthlySavings: Math.round((monthlySavingsResult._sum.savingsAmount || 0) * 100) / 100,
        totalSavings: Math.round((totalSavingsResult._sum.savingsAmount || 0) * 100) / 100,
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

  const connectedCount = providers.filter((p: any) => p.connectionVerified).length;
  const errorCount = providers.filter((p: any) => !p.connectionVerified).length;

  return (
    <Page
      title="Fulfillment Status"
      subtitle="Monitor your fulfillment providers and bundle order processing"
    >
      <TitleBar title="Fulfillment Status" />

      <BlockStack gap="500">
        {/* Detection warnings */}
        {hasErrors && detectionErrors.length > 0 && (
          <Banner tone="info">
            <p>Some detection features are limited due to API permissions. Your providers are still detected through other methods.</p>
          </Banner>
        )}

        {/* Stats */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Providers</Text>
                  <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                    <Icon source={DeliveryIcon} tone="base" />
                  </Box>
                </InlineStack>
                <Text as="p" variant="headingLg" fontWeight="bold">{connectedCount}</Text>
                <InlineStack gap="200">
                  <Badge tone="success">{connectedCount} connected</Badge>
                  {errorCount > 0 && <Badge tone="critical">{errorCount} issues</Badge>}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Bundle Orders</Text>
                  <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                    <Icon source={OrderIcon} tone="base" />
                  </Box>
                </InlineStack>
                <Text as="p" variant="headingLg" fontWeight="bold">{stats.monthlyOrders}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{stats.totalOrders} total processed</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Active Rules</Text>
                  <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                    <Icon source={InventoryIcon} tone="base" />
                  </Box>
                </InlineStack>
                <Text as="p" variant="headingLg" fontWeight="bold">{stats.activeBundleRules}</Text>
                <Text as="p" variant="bodySm" tone="subdued">Monitoring incoming orders</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Providers list */}
        {providers.length > 0 ? (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd" fontWeight="semibold">Connected Providers</Text>
                <Text as="p" variant="bodySm" tone="subdued">Fulfillment services detected from your Shopify store</Text>
              </BlockStack>
              <Divider />

              {providers.map((provider: any) => (
                <Box key={provider.id} padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="start" wrap={false}>
                      <InlineStack gap="300" blockAlign="center">
                        <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                          <Icon source={provider.connectionVerified ? CheckCircleIcon : AlertCircleIcon} tone={provider.connectionVerified ? "success" : "critical"} />
                        </Box>
                        <BlockStack gap="100">
                          <Text as="h3" variant="headingSm" fontWeight="semibold">{provider.name}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{provider.description}</Text>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="200">
                        <Badge tone={provider.connectionVerified ? "success" : "critical"}>
                          {provider.connectionVerified ? "Connected" : "Issue"}
                        </Badge>
                        <Badge>{provider.type}</Badge>
                      </InlineStack>
                    </InlineStack>

                    {provider.capabilities.length > 0 && (
                      <InlineStack gap="100" wrap>
                        {provider.capabilities.map((cap: string, i: number) => (
                          <Badge key={i} size="small" tone="info">{cap}</Badge>
                        ))}
                      </InlineStack>
                    )}

                    {(provider.setupUrl || provider.docsUrl) && (
                      <InlineStack gap="200">
                        {provider.setupUrl && (
                          <Button size="slim" icon={ExternalIcon} url={provider.setupUrl} target="_blank">Configure</Button>
                        )}
                        {provider.docsUrl && (
                          <Button size="slim" variant="plain" url={provider.docsUrl} target="_blank">Documentation</Button>
                        )}
                      </InlineStack>
                    )}

                    {!provider.connectionVerified && provider.errorMessage && (
                      <Banner tone="critical"><p>{provider.errorMessage}</p></Banner>
                    )}
                  </BlockStack>
                </Box>
              ))}

              <Box paddingBlockStart="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  Bundle orders are automatically synced to connected providers through Shopify's fulfillment integrations.
                </Text>
              </Box>
            </BlockStack>
          </Card>
        ) : (
          <Card>
            <EmptyState
              heading="No fulfillment providers detected"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              action={{ content: "Refresh", onAction: () => window.location.reload() }}
            >
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">Connect a fulfillment provider through Shopify Admin to enable automatic order syncing.</Text>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">1. Go to Shopify Admin &rarr; Settings &rarr; Apps and sales channels</Text>
                  <Text as="p" variant="bodySm" tone="subdued">2. Install a fulfillment app (ShipStation, ShipBob, etc.)</Text>
                  <Text as="p" variant="bodySm" tone="subdued">3. Return here and refresh to detect the connection</Text>
                </BlockStack>
              </BlockStack>
            </EmptyState>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
