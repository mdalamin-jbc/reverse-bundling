import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { logInfo, logError } from "../logger.server";
import { purgeShopData } from "../shop-cleanup.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let shop = "unknown";

  try {
    const { shop: authenticatedShop } = await authenticate.webhook(request);
    shop = authenticatedShop;

    logInfo(`App uninstalled — purging all data for ${shop}`);
    const result = await purgeShopData(shop);
    logInfo(`Uninstall cleanup complete for ${shop}`, result.deleted);
  } catch (error) {
    logError(error as Error, { context: "app/uninstalled webhook", shop });
    // Return 200 so Shopify does not retry indefinitely
  }

  return new Response();
};
