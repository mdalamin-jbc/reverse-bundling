import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu, TitleBar } from "@shopify/app-bridge-react";
import { Banner, Box } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { getMerchantBillingStatus } from "../billing.server";
import { buildBillingAlert, maybeNotifyMerchantBilling } from "../billing-notifications.server";
import { isSetupExemptPath, shopNeedsSetup } from "../onboarding.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const pathname = new URL(request.url).pathname;

  if ((await shopNeedsSetup(session.shop)) && !isSetupExemptPath(pathname)) {
    throw redirect("/app/setup-wizard");
  }

  let billingAlert = null;
  try {
    const billing = await getMerchantBillingStatus(session.shop, admin);
    billingAlert = buildBillingAlert(billing);
    void maybeNotifyMerchantBilling(session.shop, billing);
  } catch {
    billingAlert = null;
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "", billingAlert };
};

export default function App() {
  const { apiKey, billingAlert } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <TitleBar title="Reverse Bundle Pro" />
      <NavMenu>
        <Link to="/app/bundle-rules">Bundle Rules</Link>
        <Link to="/app/orders">Order Conversions</Link>
        <Link to="/app/fulfillment">Fulfillment Provider</Link>
        <Link to="/app/analytics">Reports & Analytics</Link>
        <Link to="/app/billing">Billing</Link>
        <Link to="/app/guidelines">Easy Tutorial Guide</Link>
        <Link to="/app/settings">Settings</Link>
      </NavMenu>
      {billingAlert && (
        <Box paddingBlockStart="400" paddingInline="400">
          <Banner
            tone={billingAlert.tone}
            title={billingAlert.title}
            action={{ content: billingAlert.actionLabel, url: billingAlert.actionUrl }}
          >
            <p>{billingAlert.message}</p>
          </Banner>
        </Box>
      )}
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
