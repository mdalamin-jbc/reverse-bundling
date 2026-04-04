import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
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
  ProgressBar,
  EmptyState,
  Select,
  Divider,
  Box,
} from "@shopify/polaris";
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

  const [daysBack, setDaysBack] = useState("90");

  const isAnalyzing = fetcher.state === "submitting" && fetcher.formData?.get("action") === "analyze-orders";
  const isCreating = fetcher.state === "submitting" && fetcher.formData?.get("action") === "create-rule-from-suggestion";

  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
    } else if (fetcher.data && !fetcher.data.success && fetcher.data.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleAnalyze = () => {
    const formData = new FormData();
    formData.append("action", "analyze-orders");
    formData.append("daysBack", daysBack);
    fetcher.submit(formData, { method: "POST" });
  };

  const handleCreateRule = (suggestionId: string) => {
    const formData = new FormData();
    formData.append("action", "create-rule-from-suggestion");
    formData.append("suggestionId", suggestionId);
    fetcher.submit(formData, { method: "POST" });
  };

  const handleDismiss = (suggestionId: string) => {
    const formData = new FormData();
    formData.append("action", "dismiss-suggestion");
    formData.append("suggestionId", suggestionId);
    fetcher.submit(formData, { method: "POST" });
  };

  const pendingSuggestions = suggestions.filter((s: any) => s.status === "pending");
  const appliedSuggestions = suggestions.filter((s: any) => s.status === "applied");

  // Check if a suggestion's items already exist as a rule
  const isAlreadyRule = (items: string) => {
    return existingRuleItems.includes(items);
  };

  return (
    <Page title="Bundle Analysis">
      <TitleBar title="Bundle Analysis" />

      <BlockStack gap="500">
        {error && (
          <Banner tone="critical" title="Error">
            <Text as="p" variant="bodyMd">{error}</Text>
          </Banner>
        )}

        {/* Analysis Controls */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Analyze Your Order History
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Our AI scans your past orders to find products customers frequently buy together.
              These become bundle suggestions you can activate with one click.
            </Text>

            <InlineStack gap="300" blockAlign="end">
              <Select
                label="Analyze orders from the last"
                options={[
                  { label: "30 days", value: "30" },
                  { label: "60 days", value: "60" },
                  { label: "90 days", value: "90" },
                  { label: "180 days", value: "180" },
                ]}
                value={daysBack}
                onChange={setDaysBack}
              />
              <Button
                variant="primary"
                onClick={handleAnalyze}
                loading={isAnalyzing}
              >
                {isAnalyzing ? "Analyzing Orders..." : "Run Analysis"}
              </Button>
            </InlineStack>

            {isAnalyzing && (
              <Banner tone="info">
                <Text as="p" variant="bodyMd">
                  Analyzing your order history... This may take a few minutes for large catalogs.
                </Text>
                <div style={{ marginTop: "8px" }}>
                  <ProgressBar progress={50} size="small" />
                </div>
              </Banner>
            )}
          </BlockStack>
        </Card>

        {/* Stats */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm" tone="subdued">Orders Analyzed</Text>
                <Text as="p" variant="heading2xl">{stats.totalOrders}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm" tone="subdued">Item Pairs Found</Text>
                <Text as="p" variant="heading2xl">{stats.cooccurrences}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm" tone="subdued">Bundle Suggestions</Text>
                <Text as="p" variant="heading2xl">{pendingSuggestions.length}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Pending Suggestions */}
        {pendingSuggestions.length > 0 ? (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Bundle Suggestions ({pendingSuggestions.length})
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                These product combinations are frequently ordered together. Create a bundle rule to save on fulfillment.
              </Text>

              {pendingSuggestions.map((suggestion: any) => {
                const items = JSON.parse(suggestion.items);
                const alreadyExists = isAlreadyRule(suggestion.items);

                return (
                  <Card key={suggestion.id}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="h3" variant="headingSm">{suggestion.name}</Text>
                            <Badge tone={suggestion.confidence >= 0.7 ? "success" : suggestion.confidence >= 0.4 ? "warning" : "info"}>
                              {Math.round(suggestion.confidence * 100)}% confidence
                            </Badge>
                            {alreadyExists && <Badge>Rule exists</Badge>}
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {items.length} items • Ordered together {suggestion.orderFrequency} times • Est. savings ${suggestion.potentialSavings.toFixed(2)}/order
                          </Text>
                        </BlockStack>

                        <InlineStack gap="200">
                          {!alreadyExists && (
                            <Button
                              variant="primary"
                              onClick={() => handleCreateRule(suggestion.id)}
                              loading={isCreating}
                            >
                              Create Bundle Rule
                            </Button>
                          )}
                          <Button
                            variant="plain"
                            onClick={() => handleDismiss(suggestion.id)}
                          >
                            Dismiss
                          </Button>
                        </InlineStack>
                      </InlineStack>

                      <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                        <Text as="p" variant="bodySm" fontWeight="medium">
                          Items: {items.join(" + ")}
                        </Text>
                      </Box>

                      <ProgressBar
                        progress={Math.min(suggestion.confidence * 100, 100)}
                        size="small"
                        tone={suggestion.confidence >= 0.7 ? "success" : suggestion.confidence >= 0.4 ? "warning" : "highlight"}
                      />
                    </BlockStack>
                  </Card>
                );
              })}
            </BlockStack>
          </Card>
        ) : (
          <Card>
            <EmptyState
              heading="No bundle suggestions yet"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              action={{
                content: "Run Analysis",
                onAction: handleAnalyze,
                loading: isAnalyzing,
              }}
            >
              <p>Run an analysis on your order history to discover which products your customers frequently buy together.</p>
            </EmptyState>
          </Card>
        )}

        {/* Applied Suggestions */}
        {appliedSuggestions.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Applied Suggestions ({appliedSuggestions.length})
              </Text>
              {appliedSuggestions.map((suggestion: any) => (
                <InlineStack key={suggestion.id} align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="success">Applied</Badge>
                    <Text as="span" variant="bodyMd">{suggestion.name}</Text>
                  </InlineStack>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {Math.round(suggestion.confidence * 100)}% confidence
                  </Text>
                </InlineStack>
              ))}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}