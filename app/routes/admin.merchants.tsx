import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData, useSearchParams, Link } from "@remix-run/react";
import { requireAdmin } from "../admin-auth.server";
import db from "../db.server";
import styles from "./styles/admin.module.css";
import type { MerchantStage } from "../merchant-health";
import { stageLabel } from "../merchant-health";
import { daysSince, getMerchantHealth, getMerchantStage } from "../merchant-health.server";

const PER_PAGE_OPTIONS = [10, 25, 50];
const STAGE_FILTERS: MerchantStage[] = [
  "installed",
  "onboarding",
  "rules_live",
  "converting",
  "at_risk",
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdmin(request);
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || "";
  const stageFilter = url.searchParams.get("stage") as MerchantStage | null;
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const perPage = PER_PAGE_OPTIONS.includes(parseInt(url.searchParams.get("perPage") || "10", 10))
    ? parseInt(url.searchParams.get("perPage") || "10", 10)
    : 10;

  const allSessions = await db.session.findMany({
    distinct: ["shop"],
    where: query ? { shop: { contains: query, mode: "insensitive" } } : undefined,
    select: { shop: true },
    orderBy: { id: "desc" },
  });

  const allMerchants = await Promise.all(
    allSessions.map(async ({ shop }) => {
      const [
        ruleCount, activeRuleCount, conversionCount, settings, savingsAgg,
        orderHistoryCount, suggestionCount, ownerSession,
        latestConversion, latestRule, earliestSettings,
      ] = await Promise.all([
        db.bundleRule.count({ where: { shop } }),
        db.bundleRule.count({ where: { shop, status: "active" } }),
        db.orderConversion.count({ where: { shop } }),
        db.appSettings.findFirst({ where: { shop } }),
        db.orderConversion.aggregate({ where: { shop }, _sum: { savingsAmount: true } }),
        db.orderHistory.count({ where: { shop } }),
        db.bundleSuggestion.count({ where: { shop } }),
        db.session.findFirst({
          where: { shop },
          select: { email: true, firstName: true, lastName: true, accountOwner: true },
          orderBy: { id: "desc" },
        }),
        db.orderConversion.findFirst({
          where: { shop },
          orderBy: { convertedAt: "desc" },
          select: { convertedAt: true },
        }),
        db.bundleRule.findFirst({
          where: { shop },
          orderBy: { updatedAt: "desc" },
          select: { updatedAt: true, createdAt: true },
        }),
        db.appSettings.findFirst({
          where: { shop },
          select: { createdAt: true },
        }),
      ]);

      const configured = !!settings;
      const firstActivityAt =
        earliestSettings?.createdAt ||
        latestRule?.createdAt ||
        null;
      const lastActivityAt =
        latestConversion?.convertedAt ||
        latestRule?.updatedAt ||
        earliestSettings?.createdAt ||
        null;

      const stage = getMerchantStage({
        configured,
        activeRuleCount,
        conversionCount,
        daysSinceFirstActivity: daysSince(firstActivityAt),
      });
      const health = getMerchantHealth({
        stage,
        daysSinceLastActivity: daysSince(lastActivityAt),
      });

      return {
        shop,
        ruleCount,
        activeRuleCount,
        conversionCount,
        totalSavings: savingsAgg._sum.savingsAmount || 0,
        orderHistoryCount,
        suggestionCount,
        autoConvert: settings?.autoConvertOrders || false,
        fulfillmentMode: settings?.fulfillmentMode || "—",
        configured,
        ownerEmail: ownerSession?.email || null,
        ownerName: [ownerSession?.firstName, ownerSession?.lastName].filter(Boolean).join(" ") || null,
        stage,
        health,
        lastActivityAt: lastActivityAt?.toISOString() || null,
      };
    })
  );

  const filteredMerchants =
    stageFilter && STAGE_FILTERS.includes(stageFilter)
      ? allMerchants.filter((m) => m.stage === stageFilter)
      : allMerchants;

  const stageCounts = STAGE_FILTERS.reduce(
    (acc, stage) => {
      acc[stage] = allMerchants.filter((m) => m.stage === stage).length;
      return acc;
    },
    {} as Record<MerchantStage, number>
  );

  const totalCount = filteredMerchants.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const currentPage = Math.min(page, totalPages);
  const merchants = filteredMerchants.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
  );

  return json({
    merchants,
    pagination: { page: currentPage, perPage, totalCount, totalPages },
    totalMerchants: allMerchants.length,
    query,
    stageFilter: stageFilter && STAGE_FILTERS.includes(stageFilter) ? stageFilter : null,
    stageCounts,
  });
};

const healthBadge: Record<string, string> = {
  healthy: styles.badgeGreen,
  needs_attention: styles.badgeYellow,
  critical: styles.badgeRed,
};

const stageBadge: Record<MerchantStage, string> = {
  installed: styles.badgeGray,
  onboarding: styles.badgeBlue,
  rules_live: styles.badgeIndigo,
  converting: styles.badgeGreen,
  at_risk: styles.badgeRed,
};

