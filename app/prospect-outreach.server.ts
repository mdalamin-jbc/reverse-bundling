import db from "./db.server";
import { sendProspectOutreachEmail, type ProspectNiche } from "./email.server";
import { logInfo, logError } from "./logger.server";

export type ProspectSeed = {
  storeName: string;
  storeUrl: string;
  email: string;
  niche: ProspectNiche;
  contactName?: string;
  hook?: string;
};

/** Public contact emails from store contact/wholesale pages (verified manually). */
export const DEFAULT_ICP_PROSPECTS: ProspectSeed[] = [
  {
    storeName: "Forevervital",
    storeUrl: "https://forever-vital.myshopify.com",
    email: "support@forevervital.com",
    niche: "supplements",
    hook: "Forevervital’s multi-product wellness orders look like a strong fit for bundle conversion before pick-and-pack.",
  },
  {
    storeName: "Premium Nutrition USA",
    storeUrl: "https://supplements-green.myshopify.com",
    email: "support@premiumnutritionusa.com",
    niche: "supplements",
  },
  {
    storeName: "Labie Wellness",
    storeUrl: "https://labiewellness.myshopify.com",
    email: "labiewellness@gmail.com",
    niche: "supplements",
    hook: "Your bundle-and-save offers (3+ bottles) are exactly the pattern reverse bundling automates at fulfillment time.",
  },
  {
    storeName: "CBD Superstore",
    storeUrl: "https://cbd-superstore.myshopify.com",
    email: "wholesale@proteambrady.com",
    niche: "supplements",
    contactName: "Pro Team",
  },
  {
    storeName: "Just Nutritive",
    storeUrl: "https://just-nutritive-wholesale.myshopify.com",
    email: "contact@justnutritive.com",
    niche: "beauty",
    hook: "Hair and skin routines often ship as multiple SKUs — bundling them pre-fulfillment can cut pick steps.",
  },
  {
    storeName: "Toi Beauty",
    storeUrl: "https://9c8524-3.myshopify.com",
    email: "info@toibeauty.com",
    niche: "beauty",
  },
  {
    storeName: "Dropship Beauty",
    storeUrl: "https://dropship-beauty-16.myshopify.com",
    email: "support@dropshipbeauty.app",
    niche: "beauty",
  },
  {
    storeName: "Beauty Packs",
    storeUrl: "https://beautypacks.myshopify.com",
    email: "Support@puppykits.co",
    niche: "beauty",
    hook: "Multi-item beauty packs are a natural fit for auto-converting to one bundle SKU before shipping.",
  },
  {
    storeName: "Play Game With Phone",
    storeUrl: "https://play-game-with-phone.myshopify.com",
    email: "support@play-game-with-phone.com",
    niche: "accessories",
  },
  {
    storeName: "The Mobile Marvel",
    storeUrl: "https://themobilemarvel.com",
    email: "mo@themobilemarvel.com",
    niche: "accessories",
    hook: "Accessory bundles (case + charger + protector) are one of the highest-volume use cases we see.",
  },
  {
    storeName: "PhoneCladding",
    storeUrl: "https://phonecladding.myshopify.com",
    email: "PhoneCladding@gmail.com",
    niche: "accessories",
  },
];

export async function seedOutreachProspects(
  prospects: ProspectSeed[] = DEFAULT_ICP_PROSPECTS
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;

  for (const prospect of prospects) {
    const email = prospect.email.trim().toLowerCase();
    const existing = await db.outreachProspect.findUnique({ where: { email } });
    if (existing) {
      skipped += 1;
      continue;
    }

    await db.outreachProspect.create({
      data: {
        storeName: prospect.storeName,
        storeUrl: prospect.storeUrl,
        email,
        niche: prospect.niche,
        contactName: prospect.contactName || null,
        hook: prospect.hook || null,
        status: "pending",
      },
    });
    created += 1;
  }

  return { created, skipped };
}

export async function listOutreachProspects(limit = 50) {
  return db.outreachProspect.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
}

export async function sendProspectOutreachBatch(options?: {
  dryRun?: boolean;
  limit?: number;
  niche?: ProspectNiche;
}): Promise<{
  dryRun: boolean;
  targeted: number;
  sent: number;
  failed: number;
  results: Array<{ email: string; storeName: string; status: string }>;
}> {
  const dryRun = options?.dryRun ?? false;
  const limit = options?.limit ?? 12;
  const appStoreUrl = "https://apps.shopify.com/reverse-bundling";

  const prospects = await db.outreachProspect.findMany({
    where: {
      status: "pending",
      ...(options?.niche ? { niche: options.niche } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const results: Array<{ email: string; storeName: string; status: string }> = [];
  let sent = 0;
  let failed = 0;

  for (const prospect of prospects) {
    if (dryRun) {
      results.push({ email: prospect.email, storeName: prospect.storeName, status: "preview" });
      continue;
    }

    try {
      const result = await sendProspectOutreachEmail({
        prospectEmail: prospect.email,
        contactName: prospect.contactName || "there",
        storeName: prospect.storeName,
        storeUrl: prospect.storeUrl,
        niche: prospect.niche as ProspectNiche,
        hook: prospect.hook || undefined,
        appStoreUrl,
      });

      if (result.success) {
        await db.outreachProspect.update({
          where: { id: prospect.id },
          data: { status: "sent", sentAt: new Date() },
        });
        sent += 1;
        results.push({ email: prospect.email, storeName: prospect.storeName, status: "sent" });
        logInfo("Sent prospect outreach email", {
          email: prospect.email,
          store: prospect.storeName,
          niche: prospect.niche,
        });
      } else {
        failed += 1;
        results.push({ email: prospect.email, storeName: prospect.storeName, status: "failed" });
      }
    } catch (error) {
      failed += 1;
      results.push({ email: prospect.email, storeName: prospect.storeName, status: "failed" });
      logError(error as Error, { context: "prospect_outreach", email: prospect.email });
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { dryRun, targeted: prospects.length, sent, failed, results };
}

export async function markProspectReplied(email: string, notes?: string) {
  return db.outreachProspect.update({
    where: { email: email.trim().toLowerCase() },
    data: {
      status: "replied",
      repliedAt: new Date(),
      notes: notes || null,
    },
  });
}

export async function markProspectOptedOut(email: string) {
  return db.outreachProspect.update({
    where: { email: email.trim().toLowerCase() },
    data: { status: "opted_out", notes: "Opted out via email" },
  });
}
