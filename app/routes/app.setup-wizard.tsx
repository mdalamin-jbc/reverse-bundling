import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Select,
  TextField,
  Banner,
  Box,
  Divider,
  Badge,
  ProgressBar,
  Icon,
  Checkbox,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  ChevronRightIcon,
  InventoryIcon,
  CashDollarIcon,
  SettingsIcon,
  DeliveryIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";
import { useState, useCallback, useEffect } from "react";

/* ─── LOADER ─────────────────────────────────── */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  try {
    // Check existing setup state
    const [rulesCount, settings, conversionsCount] = await Promise.all([
      db.bundleRule.count({ where: { shop: session.shop } }),
      db.appSettings.findUnique({ where: { shop: session.shop } }),
      db.orderConversion.count({ where: { shop: session.shop } }),
    ]);

    // Fetch products from Shopify
    const response = await admin.graphql(`
      query {
        products(first: 50, sortKey: BEST_SELLING) {
          edges {
            node {
              id
              title
              productType
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    sku
                    price
                    displayName
                  }
                }
              }
            }
          }
        }
      }
    `);

    const data = await response.json();
    const products = (data.data?.products?.edges || []).map((e: any) => ({
      id: e.node.id,
      title: e.node.title,
      type: e.node.productType || "Uncategorized",
      variants: (e.node.variants?.edges || []).map((v: any) => ({
        id: v.node.id,
        title: v.node.title,
        sku: v.node.sku || "",
        price: parseFloat(v.node.price || "0"),
        displayName: v.node.displayName,
      })),
    }));

    return json({
      products,
      setupState: {
        hasRules: rulesCount > 0,
        rulesCount,
        hasSettings: !!settings,
        fulfillmentMode: settings?.fulfillmentMode || "tag_only",
        hasConversions: conversionsCount > 0,
        individualShipCost: settings?.individualShipCost || 7.0,
        bundleShipCost: settings?.bundleShipCost || 9.0,
      },
      shop: session.shop,
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error("Wizard loader error"), {
      shop: session.shop,
    });
    return json({ products: [], setupState: { hasRules: false, rulesCount: 0, hasSettings: false, fulfillmentMode: "tag_only", hasConversions: false, individualShipCost: 7.0, bundleShipCost: 9.0 }, shop: session.shop });
  }
};

/* ─── ACTION ─────────────────────────────────── */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "createRule") {
    const name = formData.get("name") as string;
    const items = formData.get("items") as string; // comma-separated variant IDs
    const savings = parseFloat(formData.get("savings") as string) || 0;
    const fulfillmentMode = formData.get("fulfillmentMode") as string;
    const individualShipCost = parseFloat(formData.get("individualShipCost") as string) || 7.0;
    const bundleShipCost = parseFloat(formData.get("bundleShipCost") as string) || 9.0;
    const autoCreate = formData.get("autoCreateProduct") === "true";

    if (!name || !items) {
      return json({ success: false, error: "Rule name and products are required" });
    }

    const itemList = items.split(",").map((s) => s.trim()).filter(Boolean);

    try {
      const ruleId = Date.now().toString();
      let finalBundledSku = `BUNDLE-${ruleId}`;

      if (autoCreate) {
        // Fetch variant details for pricing
        const variantIds = itemList.filter((id) => id.startsWith("gid://"));
        let totalPrice = 0;

        if (variantIds.length > 0) {
          for (const vid of variantIds) {
            const vResp = await admin.graphql(`query { node(id: "${vid}") { ... on ProductVariant { price } } }`);
            const vData = await vResp.json();
            totalPrice += parseFloat(vData.data?.node?.price || "0");
          }
        }

        // Create bundle product in Shopify
        const createResp = await admin.graphql(`
          mutation productSet($input: ProductSetInput!) {
            productSet(input: $input) {
              product { id title }
              userErrors { field message }
            }
          }
        `, {
          variables: {
            input: {
              title: `${name} Bundle`,
              productOptions: [{ name: "Title", values: [{ name: "Default" }] }],
              variants: [{
                optionValues: [{ optionName: "Title", name: "Default" }],
                price: totalPrice || 0,
                sku: finalBundledSku,
                inventoryPolicy: "DENY",
              }],
              tags: ["auto-generated", "bundle", `rule-${ruleId}`],
            },
          },
        });

        const createData = await createResp.json();
        if (createData.data?.productSet?.userErrors?.length > 0) {
          return json({
            success: false,
            error: createData.data.productSet.userErrors[0].message,
          });
        }
      }

      // Create rule in database
      await db.bundleRule.create({
        data: {
          shop: session.shop,
          name,
          items: JSON.stringify(itemList),
          bundledSku: finalBundledSku,
          status: "active",
          savings,
          category: "wizard-created",
          tags: JSON.stringify(["setup-wizard"]),
        },
      });

      // Update settings
      await db.appSettings.upsert({
        where: { shop: session.shop },
        update: {
          fulfillmentMode,
          individualShipCost,
          bundleShipCost,
        },
        create: {
          shop: session.shop,
          fulfillmentMode,
          individualShipCost,
          bundleShipCost,
        },
      });

      logInfo("Setup wizard completed", { shop: session.shop, ruleName: name, itemCount: itemList.length });

      return json({ success: true, message: "Your first bundle rule is live!" });
    } catch (error) {
      logError(error instanceof Error ? error : new Error("Wizard action error"), { shop: session.shop });
      return json({ success: false, error: "Failed to create rule. Please try again." });
    }
  }

  return json({ success: false, error: "Unknown action" });
};

