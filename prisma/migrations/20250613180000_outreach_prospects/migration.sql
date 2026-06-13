-- CreateTable
CREATE TABLE "outreach_prospects" (
    "id" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "storeUrl" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "contactName" TEXT,
    "hook" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_prospects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outreach_prospects_email_key" ON "outreach_prospects"("email");

-- CreateIndex
CREATE INDEX "outreach_prospects_status_idx" ON "outreach_prospects"("status");

-- CreateIndex
CREATE INDEX "outreach_prospects_niche_idx" ON "outreach_prospects"("niche");
