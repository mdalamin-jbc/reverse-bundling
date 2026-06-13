import db from "./db.server";
import { cache } from "./cache.server";

const SHOPIFY_API_VERSION = "2025-01";
const CONTACT_CACHE_TTL_MS = 60 * 60 * 1000;

export type MerchantContact = {
  email: string | null;
  name: string;
};

function shopDisplayName(shop: string): string {
  return shop.replace(".myshopify.com", "");
}

async function fetchShopContactFromShopify(
  shop: string,
  accessToken: string
): Promise<MerchantContact | null> {
  try {
    const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: `{ shop { name email contactEmail shopOwnerName } }`,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const shopData = payload.data?.shop;
    if (!shopData) {
      return null;
    }

    return {
      email: shopData.contactEmail || shopData.email || null,
      name: shopData.shopOwnerName || shopData.name || shopDisplayName(shop),
    };
  } catch {
    return null;
  }
}

export async function getMerchantContact(shop: string): Promise<MerchantContact> {
  const cacheKey = `merchant-contact:${shop}`;
  const cached = cache.get<MerchantContact>(cacheKey);
  if (cached) {
    return cached;
  }

  const session = await db.session.findFirst({
    where: { shop },
    select: { email: true, firstName: true, lastName: true, accessToken: true, isOnline: true },
    orderBy: { id: "desc" },
  });

  if (session?.email) {
    const contact: MerchantContact = {
      email: session.email,
      name:
        [session.firstName, session.lastName].filter(Boolean).join(" ") ||
        shopDisplayName(shop),
    };
    cache.set(cacheKey, contact, CONTACT_CACHE_TTL_MS);
    return contact;
  }

  const offlineSession =
    session?.isOnline === false && session.accessToken
      ? session
      : await db.session.findFirst({
          where: { shop, isOnline: false },
          select: { accessToken: true },
        });

  if (offlineSession?.accessToken) {
    const shopContact = await fetchShopContactFromShopify(shop, offlineSession.accessToken);
    if (shopContact?.email) {
      cache.set(cacheKey, shopContact, CONTACT_CACHE_TTL_MS);
      return shopContact;
    }
  }

  const fallback: MerchantContact = {
    email: null,
    name:
      [session?.firstName, session?.lastName].filter(Boolean).join(" ") ||
      shopDisplayName(shop),
  };
  return fallback;
}
