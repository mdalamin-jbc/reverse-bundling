import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useLocation, Form } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import {
  IconAnalytics,
  IconDashboard,
  IconHealth,
  IconMerchants,
  IconSettings,
  IconBundle,
} from "../components/AdminIcons";
import db from "../db.server";
import { getMerchantStage } from "../merchant-health.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.pathname === "/admin/login") {
    return json({ isLogin: true as const });
  }

  await requireAdmin(request);

  const [sessions, ruleCount, conversionCount, savingsAgg] = await Promise.all([
    db.session.findMany({ distinct: ["shop"], select: { shop: true } }),
    db.bundleRule.count(),
    db.orderConversion.count(),
    db.orderConversion.aggregate({ _sum: { savingsAmount: true } }),
  ]);

  let atRiskCount = 0;
  for (const { shop } of sessions) {
    const [activeRuleCount, conversionCount, settings] = await Promise.all([
      db.bundleRule.count({ where: { shop, status: "active" } }),
      db.orderConversion.count({ where: { shop } }),
      db.appSettings.findFirst({ where: { shop }, select: { createdAt: true } }),
    ]);
    const daysSinceFirst = settings?.createdAt
      ? Math.floor((Date.now() - settings.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const stage = getMerchantStage({
      configured: !!settings,
      activeRuleCount,
      conversionCount,
      daysSinceFirstActivity: daysSinceFirst,
    });
    if (stage === "at_risk") atRiskCount++;
  }

  let dbHealthy = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbHealthy = false;
  }

  return json({
    isLogin: false as const,
    merchantCount: sessions.length,
    ruleCount,
    conversionCount,
    totalSavings: savingsAgg._sum.savingsAmount || 0,
    atRiskCount,
    dbHealthy,
    env: process.env.NODE_ENV || "production",
  });
};

const navItems = [
  { label: "Dashboard", href: "/admin", end: true, Icon: IconDashboard },
  { label: "Merchants", href: "/admin/merchants", Icon: IconMerchants },
  { label: "Analytics", href: "/admin/analytics", Icon: IconAnalytics },
  { label: "System", href: "/admin/system", Icon: IconHealth },
  { label: "Settings", href: "/admin/settings", Icon: IconSettings },
];

export default function AdminLayout() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();

  if (data.isLogin || location.pathname === "/admin/login") {
    return <Outlet />;
  }

  const { merchantCount, atRiskCount, dbHealthy, env } = data;

  const isActive = (href: string, end?: boolean) => {
    if (end) return location.pathname === href;
    return location.pathname.startsWith(href);
  };

  const pageTitle = (() => {
    if (location.pathname === "/admin") return "Dashboard";
    if (location.pathname.includes("/merchants/")) return "Merchant";
    if (location.pathname.includes("/merchants")) return "Merchants";
    if (location.pathname.includes("/analytics")) return "Analytics";
    if (location.pathname.includes("/system")) return "System";
    if (location.pathname.includes("/settings")) return "Settings";
    return "Console";
  })();

  return (
    <div className={styles.adminLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <Link to="/admin" className={styles.sidebarLogo}>
            <span className={styles.logoIcon}>
              <IconBundle />
            </span>
            <div>
              <span className={styles.logoText}>Reverse Bundle Pro</span>
              <span className={styles.logoSub}>Operations</span>
            </div>
          </Link>
        </div>

        <nav className={styles.sidebarNav}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={`${styles.navLink} ${isActive(item.href, item.end) ? styles.navLinkActive : ""}`}
            >
              <span className={styles.navIcon}>
                <item.Icon />
              </span>
              {item.label}
              {item.label === "Merchants" && atRiskCount > 0 && (
                <span className={`${styles.navBadge} ${styles.navBadgeAlert}`}>{atRiskCount}</span>
              )}
              {item.label === "Merchants" && atRiskCount === 0 && merchantCount > 0 && (
                <span className={styles.navBadge}>{merchantCount}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.sidebarStatus}>
            <span className={`${styles.healthDot} ${dbHealthy ? styles.healthGreen : styles.healthRed}`} />
            <span>{dbHealthy ? "All systems operational" : "Database issue"}</span>
          </div>
          <Form method="post" action="/admin/logout">
            <button type="submit" className={styles.logoutBtn}>
              Sign out
            </button>
          </Form>
        </div>
      </aside>

      <div className={styles.mainContent}>
        <header className={styles.topBar}>
          <h1 className={styles.pageTitle}>{pageTitle}</h1>
          <div className={styles.topBarRight}>
            <span className={`${styles.envBadge} ${env === "production" ? styles.envProd : styles.envDev}`}>
              {env}
            </span>
          </div>
        </header>
        <main className={styles.pageContent}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
