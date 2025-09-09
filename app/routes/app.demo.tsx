import { useEffect, useState } from "react";
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
  DataTable,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // Realistic mock orders showing the conversion process
  const mockOrders = [
    {
      id: "1001",
      customer: "John Smith",
      original: ["Phone Case", "Screen Protector", "Charging Cable"],
      originalSKUs: ["CASE-001", "SCREEN-PRO", "CABLE-USB"],
      bundledSKU: "PHONE-BUNDLE-001",
      converted: false,
      savings: 8.50,
      reason: "Small accessories that fit in one package"
    },
    {
      id: "1002", 
      customer: "Sarah Jones",
      original: ["Vitamins C", "Vitamins D", "Omega 3"],
      originalSKUs: ["VIT-C-500", "VIT-D-1000", "OMEGA-3"],
      bundledSKU: "HEALTH-BUNDLE-VIT",
      converted: true,
      savings: 12.00,
      reason: "Same-sized bottles, ship together"
    },
    {
      id: "1003",
      customer: "Mike Chen",
      original: ["Coffee Beans", "Coffee Filter", "Coffee Mug"],
      originalSKUs: ["COFFEE-001", "FILTER-V60", "MUG-001"],
      bundledSKU: "COFFEE-STARTER-KIT",
      converted: true,
      savings: 15.50,
      reason: "Coffee starter kit - logical bundle"
    },
    {
      id: "1004",
      customer: "Lisa Wong",
      original: ["TV 65 inch", "Sound Bar", "HDMI Cable"],
      originalSKUs: ["TV-SAMSUNG-65", "SOUNDBAR-001", "HDMI-4K"],
      bundledSKU: "NOT_BUNDLED",
      converted: false,
      savings: 0,
      reason: "TV too large - ships separately anyway"
    }
  ];

  return json({ mockOrders });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "simulateOrder") {
    return json({ 
      success: true, 
      message: "Order processed through reverse bundling!",
      orderFlow: {
        step1: "Customer ordered: Phone Case + Screen Protector + Charging Cable",
        step2: "App detected bundle rule: Small accessories → PHONE-BUNDLE-001",
        step3: "Order sent to fulfillment as: PHONE-BUNDLE-001 (single package)",
        step4: "Warehouse picks 1 pre-packaged bundle instead of 3 separate items",
        step5: "Saved $8.50 in pick fees (items fit in same package anyway)",
        note: "💡 Only works for items that can realistically ship together!"
      }
    });
  }

  return json({ success: false, message: "Unknown action" });
};

