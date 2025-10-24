import { redirect } from "@remix-run/node";
import { logInfo } from "../logger.server";

// This route handles the typo redirect from Shopify billing
// Shopify sometimes redirects to /app/bolling instead of /app/billing
export const loader = async ({ request }: { request: Request }) => {
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");

  logInfo("Bolling redirect triggered", {
    context: {
      originalUrl: request.url,
      chargeId,
      timestamp: new Date().toISOString(),
    },
  });

  // Preserve the charge_id parameter when redirecting
  // Redirect to the correct billing page with preserved parameters
  const redirectUrl = chargeId
    ? `/app/billing?charge_id=${chargeId}`
    : "/app/billing";

  logInfo("Redirecting from bolling to billing", {
    context: {
      redirectUrl,
      chargeId,
      timestamp: new Date().toISOString(),
    },
  });

  return redirect(redirectUrl);
};

// Default export for the route
export default function BollingRedirect() {
  return null; // This should never render due to the redirect
}