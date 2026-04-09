import { type ActionFunctionArgs, type LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { adminLogin, requireAdmin } from "../admin-auth.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await requireAdmin(request);
    return redirect("/admin");
  } catch {
    return json({});
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
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginCard}>
        <div className={styles.loginHeader}>
          <div className={styles.loginLogo}>📦</div>
          <h1 className={styles.loginTitle}>Reverse Bundle Pro</h1>
          <p className={styles.loginSubtitle}>Admin Management Console</p>
        </div>

        {actionData?.error && (
          <div className={styles.loginError}>
            <span>⚠️</span> {actionData.error}
          </div>
        )}

        <Form method="post">
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="password">
              Admin Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className={styles.formInput}
              placeholder="Enter your admin password"
              autoFocus
              required
            />
          </div>
          <button type="submit" className={styles.loginBtn} disabled={isSubmitting}>
            {isSubmitting ? "Authenticating..." : "Sign In to Admin Panel"}
          </button>
        </Form>

        <div className={styles.loginFeatures}>
          <div className={styles.loginFeature}>
            <span className={styles.loginFeatureIcon}>🏪</span>
            <span>Merchant Management</span>
          </div>
          <div className={styles.loginFeature}>
            <span className={styles.loginFeatureIcon}>📊</span>
            <span>Live Analytics</span>
          </div>
          <div className={styles.loginFeature}>
            <span className={styles.loginFeatureIcon}>💚</span>
            <span>System Monitoring</span>
          </div>
          <div className={styles.loginFeature}>
            <span className={styles.loginFeatureIcon}>⚙️</span>
            <span>App Configuration</span>
          </div>
        </div>

        <div className={styles.loginFooter}>
          Protected admin area — Unauthorized access is prohibited
        </div>
      </div>
    </div>
  );
}
