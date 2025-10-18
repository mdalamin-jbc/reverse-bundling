import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  InlineStack,
  DataTable,
  TextField,
  Select,
  Button,
  EmptyState,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { useState, useMemo } from "react";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";
import { withCache, cacheKeys } from "../cache.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  try {
    // Cache expensive stats calculation for 5 minutes
    const statsKey = cacheKeys.shopStats(session.shop);
    const stats = await withCache(statsKey, 5 * 60 * 1000, async () => {
      // Get summary statistics with optimized queries
      const [totalConversions, totalSavingsResult, avgSavingsResult] = await Promise.all([
        db.orderConversion.count({ where: { shop: session.shop } }),
        db.orderConversion.aggregate({
          where: { shop: session.shop },
          _sum: { savingsAmount: true }
        }),
        db.orderConversion.aggregate({
          where: { shop: session.shop },
          _avg: { savingsAmount: true }
        })
      ]);

      return {
        totalConversions,
        totalSavings: totalSavingsResult._sum.savingsAmount || 0,
        avgSavings: avgSavingsResult._avg.savingsAmount || 0
      };
    });

    // Fetch paginated conversions with optimized query
    const conversions = await db.orderConversion.findMany({
      where: { shop: session.shop },
      include: {
        bundleRule: {
          select: { name: true, bundledSku: true } // Only select needed fields
        }
      },
      orderBy: { convertedAt: 'desc' },
      skip: offset,
      take: limit
    });

    logInfo('Loaded paginated order conversions', {
      shop: session.shop,
      page,
      limit,
      conversionCount: conversions.length,
      totalConversions: stats.totalConversions
    });

    return json({
      conversions,
      stats,
      pagination: {
        page,
        limit,
        total: stats.totalConversions,
        totalPages: Math.ceil(stats.totalConversions / limit)
      }
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Error loading conversions'), { shop: session.shop });
    return json({ 
      conversions: [],
      stats: {
        totalConversions: 0,
        totalSavings: 0,
        avgSavings: 0
      }
    });
  }
};

