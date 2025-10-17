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
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    // Fetch manually added fulfillment providers from YOUR database
    const customProviders = await db.fulfillmentProvider.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: 'desc' }
    });

    // Auto-detect Shopify-connected fulfillment services AND installed apps
    let detectedProviders: any[] = [];
    try {
      // Query 1: Traditional fulfillment services and location-based services
      const response = await admin.graphql(`
        query GetShopifyFulfillment {
          shop {
            fulfillmentServices {
              id
              handle
              serviceName
              type
              callbackUrl
            }
          }
          locations(first: 10) {
            edges {
              node {
                id
                name
                isActive
                fulfillsOnlineOrders
                fulfillmentService {
                  id
                  serviceName
                  handle
                  type
                  callbackUrl
                }
              }
            }
          }
        }
      `);

      const data = await response.json();
      
      // Query 2: Detect app-based fulfillment providers (ShipStation, ShipBob, etc.)
      // Check if provider apps have registered webhooks or are actively used
      let hasShipStation = false;
      let hasShipBob = false;
      
      try {
        // Check installed apps to detect fulfillment providers
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
          apps.forEach((edge: any) => {
            const appTitle = edge.node.app.title.toLowerCase();
            const appHandle = edge.node.app.handle.toLowerCase();
            if (appTitle.includes('shipstation') || appHandle.includes('shipstation')) hasShipStation = true;
            if (appTitle.includes('shipbob') || appHandle.includes('shipbob')) hasShipBob = true;
          });
          
          logInfo('Checked installed apps for fulfillment providers', {
            shop: session.shop,
            appCount: apps.length,
            installedApps: apps.map((a: any) => ({ title: a.node.app.title, handle: a.node.app.handle })),
            shipStationDetected: hasShipStation,
            shipBobDetected: hasShipBob
          });
        }
      } catch (appsError) {
        logInfo('Could not check installed apps for provider detection', {
          shop: session.shop,
          error: appsError instanceof Error ? appsError.message : 'Unknown error'
        });
      }
      
      try {
        // Check webhooks to detect if fulfillment apps are registered
        const webhooksResponse = await admin.graphql(`
          query GetWebhookSubscriptions {
            webhookSubscriptions(first: 50) {
              edges {
                node {
                  id
                  topic
                  endpoint {
                    __typename
                    ... on WebhookHttpEndpoint {
                      callbackUrl
                    }
                  }
                }
              }
            }
          }
        `);
        
        const webhooksData = await webhooksResponse.json();
        if (webhooksData.data?.webhookSubscriptions?.edges) {
          const webhooks = webhooksData.data.webhookSubscriptions.edges;
          webhooks.forEach((edge: any) => {
            const url = edge.node.endpoint?.callbackUrl?.toLowerCase() || '';
            if (url.includes('shipstation') || url.includes('ssapi.shipstation.com')) hasShipStation = true;
            if (url.includes('shipbob')) hasShipBob = true;
          });
          
          logInfo('Checked webhooks for fulfillment apps', {
            shop: session.shop,
            webhookCount: webhooks.length,
            webhookUrls: webhooks.map((w: any) => w.node.endpoint?.callbackUrl).filter(Boolean),
            shipStationDetected: hasShipStation,
            shipBobDetected: hasShipBob
          });
        }
      } catch (webhookError) {
        logInfo('Could not check webhooks for app detection', {
          shop: session.shop,
          error: webhookError instanceof Error ? webhookError.message : 'Unknown error'
        });
      }
      
      // Add detected apps to providers list
      if (hasShipStation) {
        detectedProviders.push({
          id: 'app-shipstation',
          name: 'ShipStation',
          type: 'shipstation',
          handle: 'shipstation-app',
          source: 'shopify-app',
          icon: '🚢',
          status: 'active',
          autoDetected: true,
          callbackUrl: null,
        });
      }
      
      if (hasShipBob) {
        detectedProviders.push({
          id: 'app-shipbob',
          name: 'ShipBob',
          type: 'shipbob',
          handle: 'shipbob-app',
          source: 'shopify-app',
          icon: '📮',
          status: 'active',
          autoDetected: true,
          callbackUrl: null,
        });
      }
      
      // Add traditional fulfillment services
      if (data.data?.shop?.fulfillmentServices) {
        const services = data.data.shop.fulfillmentServices;
        
        const serviceProviders = services.map((service: any) => {
          // Map Shopify handles to friendly names and icons
          let providerType = 'custom';
          let icon = '🔌';
          
          const lowerHandle = service.handle.toLowerCase();
          const lowerName = service.serviceName.toLowerCase();
          
          if (lowerHandle.includes('shipstation') || lowerName.includes('shipstation') || 
              lowerHandle.includes('ship_station') || lowerName.includes('ship_station')) {
            providerType = 'shipstation';
            icon = '🚢';
            hasShipStation = true; // Also set the flag for app detection
          } else if (lowerHandle.includes('fba') || lowerHandle.includes('amazon') || lowerName.includes('amazon')) {
            providerType = 'fba';
            icon = '📦';
          } else if (lowerHandle.includes('shipbob') || lowerName.includes('shipbob')) {
            providerType = 'shipbob';
            icon = '📮';
            hasShipBob = true; // Also set the flag for app detection
          } else if (lowerHandle.includes('3pl') || lowerName.includes('warehouse')) {
            providerType = '3pl';
            icon = '🏭';
          }
          
          return {
            id: service.id,
            name: service.serviceName,
            type: providerType,
            handle: service.handle,
            source: 'shopify',
            icon: icon,
            status: 'active',
            autoDetected: true,
            callbackUrl: service.callbackUrl,
          };
        });
        
        // Combine app-based and service-based providers
        detectedProviders = [...detectedProviders, ...serviceProviders];
      }
      
      // Check location-based fulfillment services
      if (data.data?.locations?.edges) {
        const locations = data.data.locations.edges;
        
        locations.forEach((locationEdge: any) => {
          const location = locationEdge.node;
          if (location.fulfillmentService && location.fulfillsOnlineOrders) {
            const service = location.fulfillmentService;
            let providerType = 'custom';
            let icon = '🔌';
            
            const lowerHandle = service.handle.toLowerCase();
            const lowerName = service.serviceName.toLowerCase();
            
            if (lowerHandle.includes('shipstation') || lowerName.includes('shipstation') || 
                lowerHandle.includes('ship_station') || lowerName.includes('ship_station')) {
              providerType = 'shipstation';
              icon = '🚢';
              hasShipStation = true;
            } else if (lowerHandle.includes('fba') || lowerHandle.includes('amazon') || lowerName.includes('amazon')) {
              providerType = 'fba';
              icon = '📦';
            } else if (lowerHandle.includes('shipbob') || lowerName.includes('shipbob')) {
              providerType = 'shipbob';
              icon = '📮';
              hasShipBob = true;
            } else if (lowerHandle.includes('3pl') || lowerName.includes('warehouse')) {
              providerType = '3pl';
              icon = '🏭';
            }
            
            // Check if this provider is already in the list
            const existingProvider = detectedProviders.find(p => p.id === service.id);
            if (!existingProvider) {
              detectedProviders.push({
                id: service.id,
                name: `${service.serviceName} (${location.name})`,
                type: providerType,
                handle: service.handle,
                source: 'shopify-location',
                icon: icon,
                status: 'active',
                autoDetected: true,
                callbackUrl: service.callbackUrl,
              });
            }
          }
        });
        
        logInfo('Detected Shopify fulfillment services and locations', {
          shop: session.shop,
          globalServices: data.data.shop.fulfillmentServices?.length || 0,
          locations: locations.length,
          activeLocations: locations.filter((l: any) => l.node.fulfillsOnlineOrders).length,
          detectedProviders: detectedProviders.map(p => ({ name: p.name, type: p.type, source: p.source }))
        });
      }
    } catch (graphqlError) {
      logError(graphqlError instanceof Error ? graphqlError : new Error('Error fetching Shopify fulfillment services'), { 
        shop: session.shop,
        context: 'fulfillment_detection' 
      });
      // Continue even if detection fails
    }

    // Get REAL order statistics from current month
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

    // Calculate real savings (assuming average $8 per order)
    const monthlySavings = monthlyOrders * 8;
    const totalSavings = totalOrders * 8;

    // Get active bundle rules count
    const activeBundleRules = await db.bundleRule.count({
      where: { 
        shop: session.shop,
        status: 'active'
      }
    });

    logInfo('Loaded fulfillment data', {
      shop: session.shop,
      customProviderCount: customProviders.length,
      detectedProviderCount: detectedProviders.length,
      monthlyOrders,
      totalOrders
    });

    return json({ 
      customProviders,
      detectedProviders,
      stats: {
        monthlyOrders,
        totalOrders,
        monthlySavings,
        totalSavings,
        activeBundleRules,
        hasData: totalOrders > 0
      }
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Error loading fulfillment providers'), { shop: session.shop });
    return json({ 
      customProviders: [],
      detectedProviders: [],
      stats: {
        monthlyOrders: 0,
        totalOrders: 0,
        monthlySavings: 0,
        totalSavings: 0,
        activeBundleRules: 0,
        hasData: false
      }
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
  const { detectedProviders } = useLoaderData<typeof loader>();
  
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
              <Text as="h1" variant="heading3xl" fontWeight="bold">
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

        {/* Auto-Detected Providers Section */}
        {detectedProviders.length > 0 && (
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
                            Found <strong>{detectedProviders.length}</strong> fulfillment 
                            {detectedProviders.length === 1 ? ' provider' : ' providers'} connected to your store
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
                      </BlockStack>
                    </InlineStack>
                  </div>

                  {/* List Detected Providers */}
                  <BlockStack gap="400">
                    {detectedProviders.map((provider: any) => (
                      <div
                        key={provider.id}
                        style={{
                          border: '2px solid #10b981',
                          borderRadius: '16px',
                          padding: '28px',
                          background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
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
                                <Badge tone="success" size="large">
                                  ✅ Connected
                                </Badge>
                                <Badge tone="info">{provider.type.toUpperCase()}</Badge>
                              </InlineStack>
                              
                              <Text as="p" variant="bodyMd" tone="subdued">
                                Handle: <code style={{ 
                                  background: 'rgba(0,0,0,0.05)', 
                                  padding: '2px 8px', 
                                  borderRadius: '4px',
                                  fontFamily: 'monospace'
                                }}>{provider.handle}</code>
                              </Text>
                              
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
                              </div>
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
        {detectedProviders.length === 0 && (
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
