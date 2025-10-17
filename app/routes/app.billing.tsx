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
import { hasActiveSubscription } from "../billing.server";
import { logInfo, logError } from "../logger.server";
import db from "../db.server";
import { useEffect, useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    const hasSubscription = await hasActiveSubscription(admin, session.shop);
    
    let currentPlan = null;
    if (hasSubscription) {
      const response = await admin.graphql(`#graphql
        query {
          currentAppInstallation {
            activeSubscriptions {
              id name status test createdAt
              lineItems {
                plan {
                  pricingDetails {
                    ... on AppRecurringPricing {
                      price { amount currencyCode }
                      interval
                    }
                  }
                }
              }
            }
          }
        }`);
      const data = await response.json();
      const subscriptions = data.data?.currentAppInstallation?.activeSubscriptions || [];
      if (subscriptions.length > 0) currentPlan = subscriptions[0];
    }

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
    if (currentPlan) {
      const amount = parseFloat(currentPlan.lineItems?.[0]?.plan?.pricingDetails?.price?.amount || "0");
      if (amount === 29) { planLimit = 550; planName = "Starter"; } // 50 free + 500 paid
      else if (amount === 79) { planLimit = 2050; planName = "Professional"; } // 50 free + 2000 paid
      else if (amount === 199) { planLimit = 999999; planName = "Enterprise"; }
    }

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
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action") as string;

  if (actionType === "subscribe") {
    const planType = formData.get("plan") as string;
    try {
      logInfo("Processing subscription request", { shop: session.shop, plan: planType });

      // Check if there's already an active subscription
      const subscriptionResponse = await admin.graphql(`#graphql
        query {
          currentAppInstallation {
            activeSubscriptions {
              id name status
              lineItems {
                plan {
                  pricingDetails {
                    ... on AppRecurringPricing {
                      price { amount currencyCode }
                      interval
                    }
                  }
                }
              }
            }
          }
        }`);

      const subscriptionData = await subscriptionResponse.json();
      const activeSubscriptions = subscriptionData.data?.currentAppInstallation?.activeSubscriptions || [];

      // Determine plan pricing
      const planPrices = {
        starter: 29,
        professional: 79,
        enterprise: 199
      };

      const targetPrice = planPrices[planType as keyof typeof planPrices];
      if (!targetPrice) {
        return json({ success: false, error: "Invalid plan selected" });
      }

      if (activeSubscriptions.length > 0) {
        // Existing subscription - handle upgrade/downgrade
        const currentSubscription = activeSubscriptions[0];
        const currentPrice = parseFloat(currentSubscription.lineItems?.[0]?.plan?.pricingDetails?.price?.amount || "0");

        if (currentPrice === targetPrice) {
          return json({ success: false, error: "You are already on this plan" });
        }

        // For plan changes, redirect to App Store with plan-specific URL
        // Shopify doesn't allow direct plan changes via API for App Store apps
        const appStoreUrl = `https://apps.shopify.com/reverse-bundle-pro`;

        logInfo("Redirecting to App Store for plan change", {
          shop: session.shop,
          fromPlan: currentPrice,
          toPlan: targetPrice,
          url: appStoreUrl
        });

        return json({
          success: true,
          confirmationUrl: appStoreUrl,
          message: `Redirecting to Shopify App Store to ${currentPrice < targetPrice ? 'upgrade' : 'downgrade'} your plan...`
        });

      } else {
        // No active subscription - new subscription
        const appStoreUrl = `https://apps.shopify.com/reverse-bundle-pro`;

        logInfo("Redirecting to App Store for new subscription", {
          shop: session.shop,
          plan: planType,
          url: appStoreUrl
        });

        return json({
          success: true,
          confirmationUrl: appStoreUrl,
          message: "Redirecting to Shopify App Store to start your subscription..."
        });
      }
    } catch (error) {
      logError(error as Error, { shop: session.shop, action: "subscribe", plan: planType });
      return json({ success: false, error: (error as Error).message });
    }
  }

  if (actionType === "cancel") {
    try {
      const response = await admin.graphql(`#graphql
        query { currentAppInstallation { activeSubscriptions { id }}}`);
      const data = await response.json();
      const subscriptions = data.data?.currentAppInstallation?.activeSubscriptions || [];
      
      if (subscriptions.length > 0) {
        const cancelResponse = await admin.graphql(`#graphql
          mutation appSubscriptionCancel($id: ID!) {
            appSubscriptionCancel(id: $id) {
              appSubscription { id status }
              userErrors { field message }
            }
          }`, { variables: { id: subscriptions[0].id }});
        
        const cancelData = await cancelResponse.json();
        const userErrors = cancelData.data?.appSubscriptionCancel?.userErrors || [];
        if (userErrors.length > 0) {
          return json({ success: false, error: userErrors[0].message });
        }
        
        logInfo("Subscription cancelled", { shop: session.shop });
        return json({ success: true });
      }
      return json({ success: false, error: "No active subscription found" });
    } catch (error) {
      logError(error as Error, { shop: session.shop });
      return json({ success: false, error: (error as Error).message });
    }
  }

  return json({ success: false, error: "Invalid action" });
};

