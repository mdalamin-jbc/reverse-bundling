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
  DataTable,
  EmptyState,
  Box,
} from "@shopify/polaris";
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
    <Page>
      <TitleBar title="Bundle Analytics" />

      <BlockStack gap="500">
        {/* Summary Cards */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  Total Orders Processed
                </Text>
                <Text as="h2" variant="headingLg">
                  {summary.totalOrders.toLocaleString()}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  Total Savings Generated
                </Text>
                <Text as="h2" variant="headingLg" tone="success">
                  ${summary.totalSavings.toFixed(2)}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  Average Order Value
                </Text>
                <Text as="h2" variant="headingLg">
                  ${summary.avgOrderValue.toFixed(2)}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Analytics Table */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              📊 Analytics Records ({summary.totalRecords})
            </Text>

            {analytics.length === 0 ? (
              <EmptyState
                heading="No analytics data yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    Analytics data will appear here as bundle rules process orders over time.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Make sure you have active bundle rules and orders are being processed.
                  </Text>
                </BlockStack>
              </EmptyState>
            ) : (
              <>
                <DataTable
                  columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                  headings={[
                    "Bundle Rule",
                    "Period",
                    "Orders",
                    "Savings",
                    "Avg Savings",
                    "Date Range"
                  ]}
                  rows={analytics.map((record: any) => [
                    record.bundleRule?.name || 'Unknown Rule',
                    record.period,
                    record.orderCount.toString(),
                    `$${record.savingsAmount.toFixed(2)}`,
                    record.orderCount > 0 ? `$${(record.savingsAmount / record.orderCount).toFixed(2)}` : '$0.00',
                    `${record.periodStart.toLocaleDateString()} - ${record.periodEnd.toLocaleDateString()}`
                  ])}
                  hoverable
                />

                {/* Pagination Controls */}
                {pagination.totalPages > 1 && (
                  <Box padding="400">
                    <BlockStack gap="300">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Showing {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} records
                        </Text>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <Button
                            variant="secondary"
                            disabled={pagination.page <= 1}
                            onClick={() => {
                              const newUrl = new URL(window.location.href);
                              newUrl.searchParams.set('page', (pagination.page - 1).toString());
                              window.location.href = newUrl.toString();
                            }}
                          >
                            ← Previous
                          </Button>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                              const pageNum = i + 1;
                              return (
                                <Button
                                  key={pageNum}
                                  variant={pageNum === pagination.page ? "primary" : "secondary"}
                                  size="slim"
                                  onClick={() => {
                                    const newUrl = new URL(window.location.href);
                                    newUrl.searchParams.set('page', pageNum.toString());
                                    window.location.href = newUrl.toString();
                                  }}
                                >
                                  {pageNum.toString()}
                                </Button>
                              );
                            })}
                          </div>
                          <Button
                            variant="secondary"
                            disabled={pagination.page >= pagination.totalPages}
                            onClick={() => {
                              const newUrl = new URL(window.location.href);
                              newUrl.searchParams.set('page', (pagination.page + 1).toString());
                              window.location.href = newUrl.toString();
                            }}
                          >
                            Next →
                          </Button>
                        </div>
                      </div>
                    </BlockStack>
                  </Box>
                )}
              </>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}