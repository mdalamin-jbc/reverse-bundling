import db from "./db.server";

const SHOPIFY_API_VERSION = "2025-01";

/**
 * Billing configuration for managed pricing apps.
 * Trial: 14 days + up to 25 conversions, then a paid plan is required.
 */
export const BILLING_CONFIG = {
  required: true,
  trialDays: 14,
  /** Max bundle conversions during the 14-day trial (not monthly). */
  trialConversionLimit: 25,
  /** @deprecated Use trialConversionLimit — kept for compatibility */
  freeOrderLimit: 25,
  plans: {
    starter: {
      amount: 17.99,
      yearlyAmount: 150,
      yearlySavings: 65,
      currencyCode: "USD",
      interval: "EVERY_30_DAYS" as const,
      name: "Starter Plan",
      description: "Up to 125 orders per month — perfect for small stores",
    },
    professional: {
      amount: 39.99,
      yearlyAmount: 350,
      yearlySavings: 129,
      currencyCode: "USD",
      interval: "EVERY_30_DAYS" as const,
      name: "Professional Plan",
      description: "Up to 525 orders per month — most popular choice",
    },
    enterprise: {
      amount: 79.99,
      yearlyAmount: 700,
      yearlySavings: 259,
      currencyCode: "USD",
      interval: "EVERY_30_DAYS" as const,
      name: "Enterprise Plan",
      description: "Unlimited orders — for high-volume stores",
    },
  },
};

export type BillingState = "paid" | "trial" | "expired";

export type PlanInfo = {
  planName: string;
  planAmount: number;
  planInterval: string;
  planLimit: number;
  hasPaidSubscription: boolean;
  subscriptionName: string | null;
};

export type MerchantBillingStatus = PlanInfo & {
  billingState: BillingState;
  usageCount: number;
  usageLabel: string;
  conversionsThisMonth: number;
  conversionsLifetime: number;
  trialActive: boolean;
  trialEndsAt: string | null;
  installDate: string | null;
  accessAllowed: boolean;
  blockReason: string | null;
};

export type ConversionAccess = {
  allowed: boolean;
  reason?: string;
  planName: string;
  planLimit: number;
  usageCount: number;
  hasPaidSubscription: boolean;
  trialActive: boolean;
  billingState: BillingState;
};

type ShopifySubscription = {
  id?: string;
  name?: string;
  status?: string;
  test?: boolean;
  lineItems?: Array<{
    plan?: {
      pricingDetails?: {
        price?: { amount?: string | number; currencyCode?: string };
        interval?: string;
      };
    };
  }>;
};

const SUBSCRIPTIONS_QUERY = `#graphql
  query {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
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
  }`;

export function getMonthStart(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getTrialEndDate(installDate: Date): Date {
  return new Date(installDate.getTime() + BILLING_CONFIG.trialDays * 24 * 60 * 60 * 1000);
}

export function subscriptionPriceAmount(sub: ShopifySubscription): number {
  const raw = parseFloat(String(sub.lineItems?.[0]?.plan?.pricingDetails?.price?.amount ?? "0"));
  if (!Number.isFinite(raw)) return 0;
  return raw > 1000 ? raw / 100 : raw;
}

export function isPaidActiveSubscription(sub: ShopifySubscription): boolean {
  return sub.status === "ACTIVE" && subscriptionPriceAmount(sub) > 0;
}

export function resolvePlanFromSubscription(sub: ShopifySubscription): PlanInfo {
  const pricing = sub.lineItems?.[0]?.plan?.pricingDetails;
  const amount = subscriptionPriceAmount(sub);
  const interval = pricing?.interval || "EVERY_30_DAYS";
  const subName = (sub.name || "").toLowerCase();

  let planName = "Paid";
  let planLimit = 125;

  if (interval === "ANNUAL") {
    if (amount >= 600) {
      planName = "Enterprise";
      planLimit = 999999;
    } else if (amount >= 300) {
      planName = "Professional";
      planLimit = 525;
    } else if (amount >= 100) {
      planName = "Starter";
      planLimit = 125;
    }
  } else if (Math.abs(amount - 79.99) < 1) {
    planName = "Enterprise";
    planLimit = 999999;
  } else if (Math.abs(amount - 39.99) < 1) {
    planName = "Professional";
    planLimit = 525;
  } else if (Math.abs(amount - 17.99) < 1) {
    planName = "Starter";
    planLimit = 125;
  } else if (subName.includes("enterprise")) {
    planName = "Enterprise";
    planLimit = 999999;
  } else if (subName.includes("professional")) {
    planName = "Professional";
    planLimit = 525;
  } else if (subName.includes("starter")) {
    planName = "Starter";
    planLimit = 125;
  }

  return {
    planName,
    planAmount: amount,
    planInterval: interval,
    planLimit,
    hasPaidSubscription: true,
    subscriptionName: sub.name || null,
  };
}

async function getShopAccessToken(shop: string): Promise<string | null> {
  const offline = await db.session.findFirst({
    where: { shop, isOnline: false, accessToken: { not: "" } },
    select: { accessToken: true },
    orderBy: { id: "desc" },
  });
  if (offline?.accessToken) return offline.accessToken;

  const any = await db.session.findFirst({
    where: { shop, accessToken: { not: "" } },
    select: { accessToken: true },
    orderBy: { id: "desc" },
  });
  return any?.accessToken || null;
}

export async function fetchShopSubscriptions(
  shop: string,
  admin?: { graphql: (query: string, options?: object) => Promise<Response> }
): Promise<ShopifySubscription[]> {
  try {
    if (admin) {
      const response = await admin.graphql(SUBSCRIPTIONS_QUERY);
      const data = await response.json();
      return data.data?.currentAppInstallation?.activeSubscriptions || [];
    }

    const token = await getShopAccessToken(shop);
    if (!token) return [];

    const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: SUBSCRIPTIONS_QUERY }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    return data.data?.currentAppInstallation?.activeSubscriptions || [];
  } catch {
    return [];
  }
}

