import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate, redirectWithEmbeddedParams } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  // After successful authentication, redirect to main app UI
  return redirectWithEmbeddedParams(request, "/app");
};
