import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "./shopify.server";

/**
 * Billing configuration for managed pricing apps
 * For managed pricing apps, billing is handled entirely by Shopify App Store
 */
export const BILLING_CONFIG = {
  required: true, // Always required for managed pricing apps
  trialDays: 14,
  freeOrderLimit: 50, // Free tier: 50 orders/month for everyone
  plans: {
    starter: {
      amount: 29,
      currencyCode: "USD",
      interval: "EVERY_30_DAYS" as const,
      name: "Starter Plan",
      description: "Up to 550 orders per month (50 free + 500 paid)",
    },
    professional: {
      amount: 79,
      currencyCode: "USD",
      interval: "EVERY_30_DAYS" as const,
      name: "Professional Plan",
      description: "Up to 2,050 orders per month (50 free + 2,000 paid)",
    },
    enterprise: {
      amount: 199,
      currencyCode: "USD",
      interval: "EVERY_30_DAYS" as const,
      name: "Enterprise Plan",
      description: "Unlimited orders (50 free + unlimited paid)",
    },
  },
};

/**
 * Check if shop has access to the app
 * For managed pricing apps, this checks if there's an active paid subscription
 */
export async function hasActiveSubscription(admin: any, shop: string) {
  try {
    // For managed pricing apps, check for active subscriptions
    const response = await admin.graphql(
      `#graphql
        query {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
              status
              lineItems {
                id
                plan {
                  pricingDetails {
                    ... on AppRecurringPricing {
                      price {
                        amount
                      }
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
    const hasActiveSubscription = subscriptions.some((sub: any) => sub.status === 'ACTIVE');

    console.log('[Billing] Subscription check:', {
      shop,
      subscriptions: subscriptions.map((s: any) => ({ name: s.name, status: s.status })),
      hasActiveSubscription
    });

    return hasActiveSubscription;
  } catch (error) {
    console.error("[Billing] Error checking subscriptions:", error);
    // Fallback to checking app installation
    try {
      const response = await admin.graphql(
        `#graphql
          query {
            currentAppInstallation {
              id
            }
          }`
      );
      const data = await response.json();
      return !!data.data?.currentAppInstallation?.id;
    } catch (fallbackError) {
      console.error("[Billing] Fallback installation check failed:", fallbackError);
      return false;
    }
  }
}

/**
 * Get current plan information for managed pricing apps
 * Since we can't access subscription details directly, we determine plan based on usage limits
 * This is a simplified approach - in production, you might need to store plan info in your database
 */
export async function getCurrentPlan(admin: any) {
  // For managed pricing apps, we can't query subscription details
  // Return null to indicate we should show the free plan by default
  // The actual plan enforcement should be handled by Shopify's billing system
  return null;
}

/**
 * Get subscription details by charge ID
 * For managed pricing apps, we can query specific subscription information
 */
export async function getSubscriptionByChargeId(admin: any, chargeId: string) {
  try {
    // Construct the proper global ID for AppSubscription
    // Shopify expects global IDs in the format: gid://shopify/AppSubscription/{id}
    const globalId = `gid://shopify/AppSubscription/${chargeId}`;

    const response = await admin.graphql(
      `#graphql
        query($id: ID!) {
          node(id: $id) {
            ... on AppSubscription {
              id
              name
              status
              currentPeriodEnd
              lineItems {
                id
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
        }`,
      {
        variables: {
          id: globalId,
        },
      }
    );

    const data = await response.json();
    return data.data?.node || null;
  } catch (error) {
    console.error("[Billing] Error fetching subscription by charge ID:", error);
    return null;
  }
}

/**
 * Redirect to Shopify App Store for billing operations
 * For managed pricing apps, all billing is handled through the App Store
 */
export async function redirectToAppStore(planType?: string) {
  // For managed pricing apps, we redirect to the App Store
  // The App Store URL should be constructed based on your app's listing
  let appStoreUrl = `https://apps.shopify.com/reverse-bundling`;

  // For specific plans, we can add plan parameters if supported by Shopify
  if (planType) {
    // Note: Shopify App Store doesn't always support direct plan links
    // The plan selection typically happens within the App Store interface
    appStoreUrl = `https://apps.shopify.com/reverse-bundling`;
  }

  return {
    success: true,
    redirectUrl: appStoreUrl,
    message: planType
      ? `Redirecting to Shopify App Store to subscribe to ${planType} plan...`
      : "Redirecting to Shopify App Store for billing management..."
  };
}

/**
 * Redirect to Shopify billing management for existing subscriptions
 * For apps with active subscriptions, redirect to Shopify's billing interface
 */
export async function redirectToBillingManagement(session: any, planType?: string) {
  // For existing subscriptions, redirect to Shopify admin billing page
  // URL pattern: https://admin.shopify.com/store/{store-domain}/charges/{app-handle}/pricing_plans
  const storeDomain = session.shop.replace('.myshopify.com', '');
  const appHandle = 'reverse-bundling-1'; // This should match your app's handle in Partner Dashboard
  const billingUrl = `https://admin.shopify.com/store/${storeDomain}/charges/${appHandle}/pricing_plans`;

  console.log('[Billing] Redirecting to billing management:', {
    storeDomain,
    appHandle,
    billingUrl,
    planType
  });

  return {
    success: true,
    redirectUrl: billingUrl,
    message: planType
      ? `Redirecting to billing management to change to ${planType} plan...`
      : "Redirecting to billing management..."
  };
}

/**
 * Handle plan changes for managed pricing apps
 * Since we can't modify subscriptions directly, redirect to App Store
 */
export async function handlePlanChange(admin: any, session: any, planType: string) {
  console.log(`[Billing] Redirecting to billing management for plan change: ${planType}`);
  return redirectToBillingManagement(session, planType);
}

/**
 * Request payment - redirects to App Store for managed pricing apps
 */
export async function requestPayment(admin: any, session: any, billing: any, planType: string, requestOrigin?: string) {
  try {
    const result = await redirectToBillingManagement(session, planType);

    console.log('[Billing] Redirecting to billing management:', {
      plan: planType,
      shop: session.shop,
      redirectUrl: result.redirectUrl
    });

    return {
      success: true,
      redirectUrl: result.redirectUrl,
      error: null
    };
  } catch (error) {
    console.error('[Billing] Error redirecting to billing management:', error);
    return {
      success: false,
      redirectUrl: null,
      error: (error as Error).message
    };
  }
}

/**
 * Billing middleware - checks if shop has active subscription
 * Use this in loaders that require billing
 */
export async function requireBilling(request: LoaderFunctionArgs["request"]) {
  const { admin, session, billing } = await authenticate.admin(request);

  const hasSubscription = await hasActiveSubscription(admin, session.shop);

  if (!hasSubscription) {
    // Redirect to billing page
    const result = await requestPayment(admin, session, billing, "professional");
    
    if (result.success && result.redirectUrl) {
      return { billing: { required: true, confirmationUrl: result.redirectUrl } };
    }
  }

  return { billing: { required: false } };
}
