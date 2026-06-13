-- AlterTable
ALTER TABLE "outreach_prospects" ADD COLUMN IF NOT EXISTS "campaignId" TEXT DEFAULT 'week-1';
ALTER TABLE "outreach_prospects" ADD COLUMN IF NOT EXISTS "campaignDay" INTEGER;
ALTER TABLE "outreach_prospects" ADD COLUMN IF NOT EXISTS "alignmentScore" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "outreach_prospects" ADD COLUMN IF NOT EXISTS "fulfillmentSignal" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "outreach_prospects_campaignId_campaignDay_idx" ON "outreach_prospects"("campaignId", "campaignDay");
