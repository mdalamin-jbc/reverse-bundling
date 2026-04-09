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
  Layout,
  Box,
  Divider,
  Icon,
} from "@shopify/polaris";
import {
  StarFilledIcon,
  CheckCircleIcon,
  OrderIcon,
  CashDollarIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { hasActiveSubscription, redirectToBillingManagement, getSubscriptionByChargeId } from "../billing.server";
import { logInfo, logError } from "../logger.server";
import db from "../db.server";
import { useEffect, useState } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");
  
  const { logInfo, logError } = await import("../logger.server");
  
  try {
    const hasSubscription = await hasActiveSubscription(admin, session.shop);
    
    // Check for specific subscription if charge_id is provided (primary source for plan detection)
    let chargeSubscription = null;
    if (chargeId) {
      chargeSubscription = await getSubscriptionByChargeId(admin, chargeId);
      logInfo("Loaded subscription details", { shop: session.shop, chargeId, hasSubscription: !!chargeSubscription });
    }

    // Always fetch active subscriptions as fallback/secondary source
    let activeSubscription = null;
    try {
      const response = await admin.graphql(
        `#graphql
          query {
            currentAppInstallation {
              activeSubscriptions {
                id
                name
                status
                lineItems {
                  plan {
                    pricingDetails {
                      ... on AppRecurringPricing {
                        price {
                          amount
                          currencyCode
                        }
                        interval
                      }
                    }
                  }
                }
              }
            }
          }`
      );
      const data = await response.json();
      const subscriptions = data.data?.currentAppInstallation?.activeSubscriptions || [];
      // Get the first active paid subscription
      activeSubscription = subscriptions.find((sub: any) => 
        sub.status === 'ACTIVE' && sub.lineItems?.[0]?.plan?.pricingDetails?.price?.amount > 0
      ) || null;
    } catch (error) {
      logError(error as Error, { shop: session.shop, context: "fetching active subscription" });
    }

    // Use charge subscription as primary source, active subscription as fallback
    const subscriptionToUse = chargeSubscription || activeSubscription;

    // Determine plan based on subscription or usage
    let planLimit = 25, planName = "Free", planAmount = 0, planInterval = "EVERY_30_DAYS";
    
    if (subscriptionToUse && subscriptionToUse.status === 'ACTIVE') {
      // Extract plan details from subscription
      const lineItem = subscriptionToUse.lineItems?.[0];
      if (lineItem?.plan?.pricingDetails) {
        const pricing = lineItem.plan.pricingDetails;
        planAmount = pricing.price?.amount || 0;
        planInterval = pricing.interval || "EVERY_30_DAYS";
        
        // Debug logging
        logInfo("Subscription pricing data", { 
          shop: session.shop, 
          subscriptionName: subscriptionToUse.name,
          planAmount,
          planInterval,
          pricingDetails: JSON.stringify(pricing)
        });
        
        // Handle pricing in cents (divide by 100) or direct dollar amounts
        let normalizedAmount = planAmount;
        if (planAmount > 1000) { // Likely in cents
          normalizedAmount = planAmount / 100;
        }
        
        // Map normalized amount to plan details based on interval
        if (planInterval === 'ANNUAL') {
          // For yearly plans, match the yearly amounts
          if (normalizedAmount === 150 || normalizedAmount === 150.00) {
            planName = "Starter";
            planLimit = 125;
          } else if (normalizedAmount === 350 || normalizedAmount === 350.00) {
            planName = "Professional"; 
            planLimit = 525;
          } else if (normalizedAmount === 700 || normalizedAmount === 700.00) {
            planName = "Enterprise";
            planLimit = 999999; // Unlimited
          } else {
            // Fallback: try to match by subscription name for yearly plans
            const subName = subscriptionToUse.name?.toLowerCase() || '';
            if (subName.includes('enterprise')) {
              planName = "Enterprise";
              planLimit = 999999;
              planAmount = 700;
            } else if (subName.includes('professional')) {
              planName = "Professional";
              planLimit = 525;
              planAmount = 350;
            } else if (subName.includes('starter')) {
              planName = "Starter";
              planLimit = 125;
              planAmount = 150;
            }
          }
        } else {
          // For monthly plans, match the monthly amounts
          if (Math.abs(normalizedAmount - 17.99) < 0.1) {
            planName = "Starter";
            planLimit = 125;
          } else if (Math.abs(normalizedAmount - 39.99) < 0.1) {
            planName = "Professional"; 
            planLimit = 525;
          } else if (Math.abs(normalizedAmount - 79.99) < 0.1) {
            planName = "Enterprise";
            planLimit = 999999; // Unlimited
          } else {
            // Fallback: try to match by subscription name for monthly plans
            const subName = subscriptionToUse.name?.toLowerCase() || '';
            if (subName.includes('enterprise')) {
              planName = "Enterprise";
              planLimit = 999999;
              planAmount = 79.99;
            } else if (subName.includes('professional')) {
              planName = "Professional";
              planLimit = 525;
              planAmount = 39.99;
            } else if (subName.includes('starter')) {
              planName = "Starter";
              planLimit = 125;
              planAmount = 17.99;
            }
            
            logInfo("Plan detected by name fallback", { 
              shop: session.shop, 
              subscriptionName: subscriptionToUse.name,
              detectedPlan: planName,
              originalAmount: planAmount,
              normalizedAmount,
              planInterval
            });
          }
        }
      } else {
        // No pricing details available, fallback to subscription name
        const subName = subscriptionToUse.name?.toLowerCase() || '';
        if (subName.includes('enterprise')) {
          planName = "Enterprise";
          planLimit = 999999;
          planAmount = planInterval === "ANNUAL" ? 700 : 79.99;
        } else if (subName.includes('professional')) {
          planName = "Professional";
          planLimit = 525;
          planAmount = planInterval === "ANNUAL" ? 350 : 39.99;
        } else if (subName.includes('starter')) {
          planName = "Starter";
          planLimit = 125;
          planAmount = planInterval === "ANNUAL" ? 150 : 17.99;
        }
        
        logInfo("No pricing details, using name-based detection", { 
          shop: session.shop, 
          subscriptionName: subscriptionToUse.name,
          detectedPlan: planName
        });
      }
    }

    // Get order count for usage tracking - count processed bundle conversions from database
    let orderCount = 0;
    try {
      orderCount = await db.orderConversion.count({
        where: {
          shop: session.shop
        }
      });
    } catch (error) {
      logError(error as Error, { shop: session.shop, context: "fetching order conversion count" });
    }

    // Calculate total savings (simplified - in real app this would be more complex)
    const totalSavings = 0; // Placeholder for now

    logInfo("Billing loader completed", { 
      shop: session.shop, 
      hasSubscription,
      planName,
      planAmount,
      planInterval,
      planLimit,
      orderCount
    });

    return json({
      hasSubscription,
      orderCount,
      planLimit,
      planName,
      planAmount,
      planInterval,
      totalSavings,
      currentSubscription: subscriptionToUse,
      chargeSubscription,
      chargeId
    });
  } catch (error) {
    logError(error as Error, { shop: session.shop, context: "billing loader" });
    return json({
      hasSubscription: false,
      orderCount: 0,
      planLimit: 25,
      planName: "Free",
      planAmount: 0,
      planInterval: "EVERY_30_DAYS",
      totalSavings: 0,
      currentSubscription: null,
      chargeSubscription: null,
      chargeId: null
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
      logInfo("Processing subscription change", { shop: session.shop, plan: planType });
      
      // For managed pricing apps, plan changes go through Shopify admin billing
      const result = await redirectToBillingManagement(session, planType);

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

  return json({ 
    success: false, 
    error: `Unknown action type: ${actionType}` 
  });
};

export default function Billing() {
  const { hasSubscription, orderCount, planLimit, planName, planAmount, planInterval, totalSavings, currentSubscription, chargeSubscription, chargeId } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; error?: string; confirmationUrl?: string; message?: string }>();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>(planInterval === 'ANNUAL' ? 'yearly' : 'monthly');

  // Handle successful subscription changes
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success && fetcher.data?.confirmationUrl) {
      // Open App Store in new tab for subscription management
      window.open(fetcher.data.confirmationUrl, '_blank');
      // Reset loading state
      setLoadingPlan(null);
    }
  }, [fetcher.state, fetcher.data]);

  // Show success message if we have a charge_id (successful subscription)
  useEffect(() => {
    if (chargeId && chargeSubscription) {
      // Could show a success message here
      console.log("Subscription confirmed", { chargeId, planName });
    }
  }, [chargeId, chargeSubscription, planName]);

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

  const usagePercentage = planLimit > 0 ? Math.min((orderCount / planLimit) * 100, 100) : 0;

    // Helper function to get pricing display for a plan
  const getPlanPricing = (monthlyPrice: number) => {
    // Define yearly prices based on the actual App Store pricing
    let yearlyPrice: number;
    let yearlySavings: number;

    // Use precise comparison for pricing lookup
    if (Math.abs(monthlyPrice - 17.99) < 0.1) {
      yearlyPrice = 150;    // Starter: $150/year
      yearlySavings = 65;   // $65 off vs monthly
    } else if (Math.abs(monthlyPrice - 39.99) < 0.1) {
      yearlyPrice = 350;    // Professional: $350/year
      yearlySavings = 129;  // $129 off vs monthly
    } else if (Math.abs(monthlyPrice - 79.99) < 0.1) {
      yearlyPrice = 700;    // Enterprise: $700/year
      yearlySavings = 259;  // $259 off vs monthly
    } else {
      yearlyPrice = monthlyPrice * 12; // Fallback
      yearlySavings = 0;
    }

    if (billingInterval === 'monthly') {
      return {
        primaryPrice: monthlyPrice,
        primaryPeriod: '/ 30 days',
        secondaryText: `$${yearlyPrice}/year ($${yearlySavings} off)`,
        savings: yearlySavings > 0 ? `$${yearlySavings} off` : ''
      };
    } else {
      return {
        primaryPrice: yearlyPrice,
        primaryPeriod: '/ year',
        secondaryText: `$${monthlyPrice}/30 days`,
        savings: yearlySavings > 0 ? `$${yearlySavings} off` : ''
      };
    }
  };

  // Helper function to get button configuration for a plan
  const getPlanButton = (planCardName: string, monthlyPrice?: number) => {
    // Handle Free plan specially
    if (planCardName === 'Free') {
      if (!hasSubscription || planName === 'Free') {
        return {
          text: 'Current Plan',
          variant: 'secondary' as const,
          disabled: true,
          onClick: () => {}
        };
      } else {
        // Has paid subscription, can downgrade to Free
        return {
          text: 'Downgrade to Free',
          variant: 'secondary' as const,
          disabled: false,
          onClick: () => handleSelectPlan('free')
        };
      }
    }

    let cardPlanName: string = planCardName;
    if (monthlyPrice) {
      if (Math.abs(monthlyPrice - 17.99) < 0.1) {
        cardPlanName = 'Starter';
      } else if (Math.abs(monthlyPrice - 39.99) < 0.1) {
        cardPlanName = 'Professional';
      } else if (Math.abs(monthlyPrice - 79.99) < 0.1) {
        cardPlanName = 'Enterprise';
      }
    }
    // If no subscription, show upgrade button
    if (!hasSubscription) {
      return {
        text: `Subscribe to ${cardPlanName}`,
        variant: 'primary' as const,
        disabled: false,
        onClick: () => handleSelectPlan(cardPlanName.toLowerCase())
      };
    }

    // If same plan name but different interval, allow switching
    if (planName === cardPlanName) {
      const currentIsYearly = planInterval === 'ANNUAL';
      const cardIsYearly = billingInterval === 'yearly';

      if (currentIsYearly !== cardIsYearly) {
        const targetInterval = cardIsYearly ? 'yearly' : 'monthly';
        const targetPrice = cardIsYearly ? (monthlyPrice! * 12 * 0.8) : monthlyPrice!; // Approximate yearly discount

        return {
          text: `Switch to ${targetInterval} ($${Math.round(targetPrice)}${cardIsYearly ? '/year' : '/month'})`,
          variant: 'primary' as const,
          disabled: false,
          onClick: () => handleSelectPlan(cardPlanName.toLowerCase())
        };
      } else {
        // Same plan and interval - current plan
        return {
          text: 'Current Plan',
          variant: 'secondary' as const,
          disabled: true,
          onClick: () => {}
        };
      }
    }

    // Different plan - allow upgrade/downgrade
    const planHierarchy = { 'Free': 0, 'Starter': 1, 'Professional': 2, 'Enterprise': 3 };
    const currentLevel = planHierarchy[planName as keyof typeof planHierarchy] || 0;
    const cardLevel = planHierarchy[cardPlanName as keyof typeof planHierarchy] || 0;

    if (cardLevel > currentLevel) {
      return {
        text: `Upgrade to ${cardPlanName}`,
        variant: 'primary' as const,
        disabled: false,
        onClick: () => handleSelectPlan(cardPlanName.toLowerCase())
      };
    } else if (cardLevel < currentLevel) {
      return {
        text: `Downgrade to ${cardPlanName}`,
        variant: 'secondary' as const,
        disabled: false,
        onClick: () => handleSelectPlan(cardPlanName.toLowerCase())
      };
    } else {
      // Same level but different plan (shouldn't happen with current setup)
      return {
        text: `Switch to ${cardPlanName}`,
        variant: 'primary' as const,
        disabled: false,
        onClick: () => handleSelectPlan(cardPlanName.toLowerCase())
      };
    }
  };

  return (
    <Page
      title="Billing & Plans"
      subtitle="Manage your subscription and track usage"
    >
      <TitleBar title="Billing" />

      <BlockStack gap="500">
        {fetcher.data?.message && <Banner tone="info"><p>{fetcher.data.message}</p></Banner>}
        {chargeId && chargeSubscription && <Banner tone="success"><p>Subscription activated successfully. You are now on the {planName} plan.</p></Banner>}

        {/* Current Plan Summary */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                  <Icon source={StarFilledIcon} tone={currentSubscription ? "success" : "info"} />
                </Box>
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd" fontWeight="bold">{planName} Plan</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {planAmount > 0 ? `$${planAmount} / ${planInterval === 'ANNUAL' ? 'year' : 'month'}` : 'No charge'}
                  </Text>
                </BlockStack>
              </InlineStack>
              <Badge tone={currentSubscription ? "success" : "info"} size="large">
                {currentSubscription ? "Active" : "Free Tier"}
              </Badge>
            </InlineStack>

            <Divider />

            <Layout>
              <Layout.Section variant="oneThird">
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                      <Icon source={OrderIcon} tone="subdued" />
                    </Box>
                    <Text as="p" variant="bodySm" tone="subdued">Orders Used</Text>
                  </InlineStack>
                  <Text as="p" variant="headingSm" fontWeight="bold">
                    {orderCount.toLocaleString()} / {planLimit === 999999 ? 'Unlimited' : planLimit.toLocaleString()}
                  </Text>
                </BlockStack>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Box padding="200" borderRadius="300" background="bg-surface-secondary">
                      <Icon source={CashDollarIcon} tone="subdued" />
                    </Box>
                    <Text as="p" variant="bodySm" tone="subdued">Total Savings</Text>
                  </InlineStack>
                  <Text as="p" variant="headingSm" fontWeight="bold">${totalSavings.toLocaleString()}</Text>
                </BlockStack>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">Usage</Text>
                  <Text as="p" variant="headingSm" fontWeight="bold">
                    {planLimit === 999999 ? 'Unlimited' : `${Math.round(usagePercentage)}%`}
                  </Text>
                </BlockStack>
              </Layout.Section>
            </Layout>

            {planLimit > 0 && planLimit < 999999 && (
              <ProgressBar progress={usagePercentage} tone={usagePercentage >= 90 ? "critical" : usagePercentage >= 70 ? "highlight" : "success"} size="small" />
            )}

            {usagePercentage > 90 && planLimit < 999999 && (
              <Banner tone="warning"><p>You're approaching your plan limit. Upgrade to continue processing orders without interruption.</p></Banner>
            )}
          </BlockStack>
        </Card>

        {/* Billing Interval Toggle */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd" fontWeight="semibold">Choose Your Plan</Text>
                <Text as="p" variant="bodySm" tone="subdued">All plans include a 2-day free trial. Cancel anytime.</Text>
              </BlockStack>
              <InlineStack gap="200" blockAlign="center">
                <Button size="slim" variant={billingInterval === 'monthly' ? 'primary' : 'secondary'} onClick={() => setBillingInterval('monthly')}>Monthly</Button>
                <Button size="slim" variant={billingInterval === 'yearly' ? 'primary' : 'secondary'} onClick={() => setBillingInterval('yearly')}>Yearly</Button>
                {billingInterval === 'yearly' && <Badge tone="success">Save up to $259/year</Badge>}
              </InlineStack>
            </InlineStack>

            <Divider />

            {/* Plan Cards - Row 1 */}
            <Layout>
              {/* Free */}
              <Layout.Section variant="oneHalf">
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingMd" fontWeight="bold">Free</Text>
                    <Text as="p" variant="headingLg" fontWeight="bold">$0<Text as="span" variant="bodySm" tone="subdued"> /month</Text></Text>
                    <Divider />
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="subdued" /></Box><Text as="p" variant="bodySm">25 orders/month</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="subdued" /></Box><Text as="p" variant="bodySm">Basic bundling rules</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="subdued" /></Box><Text as="p" variant="bodySm">Tag & note mode</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="subdued" /></Box><Text as="p" variant="bodySm">Email support</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="subdued" /></Box><Text as="p" variant="bodySm">Shopify admin integration</Text></InlineStack>
                    </BlockStack>
                    {(() => {
                      const b = getPlanButton('Free');
                      return <Button variant={b.variant} onClick={b.onClick} disabled={b.disabled || loadingPlan !== null} loading={loadingPlan === 'free'} fullWidth>{b.text}</Button>;
                    })()}
                  </BlockStack>
                </Box>
              </Layout.Section>

              {/* Starter */}
              <Layout.Section variant="oneHalf">
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingMd" fontWeight="bold">Starter</Text>
                    {(() => {
                      const p = getPlanPricing(17.99);
                      return (
                        <BlockStack gap="100">
                          <Text as="p" variant="headingLg" fontWeight="bold">${p.primaryPrice}<Text as="span" variant="bodySm" tone="subdued"> {p.primaryPeriod}</Text></Text>
                          <Text as="p" variant="bodySm" tone="subdued">{p.secondaryText}</Text>
                          {p.savings && <Badge tone="success" size="small">{p.savings}</Badge>}
                        </BlockStack>
                      );
                    })()}
                    <Text as="p" variant="bodySm" tone="subdued">2 trial days remaining</Text>}
                    <Divider />
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box><Text as="p" variant="bodySm">125 orders/month</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box><Text as="p" variant="bodySm">Unlimited rules</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box><Text as="p" variant="bodySm">Real-time analytics</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box><Text as="p" variant="bodySm">Email notifications</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box><Text as="p" variant="bodySm">Bundle analysis AI</Text></InlineStack>
                    </BlockStack>
                    {(() => {
                      const b = getPlanButton('Starter', 17.99);
                      return <Button variant={b.variant} onClick={b.onClick} disabled={b.disabled || loadingPlan !== null} loading={loadingPlan === 'starter'} fullWidth>{b.text}</Button>;
                    })()}
                  </BlockStack>
                </Box>
              </Layout.Section>
            </Layout>

            {/* Plan Cards - Row 2 */}
            <Layout>
              {/* Professional — Highlighted */}
              <Layout.Section variant="oneHalf">
                <Box padding="400" background="bg-surface-info" borderRadius="300" borderWidth="025" borderColor="border-info">
                  <BlockStack gap="300">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h3" variant="headingMd" fontWeight="bold">Professional</Text>
                      <Badge tone="info">Most Popular</Badge>
                    </InlineStack>
                    {(() => {
                      const p = getPlanPricing(39.99);
                      return (
                        <BlockStack gap="100">
                          <Text as="p" variant="headingLg" fontWeight="bold">${p.primaryPrice}<Text as="span" variant="bodySm" tone="subdued"> {p.primaryPeriod}</Text></Text>
                          <Text as="p" variant="bodySm" tone="subdued">{p.secondaryText}</Text>
                          {p.savings && <Badge tone="success" size="small">{p.savings}</Badge>}
                        </BlockStack>
                      );
                    })()}
                    <Text as="p" variant="bodySm" tone="subdued">2 trial days remaining</Text>}
                    <Divider />
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="info" /></Box><Text as="p" variant="bodySm">525 orders/month</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="info" /></Box><Text as="p" variant="bodySm">Advanced analytics</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="info" /></Box><Text as="p" variant="bodySm">Priority support</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="info" /></Box><Text as="p" variant="bodySm">Order edit mode</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="info" /></Box><Text as="p" variant="bodySm">Slack integration</Text></InlineStack>
                    </BlockStack>
                    {(() => {
                      const b = getPlanButton('Professional', 39.99);
                      return <Button variant={b.variant} onClick={b.onClick} disabled={b.disabled || loadingPlan !== null} loading={loadingPlan === 'professional'} fullWidth>{b.text}</Button>;
                    })()}
                  </BlockStack>
                </Box>
              </Layout.Section>

              {/* Enterprise */}
              <Layout.Section variant="oneHalf">
                <Box padding="400" background="bg-surface-secondary" borderRadius="300">
                  <BlockStack gap="300">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h3" variant="headingMd" fontWeight="bold">Enterprise</Text>
                      <Badge tone="attention">Best Value</Badge>
                    </InlineStack>
                    {(() => {
                      const p = getPlanPricing(79.99);
                      return (
                        <BlockStack gap="100">
                          <Text as="p" variant="headingLg" fontWeight="bold">${p.primaryPrice}<Text as="span" variant="bodySm" tone="subdued"> {p.primaryPeriod}</Text></Text>
                          <Text as="p" variant="bodySm" tone="subdued">{p.secondaryText}</Text>
                          {p.savings && <Badge tone="success" size="small">{p.savings}</Badge>}
                        </BlockStack>
                      );
                    })()}
                    <Text as="p" variant="bodySm" tone="subdued">2 trial days remaining</Text>}
                    <Divider />
                    <BlockStack gap="200">
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box><Text as="p" variant="bodySm">Unlimited orders</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box><Text as="p" variant="bodySm">Dedicated support</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box><Text as="p" variant="bodySm">All integrations</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box><Text as="p" variant="bodySm">White-glove onboarding</Text></InlineStack>
                      <InlineStack gap="200" blockAlign="center"><Box padding="200" borderRadius="300" background="bg-surface-secondary"><Icon source={CheckCircleIcon} tone="success" /></Box><Text as="p" variant="bodySm">Custom development</Text></InlineStack>
                    </BlockStack>
                    {(() => {
                      const b = getPlanButton('Enterprise', 79.99);
                      return <Button variant={b.variant} onClick={b.onClick} disabled={b.disabled || loadingPlan !== null} loading={loadingPlan === 'enterprise'} fullWidth>{b.text}</Button>;
                    })()}
                  </BlockStack>
                </Box>
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Card>

        {/* FAQ */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd" fontWeight="semibold">Frequently Asked Questions</Text>
            <Divider />
            <BlockStack gap="200">
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">How does the free trial work?</Text>
                  <Text as="p" variant="bodySm" tone="subdued">You get full access to all features for 2 days. Cancel anytime during the trial at no cost.</Text>
                </BlockStack>
              </Box>
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">Can I change plans anytime?</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Yes, upgrade or downgrade at any time through the Shopify App Store. Plan changes take effect immediately and are prorated.</Text>
                </BlockStack>
              </Box>
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">What happens if I exceed my order limit?</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Order processing pauses until your next billing cycle or until you upgrade. You'll receive a notification at 80% and 90% usage. No orders are lost.</Text>
                </BlockStack>
              </Box>
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">Is there a long-term contract?</Text>
                  <Text as="p" variant="bodySm" tone="subdued">No. All plans are pay-as-you-go with no lock-in. Cancel anytime from your Shopify admin.</Text>
                </BlockStack>
              </Box>
            </BlockStack>
          </BlockStack>
        </Card>

        {/* Cancel */}
        {hasSubscription && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd" fontWeight="semibold">Manage Subscription</Text>
              <Divider />
              {!showCancelConfirm ? (
                <InlineStack gap="200">
                  <Button tone="critical" onClick={() => setShowCancelConfirm(true)}>Cancel Subscription</Button>
                  <Button variant="plain" url="https://help.shopify.com/en/manual/apps/app-billing/managed-pricing#cancel-a-subscription" target="_blank">Learn more about cancellation</Button>
                </InlineStack>
              ) : (
                <BlockStack gap="300">
                  <Banner tone="warning">
                    <p>To cancel your subscription, uninstall the app from Shopify Admin &rarr; Apps. No further charges will be made after uninstalling.</p>
                  </Banner>
                  <InlineStack gap="200">
                    <Button tone="critical" onClick={() => { window.open('https://admin.shopify.com/store/quickstart-9525e261.myshopify.com/apps', '_blank'); setShowCancelConfirm(false); }}>Go to Shopify Apps</Button>
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
