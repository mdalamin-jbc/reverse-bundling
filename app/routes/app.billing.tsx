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
    let planLimit = 50, planName = "Free", planAmount = 0, planInterval = "EVERY_30_DAYS";
    
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
          if (normalizedAmount === 200 || normalizedAmount === 200.00) {
            planName = "Starter";
            planLimit = 550;
          } else if (normalizedAmount === 500 || normalizedAmount === 500.00) {
            planName = "Professional"; 
            planLimit = 2050;
          } else if (normalizedAmount === 1000 || normalizedAmount === 1000.00) {
            planName = "Enterprise";
            planLimit = 999999; // Unlimited
          } else {
            // Fallback: try to match by subscription name for yearly plans
            const subName = subscriptionToUse.name?.toLowerCase() || '';
            if (subName.includes('enterprise')) {
              planName = "Enterprise";
              planLimit = 999999;
              planAmount = 1000;
            } else if (subName.includes('professional')) {
              planName = "Professional";
              planLimit = 2050;
              planAmount = 500;
            } else if (subName.includes('starter')) {
              planName = "Starter";
              planLimit = 550;
              planAmount = 200;
            }
          }
        } else {
          // For monthly plans, match the monthly amounts
          if (normalizedAmount === 29 || normalizedAmount === 29.00) {
            planName = "Starter";
            planLimit = 550;
          } else if (normalizedAmount === 79 || normalizedAmount === 79.00) {
            planName = "Professional"; 
            planLimit = 2050;
          } else if (normalizedAmount === 199 || normalizedAmount === 199.00) {
            planName = "Enterprise";
            planLimit = 999999; // Unlimited
          } else {
            // Fallback: try to match by subscription name for monthly plans
            const subName = subscriptionToUse.name?.toLowerCase() || '';
            if (subName.includes('enterprise')) {
              planName = "Enterprise";
              planLimit = 999999;
              planAmount = 199;
            } else if (subName.includes('professional')) {
              planName = "Professional";
              planLimit = 2050;
              planAmount = 79;
            } else if (subName.includes('starter')) {
              planName = "Starter";
              planLimit = 550;
              planAmount = 29;
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
          planAmount = planInterval === "ANNUAL" ? 1000 : 199;
        } else if (subName.includes('professional')) {
          planName = "Professional";
          planLimit = 2050;
          planAmount = planInterval === "ANNUAL" ? 500 : 79;
        } else if (subName.includes('starter')) {
          planName = "Starter";
          planLimit = 550;
          planAmount = planInterval === "ANNUAL" ? 200 : 29;
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
      planLimit: 50,
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
    // Define yearly prices based on the discounted rates from Shopify
    const yearlyPrices: { [key: number]: number } = {
      29: 200,   // Starter: $200/year instead of $348
      79: 500,   // Professional: $500/year instead of $948
      199: 1000  // Enterprise: $1000/year instead of $2388
    };

    const yearlyPrice = yearlyPrices[monthlyPrice] || (monthlyPrice * 12);
    const savings = (monthlyPrice * 12) - yearlyPrice;

    if (billingInterval === 'monthly') {
      return {
        primaryPrice: monthlyPrice,
        primaryPeriod: '/month',
        secondaryPrice: yearlyPrice,
        secondaryPeriod: '/year',
        savings: savings > 0 ? `$${savings} off` : null
      };
    } else {
      return {
        primaryPrice: yearlyPrice,
        primaryPeriod: '/year',
        secondaryPrice: monthlyPrice,
        secondaryPeriod: '/month',
        savings: savings > 0 ? `$${savings} off` : null
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

    const planNames = { 29: 'Starter', 79: 'Professional', 199: 'Enterprise' };
    const cardPlanName = planNames[monthlyPrice as keyof typeof planNames] || planCardName;
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
    <Page title="Subscription & Billing">
      <TitleBar title="Billing" />

      <BlockStack gap="500">
        {/* Success/Error Banners */}
        {fetcher.data?.message && (
          <Banner tone="info">
            <p>{fetcher.data.message}</p>
          </Banner>
        )}

        {chargeId && chargeSubscription && (
          <Banner tone="success">
            <p>🎉 Subscription successfully activated! You now have access to the {planName} plan.</p>
          </Banner>
        )}

        {/* Loading state banner */}
        {loadingPlan !== null && (
          <Banner tone="info">
            <p>Processing subscription change... Please wait.</p>
          </Banner>
        )}

        {/* Current Plan Status */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Current Plan: {planName} {planAmount > 0 && `($${planAmount}${planInterval === 'ANNUAL' ? '/year' : '/month'})`}
            </Text>

            {currentSubscription && (
              <Banner tone="success">
                <p>✅ Subscription Active - {currentSubscription.name || planName}</p>
              </Banner>
            )}

            {!hasSubscription && (
              <Banner tone="info">
                <p>🆓 You're currently on the Free plan with basic features.</p>
              </Banner>
            )}

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
                <Badge tone={currentSubscription ? "success" : "info"}>
                  {currentSubscription ? "Active Subscription" : "Free Plan"}
                </Badge>
              </div>
            </div>

            {/* Usage Progress - only show for limited plans */}
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

            {/* Over-limit warning for Free plan */}
            {!hasSubscription && orderCount >= 45 && (
              <Banner tone="warning" title="Free Plan Limit Warning">
                <p>
                  You've processed {orderCount} orders this month. The Free plan limit is 50 orders.
                  Consider upgrading to avoid service interruption.
                </p>
              </Banner>
            )}
          </BlockStack>
        </Card>

        {/* Pricing Plans */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Choose Your Plan
            </Text>

            {/* Billing Interval Toggle */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{ 
                display: 'inline-flex', 
                border: '1px solid #d1d5db', 
                borderRadius: '6px',
                overflow: 'hidden'
              }}>
                <Button
                  variant={billingInterval === 'monthly' ? 'primary' : 'tertiary'}
                  onClick={() => setBillingInterval('monthly')}
                  size="slim"
                >
                  Pay monthly
                </Button>
                <Button
                  variant={billingInterval === 'yearly' ? 'primary' : 'tertiary'}
                  onClick={() => setBillingInterval('yearly')}
                  size="slim"
                >
                  Pay yearly
                </Button>
              </div>
            </div>

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

                  {(() => {
                    const buttonConfig = getPlanButton('Free');
                    return (
                      <Button
                        variant={buttonConfig.variant}
                        onClick={buttonConfig.onClick}
                        loading={loadingPlan === 'free'}
                        disabled={buttonConfig.disabled || loadingPlan !== null}
                        fullWidth
                      >
                        {buttonConfig.text}
                      </Button>
                    );
                  })()}
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

                  {(() => {
                    const pricing = getPlanPricing(29);
                    return (
                      <div>
                        <div style={{ marginBottom: '4px' }}>
                          <Text as="span" variant="heading2xl" fontWeight="bold">
                            ${pricing.primaryPrice.toLocaleString()}
                          </Text>
                          <Text as="span" variant="bodyMd" tone="subdued">
                            {pricing.primaryPeriod}
                          </Text>
                          {pricing.savings && (
                            <span style={{ marginLeft: '8px', color: '#007f5f', fontSize: '14px' }}>
                              ({pricing.savings})
                            </span>
                          )}
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">
                          ${pricing.secondaryPrice}{pricing.secondaryPeriod}{pricing.savings ? ` (${pricing.savings})` : ''}
                        </Text>
                      </div>
                    );
                  })()}

                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">• 550 orders per month</Text>
                    <Text as="p" variant="bodySm">• Unlimited bundle rules</Text>
                    <Text as="p" variant="bodySm">• Real-time analytics</Text>
                    <Text as="p" variant="bodySm">• Email support</Text>
                  </BlockStack>

                  {(() => {
                    const buttonConfig = getPlanButton('Starter', 29);
                    return (
                      <Button
                        variant={buttonConfig.variant}
                        onClick={buttonConfig.onClick}
                        loading={loadingPlan === 'starter'}
                        disabled={buttonConfig.disabled || loadingPlan !== null}
                        fullWidth
                      >
                        {buttonConfig.text}
                      </Button>
                    );
                  })()}
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

                  {(() => {
                    const pricing = getPlanPricing(79);
                    return (
                      <div>
                        <div style={{ marginBottom: '4px' }}>
                          <Text as="span" variant="heading2xl" fontWeight="bold">
                            ${pricing.primaryPrice.toLocaleString()}
                          </Text>
                          <Text as="span" variant="bodyMd" tone="subdued">
                            {pricing.primaryPeriod}
                          </Text>
                          {pricing.savings && (
                            <span style={{ marginLeft: '8px', color: '#007f5f', fontSize: '14px' }}>
                              ({pricing.savings})
                            </span>
                          )}
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">
                          ${pricing.secondaryPrice}{pricing.secondaryPeriod}{pricing.savings ? ` (${pricing.savings})` : ''}
                        </Text>
                      </div>
                    );
                  })()}

                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">• 2,050 orders per month</Text>
                    <Text as="p" variant="bodySm">• Advanced analytics</Text>
                    <Text as="p" variant="bodySm">• Priority support</Text>
                    <Text as="p" variant="bodySm">• API access</Text>
                  </BlockStack>

                  {(() => {
                    const buttonConfig = getPlanButton('Professional', 79);
                    return (
                      <Button
                        variant={buttonConfig.variant}
                        onClick={buttonConfig.onClick}
                        loading={loadingPlan === 'professional'}
                        disabled={buttonConfig.disabled || loadingPlan !== null}
                        fullWidth
                      >
                        {buttonConfig.text}
                      </Button>
                    );
                  })()}
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

                  {(() => {
                    const pricing = getPlanPricing(199);
                    return (
                      <div>
                        <div style={{ marginBottom: '4px' }}>
                          <Text as="span" variant="heading2xl" fontWeight="bold">
                            ${pricing.primaryPrice.toLocaleString()}
                          </Text>
                          <Text as="span" variant="bodyMd" tone="subdued">
                            {pricing.primaryPeriod}
                          </Text>
                          {pricing.savings && (
                            <span style={{ marginLeft: '8px', color: '#007f5f', fontSize: '14px' }}>
                              ({pricing.savings})
                            </span>
                          )}
                        </div>
                        <Text as="p" variant="bodySm" tone="subdued">
                          ${pricing.secondaryPrice}{pricing.secondaryPeriod}{pricing.savings ? ` (${pricing.savings})` : ''}
                        </Text>
                      </div>
                    );
                  })()}

                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">• Unlimited orders</Text>
                    <Text as="p" variant="bodySm">• Dedicated account manager</Text>
                    <Text as="p" variant="bodySm">• Custom development</Text>
                    <Text as="p" variant="bodySm">• 24/7 phone support</Text>
                  </BlockStack>

                  {(() => {
                    const buttonConfig = getPlanButton('Enterprise', 199);
                    return (
                      <Button
                        variant={buttonConfig.variant}
                        onClick={buttonConfig.onClick}
                        loading={loadingPlan === 'enterprise'}
                        disabled={buttonConfig.disabled || loadingPlan !== null}
                        fullWidth
                      >
                        {buttonConfig.text}
                      </Button>
                    );
                  })()}
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
                  For the Free plan (50 orders/month): Bundle processing will stop until you upgrade or the next billing cycle begins.
                  Paid plans have higher limits - Starter (550), Professional (2,050), Enterprise (unlimited).
                  You'll receive notifications at 80% usage to upgrade before hitting the limit.
                </Text>
              </div>

              <div>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  How do I get a refund?
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  For refund requests, contact Shopify support directly at support@shopify.com or through
                  your Shopify admin help section. They handle all billing disputes and refunds for apps.
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

              <Banner tone="info">
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    Need to cancel or get a refund?
                  </Text>
                  <Text as="p" variant="bodySm">
                    For managed pricing apps, cancellation and refunds are handled directly through Shopify.
                    Here are your options:
                  </Text>
                </BlockStack>
              </Banner>

              {!showCancelConfirm ? (
                <BlockStack gap="300">
                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="semibold" tone="critical">
                      Option 1: Cancel Subscription (Free)
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Uninstall the app from your Shopify admin to cancel your subscription immediately.
                      No further charges will be made.
                    </Text>
                  </div>

                  <div>
                    <Text as="p" variant="bodyMd" fontWeight="semibold" tone="critical">
                      Option 2: Request Refund
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Contact Shopify support for refund requests. They handle all billing disputes and refunds.
                    </Text>
                  </div>

                  <InlineStack gap="300">
                    <Button
                      variant="primary"
                      tone="critical"
                      onClick={() => setShowCancelConfirm(true)}
                    >
                      Cancel via App Uninstall
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => window.open('https://help.shopify.com/en/manual/apps/app-billing/managed-pricing#cancel-a-subscription', '_blank')}
                    >
                      Learn More About Cancellation
                    </Button>
                  </InlineStack>
                </BlockStack>
              ) : showCancelConfirm ? (
                <BlockStack gap="400">
                  <Banner tone="warning">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Cancel by Uninstalling the App
                      </Text>
                      <Text as="p" variant="bodySm">
                        To cancel your subscription:
                      </Text>
                      <ol style={{ margin: '8px 0', paddingLeft: '20px' }}>
                        <li>Go to your Shopify admin Apps page</li>
                        <li>Find "Reverse Bundling" in your installed apps</li>
                        <li>Click "Uninstall" next to the app</li>
                        <li>Confirm the uninstallation</li>
                      </ol>
                      <Text as="p" variant="bodySm">
                        Your subscription will be cancelled immediately with no further charges.
                      </Text>
                    </BlockStack>
                  </Banner>

                  <InlineStack gap="300">
                    <Button
                      variant="primary"
                      tone="critical"
                      onClick={() => {
                        // Open Shopify Apps page in new tab
                        window.open('https://admin.shopify.com/store/quickstart-9525e261.myshopify.com/apps', '_blank');
                        setShowCancelConfirm(false);
                      }}
                    >
                      Go to Apps Page
                    </Button>
                    <Button onClick={() => setShowCancelConfirm(false)}>Keep Subscription</Button>
                  </InlineStack>

                  <Text as="p" variant="bodySm" tone="subdued">
                    <strong>For refunds:</strong> Contact Shopify support at{' '}
                    <a href="mailto:support@shopify.com" style={{ color: '#006fbb' }}>
                      support@shopify.com
                    </a>{' '}
                    or through your Shopify admin help section.
                  </Text>
                </BlockStack>
              ) : null}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
