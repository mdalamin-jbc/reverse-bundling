import { useLoaderData, useFetcher } from "@remix-run/react";
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // Mock bundle rules data - in a real app, this would come from your database
  const bundleRules = [
    {
      id: "1",
      name: "Main Product Bundle",
      items: ["SKU-A", "SKU-B", "SKU-C"],
      bundledSku: "SKU-ABC",
      status: "active",
      frequency: 12,
      savings: 15.50,
      createdAt: "2024-01-15",
    },
    {
      id: "2", 
      name: "Accessory Bundle",
      items: ["SKU-A", "SKU-D"],
      bundledSku: "SKU-AD",
      status: "active",
      frequency: 8,
      savings: 8.25,
      createdAt: "2024-01-10",
    },
    {
      id: "3",
      name: "Premium Bundle",
      items: ["SKU-E", "SKU-F", "SKU-G", "SKU-H"],
      bundledSku: "SKU-EFGH",
      status: "draft",
      frequency: 3,
      savings: 22.75,
      createdAt: "2024-01-05",
    },
  ];

  return json({ bundleRules });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "createRule") {
    const name = formData.get("name");
    // const items = formData.get("items");
    // const bundledSku = formData.get("bundledSku");
    
    // Here you would save to your database
    return json({ 
      success: true, 
      message: `Bundle rule "${name}" created successfully!` 
    });
  }

  if (action === "toggleStatus") {
    // const ruleId = formData.get("ruleId");
    // Here you would update the status in your database
    return json({ 
      success: true, 
      message: "Bundle rule status updated!" 
    });
  }

  if (action === "deleteRule") {
    // const ruleId = formData.get("ruleId");
    // Here you would delete from your database
    return json({ 
      success: true, 
      message: "Bundle rule deleted successfully!" 
    });
  }

  return json({ success: false, message: "Unknown action" });
};

export default function BundleRules() {
  const { bundleRules } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    items: "",
    bundledSku: "",
  });

  const isLoading = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message);
      if (fetcher.data.message.includes("created")) {
        setIsModalOpen(false);
        setFormData({ name: "", items: "", bundledSku: "" });
      }
    }
  }, [fetcher.data, shopify]);

  const handleOpenModal = useCallback(() => setIsModalOpen(true), []);
  const handleCloseModal = useCallback(() => setIsModalOpen(false), []);

  const handleSubmit = useCallback(() => {
    fetcher.submit(
      { 
        action: "createRule",
        name: formData.name,
        items: formData.items,
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
  const tableData = bundleRules.map((rule: any) => [
    rule.name,
    rule.items.join(" + "),
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
  ]);

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
            <TextField
              label="Individual SKUs"
              value={formData.items}
              onChange={(value) => setFormData({...formData, items: value})}
              placeholder="e.g., SKU-A, SKU-B, SKU-C"
              helpText="Enter SKUs separated by commas"
              autoComplete="off"
            />
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
