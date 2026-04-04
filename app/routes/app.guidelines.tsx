import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Box,
  Divider,
  Icon,
  Collapsible,
  Banner,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DeliveryIcon,
  SettingsIcon,
  OrderIcon,
  InventoryIcon,
  CashDollarIcon,
  SearchIcon,
  NotificationIcon,
  ChartVerticalFilledIcon,
  ArrowRightIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { useNavigate } from "@remix-run/react";
import { useState, useCallback, useEffect, useRef } from "react";

/*──────────────────────────────────────────────────
  SECTION NAV DATA
──────────────────────────────────────────────────*/
const SECTIONS = [
  { id: "how-it-works", label: "How It Works", emoji: "⚙️" },
  { id: "quick-start", label: "Quick Start", emoji: "⚡" },
  { id: "providers", label: "Providers", emoji: "📦" },
  { id: "modes", label: "Tag vs Edit", emoji: "🔀" },
  { id: "notifications", label: "Notifications", emoji: "🔔" },
  { id: "analysis", label: "AI Analysis", emoji: "🧠" },
  { id: "faq", label: "FAQ", emoji: "❓" },
  { id: "help", label: "Need Help", emoji: "🆘" },
];

/*──────────────────────────────────────────────────
  STICKY SCROLL NAVIGATION
──────────────────────────────────────────────────*/
function SectionNav({ activeId }: { activeId: string }) {
  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "linear-gradient(135deg, #f8f9fc 0%, #f0f2f8 100%)",
        borderRadius: "14px",
        padding: "12px 16px",
        border: "1px solid #e1e3e5",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        marginBottom: "4px",
      }}
    >
      <div style={{ marginBottom: "8px" }}>
        <Text as="p" variant="bodySm" fontWeight="bold" tone="subdued">
          📑 Jump to Section
        </Text>
      </div>
      <div
        style={{
          display: "flex",
          gap: "6px",
          flexWrap: "wrap",
        }}
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "6px 12px",
              borderRadius: "20px",
              border: activeId === s.id ? "2px solid #6366f1" : "1px solid #d4d9e6",
              background: activeId === s.id
                ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                : "#fff",
              color: activeId === s.id ? "#fff" : "#374151",
              fontSize: "12px",
              fontWeight: activeId === s.id ? 700 : 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap",
              boxShadow: activeId === s.id
                ? "0 2px 6px rgba(99,102,241,0.3)"
                : "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            <span style={{ fontSize: "13px" }}>{s.emoji}</span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/*──────────────────────────────────────────────────
  VISUAL FLOW DIAGRAM (CSS-based, no images needed)
──────────────────────────────────────────────────*/
function FlowDiagram({ steps }: { steps: { emoji: string; label: string; sub: string }[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "0", flexWrap: "wrap", justifyContent: "center" }}>
      {steps.map((step, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              background: "linear-gradient(135deg, #f0f4ff 0%, #e8ecf8 100%)",
              borderRadius: "14px",
              padding: "16px 20px",
              minWidth: "130px",
              textAlign: "center",
              border: "1px solid #d4d9e6",
              boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontSize: "28px", marginBottom: "6px" }}>{step.emoji}</div>
            <Text as="p" variant="bodySm" fontWeight="bold">{step.label}</Text>
            <Text as="p" variant="bodySm" tone="subdued">{step.sub}</Text>
          </div>
          {i < steps.length - 1 && (
            <div style={{ padding: "0 6px", fontSize: "20px", color: "#8c9cb8", flexShrink: 0 }}>→</div>
          )}
        </div>
      ))}
    </div>
  );
}

