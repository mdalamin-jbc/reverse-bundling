import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { logInfo, logError } from "../logger.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const startTime = Date.now();
  const checks = {
    database: false,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
  };

  try {
    // Database health check
    await db.$queryRaw`SELECT 1`;
    checks.database = true;

    const responseTime = Date.now() - startTime;
    const status = checks.database ? "healthy" : "unhealthy";

    logInfo("Health check completed", {
      status,
      responseTime: `${responseTime}ms`,
      checks
    });

    return json({
      status,
      responseTime: `${responseTime}ms`,
      ...checks
    }, {
      status: status === "healthy" ? 200 : 503,
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json"
      }
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;

    logError(error as Error, {
      context: "health_check",
      responseTime: `${responseTime}ms`
    });

    return json({
      status: "unhealthy",
      responseTime: `${responseTime}ms`,
      error: "Service unavailable",
      ...checks
    }, {
      status: 503,
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/json"
      }
    });
  }
};