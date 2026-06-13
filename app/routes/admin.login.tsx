import { type ActionFunctionArgs, type LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import type { MetaFunction } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { adminLogin, requireAdmin } from "../admin-auth.server";
import { IconBundle } from "../components/AdminIcons";
import db from "../db.server";
import { getInstalledShopDomains } from "../shop-cleanup.server";
import styles from "./styles/admin.module.css";

export const meta: MetaFunction = () => [
  { title: "Sign in — Reverse Bundle Pro Admin" },
  { name: "robots", content: "noindex, nofollow" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await requireAdmin(request);
    return redirect("/admin");
  } catch {
    let dbHealthy = false;
    try {
      await db.$queryRaw`SELECT 1`;
      dbHealthy = true;
    } catch {
      dbHealthy = false;
    }

    const [installedShops, conversionCount, savingsAgg] = await Promise.all([
      getInstalledShopDomains(),
      db.orderConversion.count(),
      db.orderConversion.aggregate({ _sum: { savingsAmount: true } }),
    ]);
    const merchantCount = installedShops.length;

    return json({
      dbHealthy,
      merchantCount,
      conversionCount,
      totalSavings: savingsAgg._sum.savingsAmount || 0,
      appUrl: process.env.SHOPIFY_APP_URL || "https://reverse-bundling.me",
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const password = formData.get("password") as string;

  if (!password) {
    return json({ error: "Password is required" }, { status: 400 });
  }

  const result = await adminLogin(request, password);

  if ("error" in result) {
    return json({ error: result.error }, { status: 401 });
  }

  return redirect("/admin", { headers: result.headers! });
};

export default function AdminLogin() {
  const { dbHealthy, merchantCount, conversionCount, totalSavings, appUrl } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className={styles.loginShell}>
      <div className={styles.loginBrandPanel}>
        <div className={styles.loginBrandInner}>
          <div className={styles.loginBrandLogo}>
            <IconBundle className={styles.loginBrandLogoIcon} />
          </div>
          <h1 className={styles.loginBrandTitle}>Reverse Bundle Pro</h1>
          <p className={styles.loginBrandTagline}>
            Operations console for merchant onboarding, bundle performance, and production health.
          </p>

          <div className={styles.loginLiveStats}>
            <div className={styles.loginLiveStat}>
              <span className={styles.loginLiveStatValue}>{merchantCount}</span>
              <span className={styles.loginLiveStatLabel}>Merchants</span>
            </div>
            <div className={styles.loginLiveStat}>
              <span className={styles.loginLiveStatValue}>{conversionCount}</span>
              <span className={styles.loginLiveStatLabel}>Conversions</span>
            </div>
            <div className={styles.loginLiveStat}>
              <span className={styles.loginLiveStatValue}>${totalSavings.toFixed(0)}</span>
              <span className={styles.loginLiveStatLabel}>Savings</span>
            </div>
          </div>

          <div className={styles.loginSystemPill}>
            <span
              className={`${styles.healthDot} ${dbHealthy ? styles.healthGreen : styles.healthRed}`}
            />
            {dbHealthy ? "Production database connected" : "Database unreachable"}
          </div>

          <ul className={styles.loginChecklist}>
            <li>Review at-risk merchants weekly</li>
            <li>Track pipeline: install → rules → conversions</li>
            <li>Monitor webhooks &amp; system health daily</li>
          </ul>
        </div>
      </div>

      <div className={styles.loginFormPanel}>
        <div className={styles.loginFormCard}>
          <div className={styles.loginFormHeader}>
            <h2 className={styles.loginFormTitle}>Sign in</h2>
            <p className={styles.loginFormSubtitle}>Authorized operators only</p>
          </div>

          {actionData?.error && (
            <div className={styles.loginError} role="alert">
              {actionData.error}
            </div>
          )}

          <Form method="post" className={styles.loginForm}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="password">
                Admin password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                className={styles.formInput}
                placeholder="Enter your password"
                autoComplete="current-password"
                autoFocus
                required
              />
            </div>
            <button type="submit" className={styles.loginBtn} disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in to console"}
            </button>
          </Form>

          <div className={styles.loginFormLinks}>
            <a href={`${appUrl}/system-status`} className={styles.loginLink}>
              System status
            </a>
            <span className={styles.loginLinkDivider}>·</span>
            <Link to="/" className={styles.loginLink}>
              Public site
            </Link>
          </div>

          <p className={styles.loginLegal}>
            Session expires after 8 hours. Unauthorized access is prohibited.
          </p>
        </div>
      </div>
    </div>
  );
}
