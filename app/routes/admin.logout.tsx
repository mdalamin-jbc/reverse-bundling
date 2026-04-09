import { redirect } from "@remix-run/node";
import { adminLogout } from "../admin-auth.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

export const action = async ({ request }: ActionFunctionArgs) => {
  return adminLogout(request);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return adminLogout(request);
};
