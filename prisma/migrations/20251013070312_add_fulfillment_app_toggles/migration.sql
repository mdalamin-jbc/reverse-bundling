-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_app_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "slackWebhook" TEXT,
    "autoConvertOrders" BOOLEAN NOT NULL DEFAULT true,
    "minimumSavings" REAL NOT NULL DEFAULT 0.0,
    "useShipStation" BOOLEAN NOT NULL DEFAULT false,
    "useShipBob" BOOLEAN NOT NULL DEFAULT false,
    "useFBA" BOOLEAN NOT NULL DEFAULT false,
    "useOtherFulfillment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_app_settings" ("autoConvertOrders", "createdAt", "emailNotifications", "id", "minimumSavings", "notificationsEnabled", "shop", "slackWebhook", "updatedAt") SELECT "autoConvertOrders", "createdAt", "emailNotifications", "id", "minimumSavings", "notificationsEnabled", "shop", "slackWebhook", "updatedAt" FROM "app_settings";
DROP TABLE "app_settings";
ALTER TABLE "new_app_settings" RENAME TO "app_settings";
CREATE UNIQUE INDEX "app_settings_shop_key" ON "app_settings"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
