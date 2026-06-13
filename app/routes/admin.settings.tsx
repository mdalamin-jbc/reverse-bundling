import { type LoaderFunctionArgs, type ActionFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link, useSearchParams } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import {
  cleanupUninstalledShops,
  getInstalledShopDomains,
  getSessionShopDomains,
} from "../shop-cleanup.server";
import {
  countQuickStuckCandidates,
  listQuickStuckCandidates,
  sendStuckMerchantOnboardingEmails,
} from "../merchant-outreach.server";
import {
  listOutreachProspectsPaginated,
  seedWeek1Campaign,
  sendCampaignDayBatch,
  getCampaignDayOverview,
  markProspectReplied,
  markProspectOptedOut,
  OUTREACH_PAGE_SIZE,
  WEEK1_DAILY_CAP,
} from "../prospect-outreach.server";
import styles from "./styles/admin.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdmin(request);

  const url = new URL(request.url);
  const prospectPage = Math.max(1, parseInt(url.searchParams.get("prospectPage") || "1", 10) || 1);
  const prospectDayRaw = url.searchParams.get("prospectDay");
  const prospectDayFilter =
    prospectDayRaw && prospectDayRaw !== "all"
      ? Math.min(7, Math.max(1, parseInt(prospectDayRaw, 10) || 1))
      : undefined;

  const envVars = [
    { key: "NODE_ENV", value: process.env.NODE_ENV || "—" },
    { key: "DATABASE_URL", value: process.env.DATABASE_URL ? "****" + process.env.DATABASE_URL.slice(-20) : "—" },
    { key: "SHOPIFY_API_KEY", value: process.env.SHOPIFY_API_KEY ? process.env.SHOPIFY_API_KEY.slice(0, 8) + "..." : "—" },
    { key: "SHOPIFY_API_SECRET", value: process.env.SHOPIFY_API_SECRET ? "****" : "—" },
    { key: "SHOPIFY_APP_URL", value: process.env.SHOPIFY_APP_URL || "—" },
    { key: "SCOPES", value: process.env.SCOPES || "—" },
    { key: "SESSION_SECRET", value: process.env.SESSION_SECRET ? "****" : "—" },
    { key: "ADMIN_PASSWORD", value: "****" },
    { key: "PORT", value: process.env.PORT || "3000" },
  ];

  const [
    totalSessions,
    totalRules,
    totalConversions,
    totalOrders,
    totalCooccurrences,
    totalSuggestions,
    sessionShopDomains,
    installedShopDomains,
    stuckMerchantEstimate,
    stuckMerchantPreview,
    outreachPage,
    outreachStats,
    campaignOverview,
  ] = await Promise.all([
    db.session.count(),
    db.bundleRule.count(),
    db.orderConversion.count(),
    db.orderHistory.count(),
    db.itemCooccurrence.count(),
    db.bundleSuggestion.count(),
    getSessionShopDomains(),
    getInstalledShopDomains(),
    countQuickStuckCandidates(),
    listQuickStuckCandidates(10),
    listOutreachProspectsPaginated({
      page: prospectPage,
      pageSize: OUTREACH_PAGE_SIZE,
      campaignDay: prospectDayFilter,
    }),
    db.outreachProspect.groupBy({ by: ["status"], _count: { _all: true } }),
    getCampaignDayOverview(),
  ]);

  return json({
    envVars,
    appInfo: {
      name: "Reverse Bundle Pro",
      version: "1.0.0",
      framework: "Remix + Shopify App",
      database: "PostgreSQL (NeonDB) + Prisma",
      hosting: "DigitalOcean",
      domain: "reverse-bundling.me",
    },
    dataCounts: {
      sessions: totalSessions,
      rules: totalRules,
      conversions: totalConversions,
      orders: totalOrders,
      cooccurrences: totalCooccurrences,
      suggestions: totalSuggestions,
    },
    merchantCounts: {
      sessionShops: sessionShopDomains.length,
      installedShops: installedShopDomains.length,
      orphanedShops: Math.max(0, sessionShopDomains.length - installedShopDomains.length),
    },
    stuckRealMerchants: stuckMerchantPreview.map((m) => ({
      shop: m.shop,
      email: m.email || "—",
      shopName: m.shopName,
      productCount: null as number | null,
      orderCount: null as number | null,
    })),
    stuckRealMerchantCount: stuckMerchantEstimate,
    outreachProspects: outreachPage.items.map((p) => ({
      id: p.id,
      storeName: p.storeName,
      email: p.email,
      niche: p.niche,
      status: p.status,
      campaignDay: p.campaignDay,
      alignmentScore: p.alignmentScore,
      sentAt: p.sentAt?.toISOString() || null,
    })),
    outreachPagination: {
      page: outreachPage.page,
      pageSize: outreachPage.pageSize,
      total: outreachPage.total,
      totalPages: outreachPage.totalPages,
      dayFilter: prospectDayFilter ?? "all",
    },
    outreachStats: Object.fromEntries(
      outreachStats.map((row) => [row.status, row._count._all])
    ),
    outreachReplyTo: process.env.OUTREACH_REPLY_TO || "azurite.tech.ltd@gmail.com",
    campaignOverview,
    dailyOutreachCap: WEEK1_DAILY_CAP,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await requireAdmin(request);
  const form = await request.formData();
  const actionType = form.get("_action") as string;

  try {
    switch (actionType) {
      case "clear-old-conversions": {
        const daysStr = form.get("days") as string;
        const days = parseInt(daysStr || "90", 10);
        if (days < 7) return json({ error: "Minimum 7 days" }, { status: 400 });
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const result = await db.orderConversion.deleteMany({ where: { convertedAt: { lt: cutoff } } });
        return json({ success: true, message: `Deleted ${result.count} conversions older than ${days} days` });
      }
      case "clear-dismissed-suggestions": {
        const result = await db.bundleSuggestion.deleteMany({ where: { status: "dismissed" } });
        return json({ success: true, message: `Deleted ${result.count} dismissed suggestions` });
      }
      case "clear-old-cooccurrences": {
        const daysStr = form.get("days") as string;
        const days = parseInt(daysStr || "180", 10);
        if (days < 30) return json({ error: "Minimum 30 days" }, { status: 400 });
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const result = await db.itemCooccurrence.deleteMany({ where: { updatedAt: { lt: cutoff } } });
        return json({ success: true, message: `Deleted ${result.count} old co-occurrence records` });
      }
      case "reset-failed-conversions": {
        const result = await db.orderConversion.updateMany({
          where: { status: "failed" },
          data: { status: "pending", errorMessage: null },
        });
        return json({ success: true, message: `Reset ${result.count} failed conversions to pending` });
      }
      case "cleanup-uninstalled-shops": {
        const result = await cleanupUninstalledShops();
        return json({
          success: true,
          message: `Checked ${result.checked} shops, removed ${result.removed} uninstalled merchant${result.removed !== 1 ? "s" : ""} and all their data`,
        });
      }
      case "preview-onboarding-emails": {
        const result = await sendStuckMerchantOnboardingEmails({ dryRun: true, limit: 50 });
        return json({
          success: true,
          message: `Found ${result.candidates} real merchants with no active bundle rule (preview only, no emails sent)`,
        });
      }
      case "send-onboarding-emails": {
        const result = await sendStuckMerchantOnboardingEmails({ dryRun: false, limit: 50 });
        return json({
          success: true,
          message: `Sent ${result.sent} onboarding emails to real merchants (${result.failed} failed, ${result.candidates} targeted)`,
        });
      }
      case "seed-outreach-prospects":
      case "seed-week1-campaign": {
        const result = await seedWeek1Campaign();
        return json({
          success: true,
          message: `Week 1 campaign: ${result.created} created, ${result.updated} updated (${result.duplicatesInFile} duplicates skipped in file). Target: 140 Shopify prospects (20/day × 7).`,
        });
      }
      case "preview-outreach-emails": {
        const day = parseInt((form.get("campaignDay") as string) || "1", 10);
        const result = await sendCampaignDayBatch({ day, dryRun: true });
        return json({
          success: true,
          message: result.error || `Day ${day} preview: ${result.targeted} eligible pending (cap ${WEEK1_DAILY_CAP}/day, ${result.sentToday} sent today).`,
        });
      }
      case "send-outreach-emails":
      case "send-campaign-day": {
        const day = parseInt((form.get("campaignDay") as string) || "1", 10);
        const result = await sendCampaignDayBatch({ day, dryRun: false });
        return json({
          success: !result.error,
          message: result.error || `Day ${day}: sent ${result.sent}, failed ${result.failed}, skipped ineligible ${result.skippedIneligible}. Today total: ${result.sentToday}/${WEEK1_DAILY_CAP}. Replies: ${process.env.OUTREACH_REPLY_TO || "azurite.tech.ltd@gmail.com"}`,
        });
      }
      case "mark-prospect-replied": {
        const email = (form.get("email") as string)?.trim();
        if (!email) return json({ error: "Email required" }, { status: 400 });
        await markProspectReplied(email);
        return json({ success: true, message: `Marked ${email} as replied` });
      }
      case "mark-prospect-opt-out": {
        const email = (form.get("email") as string)?.trim();
        if (!email) return json({ error: "Email required" }, { status: 400 });
        await markProspectOptedOut(email);
        return json({ success: true, message: `Marked ${email} as opted out` });
      }
      default:
        return json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return json({ error: message }, { status: 500 });
  }
};

export default function AdminSettings() {
  const {
    envVars,
    appInfo,
    dataCounts,
    merchantCounts,
    stuckRealMerchants,
    stuckRealMerchantCount,
    outreachProspects,
    outreachPagination,
    outreachStats,
    outreachReplyTo,
    campaignOverview,
    dailyOutreachCap,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; message?: string; error?: string }>();
  const [searchParams] = useSearchParams();

  const buildProspectQuery = (overrides: { page?: number; day?: string }) => {
    const params = new URLSearchParams(searchParams);
    params.set("prospectPage", String(overrides.page ?? outreachPagination.page));
    params.set("prospectDay", overrides.day ?? outreachPagination.dayFilter);
    return `?${params.toString()}`;
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderRow}>
          <div>
            <h2 className={styles.pageHeaderTitle}>Settings</h2>
            <p className={styles.pageHeaderSub}>Application configuration and maintenance tools</p>
          </div>
        </div>
      </div>

      {/* Action Result */}
      {fetcher.data && (
        <div className={`${styles.alert} ${fetcher.data.success ? styles.alertSuccess : styles.alertError}`} style={{ marginBottom: 20 }}>
          {fetcher.data.success ? `✅ ${fetcher.data.message}` : `❌ ${fetcher.data.error}`}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* App Info */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>📱 App Information</span>
          </div>
          <div className={styles.cardBody}>
            <div className={styles.detailGrid}>
              {Object.entries(appInfo).map(([key, val]) => (
                <div key={key} style={{ display: "contents" }}>
                  <div className={styles.detailLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</div>
                  <div className={styles.detailValue}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Env Vars */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>🔐 Environment Variables</span>
          </div>
          <div className={styles.cardBodyNoPad}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {envVars.map((e) => (
                  <tr key={e.key}>
                    <td><span className={styles.codeInline}>{e.key}</span></td>
                    <td><span className={styles.codeInline}>{e.value}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Merchant counts */}
      <div className={styles.card} style={{ marginTop: 24 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>🏪 Merchant Database</span>
        </div>
        <div className={styles.cardBody}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, textAlign: "center" }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#2563eb" }}>{merchantCounts.installedShops}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Installed (with token)</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#6b7280" }}>{merchantCounts.sessionShops}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Session rows (legacy)</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: merchantCounts.orphanedShops > 0 ? "#dc2626" : "#059669" }}>
                {merchantCounts.orphanedShops}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Likely uninstalled</div>
            </div>
          </div>
        </div>
      </div>

      {/* Data Counts */}
      <div className={styles.card} style={{ marginTop: 24 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>📊 Data Overview</span>
        </div>
        <div className={styles.cardBody}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 16, textAlign: "center" }}>
            {[
              { label: "Sessions", count: dataCounts.sessions, color: "#2563eb" },
              { label: "Rules", count: dataCounts.rules, color: "#7c3aed" },
              { label: "Conversions", count: dataCounts.conversions, color: "#059669" },
              { label: "Orders", count: dataCounts.orders, color: "#d97706" },
              { label: "Co-occurrences", count: dataCounts.cooccurrences, color: "#0d9488" },
              { label: "Suggestions", count: dataCounts.suggestions, color: "#dc2626" },
            ].map((d) => (
              <div key={d.label}>
                <div style={{ fontSize: 24, fontWeight: 800, color: d.color }}>{d.count.toLocaleString()}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{d.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Merchant Activation */}
      <div className={styles.card} style={{ marginTop: 24 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>🚀 Merchant Activation</span>
          <span className={`${styles.badge} ${styles.badgeBlue}`}>{stuckRealMerchantCount} real merchants stuck</span>
        </div>
        <div className={styles.cardBody}>
          <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 14 }}>
            Targets installed stores with no active bundle rule. Count below is a fast DB estimate (~
            {stuckRealMerchantCount} shops). Click <strong>Preview count</strong> before sending — that runs the full Shopify qualification scan (can take 1–2 minutes).
          </p>
          {stuckRealMerchants.length > 0 && (
            <table className={styles.table} style={{ marginBottom: 16 }}>
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Email</th>
                  <th>Products</th>
                  <th>Orders</th>
                </tr>
              </thead>
              <tbody>
                {stuckRealMerchants.map((merchant) => (
                  <tr key={merchant.shop}>
                    <td>{merchant.shopName || merchant.shop}</td>
                    <td>{merchant.email}</td>
                    <td>{merchant.productCount ?? "—"}</td>
                    <td>{merchant.orderCount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <fetcher.Form method="post">
              <input type="hidden" name="_action" value="preview-onboarding-emails" />
              <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`} disabled={fetcher.state !== "idle"}>
                Preview count
              </button>
            </fetcher.Form>
            <fetcher.Form method="post">
              <input type="hidden" name="_action" value="send-onboarding-emails" />
              <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`} disabled={fetcher.state !== "idle" || stuckRealMerchantCount === 0}>
                {fetcher.state !== "idle" ? "Sending…" : `Email ${stuckRealMerchantCount} real merchants`}
              </button>
            </fetcher.Form>
          </div>
        </div>
      </div>

      {/* 7-Day Cold Campaign */}
      <div className={styles.card} style={{ marginTop: 24 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>📅 Week 1 Cold Campaign (Shopify ICP only)</span>
          <span className={`${styles.badge} ${styles.badgeBlue}`}>
            {campaignOverview.totalProspects}/{campaignOverview.targetTotal} loaded
          </span>
        </div>
        <div className={styles.cardBody}>
          <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: 14 }}>
            Target: <strong>20 emails/day × 7 days = 140</strong>. Ignores your 127 installed merchants — only external Shopify stores that need reverse bundling (multi-SKU, supplements/beauty/accessories).
            Only <strong>.myshopify.com</strong> stores are eligible. Replies: <strong>{outreachReplyTo}</strong>
          </p>
          <p style={{ margin: "0 0 16px", color: "#059669", fontSize: 13 }}>
            Today: <strong>{campaignOverview.sentToday}/{dailyOutreachCap}</strong> sent · <strong>{campaignOverview.remainingToday}</strong> remaining (daily safety cap)
          </p>
          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { label: "Pending", key: "pending", color: "#2563eb" },
              { label: "Sent", key: "sent", color: "#059669" },
              { label: "Replied", key: "replied", color: "#7c3aed" },
              { label: "Opted out", key: "opted_out", color: "#6b7280" },
            ].map((s) => (
              <div key={s.key} style={{ textAlign: "center", minWidth: 80 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>
                  {(outreachStats[s.key] as number) || 0}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{s.label}</div>
              </div>
            ))}
          </div>
          <fetcher.Form method="post" style={{ marginBottom: 16 }}>
            <input type="hidden" name="_action" value="seed-week1-campaign" />
            <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`} disabled={fetcher.state !== "idle"}>
              Load / refresh Week 1 prospect list
            </button>
          </fetcher.Form>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
            {campaignOverview.days.map((d) => (
              <div key={d.day} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: d.pending > 0 ? "#f8fafc" : "#fafafa" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Day {d.day}</div>
                <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
                  Pending: <strong>{d.pending}</strong>/{d.target}<br />
                  Sent: {d.sent} · Replied: {d.replied}
                </div>
                <fetcher.Form method="post" style={{ marginTop: 10 }}>
                  <input type="hidden" name="_action" value="send-campaign-day" />
                  <input type="hidden" name="campaignDay" value={d.day} />
                  <button
                    type="submit"
                    className={`${styles.btn} ${styles.btnSm} ${d.pending > 0 ? styles.btnPrimary : styles.btnSecondary}`}
                    disabled={fetcher.state !== "idle" || d.pending === 0 || campaignOverview.remainingToday === 0}
                    style={{ width: "100%" }}
                  >
                    Send Day {d.day}
                  </button>
                </fetcher.Form>
              </div>
            ))}
          </div>
          {outreachProspects.length > 0 && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  Showing {(outreachPagination.page - 1) * outreachPagination.pageSize + 1}–
                  {Math.min(outreachPagination.page * outreachPagination.pageSize, outreachPagination.total)} of {outreachPagination.total}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["all", "1", "2", "3", "4", "5", "6", "7"].map((day) => (
                    <Link
                      key={day}
                      to={buildProspectQuery({ page: 1, day })}
                      className={`${styles.btn} ${styles.btnSm} ${outreachPagination.dayFilter === day ? styles.btnPrimary : styles.btnSecondary}`}
                      style={{ textDecoration: "none" }}
                    >
                      {day === "all" ? "All days" : `Day ${day}`}
                    </Link>
                  ))}
                </div>
              </div>
              <table className={styles.table} style={{ marginBottom: 8 }}>
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Store</th>
                    <th>Email</th>
                    <th>Score</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {outreachProspects.map((p) => (
                    <tr key={p.id}>
                      <td>{p.campaignDay ?? "—"}</td>
                      <td>{p.storeName}</td>
                      <td>{p.email}</td>
                      <td>{p.alignmentScore ?? "—"}</td>
                      <td>{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {outreachPagination.totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 12 }}>
                  {outreachPagination.page > 1 ? (
                    <Link
                      to={buildProspectQuery({ page: outreachPagination.page - 1 })}
                      className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
                      style={{ textDecoration: "none" }}
                    >
                      ← Previous
                    </Link>
                  ) : (
                    <span className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`} style={{ opacity: 0.4 }}>
                      ← Previous
                    </span>
                  )}
                  <span style={{ alignSelf: "center", fontSize: 13, color: "#6b7280" }}>
                    Page {outreachPagination.page} / {outreachPagination.totalPages}
                  </span>
                  {outreachPagination.page < outreachPagination.totalPages ? (
                    <Link
                      to={buildProspectQuery({ page: outreachPagination.page + 1 })}
                      className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}
                      style={{ textDecoration: "none" }}
                    >
                      Next →
                    </Link>
                  ) : (
                    <span className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`} style={{ opacity: 0.4 }}>
                      Next →
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Maintenance Actions */}
      <div className={styles.card} style={{ marginTop: 24 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>🔧 Maintenance Actions</span>
          <span className={`${styles.badge} ${styles.badgeYellow}`}>Use with caution</span>
        </div>
        <div className={styles.cardBody}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Clear Old Conversions */}
            <div className={styles.maintenanceAction}>
              <div className={styles.maintenanceTitle}>🗑️ Clear Old Conversions</div>
              <div className={styles.maintenanceDesc}>
                Remove old conversion records to free up database space. Records older than the specified days will be permanently deleted.
              </div>
              <fetcher.Form method="post" style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input type="hidden" name="_action" value="clear-old-conversions" />
                <select name="days" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                  <option value="365">365 days</option>
                </select>
                <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}>
                  Delete Old Records
                </button>
              </fetcher.Form>
            </div>

            {/* Clear Dismissed Suggestions */}
            <div className={styles.maintenanceAction}>
              <div className={styles.maintenanceTitle}>🤖 Clear Dismissed Suggestions</div>
              <div className={styles.maintenanceDesc}>
                Remove all AI suggestions that were dismissed by merchants. This frees up space without affecting active suggestions.
              </div>
              <fetcher.Form method="post" style={{ marginTop: 10 }}>
                <input type="hidden" name="_action" value="clear-dismissed-suggestions" />
                <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}>
                  Delete Dismissed
                </button>
              </fetcher.Form>
            </div>

            {/* Clear Old Co-occurrences */}
            <div className={styles.maintenanceAction}>
              <div className={styles.maintenanceTitle}>🔗 Clear Old Co-occurrences</div>
              <div className={styles.maintenanceDesc}>
                Remove stale item co-occurrence records. Older records may no longer reflect current purchasing patterns.
              </div>
              <fetcher.Form method="post" style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input type="hidden" name="_action" value="clear-old-cooccurrences" />
                <select name="days" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}>
                  <option value="180">180 days</option>
                  <option value="365">365 days</option>
                </select>
                <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}>
                  Delete Old Records
                </button>
              </fetcher.Form>
            </div>

            {/* Reset Failed Conversions */}
            <div className={styles.maintenanceAction}>
              <div className={styles.maintenanceTitle}>🔄 Reset Failed Conversions</div>
              <div className={styles.maintenanceDesc}>
                Reset all failed conversions back to pending status so they can be retried. Error messages will be cleared.
              </div>
              <fetcher.Form method="post" style={{ marginTop: 10 }}>
                <input type="hidden" name="_action" value="reset-failed-conversions" />
                <button type="submit" className={`${styles.btn} ${styles.btnSm} ${styles.btnSecondary}`}>
                  Reset to Pending
                </button>
              </fetcher.Form>
            </div>

            {/* Remove uninstalled merchants */}
            <div className={styles.maintenanceAction}>
              <div className={styles.maintenanceTitle}>🧹 Remove Uninstalled Merchants</div>
              <div className={styles.maintenanceDesc}>
                Purge all database records for shops that uninstalled the app. Verifies each shop with Shopify before deleting sessions, rules, conversions, and settings. May take a few minutes.
              </div>
              <fetcher.Form method="post" style={{ marginTop: 10 }}>
                <input type="hidden" name="_action" value="cleanup-uninstalled-shops" />
                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                  disabled={fetcher.state !== "idle"}
                >
                  {fetcher.state !== "idle" ? "Cleaning up…" : "Remove Uninstalled Merchants"}
                </button>
              </fetcher.Form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
