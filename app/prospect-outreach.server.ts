import db from "./db.server";
import { sendProspectOutreachEmail, type ProspectNiche } from "./email.server";
import { logInfo, logError } from "./logger.server";
import {
  WEEK1_CAMPAIGN_ID,
  WEEK1_CAMPAIGN_PROSPECTS,
  WEEK1_DAILY_CAP,
  WEEK1_DAYS,
  type CampaignProspectSeed,
} from "./data/icp-week1-campaign";

export type ProspectSeed = {
  storeName: string;
  storeUrl: string;
  email: string;
  niche: ProspectNiche;
  contactName?: string;
  hook?: string;
};

export const DAILY_OUTREACH_CAP = WEEK1_DAILY_CAP;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isShopifyStoreUrl(url: string): boolean {
  return url.includes(".myshopify.com");
}

/** Skip non-Shopify URLs unless explicitly high-fit accessory/supplement store. */
export function isEligibleColdTarget(prospect: {
  storeUrl: string;
  alignmentScore: number;
  fulfillmentSignal?: string | null;
}): boolean {
  if (isShopifyStoreUrl(prospect.storeUrl)) return prospect.alignmentScore >= 70;
  const signal = (prospect.fulfillmentSignal || "").toLowerCase();
  return prospect.alignmentScore >= 88 && (signal.includes("shipstation") || signal.includes("3pl"));
}

export async function getSentCountToday(): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return db.outreachProspect.count({
    where: { status: "sent", sentAt: { gte: start } },
  });
}

export async function seedWeek1Campaign(): Promise<{
  created: number;
  updated: number;
  skipped: number;
  duplicatesInFile: number;
}> {
  const seen = new Set<string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let duplicatesInFile = 0;

  for (const prospect of WEEK1_CAMPAIGN_PROSPECTS) {
    const email = normalizeEmail(prospect.email);
    if (seen.has(email)) {
      duplicatesInFile += 1;
      continue;
    }
    seen.add(email);

    const existing = await db.outreachProspect.findUnique({ where: { email } });
    const data = {
      storeName: prospect.storeName,
      storeUrl: prospect.storeUrl,
      niche: prospect.niche,
      contactName: prospect.contactName || null,
      hook: prospect.hook || null,
      campaignId: WEEK1_CAMPAIGN_ID,
      campaignDay: prospect.campaignDay,
      alignmentScore: prospect.alignmentScore,
      fulfillmentSignal: prospect.fulfillmentSignal,
    };

    if (existing) {
      await db.outreachProspect.update({ where: { email }, data });
      updated += 1;
    } else {
      await db.outreachProspect.create({
        data: { ...data, email, status: "pending" },
      });
      created += 1;
    }
  }

  return { created, updated, skipped, duplicatesInFile };
}

export async function getCampaignDayOverview(campaignId: string = WEEK1_CAMPAIGN_ID) {
  const days = [];
  for (let day = 1; day <= WEEK1_DAYS; day += 1) {
    const [pending, sent, replied, optedOut, total] = await Promise.all([
      db.outreachProspect.count({ where: { campaignId, campaignDay: day, status: "pending" } }),
      db.outreachProspect.count({ where: { campaignId, campaignDay: day, status: "sent" } }),
      db.outreachProspect.count({ where: { campaignId, campaignDay: day, status: "replied" } }),
      db.outreachProspect.count({ where: { campaignId, campaignDay: day, status: "opted_out" } }),
      db.outreachProspect.count({ where: { campaignId, campaignDay: day } }),
    ]);
    days.push({
      day,
      pending,
      sent,
      replied,
      optedOut,
      total,
      target: WEEK1_DAILY_CAP,
      ready: pending > 0,
    });
  }

  const sentToday = await getSentCountToday();
  return {
    campaignId,
    dailyCap: WEEK1_DAILY_CAP,
    sentToday,
    remainingToday: Math.max(0, WEEK1_DAILY_CAP - sentToday),
    days,
    totalProspects: days.reduce((sum, d) => sum + d.total, 0),
    targetTotal: WEEK1_DAILY_CAP * WEEK1_DAYS,
  };
}

export async function listOutreachProspects(limit = 50, campaignDay?: number) {
  const result = await listOutreachProspectsPaginated({
    page: 1,
    pageSize: limit,
    campaignDay,
  });
  return result.items;
}

export const OUTREACH_PAGE_SIZE = 20;

