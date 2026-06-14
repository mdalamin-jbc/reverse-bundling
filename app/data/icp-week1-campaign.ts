import type { ProspectNiche } from "../email.server";

export type CampaignProspectSeed = {
  storeName: string;
  storeUrl: string;
  email: string;
  niche: ProspectNiche;
  contactName?: string;
  hook?: string;
  alignmentScore: number;
  fulfillmentSignal: string;
  campaignDay: number;
};

/**
 * Week 1 cold campaign target: 20 emails/day × 7 days = 140.
 * Only Shopify stores (.myshopify.com) are eligible to install Reverse Bundle Pro.
 * Add more rows here to fill empty day slots — keep campaignDay 1-7 and unique emails.
 */
export const WEEK1_CAMPAIGN_ID = "week-1";
export const WEEK1_DAILY_CAP = 20;
export const WEEK1_DAYS = 7;

export const WEEK1_CAMPAIGN_PROSPECTS: CampaignProspectSeed[] = [
  // ── Day 1 — supplements, beauty, accessories (Shopify verified) ──
  { campaignDay: 1, storeName: "Forevervital", storeUrl: "https://forever-vital.myshopify.com", email: "support@forevervital.com", niche: "supplements", alignmentScore: 88, fulfillmentSignal: "Shopify · multi-bottle wellness orders", hook: "Wellness stacks that ship together are ideal for reverse bundling before pick-and-pack." },
  { campaignDay: 1, storeName: "Premium Nutrition USA", storeUrl: "https://supplements-green.myshopify.com", email: "support@premiumnutritionusa.com", niche: "supplements", alignmentScore: 86, fulfillmentSignal: "Shopify · multi-SKU catalog" },
  { campaignDay: 1, storeName: "Labie Wellness", storeUrl: "https://labiewellness.myshopify.com", email: "labiewellness@gmail.com", niche: "supplements", alignmentScore: 90, fulfillmentSignal: "Shopify · bundle-and-save 3+ bottles", hook: "Your BUNDLE10 offers are exactly what reverse bundling automates at fulfillment." },
  { campaignDay: 1, storeName: "Ascension Nutrition", storeUrl: "https://8c8fbd-9e.myshopify.com", email: "customerservice@ascension-nutrition.com", niche: "supplements", alignmentScore: 87, fulfillmentSignal: "Shopify · nutrition stacks" },
  { campaignDay: 1, storeName: "Just Nutritive", storeUrl: "https://just-nutritive-wholesale.myshopify.com", email: "contact@justnutritive.com", niche: "beauty", alignmentScore: 82, fulfillmentSignal: "Shopify · hair/skin routines", hook: "Routine bundles (shampoo + conditioner + treatment) are a strong reverse-bundle use case." },
  { campaignDay: 1, storeName: "Toi Beauty", storeUrl: "https://9c8524-3.myshopify.com", email: "info@toibeauty.com", niche: "beauty", alignmentScore: 85, fulfillmentSignal: "Shopify · beauty kits US/CA" },
  { campaignDay: 1, storeName: "Beauty Packs", storeUrl: "https://beautypacks.myshopify.com", email: "support@puppykits.co", niche: "beauty", alignmentScore: 91, fulfillmentSignal: "Shopify · pre-built beauty packs", hook: "Multi-item beauty packs should ship as one bundle SKU before ShipStation/ShipBob sync." },
  { campaignDay: 1, storeName: "Yasmin Shah", storeUrl: "https://yasmin-shah.myshopify.com", email: "info@yasminshah.com", niche: "beauty", alignmentScore: 84, fulfillmentSignal: "Shopify · multi-SKU beauty" },
  { campaignDay: 1, storeName: "Nomenvi", storeUrl: "https://yb6da0-vf.myshopify.com", email: "valerie@nomenvi.com", niche: "beauty", alignmentScore: 83, fulfillmentSignal: "Shopify · skincare multi-product" },
  { campaignDay: 1, storeName: "Play Game With Phone", storeUrl: "https://play-game-with-phone.myshopify.com", email: "support@play-game-with-phone.com", niche: "accessories", alignmentScore: 89, fulfillmentSignal: "Shopify · case + accessory bundles", hook: "Case + charger + grip orders are our highest-converting accessory bundle pattern." },
  { campaignDay: 1, storeName: "PhoneCladding", storeUrl: "https://phonecladding.myshopify.com", email: "phonecladding@gmail.com", niche: "accessories", alignmentScore: 86, fulfillmentSignal: "Shopify · case + protector pairs" },
  { campaignDay: 1, storeName: "Vaillent Coffee", storeUrl: "https://8fa8f5-3.myshopify.com", email: "info@vaillentcoffee.com", niche: "supplements", alignmentScore: 78, fulfillmentSignal: "Shopify · coffee + add-on SKUs" },
  { campaignDay: 1, storeName: "CBD Superstore", storeUrl: "https://cbd-superstore.myshopify.com", email: "support@proteambrady.com", niche: "supplements", alignmentScore: 80, fulfillmentSignal: "Shopify · multi-product CBD" },
  { campaignDay: 1, storeName: "Dropship Beauty", storeUrl: "https://dropship-beauty-16.myshopify.com", email: "support@dropshipbeauty.app", niche: "beauty", alignmentScore: 72, fulfillmentSignal: "Shopify · beauty multi-SKU" },
  { campaignDay: 1, storeName: "Karis Beauty Supply", storeUrl: "https://karis-beauty-supply.myshopify.com", email: "karisbeauty16@gmail.com", niche: "beauty", alignmentScore: 81, fulfillmentSignal: "Shopify · beauty supply kits" },
  { campaignDay: 1, storeName: "Shop T Beauty", storeUrl: "https://shoptabeauty.myshopify.com", email: "tabeautyinfo@gmail.com", niche: "beauty", alignmentScore: 80, fulfillmentSignal: "Shopify · beauty multi-SKU" },
  { campaignDay: 1, storeName: "Latest Phone Accessories", storeUrl: "https://latestphoneaccessories.myshopify.com", email: "nayeemsarkar2@gmail.com", niche: "accessories", alignmentScore: 79, fulfillmentSignal: "Shopify · phone accessory pairs" },
  { campaignDay: 1, storeName: "Anas Auto Accessories", storeUrl: "https://bzffkp-kc.myshopify.com", email: "nsauto.pro@hotmail.com", niche: "accessories", alignmentScore: 74, fulfillmentSignal: "Shopify · multi-part orders", contactName: "Anas" },

  // ── Day 2 — verified Shopify contacts only (add more to reach 20/day) ──
  { campaignDay: 2, storeName: "The Mobile Marvel", storeUrl: "https://yogest-store.myshopify.com", email: "mo@themobilemarvel.com", niche: "accessories", alignmentScore: 90, fulfillmentSignal: "Shopify · accessory bundles, warehouse", hook: "Accessory bundles (case + charger + protector) convert well to one bundle SKU before 3PL sync." },
  { campaignDay: 2, storeName: "Mobile Marvel Sales", storeUrl: "https://yogest-store.myshopify.com", email: "sales@themobilemarvel.com", niche: "accessories", alignmentScore: 88, fulfillmentSignal: "Shopify · multi-item accessories" },
  { campaignDay: 2, storeName: "Pro Team Brady Wholesale", storeUrl: "https://cbd-superstore.myshopify.com", email: "wholesale@proteambrady.com", niche: "supplements", alignmentScore: 75, fulfillmentSignal: "Shopify · wholesale multi-SKU" },

  // ── Day 3 — highest-fit ICP (verified Shopify + public email, June 2026) ──
  { campaignDay: 3, storeName: "My Pro Essentials", storeUrl: "https://my-pro-essentials.myshopify.com", email: "support@myproessentials.com", niche: "accessories", alignmentScore: 96, fulfillmentSignal: "Shopify · workstation kits · bundled items ship separately", hook: "Your kits note that bundled items do not ship together — Reverse Bundle Pro merges them into one bundle SKU before fulfillment." },
  { campaignDay: 3, storeName: "InstaNatural", storeUrl: "https://instanatural.myshopify.com", email: "cs@instanatural.com", niche: "beauty", alignmentScore: 92, fulfillmentSignal: "Shopify · 4-step Vitamin C kit", hook: "Your 4-step Vitamin C kit is a perfect reverse-bundle case — one bundle SKU instead of four pick lines." },
  { campaignDay: 3, storeName: "QMS Medicosmetics", storeUrl: "https://qmsmedicosmetics-com.myshopify.com", email: "customerservice@qmsmedicosmetics.com", niche: "beauty", alignmentScore: 91, fulfillmentSignal: "Shopify · 3-step core routine set", hook: "Day + night 3-step sets should ship as one bundle SKU to your warehouse, not three separate picks." },
  { campaignDay: 3, storeName: "VanityMD", storeUrl: "https://vanitymd.myshopify.com", email: "contact@vanitymd.com", niche: "beauty", alignmentScore: 90, fulfillmentSignal: "Shopify · 6-product daily renewal system", hook: "Your Complete Daily Renewing System is exactly what reverse bundling automates at pick-and-pack." },
  { campaignDay: 3, storeName: "Nervexol", storeUrl: "https://nervexol-new.myshopify.com", email: "support@nervexol.com", niche: "supplements", alignmentScore: 89, fulfillmentSignal: "Shopify · Ultimate Nerve Repair Bundle · Subscribe & Save", hook: "Multi-bottle nerve repair bundles and subscriptions are ideal for one bundle SKU before ShipStation sync." },
  { campaignDay: 3, storeName: "BN8 Phone & Gaming", storeUrl: "https://bn8phone-gamingstore.myshopify.com", email: "customercare@bn8onlinestore.com.au", niche: "accessories", alignmentScore: 88, fulfillmentSignal: "Shopify · case + protector + charger combos", hook: "Case + screen protector + charger orders convert well to one bundle SKU before fulfillment." },
  { campaignDay: 3, storeName: "Emerage Cosmetics", storeUrl: "https://emerage-cosmetics.myshopify.com", email: "support@emeragecosmetics.com", niche: "beauty", alignmentScore: 88, fulfillmentSignal: "Shopify · Dr. Emer multi-SKU professional skincare", hook: "Professional skincare routines with multiple SKUs per order are a strong reverse-bundle fit." },
  { campaignDay: 3, storeName: "Midi Health Supplements", storeUrl: "https://ecq1dz-8t.myshopify.com", email: "store@joinmidi.com", niche: "supplements", alignmentScore: 87, fulfillmentSignal: "Shopify · tiered multi-bottle wellness carts", hook: "Your spend-more-save-more stacks push multi-bottle orders — reverse bundling collapses them to one SKU at fulfillment." },
  { campaignDay: 3, storeName: "Telos Nutraceuticals", storeUrl: "https://telos-nutraceuticals.myshopify.com", email: "info@telosfxnlmed.com", niche: "supplements", alignmentScore: 86, fulfillmentSignal: "Shopify · clinic supplement stacks · same-day ship", hook: "Integrative supplement stacks that ship same-day benefit from one bundle SKU before pick-and-pack." },
  { campaignDay: 3, storeName: "Malezia Skin", storeUrl: "https://malezia-skin.myshopify.com", email: "contact@maleziaskin.com", niche: "beauty", alignmentScore: 85, fulfillmentSignal: "Shopify · acne routine multi-product", hook: "Routine orders (treatment + moisturizer + oil) ship cleaner as one bundle SKU to your warehouse." },

  // ── Days 4-7: add 20 Shopify prospects per day (unique emails, .myshopify.com URLs) ──
];