export default function Billing() {
  const { hasSubscription, currentPlan, orderCount, planLimit, planName, totalSavings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; error?: string; confirmationUrl?: string; message?: string }>();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  // Suppress hydration warnings for this component
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const showSuccessBanner = fetcher.state === "idle" && fetcher.data?.success === true && !fetcher.data?.confirmationUrl;

  useEffect(() => {
    if (isClient && showSuccessBanner) {
      const timer = setTimeout(() => window.location.reload(), 2000);
      return () => clearTimeout(timer);
    }
  }, [isClient, showSuccessBanner]);

  // Reset loading state when fetcher is done or encounters an error
  useEffect(() => {
    if (fetcher.state === 'idle' || fetcher.data?.error) {
      setLoadingPlan(null);
    }
  }, [fetcher.state, fetcher.data]);

  // Handle App Store redirect - only on client side
  useEffect(() => {
    if (isClient && fetcher.data?.confirmationUrl) {
      // For App Store billing, open the App Store URL in a new tab/window
      window.open(fetcher.data.confirmationUrl, '_blank');
      // Reset loading state immediately after opening the App Store
      setLoadingPlan(null);
    }
  }, [isClient, fetcher.data?.confirmationUrl]);

  const currentPlanAmount = currentPlan
    ? parseFloat(currentPlan.lineItems?.[0]?.plan?.pricingDetails?.price?.amount || "0")
    : 0;

  const handleSelectPlan = (planType: string) => {
    // Prevent multiple simultaneous requests for the same plan
    if (loadingPlan !== null) return;
    
    setLoadingPlan(planType);
    const formData = new FormData();
    formData.append("action", "subscribe");
    formData.append("plan", planType);
    formData.append("timestamp", Date.now().toString()); // Make each request unique
    fetcher.submit(formData, { method: "post" });

    // Fallback: Reset loading state after 10 seconds in case something goes wrong
    setTimeout(() => {
      setLoadingPlan(null);
    }, 10000);
  };

  const handleCancelSubscription = () => {
    if (loadingPlan !== null) return;
    
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
        {/* Success/Error Banners - only show on client to prevent hydration mismatches */}
        {isClient && showSuccessBanner && (
          <Banner tone="success">
            <p>Subscription updated successfully! Refreshing...</p>
          </Banner>
        )}

        {isClient && fetcher.data?.message && (
          <Banner tone="info">
            <p>{fetcher.data.message}</p>
          </Banner>
        )}

        {isClient && fetcher.data?.error && (
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

        {/* Loading state banner - only show on client */}
        {isClient && loadingPlan !== null && (
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
                    disabled={currentPlanAmount === 29}
                    loading={loadingPlan === 'starter'}
                    fullWidth
                  >
                    {currentPlanAmount === 29 ? 'Current Plan' : 'Upgrade to Starter'}
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
                    disabled={currentPlanAmount === 79}
                    loading={loadingPlan === 'professional'}
                    fullWidth
                  >
                    {currentPlanAmount === 79 ? 'Current Plan' : 'Upgrade to Professional'}
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
                    disabled={currentPlanAmount === 199}
                    loading={loadingPlan === 'enterprise'}
                    fullWidth
                  >
                    {currentPlanAmount === 199 ? 'Current Plan' : 'Upgrade to Enterprise'}
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

              {isClient && !showCancelConfirm ? (
                <Button
                  variant="plain"
                  tone="critical"
                  onClick={() => setShowCancelConfirm(true)}
                  loading={loadingPlan === 'cancel'}
                >
                  Cancel Subscription
                </Button>
              ) : isClient && showCancelConfirm ? (
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
