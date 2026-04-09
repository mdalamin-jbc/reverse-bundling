import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useLocation, Form } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.pathname === "/admin/login") {
    return json({
      merchantCount: 0, ruleCount: 0, conversionCount: 0,
      totalSavings: 0, env: process.env.NODE_ENV || "production", isLogin: true,
    });
  }

  await requireAdmin(request);

  const [merchants, ruleCount, conversionCount, savingsAgg] = await Promise.all([
    db.session.findMany({ distinct: ["shop"], select: { shop: true } }),
    db.bundleRule.count(),
    db.orderConversion.count(),
    db.orderConversion.aggregate({ _sum: { savingsAmount: true } }),
  ]);

  return json({
    merchantCount: merchants.length,
    ruleCount,
    conversionCount,
    totalSavings: savingsAgg._sum.savingsAmount || 0,
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
  const data = useLoaderData<typeof loader>();
  const location = useLocation();

  if (data.isLogin || location.pathname === "/admin/login") {
    return <Outlet />;
  }

  const { merchantCount, ruleCount, conversionCount, totalSavings, env } = data;

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
            <div className={styles.navSectionTitle}>Navigation</div>
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={`${styles.navLink} ${isActive(item.href, item.end) ? styles.navLinkActive : ""}`}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
                {item.label === "Merchants" && merchantCount > 0 && (
                  <span className={styles.navBadge}>{merchantCount}</span>
                )}
              </Link>
            ))}
          </div>

          <div className={styles.navSection}>
            <div className={styles.navSectionTitle}>Overview</div>
            <div style={{ padding: "0 14px", fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: "rgba(255,255,255,0.4)" }}>
                <span>Merchants</span>
                <span style={{ color: "#a5b4fc", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{merchantCount}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: "rgba(255,255,255,0.4)" }}>
                <span>Bundle Rules</span>
                <span style={{ color: "#a5b4fc", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{ruleCount}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: "rgba(255,255,255,0.4)" }}>
                <span>Conversions</span>
                <span style={{ color: "#a5b4fc", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{conversionCount}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: "rgba(255,255,255,0.4)" }}>
                <span>Total Savings</span>
                <span style={{ color: "#34d399", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>${totalSavings.toFixed(2)}</span>
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
