import { type ActionFunctionArgs } from "@remix-run/node";
import { adminLogout } from "../admin-auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return adminLogout(request);
};

export const loader = async ({ request }: ActionFunctionArgs) => {
  return adminLogout(request);
};
