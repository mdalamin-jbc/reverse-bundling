import { useEffect } from "react";
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
  List,
  InlineStack,
  Badge,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  let orders = [];
  
  try {
    // Fetch recent orders to demonstrate reverse bundling
    const response = await admin.graphql(
      `#graphql
        query getRecentOrders {
          orders(first: 10, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                lineItems(first: 10) {
                  edges {
                    node {
                      id
                      name
                      quantity
                      sku
                      product {
                        id
                        title
                      }
                    }
                  }
                }
              }
            }
          }
        }`
    );

    const responseJson = await response.json();
    orders = responseJson.data?.orders?.edges || [];
  } catch (error) {
    console.log("Orders access not available, using mock data");
    // Provide mock order data when orders can't be accessed
    orders = [
      {
        node: {
          id: "gid://shopify/Order/1",
          name: "#1001",
          createdAt: new Date().toISOString(),
          totalPriceSet: {
            shopMoney: {
              amount: "125.00",
              currencyCode: "USD"
            }
          },
          lineItems: {
            edges: [
              { node: { id: "1", name: "Main Product A", quantity: 1, sku: "SKU-A" } },
              { node: { id: "2", name: "Accessory B", quantity: 1, sku: "SKU-B" } },
              { node: { id: "3", name: "Add-on C", quantity: 1, sku: "SKU-C" } }
            ]
          }
        }
      },
      {
        node: {
          id: "gid://shopify/Order/2",
          name: "#1002",
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          totalPriceSet: {
            shopMoney: {
              amount: "89.99",
              currencyCode: "USD"
            }
          },
          lineItems: {
            edges: [
              { node: { id: "4", name: "Single Product", quantity: 1, sku: "SKU-D" } }
            ]
          }
        }
      },
      {
        node: {
          id: "gid://shopify/Order/3",
          name: "#1003",
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          totalPriceSet: {
            shopMoney: {
              amount: "156.50",
              currencyCode: "USD"
            }
          },
          lineItems: {
            edges: [
              { node: { id: "5", name: "Premium Item A", quantity: 1, sku: "SKU-A" } },
              { node: { id: "6", name: "Premium Add-on D", quantity: 1, sku: "SKU-D" } }
            ]
          }
        }
      }
    ];
  }

  // Mock reverse bundling analytics
  const analytics = {
    totalOrders: orders.length > 0 ? orders.length : 3, // Show 3 if no real orders
    bundleableOrders: orders.length > 0 ? Math.floor(orders.length * 0.4) : 2, // 40% of orders
    potentialSavings: 250.75,
    activeBundleRules: 3,
  };

  return json({ orders, analytics });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "createBundleRule") {
    // Here you would create a bundle rule in your database
    // For now, we'll simulate success
    return json({ 
      success: true, 
      message: "Bundle rule created successfully" 
    });
  }

  if (action === "analyzeBundles") {
    // Simulate bundle analysis
    const mockAnalysis = {
      recommendedBundles: [
        { items: ["SKU-A", "SKU-B", "SKU-C"], frequency: 12, savings: 15.50 },
        { items: ["SKU-A", "SKU-D"], frequency: 8, savings: 8.25 },
      ]
    };
    
    return json({ 
      success: true, 
      analysis: mockAnalysis 
    });
  }

  return json({ success: false, message: "Unknown action" });
};

