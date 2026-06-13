import { cache } from "./cache.server";
import { logInfo } from "./logger.server";
import type { MerchantBillingStatus } from "./billing.server";
import { BILLING_CONFIG, redirectToBillingManagement } from "./billing.server";
import { getMerchantEmailSettings, sendBillingAlertEmail } from "./email.server";
import { getMerchantContact } from "./merchant-contact.server";

export type BillingAlert = {
  tone: "critical" | "warning" | "info";
  title: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

function getBillingPageUrl(): string {
  const appUrl = process.env.SHOPIFY_APP_URL || "https://reverse-bundling.me";
  return `${appUrl}/app/billing`;
}

function trialUsagePercent(billing: MerchantBillingStatus): number {
  if (billing.planLimit <= 0) return 0;
  return (billing.usageCount / billing.planLimit) * 100;
}

export function buildBillingAlert(billing: MerchantBillingStatus): BillingAlert | null {
  const actionUrl = "/app/billing";

  if (billing.hasPaidSubscription) {
    if (billing.planLimit < 999999 && billing.usageCount >= billing.planLimit * 0.9) {
      return {
        tone: "warning",
        title: "Plan limit almost reached",
        message: `You have used ${billing.usageCount} of ${billing.planLimit} conversions this month. Upgrade before new orders are skipped.`,
        actionLabel: "Upgrade plan",
        actionUrl,
      };
    }
    return null;
  }

  if (billing.billingState === "expired" || !billing.accessAllowed) {
    return {
      tone: "critical",
      title: "Subscription required",
      message:
        billing.blockReason ||
        "Your trial has ended. Subscribe to a plan to keep converting bundle orders and saving on shipping.",
      actionLabel: "Choose a plan",
      actionUrl,
    };
  }

  if (billing.billingState === "trial") {
    const pct = trialUsagePercent(billing);
    const daysLeft = billing.trialEndsAt
      ? Math.max(
          0,
          Math.ceil((new Date(billing.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        )
      : BILLING_CONFIG.trialDays;

    if (!billing.accessAllowed) {
      return {
        tone: "critical",
        title: "Trial conversion limit reached",
        message: `You used all ${billing.planLimit} trial conversions. Subscribe to continue processing bundle orders.`,
        actionLabel: "Subscribe now",
        actionUrl,
      };
    }

    if (pct >= 90) {
      return {
        tone: "warning",
        title: "Trial almost used up",
        message: `${billing.usageCount}/${billing.planLimit} trial conversions used · ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left. Subscribe before bundle processing stops.`,
        actionLabel: "View plans",
        actionUrl,
      };
    }

    if (pct >= 80) {
      return {
        tone: "info",
        title: "Trial usage update",
        message: `${billing.usageCount}/${billing.planLimit} trial conversions used · ${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining on your trial.`,
        actionLabel: "View plans",
        actionUrl,
      };
    }

    if (daysLeft <= 3) {
      return {
        tone: "warning",
        title: "Trial ending soon",
        message: `Your free trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Choose a plan to keep converting orders after the trial.`,
        actionLabel: "Choose a plan",
        actionUrl,
      };
    }
  }

  return null;
}

async function shouldSendEmail(shop: string, notifyKey: string, ttlMs: number): Promise<boolean> {
  const cacheKey = `billing-notify:${shop}:${notifyKey}`;
  if (cache.get<boolean>(cacheKey)) {
    return false;
  }
  cache.set(cacheKey, true, ttlMs);
  return true;
}

export async function maybeNotifyMerchantBilling(
  shop: string,
  billing: MerchantBillingStatus
): Promise<void> {
  const [{ emailEnabled }, contact] = await Promise.all([
    getMerchantEmailSettings(shop),
    getMerchantContact(shop),
  ]);

  if (!emailEnabled || !contact.email) {
    return;
  }

  const appUrl = getBillingPageUrl();
  const { redirectUrl } = await redirectToBillingManagement({ shop });
  const pct = trialUsagePercent(billing);

  if (billing.hasPaidSubscription) {
    return;
  }

  if (billing.billingState === "expired" || (!billing.accessAllowed && billing.billingState !== "trial")) {
    if (await shouldSendEmail(shop, "trial_expired", SEVEN_DAYS_MS)) {
      await sendBillingAlertEmail({
        merchantEmail: contact.email,
        merchantName: contact.name,
        alertType: "trial_expired",
        message:
          billing.blockReason ||
          "Your 14-day trial has ended. Subscribe to continue converting bundle orders.",
        usageCount: billing.usageCount,
        planLimit: billing.planLimit,
        trialEndsAt: billing.trialEndsAt,
        billingUrl: redirectUrl,
        appUrl,
      });
      logInfo("Sent trial expired billing email", { shop, email: contact.email });
    }
    return;
  }

  if (billing.billingState === "trial" && !billing.accessAllowed) {
    if (await shouldSendEmail(shop, "trial_exhausted", SEVEN_DAYS_MS)) {
      await sendBillingAlertEmail({
        merchantEmail: contact.email,
        merchantName: contact.name,
        alertType: "trial_exhausted",
        message: `You have used all ${billing.planLimit} trial conversions.`,
        usageCount: billing.usageCount,
        planLimit: billing.planLimit,
        trialEndsAt: billing.trialEndsAt,
        billingUrl: redirectUrl,
        appUrl,
      });
      logInfo("Sent trial exhausted billing email", { shop, email: contact.email });
    }
    return;
  }

  if (billing.billingState === "trial" && pct >= 90) {
    if (await shouldSendEmail(shop, "trial_90", SEVEN_DAYS_MS)) {
      await sendBillingAlertEmail({
        merchantEmail: contact.email,
        merchantName: contact.name,
        alertType: "trial_90",
        message: `You have used ${billing.usageCount} of ${billing.planLimit} trial conversions (90%+).`,
        usageCount: billing.usageCount,
        planLimit: billing.planLimit,
        trialEndsAt: billing.trialEndsAt,
        billingUrl: redirectUrl,
        appUrl,
      });
      logInfo("Sent trial 90% billing email", { shop, email: contact.email });
    }
    return;
  }

  if (billing.billingState === "trial" && pct >= 80) {
    if (await shouldSendEmail(shop, "trial_80", SEVEN_DAYS_MS)) {
      await sendBillingAlertEmail({
        merchantEmail: contact.email,
        merchantName: contact.name,
        alertType: "trial_80",
        message: `You have used ${billing.usageCount} of ${billing.planLimit} trial conversions (80%+).`,
        usageCount: billing.usageCount,
        planLimit: billing.planLimit,
        trialEndsAt: billing.trialEndsAt,
        billingUrl: redirectUrl,
        appUrl,
      });
      logInfo("Sent trial 80% billing email", { shop, email: contact.email });
    }
  }
}

export async function notifyBillingBlockedOrder(
  shop: string,
  billing: MerchantBillingStatus,
  orderName?: string
): Promise<void> {
  const [{ emailEnabled }, contact] = await Promise.all([
    getMerchantEmailSettings(shop),
    getMerchantContact(shop),
  ]);

  if (!emailEnabled || !contact.email) {
    return;
  }

  if (!(await shouldSendEmail(shop, "order_blocked", ONE_DAY_MS))) {
    return;
  }

  const appUrl = getBillingPageUrl();
  const { redirectUrl } = await redirectToBillingManagement({ shop });

  await sendBillingAlertEmail({
    merchantEmail: contact.email,
    merchantName: contact.name,
    alertType: "order_blocked",
    message:
      billing.blockReason ||
      "A new order matched your bundle rules but could not be converted because your trial ended or limit was reached.",
    usageCount: billing.usageCount,
    planLimit: billing.planLimit,
    trialEndsAt: billing.trialEndsAt,
    billingUrl: redirectUrl,
    appUrl,
    orderName,
  });

  logInfo("Sent billing blocked order email", { shop, email: contact.email, orderName });
}