export default function OrderConversions() {
  const { conversions, stats } = useLoaderData<typeof loader>();
  
  // Filter out any null conversions (shouldn't happen but TypeScript needs this)
  const validConversions = conversions.filter(c => c !== null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");

  // Filter and sort conversions
  const filteredConversions = useMemo(() => {
    let filtered = validConversions;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(c => 
        c.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.bundledSku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.bundleRule.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter (based on savings amount)
    if (filterStatus === "high_value") {
      filtered = filtered.filter(c => c.savingsAmount >= 10);
    } else if (filterStatus === "medium_value") {
      filtered = filtered.filter(c => c.savingsAmount >= 5 && c.savingsAmount < 10);
    } else if (filterStatus === "low_value") {
      filtered = filtered.filter(c => c.savingsAmount < 5);
    }

    // Sort
    const sorted = [...filtered];
    if (sortBy === "date_desc") {
      sorted.sort((a, b) => new Date(b.convertedAt).getTime() - new Date(a.convertedAt).getTime());
    } else if (sortBy === "date_asc") {
      sorted.sort((a, b) => new Date(a.convertedAt).getTime() - new Date(b.convertedAt).getTime());
    } else if (sortBy === "savings_desc") {
      sorted.sort((a, b) => b.savingsAmount - a.savingsAmount);
    } else if (sortBy === "savings_asc") {
      sorted.sort((a, b) => a.savingsAmount - b.savingsAmount);
    }

    return sorted;
  }, [validConversions, searchQuery, filterStatus, sortBy]);

  // Prepare data for DataTable
  const tableRows = filteredConversions.map(conversion => {
    const originalItems = JSON.parse(conversion.originalItems);
    
    return [
      // Order ID
      conversion.orderId,
      
      // Bundle Rule
      conversion.bundleRule.name,
      
      // Original Items Count
      `${originalItems.length} items`,
      
      // Bundled SKU
      conversion.bundledSku,
      
      // Savings
      `$${conversion.savingsAmount.toFixed(2)}`,
      
      // Converted Date
      new Date(conversion.convertedAt).toLocaleString()
    ];
  });

  return (
    <Page>
      <TitleBar title="Order Conversions" />
      
      <BlockStack gap="500">
        {/* Summary Cards */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  Total Conversions
                </Text>
                <Text as="h2" variant="headingLg">
                  {stats.totalConversions}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  Total Savings
                </Text>
                <Text as="h2" variant="headingLg" tone="success">
                  ${stats.totalSavings.toFixed(2)}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  Average Savings
                </Text>
                <Text as="h2" variant="headingLg">
                  ${stats.avgSavings.toFixed(2)}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Filters */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              🔍 Filter & Search
            </Text>
            
            <InlineStack gap="400" wrap>
              <Box minWidth="300px">
                <TextField
                  label="Search orders"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Order ID, SKU, or bundle name..."
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearchQuery("")}
                />
              </Box>
              
              <Box minWidth="200px">
                <Select
                  label="Filter by value"
                  options={[
                    { label: "All conversions", value: "all" },
                    { label: "High value ($10+)", value: "high_value" },
                    { label: "Medium value ($5-$10)", value: "medium_value" },
                    { label: "Low value (<$5)", value: "low_value" },
                  ]}
                  value={filterStatus}
                  onChange={setFilterStatus}
                />
              </Box>
              
              <Box minWidth="200px">
                <Select
                  label="Sort by"
                  options={[
                    { label: "Date (newest first)", value: "date_desc" },
                    { label: "Date (oldest first)", value: "date_asc" },
                    { label: "Savings (highest first)", value: "savings_desc" },
                    { label: "Savings (lowest first)", value: "savings_asc" },
                  ]}
                  value={sortBy}
                  onChange={setSortBy}
                />
              </Box>
              
              {(searchQuery || filterStatus !== "all") && (
                <Button 
                  onClick={() => {
                    setSearchQuery("");
                    setFilterStatus("all");
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </InlineStack>
            
            <Text as="p" variant="bodySm" tone="subdued">
              Showing {filteredConversions.length} of {conversions.length} conversions
            </Text>
          </BlockStack>
        </Card>

        {/* Conversions Table */}
        <Card>
          {filteredConversions.length === 0 ? (
            <EmptyState
              heading={searchQuery || filterStatus !== "all" ? "No conversions match your filters" : "No order conversions yet"}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <BlockStack gap="200">
                {searchQuery || filterStatus !== "all" ? (
                  <Text as="p" variant="bodyMd">
                    Try adjusting your search or filters to find what you're looking for.
                  </Text>
                ) : (
                  <>
                    <Text as="p" variant="bodyMd">
                      Order conversions will appear here when customers place orders that match your bundle rules.
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Make sure you have active bundle rules set up and orders are being processed.
                    </Text>
                  </>
                )}
              </BlockStack>
            </EmptyState>
          ) : (
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text", "text"]}
              headings={[
                "Order ID",
                "Bundle Rule",
                "Items",
                "Bundle SKU",
                "Savings",
                "Converted At"
              ]}
              rows={tableRows}
              hoverable
            />
          )}
        </Card>

        {/* Export Section */}
        {conversions.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                📊 Export Data
              </Text>
              
              <InlineStack gap="300">
                <Button variant="secondary">
                  Export to CSV
                </Button>
                <Button variant="secondary">
                  Generate Report
                </Button>
              </InlineStack>
              
              <Text as="p" variant="bodySm" tone="subdued">
                Export conversion data for accounting, analysis, or record-keeping purposes.
              </Text>
            </BlockStack>
          </Card>
        )}

        {/* Insights */}
        {conversions.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                💡 Quick Insights
              </Text>
              
              <InlineStack gap="400" wrap>
                <Box padding="300" background="bg-surface-success" borderRadius="200" minWidth="200px">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Best Performing Rule
                    </Text>
                    <Text as="p" variant="bodySm">
                      {validConversions.length > 0 
                        ? validConversions.reduce((prev, current) => 
                            prev.savingsAmount > current.savingsAmount ? prev : current
                          ).bundleRule.name
                        : "N/A"
                      }
                    </Text>
                  </BlockStack>
                </Box>
                
                <Box padding="300" background="bg-surface-warning" borderRadius="200" minWidth="200px">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Today's Conversions
                    </Text>
                    <Text as="p" variant="bodySm">
                      {validConversions.filter(c => {
                        const today = new Date();
                        const convertDate = new Date(c.convertedAt);
                        return convertDate.toDateString() === today.toDateString();
                      }).length} orders
                    </Text>
                  </BlockStack>
                </Box>
                
                <Box padding="300" background="bg-surface" borderRadius="200" minWidth="200px">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Highest Single Savings
                    </Text>
                    <Text as="p" variant="bodySm">
                      ${validConversions.length > 0 
                        ? Math.max(...validConversions.map(c => c.savingsAmount)).toFixed(2)
                        : "0.00"
                      }
                    </Text>
                  </BlockStack>
                </Box>
              </InlineStack>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
