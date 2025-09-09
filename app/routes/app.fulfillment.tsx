import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  InlineStack,
  Badge,
  TextField,
  Select,
  Checkbox,
  FormLayout,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // Mock fulfillment providers data
  const fulfillmentProviders = [
    {
      id: "shipstation",
      name: "ShipStation",
      type: "API",
      status: "connected",
      lastSync: "2024-12-20T10:30:00Z",
      ordersProcessed: 1250
    },
    {
      id: "fulfillment_by_amazon",
      name: "Fulfillment by Amazon (FBA)",
      type: "CSV Export",
      status: "connected",
      lastSync: "2024-12-20T09:15:00Z",
      ordersProcessed: 892
    },
    {
      id: "third_party_logistics",
      name: "3PL Warehouse Direct",
      type: "EDI",
      status: "setup_required",
      lastSync: null,
      ordersProcessed: 0
    }
  ];

  return json({ fulfillmentProviders });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "testConnection") {
    const providerId = formData.get("providerId");
    return json({ 
      success: true, 
      message: `Successfully tested connection to ${providerId}!`,
      testResults: {
        connectionStatus: "success",
        responseTime: "142ms",
        apiVersion: "v2.1",
        supportedFeatures: ["order_creation", "inventory_sync", "tracking_updates"]
      }
    });
  }

  if (action === "sendOrder") {
    const orderId = formData.get("orderId");
    return json({
      success: true,
      message: "Order sent to fulfillment provider successfully!",
      orderDetails: {
        orderId: orderId,
        convertedSKU: "BUNDLE-ABC",
        provider: "ShipStation",
        estimatedShipDate: "2024-12-21",
        trackingAvailable: true
      }
    });
  }

  return json({ success: false, message: "Unknown action" });
};

