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
 */
export async function hasActiveSubscription(admin: any, shop: string) {
  if (!BILLING_CONFIG.required) {
    return true; // Billing not required
  }

  try {
    const response = await admin.graphql(
      `#graphql
        query {
          currentAppInstallation {
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
    
    return subscriptions.some((sub: any) => sub.status === "ACTIVE");
  } catch (error) {
    console.error("[Billing] Error checking subscription:", error);
    return false;
  }
}

/**
 * Request payment - creates a billing subscription
 * Returns object with success status and redirect URL
 */
export async function requestPayment(admin: any, session: any, billing: any, planType: string, requestOrigin?: string) {
  const planMap: Record<string, keyof typeof BILLING_CONFIG.plans> = {
    'starter': 'starter',
    'professional': 'professional',
    'enterprise': 'enterprise'
  };
  
  const plan = planMap[planType] || 'professional';
  const planConfig = BILLING_CONFIG.plans[plan];

  // Use request origin if provided, otherwise fallback to env var or shop domain
  const appUrl = requestOrigin || process.env.SHOPIFY_APP_URL || `https://${session.shop}`;
  const returnUrl = `${appUrl}/app/billing`;

  console.log('[Billing] Creating subscription:', {
    plan: planConfig.name,
    amount: planConfig.amount,
    returnUrl,
    shop: session.shop
  });

  try {
    const response = await admin.graphql(
      `#graphql
        mutation AppSubscriptionCreate($name: String!, $test: Boolean, $returnUrl: URL!, $trialDays: Int, $lineItems: [AppSubscriptionLineItemInput!]!) {
          appSubscriptionCreate(
            name: $name
            test: $test
            returnUrl: $returnUrl
            trialDays: $trialDays
            lineItems: $lineItems
          ) {
            appSubscription {
              id
            }
            confirmationUrl
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: {
          name: planConfig.name,
          test: true, // Set to false for production
          returnUrl,
          trialDays: BILLING_CONFIG.trialDays,
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: {
                    amount: planConfig.amount,
                    currencyCode: planConfig.currencyCode,
                  },
                  interval: planConfig.interval,
                },
              },
            },
          ],
        },
      }
    );

    const data = await response.json();
    
    console.log('[Billing] GraphQL response:', JSON.stringify(data, null, 2));
    
    if (data.data?.appSubscriptionCreate?.userErrors?.length > 0) {
      const errorMsg = data.data.appSubscriptionCreate.userErrors[0].message;
      console.error('[Billing] User errors:', data.data.appSubscriptionCreate.userErrors);
      return {
        success: false,
        redirectUrl: null,
        error: errorMsg
      };
    }

    const confirmationUrl = data.data?.appSubscriptionCreate?.confirmationUrl;
    console.log('[Billing] Confirmation URL:', confirmationUrl);

    return {
      success: true,
      redirectUrl: confirmationUrl,
      error: null
    };
  } catch (error) {
    console.error("[Billing] Error creating subscription:", error);
    return {
      success: false,
      redirectUrl: null,
      error: error instanceof Error ? error.message : "Failed to create subscription"
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