export async function getInstallDate(shop: string): Promise<Date | null> {
  const [settings, session] = await Promise.all([
    db.appSettings.findFirst({
      where: { shop },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.session.findFirst({
      where: { shop },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
  ]);

  if (settings?.createdAt) return settings.createdAt;

  if (session) {
    const firstConversion = await db.orderConversion.findFirst({
      where: { shop },
      select: { convertedAt: true },
      orderBy: { convertedAt: "asc" },
    });
    return firstConversion?.convertedAt || null;
  }

  return null;
}

export async function getMonthlyConversionCount(shop: string): Promise<number> {
  return db.orderConversion.count({
    where: { shop, convertedAt: { gte: getMonthStart() } },
  });
}

export async function getTrialConversionCount(shop: string, installDate: Date): Promise<number> {
  return db.orderConversion.count({
    where: { shop, convertedAt: { gte: installDate } },
  });
}

export async function getLifetimeConversionCount(shop: string): Promise<number> {
  return db.orderConversion.count({ where: { shop } });
}

/**
 * Check if shop has an active PAID subscription (not just installed).
 */
export async function hasActiveSubscription(
  admin: { graphql: (query: string, options?: object) => Promise<Response> },
  shop: string
): Promise<boolean> {
  const subscriptions = await fetchShopSubscriptions(shop, admin);
  return subscriptions.some(isPaidActiveSubscription);
}

export async function checkConversionAllowed(
  shop: string,
  admin?: { graphql: (query: string, options?: object) => Promise<Response> }
): Promise<ConversionAccess> {
  const [installDate, conversionsThisMonth, conversionsLifetime, subscriptions] = await Promise.all([
    getInstallDate(shop),
    getMonthlyConversionCount(shop),
    getLifetimeConversionCount(shop),
    fetchShopSubscriptions(shop, admin),
  ]);

  const paidSub = subscriptions.find(isPaidActiveSubscription);
  if (paidSub) {
    const plan = resolvePlanFromSubscription(paidSub);
    const allowed = conversionsThisMonth < plan.planLimit;
    return {
      allowed,
      reason: allowed
        ? undefined
        : `Monthly plan limit reached (${conversionsThisMonth}/${plan.planLimit}). Upgrade to continue.`,
      planName: plan.planName,
      planLimit: plan.planLimit,
      usageCount: conversionsThisMonth,
      hasPaidSubscription: true,
      trialActive: false,
      billingState: "paid",
    };
  }

  const now = new Date();
  const trialEndsAt = installDate ? getTrialEndDate(installDate) : null;
  const trialActive = installDate ? now < trialEndsAt! : true;

  if (trialActive) {
    const trialUsage = installDate
      ? await getTrialConversionCount(shop, installDate)
      : conversionsLifetime;
    const allowed = trialUsage < BILLING_CONFIG.trialConversionLimit;
    return {
      allowed,
      reason: allowed
        ? undefined
        : `Trial limit reached (${trialUsage}/${BILLING_CONFIG.trialConversionLimit}). Subscribe to continue.`,
      planName: "Trial",
      planLimit: BILLING_CONFIG.trialConversionLimit,
      usageCount: trialUsage,
      hasPaidSubscription: false,
      trialActive: true,
      billingState: "trial",
    };
  }

  return {
    allowed: false,
    reason: "Trial expired — an active subscription is required to process bundle conversions.",
    planName: "None",
    planLimit: 0,
    usageCount: conversionsThisMonth,
    hasPaidSubscription: false,
    trialActive: false,
    billingState: "expired",
  };
}

export async function getMerchantBillingStatus(
  shop: string,
  admin?: { graphql: (query: string, options?: object) => Promise<Response> }
): Promise<MerchantBillingStatus> {
  const access = await checkConversionAllowed(shop, admin);
  const [installDate, conversionsThisMonth, conversionsLifetime, subscriptions] = await Promise.all([
    getInstallDate(shop),
    getMonthlyConversionCount(shop),
    getLifetimeConversionCount(shop),
    fetchShopSubscriptions(shop, admin),
  ]);

  const paidSub = subscriptions.find(isPaidActiveSubscription);
  const plan = paidSub ? resolvePlanFromSubscription(paidSub) : null;
  const trialEndsAt = installDate ? getTrialEndDate(installDate) : null;
  const trialActive = trialEndsAt ? new Date() < trialEndsAt : false;

  const usageLabel =
    access.billingState === "paid"
      ? "this month"
      : access.billingState === "trial"
        ? "trial total"
        : "blocked";

  return {
    billingState: access.billingState,
    planName: plan?.planName || access.planName,
    planAmount: plan?.planAmount || 0,
    planInterval: plan?.planInterval || "EVERY_30_DAYS",
    planLimit: access.planLimit,
    hasPaidSubscription: !!plan,
    subscriptionName: plan?.subscriptionName || null,
    usageCount: access.usageCount,
    usageLabel,
    conversionsThisMonth,
    conversionsLifetime,
    trialActive,
    trialEndsAt: trialEndsAt?.toISOString() || null,
    installDate: installDate?.toISOString() || null,
    accessAllowed: access.allowed,
    blockReason: access.reason || null,
  };
}

export async function getSubscriptionByChargeId(
  admin: { graphql: (query: string, options?: object) => Promise<Response> },
  chargeId: string
) {
  try {
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
                      price { amount currencyCode }
                      interval
                    }
                  }
                }
              }
            }
          }
        }`,
      { variables: { id: globalId } }
    );

    const data = await response.json();
    return data.data?.node || null;
  } catch (error) {
    console.error("[Billing] Error fetching subscription by charge ID:", error);
    return null;
  }
}

export async function getCurrentPlan(_admin: unknown) {
  return null;
}

export async function redirectToAppStore(planType?: string) {
  let appStoreUrl = "https://apps.shopify.com/reverse-bundling";
  if (planType) {
    appStoreUrl = "https://apps.shopify.com/reverse-bundling";
  }
  return {
    success: true,
    redirectUrl: appStoreUrl,
    message: planType
      ? `Redirecting to Shopify App Store to subscribe to ${planType} plan...`
      : "Redirecting to Shopify App Store for billing management...",
  };
}

export async function redirectToBillingManagement(session: { shop: string }, planType?: string) {
  const storeDomain = session.shop.replace(".myshopify.com", "");
  const appHandle = "reverse-bundling-1";
  const billingUrl = `https://admin.shopify.com/store/${storeDomain}/charges/${appHandle}/pricing_plans`;

  return {
    success: true,
    redirectUrl: billingUrl,
    message: planType
      ? `Redirecting to billing management to change to ${planType} plan...`
      : "Redirecting to billing management...",
  };
}

export async function handlePlanChange(_admin: unknown, session: { shop: string }, planType: string) {
  return redirectToBillingManagement(session, planType);
}

export async function requestPayment(
  _admin: unknown,
  session: { shop: string },
  _billing: unknown,
  planType: string
) {
  try {
    const result = await redirectToBillingManagement(session, planType);
    return { success: true, redirectUrl: result.redirectUrl, error: null };
  } catch (error) {
    return { success: false, redirectUrl: null, error: (error as Error).message };
  }
}
