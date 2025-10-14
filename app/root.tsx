import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
  <link rel="icon" href="/favicon.ico" type="image/x-icon" />
  <Meta />
  <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}export function ErrorBoundary() {
  const error = useRouteError();

  let errorMessage = "An unexpected error occurred";
  let errorDetails = "";

  if (isRouteErrorResponse(error)) {
    errorMessage = `${error.status} ${error.statusText}`;
    errorDetails = error.data;
  } else if (error instanceof Error) {
    errorMessage = error.message;
    errorDetails = error.stack || "";
  }

  return (
    <html>
      <head>
        <title>Error - Reverse Bundle Pro</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <div style={{
          padding: "2rem",
          maxWidth: "800px",
          margin: "0 auto",
          fontFamily: "system-ui, sans-serif"
        }}>
          <h1 style={{ color: "#dc2626" }}>⚠️ Application Error</h1>
          <div style={{
            backgroundColor: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            padding: "1rem",
            marginTop: "1rem"
          }}>
            <h2 style={{ margin: "0 0 0.5rem 0" }}>{errorMessage}</h2>
            {errorDetails && (
              <pre style={{
                backgroundColor: "white",
                padding: "1rem",
                borderRadius: "4px",
                overflow: "auto",
                fontSize: "0.875rem"
              }}>
                {errorDetails}
              </pre>
            )}
          </div>
          <div style={{ marginTop: "2rem" }}>
            <a
              href="/app"
              style={{
                display: "inline-block",
                backgroundColor: "#2563eb",
                color: "white",
                padding: "0.75rem 1.5rem",
                borderRadius: "6px",
                textDecoration: "none",
                fontWeight: "500"
              }}
            >
              Return to Dashboard
            </a>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}