import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Badge,
  DataTable,
  EmptyState,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    // Fetch ALL data from database - NO MOCK DATA
    const [
      activeBundleRulesCount,
      recentConversions,
      totalConversionsCount,
      totalSavingsAmount,
      topPerformingRules,
      recentConversionsCount,
      monthlySavingsResult,
      failedConversionsCount,
    ] = await Promise.all([
      // Count of active bundle rules
      db.bundleRule.count({
        where: { shop: session.shop, status: "active" },
      }),
      
      // Only fetch the 10 most recent conversions (not all of them)
      db.orderConversion.findMany({
        where: { shop: session.shop },
        orderBy: { convertedAt: "desc" },
        take: 10,
        include: { bundleRule: true },
      }),

      // Total count of all conversions
      db.orderConversion.count({
        where: { shop: session.shop },
      }),

      // Total savings from all conversions
      db.orderConversion.aggregate({
        where: { shop: session.shop },
        _sum: { savingsAmount: true },
      }),

      // Top 5 performing bundle rules
      db.bundleRule.findMany({
        where: { shop: session.shop },
        orderBy: { frequency: "desc" },
        take: 5,
      }),

      // Last 30 days conversion count
      db.orderConversion.count({
        where: {
          shop: session.shop,
          convertedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),

      // Last 30 days savings
      db.orderConversion.aggregate({
        where: {
          shop: session.shop,
          convertedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        _sum: { savingsAmount: true },
      }),

      // Failed conversions count
      db.orderConversion.count({
        where: { shop: session.shop, status: "failed" },
      }),
    ]);

    // Calculate real analytics from database
    const totalConversions = totalConversionsCount;
    const totalSavings = totalSavingsAmount._sum.savingsAmount || 0;
    const avgSavingsPerOrder = totalConversions > 0 ? totalSavings / totalConversions : 0;

    // Last 30 days metrics (from aggregate queries above)
    const monthlySavings = monthlySavingsResult._sum.savingsAmount || 0;

    logInfo("Dashboard loaded successfully", { 
      shop: session.shop, 
      totalConversions,
      activeBundleRulesCount 
    });

    return json({
      analytics: {
        totalConversions,
        totalSavings: Math.round(totalSavings * 100) / 100,
        avgSavingsPerOrder: Math.round(avgSavingsPerOrder * 100) / 100,
        monthlySavings: Math.round(monthlySavings * 100) / 100,
        activeBundleRules: activeBundleRulesCount,
        recentConversionsCount: recentConversionsCount,
        failedConversions: failedConversionsCount,
      },
      recentConversions: recentConversions,
      topRules: topPerformingRules,
      shop: session.shop,
    });
  } catch (error) {
    logError(error as Error, { shop: session.shop, context: "dashboard_loader" });
    
    // Return empty state on error - NO MOCK DATA
    return json({
      analytics: {
        totalConversions: 0,
        totalSavings: 0,
        avgSavingsPerOrder: 0,
        monthlySavings: 0,
        activeBundleRules: 0,
        recentConversionsCount: 0,
        failedConversions: 0,
      },
      recentConversions: [],
      topRules: [],
      shop: session.shop,
      error: true,
    });
  }
};

export default function Dashboard() {
  const { analytics, recentConversions, topRules } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const hasData = analytics.totalConversions > 0 || analytics.activeBundleRules > 0;

  return (
    <Page title="Dashboard">
      <TitleBar title="Dashboard" />
      
      <BlockStack gap="400">
        {/* Failed conversions warning */}
        {analytics.failedConversions > 0 && (
          <Banner
            title={`${analytics.failedConversions} failed conversion${analytics.failedConversions > 1 ? 's' : ''}`}
            tone="warning"
            action={{ content: 'View details', url: '/app/orders' }}
          >
            <p>Some orders matched rules but couldn't be processed. Check Orders for details.</p>
          </Banner>
        )}

        {/* Welcome state */}
        {!hasData && (
          <Banner
            title="Welcome to Reverse Bundle Pro"
            tone="info"
            action={{ content: 'Create bundle rule', url: '/app/bundle-rules' }}
            secondaryAction={{ content: 'Run analysis', url: '/app/bundle-analysis' }}
          >
            <p>Create bundle rules to automatically detect when customers order items that can ship as a pre-packed bundle, saving you fulfillment costs.</p>
          </Banner>
        )}

        {/* Metrics */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Total Conversions</Text>
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {analytics.totalConversions.toLocaleString()}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {analytics.recentConversionsCount} in last 30 days
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Total Savings</Text>
                <Text as="p" variant="headingXl" fontWeight="bold" tone="success">
                  ${analytics.totalSavings.toLocaleString()}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  ${analytics.avgSavingsPerOrder.toFixed(2)} avg per order
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="bodySm" tone="subdued">Active Rules</Text>
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {analytics.activeBundleRules}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  ${analytics.monthlySavings.toLocaleString()} saved this month
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Top Rules + Recent Conversions side by side */}
        <Layout>
          {topRules.length > 0 && (
            <Layout.Section variant={recentConversions.length > 0 ? "oneHalf" : undefined}>
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Top Rules</Text>
                    <Button variant="plain" onClick={() => navigate('/app/bundle-rules')}>Manage</Button>
                  </InlineStack>
                  <DataTable
                    columnContentTypes={['text', 'numeric', 'numeric', 'text']}
                    headings={['Rule', 'Hits', 'Savings', 'Status']}
                    rows={topRules.map((rule) => [
                      rule.name,
                      rule.frequency,
                      `$${rule.savings.toFixed(2)}`,
                      <Badge key={rule.id} tone={rule.status === 'active' ? 'success' : 'info'}>{rule.status}</Badge>,
                    ])}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          <Layout.Section variant={topRules.length > 0 ? "oneHalf" : undefined}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Recent Conversions</Text>
                  {recentConversions.length > 0 && (
                    <Button variant="plain" onClick={() => navigate('/app/orders')}>View all</Button>
                  )}
                </InlineStack>
                {recentConversions.length > 0 ? (
                  <DataTable
                    columnContentTypes={['text', 'text', 'numeric', 'text']}
                    headings={['Order', 'Rule', 'Savings', 'Date']}
                    rows={recentConversions.slice(0, 5).map((c) => [
                      `#${c.orderId.slice(-6)}`,
                      c.bundleRule.name,
                      `$${c.savingsAmount.toFixed(2)}`,
                      new Date(c.convertedAt).toLocaleDateString(),
                    ])}
                  />
                ) : (
                  <EmptyState
                    heading="No conversions yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Conversions appear here when orders match your bundle rules.</p>
                  </EmptyState>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Quick actions for new users */}
        {!hasData && (
          <Layout>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">1. Create rules</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Define which products ship together as a bundle.
                  </Text>
                  <Button variant="primary" onClick={() => navigate('/app/bundle-rules')}>Create rule</Button>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">2. Run analysis</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Scan order history to find bundling opportunities.
                  </Text>
                  <Button onClick={() => navigate('/app/bundle-analysis')}>Analyze orders</Button>
                </BlockStack>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">3. Configure</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Set fulfillment costs, notifications, and mode.
                  </Text>
                  <Button onClick={() => navigate('/app/settings')}>Settings</Button>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </Page>
  );
}
