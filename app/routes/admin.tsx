import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useLocation, Form } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  // Skip auth check for login page to avoid redirect loop
  if (url.pathname === "/admin/login") {
    return json({ merchantCount: 0, ruleCount: 0, conversionCount: 0, env: process.env.NODE_ENV || "production", isLogin: true });
  }

  await requireAdmin(request);

  const [merchantCount, ruleCount, conversionCount] = await Promise.all([
    db.session.findMany({ distinct: ["shop"], select: { shop: true } }).then(s => s.length),
    db.bundleRule.count(),
    db.orderConversion.count(),
  ]);

  return json({
    merchantCount,
    ruleCount,
    conversionCount,
    env: process.env.NODE_ENV || "production",
    isLogin: false,
  });
};

const navItems = [
  { label: "Dashboard", icon: "📊", href: "/admin", end: true },
  { label: "Merchants", icon: "🏪", href: "/admin/merchants" },
  { label: "Analytics", icon: "📈", href: "/admin/analytics" },
  { label: "System Health", icon: "💚", href: "/admin/system" },
  { label: "Settings", icon: "⚙️", href: "/admin/settings" },
];

export default function AdminLayout() {
  const { merchantCount, ruleCount, conversionCount, env, isLogin } = useLoaderData<typeof loader>();
  const location = useLocation();

  // Login page renders without the admin layout chrome
  if (isLogin || location.pathname === "/admin/login") {
    return <Outlet />;
  }

  const isActive = (href: string, end?: boolean) => {
    if (end) return location.pathname === href;
    return location.pathname.startsWith(href);
  };

  const pageTitle = (() => {
    if (location.pathname === "/admin") return "Dashboard";
    if (location.pathname.includes("/merchants/")) return "Merchant Details";
    if (location.pathname.includes("/merchants")) return "Merchants";
    if (location.pathname.includes("/analytics")) return "Analytics";
    if (location.pathname.includes("/system")) return "System Health";
    if (location.pathname.includes("/settings")) return "Settings";
    return "Admin";
  })();

  return (
    <div className={styles.adminLayout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <Link to="/admin" className={styles.sidebarLogo}>
            <span className={styles.logoIcon}>📦</span>
            <div>
              <span className={styles.logoText}>Reverse Bundle Pro</span>
              <span className={styles.logoSub}>Admin Console</span>
            </div>
          </Link>
        </div>

        <nav className={styles.sidebarNav}>
          <div className={styles.navSection}>
            <div className={styles.navSectionTitle}>Main</div>
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={`${styles.navLink} ${isActive(item.href, item.end) ? styles.navLinkActive : ""}`}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
                {item.label === "Merchants" && (
                  <span className={styles.navBadge}>{merchantCount}</span>
                )}
              </Link>
            ))}
          </div>

          <div className={styles.navSection}>
            <div className={styles.navSectionTitle}>Quick Stats</div>
            <div style={{ padding: "0 12px", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Merchants</span>
                <span style={{ color: "#a5b4fc", fontWeight: 600 }}>{merchantCount}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span>Bundle Rules</span>
                <span style={{ color: "#a5b4fc", fontWeight: 600 }}>{ruleCount}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Conversions</span>
                <span style={{ color: "#a5b4fc", fontWeight: 600 }}>{conversionCount}</span>
              </div>
            </div>
          </div>
        </nav>

        <div className={styles.sidebarFooter}>
          <Form method="post" action="/admin/logout">
            <button type="submit" className={styles.logoutBtn}>
              <span>🚪</span> Sign Out
            </button>
          </Form>
        </div>
      </aside>

      {/* Main */}
      <div className={styles.mainContent}>
        <div className={styles.topBar}>
          <h1 className={styles.pageTitle}>{pageTitle}</h1>
          <div className={styles.topBarRight}>
            <span className={`${styles.envBadge} ${env === "production" ? styles.envProd : styles.envDev}`}>
              {env}
            </span>
            <span className={styles.currentTime}>
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </div>
        <div className={styles.pageContent}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