export default function AdminMerchants() {
  const { merchants, pagination, totalMerchants, query, stageFilter, stageCounts } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    setSearchParams(params);
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderRow}>
          <div>
            <h2 className={styles.pageHeaderTitle}>Merchants</h2>
            <p className={styles.pageHeaderSub}>
              {pagination.totalCount} merchant{pagination.totalCount !== 1 ? "s" : ""} registered
            </p>
          </div>
        </div>
      </div>

      {/* Pipeline filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnSm} ${!stageFilter ? styles.btnPrimary : styles.btnSecondary}`}
          onClick={() => updateParams({ stage: "", page: "1" })}
        >
          All ({totalMerchants})
        </button>
        {STAGE_FILTERS.map((stage) => (
          <button
            key={stage}
            type="button"
            className={`${styles.btn} ${styles.btnSm} ${stageFilter === stage ? styles.btnPrimary : styles.btnSecondary}`}
            onClick={() => updateParams({ stage, page: "1" })}
          >
            {stageLabel(stage)} ({stageCounts[stage]})
          </button>
        ))}
      </div>

      {/* Search & Filters */}
      <div className={styles.card}>
        <div className={styles.cardBody} style={{ padding: "14px 20px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className={styles.searchBox} style={{ flex: 1 }}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="text"
                placeholder="Search merchants by shop domain..."
                defaultValue={query}
                className={styles.searchInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = (e.target as HTMLInputElement).value;
                    updateParams({ q: val, page: "1" });
                  }
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6b7280" }}>
              <span>Show</span>
              <select
                value={pagination.perPage}
                onChange={(e) => updateParams({ perPage: e.target.value, page: "1" })}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, cursor: "pointer" }}
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span>per page</span>
            </div>
          </div>
        </div>
      </div>

      {/* Merchants Table */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>🏪 All Merchants</span>
          <span className={`${styles.badge} ${styles.badgeBlue}`}>
            {pagination.totalCount} total
          </span>
        </div>
        <div className={styles.cardBodyNoPad}>
          {merchants.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Stage</th>
                  <th style={{ textAlign: "center" }}>Rules</th>
                  <th style={{ textAlign: "center" }}>Conversions</th>
                  <th style={{ textAlign: "right" }}>Savings</th>
                  <th style={{ textAlign: "center" }}>Health</th>
                  <th>Last activity</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {merchants.map((m) => (
                  <tr key={m.shop}>
                    <td>
                      <Link to={`/admin/merchants/${encodeURIComponent(m.shop)}`} className={styles.tableLink}>
                        {m.shop.replace(".myshopify.com", "")}
                      </Link>
                      <div className={styles.tableSub}>{m.shop}</div>
                      {m.ownerEmail && (
                        <div className={styles.tableSub}>{m.ownerName ? `${m.ownerName} · ` : ""}{m.ownerEmail}</div>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${stageBadge[m.stage]}`}>{stageLabel(m.stage)}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ fontWeight: 700, color: "#111827" }}>{m.ruleCount}</span>
                      <div className={styles.tableSub}>{m.activeRuleCount} active</div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ fontWeight: 700, color: "#111827" }}>{m.conversionCount}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ fontWeight: 700, color: "#059669" }}>${m.totalSavings.toFixed(2)}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className={`${styles.badge} ${healthBadge[m.health]}`}>
                        {m.health.replace("_", " ")}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "#6b7280" }}>
                      {m.lastActivityAt
                        ? new Date(m.lastActivityAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        to={`/admin/merchants/${encodeURIComponent(m.shop)}`}
                        className={`${styles.btn} ${styles.btnSm} ${styles.btnGhost}`}
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🏪</div>
              <div className={styles.emptyText}>
                {query ? `No merchants matching "${query}"` : "No merchants yet"}
              </div>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className={styles.cardFooter}>
            <div className={styles.pagination}>
              <button
                className={`${styles.pageBtn} ${pagination.page <= 1 ? styles.pageBtnDisabled : ""}`}
                onClick={() => pagination.page > 1 && updateParams({ page: String(pagination.page - 1) })}
                disabled={pagination.page <= 1}
              >
                ← Previous
              </button>

              {generatePageNumbers(pagination.page, pagination.totalPages).map((p, i) =>
                p === "..." ? (
                  <span key={`ellipsis-${i}`} style={{ padding: "6px 4px", color: "#9ca3af" }}>…</span>
                ) : (
                  <button
                    key={p}
                    className={`${styles.pageBtn} ${pagination.page === p ? styles.pageBtnActive : ""}`}
                    onClick={() => updateParams({ page: String(p) })}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                className={`${styles.pageBtn} ${pagination.page >= pagination.totalPages ? styles.pageBtnDisabled : ""}`}
                onClick={() => pagination.page < pagination.totalPages && updateParams({ page: String(pagination.page + 1) })}
                disabled={pagination.page >= pagination.totalPages}
              >
                Next →
              </button>

              <span className={styles.pageInfo}>
                Page {pagination.page} of {pagination.totalPages} · {pagination.totalCount} results
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | string)[] = [];
  pages.push(1);
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push("...");
  pages.push(total);
  return pages;
}