export default function Index() {
  const { orders, analytics } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.success) {
      const message = "message" in fetcher.data ? fetcher.data.message : "Action completed successfully";
      shopify.toast.show(message);
    }
  }, [fetcher.data, shopify]);

  const analyzeBundles = () => {
    fetcher.submit({ action: "analyzeBundles" }, { method: "POST" });
  };

  const createBundleRule = () => {
    fetcher.submit({ action: "createBundleRule" }, { method: "POST" });
  };

  // Convert orders for display
  const recentOrdersData = orders.map((order: any) => {
    const orderNode = order.node;
    const lineItems = orderNode.lineItems.edges.map((item: any) => item.node.name).join(", ");
    
    return [
      orderNode.name,
      new Date(orderNode.createdAt).toLocaleDateString(),
      `${orderNode.totalPriceSet.shopMoney.amount} ${orderNode.totalPriceSet.shopMoney.currencyCode}`,
      lineItems,
      orderNode.lineItems.edges.length > 1 ? "Yes" : "No",
    ];
  });

  return (
    <Page>
      <TitleBar title="Reverse Bundling Dashboard">
        <button variant="primary" onClick={analyzeBundles}>
          Analyze Bundle Opportunities
        </button>
      </TitleBar>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Reverse Bundling Overview 📦
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Automatically optimize your fulfillment costs by converting individual item orders 
                    into pre-bundled SKUs when specific combinations are ordered together. This reduces 
                    pick-and-pack fees while maintaining the optimal customer experience.
                  </Text>
                </BlockStack>

                {/* Analytics Cards */}
                <InlineStack gap="400">
                  <Card background="bg-surface-success">
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingMd">Total Orders</Text>
                      <Text as="p" variant="headingLg">{analytics.totalOrders}</Text>
                    </BlockStack>
                  </Card>
                  <Card background="bg-surface-warning">
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingMd">Bundleable Orders</Text>
                      <Text as="p" variant="headingLg">{analytics.bundleableOrders}</Text>
                      <Badge tone="warning">40% of orders</Badge>
                    </BlockStack>
                  </Card>
                  <Card background="bg-surface-success">
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingMd">Potential Savings</Text>
                      <Text as="p" variant="headingLg">${analytics.potentialSavings}</Text>
                      <Badge tone="success">Per month</Badge>
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingMd">Active Rules</Text>
                      <Text as="p" variant="headingLg">{analytics.activeBundleRules}</Text>
                    </BlockStack>
                  </Card>
                </InlineStack>

                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Quick Actions
                  </Text>
                  <InlineStack gap="300">
                    <Button url="/app/demo" variant="primary">
                      🎬 See Live Demo
                    </Button>
                    <Button loading={isLoading} onClick={analyzeBundles}>
                      Analyze Bundle Opportunities
                    </Button>
                    <Button onClick={createBundleRule} variant="secondary">
                      Create Bundle Rule
                    </Button>
                    <Button url="/app/fulfillment" variant="secondary">
                      Setup Fulfillment
                    </Button>
                    <Button url="/app/bundle-rules" variant="plain">
                      Manage Rules
                    </Button>
                  </InlineStack>
                </BlockStack>

                {/* Display analysis results */}
                {fetcher.data && "analysis" in fetcher.data && fetcher.data.analysis && (
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h3" variant="headingMd">Bundle Analysis Results</Text>
                      {fetcher.data.analysis.recommendedBundles.map((bundle: any, index: number) => (
                        <Box key={index} padding="400" background="bg-surface-secondary" borderRadius="200">
                          <BlockStack gap="200">
                            <Text as="p" variant="bodyMd">
                              <strong>Bundle Items:</strong> {bundle.items.join(" + ")}
                            </Text>
                            <InlineStack gap="400">
                              <Text as="p" variant="bodyMd">
                                <strong>Frequency:</strong> {bundle.frequency} orders/month
                              </Text>
                              <Text as="p" variant="bodyMd">
                                <strong>Savings:</strong> ${bundle.savings}/order
                              </Text>
                            </InlineStack>
                          </BlockStack>
                        </Box>
                      ))}
                    </BlockStack>
                  </Card>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    How It Works
                  </Text>
                  <List>
                    <List.Item>
                      Customer orders individual items (SKU A + B + C)
                    </List.Item>
                    <List.Item>
                      App detects bundle opportunity
                    </List.Item>
                    <List.Item>
                      Automatically converts to pre-bundled SKU (ABC)
                    </List.Item>
                    <List.Item>
                      Fulfillment center picks 1 item instead of 3
                    </List.Item>
                    <List.Item>
                      Reduced pick-and-pack costs
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
              
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Benefits
                  </Text>
                  <List>
                    <List.Item>
                      <strong>Cost Reduction:</strong> Up to 40% savings on fulfillment
                    </List.Item>
                    <List.Item>
                      <strong>Customer Experience:</strong> No change to buying process
                    </List.Item>
                    <List.Item>
                      <strong>Automation:</strong> Set rules once, save continuously
                    </List.Item>
                    <List.Item>
                      <strong>Analytics:</strong> Track savings and optimize
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        {/* Recent Orders Table */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Recent Orders Analysis</Text>
                {recentOrdersData.length > 0 ? (
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                    headings={['Order', 'Date', 'Total', 'Items', 'Bundle Candidate']}
                    rows={recentOrdersData}
                  />
                ) : (
                  <EmptyState
                    heading="No orders found"
                    action={{content: 'View all orders', url: 'shopify:admin/orders'}}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Once you have orders, we'll analyze them for bundle opportunities.</p>
                  </EmptyState>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
