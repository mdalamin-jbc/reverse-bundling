import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Banner,
  Badge,
  EmptyState,
  Select,
  Box,
  Divider,
  ProgressBar,
  Icon,
} from "@shopify/polaris";
import {
  SearchIcon,
  ProductIcon,
  ChartVerticalFilledIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { OrderAnalysisService } from "../order-analysis.server";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Load existing suggestions from DB
    const suggestions = await db.bundleSuggestion.findMany({
      where: { shop: session.shop },
      orderBy: { confidence: "desc" },
      take: 50,
    });

    // Load order history stats
    const orderHistoryCount = await db.orderHistory.count({
      where: { shop: session.shop },
    });
    const unprocessedCount = await db.orderHistory.count({
      where: { shop: session.shop, processed: false },
    });
    const cooccurrenceCount = await db.itemCooccurrence.count({
      where: { shop: session.shop },
    });

    // Load existing bundle rules to check which suggestions are already applied
    const existingRules = await db.bundleRule.findMany({
      where: { shop: session.shop },
      select: { items: true, bundledSku: true },
    });

    return json({
      success: true,
      suggestions,
      stats: {
        totalOrders: orderHistoryCount,
        unprocessedOrders: unprocessedCount,
        cooccurrences: cooccurrenceCount,
      },
      existingRuleItems: existingRules.map(r => r.items),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error("Error loading analysis"), { shop: session.shop });
    return json({
      success: false,
      suggestions: [],
      stats: { totalOrders: 0, unprocessedOrders: 0, cooccurrences: 0 },
      existingRuleItems: [],
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");

  try {
    const analysisService = new OrderAnalysisService(admin, session.shop);

    switch (actionType) {
      case "analyze-orders": {
        const daysBack = parseInt(formData.get("daysBack") as string) || 90;
        await analysisService.analyzeOrderHistory(daysBack);
        const suggestions = await analysisService.generateBundleSuggestions();
        return json({ success: true, message: `Analysis complete! Found ${suggestions.length} bundle suggestions.` });
      }

      case "create-rule-from-suggestion": {
        const suggestionId = formData.get("suggestionId") as string;
        
        const suggestion = await db.bundleSuggestion.findUnique({
          where: { id: suggestionId },
        });

        if (!suggestion) {
          return json({ success: false, error: "Suggestion not found" });
        }

        const items = JSON.parse(suggestion.items);
        const bundledSku = `BUNDLE-${Date.now()}`;

        // Create the bundle rule
        const rule = await db.bundleRule.create({
          data: {
            shop: session.shop,
            name: suggestion.name,
            items: suggestion.items,
            bundledSku,
            status: "draft",
            savings: suggestion.potentialSavings,
            category: "auto-suggested",
            tags: JSON.stringify(["auto-suggested", "from-analysis"]),
          },
        });

        // Mark suggestion as applied
        await db.bundleSuggestion.update({
          where: { id: suggestionId },
          data: { status: "applied", appliedRuleId: rule.id },
        });

        logInfo("Created bundle rule from suggestion", {
          shop: session.shop,
          ruleId: rule.id,
          suggestionId,
          items: items.length,
        });

        return json({
          success: true,
          message: `Bundle rule "${suggestion.name}" created! Go to Bundle Rules to set the bundled SKU and activate it.`,
          ruleId: rule.id,
        });
      }

      case "dismiss-suggestion": {
        const suggestionId = formData.get("suggestionId") as string;
        await db.bundleSuggestion.update({
          where: { id: suggestionId },
          data: { status: "dismissed" },
        });
        return json({ success: true, message: "Suggestion dismissed" });
      }

      case "clear-analysis":
        await analysisService.clearAnalysisData();
        return json({ success: true, message: "Analysis data cleared" });

      default:
        return json({ success: false, error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    logError(error instanceof Error ? error : new Error("Error in analysis action"), { shop: session.shop });
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export default function BundleAnalysis() {
  const { suggestions, stats, existingRuleItems, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  const [daysBack, setDaysBack] = useState("90");

  const isAnalyzing = fetcher.state === "submitting" && fetcher.formData?.get("action") === "analyze-orders";
  const isCreating = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
      // Redirect to Bundle Rules after creating a rule from suggestion
      if ((fetcher.data as any)?.ruleId) {
        setTimeout(() => navigate('/app/bundle-rules'), 500);
      }
    } else if (fetcher.data && !fetcher.data.success && fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify, navigate]);

  const handleAnalyze = () => {
    fetcher.submit({ action: "analyze-orders", daysBack }, { method: "POST" });
  };

  const handleCreateRule = (suggestionId: string) => {
    fetcher.submit({ action: "create-rule-from-suggestion", suggestionId }, { method: "POST" });
  };

  const handleDismiss = (suggestionId: string) => {
    fetcher.submit({ action: "dismiss-suggestion", suggestionId }, { method: "POST" });
  };

  const pendingSuggestions = suggestions.filter((s: any) => s.status === "pending");
  const appliedSuggestions = suggestions.filter((s: any) => s.status === "applied");
  const isAlreadyRule = (items: string) => existingRuleItems.includes(items);

  return (
    <Page
      title="Bundle Analysis"
      subtitle="Discover products frequently bought together to create profitable bundle rules"
      primaryAction={{
        content: isAnalyzing ? "Analyzing..." : "Run Analysis",
        onAction: handleAnalyze,
        loading: isAnalyzing,
        icon: SearchIcon,
      }}
    >
      <TitleBar title="Bundle Analysis" />

      <BlockStack gap="500">
        {error && (
          <Banner tone="critical"><p>{error}</p></Banner>
        )}

        {isAnalyzing && (
          <Banner tone="info">
            <p>Scanning your order history for bundling opportunities. This may take a moment for stores with many orders.</p>
          </Banner>
        )}

        {/* Stats + Controls */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="p" variant="bodySm" tone="subdued">Time Range</Text>
                <Select
                  label=""
                  labelHidden
                  options={[
                    { label: "Last 30 days", value: "30" },
                    { label: "Last 60 days", value: "60" },
                    { label: "Last 90 days", value: "90" },
                    { label: "Last 180 days", value: "180" },
                  ]}
                  value={daysBack}
                  onChange={setDaysBack}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Orders Analyzed</Text>
                  <Box background="bg-fill-info-secondary" padding="100" borderRadius="full">
                    <Icon source={ChartVerticalFilledIcon} tone="info" />
                  </Box>
                </InlineStack>
                <Text as="p" variant="headingLg" fontWeight="bold">{stats.totalOrders.toLocaleString()}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{stats.cooccurrences} item pairs found</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">Suggestions</Text>
                  <Box background="bg-fill-success-secondary" padding="100" borderRadius="full">
                    <Icon source={ProductIcon} tone="success" />
                  </Box>
                </InlineStack>
                <Text as="p" variant="headingLg" fontWeight="bold">{pendingSuggestions.length} pending</Text>
                <Text as="p" variant="bodySm" tone="subdued">{appliedSuggestions.length} applied as rules</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Pending Suggestions */}
        {pendingSuggestions.length > 0 ? (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd" fontWeight="semibold">Bundle Suggestions</Text>
                <Text as="p" variant="bodySm" tone="subdued">Products frequently purchased together. Create rules to start saving on fulfillment.</Text>
              </BlockStack>
              <Divider />

              {pendingSuggestions.map((suggestion: any) => {
                const items = JSON.parse(suggestion.items);
                const alreadyExists = isAlreadyRule(suggestion.items);
                const confidence = Math.round(suggestion.confidence * 100);

                return (
                  <Box key={suggestion.id} padding="400" background="bg-surface-secondary" borderRadius="300">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="start" wrap={false}>
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="h3" variant="headingSm" fontWeight="semibold">{suggestion.name}</Text>
                            {alreadyExists && <Badge tone="info">Rule exists</Badge>}
                          </InlineStack>
                          <InlineStack gap="300" wrap>
                            <Text as="p" variant="bodySm" tone="subdued">{items.length} items</Text>
                            <Text as="p" variant="bodySm" tone="subdued">{suggestion.orderFrequency} co-occurrences</Text>
                            <Text as="p" variant="bodySm" fontWeight="semibold" tone="success">~${suggestion.potentialSavings.toFixed(2)}/order</Text>
                          </InlineStack>
                        </BlockStack>
                        <InlineStack gap="200">
                          {!alreadyExists && (
                            <Button size="slim" variant="primary" onClick={() => handleCreateRule(suggestion.id)} loading={isCreating}>
                              Create rule
                            </Button>
                          )}
                          <Button size="slim" variant="plain" tone="critical" onClick={() => handleDismiss(suggestion.id)}>Dismiss</Button>
                        </InlineStack>
                      </InlineStack>

                      {/* Confidence bar */}
                      <BlockStack gap="100">
                        <InlineStack align="space-between">
                          <Text as="p" variant="bodySm" tone="subdued">Confidence</Text>
                          <Text as="p" variant="bodySm" fontWeight="semibold">{confidence}%</Text>
                        </InlineStack>
                        <ProgressBar progress={confidence} tone={confidence >= 70 ? "success" : confidence >= 40 ? "highlight" : "critical"} size="small" />
                      </BlockStack>

                      <Box padding="200" background="bg-surface" borderRadius="200">
                        <Text as="p" variant="bodySm">{items.join("  +  ")}</Text>
                      </Box>
                    </BlockStack>
                  </Box>
                );
              })}
            </BlockStack>
          </Card>
        ) : (
          <Card>
            <EmptyState
              heading="No bundle suggestions yet"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              action={{ content: "Run Analysis", onAction: handleAnalyze, loading: isAnalyzing }}
            >
              <p>Analyze your order history to discover products that customers frequently buy together. Our algorithm identifies the best bundling opportunities.</p>
            </EmptyState>
          </Card>
        )}

        {/* Applied Suggestions */}
        {appliedSuggestions.length > 0 && (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd" fontWeight="semibold">Applied Suggestions</Text>
                <Text as="p" variant="bodySm" tone="subdued">Suggestions that have been converted to bundle rules</Text>
              </BlockStack>
              <Divider />
              {appliedSuggestions.map((s: any) => (
                <InlineStack key={s.id} align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="span" variant="bodyMd">{s.name}</Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="success">Active</Badge>
                    <Text as="span" variant="bodySm" tone="subdued">{Math.round(s.confidence * 100)}% confidence</Text>
                  </InlineStack>
                </InlineStack>
              ))}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}