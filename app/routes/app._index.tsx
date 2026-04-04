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
  Box,
  Divider,
  ProgressBar,
  Icon,
} from "@shopify/polaris";
import {
  OrderIcon,
  CashDollarIcon,
  InventoryIcon,
  ChartVerticalFilledIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from "@shopify/polaris-icons";
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
  const successRate = analytics.totalConversions > 0
    ? Math.round(((analytics.totalConversions - analytics.failedConversions) / analytics.totalConversions) * 100)
    : 100;

  return (
    <Page title="Dashboard">
      <TitleBar title="Reverse Bundle Pro" />
      
      <BlockStack gap="500">
        {/* Failed conversions alert */}
        {analytics.failedConversions > 0 && (
          <Banner
            title={`${analytics.failedConversions} failed conversion${analytics.failedConversions > 1 ? 's' : ''} need attention`}
            tone="warning"
            action={{ content: 'Review orders', url: '/app/orders' }}
          >
            <p>Some orders matched rules but couldn't be processed. Review failed conversions to take action.</p>
          </Banner>
        )}

        {/* Onboarding for new users */}
        {!hasData && (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="200">
                <Text as="h2" variant="headingLg" fontWeight="bold">Get started with Reverse Bundle Pro</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Automatically detect when customers order items that can ship as a pre-packed bundle, saving you fulfillment costs on every qualifying order.
                </Text>
              </BlockStack>
              <Divider />
              <Layout>
                <Layout.Section variant="oneThird">
                  <BlockStack gap="300">
                    <InlineStack gap="200" blockAlign="center">
                      <Box background="bg-fill-info" padding="100" borderRadius="200">
                        <Icon source={InventoryIcon} tone="info" />
                      </Box>
                      <Text as="h3" variant="headingSm" fontWeight="semibold">1. Create rules</Text>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Define which products ship together as a pre-packed bundle with a single SKU.
                    </Text>
                    <Button variant="primary" onClick={() => navigate('/app/bundle-rules')}>Create bundle rule</Button>
                  </BlockStack>
                </Layout.Section>
                <Layout.Section variant="oneThird">
                  <BlockStack gap="300">
                    <InlineStack gap="200" blockAlign="center">
                      <Box background="bg-fill-info" padding="100" borderRadius="200">
                        <Icon source={ChartVerticalFilledIcon} tone="info" />
                      </Box>
                      <Text as="h3" variant="headingSm" fontWeight="semibold">2. Analyze orders</Text>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Scan your order history to discover products frequently bought together.
                    </Text>
                    <Button onClick={() => navigate('/app/bundle-analysis')}>Run analysis</Button>
                  </BlockStack>
                </Layout.Section>
                <Layout.Section variant="oneThird">
                  <BlockStack gap="300">
                    <InlineStack gap="200" blockAlign="center">
                      <Box background="bg-fill-info" padding="100" borderRadius="200">
                        <Icon source={CashDollarIcon} tone="info" />
                      </Box>
                      <Text as="h3" variant="headingSm" fontWeight="semibold">3. Save on shipping</Text>
                    </InlineStack>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Orders matching your rules are automatically tagged or edited for bundled fulfillment.
                    </Text>
                    <Button onClick={() => navigate('/app/settings')}>Configure</Button>
                  </BlockStack>
                </Layout.Section>
              </Layout>
            </BlockStack>
          </Card>
        )}

        {/* Key Metrics */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Total Conversions</Text>
                  <Box background="bg-fill-success-secondary" padding="100" borderRadius="full">
                    <Icon source={OrderIcon} tone="success" />
                  </Box>
                </InlineStack>
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {analytics.totalConversions.toLocaleString()}
                </Text>
                <Divider />
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Last 30 days</Text>
                  <Badge tone="info">{analytics.recentConversionsCount}</Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Total Savings</Text>
                  <Box background="bg-fill-success-secondary" padding="100" borderRadius="full">
                    <Icon source={CashDollarIcon} tone="success" />
                  </Box>
                </InlineStack>
                <Text as="p" variant="headingXl" fontWeight="bold" tone="success">
                  ${analytics.totalSavings.toLocaleString()}
                </Text>
                <Divider />
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Avg per order</Text>
                  <Text as="p" variant="bodySm" fontWeight="semibold">${analytics.avgSavingsPerOrder.toFixed(2)}</Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Active Rules</Text>
                  <Box background="bg-fill-info-secondary" padding="100" borderRadius="full">
                    <Icon source={InventoryIcon} tone="info" />
                  </Box>
                </InlineStack>
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {analytics.activeBundleRules}
                </Text>
                <Divider />
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">This month savings</Text>
                  <Text as="p" variant="bodySm" fontWeight="semibold" tone="success">${analytics.monthlySavings.toLocaleString()}</Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Success rate bar */}
        {hasData && (
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={CheckCircleIcon} tone="success" />
                  <Text as="p" variant="bodyMd" fontWeight="semibold">Conversion Success Rate</Text>
                </InlineStack>
                <Text as="p" variant="bodyMd" fontWeight="bold">{successRate}%</Text>
              </InlineStack>
              <ProgressBar progress={successRate} tone={successRate >= 90 ? "success" : successRate >= 70 ? "highlight" : "critical"} size="small" />
            </BlockStack>
          </Card>
        )}

        {/* Content sections */}
        <Layout>
          {/* Top Performing Rules */}
          <Layout.Section variant={recentConversions.length > 0 ? "oneHalf" : undefined}>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd" fontWeight="semibold">Top Performing Rules</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Ranked by conversion frequency</Text>
                  </BlockStack>
                  <Button variant="plain" icon={ArrowRightIcon} onClick={() => navigate('/app/bundle-rules')}>Manage</Button>
                </InlineStack>
                <Divider />
                {topRules.length > 0 ? (
                  <DataTable
                    columnContentTypes={['text', 'numeric', 'numeric', 'text']}
                    headings={['Rule Name', 'Conversions', 'Savings', 'Status']}
                    rows={topRules.map((rule) => [
                      rule.name,
                      rule.frequency,
                      `$${rule.savings.toFixed(2)}`,
                      <Badge key={rule.id} tone={rule.status === 'active' ? 'success' : 'attention'}>{rule.status}</Badge>,
                    ])}
                    hoverable
                  />
                ) : (
                  <Box paddingBlock="600">
                    <BlockStack gap="200" inlineAlign="center">
                      <Text as="p" variant="bodyMd" tone="subdued">No rules created yet</Text>
                      <Button onClick={() => navigate('/app/bundle-rules')}>Create your first rule</Button>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Recent Conversions */}
          <Layout.Section variant={topRules.length > 0 ? "oneHalf" : undefined}>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd" fontWeight="semibold">Recent Conversions</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Latest bundle matches</Text>
                  </BlockStack>
                  {recentConversions.length > 0 && (
                    <Button variant="plain" icon={ArrowRightIcon} onClick={() => navigate('/app/orders')}>View all</Button>
                  )}
                </InlineStack>
                <Divider />
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
                    hoverable
                  />
                ) : (
                  <Box paddingBlock="600">
                    <BlockStack gap="200" inlineAlign="center">
                      <Text as="p" variant="bodyMd" tone="subdued">No conversions yet</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Conversions appear when orders match your bundle rules</Text>
                    </BlockStack>
                  </Box>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