export default function Demo() {
  const { mockOrders } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  
  const [orderFlow, setOrderFlow] = useState<any>(null);

  useEffect(() => {
    if (fetcher.data?.success && "orderFlow" in fetcher.data) {
      setOrderFlow(fetcher.data.orderFlow);
      shopify.toast.show(fetcher.data.message);
    }
  }, [fetcher.data, shopify]);

  const simulateOrder = () => {
    fetcher.submit({ action: "simulateOrder" }, { method: "POST" });
  };

  // Convert orders for table display
  const ordersTableData = mockOrders.map((order) => [
    `#${order.id}`,
    order.customer,
    order.original.join(" + "),
    order.converted ? `✅ Bundled as ${order.bundledSKU}` : `❌ ${order.reason}`,
    order.savings > 0 ? `$${order.savings} ${order.converted ? "saved" : "potential"}` : "No savings",
    order.converted ? "Sent to warehouse" : order.bundledSKU === "NOT_BUNDLED" ? "Ships separately" : "Waiting conversion"
  ]);

  return (
    <Page>
      <TitleBar title="Live Demo - See Reverse Bundling Work!" />
      
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  🎬 Complete Flow Demo - From Order to Fulfillment
                </Text>
                
                <Text variant="bodyMd" as="p">
                  Click "Simulate Order Processing" to see exactly what happens when a customer 
                  places an order and how the reverse bundling saves money.
                </Text>

                <Button 
                  onClick={simulateOrder} 
                  loading={fetcher.state === "submitting"}
                  variant="primary"
                  size="large"
                >
                  🚀 Process Mock Order Now
                </Button>

                {orderFlow && (
                  <Card background="bg-surface-success">
                    <BlockStack gap="300">
                      <Text as="h3" variant="headingMd">
                        ✅ Here's What Just Happened:
                      </Text>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd">
                          <strong>Step 1:</strong> {orderFlow.step1}
                        </Text>
                        <Text as="p" variant="bodyMd">
                          <strong>Step 2:</strong> {orderFlow.step2}
                        </Text>
                        <Text as="p" variant="bodyMd">
                          <strong>Step 3:</strong> {orderFlow.step3}
                        </Text>
                        <Text as="p" variant="bodyMd">
                          <strong>Step 4:</strong> {orderFlow.step4}
                        </Text>
                        <Text as="p" variant="bodyMd" tone="success">
                          <strong>Result:</strong> {orderFlow.step5}
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          <strong>Important:</strong> {orderFlow.note}
                        </Text>
                      </BlockStack>
                    </BlockStack>
                  </Card>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    💰 Cost Breakdown
                  </Text>
                  <Box padding="300" background="bg-surface-critical" borderRadius="200">
                    <Text as="p" variant="bodyMd">
                      <strong>Without App:</strong><br/>
                      3 small items × $5 = $15 pick cost<br/>
                      <small>(Picker visits 3 locations)</small>
                    </Text>
                  </Box>
                  <Box padding="300" background="bg-surface-success" borderRadius="200">
                    <Text as="p" variant="bodyMd">
                      <strong>With App:</strong><br/>
                      1 pre-bundle × $5 = $5 pick cost<br/>
                      <small>(Picker visits 1 location)</small>
                    </Text>
                  </Box>
                  <Box padding="300" background="bg-surface-warning" borderRadius="200">
                    <Text as="p" variant="bodyMd">
                      <strong>Smart Bundling:</strong><br/>
                      Only items that fit together anyway
                    </Text>
                  </Box>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    🏭 Fulfillment Integration
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Your fulfillment center receives the converted order automatically through:
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">• CSV order exports</Text>
                    <Text as="p" variant="bodyMd">• API integrations</Text>
                    <Text as="p" variant="bodyMd">• Webhook notifications</Text>
                    <Text as="p" variant="bodyMd">• EDI connections</Text>
                  </BlockStack>
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
                  📋 Order Processing Examples
                </Text>
                
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                  headings={['Order #', 'Customer', 'Original Items', 'Status', 'Savings', 'Fulfillment']}
                  rows={ordersTableData}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  🔄 The Complete Process Explained
                </Text>
                
                <InlineStack gap="400" wrap>
                  <Box minWidth="280px">
                    <Card>
                      <BlockStack gap="300">
                        <Text as="h3" variant="headingMd" tone="critical">
                          ❌ Before (Expensive)
                        </Text>
                        <Text as="p" variant="bodyMd">
                          Order sent to fulfillment:
                        </Text>
                        <Box padding="200" background="bg-surface" borderRadius="100">
                          <Text as="p" variant="bodySm">
                            SKU: PHONE-CASE, Qty: 1<br/>
                            SKU: SCREEN-PROTECTOR, Qty: 1<br/>
                            SKU: CHARGING-CABLE, Qty: 1
                          </Text>
                        </Box>
                        <Text as="p" variant="bodyMd" tone="critical">
                          Warehouse picks 3 items = $15 cost<br/>
                          <small>(Even though they fit in same box)</small>
                        </Text>
                      </BlockStack>
                    </Card>
                  </Box>

                  <Box minWidth="280px">
                    <Card>
                      <BlockStack gap="300">
                        <Text as="h3" variant="headingMd" tone="success">
                          ✅ After (Optimized)
                        </Text>
                        <Text as="p" variant="bodyMd">
                          Order sent to fulfillment:
                        </Text>
                        <Box padding="200" background="bg-surface" borderRadius="100">
                          <Text as="p" variant="bodySm">
                            SKU: PHONE-ACCESSORY-BUNDLE, Qty: 1
                          </Text>
                        </Box>
                        <Text as="p" variant="bodyMd" tone="success">
                          Warehouse picks 1 pre-packaged bundle = $5 cost<br/>
                          <strong>Savings: $10 per order!</strong><br/>
                          <small>(Same items, smarter packaging)</small>
                        </Text>
                      </BlockStack>
                    </Card>
                  </Box>
                </InlineStack>

                <Text as="h3" variant="headingMd">
                  🎯 What Makes Sense to Bundle:
                </Text>
                <InlineStack gap="400" wrap>
                  <Box minWidth="250px">
                    <Card background="bg-surface-success">
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingSm" tone="success">✅ GOOD Examples</Text>
                        <Text as="p" variant="bodySm">
                          • Phone case + screen protector + cable<br/>
                          • Vitamins that are same bottle size<br/>
                          • Coffee beans + filters + stirrer<br/>
                          • Small makeup items<br/>
                          • Stationery supplies<br/>
                          • Baby care essentials
                        </Text>
                      </BlockStack>
                    </Card>
                  </Box>
                  <Box minWidth="250px">
                    <Card background="bg-surface-critical">
                      <BlockStack gap="200">
                        <Text as="h4" variant="headingSm" tone="critical">❌ BAD Examples</Text>
                        <Text as="p" variant="bodySm">
                          • TV + fridge + washing machine<br/>
                          • Heavy + fragile items together<br/>
                          • Different shipping requirements<br/>
                          • Hazardous + regular items<br/>
                          • Frozen + room temperature<br/>
                          • Very different sizes
                        </Text>
                      </BlockStack>
                    </Card>
                  </Box>
                </InlineStack>

                <Text as="h3" variant="headingMd">
                  🎯 Key Points:
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    • <strong>Customer Experience:</strong> Completely unchanged - they still see and buy individual products
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>Automatic Detection:</strong> App monitors all orders in real-time for bundle opportunities
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>Instant Conversion:</strong> Eligible orders are automatically converted before fulfillment
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>Fulfillment Notification:</strong> Your warehouse receives the bundled SKU instead of individual items
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • <strong>Cost Savings:</strong> Immediate reduction in pick-and-pack fees
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
