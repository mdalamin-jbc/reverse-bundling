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
import { hasActiveSubscription, requestPayment } from "../billing.server";
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
    const totalSavings = totalOrders * 8;

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
  const { admin, session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action") as string;

  if (actionType === "subscribe") {
    const planType = formData.get("plan") as string;
    try {
      logInfo("Requesting subscription", { shop: session.shop, plan: planType });
      
      // Get the request origin for return URL
      const url = new URL(request.url);
      const origin = url.origin;
      
      const result = await requestPayment(admin, session, billing, planType, origin);
      
      logInfo("Subscription result", { shop: session.shop, result });
      
      if (result.success && result.redirectUrl) {
        logInfo("Redirecting to confirmation URL", { shop: session.shop, url: result.redirectUrl });
        // Return the confirmation URL to the frontend for App Bridge redirect
        return json({ success: true, confirmationUrl: result.redirectUrl });
      }
      
      logError(new Error("Subscription creation failed"), { shop: session.shop, result });
      return json({ success: false, error: result.error || "Failed to create subscription" });
    } catch (error) {
      logError(error as Error, { shop: session.shop, action: "subscribe" });
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

function PricingCard({ 
  title, 
  price, 
  period, 
  description, 
  features, 
  isPopular, 
  buttonLabel, 
  onSelect, 
  isActive,
  loading 
}: {
  title: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  isPopular?: boolean;
  buttonLabel: string;
  onSelect: () => void;
  isActive?: boolean;
  loading?: boolean;
}) {
  const cardStyle: React.CSSProperties = isPopular
    ? {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '32px',
        borderRadius: '16px',
        position: 'relative',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        transform: 'scale(1.05)',
        border: '2px solid rgba(255,255,255,0.2)'
      }
    : {
        background: 'white',
        padding: '32px',
        borderRadius: '16px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      };

  return (
    <div style={cardStyle}>
      {isPopular && (
        <div
          style={{
            position: 'absolute',
            top: '-16px',
            right: '32px',
            background: 'linear-gradient(135deg, #f5576c 0%, #f093fb 100%)',
            color: 'white',
            padding: '8px 20px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            boxShadow: '0 4px 6px rgba(245, 87, 108, 0.3)',
          }}
        >
          ⭐ MOST POPULAR
        </div>
      )}
      
      <BlockStack gap="400">
        <Text as="h3" variant="headingLg" fontWeight="bold">
          {title}
        </Text>
        
        <div>
          <InlineStack align="start" blockAlign="end" gap="200">
            <Text as="span" variant="heading2xl" fontWeight="bold">
              {price}
            </Text>
            <Text as="span" variant="bodyLg" tone={isPopular ? undefined : "subdued"}>
              {period}
            </Text>
          </InlineStack>
        </div>
        
        <Text as="p" variant="bodyMd" tone={isPopular ? undefined : "subdued"}>
          {description}
        </Text>
        
        <div style={{ paddingTop: '12px', borderTop: isPopular ? '1px solid rgba(255,255,255,0.2)' : '1px solid #e5e7eb' }}>
          <BlockStack gap="300">
            {features.map((feature, index) => (
              <InlineStack key={index} gap="200" blockAlign="start">
                <div
                  style={{
                    color: isPopular ? 'white' : '#10b981',
                    flexShrink: 0,
                    marginTop: '2px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                  }}
                >
                  ✓
                </div>
                <Text as="span" variant="bodyMd">
                  {feature}
                </Text>
              </InlineStack>
            ))}
          </BlockStack>
        </div>
        
        <div style={{ paddingTop: '16px' }}>
          <Button
            variant={isPopular ? "primary" : "secondary"}
            size="large"
            onClick={onSelect}
            disabled={isActive}
            loading={loading}
            fullWidth
          >
            {isActive ? "✓ Current Plan" : buttonLabel}
          </Button>
        </div>
      </BlockStack>
    </div>
  );
}

export default function Billing() {
  const { hasSubscription, currentPlan, orderCount, planLimit, planName, totalSavings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; error?: string; confirmationUrl?: string }>();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const showSuccessBanner = fetcher.state === "idle" && fetcher.data?.success === true && !fetcher.data?.confirmationUrl;

  useEffect(() => {
    if (showSuccessBanner) {
      const timer = setTimeout(() => window.location.reload(), 2000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessBanner]);

  // Handle App Bridge redirect for subscription confirmation
  useEffect(() => {
    if (fetcher.data?.confirmationUrl) {
      // Use window.open with _top to break out of iframe
      window.open(fetcher.data.confirmationUrl, '_top');
    }
  }, [fetcher.data?.confirmationUrl]);

  const currentPlanAmount = currentPlan
    ? parseFloat(currentPlan.lineItems?.[0]?.plan?.pricingDetails?.price?.amount || "0")
    : 0;

  const handleSelectPlan = (planType: string) => {
    const formData = new FormData();
    formData.append("action", "subscribe");
    formData.append("plan", planType);
    fetcher.submit(formData, { method: "post" });
  };

  const handleCancelSubscription = () => {
    const formData = new FormData();
    formData.append("action", "cancel");
    fetcher.submit(formData, { method: "post" });
    setShowCancelConfirm(false);
  };

  const usagePercentage = planLimit > 0 ? Math.min((orderCount / planLimit) * 100, 100) : 0;

  return (
    <Page title="Subscription & Billing">
      <TitleBar title="Billing" />
      
      <BlockStack gap="600">
        {/* Success/Error Banners */}
        {showSuccessBanner && (
          <Banner tone="success">
            <p style={{ fontSize: '16px', fontWeight: 500 }}>
              ✓ Subscription updated successfully! Refreshing...
            </p>
          </Banner>
        )}
        
        {fetcher.data?.error && (
          <Banner tone="critical">
            <p style={{ fontSize: '16px', fontWeight: 500 }}>
              ⚠️ {fetcher.data.error}
            </p>
          </Banner>
        )}

        {/* Hero Section */}
        <div
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '64px 48px',
            borderRadius: '20px',
            color: 'white',
            textAlign: 'center',
            boxShadow: '0 20px 25px -5px rgba(102, 126, 234, 0.3)',
          }}
        >
          <BlockStack gap="400">
            <Text as="h1" variant="heading2xl" fontWeight="bold">
              🚀 Unlock the Full Power of Reverse Bundling
            </Text>
            <Text as="p" variant="bodyLg">
              Save thousands on fulfillment costs • Start with 50 FREE orders/month
            </Text>
          </BlockStack>
        </div>

        {/* Current Subscription Stats */}
        {hasSubscription && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  📊 Current Plan
                </Text>
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {planName}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  📦 Orders This Month
                </Text>
                <Text as="p" variant="headingXl" fontWeight="bold">
                  {orderCount.toLocaleString()}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  💰 Total Savings
                </Text>
                <Text as="p" variant="headingXl" fontWeight="bold" tone="success">
                  ${totalSavings.toLocaleString()}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" tone="subdued">
                  ✓ Status
                </Text>
                <Badge tone="success" size="large">
                  Active
                </Badge>
              </BlockStack>
            </Card>
          </div>
        )}

        {/* Usage Progress */}
        {hasSubscription && planLimit > 0 && planLimit < 999999 && (
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h3" variant="headingMd">
                  📈 Monthly Usage
                </Text>
                <Text as="span" variant="bodyMd" fontWeight="bold">
                  {orderCount.toLocaleString()} / {planLimit.toLocaleString()} orders
                </Text>
              </InlineStack>

              <ProgressBar progress={usagePercentage} size="large" />

              {usagePercentage > 90 && (
                <Banner tone="warning">
                  <p>
                    ⚠️ You're approaching your plan limit ({Math.round(usagePercentage)}% used).
                    Consider upgrading to avoid service interruption.
                  </p>
                </Banner>
              )}
            </BlockStack>
          </Card>
        )}

        {/* ROI Section */}
        <div
          style={{
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            padding: '48px',
            borderRadius: '20px',
            color: 'white',
            boxShadow: '0 20px 25px -5px rgba(245, 87, 108, 0.3)',
          }}
        >
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg" fontWeight="bold">
              💎 Calculate Your ROI
            </Text>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '24px',
                marginTop: '16px',
              }}
            >
              {[
                { orders: '100', savings: '$4,000' },
                { orders: '500', savings: '$24,000' },
                { orders: '2,000', savings: '$96,000' },
                { orders: '5,000+', savings: '$192,000+' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    padding: '20px',
                    borderRadius: '12px',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <Text as="p" variant="bodyMd" fontWeight="bold">
                    {item.orders} orders/month
                  </Text>
                  <Text as="p" variant="headingMd" fontWeight="bold">
                    Save: {item.savings}/year
                  </Text>
                </div>
              ))}
            </div>
          </BlockStack>
        </div>

        {/* Pricing Cards */}
        <div>
          <BlockStack gap="400">
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <Text as="h2" variant="heading2xl" fontWeight="bold">
                Choose Your Plan
              </Text>
              <Text as="p" variant="bodyLg" tone="subdued">
                🎁 50 free orders/month • 14-day free trial • No credit card required
              </Text>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '32px',
                alignItems: 'center',
              }}
            >
              <PricingCard
                title="Starter"
                price="$29"
                period="/month"
                description="Perfect for growing stores"
                features={[
                  'Up to 550 bundled orders/month (50 free + 500)',
                  'Unlimited bundle rules',
                  'Real-time analytics dashboard',
                  'Email support',
                  'Basic integrations',
                ]}
                buttonLabel="Start Free Trial"
                onSelect={() => handleSelectPlan('starter')}
                isActive={currentPlanAmount === 29}
                loading={fetcher.state === 'submitting'}
              />

              <PricingCard
                title="Professional"
                price="$79"
                period="/month"
                description="For established businesses"
                features={[
                  'Up to 2,050 bundled orders/month (50 free + 2,000)',
                  'Everything in Starter',
                  'Advanced analytics & insights',
                  'Priority support (24/7)',
                  'API access',
                  'Custom integrations',
                ]}
                isPopular
                buttonLabel="Start Free Trial"
                onSelect={() => handleSelectPlan('professional')}
                isActive={currentPlanAmount === 79}
                loading={fetcher.state === 'submitting'}
              />

              <PricingCard
                title="Enterprise"
                price="$199"
                period="/month"
                description="For high-volume stores"
                features={[
                  'Unlimited orders (50 free + unlimited)',
                  'Everything in Professional',
                  'Dedicated account manager',
                  'Custom development support',
                  'SLA guarantee (99.9%)',
                  'White-label options',
                ]}
                buttonLabel="Start Free Trial"
                onSelect={() => handleSelectPlan('enterprise')}
                isActive={currentPlanAmount === 199}
                loading={fetcher.state === 'submitting'}
              />
            </div>
          </BlockStack>
        </div>

        {/* Social Proof */}
        <div
          style={{
            background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
            padding: '48px',
            borderRadius: '20px',
            textAlign: 'center',
          }}
        >
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg" fontWeight="bold">
              🏆 Trusted by 10,000+ Shopify Merchants
            </Text>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '32px',
                marginTop: '24px',
              }}
            >
              <div>
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  $2.4M+
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Total Savings Generated
                </Text>
              </div>
              <div>
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  50K+
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Orders Processed Daily
                </Text>
              </div>
              <div>
                <Text as="p" variant="heading2xl" fontWeight="bold">
                  4.9/5
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Average Rating
                </Text>
              </div>
            </div>
          </BlockStack>
        </div>

        {/* FAQ */}
        <Card>
          <BlockStack gap="600">
            <Text as="h2" variant="headingLg" fontWeight="bold">
              💬 Frequently Asked Questions
            </Text>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
                gap: '32px',
              }}
            >
              {[
                {
                  q: '💳 How does the 14-day free trial work?',
                  a: 'Start using any plan immediately with full features. You won\'t be charged until after 14 days. Cancel anytime before the trial ends and pay nothing.',
                },
                {
                  q: '🔄 Can I change plans?',
                  a: 'Yes! Upgrade or downgrade at any time. Changes take effect immediately, and we\'ll prorate the difference for you.',
                },
                {
                  q: '📈 What happens if I exceed my order limit?',
                  a: 'We\'ll notify you when you reach 80% of your limit. You can upgrade anytime to continue processing. Orders won\'t be interrupted.',
                },
                {
                  q: '🔒 Is my payment information secure?',
                  a: 'Absolutely. All billing is processed through Shopify\'s secure payment system. We never see or store your payment details.',
                },
                {
                  q: '💰 How much can I actually save?',
                  a: 'On average, merchants save $8-12 per order on fulfillment costs. That\'s $4,000-$24,000/month depending on your plan!',
                },
                {
                  q: '❌ Can I cancel anytime?',
                  a: 'Yes! No long-term contracts. Cancel anytime from this page. You\'ll retain access until the end of your billing period.',
                },
              ].map((faq, idx) => (
                <div key={idx}>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyLg" fontWeight="bold">
                      {faq.q}
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {faq.a}
                    </Text>
                  </BlockStack>
                </div>
              ))}
            </div>
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
                  loading={fetcher.state === 'submitting'}
                >
                  Cancel Subscription
                </Button>
              ) : (
                <BlockStack gap="400">
                  <Banner tone="warning">
                    <p>
                      ⚠️ Are you sure you want to cancel your subscription? You'll lose access to
                      all premium features.
                    </p>
                  </Banner>
                  <InlineStack gap="300">
                    <Button
                      variant="primary"
                      tone="critical"
                      onClick={handleCancelSubscription}
                      loading={fetcher.state === 'submitting'}
                    >
                      Yes, Cancel Subscription
                    </Button>
                    <Button onClick={() => setShowCancelConfirm(false)}>Keep Subscription</Button>
                  </InlineStack>
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
