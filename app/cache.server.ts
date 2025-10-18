import { logInfo, logError } from "./logger.server";
import { createClient, type RedisClientType } from "redis";

// Cache interface
interface CacheEntry<T> {
  data: T;
  expires: number;
}

// In-memory cache for development/fallback
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

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  async set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): Promise<void> {
    this.cache.set(key, {
      data,
      expires: Date.now() + ttlMs
    });
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async size(): Promise<number> {
    return this.cache.size;
  }

  async disconnect(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Redis cache for production
class RedisCache {
  private client: RedisClientType;
  private connected = false;

  constructor(redisUrl?: string) {
    const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = createClient({ url });

    this.client.on('error', (err) => {
      logError(err, { context: 'redis_cache_error' });
      this.connected = false;
    });

    this.client.on('connect', () => {
      logInfo('Redis cache connected', { url });
      this.connected = true;
    });

    // Connect asynchronously
    this.connect();
  }

  private async connect() {
    try {
      await this.client.connect();
    } catch (error) {
      logError(error as Error, { context: 'redis_connection_failed' });
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.connected) return null;

      const data = await this.client.get(key);
      if (!data) return null;

      return JSON.parse(data);
    } catch (error) {
      logError(error as Error, { context: 'redis_get_error', key });
      return null;
    }
  }

  async set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): Promise<void> {
    try {
      if (!this.connected) return;

      const serialized = JSON.stringify(data);
      const ttlSeconds = Math.ceil(ttlMs / 1000);
      await this.client.setEx(key, ttlSeconds, serialized);
    } catch (error) {
      logError(error as Error, { context: 'redis_set_error', key });
    }
  }

  async clear(): Promise<void> {
    try {
      if (!this.connected) return;
      await this.client.flushAll();
    } catch (error) {
      logError(error as Error, { context: 'redis_clear_error' });
    }
  }

  async size(): Promise<number> {
    try {
      if (!this.connected) return 0;
      const keys = await this.client.keys('*');
      return keys.length;
    } catch (error) {
      logError(error as Error, { context: 'redis_size_error' });
      return 0;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.connected) {
        await this.client.disconnect();
        this.connected = false;
      }
    } catch (error) {
      logError(error as Error, { context: 'redis_disconnect_error' });
    }
  }
}

// Choose cache implementation based on environment
const isProduction = process.env.NODE_ENV === 'production';
const redisUrl = process.env.REDIS_URL;

let cacheImpl: MemoryCache | RedisCache;

if (isProduction && redisUrl) {
  logInfo('Using Redis cache for production', { redisUrl });
  cacheImpl = new RedisCache(redisUrl);
} else {
  const cacheType = isProduction ? 'Memory (Redis URL not configured)' : 'Memory (development)';
  logInfo(`Using ${cacheType} cache`);
  cacheImpl = new MemoryCache();
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await cacheImpl.disconnect();
});

process.on('SIGINT', async () => {
  await cacheImpl.disconnect();
});

// Export cache instance
export const cache = cacheImpl;

// Cache wrapper for database queries (async)
export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await cache.get<T>(key);
  if (cached !== null) {
    logInfo('Cache hit', { key });
    return cached;
  }

  return fetcher().then(async (result) => {
    await cache.set(key, result, ttlMs);
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