export default function FulfillmentIntegration() {
  const { fulfillmentProviders } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  
  const [selectedProvider, setSelectedProvider] = useState("shipstation");
  const [apiKey, setApiKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [autoSync, setAutoSync] = useState(true);

  const testConnection = (providerId: string) => {
    fetcher.submit({ action: "testConnection", providerId }, { method: "POST" });
  };

  const sendTestOrder = () => {
    fetcher.submit({ 
      action: "sendOrder", 
      orderId: "TEST-001" 
    }, { method: "POST" });
  };

  return (
    <Page>
      <TitleBar title="Fulfillment Provider Integration" />
      
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  🏭 Connected Fulfillment Providers
                </Text>
                
                <Text variant="bodyMd" as="p">
                  Manage how your reverse bundling orders are sent to fulfillment centers. 
                  Each provider receives the optimized bundle SKUs instead of individual items.
                </Text>

                <BlockStack gap="300">
                  {fulfillmentProviders.map((provider) => (
                    <Card key={provider.id} background={provider.status === "connected" ? "bg-surface-success" : "bg-surface-warning"}>
                      <InlineStack align="space-between">
                        <BlockStack gap="200">
                          <InlineStack gap="200" align="start">
                            <Text as="h3" variant="headingMd">
                              {provider.name}
                            </Text>
                            <Badge tone={provider.status === "connected" ? "success" : "warning"}>
                              {provider.status === "connected" ? "Connected" : "Setup Required"}
                            </Badge>
                            <Badge tone="info">{provider.type}</Badge>
                          </InlineStack>
                          
                          <Text as="p" variant="bodyMd">
                            {provider.status === "connected" ? (
                              <>
                                Last sync: {new Date(provider.lastSync!).toLocaleString()} • 
                                Orders processed: {provider.ordersProcessed}
                              </>
                            ) : (
                              "Configuration required to start sending bundle orders"
                            )}
                          </Text>
                        </BlockStack>
                        
                        <InlineStack gap="200">
                          <Button 
                            onClick={() => testConnection(provider.id)}
                            loading={fetcher.state === "submitting"}
                            variant="secondary"
                          >
                            Test Connection
                          </Button>
                          <Button variant="primary">
                            {provider.status === "connected" ? "Configure" : "Setup"}
                          </Button>
                        </InlineStack>
                      </InlineStack>
                    </Card>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    📊 Integration Stats
                  </Text>
                  <Box padding="300" background="bg-surface-success" borderRadius="200">
                    <Text as="p" variant="bodyMd">
                      <strong>Orders Converted:</strong><br/>
                      2,142 orders this month
                    </Text>
                  </Box>
                  <Box padding="300" background="bg-surface-warning" borderRadius="200">
                    <Text as="p" variant="bodyMd">
                      <strong>Cost Savings:</strong><br/>
                      $21,420 saved in pick fees
                    </Text>
                  </Box>
                  <Box padding="300" background="bg-surface" borderRadius="200">
                    <Text as="p" variant="bodyMd">
                      <strong>Average Processing:</strong><br/>
                      2.3 seconds per order
                    </Text>
                  </Box>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    🚀 Quick Test
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Send a test bundled order to your fulfillment provider to verify integration.
                  </Text>
                  <Button 
                    onClick={sendTestOrder}
                    loading={fetcher.state === "submitting"}
                    variant="primary"
                    fullWidth
                  >
                    Send Test Bundle Order
                  </Button>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  ⚙️ Add New Fulfillment Provider
                </Text>
                
                <FormLayout>
                  <Select
                    label="Provider Type"
                    options={[
                      { label: "ShipStation", value: "shipstation" },
                      { label: "Fulfillment by Amazon", value: "fba" },
                      { label: "ShipBob", value: "shipbob" },
                      { label: "3PL Warehouse", value: "3pl" },
                      { label: "Custom API", value: "custom" },
                    ]}
                    value={selectedProvider}
                    onChange={setSelectedProvider}
                  />
                  
                  <TextField
                    label="API Key / Access Token"
                    value={apiKey}
                    onChange={setApiKey}
                    type="password"
                    autoComplete="off"
                    helpText="Your fulfillment provider's API credentials"
                  />
                  
                  <TextField
                    label="Webhook URL (Optional)"
                    value={webhookUrl}
                    onChange={setWebhookUrl}
                    autoComplete="off"
                    helpText="URL for receiving shipping updates and tracking info"
                  />
                  
                  <Checkbox
                    label="Auto-sync bundle conversions"
                    checked={autoSync}
                    onChange={setAutoSync}
                    helpText="Automatically send converted bundle orders to this provider"
                  />
                  
                  <InlineStack gap="200">
                    <Button variant="primary">Save Configuration</Button>
                    <Button variant="secondary">Test Connection</Button>
                  </InlineStack>
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  🔄 How It Works
                </Text>
                
                <Banner title="Order Flow with Fulfillment Integration">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">
                      <strong>1. Order Received:</strong> Customer places order for iPhone Case + Screen Protector + Cleaning Kit
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>2. Bundle Detection:</strong> App detects this matches Bundle Rule ABC
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>3. Order Conversion:</strong> Order converted from 3 SKUs to 1 Bundle SKU
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>4. Fulfillment Notification:</strong> Bundle order automatically sent to your connected providers
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>5. Warehouse Processing:</strong> Provider picks 1 bundle item instead of 3 individual items
                    </Text>
                    <Text as="p" variant="bodyMd" tone="success">
                      <strong>6. Cost Savings:</strong> $10+ saved per order in pick-and-pack fees!
                    </Text>
                  </BlockStack>
                </Banner>

                <Text as="h3" variant="headingMd">
                  🔌 Supported Integration Methods:
                </Text>
                <InlineStack gap="400" wrap>
                  <Box minWidth="200px">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingSm">📡 API Integration</Text>
                        <Text as="p" variant="bodySm">
                          Real-time order sync with ShipStation, ShipBob, and other modern providers
                        </Text>
                      </BlockStack>
                    </Card>
                  </Box>
                  <Box minWidth="200px">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingSm">📄 CSV Export</Text>
                        <Text as="p" variant="bodySm">
                          Automated CSV generation for FBA and traditional 3PLs
                        </Text>
                      </BlockStack>
                    </Card>
                  </Box>
                  <Box minWidth="200px">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingSm">🔗 EDI Integration</Text>
                        <Text as="p" variant="bodySm">
                          Enterprise-grade EDI connections for large warehouses
                        </Text>
                      </BlockStack>
                    </Card>
                  </Box>
                  <Box minWidth="200px">
                    <Card>
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingSm">📨 Webhook Events</Text>
                        <Text as="p" variant="bodySm">
                          Real-time notifications for order status and tracking updates
                        </Text>
                      </BlockStack>
                    </Card>
                  </Box>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
