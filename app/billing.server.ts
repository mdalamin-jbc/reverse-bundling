import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "./shopify.server";

/**
 * Billing configuration for the app
 * Update these values based on your pricing strategy
 */
export const BILLING_CONFIG = {
  required: process.env.BILLING_REQUIRED === "true",
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
 * Check if shop has an active subscription
 * For App Store apps, this checks the app installation status
 */
export async function hasActiveSubscription(admin: any, shop: string) {
  if (!BILLING_CONFIG.required) {
    return true; // Billing not required
  }

  try {
    // For App Store apps, check if the app is installed and active
    const response = await admin.graphql(
      `#graphql
        query {
          currentAppInstallation {
            id
            activeSubscriptions {
              id
              name
              status
              test
            }
          }
        }`
    );

    const data = await response.json();
    const subscriptions = data.data?.currentAppInstallation?.activeSubscriptions || [];

    // For App Store billing, we check if there are any active subscriptions
    // The actual billing is managed by Shopify's App Store
    return subscriptions.some((sub: any) => sub.status === "ACTIVE");
  } catch (error) {
    console.error("[Billing] Error checking subscription:", error);
    // For App Store apps, if we can't check, assume no subscription
    // This will trigger the App Store redirect
    return false;
  }
}

/**
 * Request payment - redirects to App Store for billing
 * For App Store apps, we redirect to the App Store listing instead of using Billing API
 */
export async function requestPayment(admin: any, session: any, billing: any, planType: string, requestOrigin?: string) {
  // For App Store apps, we don't create subscriptions directly
  // Instead, we redirect users to the App Store to manage billing

  const appStoreUrl = `https://apps.shopify.com/reverse-bundle-pro`;

  console.log('[Billing] Redirecting to App Store for billing:', {
    plan: planType,
    shop: session.shop,
    appStoreUrl
  });

  return {
    success: true,
    redirectUrl: appStoreUrl,
    error: null
  };
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
