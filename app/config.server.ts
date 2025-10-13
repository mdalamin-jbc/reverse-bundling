/**
 * Configuration management for production environment
 * Centralizes all environment variables and provides validation
 */

interface AppConfig {
  // Environment
  nodeEnv: string;
  isProduction: boolean;
  isDevelopment: boolean;

  // Server
  port: number;
  host: string;

  // Database
  databaseUrl: string;

  // Shopify
  shopifyApiKey: string;
  shopifyApiSecret: string;
  shopifyAppUrl: string;
  scopes: string[];

  // Security
  sessionSecret: string;
  metricsToken: string;

  // Email (optional)
  sendgridApiKey?: string;

  // External services
  redisUrl?: string;
  sentryDsn?: string;
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value && !defaultValue) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value || defaultValue!;
}

function validateConfig(config: AppConfig): void {
  // Required validations
  if (!config.shopifyApiKey || config.shopifyApiKey.length < 10) {
    throw new Error("Invalid SHOPIFY_API_KEY");
  }

  if (!config.shopifyApiSecret || config.shopifyApiSecret.length < 10) {
    throw new Error("Invalid SHOPIFY_API_SECRET");
  }

  if (!config.sessionSecret || config.sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  // URL validations
  try {
    new URL(config.shopifyAppUrl);
  } catch {
    throw new Error("SHOPIFY_APP_URL must be a valid URL");
  }

  if (config.databaseUrl && !config.databaseUrl.startsWith("postgresql://") && !config.databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection string or SQLite file path");
  }
}

const config: AppConfig = {
  // Environment
  nodeEnv: getEnvVar("NODE_ENV", "development"),
  isProduction: getEnvVar("NODE_ENV", "development") === "production",
  isDevelopment: getEnvVar("NODE_ENV", "development") === "development",

  // Server
  port: parseInt(getEnvVar("PORT", "3000"), 10),
  host: getEnvVar("HOST", "0.0.0.0"),

  // Database
  databaseUrl: getEnvVar("DATABASE_URL"),

  // Shopify
  shopifyApiKey: getEnvVar("SHOPIFY_API_KEY"),
  shopifyApiSecret: getEnvVar("SHOPIFY_API_SECRET"),
  shopifyAppUrl: getEnvVar("SHOPIFY_APP_URL", "http://localhost:3000"),
  scopes: getEnvVar("SCOPES", "write_products,read_all_orders,read_products,write_orders,read_locations,write_order_edits").split(","),

  // Security
  sessionSecret: getEnvVar("SESSION_SECRET"),
  metricsToken: getEnvVar("METRICS_TOKEN", "default-metrics-token"),

  // Email (optional)
  sendgridApiKey: process.env.SENDGRID_API_KEY,

  // External services (optional)
  redisUrl: process.env.REDIS_URL,
  sentryDsn: process.env.SENTRY_DSN,
};

// Validate configuration on startup
validateConfig(config);

export default config;

// Export individual values for convenience
export const {
  nodeEnv,
  isProduction,
  isDevelopment,
  port,
  host,
  databaseUrl,
  shopifyApiKey,
  shopifyApiSecret,
  shopifyAppUrl,
  scopes,
  sessionSecret,
  metricsToken,
  sendgridApiKey,
  redisUrl,
  sentryDsn
} = config;