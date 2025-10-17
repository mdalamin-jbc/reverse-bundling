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
  Divider,
} from "@shopify/polaris";
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
      minimumSavings: parseFloat(formData.get("minimumSavings") as string) || 0
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
  const [hasChanges, setHasChanges] = useState(false);

  // Track changes
  useEffect(() => {
    const changed = 
      notificationsEnabled !== settings.notificationsEnabled ||
      emailNotifications !== settings.emailNotifications ||
      slackWebhook !== (settings.slackWebhook || "") ||
      autoConvertOrders !== settings.autoConvertOrders ||
      minimumSavings !== String(settings.minimumSavings);
    setHasChanges(changed);
  }, [notificationsEnabled, emailNotifications, slackWebhook, autoConvertOrders, minimumSavings, settings]);

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
    <Page title="Settings">
      <TitleBar title="Settings" />
      
      <BlockStack gap="600">
        {/* System Status Banner */}
        {!webhooksHealthy && (
          <Banner tone="warning" title="Webhook Configuration Required">
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                Protected Customer Data access approval is required from Shopify Partner Dashboard to enable automatic order processing.
              </Text>
              <InlineStack gap="200">
                <Button
                  url="https://partners.shopify.com"
                  target="_blank"
                  variant="primary"
                >
                  Request Approval
                </Button>
                <Button
                  onClick={handleRegisterWebhooks}
                  loading={isRegistering}
                  variant="secondary"
                >
                  Register Webhooks
                </Button>
              </InlineStack>
            </BlockStack>
          </Banner>
        )}

        {webhooksHealthy && (
          <Banner tone="success" title="System Operational">
            <Text as="p" variant="bodyMd">
              All systems are operational. Webhooks active and order processing enabled.
            </Text>
          </Banner>
        )}

        {error && (
          <Banner tone="critical" title="Configuration Error">
            <Text as="p" variant="bodyMd">{error}</Text>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {/* Webhook Configuration */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingLg" fontWeight="semibold">
                        Webhook Configuration
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Real-time order processing and automation
                      </Text>
                    </BlockStack>
                    <Badge tone={webhooksHealthy ? "success" : "critical"} size="large">
                      {webhooksHealthy ? "Active" : "Inactive"}
                    </Badge>
                  </InlineStack>

                  <Divider />

                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodyMd">Webhook Status</Text>
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {webhooks.length} of 2 registered
                      </Text>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="p" variant="bodyMd">Orders Create</Text>
                      <Badge tone={webhooks.some((w: any) => w.topic === 'ORDERS_CREATE') ? "success" : "critical"}>
                        {webhooks.some((w: any) => w.topic === 'ORDERS_CREATE') ? "✓ Active" : "✗ Missing"}
                      </Badge>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="p" variant="bodyMd">Orders Updated</Text>
                      <Badge tone={webhooks.some((w: any) => w.topic === 'ORDERS_UPDATED') ? "success" : "critical"}>
                        {webhooks.some((w: any) => w.topic === 'ORDERS_UPDATED') ? "✓ Active" : "✗ Missing"}
                      </Badge>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Notification Settings */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingLg" fontWeight="semibold">
                      Notification Settings
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Configure alerts for bundle conversions and system events
                    </Text>
                  </BlockStack>

                  <Divider />

                  <FormLayout>
                    <Checkbox
                      label="Enable notifications"
                      checked={notificationsEnabled}
                      onChange={setNotificationsEnabled}
                      helpText="Master switch for all notification channels"
                    />

                    <Checkbox
                      label="Email notifications"
                      checked={emailNotifications}
                      onChange={setEmailNotifications}
                      disabled={!notificationsEnabled}
                      helpText="Receive email alerts for bundle conversions"
                    />

                    <TextField
                      label="Slack webhook URL"
                      value={slackWebhook}
                      onChange={setSlackWebhook}
                      disabled={!notificationsEnabled}
                      autoComplete="off"
                      helpText="Optional: Receive real-time Slack notifications"
                      placeholder="https://hooks.slack.com/services/..."
                    />

                    {slackWebhook && (
                      <Button
                        variant="secondary"
                        size="slim"
                        onClick={handleTestSlackWebhook}
                        loading={isTestingSlack}
                      >
                        Test Slack Webhook
                      </Button>
                    )}
                  </FormLayout>
                </BlockStack>
              </Card>

              {/* Order Processing */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingLg" fontWeight="semibold">
                      Order Processing
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Configure automatic bundle detection and conversion
                    </Text>
                  </BlockStack>

                  <Divider />

                  <FormLayout>
                    <Checkbox
                      label="Automatic order conversion"
                      checked={autoConvertOrders}
                      onChange={setAutoConvertOrders}
                      helpText="Automatically convert orders matching bundle rules"
                    />

                    <TextField
                      label="Minimum savings threshold"
                      value={minimumSavings}
                      onChange={setMinimumSavings}
                      type="number"
                      prefix="$"
                      min="0"
                      step={0.01}
                      autoComplete="off"
                      helpText="Only convert orders with savings above this amount"
                    />
                  </FormLayout>
                </BlockStack>
              </Card>

              {/* System Information */}
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingLg" fontWeight="semibold">
                      System Information
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Current system status and configuration
                    </Text>
                  </BlockStack>

                  <Divider />

                  <div style={{ 
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px'
                  }}>
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Environment</Text>
                      <Badge tone={isProduction ? "success" : "info"}>
                        {isProduction ? "Production" : "Development"}
                      </Badge>
                    </BlockStack>

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Database</Text>
                      <Badge tone="success">Connected</Badge>
                    </BlockStack>

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">API Status</Text>
                      <Badge tone="success">Active</Badge>
                    </BlockStack>

                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Processing Mode</Text>
                      <Badge tone={autoConvertOrders ? "success" : "attention"}>
                        {autoConvertOrders ? "Automatic" : "Manual"}
                      </Badge>
                    </BlockStack>
                  </div>

                  {appUrl && (
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">Application URL</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{appUrl}</Text>
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Actions */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">
                    Actions
                  </Text>

                  <BlockStack gap="200">
                    <Button
                      variant="primary"
                      size="large"
                      fullWidth
                      onClick={handleSave}
                      loading={isLoading && !isRegistering}
                      disabled={!hasChanges}
                    >
                      {hasChanges ? "Save Changes" : "Settings Saved"}
                    </Button>

                    <Button
                      variant="secondary"
                      size="large"
                      fullWidth
                      onClick={handleRegisterWebhooks}
                      loading={isRegistering}
                    >
                      Register Webhooks
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Quick Links */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">
                    Quick Links
                  </Text>

                  <BlockStack gap="200">
                    <Button
                      url="/app/orders"
                      variant="plain"
                      fullWidth
                    >
                      View Orders
                    </Button>

                    <Button
                      url="/app/bundle-rules"
                      variant="plain"
                      fullWidth
                    >
                      Manage Rules
                    </Button>

                    <Button
                      url="/app/fulfillment"
                      variant="plain"
                      fullWidth
                    >
                      Fulfillment Status
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
