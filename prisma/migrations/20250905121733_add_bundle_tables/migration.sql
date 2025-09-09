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
