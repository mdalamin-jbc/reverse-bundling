import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Form, useActionData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  Banner,
  List,
  Badge,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

// Mock order data for testing
const mockOrders = [
  {
    id: "1001",
    name: "#1001",
    total_price: "150.00",
    currency: "USD",
    created_at: "2025-10-10T09:00:00Z",
    fulfillment_status: "unfulfilled",
    line_items: [
      {
        id: "1",
        title: "Gaming Headset",
        quantity: 1,
        price: "75.00",
      },
      {
        id: "2", 
        title: "Gaming Mouse",
        quantity: 1,
        price: "50.00",
      },
      {
        id: "3",
        title: "Gaming Keyboard",
        quantity: 1,
        price: "25.00",
      }
    ]
  },
  {
    id: "1002",
    name: "#1002",
    total_price: "200.00",
    currency: "USD",
    created_at: "2025-10-10T10:30:00Z",
    fulfillment_status: "fulfilled",
    line_items: [
      {
        id: "4",
        title: "Wireless Earbuds",
        quantity: 2,
        price: "60.00",
      },
      {
        id: "5",
        title: "Phone Case",
        quantity: 1,
        price: "20.00",
      },
      {
        id: "6",
        title: "Screen Protector",
        quantity: 2,
        price: "30.00",
      }
    ]
  }
];

// Mock bundle rules
const mockBundleRules = [
  {
    id: "bundle_1",
    name: "Gaming Bundle",
    products: ["Gaming Headset", "Gaming Mouse", "Gaming Keyboard"],
    discount: 15,
    active: true
  },
  {
    id: "bundle_2", 
    name: "Mobile Accessories Bundle",
    products: ["Wireless Earbuds", "Phone Case", "Screen Protector"],
    discount: 10,
    active: true
  }
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  
  return json({
    orders: mockOrders,
    bundleRules: mockBundleRules,
    isTestMode: true
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  
  const formData = await request.formData();
  const action = formData.get("action");
  const orderId = formData.get("orderId");
  
  if (action === "fulfill") {
    // Simulate fulfillment
    return json({ 
      success: true, 
      message: `Order ${orderId} has been fulfilled successfully!`,
      action: "fulfill"
    });
  }
  
  if (action === "create_bundle") {
    // Simulate bundle creation from order
    return json({
      success: true,
      message: "Bundle rule created from order analysis!",
      action: "create_bundle"
    });
  }
  
  return json({ success: false, message: "Unknown action" });
};

function analyzeOrderForBundles(order: any, bundleRules: any[]) {
  const orderProductTitles = order.line_items.map((item: any) => item.title);
  
  for (const rule of bundleRules) {
    const matchingProducts = rule.products.filter((product: string) => 
      orderProductTitles.includes(product)
    );
    
    if (matchingProducts.length >= 2) {
      return {
        bundleRule: rule,
        matchingProducts,
        potentialSavings: order.line_items
          .filter((item: any) => matchingProducts.includes(item.title))
          .reduce((sum: number, item: any) => sum + parseFloat(item.price), 0) * (rule.discount / 100)
      };
    }
  }
  
  return null;
}

export default function TestDemo() {
  const { orders, bundleRules, isTestMode } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const ordersData = orders.map((order: any) => {
    const bundleAnalysis = analyzeOrderForBundles(order, bundleRules);
    
    return [
      order.name,
      `$${order.total_price}`,
      new Date(order.created_at).toLocaleDateString(),
      <Badge tone={order.fulfillment_status === 'fulfilled' ? 'success' : 'attention'} key={order.id}>
        {order.fulfillment_status}
      </Badge>,
      bundleAnalysis ? (
        <Badge tone="info" key={`bundle-${order.id}`}>
          {`${bundleAnalysis.bundleRule.name} (Save $${bundleAnalysis.potentialSavings.toFixed(2)})`}
        </Badge>
      ) : (
        <Text tone="subdued" as="span" key={`no-bundle-${order.id}`}>No bundle match</Text>
      ),
      <div key={`actions-${order.id}`} style={{ display: 'flex', gap: '8px' }}>
        {order.fulfillment_status === 'unfulfilled' && (
          <Form method="post" style={{ display: 'inline' }}>
            <input type="hidden" name="action" value="fulfill" />
            <input type="hidden" name="orderId" value={order.id} />
            <Button size="micro" submit>Fulfill</Button>
          </Form>
        )}
        {bundleAnalysis && (
          <Form method="post" style={{ display: 'inline' }}>
            <input type="hidden" name="action" value="create_bundle" />
            <input type="hidden" name="orderId" value={order.id} />
            <Button size="micro" submit variant="primary">Create Bundle</Button>
          </Form>
        )}
      </div>
    ];
  });

  return (
    <Page>
      <TitleBar title="Test Demo - Orders & Fulfillment" />
      <Layout>
        {isTestMode && (
          <Layout.Section>
            <Banner title="Test Mode Active" tone="info">
              <p>This page uses mock data to demonstrate order processing and fulfillment features since development stores have order access restrictions.</p>
              <p>In production, this would connect to real Shopify orders.</p>
            </Banner>
          </Layout.Section>
        )}

        {actionData?.success && (
          <Layout.Section>
            <Banner 
              title="Success!" 
              tone="success"
              onDismiss={() => {}}
            >
              {actionData.message}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <div style={{ padding: '16px' }}>
              <Text variant="headingMd" as="h2">Recent Orders Analysis</Text>
              <br />
              {orders.length > 0 ? (
                <DataTable
                  columnContentTypes={[
                    'text',
                    'text', 
                    'text',
                    'text',
                    'text',
                    'text'
                  ]}
                  headings={[
                    'Order',
                    'Total',
                    'Date',
                    'Fulfillment',
                    'Bundle Opportunity',
                    'Actions'
                  ]}
                  rows={ordersData}
                />
              ) : (
                <EmptyState
                  heading="No orders found"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Orders will appear here when customers make purchases.</p>
                </EmptyState>
              )}
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <div style={{ padding: '16px' }}>
              <Text variant="headingMd" as="h2">Active Bundle Rules</Text>
              <br />
              <List>
                {bundleRules.map((rule: any) => (
                  <List.Item key={rule.id}>
                    <strong>{rule.name}</strong>: {rule.products.join(", ")} - {rule.discount}% discount
                  </List.Item>
                ))}
              </List>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <div style={{ padding: '16px' }}>
              <Text variant="headingMd" as="h2">Testing Features</Text>
              <br />
              <List>
                <List.Item>✅ Order listing and analysis</List.Item>
                <List.Item>✅ Bundle opportunity detection</List.Item>
                <List.Item>✅ Fulfillment processing simulation</List.Item>
                <List.Item>✅ Bundle rule creation from orders</List.Item>
                <List.Item>✅ Real-time order status updates</List.Item>
              </List>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}