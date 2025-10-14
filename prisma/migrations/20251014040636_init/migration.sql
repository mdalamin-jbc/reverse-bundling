-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bundle_rules" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "bundledSku" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "frequency" INTEGER NOT NULL DEFAULT 0,
    "savings" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bundle_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bundle_analytics" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "bundleRuleId" TEXT NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "savingsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bundle_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order_conversions" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "originalItems" TEXT NOT NULL,
    "bundledSku" TEXT NOT NULL,
    "bundleRuleId" TEXT NOT NULL,
    "savingsAmount" DOUBLE PRECISION NOT NULL,
    "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fulfillment_providers" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "webhookUrl" TEXT,
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSyncAt" TIMESTAMP(3),
    "ordersProcessed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fulfillment_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."app_settings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "slackWebhook" TEXT,
    "autoConvertOrders" BOOLEAN NOT NULL DEFAULT true,
    "minimumSavings" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bundle_rules_shop_idx" ON "public"."bundle_rules"("shop");

-- CreateIndex
CREATE INDEX "bundle_rules_shop_status_idx" ON "public"."bundle_rules"("shop", "status");

-- CreateIndex
CREATE INDEX "bundle_analytics_shop_idx" ON "public"."bundle_analytics"("shop");

-- CreateIndex
CREATE INDEX "bundle_analytics_bundleRuleId_idx" ON "public"."bundle_analytics"("bundleRuleId");

-- CreateIndex
CREATE INDEX "order_conversions_shop_idx" ON "public"."order_conversions"("shop");

-- CreateIndex
CREATE INDEX "order_conversions_orderId_idx" ON "public"."order_conversions"("orderId");

-- CreateIndex
CREATE INDEX "order_conversions_bundleRuleId_idx" ON "public"."order_conversions"("bundleRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "order_conversions_shop_orderId_key" ON "public"."order_conversions"("shop", "orderId");

-- CreateIndex
CREATE INDEX "fulfillment_providers_shop_idx" ON "public"."fulfillment_providers"("shop");

-- CreateIndex
CREATE INDEX "fulfillment_providers_shop_status_idx" ON "public"."fulfillment_providers"("shop", "status");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_shop_key" ON "public"."app_settings"("shop");

-- AddForeignKey
ALTER TABLE "public"."bundle_analytics" ADD CONSTRAINT "bundle_analytics_bundleRuleId_fkey" FOREIGN KEY ("bundleRuleId") REFERENCES "public"."bundle_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_conversions" ADD CONSTRAINT "order_conversions_bundleRuleId_fkey" FOREIGN KEY ("bundleRuleId") REFERENCES "public"."bundle_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
