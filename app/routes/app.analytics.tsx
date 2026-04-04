import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
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
  Select,
  Badge,
  ProgressBar,
  Banner,
} from "@shopify/polaris";
import {
  OrderIcon,
  CashDollarIcon,
  ChartVerticalFilledIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ExportIcon,
  CalendarIcon,
  CheckCircleIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";
import { useState, useCallback, useMemo } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const offset = (page - 1) * limit;
  const dateRange = url.searchParams.get("range") || "all";
  const ruleFilter = url.searchParams.get("rule") || "all";

  try {
    // Date range filter
    let dateFilter: any = {};
    const now = new Date();
    if (dateRange === "7d") {
      dateFilter = { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    } else if (dateRange === "30d") {
      dateFilter = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
    } else if (dateRange === "90d") {
      dateFilter = { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
    } else if (dateRange === "180d") {
      dateFilter = { gte: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000) };
    } else if (dateRange === "1y") {
      dateFilter = { gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
    }

    // Fetch all analytics data
    const whereClause: any = { shop: session.shop };
    if (Object.keys(dateFilter).length > 0) {
      whereClause.periodStart = dateFilter;
    }
    if (ruleFilter !== "all") {
      whereClause.bundleRuleId = ruleFilter;
    }

    const analytics = await db.bundleAnalytics.findMany({
      where: whereClause,
      include: {
        bundleRule: { select: { name: true, bundledSku: true, status: true, frequency: true } },
      },
      orderBy: { periodStart: "desc" },
    });

    // Get all conversions for CSV export and detailed reporting
    const conversionsWhere: any = { shop: session.shop };
    if (Object.keys(dateFilter).length > 0) {
      conversionsWhere.convertedAt = dateFilter;
    }
    if (ruleFilter !== "all") {
      conversionsWhere.bundleRuleId = ruleFilter;
    }

    const conversions = await db.orderConversion.findMany({
      where: conversionsWhere,
      include: {
        bundleRule: { select: { name: true, bundledSku: true } },
      },
      orderBy: { convertedAt: "desc" },
    });

    // Get all rules for the filter dropdown
    const allRules = await db.bundleRule.findMany({
      where: { shop: session.shop },
      select: { id: true, name: true, status: true, frequency: true, savings: true },
      orderBy: { frequency: "desc" },
    });

    // Paginate analytics
    const totalAnalytics = analytics.length;
    const paginatedAnalytics = analytics.slice(offset, offset + limit);

    // Summary stats
    const totalOrders = analytics.reduce((sum, a) => sum + a.orderCount, 0);
    const totalSavings = analytics.reduce((sum, a) => sum + a.savingsAmount, 0);
    const avgOrderValue = totalOrders > 0 ? totalSavings / totalOrders : 0;

    // Conversions summary
    const totalConversions = conversions.length;
    const successConversions = conversions.filter((c) => c.status === "success").length;
    const failedConversions = conversions.filter((c) => c.status === "failed").length;
    const successRate = totalConversions > 0 ? Math.round((successConversions / totalConversions) * 100) : 100;
    const conversionSavings = conversions.reduce((sum, c) => sum + c.savingsAmount, 0);

    // Rule-by-rule comparison
    const ruleComparison = allRules.map((rule) => {
      const ruleConversions = conversions.filter((c) => c.bundleRuleId === rule.id);
      const ruleSavings = ruleConversions.reduce((sum, c) => sum + c.savingsAmount, 0);
      const ruleSuccess = ruleConversions.filter((c) => c.status === "success").length;
      return {
        id: rule.id,
        name: rule.name,
        status: rule.status,
        conversions: ruleConversions.length,
        savings: ruleSavings,
        avgSavings: ruleConversions.length > 0 ? ruleSavings / ruleConversions.length : rule.savings,
        successRate: ruleConversions.length > 0 ? Math.round((ruleSuccess / ruleConversions.length) * 100) : 100,
        share: totalConversions > 0 ? Math.round((ruleConversions.length / totalConversions) * 100) : 0,
      };
    });

    // CSV data for conversions export
    const csvConversions = conversions.map((c) => ({
      orderId: c.orderId,
      ruleName: c.bundleRule?.name || "Unknown",
      bundledSku: c.bundledSku,
      originalItems: c.originalItems,
      savingsAmount: c.savingsAmount,
      status: c.status,
      date: c.convertedAt,
    }));

    logInfo("Loaded enhanced analytics", {
      shop: session.shop,
      page,
      dateRange,
      ruleFilter,
      analyticsCount: paginatedAnalytics.length,
    });

    return json({
      analytics: paginatedAnalytics,
      summary: {
        totalOrders,
        totalSavings,
        avgOrderValue,
        totalRecords: totalAnalytics,
        totalConversions,
        successConversions,
        failedConversions,
        successRate,
        conversionSavings,
      },
      ruleComparison,
      allRules,
      csvConversions,
      pagination: {
        page,
        limit,
        total: totalAnalytics,
        totalPages: Math.ceil(totalAnalytics / limit),
      },
      filters: { dateRange, ruleFilter },
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error("Error loading analytics"), { shop: session.shop });
    return json({
      analytics: [],
      summary: { totalOrders: 0, totalSavings: 0, avgOrderValue: 0, totalRecords: 0, totalConversions: 0, successConversions: 0, failedConversions: 0, successRate: 100, conversionSavings: 0 },
      ruleComparison: [],
      allRules: [],
      csvConversions: [],
      pagination: { page: 1, limit, total: 0, totalPages: 0 },
      filters: { dateRange: "all", ruleFilter: "all" },
    });
  }
};

/* ─── CSV EXPORT HELPER ──────────────────────── */
function downloadCSV(data: any[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          const str = typeof val === "string" ? val : String(val ?? "");
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Analytics() {
  const { analytics, summary, pagination, ruleComparison, allRules, csvConversions, filters } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showComparison, setShowComparison] = useState(true);

  const setFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams);
      params.set(key, value);
      params.set("page", "1");
      setSearchParams(params);
    },
    [searchParams, setSearchParams]
  );

  const navigate = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams);
      params.set("page", newPage.toString());
      setSearchParams(params);
    },
    [searchParams, setSearchParams]
  );

  // Prepare CSV data for analytics records
  const analyticsCSV = useMemo(
    () =>
      analytics.map((r: any) => ({
        Rule: r.bundleRule?.name || "Unknown",
        SKU: r.bundleRule?.bundledSku || "",
        Period: r.period,
        Orders: r.orderCount,
        Savings: r.savingsAmount.toFixed(2),
        AvgSavings: r.orderCount > 0 ? (r.savingsAmount / r.orderCount).toFixed(2) : "0.00",
        StartDate: new Date(r.periodStart).toLocaleDateString(),
        EndDate: new Date(r.periodEnd).toLocaleDateString(),
      })),
    [analytics]
  );

  const ruleComparisonCSV = useMemo(
    () =>
      ruleComparison.map((r: any) => ({
        Rule: r.name,
        Status: r.status,
        Conversions: r.conversions,
        TotalSavings: r.savings.toFixed(2),
        AvgSavings: r.avgSavings.toFixed(2),
        SuccessRate: `${r.successRate}%`,
        Share: `${r.share}%`,
      })),
    [ruleComparison]
  );

  const dateRangeLabel: Record<string, string> = {
    all: "All Time",
    "7d": "Last 7 Days",
    "30d": "Last 30 Days",
    "90d": "Last 90 Days",
    "180d": "Last 6 Months",
    "1y": "Last Year",
  };

  return (
    <Page
      title="Reports & Analytics"
      subtitle="Detailed performance reports with CSV exports and rule comparisons"
    >
      <TitleBar title="Reports & Analytics" />

      <BlockStack gap="500">
        {/* ─── FILTERS BAR ──────────────────────── */}
        <Card>
          <InlineStack align="space-between" blockAlign="end" wrap>
            <InlineStack gap="300" blockAlign="end">
              <div style={{ minWidth: "160px" }}>
                <Select
                  label="Date Range"
                  options={[
                    { label: "All Time", value: "all" },
                    { label: "Last 7 Days", value: "7d" },
                    { label: "Last 30 Days", value: "30d" },
                    { label: "Last 90 Days", value: "90d" },
                    { label: "Last 6 Months", value: "180d" },
                    { label: "Last Year", value: "1y" },
                  ]}
                  value={filters.dateRange}
                  onChange={(v) => setFilter("range", v)}
                />
              </div>
              <div style={{ minWidth: "180px" }}>
                <Select
                  label="Bundle Rule"
                  options={[
                    { label: "All Rules", value: "all" },
                    ...allRules.map((r: any) => ({ label: r.name, value: r.id })),
                  ]}
                  value={filters.ruleFilter}
                  onChange={(v) => setFilter("rule", v)}
                />
              </div>
            </InlineStack>
            <InlineStack gap="200">
              <Button
                icon={ExportIcon}
                size="slim"
                onClick={() => downloadCSV(csvConversions, "conversions-report")}
                disabled={csvConversions.length === 0}
              >
                Export Conversions CSV
              </Button>
              <Button
                icon={ExportIcon}
                size="slim"
                variant="primary"
                onClick={() => downloadCSV(analyticsCSV, "analytics-report")}
                disabled={analyticsCSV.length === 0}
              >
                Export Analytics CSV
              </Button>
            </InlineStack>
          </InlineStack>
        </Card>

        {/* ─── SUMMARY METRICS ──────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">Conversions</Text>
                <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                  <Icon source={OrderIcon} tone="base" />
                </Box>
              </InlineStack>
              <Text as="p" variant="headingLg" fontWeight="bold">{summary.totalConversions.toLocaleString()}</Text>
              <InlineStack gap="200">
                <Badge tone="success">{summary.successConversions} success</Badge>
                {summary.failedConversions > 0 && <Badge tone="critical">{summary.failedConversions} failed</Badge>}
              </InlineStack>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">Total Savings</Text>
                <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                  <Icon source={CashDollarIcon} tone="base" />
                </Box>
              </InlineStack>
              <Text as="p" variant="headingLg" fontWeight="bold">${summary.conversionSavings.toFixed(2)}</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                {dateRangeLabel[filters.dateRange] || "All Time"}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">Avg Savings / Order</Text>
                <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                  <Icon source={ChartVerticalFilledIcon} tone="base" />
                </Box>
              </InlineStack>
              <Text as="p" variant="headingLg" fontWeight="bold">
                ${summary.totalConversions > 0 ? (summary.conversionSavings / summary.totalConversions).toFixed(2) : "0.00"}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">Per bundled order</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">Success Rate</Text>
                <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                  <Icon source={CheckCircleIcon} tone="success" />
                </Box>
              </InlineStack>
              <Text as="p" variant="headingLg" fontWeight="bold">{summary.successRate}%</Text>
              <ProgressBar
                progress={summary.successRate}
                tone={summary.successRate >= 90 ? "success" : summary.successRate >= 70 ? "highlight" : "critical"}
                size="small"
              />
            </BlockStack>
          </Card>
        </div>

        {/* ─── RULE COMPARISON ──────────────────── */}
        {ruleComparison.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd" fontWeight="semibold">📊 Rule-by-Rule Comparison</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Compare performance across all your bundle rules</Text>
                </BlockStack>
                <InlineStack gap="200">
                  <Button
                    size="slim"
                    icon={ExportIcon}
                    onClick={() => downloadCSV(ruleComparisonCSV, "rule-comparison")}
                  >
                    Export CSV
                  </Button>
                  <Button
                    size="slim"
                    variant="plain"
                    onClick={() => setShowComparison(!showComparison)}
                  >
                    {showComparison ? "Hide" : "Show"}
                  </Button>
                </InlineStack>
              </InlineStack>

              {showComparison && (
                <>
                  <Divider />

                  {/* Visual bar comparison */}
                  <BlockStack gap="300">
                    {ruleComparison
                      .filter((r: any) => r.conversions > 0)
                      .sort((a: any, b: any) => b.savings - a.savings)
                      .map((rule: any) => {
                        const maxSavings = Math.max(...ruleComparison.map((r: any) => r.savings), 1);
                        const barWidth = Math.max((rule.savings / maxSavings) * 100, 3);
                        return (
                          <Box key={rule.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                            <BlockStack gap="200">
                              <InlineStack align="space-between" blockAlign="center">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="p" variant="bodySm" fontWeight="bold">{rule.name}</Text>
                                  <Badge tone={rule.status === "active" ? "success" : "attention"}>{rule.status}</Badge>
                                </InlineStack>
                                <InlineStack gap="300">
                                  <Text as="p" variant="bodySm" tone="subdued">{rule.conversions} orders</Text>
                                  <Text as="p" variant="bodySm" fontWeight="bold" tone="success">${rule.savings.toFixed(2)}</Text>
                                </InlineStack>
                              </InlineStack>
                              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <div
                                  style={{
                                    height: "8px",
                                    width: `${barWidth}%`,
                                    borderRadius: "4px",
                                    background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
                                    transition: "width 0.3s ease",
                                  }}
                                />
                                <Text as="p" variant="bodySm" tone="subdued">{rule.share}%</Text>
                              </div>
                              <InlineStack gap="400">
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Avg: <strong>${rule.avgSavings.toFixed(2)}</strong>/order
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Success: <strong>{rule.successRate}%</strong>
                                </Text>
                              </InlineStack>
                            </BlockStack>
                          </Box>
                        );
                      })}
                    {ruleComparison.filter((r: any) => r.conversions > 0).length === 0 && (
                      <Box padding="400">
                        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                          No conversions recorded yet for the selected period.
                        </Text>
                      </Box>
                    )}
                  </BlockStack>

                  {/* Summary table */}
                  <DataTable
                    columnContentTypes={["text", "text", "numeric", "numeric", "numeric", "numeric", "numeric"]}
                    headings={["Rule", "Status", "Conversions", "Total Savings", "Avg/Order", "Success %", "Share %"]}
                    rows={ruleComparison.map((r: any) => [
                      r.name,
                      r.status,
                      r.conversions.toString(),
                      `$${r.savings.toFixed(2)}`,
                      `$${r.avgSavings.toFixed(2)}`,
                      `${r.successRate}%`,
                      `${r.share}%`,
                    ])}
                    hoverable
                    totals={[
                      "Total",
                      "",
                      ruleComparison.reduce((s: number, r: any) => s + r.conversions, 0).toString(),
                      `$${ruleComparison.reduce((s: number, r: any) => s + r.savings, 0).toFixed(2)}`,
                      "",
                      `${summary.successRate}%`,
                      "100%",
                    ]}
                  />
                </>
              )}
            </BlockStack>
          </Card>
        )}

        {/* ─── ANALYTICS RECORDS TABLE ──────────── */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd" fontWeight="semibold">📋 Analytics Records</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {summary.totalRecords} records
                  {filters.dateRange !== "all" ? ` — ${dateRangeLabel[filters.dateRange]}` : ""}
                  {filters.ruleFilter !== "all" ? ` — filtered` : ""}
                </Text>
              </BlockStack>
            </InlineStack>
            <Divider />

            {analytics.length === 0 ? (
              <EmptyState
                heading="No analytics data yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Analytics data accumulates automatically as bundle rules process orders. Create and activate bundle
                  rules to start tracking performance.
                </p>
              </EmptyState>
            ) : (
              <>
                <DataTable
                  columnContentTypes={["text", "text", "numeric", "numeric", "numeric", "text"]}
                  headings={["Bundle Rule", "Period", "Orders", "Savings", "Avg Savings", "Date Range"]}
                  rows={analytics.map((record: any) => [
                    record.bundleRule?.name || "Unknown Rule",
                    record.period,
                    record.orderCount.toString(),
                    `$${record.savingsAmount.toFixed(2)}`,
                    record.orderCount > 0 ? `$${(record.savingsAmount / record.orderCount).toFixed(2)}` : "$0.00",
                    `${new Date(record.periodStart).toLocaleDateString()} – ${new Date(record.periodEnd).toLocaleDateString()}`,
                  ])}
                  hoverable
                />

                {pagination.totalPages > 1 && (
                  <>
                    <Divider />
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Showing {(pagination.page - 1) * pagination.limit + 1}–
                        {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                      </Text>
                      <InlineStack gap="200">
                        <Button
                          size="slim"
                          icon={ArrowLeftIcon}
                          disabled={pagination.page <= 1}
                          onClick={() => navigate(pagination.page - 1)}
                        >
                          Previous
                        </Button>
                        <Button
                          size="slim"
                          icon={ArrowRightIcon}
                          disabled={pagination.page >= pagination.totalPages}
                          onClick={() => navigate(pagination.page + 1)}
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

        {/* ─── EXPORT SUMMARY BANNER ────────────── */}
        <Card>
          <Box padding="400">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd" fontWeight="bold">📥 Export Reports</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Download detailed CSV reports for accounting, analysis, or sharing with your team
                </Text>
              </BlockStack>
              <InlineStack gap="200">
                <Button
                  icon={ExportIcon}
                  onClick={() => downloadCSV(csvConversions, "all-conversions")}
                  disabled={csvConversions.length === 0}
                >
                  All Conversions ({csvConversions.length})
                </Button>
                <Button
                  icon={ExportIcon}
                  onClick={() => downloadCSV(ruleComparisonCSV, "rule-comparison")}
                  disabled={ruleComparisonCSV.length === 0}
                >
                  Rule Comparison ({ruleComparisonCSV.length})
                </Button>
                <Button
                  icon={ExportIcon}
                  variant="primary"
                  onClick={() => downloadCSV(analyticsCSV, "analytics-report")}
                  disabled={analyticsCSV.length === 0}
                >
                  Analytics ({analyticsCSV.length})
                </Button>
              </InlineStack>
            </InlineStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}