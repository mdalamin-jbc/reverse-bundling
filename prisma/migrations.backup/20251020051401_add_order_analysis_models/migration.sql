-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false
);

-- CreateTable
CREATE TABLE "bundle_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "bundledSku" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "frequency" INTEGER NOT NULL DEFAULT 0,
    "savings" REAL NOT NULL DEFAULT 0.0,
    "category" TEXT,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "bundle_analytics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "bundleRuleId" TEXT NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "savingsAmount" REAL NOT NULL DEFAULT 0.0,
    "period" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bundle_analytics_bundleRuleId_fkey" FOREIGN KEY ("bundleRuleId") REFERENCES "bundle_rules" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "order_conversions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "originalItems" TEXT NOT NULL,
    "bundledSku" TEXT NOT NULL,
    "bundleRuleId" TEXT NOT NULL,
    "savingsAmount" REAL NOT NULL,
    "convertedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "order_conversions_bundleRuleId_fkey" FOREIGN KEY ("bundleRuleId") REFERENCES "bundle_rules" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fulfillment_providers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "webhookUrl" TEXT,
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSyncAt" DATETIME,
    "ordersProcessed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "slackWebhook" TEXT,
    "autoConvertOrders" BOOLEAN NOT NULL DEFAULT true,
    "minimumSavings" REAL NOT NULL DEFAULT 0.0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "bundle_rules_shop_idx" ON "bundle_rules"("shop");

-- CreateIndex
CREATE INDEX "bundle_rules_shop_status_idx" ON "bundle_rules"("shop", "status");

-- CreateIndex
CREATE INDEX "bundle_analytics_shop_idx" ON "bundle_analytics"("shop");

-- CreateIndex
CREATE INDEX "bundle_analytics_bundleRuleId_idx" ON "bundle_analytics"("bundleRuleId");

-- CreateIndex
CREATE INDEX "order_conversions_shop_idx" ON "order_conversions"("shop");

-- CreateIndex
CREATE INDEX "order_conversions_orderId_idx" ON "order_conversions"("orderId");

-- CreateIndex
CREATE INDEX "order_conversions_bundleRuleId_idx" ON "order_conversions"("bundleRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "order_conversions_shop_orderId_key" ON "order_conversions"("shop", "orderId");

-- CreateIndex
CREATE INDEX "fulfillment_providers_shop_idx" ON "fulfillment_providers"("shop");

-- CreateIndex
CREATE INDEX "fulfillment_providers_shop_status_idx" ON "fulfillment_providers"("shop", "status");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_shop_key" ON "app_settings"("shop");
