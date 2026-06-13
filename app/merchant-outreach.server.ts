import db from "./db.server";
import { getInstalledShopDomains } from "./shop-cleanup.server";
import { getMerchantContact } from "./merchant-contact.server";
import { fetchShopActivationSignals } from "./onboarding.server";
import { sendOnboardingReminderEmail } from "./email.server";
import { logInfo, logError } from "./logger.server";

const TEST_SHOP_PATTERNS = [
  /testing/i,
  /-test\b/i,
  /\btest-/i,
  /dev-store/i,
  /sandbox/i,
  /\bdemo\b/i,
  /alamin-testing/i,
];

export type StuckMerchant = {
  shop: string;
  email: string;
  name: string;
  shopName: string;
  productCount: number;
  orderCount: number;
};

export function looksLikeTestShop(shop: string): boolean {
  return TEST_SHOP_PATTERNS.some((pattern) => pattern.test(shop));
}

export async function isRealMerchantCandidate(
  shop: string,
  accessToken: string
): Promise<{ isReal: boolean; reason: string; signals?: Awaited<ReturnType<typeof fetchShopActivationSignals>> }> {
  if (looksLikeTestShop(shop)) {
    return { isReal: false, reason: "test_shop_domain" };
  }

  try {
    const signals = await fetchShopActivationSignals(shop, accessToken);
    if (signals.partnerDevelopment) {
      return { isReal: false, reason: "partner_development_store", signals };
    }
    if (signals.productCount < 2 && signals.orderCount < 3) {
      return { isReal: false, reason: "inactive_catalog", signals };
    }
    return { isReal: true, reason: "qualified", signals };
  } catch {
    return { isReal: false, reason: "shopify_lookup_failed" };
  }
}

export async function findStuckRealMerchants(): Promise<StuckMerchant[]> {
  const installedShops = await getInstalledShopDomains();
  const stuck: StuckMerchant[] = [];

  for (const shop of installedShops) {
    const activeRules = await db.bundleRule.count({ where: { shop, status: "active" } });
    if (activeRules > 0) continue;

    const session = await db.session.findFirst({
      where: { shop, isOnline: false },
      select: { accessToken: true },
    });
    if (!session?.accessToken) continue;

    const realCheck = await isRealMerchantCandidate(shop, session.accessToken);
    if (!realCheck.isReal || !realCheck.signals) continue;

    const contact = await getMerchantContact(shop);
    if (!contact.email) continue;

    stuck.push({
      shop,
      email: contact.email,
      name: contact.name,
      shopName: realCheck.signals.shopName,
      productCount: realCheck.signals.productCount,
      orderCount: realCheck.signals.orderCount,
    });
  }

  return stuck;
}

export async function sendStuckMerchantOnboardingEmails(options?: {
  dryRun?: boolean;
  limit?: number;
}): Promise<{
  dryRun: boolean;
  candidates: number;
  sent: number;
  failed: number;
  merchants: Array<{ shop: string; email: string; status: string }>;
}> {
  const dryRun = options?.dryRun ?? false;
  const limit = options?.limit ?? 50;
  const merchants = (await findStuckRealMerchants()).slice(0, limit);
  const appUrl = process.env.SHOPIFY_APP_URL || "https://reverse-bundling.me";
  const results: Array<{ shop: string; email: string; status: string }> = [];

  let sent = 0;
  let failed = 0;

  for (const merchant of merchants) {
    if (dryRun) {
      results.push({ shop: merchant.shop, email: merchant.email, status: "preview" });
      continue;
    }

    try {
      const result = await sendOnboardingReminderEmail({
        merchantEmail: merchant.email,
        merchantName: merchant.name,
        shopName: merchant.shopName,
        appUrl,
        setupUrl: `${appUrl}/app/setup-wizard`,
      });

      if (result.success) {
        sent += 1;
        results.push({ shop: merchant.shop, email: merchant.email, status: "sent" });
        logInfo("Sent onboarding reminder email", { shop: merchant.shop, email: merchant.email });
      } else {
        failed += 1;
        results.push({ shop: merchant.shop, email: merchant.email, status: "failed" });
      }
    } catch (error) {
      failed += 1;
      results.push({ shop: merchant.shop, email: merchant.email, status: "failed" });
      logError(error as Error, { context: "onboarding_email", shop: merchant.shop });
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return {
    dryRun,
    candidates: merchants.length,
    sent,
    failed,
    merchants: results,
  };
}
