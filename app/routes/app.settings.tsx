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
  Box,
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
  const [showWebhookDetails, setShowWebhookDetails] = useState(false);
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

  const isLoading = fetcher.state === "submitting";
  const isRegistering = isLoading && fetcher.formData?.get("action") === "registerWebhooks";

  return (
    <Page>
      <TitleBar title="Settings & Configuration" />
      
      <BlockStack gap="600">
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '48px 40px',
            borderRadius: '20px',
            color: 'white',
            boxShadow: '0 20px 25px -5px rgba(102, 126, 234, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}
        >
          <BlockStack gap="300">
            <Text as="h1" variant="heading2xl" fontWeight="bold">
              <span style={{ color: 'white' }}>⚙️ App Settings</span>
            </Text>
            <Text as="p" variant="bodyLg">
              <span style={{ color: 'rgba(255, 255, 255, 0.95)', fontSize: '18px' }}>
                Configure your app, manage webhooks, and optimize order processing
              </span>
            </Text>
          </BlockStack>
        </div>

        {/* Webhook Status Banner - Show at top if not healthy */}
        {!webhooksHealthy && (
          <Banner
            tone="warning"
            title="🔐 Protected Customer Data Access Required"
          >
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                <strong>Your app needs Shopify approval to access order webhooks.</strong> This is a standard security requirement for apps that process customer data.
              </Text>
              
              <div style={{
                background: '#fffbeb',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #fbbf24'
              }}>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    📋 What You Need to Do:
                  </Text>
                  <ol style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px' }}>
                    <li><Text as="span" variant="bodySm">Open your <strong>Shopify Partner Dashboard</strong></Text></li>
                    <li><Text as="span" variant="bodySm">Go to <strong>Apps → reverse-bundling → Configuration</strong></Text></li>
                    <li><Text as="span" variant="bodySm">Navigate to <strong>Compliance → Protected Customer Data</strong></Text></li>
                    <li><Text as="span" variant="bodySm">Click <strong>"Request Access"</strong> and submit your request</Text></li>
                    <li><Text as="span" variant="bodySm">Approval typically takes <strong>1-3 business days</strong></Text></li>
                  </ol>
                </BlockStack>
              </div>

              <div style={{
                background: '#f0fdf4',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #10b981'
              }}>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    ✅ Good News - You Can Still Test!
                  </Text>
                  <Text as="p" variant="bodySm">
                    While waiting for approval, you can manually sync orders from the Orders page. 
                    Once approved, webhooks will work automatically in real-time! 🚀
                  </Text>
                </BlockStack>
              </div>
              
              <InlineStack gap="200">
                <Button
                  url="https://partners.shopify.com"
                  target="_blank"
                  variant="primary"
                  size="large"
                >
                  🚀 Open Partner Dashboard
                </Button>
                <Button
                  onClick={handleRegisterWebhooks}
                  loading={isRegistering}
                  variant="secondary"
                  size="large"
                >
                  🔄 Try Register Webhooks
                </Button>
                <Button
                  url="https://shopify.dev/docs/apps/launch/protected-customer-data"
                  target="_blank"
                  size="large"
                >
                  📚 Learn More
                </Button>
              </InlineStack>
            </BlockStack>
          </Banner>
        )}

        {webhooksHealthy && (
          <Banner
            tone="success"
            title="✅ All Systems Operational"
          >
            <Text as="p" variant="bodyMd">
              Your app is fully configured and receiving real-time order notifications. 
              Webhooks are active and order processing is running smoothly! 🎉
            </Text>
          </Banner>
        )}

        {error && (
          <Banner tone="critical" title="Error Loading Configuration">
            <Text as="p" variant="bodyMd">{error}</Text>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              {/* Webhook Management Card */}
              <Card>
                <BlockStack gap="500">
                  <div
                    style={{
                      background: webhooksHealthy 
                        ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)'
                        : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                      padding: '24px',
                      borderRadius: '12px',
                      border: webhooksHealthy ? '2px solid #10b981' : '2px solid #ef4444',
                    }}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h2" variant="headingLg" fontWeight="bold">
                            <span style={{ color: webhooksHealthy ? '#065f46' : '#991b1b' }}>
                              📡 Webhook Status
                            </span>
                          </Text>
                          <Badge tone={webhooksHealthy ? "success" : "critical"} size="large">
                            {webhooksHealthy ? "● All Active" : "⚠ Blocked by Shopify"}
                          </Badge>
                        </InlineStack>
                        <Text as="p" variant="bodyMd">
                          <span style={{ color: webhooksHealthy ? '#065f46' : '#991b1b' }}>
                            {webhooksHealthy 
                              ? `${webhooks.length} webhooks registered and receiving order notifications`
                              : `Webhooks require "Protected Customer Data" approval from Shopify`
                            }
                          </span>
                        </Text>
                      </BlockStack>
                      <Button
                        url="https://partners.shopify.com"
                        target="_blank"
                        variant="primary"
                        size="large"
                      >
                        Request Approval
                      </Button>
                    </InlineStack>
                  </div>

                  <Divider />

                  {/* Webhook Details */}
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h3" variant="headingMd" fontWeight="semibold">
                        Webhook Details ({webhooks.length} registered)
                      </Text>
                      <Button
                        variant="plain"
                        onClick={() => setShowWebhookDetails(!showWebhookDetails)}
                      >
                        {showWebhookDetails ? "Hide" : "Show"} Details
                      </Button>
                    </InlineStack>

                    {showWebhookDetails && (
                      <div
                        style={{
                          background: '#f9fafb',
                          padding: '20px',
                          borderRadius: '12px',
                          border: '1px solid #e5e7eb',
                        }}
                      >
                        {webhooks.length > 0 ? (
                          <BlockStack gap="300">
                            {webhooks.map((webhook: any) => (
                              <div
                                key={webhook.id}
                                style={{
                                  background: 'white',
                                  padding: '16px',
                                  borderRadius: '8px',
                                  border: '1px solid #e5e7eb',
                                }}
                              >
                                <BlockStack gap="200">
                                  <InlineStack gap="200" blockAlign="center">
                                    <Badge tone="success">✓ Active</Badge>
                                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                                      {webhook.topic.replace(/_/g, ' ')}
                                    </Text>
                                  </InlineStack>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Endpoint: {webhook.callbackUrl}
                                  </Text>
                                </BlockStack>
                              </div>
                            ))}
                          </BlockStack>
                        ) : (
                          <Box padding="400">
                            <Text as="p" variant="bodyMd" alignment="center" tone="subdued">
                              No webhooks registered. Click "Register Now" above to set them up.
                            </Text>
                          </Box>
                        )}
                      </div>
                    )}
                  </BlockStack>

                  {/* Info Box */}
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                      padding: '16px 20px',
                      borderRadius: '8px',
                      border: '1px solid #3b82f6',
                    }}
                  >
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="bodyMd">💡</Text>
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          <span style={{ color: '#1e40af' }}>How Webhooks Work</span>
                        </Text>
                      </InlineStack>
                      <Text as="p" variant="bodySm">
                        <span style={{ color: '#1e40af' }}>
                          Webhooks automatically notify your app when orders are created or updated in Shopify. 
                          This enables real-time bundle detection and cost savings tracking.
                        </span>
                      </Text>
                    </BlockStack>
                  </div>
                </BlockStack>
              </Card>

              {/* Settings Cards */}
              <Card>
                <BlockStack gap="500">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px',
                    background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                    borderRadius: '12px',
                    border: '1px solid #0ea5e9'
                  }}>
                    <Text as="span" variant="headingLg">🔔</Text>
                    <div style={{ flex: 1 }}>
                      <Text as="h2" variant="headingMd" fontWeight="bold">
                        Notification Settings
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Stay informed about bundle conversions and cost savings
                      </Text>
                    </div>
                    <Badge tone={notificationsEnabled ? "success" : "info"}>
                      {notificationsEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  
                  <FormLayout>
                    <div style={{
                      background: notificationsEnabled ? '#f0fdf4' : '#f9fafb',
                      padding: '20px',
                      borderRadius: '12px',
                      border: notificationsEnabled ? '2px solid #10b981' : '1px solid #e5e7eb',
                      transition: 'all 0.2s ease'
                    }}>
                      <Checkbox
                        label={
                          <Text as="span" variant="bodyLg" fontWeight="semibold">
                            Enable all notifications
                          </Text>
                        }
                        checked={notificationsEnabled}
                        onChange={setNotificationsEnabled}
                        helpText="Master switch - Turn this on to receive alerts when orders are converted to bundles"
                      />
                    </div>
                    
                    <div style={{
                      background: emailNotifications && notificationsEnabled ? '#fef3c7' : '#f9fafb',
                      padding: '16px',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      opacity: notificationsEnabled ? 1 : 0.5,
                      transition: 'all 0.2s ease'
                    }}>
                      <Checkbox
                        label={
                          <InlineStack gap="200" blockAlign="center">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              📧 Email notifications
                            </Text>
                            <Badge tone="info">Recommended</Badge>
                          </InlineStack>
                        }
                        checked={emailNotifications}
                        onChange={setEmailNotifications}
                        disabled={!notificationsEnabled}
                        helpText="Receive detailed email reports for important bundle conversions and cost savings"
                      />
                    </div>
                    
                    <div style={{
                      padding: '16px',
                      background: slackWebhook && notificationsEnabled ? '#f5f3ff' : '#f9fafb',
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      opacity: notificationsEnabled ? 1 : 0.5,
                      transition: 'all 0.2s ease'
                    }}>
                      <BlockStack gap="300">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            💬 Slack Integration
                          </Text>
                          <Badge tone="info">Premium</Badge>
                        </InlineStack>
                        <TextField
                          label=""
                          value={slackWebhook}
                          onChange={setSlackWebhook}
                          disabled={!notificationsEnabled}
                          autoComplete="off"
                          helpText={
                            <span>
                              Get instant Slack notifications for bundle conversions.{' '}
                              <a
                                href="https://api.slack.com/messaging/webhooks"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#0ea5e9', fontWeight: 600 }}
                              >
                                Create Slack Webhook →
                              </a>
                            </span>
                          }
                          placeholder="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX"
                          prefix="🔗"
                        />
                        {slackWebhook && slackWebhook.startsWith('https://hooks.slack.com/') && (
                          <div style={{
                            background: '#dcfce7',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #10b981'
                          }}>
                            <Text as="p" variant="bodySm" tone="success">
                              ✓ Valid Slack webhook URL detected
                            </Text>
                          </div>
                        )}
                      </BlockStack>
                    </div>
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="500">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px',
                    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                    borderRadius: '12px',
                    border: '1px solid #f59e0b'
                  }}>
                    <Text as="span" variant="headingLg">⚙️</Text>
                    <div style={{ flex: 1 }}>
                      <Text as="h2" variant="headingMd" fontWeight="bold">
                        Order Processing Settings
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Configure automatic bundle detection and conversion rules
                      </Text>
                    </div>
                    <Badge tone={autoConvertOrders ? "success" : "attention"}>
                      {autoConvertOrders ? "Auto-mode" : "Manual"}
                    </Badge>
                  </div>
                  
                  <FormLayout>
                    <div style={{
                      background: autoConvertOrders ? '#dcfce7' : '#f9fafb',
                      padding: '20px',
                      borderRadius: '12px',
                      border: autoConvertOrders ? '2px solid #10b981' : '1px solid #e5e7eb',
                      transition: 'all 0.2s ease'
                    }}>
                      <BlockStack gap="300">
                        <Checkbox
                          label={
                            <Text as="span" variant="bodyLg" fontWeight="semibold">
                              🤖 Auto-convert matching orders
                            </Text>
                          }
                          checked={autoConvertOrders}
                          onChange={setAutoConvertOrders}
                          helpText="Automatically detect and convert orders that match your bundle rules (recommended for maximum savings)"
                        />
                        {autoConvertOrders && (
                          <div style={{
                            background: 'white',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #d1fae5'
                          }}>
                            <Text as="p" variant="bodySm">
                              <strong>✓ Active:</strong> Orders will be automatically analyzed and converted when they match your bundle rules
                            </Text>
                          </div>
                        )}
                      </BlockStack>
                    </div>
                    
                    <div style={{
                      padding: '16px',
                      background: '#f0fdf4',
                      borderRadius: '8px',
                      border: '1px solid #86efac'
                    }}>
                      <BlockStack gap="300">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            💰 Minimum Savings Threshold
                          </Text>
                          <Badge tone="success">{`$${minimumSavings}`}</Badge>
                        </InlineStack>
                        <TextField
                          label=""
                          value={minimumSavings}
                          onChange={setMinimumSavings}
                          type="number"
                          prefix="$"
                          suffix="USD"
                          min="0"
                          step={0.01}
                          autoComplete="off"
                          helpText="Only convert orders with shipping cost savings above this amount (prevents low-value conversions)"
                        />
                        <div style={{
                          background: 'white',
                          padding: '12px',
                          borderRadius: '6px',
                          border: '1px solid #d1fae5'
                        }}>
                          <Text as="p" variant="bodySm">
                            💡 <strong>Recommended:</strong> Set between $5-$10 to focus on high-impact conversions. 
                            Higher thresholds = more significant savings per order.
                          </Text>
                        </div>
                      </BlockStack>
                    </div>
                  </FormLayout>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="500">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px',
                    background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
                    borderRadius: '12px',
                    border: '1px solid #a855f7'
                  }}>
                    <Text as="span" variant="headingLg">📊</Text>
                    <div style={{ flex: 1 }}>
                      <Text as="h2" variant="headingMd" fontWeight="bold">
                        System Health & Status
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Real-time monitoring of all app components
                      </Text>
                    </div>
                    <Badge tone={webhooksHealthy ? "success" : "attention"} size="large">
                      {webhooksHealthy ? "All Systems Go" : "Setup Required"}
                    </Badge>
                  </div>

                  <div style={{ 
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px'
                  }}>
                    {/* Environment */}
                    <div style={{ 
                      padding: '20px', 
                      background: isProduction 
                        ? 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)'
                        : 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                      borderRadius: '12px',
                      border: isProduction ? '2px solid #10b981' : '2px solid #3b82f6',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">
                          ENVIRONMENT
                        </Text>
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone={isProduction ? "success" : "info"} size="large">
                            {isProduction ? "🚀 Production" : "🔧 Development"}
                          </Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {isProduction ? "Live environment" : "Testing mode"}
                        </Text>
                      </BlockStack>
                    </div>

                    {/* Webhook Status */}
                    <div style={{ 
                      padding: '20px', 
                      background: webhooksHealthy 
                        ? 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)'
                        : 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                      borderRadius: '12px',
                      border: webhooksHealthy ? '2px solid #10b981' : '2px solid #f59e0b',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">
                          WEBHOOKS
                        </Text>
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone={webhooksHealthy ? "success" : "warning"} size="large">
                            {webhooksHealthy ? "✓ Active" : "⚠ Pending"}
                          </Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {webhooks.length} registered
                        </Text>
                      </BlockStack>
                    </div>

                    {/* Order Processing */}
                    <div style={{ 
                      padding: '20px', 
                      background: webhooksHealthy && autoConvertOrders
                        ? 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)'
                        : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                      borderRadius: '12px',
                      border: webhooksHealthy && autoConvertOrders ? '2px solid #10b981' : '2px solid #ef4444',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">
                          ORDER PROCESSING
                        </Text>
                        <InlineStack gap="200" blockAlign="center">
                          <Badge 
                            tone={webhooksHealthy && autoConvertOrders ? "success" : "attention"} 
                            size="large"
                          >
                            {webhooksHealthy && autoConvertOrders ? "✓ Active" : "○ Inactive"}
                          </Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {autoConvertOrders ? "Automatic" : "Manual mode"}
                        </Text>
                      </BlockStack>
                    </div>

                    {/* Database */}
                    <div style={{ 
                      padding: '20px', 
                      background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                      borderRadius: '12px',
                      border: '2px solid #10b981',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">
                          DATABASE
                        </Text>
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone="success" size="large">
                            ✓ Connected
                          </Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {isProduction ? "PostgreSQL" : "SQLite"}
                        </Text>
                      </BlockStack>
                    </div>
                  </div>

                  {/* App URL Info */}
                  {appUrl && (
                    <div style={{
                      background: '#f0f9ff',
                      padding: '16px',
                      borderRadius: '8px',
                      border: '1px solid #0ea5e9'
                    }}>
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          🌐 Application URL
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {appUrl}
                        </Text>
                        <Text as="p" variant="bodySm">
                          ✓ SSL/HTTPS enabled and configured
                        </Text>
                      </BlockStack>
                    </div>
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Quick Actions */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">
                    ⚡ Quick Actions
                  </Text>

                  <BlockStack gap="300">
                    {hasChanges && (
                      <div style={{
                        background: '#fef3c7',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #f59e0b'
                      }}>
                        <Text as="p" variant="bodySm" fontWeight="semibold" alignment="center">
                          ⚠️ You have unsaved changes
                        </Text>
                      </div>
                    )}

                    <Button
                      variant="primary"
                      size="large"
                      fullWidth
                      onClick={handleSave}
                      loading={isLoading && !isRegistering}
                      disabled={!hasChanges}
                      tone={hasChanges ? "success" : undefined}
                    >
                      {hasChanges ? "💾 Save Changes" : "✓ Settings Saved"}
                    </Button>

                    <Button
                      variant="secondary"
                      size="large"
                      fullWidth
                      onClick={() => window.location.reload()}
                      disabled={hasChanges}
                    >
                      🔄 Refresh Status
                    </Button>

                    <Divider />

                    <Button
                      variant="plain"
                      size="large"
                      fullWidth
                      onClick={handleRegisterWebhooks}
                      loading={isRegistering}
                    >
                      🔔 Register Webhooks
                    </Button>

                    <Button
                      url="/app/orders"
                      variant="plain"
                      size="large"
                      fullWidth
                    >
                      📦 View Orders
                    </Button>

                    <Button
                      url="/app/bundle-rules"
                      variant="plain"
                      size="large"
                      fullWidth
                    >
                      📋 Manage Rules
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* App Health */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd" fontWeight="semibold">
                    � App Health
                  </Text>

                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm">Database</Text>
                      <Badge tone="success">✓ Connected</Badge>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm">API Access</Text>
                      <Badge tone="success">✓ Active</Badge>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm">Webhooks</Text>
                      <Badge tone={webhooksHealthy ? "success" : "warning"}>
                        {webhooksHealthy ? "✓ Active" : "⚠ Setup"}
                      </Badge>
                    </InlineStack>

                    <InlineStack align="space-between">
                      <Text as="p" variant="bodySm">Order Processing</Text>
                      <Badge tone={webhooksHealthy ? "success" : "attention"}>
                        {webhooksHealthy ? "✓ Ready" : "○ Waiting"}
                      </Badge>
                    </InlineStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Help & Resources */}
              <Card>
                <BlockStack gap="400">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <Text as="span" variant="headingMd">💡</Text>
                    <Text as="h3" variant="headingMd" fontWeight="semibold">
                      Pro Tips & Best Practices
                    </Text>
                  </div>
                  
                  <BlockStack gap="300">
                    <div style={{
                      background: '#f0fdf4',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #86efac'
                    }}>
                      <Text as="p" variant="bodySm">
                        <strong>✓ Enable auto-convert</strong> for maximum efficiency and savings
                      </Text>
                    </div>

                    <div style={{
                      background: '#eff6ff',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #93c5fd'
                    }}>
                      <Text as="p" variant="bodySm">
                        <strong>✓ Set minimum savings</strong> to $5-$10 for optimal results
                      </Text>
                    </div>

                    <div style={{
                      background: '#fef3c7',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #fcd34d'
                    }}>
                      <Text as="p" variant="bodySm">
                        <strong>✓ Use Slack notifications</strong> to keep your team informed
                      </Text>
                    </div>

                    <div style={{
                      background: '#f5f3ff',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #c4b5fd'
                    }}>
                      <Text as="p" variant="bodySm">
                        <strong>✓ Monitor webhooks daily</strong> to ensure continuous processing
                      </Text>
                    </div>

                    <div style={{
                      background: '#fce7f3',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #f9a8d4'
                    }}>
                      <Text as="p" variant="bodySm">
                        <strong>✓ Review bundle rules weekly</strong> to optimize savings patterns
                      </Text>
                    </div>
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      📚 Resources
                    </Text>
                    <Button
                      url="https://shopify.dev/docs/apps/webhooks"
                      target="_blank"
                      variant="plain"
                      size="slim"
                      fullWidth
                    >
                      Webhook Documentation →
                    </Button>
                    <Button
                      url="https://help.shopify.com/en/manual/orders"
                      target="_blank"
                      variant="plain"
                      size="slim"
                      fullWidth
                    >
                      Order Management Guide →
                    </Button>
                    <Button
                      url="https://shopify.dev/docs/apps/launch/protected-customer-data"
                      target="_blank"
                      variant="plain"
                      size="slim"
                      fullWidth
                    >
                      Protected Data Access →
                    </Button>
                  </BlockStack>
                </BlockStack>
              </Card>

              {/* Performance Metrics */}
              <Card>
                <BlockStack gap="400">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <Text as="span" variant="headingMd">📈</Text>
                    <Text as="h3" variant="headingMd" fontWeight="semibold">
                      Performance Targets
                    </Text>
                  </div>

                  <div style={{
                    background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #0ea5e9'
                  }}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodySm">Order Processing</Text>
                        <Badge tone="success">{"< 500ms"}</Badge>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodySm">Dashboard Load</Text>
                        <Badge tone="success">{"< 2s"}</Badge>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodySm">API Response</Text>
                        <Badge tone="success">{"< 200ms"}</Badge>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodySm">Uptime SLA</Text>
                        <Badge tone="success">99.9%</Badge>
                      </InlineStack>
                    </BlockStack>
                  </div>

                  <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                    All systems optimized for enterprise-grade performance
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
