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
 * For managed pricing apps, this checks if the app is installed
 * Billing access is granted by Shopify based on App Store purchases
 */
export async function hasActiveSubscription(admin: any, shop: string) {
  try {
    // For managed pricing apps, check if the app is installed
    // The actual billing is managed by Shopify's App Store
    const response = await admin.graphql(
      `#graphql
        query {
          currentAppInstallation {
            id
          }
        }`
    );

    const data = await response.json();
    const hasInstallation = !!data.data?.currentAppInstallation?.id;

    // For managed pricing apps, if the app is installed, it has billing access
    // The actual subscription management is handled by Shopify
    return hasInstallation;
  } catch (error) {
    console.error("[Billing] Error checking app installation:", error);
    return false;
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
 * Redirect to Shopify App Store for billing operations
 * For managed pricing apps, all billing is handled through the App Store
 */
export async function redirectToAppStore(planType?: string) {
  // For managed pricing apps, we redirect to the App Store
  // The App Store URL should be constructed based on your app's listing
  const appStoreUrl = `https://apps.shopify.com/reverse-bundle-pro`;

  return {
    success: true,
    redirectUrl: appStoreUrl,
    message: planType
      ? `Redirecting to Shopify App Store to subscribe to ${planType} plan...`
      : "Redirecting to Shopify App Store for billing management..."
  };
}

/**
 * Handle plan changes for managed pricing apps
 * Since we can't modify subscriptions directly, redirect to App Store
 */
export async function handlePlanChange(admin: any, planType: string) {
  console.log(`[Billing] Redirecting to App Store for plan change: ${planType}`);
  return redirectToAppStore(planType);
}

/**
 * Request payment - redirects to App Store for managed pricing apps
 */
export async function requestPayment(admin: any, session: any, billing: any, planType: string, requestOrigin?: string) {
  try {
    const result = await redirectToAppStore(planType);

    console.log('[Billing] Redirecting to App Store:', {
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
    console.error('[Billing] Error redirecting to App Store:', error);
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
