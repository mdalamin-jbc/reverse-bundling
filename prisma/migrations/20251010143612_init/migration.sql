-- CreateIndex
CREATE INDEX "bundle_analytics_shop_idx" ON "bundle_analytics"("shop");

-- CreateIndex
CREATE INDEX "bundle_analytics_bundleRuleId_idx" ON "bundle_analytics"("bundleRuleId");

-- CreateIndex
CREATE INDEX "bundle_rules_shop_idx" ON "bundle_rules"("shop");

-- CreateIndex
CREATE INDEX "bundle_rules_shop_status_idx" ON "bundle_rules"("shop", "status");

-- CreateIndex
CREATE INDEX "order_conversions_shop_idx" ON "order_conversions"("shop");

-- CreateIndex
CREATE INDEX "order_conversions_orderId_idx" ON "order_conversions"("orderId");

-- CreateIndex
CREATE INDEX "order_conversions_bundleRuleId_idx" ON "order_conversions"("bundleRuleId");
