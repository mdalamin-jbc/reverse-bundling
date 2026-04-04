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
  Badge,
  Divider,
  Icon,
} from "@shopify/polaris";
import {
  OrderIcon,
  CashDollarIcon,
  ChartVerticalFilledIcon,
  SearchIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { useState, useMemo } from "react";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  try {
    // Get fresh stats (don't cache critical conversion counts)
    const stats = await (async () => {
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
    })();

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
  
  const validConversions = conversions.filter(c => c !== null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");

  const filteredConversions = useMemo(() => {
    let filtered = validConversions;

    if (searchQuery) {
      filtered = filtered.filter(c => 
        c.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.bundledSku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.bundleRule.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (filterStatus === "high_value") {
      filtered = filtered.filter(c => c.savingsAmount >= 10);
    } else if (filterStatus === "medium_value") {
      filtered = filtered.filter(c => c.savingsAmount >= 5 && c.savingsAmount < 10);
    } else if (filterStatus === "low_value") {
      filtered = filtered.filter(c => c.savingsAmount < 5);
    }

    const sorted = [...filtered];
    if (sortBy === "date_desc") sorted.sort((a, b) => new Date(b.convertedAt).getTime() - new Date(a.convertedAt).getTime());
    else if (sortBy === "date_asc") sorted.sort((a, b) => new Date(a.convertedAt).getTime() - new Date(b.convertedAt).getTime());
    else if (sortBy === "savings_desc") sorted.sort((a, b) => b.savingsAmount - a.savingsAmount);
    else if (sortBy === "savings_asc") sorted.sort((a, b) => a.savingsAmount - b.savingsAmount);

    return sorted;
  }, [validConversions, searchQuery, filterStatus, sortBy]);

  const tableRows = filteredConversions.map(conversion => {
    const originalItems = JSON.parse(conversion.originalItems);
    return [
      conversion.orderId,
      conversion.bundleRule.name,
      `${originalItems.length} items`,
      conversion.bundledSku,
      `$${conversion.savingsAmount.toFixed(2)}`,
      new Date(conversion.convertedAt).toLocaleString(),
    ];
  });

  return (
    <Page
      title="Order Conversions"
      subtitle="Track all orders automatically matched to your bundle rules"
    >
      <TitleBar title="Order Conversions" />

      <BlockStack gap="500">
        {/* Summary metrics */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Total Conversions</Text>
                  <Icon source={OrderIcon} tone="base" />
                </InlineStack>
                <Text as="p" variant="headingLg" fontWeight="bold">{stats.totalConversions.toLocaleString()}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Total Savings</Text>
                  <Icon source={CashDollarIcon} tone="base" />
                </InlineStack>
                <Text as="p" variant="headingLg" fontWeight="bold">${stats.totalSavings.toFixed(2)}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Average Savings</Text>
                  <Icon source={ChartVerticalFilledIcon} tone="base" />
                </InlineStack>
                <Text as="p" variant="headingLg" fontWeight="bold">${stats.avgSavings.toFixed(2)}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Filters */}
        <Card>
          <BlockStack gap="300">
            <InlineStack gap="300" wrap blockAlign="end">
              <Box minWidth="280px">
                <TextField
                  label="Search"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search by order ID, SKU, or rule name..."
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearchQuery("")}
                  prefix={<Icon source={SearchIcon} />}
                />
              </Box>
              <Select
                label="Savings value"
                options={[
                  { label: "All values", value: "all" },
                  { label: "High ($10+)", value: "high_value" },
                  { label: "Medium ($5–$10)", value: "medium_value" },
                  { label: "Low (<$5)", value: "low_value" },
                ]}
                value={filterStatus}
                onChange={setFilterStatus}
              />
              <Select
                label="Sort by"
                options={[
                  { label: "Newest first", value: "date_desc" },
                  { label: "Oldest first", value: "date_asc" },
                  { label: "Highest savings", value: "savings_desc" },
                  { label: "Lowest savings", value: "savings_asc" },
                ]}
                value={sortBy}
                onChange={setSortBy}
              />
              {(searchQuery || filterStatus !== "all") && (
                <Button onClick={() => { setSearchQuery(""); setFilterStatus("all"); }}>Clear filters</Button>
              )}
            </InlineStack>
            <Divider />
            <Text as="p" variant="bodySm" tone="subdued">
              Showing {filteredConversions.length} of {conversions.length} conversions
            </Text>
          </BlockStack>
        </Card>

        {/* Data table */}
        <Card>
          {filteredConversions.length === 0 ? (
            <EmptyState
              heading={searchQuery || filterStatus !== "all" ? "No matching conversions" : "No conversions yet"}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>{searchQuery || filterStatus !== "all"
                ? "Try adjusting your search or filters to find what you're looking for."
                : "Conversions will appear here automatically when orders match your active bundle rules."
              }</p>
            </EmptyState>
          ) : (
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text", "text"]}
              headings={["Order ID", "Bundle Rule", "Items", "Bundle SKU", "Savings", "Converted"]}
              rows={tableRows}
              hoverable
              sortable={[false, false, false, false, true, true]}
            />
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
