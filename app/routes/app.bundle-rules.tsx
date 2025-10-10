import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
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
  Modal,
  FormLayout,
  TextField,
  Badge,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { useState, useCallback, useEffect } from "react";

// Simple in-memory storage for demo purposes
// In a real app, this would be in your database
let bundleRulesStorage: Array<{
  id: string;
  name: string;
  items: string[];
  bundledSku: string;
  status: string;
  createdAt: string;
}> = [];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Fetch real products from Shopify
  let products: Array<{label: string, value: string}> = [];
  let productMap: {[key: string]: string} = {};
  try {
    const response = await admin.graphql(`#graphql
      query getProducts {
        products(first: 100) {
          edges {
            node {
              id
              title
              status
              variants(first: 10) {
                edges {
                  node {
                    id
                    sku
                    title
                    price
                  }
                }
              }
            }
          }
        }
      }
    `);
    const responseJson = await response.json();
    products = responseJson.data.products.edges.flatMap((edge: any) => {
      const product = edge.node;
      return product.variants.edges.map((variant: any) => {
        // Use variant ID as value if SKU is empty
        const value = variant.node.sku || variant.node.id;
        const label = `${product.title}${variant.node.sku ? ` [${variant.node.sku}]` : ' [No SKU]'}`;
        // Create a mapping from value to readable label
        productMap[value] = label;
        productMap[variant.node.id] = label; // Also map the ID
        return {
          label,
          value
        };
      });
    }).filter((product: any) => product.label && product.value); // Filter out empty products
  } catch (e) {
    // fallback to empty
    products = [];
  }

  // Return current bundle rules from storage
  return json({ bundleRules: bundleRulesStorage, products, productMap });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "createRule") {
    const name = formData.get("name") as string;
    const items = formData.get("items") as string;
    const bundledSku = formData.get("bundledSku") as string;
    
    // Create new rule and add to storage
    const newRule = {
      id: String(Date.now()), // Simple ID generation
      name,
      items: items.split(",").filter(item => item.trim()),
      bundledSku,
      status: "active" as const,
      frequency: 0,
      savings: 0,
      createdAt: new Date().toISOString().split('T')[0],
    };
    
    bundleRulesStorage.push(newRule);
    
    return json({ 
      success: true, 
      message: `Bundle rule "${name}" created successfully!`,
      reload: true
    });
  }

  if (action === "toggleStatus") {
    const ruleId = formData.get("ruleId") as string;
    const rule = bundleRulesStorage.find(r => r.id === ruleId);
    if (rule) {
      rule.status = rule.status === "active" ? "draft" : "active";
    }
    return json({ 
      success: true, 
      message: "Bundle rule status updated!",
      reload: true
    });
  }

  if (action === "deleteRule") {
    const ruleId = formData.get("ruleId") as string;
    bundleRulesStorage = bundleRulesStorage.filter(r => r.id !== ruleId);
    return json({ 
      success: true, 
      message: "Bundle rule deleted successfully!",
      reload: true
    });
  }

  return json({ success: false, message: "Unknown action" });
};


