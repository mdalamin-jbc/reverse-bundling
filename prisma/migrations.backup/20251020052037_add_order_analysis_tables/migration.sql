-- CreateTable
CREATE TABLE "order_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "orderDate" DATETIME NOT NULL,
    "customerId" TEXT,
    "lineItems" TEXT NOT NULL,
    "totalValue" REAL NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "item_cooccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "itemA" TEXT NOT NULL,
    "itemB" TEXT NOT NULL,
    "cooccurrenceCount" INTEGER NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "confidence" REAL NOT NULL DEFAULT 0.0,
    "lift" REAL NOT NULL DEFAULT 0.0,
    "lastAnalyzed" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "bundle_suggestions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.0,
    "potentialSavings" REAL NOT NULL DEFAULT 0.0,
    "orderFrequency" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "appliedRuleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "order_history_shop_idx" ON "order_history"("shop");

-- CreateIndex
CREATE INDEX "order_history_shop_processed_idx" ON "order_history"("shop", "processed");

-- CreateIndex
CREATE INDEX "order_history_shop_orderDate_idx" ON "order_history"("shop", "orderDate");

-- CreateIndex
CREATE UNIQUE INDEX "order_history_shop_orderId_key" ON "order_history"("shop", "orderId");

-- CreateIndex
CREATE INDEX "item_cooccurrence_shop_idx" ON "item_cooccurrence"("shop");

-- CreateIndex
CREATE INDEX "item_cooccurrence_shop_confidence_idx" ON "item_cooccurrence"("shop", "confidence");

-- CreateIndex
CREATE INDEX "item_cooccurrence_shop_cooccurrenceCount_idx" ON "item_cooccurrence"("shop", "cooccurrenceCount");

-- CreateIndex
CREATE UNIQUE INDEX "item_cooccurrence_shop_itemA_itemB_key" ON "item_cooccurrence"("shop", "itemA", "itemB");

-- CreateIndex
CREATE INDEX "bundle_suggestions_shop_idx" ON "bundle_suggestions"("shop");

-- CreateIndex
CREATE INDEX "bundle_suggestions_shop_status_idx" ON "bundle_suggestions"("shop", "status");

-- CreateIndex
CREATE INDEX "bundle_suggestions_shop_confidence_idx" ON "bundle_suggestions"("shop", "confidence");

-- CreateIndex
CREATE INDEX "bundle_suggestions_shop_potentialSavings_idx" ON "bundle_suggestions"("shop", "potentialSavings");
