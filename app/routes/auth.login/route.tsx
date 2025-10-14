import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { login } from "../../shopify.server";

import { loginErrorMessage } from "./error.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return { errors, polarisTranslations };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const shopRaw = formData.get("shop") as string;

  // Extract domain from various URL formats
  let shop = shopRaw?.trim();

  if (shop) {
    // Handle admin.shopify.com/store/store-name format
    if (shop.includes("admin.shopify.com/store/")) {
      const match = shop.match(/admin\.shopify\.com\/store\/([a-zA-Z0-9][a-zA-Z0-9-]*)/);
      if (match) {
        shop = `${match[1]}.myshopify.com`;
      }
    }
    // Handle full URLs like https://store.myshopify.com or https://store.myshopify.com/
    else if (shop.includes("myshopify.com")) {
      const match = shop.match(/([a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com)/);
      if (match) {
        shop = match[1];
      }
    }
    // If it's already just the domain, keep it as is
  }

  // Create a new request with the processed shop parameter
  const newFormData = new FormData();
  newFormData.set("shop", shop);

  const newRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: newFormData,
  });

  const errors = loginErrorMessage(await login(newRequest));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <PolarisAppProvider i18n={loaderData.polarisTranslations}>
      <Page>
        <Card>
          <Form method="post">
            <FormLayout>
              <Text variant="headingMd" as="h2">
                Log in
              </Text>
              <TextField
                type="text"
                name="shop"
                label="Shop domain"
                helpText="your-store.myshopify.com or https://your-store.myshopify.com"
                value={shop}
                onChange={setShop}
                autoComplete="on"
                error={errors.shop}
              />
              <Button submit>Log in</Button>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