export default function BundleRules() {
  const { bundleRules, products, productMap } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    items: [] as string[],
    bundledSku: "",
  });

  const isLoading = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message);
      if (fetcher.data.message.includes("created")) {
        setIsModalOpen(false);
        setFormData({ name: "", items: [], bundledSku: "" });
        // Refresh the data to show the new rule
        revalidator.revalidate();
      }
    }
  }, [fetcher.data, shopify, revalidator]);  const handleOpenModal = useCallback(() => setIsModalOpen(true), []);
  const handleCloseModal = useCallback(() => setIsModalOpen(false), []);

  const handleSubmit = useCallback(() => {
    fetcher.submit(
      { 
        action: "createRule",
        name: formData.name,
        items: formData.items.join(","),
        bundledSku: formData.bundledSku,
      },
      { method: "POST" }
    );
  }, [fetcher, formData]);

  const toggleRuleStatus = useCallback((ruleId: string) => {
    fetcher.submit({ action: "toggleStatus", ruleId }, { method: "POST" });
  }, [fetcher]);

  const deleteRule = useCallback((ruleId: string) => {
    if (confirm("Are you sure you want to delete this rule?")) {
      fetcher.submit({ action: "deleteRule", ruleId }, { method: "POST" });
    }
  }, [fetcher]);

  // Convert bundle rules for DataTable
  const tableData = bundleRules.map((rule: any) => {
    const displayItems = rule.items.map((item: string) => {
      // Clean up the item display
      const cleanItem = productMap[item] || item.replace(/gid:\/\/shopify\/ProductVariant\/\d+/, 'Unknown Product');
      return cleanItem;
    }).join(" + ");

    return [
      rule.name,
      displayItems,
      rule.bundledSku,
      <Badge key={rule.id} tone={rule.status === "active" ? "success" : "attention"}>
        {rule.status}
      </Badge>,
      `${rule.frequency}/month`,
      `$${rule.savings}`,
      <InlineStack key={rule.id} gap="200">
        <Button
          size="micro"
          onClick={() => toggleRuleStatus(rule.id)}
          variant={rule.status === "active" ? "secondary" : "primary"}
        >
          {rule.status === "active" ? "Pause" : "Activate"}
        </Button>
        <Button
          size="micro"
          variant="secondary"
          tone="critical"
          onClick={() => deleteRule(rule.id)}
        >
          Delete
        </Button>
      </InlineStack>,
    ];
  });

  return (
    <Page>
      <TitleBar title="Bundle Rules Management">
        <button variant="primary" onClick={handleOpenModal}>
          Create Bundle Rule
        </button>
      </TitleBar>
      
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Bundle Rules ({bundleRules.length})
                </Text>
                <Button onClick={handleOpenModal}>Create New Rule</Button>
              </InlineStack>
              
              <Text variant="bodyMd" as="p">
                Manage your reverse bundling rules. When customers order the specified items together, 
                they'll automatically be converted to the bundled SKU for fulfillment.
              </Text>

              {bundleRules.length > 0 ? (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                  headings={['Rule Name', 'Individual Items', 'Bundled SKU', 'Status', 'Frequency', 'Savings/Order', 'Actions']}
                  rows={tableData}
                />
              ) : (
                <EmptyState
                  heading="No bundle rules created yet"
                  action={{content: 'Create your first rule', onAction: handleOpenModal}}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Create bundle rules to automatically optimize your fulfillment costs when customers order specific item combinations.</p>
                </EmptyState>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingMd">Bundle Rule Tips</Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd">
                  <strong>High-Frequency Combinations:</strong> Focus on item combinations that appear in 5+ orders per month for maximum impact.
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>SKU Naming:</strong> Use clear, descriptive names for bundled SKUs to help your fulfillment team.
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Cost Analysis:</strong> Ensure your bundled SKU pricing accounts for individual item costs plus savings.
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Inventory Management:</strong> Coordinate with your supplier to ensure bundled SKUs are available in your fulfillment center.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        title="Create New Bundle Rule"
        primaryAction={{
          content: 'Create Rule',
          onAction: handleSubmit,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: handleCloseModal,
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Rule Name"
              value={formData.name}
              onChange={(value) => setFormData({...formData, name: value})}
              placeholder="e.g., Main Product Bundle"
              helpText="Give your bundle rule a descriptive name"
              autoComplete="off"
            />
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">Select Products/Variants for Bundle</Text>
              <Text as="p" variant="bodySm" tone="subdued">Choose multiple products/variants from your store</Text>
              <div style={{maxHeight: '200px', overflowY: 'auto', border: '1px solid #e1e3e5', borderRadius: '6px', padding: '12px'}}>
                <BlockStack gap="100">
                  {products.map((product) => (
                    <label key={product.value} style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'}}>
                      <input
                        type="checkbox"
                        checked={formData.items.includes(product.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({...formData, items: [...formData.items, product.value]});
                          } else {
                            setFormData({...formData, items: formData.items.filter(item => item !== product.value)});
                          }
                        }}
                      />
                      <Text as="span" variant="bodySm">{product.label}</Text>
                    </label>
                  ))}
                </BlockStack>
              </div>
              {formData.items.length > 0 && (
                <Text as="p" variant="bodySm" tone="success">
                  Selected: {formData.items.length} product(s)
                </Text>
              )}
            </BlockStack>
            <TextField
              label="Bundled SKU"
              value={formData.bundledSku}
              onChange={(value) => setFormData({...formData, bundledSku: value})}
              placeholder="e.g., SKU-ABC"
              helpText="The pre-bundled SKU that will be sent to fulfillment"
              autoComplete="off"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
