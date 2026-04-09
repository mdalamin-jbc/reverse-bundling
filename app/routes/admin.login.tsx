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
          <div className={styles.loginLogo}>🔐</div>
          <h1 className={styles.loginTitle}>Admin Panel</h1>
          <p className={styles.loginSubtitle}>Reverse Bundle Pro — Management Console</p>
        </div>

        {actionData?.error && (
          <div className={styles.loginError}>{actionData.error}</div>
        )}

        <Form method="post">
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="password">Admin Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className={styles.formInput}
              placeholder="Enter admin password"
              autoFocus
              required
            />
          </div>
          <button type="submit" className={styles.loginBtn} disabled={isSubmitting}>
            {isSubmitting ? "Authenticating..." : "Sign In"}
          </button>
        </Form>
      </div>
    </div>
  );
}