/* ─── STEP INDICATOR ─────────────────────────── */
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <BlockStack gap="300">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="p" variant="bodySm" tone="subdued">
          Step {current} of {total}
        </Text>
        <Text as="p" variant="bodySm" fontWeight="semibold">
          {Math.round((current / total) * 100)}% complete
        </Text>
      </InlineStack>
      <ProgressBar progress={(current / total) * 100} tone="primary" size="small" />
    </BlockStack>
  );
}

/* ─── MAIN WIZARD ────────────────────────────── */
export default function SetupWizard() {
  const { products, setupState } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const totalSteps = 4;

  // Step 1 — Select products
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  // Step 2 — Name & savings
  const [ruleName, setRuleName] = useState("");
  const [autoCreate, setAutoCreate] = useState(true);

  // Step 3 — Fulfillment settings
  const [fulfillmentMode, setFulfillmentMode] = useState(setupState.fulfillmentMode);
  const [individualCost, setIndividualCost] = useState(setupState.individualShipCost.toString());
  const [bundleCost, setBundleCost] = useState(setupState.bundleShipCost.toString());

  const estimatedSavings = selectedProducts.length > 0
    ? (selectedProducts.length * parseFloat(individualCost || "0")) - parseFloat(bundleCost || "0")
    : 0;

  // Product selection toggle
  const toggleProduct = useCallback((variantId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(variantId) ? prev.filter((p) => p !== variantId) : [...prev, variantId]
    );
  }, []);

  // Auto-generate rule name from selected products
  useEffect(() => {
    if (selectedProducts.length >= 2 && !ruleName) {
      const names = selectedProducts
        .map((vid) => {
          for (const p of products) {
            const v = p.variants.find((v: any) => v.id === vid);
            if (v) return p.title;
          }
          return null;
        })
        .filter(Boolean);
      const unique = [...new Set(names)];
      if (unique.length > 0) {
        setRuleName(unique.slice(0, 3).join(" + "));
      }
    }
  }, [selectedProducts, products, ruleName]);

  // Submit handler
  const handleSubmit = useCallback(() => {
    fetcher.submit(
      {
        intent: "createRule",
        name: ruleName,
        items: selectedProducts.join(","),
        savings: estimatedSavings.toString(),
        fulfillmentMode,
        individualShipCost: individualCost,
        bundleShipCost: bundleCost,
        autoCreateProduct: autoCreate.toString(),
      },
      { method: "POST" }
    );
  }, [fetcher, ruleName, selectedProducts, estimatedSavings, fulfillmentMode, individualCost, bundleCost, autoCreate]);

  const isSubmitting = fetcher.state !== "idle";
  const result = fetcher.data;

  // If already set up, show completion
  if (result?.success) {
    return (
      <Page title="Setup Complete!">
        <TitleBar title="Setup Wizard" />
        <Card>
          <Box padding="800">
            <BlockStack gap="500" inlineAlign="center">
              <div style={{ fontSize: "64px", textAlign: "center" }}>🎉</div>
              <Text as="h1" variant="headingXl" fontWeight="bold" alignment="center">
                You're all set!
              </Text>
              <Text as="p" variant="bodyLg" tone="subdued" alignment="center">
                Your first bundle rule "{ruleName}" is now active. Orders matching this rule will be automatically processed.
              </Text>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", width: "100%", maxWidth: "600px" }}>
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="200" inlineAlign="center">
                    <Text as="p" variant="headingLg" fontWeight="bold" alignment="center">
                      {selectedProducts.length}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued" alignment="center">Products in bundle</Text>
                  </BlockStack>
                </Box>
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="200" inlineAlign="center">
                    <Text as="p" variant="headingLg" fontWeight="bold" tone="success" alignment="center">
                      ${estimatedSavings.toFixed(2)}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued" alignment="center">Savings per order</Text>
                  </BlockStack>
                </Box>
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="200" inlineAlign="center">
                    <Text as="p" variant="headingLg" fontWeight="bold" alignment="center">
                      {fulfillmentMode === "order_edit" ? "Auto" : "Tags"}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued" alignment="center">Fulfillment mode</Text>
                  </BlockStack>
                </Box>
              </div>

              <Divider />

              <Text as="h3" variant="headingSm" fontWeight="semibold" alignment="center">What happens next?</Text>
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                    <Icon source={CheckCircleIcon} tone="success" />
                  </Box>
                  <Text as="p" variant="bodySm">New orders are checked against your rule in real-time</Text>
                </InlineStack>
                <InlineStack gap="200" blockAlign="center">
                  <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                    <Icon source={CheckCircleIcon} tone="success" />
                  </Box>
                  <Text as="p" variant="bodySm">Matching orders are tagged/edited for bundled fulfillment</Text>
                </InlineStack>
                <InlineStack gap="200" blockAlign="center">
                  <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                    <Icon source={CheckCircleIcon} tone="success" />
                  </Box>
                  <Text as="p" variant="bodySm">Track savings on your Dashboard in real-time</Text>
                </InlineStack>
              </BlockStack>

              <InlineStack gap="300">
                <Button variant="primary" onClick={() => navigate("/app")}>Go to Dashboard</Button>
                <Button onClick={() => navigate("/app/bundle-rules")}>View Bundle Rules</Button>
                <Button variant="plain" onClick={() => navigate("/app/guidelines")}>Read Tutorial</Button>
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="Setup Wizard"
      subtitle="Create your first bundle rule in under 2 minutes"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <TitleBar title="Setup Wizard" />

      <BlockStack gap="500">
        {/* Progress */}
        <Card>
          <StepIndicator current={step} total={totalSteps} />
          <Box paddingBlockStart="300">
            <InlineStack gap="400" align="center">
              {[
                { n: 1, label: "Select Products", icon: InventoryIcon },
                { n: 2, label: "Name Your Bundle", icon: SettingsIcon },
                { n: 3, label: "Shipping Costs", icon: CashDollarIcon },
                { n: 4, label: "Review & Create", icon: DeliveryIcon },
              ].map((s) => (
                <div
                  key={s.n}
                  onClick={() => { if (s.n < step) setStep(s.n); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    borderRadius: "20px",
                    background: step === s.n
                      ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                      : step > s.n
                        ? "#e8f5e9"
                        : "#f6f6f7",
                    color: step === s.n ? "#fff" : step > s.n ? "#16a34a" : "#6b7280",
                    fontSize: "12px",
                    fontWeight: step === s.n ? 700 : 500,
                    cursor: s.n < step ? "pointer" : "default",
                    transition: "all 0.2s",
                  }}
                >
                  {step > s.n ? "✓" : s.n}
                  <span>{s.label}</span>
                </div>
              ))}
            </InlineStack>
          </Box>
        </Card>

        {result?.error && (
          <Banner title="Error" tone="critical">
            <p>{result.error}</p>
          </Banner>
        )}

        {/* ─── STEP 1: SELECT PRODUCTS ─── */}
        {step === 1 && (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg" fontWeight="bold">Select products that ship together</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Pick 2 or more products that your warehouse already packs as a single pre-packed bundle.
                </Text>
              </BlockStack>
              <Divider />

              {selectedProducts.length > 0 && (
                <Banner tone="info">
                  <p><strong>{selectedProducts.length} products selected</strong> — these will be grouped into one bundle SKU</p>
                </Banner>
              )}

              <div style={{ maxHeight: "400px", overflowY: "auto", padding: "4px" }}>
                <BlockStack gap="200">
                  {products.length === 0 ? (
                    <Box padding="600">
                      <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                        No products found in your store. Add products to Shopify first.
                      </Text>
                    </Box>
                  ) : (
                    products.map((product: any) =>
                      product.variants.map((variant: any) => {
                        const isSelected = selectedProducts.includes(variant.id);
                        return (
                          <div
                            key={variant.id}
                            onClick={() => toggleProduct(variant.id)}
                            style={{
                              padding: "12px 16px",
                              borderRadius: "10px",
                              border: isSelected ? "2px solid #6366f1" : "1px solid #e1e3e5",
                              background: isSelected ? "#f0f0ff" : "#fff",
                              cursor: "pointer",
                              transition: "all 0.15s",
                            }}
                          >
                            <InlineStack align="space-between" blockAlign="center">
                              <InlineStack gap="300" blockAlign="center">
                                <Checkbox
                                  label=""
                                  labelHidden
                                  checked={isSelected}
                                  onChange={() => toggleProduct(variant.id)}
                                />
                                <BlockStack gap="100">
                                  <Text as="p" variant="bodyMd" fontWeight={isSelected ? "bold" : "regular"}>
                                    {product.title}
                                    {variant.title !== "Default Title" ? ` — ${variant.title}` : ""}
                                  </Text>
                                  <InlineStack gap="200">
                                    {variant.sku && (
                                      <Text as="p" variant="bodySm" tone="subdued">SKU: {variant.sku}</Text>
                                    )}
                                    <Text as="p" variant="bodySm" tone="subdued">${variant.price.toFixed(2)}</Text>
                                    <Badge tone="info">{product.type}</Badge>
                                  </InlineStack>
                                </BlockStack>
                              </InlineStack>
                              {isSelected && (
                                <div style={{ color: "#6366f1", fontSize: "18px" }}>✓</div>
                              )}
                            </InlineStack>
                          </div>
                        );
                      })
                    )
                  )}
                </BlockStack>
              </div>

              <Divider />
              <InlineStack align="end">
                <Button
                  variant="primary"
                  icon={ChevronRightIcon}
                  disabled={selectedProducts.length < 2}
                  onClick={() => setStep(2)}
                >
                  Next: Name Your Bundle
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* ─── STEP 2: NAME & OPTIONS ─── */}
        {step === 2 && (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg" fontWeight="bold">Name your bundle rule</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Give this bundle a clear name your team will recognize.
                </Text>
              </BlockStack>
              <Divider />

              <TextField
                label="Bundle Rule Name"
                value={ruleName}
                onChange={setRuleName}
                placeholder="e.g., Summer Essentials Pack, T-Shirt + Shorts Combo"
                autoComplete="off"
                helpText="This name appears in your dashboard and order notes"
              />

              <Checkbox
                label="Auto-create bundle product in Shopify"
                checked={autoCreate}
                onChange={setAutoCreate}
                helpText="Creates a new product with the bundle SKU automatically. Recommended for Order Edit mode."
              />

              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Selected products ({selectedProducts.length}):</Text>
                  {selectedProducts.map((vid) => {
                    let label = vid;
                    for (const p of products) {
                      const v = p.variants.find((v: any) => v.id === vid);
                      if (v) {
                        label = `${p.title}${v.title !== "Default Title" ? ` — ${v.title}` : ""} ($${v.price.toFixed(2)})`;
                        break;
                      }
                    }
                    return (
                      <InlineStack key={vid} gap="200" blockAlign="center">
                        <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                          <Icon source={CheckCircleIcon} tone="success" />
                        </Box>
                        <Text as="p" variant="bodySm">{label}</Text>
                      </InlineStack>
                    );
                  })}
                </BlockStack>
              </Box>

              <Divider />
              <InlineStack align="space-between">
                <Button onClick={() => setStep(1)}>← Back</Button>
                <Button
                  variant="primary"
                  icon={ChevronRightIcon}
                  disabled={!ruleName.trim()}
                  onClick={() => setStep(3)}
                >
                  Next: Shipping Costs
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* ─── STEP 3: SHIPPING & MODE ─── */}
        {step === 3 && (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg" fontWeight="bold">Configure shipping &amp; fulfillment</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Set your shipping costs and how orders should be processed.
                </Text>
              </BlockStack>
              <Divider />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <TextField
                  label="Cost to ship each item individually ($)"
                  type="number"
                  value={individualCost}
                  onChange={setIndividualCost}
                  autoComplete="off"
                  helpText="How much it costs to ship one item alone"
                />
                <TextField
                  label="Cost to ship as a bundle ($)"
                  type="number"
                  value={bundleCost}
                  onChange={setBundleCost}
                  autoComplete="off"
                  helpText="How much it costs to ship the pre-packed bundle"
                />
              </div>

              {/* Savings preview */}
              <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    Estimated savings per matched order
                  </Text>
                  <Text as="p" variant="headingXl" fontWeight="bold" tone={estimatedSavings > 0 ? "success" : "caution"}>
                    ${estimatedSavings.toFixed(2)}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    ({selectedProducts.length} items × ${individualCost}) − ${bundleCost} = ${estimatedSavings.toFixed(2)}
                  </Text>
                </BlockStack>
              </Box>

              <Select
                label="Fulfillment Mode"
                options={[
                  { label: "🏷️ Tag & Note — adds tags/notes only (safe, recommended for manual)", value: "tag_only" },
                  { label: "✏️ Order Edit — replaces line items with bundle SKU (automated)", value: "order_edit" },
                ]}
                value={fulfillmentMode}
                onChange={setFulfillmentMode}
                helpText={
                  fulfillmentMode === "order_edit"
                    ? "Order Edit modifies line items. Best for ShipStation, ShipBob, FBA."
                    : "Tag & Note is the safest choice. Your team reads order tags to fulfill bundles."
                }
              />

              <Divider />
              <InlineStack align="space-between">
                <Button onClick={() => setStep(2)}>← Back</Button>
                <Button variant="primary" icon={ChevronRightIcon} onClick={() => setStep(4)}>
                  Next: Review
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* ─── STEP 4: REVIEW & CREATE ─── */}
        {step === 4 && (
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg" fontWeight="bold">Review &amp; Create</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Everything looks good? Hit "Create Bundle Rule" to go live.
                </Text>
              </BlockStack>
              <Divider />

              {/* Summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">Rule Name</Text>
                    <Text as="p" variant="headingSm" fontWeight="bold">{ruleName}</Text>
                  </BlockStack>
                </Box>
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">Products</Text>
                    <Text as="p" variant="headingSm" fontWeight="bold">{selectedProducts.length} items</Text>
                  </BlockStack>
                </Box>
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">Savings / Order</Text>
                    <Text as="p" variant="headingSm" fontWeight="bold" tone="success">${estimatedSavings.toFixed(2)}</Text>
                  </BlockStack>
                </Box>
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">Mode</Text>
                    <Text as="p" variant="headingSm" fontWeight="bold">
                      {fulfillmentMode === "order_edit" ? "Order Edit" : "Tag & Note"}
                    </Text>
                  </BlockStack>
                </Box>
              </div>

              {/* Products list */}
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Bundle contains:</Text>
                  {selectedProducts.map((vid) => {
                    let label = vid;
                    for (const p of products) {
                      const v = p.variants.find((v: any) => v.id === vid);
                      if (v) {
                        label = `${p.title}${v.title !== "Default Title" ? ` — ${v.title}` : ""}`;
                        break;
                      }
                    }
                    return (
                      <InlineStack key={vid} gap="200" blockAlign="center">
                        <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                          <Icon source={CheckCircleIcon} tone="success" />
                        </Box>
                        <Text as="p" variant="bodySm">{label}</Text>
                      </InlineStack>
                    );
                  })}
                </BlockStack>
              </Box>

              {autoCreate && (
                <Banner tone="info">
                  <p>A new bundle product will be created in your Shopify store with SKU <strong>BUNDLE-[id]</strong></p>
                </Banner>
              )}

              <Banner tone="success">
                <p>If your store gets 100 qualifying orders/month, you'd save ~<strong>${(estimatedSavings * 100).toFixed(0)}/month</strong></p>
              </Banner>

              <Divider />
              <InlineStack align="space-between">
                <Button onClick={() => setStep(3)}>← Back</Button>
                <Button
                  variant="primary"
                  loading={isSubmitting}
                  onClick={handleSubmit}
                >
                  🚀 Create Bundle Rule &amp; Go Live
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
