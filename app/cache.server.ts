import { logInfo } from "./logger.server";

// Simple in-memory cache with TTL (for production, use Redis)
interface CacheEntry<T> {
  data: T;
  expires: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (entry.expires < now) {
          this.cache.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      expires: Date.now() + ttlMs
    });
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  size(): number {
    return this.cache.size;
  }
}

export const cache = new MemoryCache();

// Cache wrapper for database queries
export function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== null) {
    logInfo('Cache hit', { key });
    return Promise.resolve(cached);
  }

  return fetcher().then(result => {
    cache.set(key, result, ttlMs);
    logInfo('Cache miss, stored result', { key, ttlMs });
    return result;
  });
}

// Cache keys generator
export const cacheKeys = {
  shopStats: (shop: string) => `shop:stats:${shop}`,
  bundleRules: (shop: string) => `bundle:rules:${shop}`,
  bundleAnalytics: (shop: string) => `bundle:analytics:${shop}`,
  analyticsSummary: (shop: string, period: string) => `analytics:summary:${shop}:${period}`,
  orderConversions: (shop: string, limit: number) => `orders:conversions:${shop}:${limit}`
};