export async function listOutreachProspectsPaginated(options: {
  page?: number;
  pageSize?: number;
  campaignDay?: number;
  campaignId?: string;
}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? OUTREACH_PAGE_SIZE));
  const where: {
    campaignId?: string;
    campaignDay?: number;
  } = {};
  if (options.campaignId) where.campaignId = options.campaignId;
  if (options.campaignDay) where.campaignDay = options.campaignDay;

  const [items, total] = await Promise.all([
    db.outreachProspect.findMany({
      where,
      orderBy: [{ campaignDay: "asc" }, { alignmentScore: "desc" }, { createdAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.outreachProspect.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function sendCampaignDayBatch(options: {
  campaignId?: string;
  day: number;
  dryRun?: boolean;
}): Promise<{
  dryRun: boolean;
  day: number;
  targeted: number;
  sent: number;
  failed: number;
  skippedIneligible: number;
  sentToday: number;
  dailyCap: number;
  results: Array<{ email: string; storeName: string; status: string }>;
  error?: string;
}> {
  const campaignId = options.campaignId || WEEK1_CAMPAIGN_ID;
  const day = options.day;
  const dryRun = options.dryRun ?? false;

  if (day < 1 || day > WEEK1_DAYS) {
    return {
      dryRun,
      day,
      targeted: 0,
      sent: 0,
      failed: 0,
      skippedIneligible: 0,
      sentToday: 0,
      dailyCap: WEEK1_DAILY_CAP,
      results: [],
      error: `Invalid campaign day ${day}. Use 1-${WEEK1_DAYS}.`,
    };
  }

  const sentToday = await getSentCountToday();
  const remainingToday = WEEK1_DAILY_CAP - sentToday;
  if (!dryRun && remainingToday <= 0) {
    return {
      dryRun,
      day,
      targeted: 0,
      sent: 0,
      failed: 0,
      skippedIneligible: 0,
      sentToday,
      dailyCap: WEEK1_DAILY_CAP,
      results: [],
      error: `Daily safety cap reached (${WEEK1_DAILY_CAP}/day). Try again tomorrow.`,
    };
  }

  const limit = dryRun ? WEEK1_DAILY_CAP : Math.min(WEEK1_DAILY_CAP, remainingToday);
  const appStoreUrl = "https://apps.shopify.com/reverse-bundling";

  const candidates = await db.outreachProspect.findMany({
    where: { campaignId, campaignDay: day, status: "pending" },
    orderBy: [{ alignmentScore: "desc" }, { createdAt: "asc" }],
    take: limit * 2,
  });

  const results: Array<{ email: string; storeName: string; status: string }> = [];
  let sent = 0;
  let failed = 0;
  let skippedIneligible = 0;
  let targeted = 0;

  for (const prospect of candidates) {
    if (targeted >= limit) break;

    if (!isEligibleColdTarget(prospect)) {
      skippedIneligible += 1;
      if (dryRun) {
        results.push({ email: prospect.email, storeName: prospect.storeName, status: "ineligible" });
      }
      continue;
    }

    targeted += 1;

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
        logInfo("Sent campaign outreach email", {
          campaignId,
          day,
          email: prospect.email,
          store: prospect.storeName,
          alignmentScore: prospect.alignmentScore,
        });
      } else {
        failed += 1;
        results.push({ email: prospect.email, storeName: prospect.storeName, status: "failed" });
      }
    } catch (error) {
      failed += 1;
      results.push({ email: prospect.email, storeName: prospect.storeName, status: "failed" });
      logError(error as Error, { context: "campaign_outreach", email: prospect.email, day });
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return {
    dryRun,
    day,
    targeted,
    sent,
    failed,
    skippedIneligible,
    sentToday: dryRun ? sentToday : sentToday + sent,
    dailyCap: WEEK1_DAILY_CAP,
    results,
  };
}

/** @deprecated Use sendCampaignDayBatch */
export async function sendProspectOutreachBatch(options?: {
  dryRun?: boolean;
  limit?: number;
  niche?: ProspectNiche;
}) {
  return sendCampaignDayBatch({ day: 1, dryRun: options?.dryRun });
}

export async function markProspectReplied(email: string, notes?: string) {
  return db.outreachProspect.update({
    where: { email: normalizeEmail(email) },
    data: { status: "replied", repliedAt: new Date(), notes: notes || null },
  });
}

export async function markProspectOptedOut(email: string) {
  return db.outreachProspect.update({
    where: { email: normalizeEmail(email) },
    data: { status: "opted_out", notes: "Opted out via email" },
  });
}

export { WEEK1_CAMPAIGN_ID, WEEK1_DAILY_CAP, WEEK1_DAYS, WEEK1_CAMPAIGN_PROSPECTS };
export type { CampaignProspectSeed };
