import { logWarning } from "./logger.server";

// Simple in-memory rate limiter (for production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (request: Request) => string; // Function to generate rate limit key
}

export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (request: Request) => {
      // Default: rate limit by IP address
      const forwarded = request.headers.get("x-forwarded-for");
      const ip = forwarded ? forwarded.split(",")[0] : "unknown";
      return ip;
    }
  } = options;

  return async function rateLimit(request: Request): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
    totalRequests: number;
  }> {
    const key = keyGenerator(request);
    const now = Date.now();

    // Clean up expired entries
    for (const [k, data] of rateLimitStore.entries()) {
      if (data.resetTime < now) {
        rateLimitStore.delete(k);
      }
    }

    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      // Create new entry
      entry = {
        count: 1,
        resetTime: now + windowMs
      };
      rateLimitStore.set(key, entry);
    } else {
      // Increment existing entry
      entry.count++;
    }

    const allowed = entry.count <= maxRequests;
    const remaining = Math.max(0, maxRequests - entry.count);

    if (!allowed) {
      logWarning("Rate limit exceeded", {
        key,
        count: entry.count,
        maxRequests,
        windowMs,
        ip: key,
        url: request.url,
        method: request.method
      });
    }

    return {
      allowed,
      remaining,
      resetTime: entry.resetTime,
      totalRequests: entry.count
    };
  };
}

// Pre-configured rate limiters
export const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // 100 requests per 15 minutes
  keyGenerator: (request: Request) => {
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0] : "unknown";
    return `api:${ip}`;
  }
});

export const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60, // 60 webhooks per minute (reasonable for Shopify)
  keyGenerator: (request: Request) => {
    // Rate limit by shop domain for webhooks
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop") || "unknown";
    return `webhook:${shop}`;
  }
});

export const generalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 120, // 120 requests per minute
});