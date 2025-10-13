import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Basic auth check for metrics endpoint
  const authHeader = request.headers.get("authorization");
  const expectedAuth = `Bearer ${process.env.METRICS_TOKEN || "default-token"}`;

  if (!authHeader || authHeader !== expectedAuth) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [
      totalConversions,
      totalSavings,
      activeRules,
      recentConversions,
      systemMetrics
    ] = await Promise.all([
      // Total conversions
      db.orderConversion.count(),

      // Total savings
      db.orderConversion.aggregate({
        _sum: { savingsAmount: true }
      }),

      // Active rules
      db.bundleRule.count({
        where: { status: "active" }
      }),

      // Recent conversions (last 24 hours)
      db.orderConversion.count({
        where: {
          convertedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      }),

      // System metrics
      Promise.resolve({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || "1.0.0",
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || "development"
      })
    ]);

    const metrics = {
      conversions: {
        total: totalConversions,
        recent_24h: recentConversions,
        total_savings: totalSavings._sum.savingsAmount || 0
      },
      rules: {
        active: activeRules
      },
      system: systemMetrics,
      timestamp: new Date().toISOString()
    };

    logInfo("Metrics requested", { totalConversions, activeRules });

    return json(metrics, {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json"
      }
    });

  } catch (error) {
    logError(error as Error, { context: "metrics_endpoint" });

    return json({
      error: "Metrics unavailable",
      timestamp: new Date().toISOString()
    }, {
      status: 503,
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json"
      }
    });
  }
};