import { useLoaderData, useFetcher } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  ProgressBar,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { hasActiveSubscription, redirectToAppStore, getCurrentPlan } from "../billing.server";
import { logInfo, logError } from "../logger.server";
import db from "../db.server";
import { useEffect, useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    const hasSubscription = await hasActiveSubscription(admin, session.shop);
    
    // For managed pricing apps, we can't get detailed subscription info
    const currentPlan = await getCurrentPlan(admin);

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const orderCount = await db.orderConversion.count({
      where: { shop: session.shop, convertedAt: { gte: firstDayOfMonth }}
    });
    const totalOrders = await db.orderConversion.count({ 
      where: { shop: session.shop }
    });
    const totalSavingsResult = await db.orderConversion.aggregate({
      where: { shop: session.shop },
      _sum: { savingsAmount: true }
    });
    const totalSavings = totalSavingsResult._sum.savingsAmount || 0;

    let planLimit = 50, planName = "Free"; // Everyone gets 50 free orders
    // For managed pricing apps, we determine plan based on usage patterns or stored data
    // For now, we show Free plan as default since we can't query subscription details
    // In production, you might store plan information in your database

    return json({ 
      hasSubscription, 
      currentPlan, 
      orderCount, 
      planLimit, 
      planName, 
      totalSavings,
      totalOrders 
    });
  } catch (error) {
    logError(error as Error, { shop: session.shop });
    return json({ 
      hasSubscription: false, 
      currentPlan: null, 
      orderCount: 0, 
      planLimit: 0, 
      planName: "Free", 
      totalSavings: 0,
      totalOrders: 0
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action") as string;

  if (actionType === "subscribe") {
    const planType = formData.get("plan") as string;
    try {
      logInfo("Redirecting to App Store for subscription", { shop: session.shop, plan: planType });

      // For managed pricing apps, all billing is handled through the App Store
      const result = await redirectToAppStore(planType);

      return json({
        success: true,
        confirmationUrl: result.redirectUrl,
        message: result.message
      });
    } catch (error) {
      logError(error as Error, { shop: session.shop, action: "subscribe", plan: planType });
      return json({ 
        success: false, 
        error: `Failed to process subscription request: ${(error as Error).message}` 
      });
    }
  }

  if (actionType === "cancel") {
    try {
      logInfo("Redirecting to App Store for cancellation", { shop: session.shop });

      // For managed pricing apps, cancellation is handled through the App Store
      const result = await redirectToAppStore();

      return json({
        success: true,
        confirmationUrl: result.redirectUrl,
        message: "Redirecting to Shopify App Store to manage your subscription..."
      });
    } catch (error) {
      logError(error as Error, { shop: session.shop });
      return json({ 
        success: false, 
        error: `Failed to process cancellation request: ${(error as Error).message}` 
      });
    }
  }

  return json({ success: false, error: "Invalid action" });
};

export default function Billing() {
  const { hasSubscription, orderCount, planLimit, planName, totalSavings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; error?: string; confirmationUrl?: string; message?: string }>();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  // Handle successful subscription changes
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success && fetcher.data?.confirmationUrl) {
      // Open App Store in new tab for subscription management
      window.open(fetcher.data.confirmationUrl, '_blank');
      // Reset loading state
      setLoadingPlan(null);
    }
  }, [fetcher.state, fetcher.data]);

  // Reset loading state on completion or error
  useEffect(() => {
    if (fetcher.state === 'idle' || fetcher.data?.error) {
      setLoadingPlan(null);
    }
  }, [fetcher.state, fetcher.data]);

  const handleSelectPlan = (planType: string) => {
    // Prevent multiple simultaneous requests
    if (loadingPlan !== null || fetcher.state !== 'idle') return;
    
    setLoadingPlan(planType);
    const formData = new FormData();
    formData.append("action", "subscribe");
    formData.append("plan", planType);
    fetcher.submit(formData, { method: "post" });
  };

  const handleCancelSubscription = () => {
    if (loadingPlan !== null || fetcher.state !== 'idle') return;
    
    setLoadingPlan('cancel');
    const formData = new FormData();
    formData.append("action", "cancel");
    fetcher.submit(formData, { method: "post" });
    setShowCancelConfirm(false);
  };

  const usagePercentage = planLimit > 0 ? Math.min((orderCount / planLimit) * 100, 100) : 0;

  return (
    <Page title="Subscription & Billing">
      <TitleBar title="Billing" />

      <BlockStack gap="500">
        {/* Success/Error Banners */}
        {fetcher.data?.message && (
          <Banner tone="info">
            <p>{fetcher.data.message}</p>
          </Banner>
        )}

        {fetcher.data?.error && (
          <Banner tone="critical">
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                Subscription Error
              </Text>
              <Text as="p" variant="bodyMd">
                {fetcher.data.error}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                If this error persists, please contact support or try again later.
              </Text>
            </BlockStack>
          </Banner>
        )}

        {/* Loading state banner */}
        {loadingPlan !== null && (
          <Banner tone="info">
            <p>Processing subscription change... Please wait.</p>
          </Banner>
        )}

        {/* Current Plan Status */}
        {hasSubscription && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Current Plan: {planName}
              </Text>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Monthly Orders
                  </Text>
                  <Text as="p" variant="headingMd" fontWeight="bold">
                    {orderCount.toLocaleString()} / {planLimit === 999999 ? 'Unlimited' : planLimit.toLocaleString()}
                  </Text>
                </div>

                <div>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Total Savings
                  </Text>
                  <Text as="p" variant="headingMd" fontWeight="bold" tone="success">
                    ${totalSavings.toLocaleString()}
                  </Text>
                </div>

                <div>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Status
                  </Text>
                  <Badge tone="success">Active</Badge>
                </div>
              </div>

              {/* Usage Progress */}
              {planLimit > 0 && planLimit < 999999 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <Text as="p" variant="bodySm">
                      Monthly usage: {Math.round(usagePercentage)}%
                    </Text>
                    <Text as="p" variant="bodySm">
                      {orderCount} / {planLimit} orders
                    </Text>
                  </div>
                  <ProgressBar progress={usagePercentage} />

                  {usagePercentage > 90 && (
                    <Banner tone="warning" title="Usage Alert">
                      <p>
                        You're approaching your monthly limit. Consider upgrading to ensure uninterrupted service.
                      </p>
                    </Banner>
                  )}
                </div>
              )}
            </BlockStack>
          </Card>
        )}

        {/* Pricing Plans */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Choose Your Plan
            </Text>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {/* Free Plan */}
              <Card>
                <BlockStack gap="300">
                  <div>
                    <Text as="h3" variant="headingMd" fontWeight="bold">
                      Free
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Get started with basic features
                    </Text>
                  </div>

                  <div>
                    <Text as="span" variant="heading2xl" fontWeight="bold">
                      $0
                    </Text>
                    <Text as="span" variant="bodyMd" tone="subdued">
                      /month
                    </Text>
                  </div>

                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">• 50 orders per month</Text>
                    <Text as="p" variant="bodySm">• Basic bundling rules</Text>
                    <Text as="p" variant="bodySm">• Email support</Text>
                  </BlockStack>

                  {!hasSubscription && (
                    <Button variant="secondary" disabled fullWidth>
                      Current Plan
                    </Button>
                  )}
                </BlockStack>
              </Card>

              {/* Starter Plan */}
              <Card>
                <BlockStack gap="300">
                  <div>
                    <Text as="h3" variant="headingMd" fontWeight="bold">
                      Starter
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Perfect for growing stores
                    </Text>
                  </div>

                  <div>
                    <Text as="span" variant="heading2xl" fontWeight="bold">
                      $29
                    </Text>
                    <Text as="span" variant="bodyMd" tone="subdued">
                      /month
                    </Text>
                  </div>

                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">• 550 orders per month</Text>
                    <Text as="p" variant="bodySm">• Unlimited bundle rules</Text>
                    <Text as="p" variant="bodySm">• Real-time analytics</Text>
                    <Text as="p" variant="bodySm">• Email support</Text>
                  </BlockStack>

                  <Button
                    variant="primary"
                    onClick={() => handleSelectPlan('starter')}
                    loading={loadingPlan === 'starter'}
                    disabled={loadingPlan !== null}
                    fullWidth
                  >
                    Upgrade to Starter
                  </Button>
                </BlockStack>
              </Card>

              {/* Professional Plan */}
              <Card>
                <BlockStack gap="300">
                  <div>
                    <Text as="h3" variant="headingMd" fontWeight="bold">
                      Professional
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      For established businesses
                    </Text>
                  </div>

                  <div>
                    <Text as="span" variant="heading2xl" fontWeight="bold">
                      $79
                    </Text>
                    <Text as="span" variant="bodyMd" tone="subdued">
                      /month
                    </Text>
                  </div>

                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">• 2,050 orders per month</Text>
                    <Text as="p" variant="bodySm">• Advanced analytics</Text>
                    <Text as="p" variant="bodySm">• Priority support</Text>
                    <Text as="p" variant="bodySm">• API access</Text>
                  </BlockStack>

                  <Button
                    variant="primary"
                    onClick={() => handleSelectPlan('professional')}
                    loading={loadingPlan === 'professional'}
                    disabled={loadingPlan !== null}
                    fullWidth
                  >
                    Upgrade to Professional
                  </Button>
                </BlockStack>
              </Card>

              {/* Enterprise Plan */}
              <Card>
                <BlockStack gap="300">
                  <div>
                    <Text as="h3" variant="headingMd" fontWeight="bold">
                      Enterprise
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      For high-volume stores
                    </Text>
                  </div>

                  <div>
                    <Text as="span" variant="heading2xl" fontWeight="bold">
                      $199
                    </Text>
                    <Text as="span" variant="bodyMd" tone="subdued">
                      /month
                    </Text>
                  </div>

                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">• Unlimited orders</Text>
                    <Text as="p" variant="bodySm">• Dedicated account manager</Text>
                    <Text as="p" variant="bodySm">• Custom development</Text>
                    <Text as="p" variant="bodySm">• 24/7 phone support</Text>
                  </BlockStack>

                  <Button
                    variant="primary"
                    onClick={() => handleSelectPlan('enterprise')}
                    loading={loadingPlan === 'enterprise'}
                    disabled={loadingPlan !== null}
                    fullWidth
                  >
                    Upgrade to Enterprise
                  </Button>
                </BlockStack>
              </Card>
            </div>

            <Text as="p" variant="bodySm" tone="subdued">
              All plans include a 14-day free trial. No credit card required to start.
            </Text>
          </BlockStack>
        </Card>

        {/* FAQ */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Frequently Asked Questions
            </Text>

            <BlockStack gap="300">
              <div>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  How does the free trial work?
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Install the app from the Shopify App Store to start your 14-day free trial. You'll get full access to all features with no credit card required.
                </Text>
              </div>

              <div>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  Can I change plans anytime?
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Yes! You can upgrade or downgrade your plan anytime through the Shopify App Store. Changes take effect immediately.
                </Text>
              </div>

              <div>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  What happens if I exceed my order limit?
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  We'll notify you when you reach 80% of your limit. You can upgrade your plan instantly through the App Store. Orders won't be interrupted.
                </Text>
              </div>

              <div>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  How do I cancel my subscription?
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  You can uninstall the app anytime from your Shopify admin. Your subscription will be cancelled immediately with no further charges.
                </Text>
              </div>
            </BlockStack>
          </BlockStack>
        </Card>

        {/* Cancel Subscription */}
        {hasSubscription && (
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                Subscription Management
              </Text>

              {!showCancelConfirm ? (
                <Button
                  variant="plain"
                  tone="critical"
                  onClick={() => setShowCancelConfirm(true)}
                  loading={loadingPlan === 'cancel'}
                >
                  Cancel Subscription
                </Button>
              ) : showCancelConfirm ? (
                <BlockStack gap="400">
                  <Banner tone="warning">
                    <p>
                      Are you sure you want to cancel your subscription? You'll lose access to
                      all premium features.
                    </p>
                  </Banner>
                  <InlineStack gap="300">
                    <Button
                      variant="primary"
                      tone="critical"
                      onClick={handleCancelSubscription}
                      loading={loadingPlan === 'cancel'}
                    >
                      Yes, Cancel Subscription
                    </Button>
                    <Button onClick={() => setShowCancelConfirm(false)}>Keep Subscription</Button>
                  </InlineStack>
                </BlockStack>
              ) : null}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
