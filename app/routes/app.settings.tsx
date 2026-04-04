import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  TextField,
  Checkbox,
  FormLayout,
  Banner,
  Badge,
  Box,
  RadioButton,
  Divider,
  Icon,
} from "@shopify/polaris";
import {
  NotificationIcon,
  SettingsIcon,
  DeliveryIcon,
  AppsIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ArrowRightIcon,
} from "@shopify/polaris-icons";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { useEffect, useState } from "react";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    // Get or create settings for this shop
    let settings = await db.appSettings.findUnique({
      where: { shop: session.shop }
    });

    if (!settings) {
      settings = await db.appSettings.create({
        data: {
          shop: session.shop,
          notificationsEnabled: true,
          emailNotifications: true,
          autoConvertOrders: true,
          minimumSavings: 5.0
        }
      });
    }

    // Check webhook registrations
    const webhookResponse = await admin.graphql(`
      #graphql
      query {
        webhookSubscriptions(first: 10) {
          edges {
            node {
              id
              topic
              endpoint {
                __typename
                ... on WebhookHttpEndpoint {
                  callbackUrl
                }
              }
            }
          }
        }
      }
    `);

    const webhookData = await webhookResponse.json();
    const webhooks = webhookData.data.webhookSubscriptions.edges.map((edge: any) => ({
      id: edge.node.id,
      topic: edge.node.topic,
      callbackUrl: edge.node.endpoint?.callbackUrl || 'N/A'
    }));

    // Check required webhooks
    const requiredWebhooks = ['ORDERS_CREATE', 'ORDERS_UPDATED'];
    const registeredTopics = webhooks.map((w: any) => w.topic);
    const missingWebhooks = requiredWebhooks.filter(topic => !registeredTopics.includes(topic));

    logInfo('Loaded app settings', {
      shop: session.shop,
      settingsId: settings.id,
      webhooksRegistered: webhooks.length,
      missingWebhooks: missingWebhooks.length
    });

    return json({ 
      settings,
      webhooks,
      missingWebhooks,
      webhooksHealthy: missingWebhooks.length === 0,
      appUrl: process.env.SHOPIFY_APP_URL || '',
      isProduction: process.env.NODE_ENV === 'production',
      error: null as string | null
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Error loading settings'), { shop: session.shop });
    return json({ 
      settings: {
        id: '',
        shop: session.shop,
        notificationsEnabled: true,
        emailNotifications: true,
        slackWebhook: null,
        autoConvertOrders: true,
        minimumSavings: 5.0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      webhooks: [],
      missingWebhooks: ['ORDERS_CREATE', 'ORDERS_UPDATED'],
      webhooksHealthy: false,
      appUrl: process.env.SHOPIFY_APP_URL || '',
      isProduction: false,
      error: 'Failed to load webhook information'
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  
  // Handle webhook registration
  if (action === "registerWebhooks") {
    try {
      logInfo('Starting webhook registration', { 
        shop: session.shop,
        appUrl: process.env.SHOPIFY_APP_URL 
      });
      
      const { registerWebhooks } = await import("../shopify.server");
      
      const result = await registerWebhooks({ session });
      
      logInfo('Webhooks registered successfully', {
        shop: session.shop,
        result: JSON.stringify(result)
      });

      return json({
        success: true,
        message: "✅ Webhooks registered successfully! Your app can now receive order notifications.",
        result
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to register webhooks";
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      logError(error as Error, { 
        shop: session.shop, 
        action: 'registerWebhooks',
        errorMessage,
        errorStack
      });
      
      return json({
        success: false,
        message: `❌ Failed to register webhooks: ${errorMessage}`
      }, { status: 500 });
    }
  }
  
  // Handle settings update
  try {
    const settingsData = {
      notificationsEnabled: formData.get("notificationsEnabled") === "true",
      emailNotifications: formData.get("emailNotifications") === "true",
      slackWebhook: formData.get("slackWebhook") as string || null,
      autoConvertOrders: formData.get("autoConvertOrders") === "true",
      minimumSavings: parseFloat(formData.get("minimumSavings") as string) || 0,
      individualShipCost: parseFloat(formData.get("individualShipCost") as string) || 7.0,
      bundleShipCost: parseFloat(formData.get("bundleShipCost") as string) || 9.0,
      fulfillmentMode: (formData.get("fulfillmentMode") as string) || 'tag_only',
    };

    const settings = await db.appSettings.upsert({
      where: { shop: session.shop },
      update: settingsData,
      create: {
        shop: session.shop,
        ...settingsData
      }
    });

    logInfo('Updated app settings', {
      shop: session.shop,
      settingsId: settings.id
    });

    return json({ 
      success: true, 
      message: "Settings saved successfully!",
      settings
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Error saving settings'), { shop: session.shop });
    return json({ 
      success: false, 
      message: error instanceof Error ? error.message : "Failed to save settings"
    });
  }

  // Handle Slack webhook testing
  if (action === "testSlackWebhook") {
    try {
      const slackWebhook = formData.get("slackWebhook") as string;
      
      if (!slackWebhook) {
        return json({
          success: false,
          message: "❌ Please enter a Slack webhook URL first"
        });
      }

      const { testSlackWebhook } = await import("../slack.server");
      const result = await testSlackWebhook(slackWebhook);

      if (result.success) {
        return json({
          success: true,
          message: "✅ Slack webhook test sent! Check your Slack channel for the test message."
        });
      } else {
        return json({
          success: false,
          message: `❌ Failed to send Slack test: ${(result as any).error?.message || 'Unknown error'}`
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to test Slack webhook";
      logError(error as Error, { 
        shop: session.shop, 
        action: 'testSlackWebhook'
      });
      
      return json({
        success: false,
        message: `❌ ${errorMessage}`
      }, { status: 500 });
    }
  }
};

export default function Settings() {
  const { settings, webhooks, webhooksHealthy, appUrl, isProduction, error } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(settings.notificationsEnabled);
  const [emailNotifications, setEmailNotifications] = useState(settings.emailNotifications);
  const [slackWebhook, setSlackWebhook] = useState(settings.slackWebhook || "");
  const [autoConvertOrders, setAutoConvertOrders] = useState(settings.autoConvertOrders);
  const [minimumSavings, setMinimumSavings] = useState(String(settings.minimumSavings));
  const [individualShipCost, setIndividualShipCost] = useState(String((settings as any).individualShipCost ?? 7.0));
  const [bundleShipCost, setBundleShipCost] = useState(String((settings as any).bundleShipCost ?? 9.0));
  const [fulfillmentMode, setFulfillmentMode] = useState<string>((settings as any).fulfillmentMode ?? 'tag_only');
  const [hasChanges, setHasChanges] = useState(false);

  // Track changes
  useEffect(() => {
    const changed = 
      notificationsEnabled !== settings.notificationsEnabled ||
      emailNotifications !== settings.emailNotifications ||
      slackWebhook !== (settings.slackWebhook || "") ||
      autoConvertOrders !== settings.autoConvertOrders ||
      minimumSavings !== String(settings.minimumSavings) ||
      individualShipCost !== String((settings as any).individualShipCost ?? 7.0) ||
      bundleShipCost !== String((settings as any).bundleShipCost ?? 9.0) ||
      fulfillmentMode !== ((settings as any).fulfillmentMode ?? 'tag_only');
    setHasChanges(changed);
  }, [notificationsEnabled, emailNotifications, slackWebhook, autoConvertOrders, minimumSavings, individualShipCost, bundleShipCost, fulfillmentMode, settings]);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message);
      setHasChanges(false);
    } else if (fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleSave = () => {
    const formData = new FormData();
    formData.append("notificationsEnabled", String(notificationsEnabled));
    formData.append("emailNotifications", String(emailNotifications));
    formData.append("slackWebhook", slackWebhook);
    formData.append("autoConvertOrders", String(autoConvertOrders));
    formData.append("minimumSavings", minimumSavings);
    formData.append("individualShipCost", individualShipCost);
    formData.append("bundleShipCost", bundleShipCost);
    formData.append("fulfillmentMode", fulfillmentMode);
    
    fetcher.submit(formData, { method: "POST" });
  };

  const handleRegisterWebhooks = () => {
    const formData = new FormData();
    formData.append("action", "registerWebhooks");
    fetcher.submit(formData, { method: "POST" });
  };

  const handleTestSlackWebhook = () => {
    const formData = new FormData();
    formData.append("action", "testSlackWebhook");
    formData.append("slackWebhook", slackWebhook);
    fetcher.submit(formData, { method: "POST" });
  };

  const isLoading = fetcher.state === "submitting";
  const isRegistering = isLoading && fetcher.formData?.get("action") === "registerWebhooks";
  const isTestingSlack = isLoading && fetcher.formData?.get("action") === "testSlackWebhook";

  return (
    <Page
      title="Settings"
      subtitle="Configure your app preferences, notifications, and fulfillment mode"
    >
      <TitleBar title="Settings" />

      <BlockStack gap="500">
        {/* Status banners */}
        {!webhooksHealthy && (
          <Banner tone="warning" title="Webhook Configuration Required">
            <BlockStack gap="200">
              <p>Protected Customer Data access approval is required to enable automatic order processing.</p>
              <InlineStack gap="200">
                <Button url="https://partners.shopify.com" target="_blank" variant="primary">Request Approval</Button>
                <Button onClick={handleRegisterWebhooks} loading={isRegistering}>Register Webhooks</Button>
              </InlineStack>
            </BlockStack>
          </Banner>
        )}

        {webhooksHealthy && (
          <Banner tone="success"><p>All systems operational. Webhooks are active and order processing is enabled.</p></Banner>
        )}

        {error && <Banner tone="critical"><p>{error}</p></Banner>}

        <Layout>
          {/* Main settings column */}
          <Layout.Section>
            <BlockStack gap="500">

              {/* Webhook Status */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="200" blockAlign="center">
                    <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                      <Icon source={AppsIcon} tone="base" />
                    </Box>
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd" fontWeight="semibold">Webhook Status</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Real-time order event listeners</Text>
                    </BlockStack>
                  </InlineStack>
                  <Divider />
                  <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                    <BlockStack gap="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={webhooks.some((w: any) => w.topic === 'ORDERS_CREATE') ? CheckCircleIcon : AlertCircleIcon} tone={webhooks.some((w: any) => w.topic === 'ORDERS_CREATE') ? "success" : "critical"} />
                          <Text as="p" variant="bodyMd">Orders Create</Text>
                        </InlineStack>
                        <Badge tone={webhooks.some((w: any) => w.topic === 'ORDERS_CREATE') ? "success" : "critical"}>
                          {webhooks.some((w: any) => w.topic === 'ORDERS_CREATE') ? "Active" : "Missing"}
                        </Badge>
                      </InlineStack>
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={webhooks.some((w: any) => w.topic === 'ORDERS_UPDATED') ? CheckCircleIcon : AlertCircleIcon} tone={webhooks.some((w: any) => w.topic === 'ORDERS_UPDATED') ? "success" : "critical"} />
                          <Text as="p" variant="bodyMd">Orders Updated</Text>
                        </InlineStack>
                        <Badge tone={webhooks.some((w: any) => w.topic === 'ORDERS_UPDATED') ? "success" : "critical"}>
                          {webhooks.some((w: any) => w.topic === 'ORDERS_UPDATED') ? "Active" : "Missing"}
                        </Badge>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                </BlockStack>
              </Card>

              {/* Notifications */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="200" blockAlign="center">
                    <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                      <Icon source={NotificationIcon} tone="base" />
                    </Box>
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd" fontWeight="semibold">Notifications</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Get notified when bundles are detected</Text>
                    </BlockStack>
                  </InlineStack>
                  <Divider />
                  <FormLayout>
                    <Checkbox label="Enable notifications" checked={notificationsEnabled} onChange={setNotificationsEnabled} />
                    <Checkbox label="Email notifications" checked={emailNotifications} onChange={setEmailNotifications} disabled={!notificationsEnabled} helpText="Receive an email for each bundle conversion" />
                    <TextField
                      label="Slack webhook URL"
                      value={slackWebhook}
                      onChange={setSlackWebhook}
                      disabled={!notificationsEnabled}
                      autoComplete="off"
                      placeholder="https://hooks.slack.com/services/..."
                      helpText="Optional: Get real-time notifications in Slack"
                    />
                    {slackWebhook && notificationsEnabled && (
                      <Button size="slim" onClick={handleTestSlackWebhook} loading={isTestingSlack}>Send test message</Button>
                    )}
                  </FormLayout>
                </BlockStack>
              </Card>

              {/* Order Processing */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="200" blockAlign="center">
                    <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                      <Icon source={SettingsIcon} tone="base" />
                    </Box>
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd" fontWeight="semibold">Order Processing</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Control how orders are matched and converted</Text>
                    </BlockStack>
                  </InlineStack>
                  <Divider />
                  <FormLayout>
                    <Checkbox label="Automatic order conversion" checked={autoConvertOrders} onChange={setAutoConvertOrders} helpText="When enabled, orders matching bundle rules are automatically converted" />
                    <TextField label="Minimum savings threshold" value={minimumSavings} onChange={setMinimumSavings} type="number" prefix="$" min="0" step={0.01} autoComplete="off" helpText="Only convert orders that save at least this amount" />
                  </FormLayout>
                </BlockStack>
              </Card>

              {/* Fulfillment Costs */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="200" blockAlign="center">
                    <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                      <Icon source={DeliveryIcon} tone="base" />
                    </Box>
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd" fontWeight="semibold">Fulfillment Costs</Text>
                      <Text as="p" variant="bodySm" tone="subdued">Used to calculate savings per bundled order</Text>
                    </BlockStack>
                  </InlineStack>
                  <Divider />
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField label="Per-item shipping cost" value={individualShipCost} onChange={setIndividualShipCost} type="number" prefix="$" min="0" step={0.01} autoComplete="off" helpText="Cost to ship one item individually" />
                      <TextField label="Bundle shipping cost" value={bundleShipCost} onChange={setBundleShipCost} type="number" prefix="$" min="0" step={0.01} autoComplete="off" helpText="Cost to ship one pre-packed bundle" />
                    </FormLayout.Group>
                  </FormLayout>
                  {parseFloat(individualShipCost) > 0 && parseFloat(bundleShipCost) > 0 && (
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="p" variant="bodySm" tone="subdued">Estimated savings on a 3-item bundle</Text>
                        <Text as="p" variant="bodyMd" fontWeight="bold" tone="success">
                          ${((parseFloat(individualShipCost) * 3) - parseFloat(bundleShipCost)).toFixed(2)} per order
                        </Text>
                      </InlineStack>
                    </Box>
                  )}
                </BlockStack>
              </Card>

              {/* Fulfillment Mode */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd" fontWeight="semibold">Fulfillment Mode</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Choose how bundle rules are applied to matching orders</Text>
                  </BlockStack>
                  <Divider />

                  <Box padding="300" background={fulfillmentMode === 'tag_only' ? "bg-surface-info" : "bg-surface-secondary"} borderRadius="200">
                    <RadioButton
                      label="Tag & Note Only (Safe)"
                      helpText="Adds tags, notes, and metafields to the order. Line items stay unchanged. Best for manual fulfillment workflows."
                      checked={fulfillmentMode === 'tag_only'}
                      id="tag_only"
                      name="fulfillmentMode"
                      onChange={() => setFulfillmentMode('tag_only')}
                    />
                  </Box>

                  <Box padding="300" background={fulfillmentMode === 'order_edit' ? "bg-surface-info" : "bg-surface-secondary"} borderRadius="200">
                    <RadioButton
                      label="Full Order Edit (Automated)"
                      helpText="Replaces individual line items with the bundle product SKU. 3PL software (ShipStation, ShipBob) will pick the bundle automatically."
                      checked={fulfillmentMode === 'order_edit'}
                      id="order_edit"
                      name="fulfillmentMode"
                      onChange={() => setFulfillmentMode('order_edit')}
                    />
                  </Box>

                  {fulfillmentMode === 'order_edit' && (
                    <Banner tone="warning">
                      <p>Order Edit mode modifies the customer-facing order. The bundle product must exist in your store with a matching SKU. Ensure your bundle products are created before activating rules.</p>
                    </Banner>
                  )}
                </BlockStack>
              </Card>

              {/* System Info */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd" fontWeight="semibold">System Information</Text>
                  <Divider />
                  <InlineStack gap="200" wrap>
                    <Badge tone={isProduction ? "success" : "info"}>{isProduction ? "Production" : "Development"}</Badge>
                    <Badge tone="success">Database Connected</Badge>
                    <Badge tone={webhooksHealthy ? "success" : "critical"}>{webhooksHealthy ? "Webhooks Active" : "Webhooks Inactive"}</Badge>
                    <Badge tone={autoConvertOrders ? "success" : "attention"}>{autoConvertOrders ? "Auto Convert" : "Manual Mode"}</Badge>
                    <Badge tone="info">{fulfillmentMode === 'order_edit' ? "Order Edit" : "Tag Only"}</Badge>
                  </InlineStack>
                  {appUrl && <Text as="p" variant="bodySm" tone="subdued">App URL: {appUrl}</Text>}
                </BlockStack>
              </Card>

            </BlockStack>
          </Layout.Section>

          {/* Sidebar */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">Actions</Text>
                  <Divider />
                  <Button variant="primary" fullWidth onClick={handleSave} loading={isLoading && !isRegistering} disabled={!hasChanges}>
                    {hasChanges ? "Save Changes" : "All changes saved"}
                  </Button>
                  <Button fullWidth onClick={handleRegisterWebhooks} loading={isRegistering}>Register Webhooks</Button>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">Quick Links</Text>
                  <Divider />
                  <Button url="/app/orders" variant="plain" fullWidth icon={ArrowRightIcon}>Order Conversions</Button>
                  <Button url="/app/bundle-rules" variant="plain" fullWidth icon={ArrowRightIcon}>Bundle Rules</Button>
                  <Button url="/app/fulfillment" variant="plain" fullWidth icon={ArrowRightIcon}>Fulfillment Status</Button>
                  <Button url="/app/billing" variant="plain" fullWidth icon={ArrowRightIcon}>Billing & Plans</Button>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
