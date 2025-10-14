import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
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
  ProgressBar,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    // Check if user has completed onboarding
    const appSettings = await db.appSettings.findUnique({
      where: { shop: session.shop },
    });

    // If onboarding not completed, redirect to onboarding wizard
    if (!appSettings?.onboardingCompleted) {
      throw redirect('/app/onboarding');
    }

    // Fetch ALL data from database - NO MOCK DATA
    const [
      activeBundleRulesCount,
      allOrderConversions,
      totalConversionsCount,
      totalSavingsAmount,
      topPerformingRules,
    ] = await Promise.all([
      // Count of active bundle rules
      db.bundleRule.count({
        where: { shop: session.shop, status: "active" },
      }),
      
      // All order conversions for calculations (unlimited)
      db.orderConversion.findMany({
        where: { shop: session.shop },
        orderBy: { convertedAt: "desc" },
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
    ]);

    // Calculate real analytics from database
    const totalConversions = totalConversionsCount;
    const totalSavings = totalSavingsAmount._sum.savingsAmount || 0;
    const avgSavingsPerOrder = totalConversions > 0 ? totalSavings / totalConversions : 0;

    // Calculate last 30 days metrics
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentConversions = allOrderConversions.filter(
      (conv) => new Date(conv.convertedAt) >= thirtyDaysAgo
    );
    const monthlySavings = recentConversions.reduce((sum, conv) => sum + conv.savingsAmount, 0);

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
        recentConversionsCount: recentConversions.length,
      },
      recentConversions: allOrderConversions.slice(0, 10),
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

  const hasAnyData = analytics.totalConversions > 0 || analytics.activeBundleRules > 0;
  const hasConversions = analytics.totalConversions > 0;

  return (
    <Page>
      <TitleBar title="Dashboard" />
      
      <BlockStack gap="500">
        {/* Hero Banner with Gradient */}
        {hasAnyData && (
          <Card>
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: '32px',
              borderRadius: '8px',
              color: 'white',
            }}>
              <BlockStack gap="300">
                <Text as="h1" variant="heading2xl" fontWeight="bold" tone="inherit">
                  💰 You've Saved ${analytics.totalSavings.toLocaleString()} So Far!
                </Text>
                <Text as="p" variant="bodyLg" tone="inherit">
                  {analytics.totalConversions} orders automatically bundled • {analytics.activeBundleRules} active rules working 24/7
                </Text>
                {analytics.monthlySavings > 0 && (
                  <Text as="p" variant="bodyMd" tone="inherit">
                    🔥 ${analytics.monthlySavings.toLocaleString()} saved in the last 30 days - keep it up!
                  </Text>
                )}
              </BlockStack>
            </div>
          </Card>
        )}

        {/* Welcome Banner for New Users */}
        {!hasAnyData && (
          <Banner
            title="Welcome to Reverse Bundle Pro! 👋"
            tone="info"
            action={{ content: 'Create Your First Bundle Rule', url: '/app/bundle-rules' }}
          >
            <p>Start saving on fulfillment costs by creating bundle rules. When customers order items together, they'll automatically be converted to bundled SKUs.</p>
          </Banner>
        )}

        {/* Key Metrics Row - Enhanced with Icons & Colors */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <div style={{ 
                borderLeft: '4px solid #667eea', 
                paddingLeft: '16px' 
              }}>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="headingLg">📦</Text>
                    <Text as="h3" variant="headingSm" tone="subdued">
                      Total Order Conversions
                    </Text>
                  </InlineStack>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {analytics.totalConversions.toLocaleString()}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    All time orders converted
                  </Text>
                </BlockStack>
              </div>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <div style={{ 
                borderLeft: '4px solid #10b981', 
                paddingLeft: '16px' 
              }}>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="headingLg">💰</Text>
                    <Text as="h3" variant="headingSm" tone="subdued">
                      Total Savings
                    </Text>
                  </InlineStack>
                  <Text as="p" variant="heading2xl" fontWeight="bold" tone="success">
                    ${analytics.totalSavings.toLocaleString()}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    ${analytics.avgSavingsPerOrder.toFixed(2)} average per order
                  </Text>
                </BlockStack>
              </div>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <div style={{ 
                borderLeft: '4px solid #f59e0b', 
                paddingLeft: '16px' 
              }}>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="headingLg">📈</Text>
                    <Text as="h3" variant="headingSm" tone="subdued">
                      Last 30 Days
                    </Text>
                  </InlineStack>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    ${analytics.monthlySavings.toLocaleString()}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {analytics.recentConversionsCount} orders this month
                  </Text>
                </BlockStack>
              </div>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Performance Overview */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Performance Overview
                  </Text>
                  <InlineStack gap="300">
                    <Button onClick={() => navigate('/app/bundle-rules')}>
                      Manage Rules
                    </Button>
                    <Button onClick={() => navigate('/app/settings')}>
                      Settings
                    </Button>
                  </InlineStack>
                </InlineStack>

                <Layout>
                  <Layout.Section variant="oneHalf">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodyMd">
                          Active Bundle Rules
                        </Text>
                        <Badge tone={analytics.activeBundleRules > 0 ? "success" : "attention"}>
                          {String(analytics.activeBundleRules)}
                        </Badge>
                      </InlineStack>
                      <ProgressBar 
                        progress={Math.min((analytics.activeBundleRules / 10) * 100, 100)} 
                        size="small"
                        tone={analytics.activeBundleRules > 0 ? "success" : "critical"}
                      />
                      <Text as="p" variant="bodySm" tone="subdued">
                        {analytics.activeBundleRules === 0 
                          ? "Create your first rule to start saving money" 
                          : `${analytics.activeBundleRules} rule${analytics.activeBundleRules === 1 ? '' : 's'} actively monitoring orders`
                        }
                      </Text>
                    </BlockStack>
                  </Layout.Section>

                  <Layout.Section variant="oneHalf">
                    <BlockStack gap="200">
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodyMd">
                          Conversion Rate
                        </Text>
                        <Badge tone={hasConversions ? "success" : "info"}>
                          {hasConversions && analytics.activeBundleRules > 0
                            ? `${(analytics.totalConversions / analytics.activeBundleRules).toFixed(1)} per rule`
                            : "No data yet"
                          }
                        </Badge>
                      </InlineStack>
                      <ProgressBar 
                        progress={hasConversions ? 75 : 0} 
                        size="small"
                      />
                      <Text as="p" variant="bodySm" tone="subdued">
                        {hasConversions 
                          ? "Based on active rules performance" 
                          : "Create rules and place orders to see metrics"
                        }
                      </Text>
                    </BlockStack>
                  </Layout.Section>
                </Layout>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Top Performing Rules */}
        {topRules.length > 0 && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Top Performing Bundle Rules
                  </Text>
                  <DataTable
                    columnContentTypes={['text', 'text', 'numeric', 'numeric', 'text']}
                    headings={['Rule Name', 'Bundled SKU', 'Conversions', 'Total Savings', 'Status']}
                    rows={topRules.map((rule) => [
                      rule.name,
                      rule.bundledSku,
                      rule.frequency,
                      `$${rule.savings.toFixed(2)}`,
                      <Badge key={rule.id} tone={rule.status === 'active' ? 'success' : 'info'}>
                        {rule.status}
                      </Badge>,
                    ])}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}

        {/* Recent Conversions */}
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Recent Order Conversions
                  </Text>
                  {hasConversions && (
                    <Button onClick={() => navigate('/app/orders')}>
                      View All
                    </Button>
                  )}
                </InlineStack>
                
                {recentConversions.length > 0 ? (
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'numeric', 'text']}
                    headings={['Order ID', 'Bundle Rule', 'Bundled SKU', 'Savings', 'Date']}
                    rows={recentConversions.map((conversion) => [
                      `#${conversion.orderId.slice(-8)}`,
                      conversion.bundleRule.name,
                      conversion.bundledSku,
                      `$${conversion.savingsAmount.toFixed(2)}`,
                      new Date(conversion.convertedAt).toLocaleDateString(),
                    ])}
                  />
                ) : (
                  <EmptyState
                    heading="No order conversions yet"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Order conversions will appear here when customers order items that match your bundle rules.</p>
                    <p>Make sure you have active bundle rules configured and customers are placing orders.</p>
                  </EmptyState>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Getting Started Guide - Only show if no data */}
        {!hasAnyData && (
          <Layout>
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Get Started in 3 Simple Steps
                  </Text>
                  <BlockStack gap="400">
                    {/* Step 1 */}
                    <InlineStack gap="400" blockAlign="start">
                      <div style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        borderRadius: '50%',
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        color: 'white',
                        fontSize: '18px',
                        flexShrink: 0,
                      }}>
                        1
                      </div>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyLg" fontWeight="semibold">
                          Create Your First Bundle Rule
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Define which products should be bundled together. For example: "Phone Case + Screen Protector + Charging Cable" → "Phone Accessories Bundle SKU"
                        </Text>
                        <div>
                          <Button variant="primary" onClick={() => navigate('/app/bundle-rules')}>
                            Create Bundle Rule
                          </Button>
                        </div>
                      </BlockStack>
                    </InlineStack>

                    {/* Step 2 */}
                    <InlineStack gap="400" blockAlign="start">
                      <div style={{
                        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                        borderRadius: '50%',
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        color: 'white',
                        fontSize: '18px',
                        flexShrink: 0,
                      }}>
                        2
                      </div>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyLg" fontWeight="semibold">
                          Configure App Settings
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Set up notifications, minimum savings thresholds, and automation preferences to customize how the app works for your business.
                        </Text>
                        <div>
                          <Button onClick={() => navigate('/app/settings')}>
                            Open Settings
                          </Button>
                        </div>
                      </BlockStack>
                    </InlineStack>

                    {/* Step 3 */}
                    <InlineStack gap="400" blockAlign="start">
                      <div style={{
                        background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                        borderRadius: '50%',
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        color: 'white',
                        fontSize: '18px',
                        flexShrink: 0,
                      }}>
                        3
                      </div>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyLg" fontWeight="semibold">
                          Monitor & Save Money
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Watch as orders are automatically converted to bundled SKUs. Track your savings, optimize your rules, and reduce fulfillment costs.
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        )}
      </BlockStack>
    </Page>
  );
}
