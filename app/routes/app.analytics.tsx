import type { LoaderFunctionArgs } from "@remix-run/node";
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
  DataTable,
  EmptyState,
  Box,
  Divider,
  Icon,
} from "@shopify/polaris";
import {
  OrderIcon,
  CashDollarIcon,
  ChartVerticalFilledIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";
import { withCache, cacheKeys } from "../cache.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const offset = (page - 1) * limit;

  try {
    // Cache analytics data for 15 minutes (analytics can be slightly stale)
    const analyticsKey = cacheKeys.bundleAnalytics(session.shop);
    const analytics = await withCache(analyticsKey, 15 * 60 * 1000, async () => {
      return db.bundleAnalytics.findMany({
        where: { shop: session.shop },
        include: {
          bundleRule: {
            select: { name: true, bundledSku: true }
          }
        },
        orderBy: { periodStart: 'desc' }
      });
    });

    // Get total count for pagination
    const totalAnalytics = analytics.length;

    // Apply pagination to the cached results
    const paginatedAnalytics = analytics.slice(offset, offset + limit);

    // Calculate summary statistics
    const totalOrders = analytics.reduce((sum, a) => sum + a.orderCount, 0);
    const totalSavings = analytics.reduce((sum, a) => sum + a.savingsAmount, 0);
    const avgOrderValue = totalOrders > 0 ? totalSavings / totalOrders : 0;

    logInfo('Loaded paginated bundle analytics', {
      shop: session.shop,
      page,
      limit,
      analyticsCount: paginatedAnalytics.length,
      totalAnalytics
    });

    return json({
      analytics: paginatedAnalytics,
      summary: {
        totalOrders,
        totalSavings,
        avgOrderValue,
        totalRecords: totalAnalytics
      },
      pagination: {
        page,
        limit,
        total: totalAnalytics,
        totalPages: Math.ceil(totalAnalytics / limit)
      }
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Error loading analytics'), { shop: session.shop });
    return json({
      analytics: [],
      summary: {
        totalOrders: 0,
        totalSavings: 0,
        avgOrderValue: 0,
        totalRecords: 0
      },
      pagination: {
        page: 1,
        limit,
        total: 0,
        totalPages: 0
      }
    });
  }
};

export default function Analytics() {
  const { analytics, summary, pagination } = useLoaderData<typeof loader>();

  return (
    <Page
      title="Bundle Analytics"
      subtitle="Performance metrics and trends for your bundle rules over time"
    >
      <TitleBar title="Bundle Analytics" />

      <BlockStack gap="500">
        {/* Summary metrics */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Orders Processed</Text>
                  <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                    <Icon source={OrderIcon} tone="base" />
                  </Box>
                </InlineStack>
                <Text as="p" variant="headingLg" fontWeight="bold">{summary.totalOrders.toLocaleString()}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{summary.totalRecords} analytics records</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Total Savings</Text>
                  <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                    <Icon source={CashDollarIcon} tone="base" />
                  </Box>
                </InlineStack>
                <Text as="p" variant="headingLg" fontWeight="bold">${summary.totalSavings.toFixed(2)}</Text>
                <Text as="p" variant="bodySm" tone="subdued">Across all bundle rules</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Avg Savings / Order</Text>
                  <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                    <Icon source={ChartVerticalFilledIcon} tone="base" />
                  </Box>
                </InlineStack>
                <Text as="p" variant="headingLg" fontWeight="bold">${summary.avgOrderValue.toFixed(2)}</Text>
                <Text as="p" variant="bodySm" tone="subdued">Per bundled order</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Data table */}
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd" fontWeight="semibold">Analytics Records</Text>
              <Text as="p" variant="bodySm" tone="subdued">{summary.totalRecords} records across all bundle rules and periods</Text>
            </BlockStack>
            <Divider />

            {analytics.length === 0 ? (
              <EmptyState
                heading="No analytics data yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Analytics data accumulates automatically as bundle rules process orders. Create and activate bundle rules to start tracking performance.</p>
              </EmptyState>
            ) : (
              <>
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "numeric", "numeric", "text"]}
                  headings={["Bundle Rule", "Period", "Orders", "Savings", "Avg Savings", "Date Range"]}
                  rows={analytics.map((record: any) => [
                    record.bundleRule?.name || 'Unknown Rule',
                    record.period,
                    record.orderCount.toString(),
                    `$${record.savingsAmount.toFixed(2)}`,
                    record.orderCount > 0 ? `$${(record.savingsAmount / record.orderCount).toFixed(2)}` : '$0.00',
                    `${new Date(record.periodStart).toLocaleDateString()} – ${new Date(record.periodEnd).toLocaleDateString()}`
                  ])}
                  hoverable
                />

                {pagination.totalPages > 1 && (
                  <>
                    <Divider />
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                      </Text>
                      <InlineStack gap="200">
                        <Button
                          size="slim"
                          icon={ArrowLeftIcon}
                          disabled={pagination.page <= 1}
                          onClick={() => {
                            const u = new URL(window.location.href);
                            u.searchParams.set('page', (pagination.page - 1).toString());
                            window.location.href = u.toString();
                          }}
                        >
                          Previous
                        </Button>
                        <Button
                          size="slim"
                          icon={ArrowRightIcon}
                          disabled={pagination.page >= pagination.totalPages}
                          onClick={() => {
                            const u = new URL(window.location.href);
                            u.searchParams.set('page', (pagination.page + 1).toString());
                            window.location.href = u.toString();
                          }}
                        >
                          Next
                        </Button>
                      </InlineStack>
                    </InlineStack>
                  </>
                )}
              </>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}