/*──────────────────────────────────────────────────
  COMPARISON TABLE
──────────────────────────────────────────────────*/
function ComparisonTable({ rows }: { rows: { feature: string; tagOnly: string; orderEdit: string }[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ background: "#f6f6f7" }}>
            <th style={{ padding: "10px 14px", textAlign: "left", borderBottom: "2px solid #e1e3e5" }}>Feature</th>
            <th style={{ padding: "10px 14px", textAlign: "center", borderBottom: "2px solid #e1e3e5" }}>🏷️ Tag &amp; Note</th>
            <th style={{ padding: "10px 14px", textAlign: "center", borderBottom: "2px solid #e1e3e5" }}>✏️ Order Edit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #e1e3e5" }}>
              <td style={{ padding: "10px 14px" }}>{row.feature}</td>
              <td style={{ padding: "10px 14px", textAlign: "center" }}>{row.tagOnly}</td>
              <td style={{ padding: "10px 14px", textAlign: "center" }}>{row.orderEdit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/*──────────────────────────────────────────────────
  PROVIDER GUIDE CARD
──────────────────────────────────────────────────*/
function ProviderGuide({
  icon,
  name,
  color,
  recommended,
  steps,
  tips,
  initialOpen = false,
}: {
  icon: string;
  name: string;
  color: string;
  recommended?: string;
  steps: string[];
  tips: string[];
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  return (
    <Box padding="400" background="bg-surface-secondary" borderRadius="300">
      <BlockStack gap="300">
        <div onClick={toggle} style={{ cursor: "pointer" }}>
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="300" blockAlign="center">
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  background: color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "22px",
                  flexShrink: 0,
                }}
              >
                {icon}
              </div>
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h3" variant="headingSm" fontWeight="bold">{name}</Text>
                  {recommended && <Badge tone="info">{recommended}</Badge>}
                </InlineStack>
              </BlockStack>
            </InlineStack>
            <Icon source={open ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
          </InlineStack>
        </div>

        <Collapsible open={open} id={`provider-${name}`}>
          <BlockStack gap="300">
            <Divider />
            {/* Steps */}
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" fontWeight="semibold">Setup Steps</Text>
              {steps.map((step, i) => (
                <InlineStack key={i} gap="200" blockAlign="start">
                  <div
                    style={{
                      minWidth: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background: color,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: "bold",
                      flexShrink: 0,
                      marginTop: "1px",
                    }}
                  >
                    {i + 1}
                  </div>
                  <Text as="p" variant="bodySm">{step}</Text>
                </InlineStack>
              ))}
            </BlockStack>

            {/* Tips */}
            <Box padding="300" background="bg-surface" borderRadius="200">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold">💡 Pro Tips</Text>
                {tips.map((tip, i) => (
                  <InlineStack key={i} gap="200" blockAlign="start">
                    <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                      <Icon source={CheckCircleIcon} tone="success" />
                    </Box>
                    <Text as="p" variant="bodySm">{tip}</Text>
                  </InlineStack>
                ))}
              </BlockStack>
            </Box>
          </BlockStack>
        </Collapsible>
      </BlockStack>
    </Box>
  );
}

/*──────────────────────────────────────────────────
  MAIN PAGE COMPONENT
──────────────────────────────────────────────────*/
export default function Guidelines() {
  const navigate = useNavigate();
  const [quickStartOpen, setQuickStartOpen] = useState(true);
  const [activeSection, setActiveSection] = useState("how-it-works");

  useEffect(() => {
    const handleScroll = () => {
      const offset = 120;
      let current = "how-it-works";
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= offset) {
            current = s.id;
          }
        }
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <Page
      title="Easy Tutorial Guide"
      subtitle="Jump to any section — step-by-step guides to set up and master Reverse Bundle Pro"
    >
      <TitleBar title="Easy Tutorial Guide" />

      <BlockStack gap="500">

        <SectionNav activeId={activeSection} />

        {/* ─── HOW IT WORKS ────────────────────────── */}
        <div id="how-it-works" style={{ scrollMarginTop: "100px" }} />
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingLg" fontWeight="bold">How Reverse Bundling Works</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                The complete order-to-savings flow in 5 simple steps
              </Text>
            </BlockStack>
            <Divider />

            <FlowDiagram
              steps={[
                { emoji: "🛒", label: "Customer Orders", sub: "Individual items" },
                { emoji: "📡", label: "Webhook Fires", sub: "Real-time event" },
                { emoji: "🔍", label: "Rule Matched", sub: "SKU / Variant check" },
                { emoji: "📦", label: "Bundle Applied", sub: "Tag or Edit order" },
                { emoji: "💰", label: "Savings Tracked", sub: "Dashboard updated" },
              ]}
            />

            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold">How savings are calculated</Text>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #e1e3e5",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    fontFamily: "monospace",
                    fontSize: "13px",
                  }}
                >
                  Savings = (Number of Items × Individual Ship Cost) − Bundle Ship Cost<br />
                  <span style={{ color: "#6b7280" }}>Example: (3 × $7.00) − $9.00 = <strong style={{ color: "#16a34a" }}>$12.00 saved</strong> per order</span>
                </div>
              </BlockStack>
            </Box>
          </BlockStack>
        </Card>

        {/* ─── QUICK START (3 STEPS) ──────────────── */}
        <div id="quick-start" style={{ scrollMarginTop: "100px" }} />
        <Card>
          <BlockStack gap="400">
            <div onClick={() => setQuickStartOpen(!quickStartOpen)} style={{ cursor: "pointer" }}>
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingLg" fontWeight="bold">⚡ Quick Start Guide</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Get up and running in 3 steps</Text>
                </BlockStack>
                <Icon source={quickStartOpen ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
              </InlineStack>
            </div>

            <Collapsible open={quickStartOpen} id="quick-start">
              <BlockStack gap="400">
                <Divider />

                {/* Step 1 */}
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <InlineStack gap="300" blockAlign="start">
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "16px",
                        fontWeight: "bold",
                        flexShrink: 0,
                      }}
                    >
                      1
                    </div>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm" fontWeight="bold">Create a Bundle Rule</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Go to <strong>Bundle Rules</strong> → Click <strong>"Create New Rule"</strong> → Select the individual products that ship together as a pre-packed bundle. Enable <strong>"Auto-create product"</strong> to automatically generate the bundle SKU in Shopify.
                      </Text>
                      <FlowDiagram
                        steps={[
                          { emoji: "👕", label: "Product A", sub: "Individual SKU" },
                          { emoji: "👖", label: "Product B", sub: "Individual SKU" },
                          { emoji: "📦", label: "Bundle SKU", sub: "Pre-packed" },
                        ]}
                      />
                      <Button variant="plain" onClick={() => navigate("/app/bundle-rules")}>Go to Bundle Rules →</Button>
                    </BlockStack>
                  </InlineStack>
                </Box>

                {/* Step 2 */}
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <InlineStack gap="300" blockAlign="start">
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "16px",
                        fontWeight: "bold",
                        flexShrink: 0,
                      }}
                    >
                      2
                    </div>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm" fontWeight="bold">Choose Fulfillment Mode</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Go to <strong>Settings</strong> → Under <strong>"Fulfillment Mode"</strong> choose between Tag &amp; Note or Order Edit based on your workflow.
                      </Text>
                      <ComparisonTable
                        rows={[
                          { feature: "Modifies line items?", tagOnly: "❌ No", orderEdit: "✅ Yes" },
                          { feature: "Automation level", tagOnly: "Semi-auto", orderEdit: "Fully auto" },
                          { feature: "ShipStation picks up bundle?", tagOnly: "Via tags/notes", orderEdit: "Automatically" },
                          { feature: "Customer sees changes?", tagOnly: "❌ No", orderEdit: "✅ Yes" },
                          { feature: "Risk level", tagOnly: "🟢 Low", orderEdit: "🟡 Medium" },
                          { feature: "Best for", tagOnly: "Manual warehouse", orderEdit: "Automated 3PL" },
                        ]}
                      />
                      <Button variant="plain" onClick={() => navigate("/app/settings")}>Go to Settings →</Button>
                    </BlockStack>
                  </InlineStack>
                </Box>

                {/* Step 3 */}
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <InlineStack gap="300" blockAlign="start">
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "16px",
                        fontWeight: "bold",
                        flexShrink: 0,
                      }}
                    >
                      3
                    </div>
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm" fontWeight="bold">Monitor &amp; Optimize</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Check your <strong>Dashboard</strong> for real-time savings, review <strong>Order Conversions</strong> for matched orders, and run <strong>Bundle Analysis</strong> to discover new bundling opportunities from your order history.
                      </Text>
                      <FlowDiagram
                        steps={[
                          { emoji: "📊", label: "Dashboard", sub: "Live metrics" },
                          { emoji: "📋", label: "Conversions", sub: "Matched orders" },
                          { emoji: "🧠", label: "Analysis", sub: "AI suggestions" },
                        ]}
                      />
                      <Button variant="plain" onClick={() => navigate("/app")}>Go to Dashboard →</Button>
                    </BlockStack>
                  </InlineStack>
                </Box>
              </BlockStack>
            </Collapsible>
          </BlockStack>
        </Card>

        {/* ─── FULFILLMENT PROVIDER GUIDES ─────────── */}
        <div id="providers" style={{ scrollMarginTop: "100px" }} />
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingLg" fontWeight="bold">📦 Fulfillment Provider Guides</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Tap any provider below to see the step-by-step setup for your specific workflow
              </Text>
            </BlockStack>
            <Divider />

            {/* ShipStation */}
            <ProviderGuide
              icon="🚢"
              name="ShipStation"
              color="#2563eb"
              recommended="Most Popular"
              initialOpen={true}
              steps={[
                'Install ShipStation from the Shopify App Store and connect your store.',
                'In Reverse Bundle Pro → Settings, set Fulfillment Mode to "Order Edit" for full automation.',
                'Create your bundle rules in Bundle Rules → use "Auto-create product" so the bundle SKU exists in Shopify.',
                'ShipStation auto-syncs orders from Shopify. With Order Edit mode, it sees the bundle SKU directly.',
                'Your warehouse picks the pre-packed bundle instead of individual items — no manual lookup needed.',
                'Monitor savings on the Dashboard and Order Conversions pages.',
              ]}
              tips={[
                'Use "Order Edit" mode so ShipStation automatically picks up the bundle SKU — zero manual work.',
                'Map your bundle SKU to a specific bin location in ShipStation for faster warehouse picking.',
                'Enable Slack notifications to get real-time alerts when bundles are matched.',
                'Set correct shipping costs in Settings for accurate savings tracking.',
              ]}
            />

            {/* ShipBob */}
            <ProviderGuide
              icon="📮"
              name="ShipBob"
              color="#7c3aed"
              steps={[
                'Install ShipBob from the Shopify App Store and connect your fulfillment centers.',
                'Create your bundle products in ShipBob\'s inventory as "bundles" (ShipBob has native bundle support).',
                'In Reverse Bundle Pro → Settings, set Fulfillment Mode to "Order Edit" for seamless sync.',
                'Create matching bundle rules in the app with the same SKU as your ShipBob bundle.',
                'When orders match, the line items are replaced with the bundle SKU. ShipBob picks the pre-packed unit.',
                'Track everything on Dashboard → Order Conversions → Analytics.',
              ]}
              tips={[
                'ShipBob\'s native bundle feature works perfectly with Order Edit mode.',
                'Create the bundle product in ShipBob first, then use the same SKU in Reverse Bundle Pro.',
                'Multi-warehouse? ShipBob routes to the closest fulfillment center automatically.',
              ]}
            />

            {/* Amazon FBA */}
            <ProviderGuide
              icon="📦"
              name="Amazon FBA (MCF)"
              color="#ea4335"
              steps={[
                'Set up Multi-Channel Fulfillment (MCF) in your Amazon Seller Central account.',
                'Create your bundle as an FBA listing with a unique FNSKU / SKU.',
                'Ship pre-packed bundles to Amazon\'s fulfillment centers.',
                'In Reverse Bundle Pro, use "Order Edit" mode and create rules with the FBA bundle SKU.',
                'Install a Shopify-FBA bridge app (e.g., ByteStand FBA) to sync edited orders to Amazon.',
                'Amazon ships the pre-packed bundle. Savings tracked automatically in the app.',
              ]}
              tips={[
                'Use MCF (Multi-Channel Fulfillment) — not standard FBA — for Shopify orders.',
                'Pre-pack bundles with a unique FNSKU before shipping to Amazon warehouse.',
                'Tag & Note mode also works if your FBA bridge supports reading order tags.',
              ]}
            />

            {/* Manual / In-House */}
            <ProviderGuide
              icon="🏠"
              name="Manual / In-House Fulfillment"
              color="#059669"
              recommended="Easiest Setup"
              steps={[
                'No external integration needed — works with Shopify\'s built-in fulfillment.',
                'In Settings, use "Tag & Note" mode (default). Your team reads order notes to identify bundles.',
                'Create bundle rules for products you already have pre-packed in your warehouse.',
                'When an order matches, it gets tagged "reverse-bundled" with a note: "Fulfill with SKU X instead of individual items".',
                'Your packing team sees the tag/note and picks the pre-packed bundle from the shelf.',
                'Mark orders as fulfilled in Shopify Admin as usual.',
              ]}
              tips={[
                'Tag & Note mode is safest — it never modifies the customer-facing order.',
                'Filter orders by the "reverse-bundled" tag in Shopify Admin for quick identification.',
                'Print packing slips — the order note will show the bundle fulfillment instruction.',
                'Works perfectly even without any third-party fulfillment app.',
              ]}
            />

            {/* 3PL / Warehouse */}
            <ProviderGuide
              icon="🏭"
              name="Third-Party Logistics (3PL)"
              color="#d97706"
              steps={[
                'Connect your 3PL provider to Shopify (most 3PLs have a Shopify app).',
                'Ensure your 3PL has the pre-packed bundle SKU in their inventory.',
                'In Reverse Bundle Pro → Settings, choose the fulfillment mode your 3PL supports.',
                'If your 3PL reads line items directly → use "Order Edit" mode.',
                'If your 3PL reads tags/notes → use "Tag & Note" mode.',
                'Create bundle rules and activate them. Orders matching rules will be processed for your 3PL.',
              ]}
              tips={[
                'Ask your 3PL which method they prefer: modified line items or tag-based instructions.',
                'Most modern 3PLs support reading order tags — Tag & Note mode is usually sufficient.',
                'Test with one order first before activating rules for your full catalog.',
              ]}
            />

            {/* Custom / EDI */}
            <ProviderGuide
              icon="⚙️"
              name="Custom / EDI Integration"
              color="#7c2d12"
              steps={[
                'Set up your custom fulfillment integration via Shopify\'s Fulfillment API.',
                'Configure your EDI system to read Shopify order metafields (namespace: "reverse_bundle").',
                'In Reverse Bundle Pro → Settings, either mode works depending on your EDI capabilities.',
                'The app stores bundle instructions in order metafields with full details (bundled SKU, original items, savings).',
                'Your EDI system reads the metafield and processes the bundle accordingly.',
                'Enable Slack webhook for real-time order notifications to your operations team.',
              ]}
              tips={[
                'Metafields (namespace: "reverse_bundle", key: "fulfillment_instruction") contain structured JSON data.',
                'Use the Shopify REST or GraphQL API to read metafields in your custom integration.',
                'The metafield includes: bundledSku, originalItems, savings, instruction text, and timestamp.',
              ]}
            />
          </BlockStack>
        </Card>

        {/* ─── FULFILLMENT MODE EXPLAINED ──────────── */}
        <div id="modes" style={{ scrollMarginTop: "100px" }} />
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingLg" fontWeight="bold">🔀 Tag &amp; Note vs Order Edit Mode</Text>
              <Text as="p" variant="bodySm" tone="subdued">Understand which mode is right for your fulfillment workflow</Text>
            </BlockStack>
            <Divider />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              {/* Tag & Note */}
              <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <div style={{ fontSize: "24px" }}>🏷️</div>
                    <Text as="h3" variant="headingSm" fontWeight="bold">Tag &amp; Note Mode</Text>
                    <Badge tone="success">Safe</Badge>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Adds tags and fulfillment notes to the order without changing line items. The customer's order stays exactly as placed.
                  </Text>
                  <Divider />
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="center">
                      <Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box>
                      <Text as="p" variant="bodySm">No line item changes</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box>
                      <Text as="p" variant="bodySm">Tags: reverse-bundled, bundle:SKU</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box>
                      <Text as="p" variant="bodySm">Note with fulfillment instruction</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box>
                      <Text as="p" variant="bodySm">Metafield stored for automation</Text>
                    </InlineStack>
                  </BlockStack>
                  <Banner tone="success"><p>Best for: Manual fulfillment, in-house warehouse, 3PLs that read tags</p></Banner>
                </BlockStack>
              </Box>

              {/* Order Edit */}
              <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <div style={{ fontSize: "24px" }}>✏️</div>
                    <Text as="h3" variant="headingSm" fontWeight="bold">Order Edit Mode</Text>
                    <Badge tone="info">Automated</Badge>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Replaces individual line items with the bundle product SKU. Your fulfillment provider sees only the bundle — fully automated.
                  </Text>
                  <Divider />
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="center">
                      <Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="info" /></Box>
                      <Text as="p" variant="bodySm">Line items replaced with bundle</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="info" /></Box>
                      <Text as="p" variant="bodySm">ShipStation / 3PL auto-picks bundle</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="info" /></Box>
                      <Text as="p" variant="bodySm">Zero manual intervention needed</Text>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="info" /></Box>
                      <Text as="p" variant="bodySm">Falls back to tag mode if SKU missing</Text>
                    </InlineStack>
                  </BlockStack>
                  <Banner tone="info"><p>Best for: ShipStation, ShipBob, FBA, automated 3PL systems</p></Banner>
                </BlockStack>
              </Box>
            </div>

            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
              <InlineStack gap="300" blockAlign="center" align="center">
                <Text as="p" variant="bodySm" tone="subdued">Not sure which to pick?</Text>
                <Button variant="plain" onClick={() => navigate("/app/settings")}>Configure in Settings →</Button>
              </InlineStack>
            </Box>
          </BlockStack>
        </Card>

        {/* ─── NOTIFICATIONS SETUP ─────────────────── */}
        <div id="notifications" style={{ scrollMarginTop: "100px" }} />
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingLg" fontWeight="bold">🔔 Notifications Setup</Text>
              <Text as="p" variant="bodySm" tone="subdued">Stay informed when bundles are matched</Text>
            </BlockStack>
            <Divider />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              {/* Email */}
              <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <div
                      style={{
                        width: "36px", height: "36px", borderRadius: "10px", background: "#2563eb",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px",
                      }}
                    >
                      📧
                    </div>
                    <Text as="h3" variant="headingSm" fontWeight="bold">Email Notifications</Text>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Receive an email summary for each matched bundle order with order number, rule name, and savings amount.
                  </Text>
                  <Text as="p" variant="bodySm"><strong>Enable:</strong> Settings → Notifications → Email Notifications ✓</Text>
                </BlockStack>
              </Box>

              {/* Slack */}
              <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <div
                      style={{
                        width: "36px", height: "36px", borderRadius: "10px", background: "#4a154b",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px",
                      }}
                    >
                      💬
                    </div>
                    <Text as="h3" variant="headingSm" fontWeight="bold">Slack Notifications</Text>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Get instant Slack messages in your team channel when orders are matched. Perfect for warehouse teams.
                  </Text>
                  <Text as="p" variant="bodySm"><strong>Enable:</strong> Settings → Slack → Paste your Webhook URL → Test</Text>
                </BlockStack>
              </Box>
            </div>
          </BlockStack>
        </Card>

        {/* ─── BUNDLE ANALYSIS (AI) ───────────────── */}
        <div id="analysis" style={{ scrollMarginTop: "100px" }} />
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingLg" fontWeight="bold">🧠 Bundle Analysis &amp; AI Suggestions</Text>
              <Text as="p" variant="bodySm" tone="subdued">Let the app discover bundling opportunities from your order history</Text>
            </BlockStack>
            <Divider />

            <FlowDiagram
              steps={[
                { emoji: "📥", label: "Scan Orders", sub: "30–180 days" },
                { emoji: "🔗", label: "Find Co-occurrences", sub: "Items bought together" },
                { emoji: "📊", label: "Rank by Confidence", sub: "Frequency scoring" },
                { emoji: "✅", label: "Create Rules", sub: "One-click apply" },
              ]}
            />

            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" fontWeight="semibold">How to use:</Text>
                <InlineStack gap="200" blockAlign="center">
                  <Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box>
                  <Text as="p" variant="bodySm">Go to <strong>Bundle Analysis</strong> → Set time range → Click <strong>"Run Analysis"</strong></Text>
                </InlineStack>
                <InlineStack gap="200" blockAlign="center">
                  <Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box>
                  <Text as="p" variant="bodySm">Review suggestions with confidence scores and estimated savings</Text>
                </InlineStack>
                <InlineStack gap="200" blockAlign="center">
                  <Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box>
                  <Text as="p" variant="bodySm">Click <strong>"Create Rule"</strong> to instantly turn a suggestion into an active bundle rule</Text>
                </InlineStack>
              </BlockStack>
            </Box>

            <InlineStack align="end">
              <Button variant="plain" onClick={() => navigate("/app/bundle-rules")}>Open Bundle Rules →</Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* ─── FAQ ────────────────────────────────── */}
        <div id="faq" style={{ scrollMarginTop: "100px" }} />
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingLg" fontWeight="bold">❓ Frequently Asked Questions</Text>
              <Text as="p" variant="bodySm" tone="subdued">Quick answers to common questions</Text>
            </BlockStack>
            <Divider />

            {[
              {
                q: "What happens if the bundle product doesn't exist in Shopify?",
                a: 'In Order Edit mode, the app automatically falls back to Tag & Note mode so your order is still processed safely. Use "Auto-create product" when creating rules to avoid this.',
              },
              {
                q: "Can one order match multiple bundle rules?",
                a: "Currently, the app processes the first matching rule for each order. This prevents conflicts and ensures predictable behavior.",
              },
              {
                q: "Does the customer see any change to their order?",
                a: "In Tag & Note mode: No — the order looks identical to the customer. In Order Edit mode: Yes — the line items are replaced with the bundle product.",
              },
              {
                q: "What if I hit my plan's order limit?",
                a: "Orders beyond your plan limit are silently skipped (no errors). Upgrade your plan in Billing to increase the monthly limit.",
              },
              {
                q: "Can I undo a bundle conversion?",
                a: "Tag & Note mode only adds metadata and can be cleared manually. Order Edit mode changes are permanent — test with a few orders first.",
              },
              {
                q: "How does the savings calculation work?",
                a: "Savings = (items in bundle × your per-item shipping cost) minus the bundle shipping cost. Configure these in Settings → Shipping Costs.",
              },
            ].map((faq, i) => (
              <Box key={i} padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" fontWeight="bold">{faq.q}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{faq.a}</Text>
                </BlockStack>
              </Box>
            ))}
          </BlockStack>
        </Card>

        {/* ─── NEED HELP CTA ──────────────────────── */}
        <div id="help" style={{ scrollMarginTop: "100px" }} />
        <Card>
          <Box padding="400">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd" fontWeight="bold">Need more help?</Text>
                <Text as="p" variant="bodySm" tone="subdued">Our support team is ready to assist with your specific setup</Text>
              </BlockStack>
              <InlineStack gap="200">
                <Button url="/contact-us" target="_blank">Contact Support</Button>
                <Button url="/documentation" target="_blank" variant="plain">Full Documentation</Button>
              </InlineStack>
            </InlineStack>
          </Box>
        </Card>

      </BlockStack>
    </Page>
  );
}
