import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

// Create a single instance for production
const prisma = global.prismaGlobal ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error", "warn"],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// In development, save to global to avoid creating multiple instances
if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;

  // Ensure local development uses local database
  if (process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('neon') || process.env.DATABASE_URL.includes('postgresql://') || process.env.DATABASE_URL.includes('postgres://'))) {
    console.error('❌ SECURITY WARNING: Development environment is configured to use production database!');
    console.error('Please check your .env file and ensure DATABASE_URL points to a local database.');
    console.error('Current DATABASE_URL:', process.env.DATABASE_URL);
    process.exit(1);
  }
}

// Test database connection on startup
if (process.env.NODE_ENV === "production") {
  let retryCount = 0;
  const maxRetries = 3;

  const testConnection = async () => {
    try {
      await prisma.$connect();
      console.log("✅ Database connected successfully");
      // Test a simple query
      await prisma.session.count();
      console.log("✅ Database query test successful");
    } catch (error) {
      console.error(`❌ Database connection failed (attempt ${retryCount + 1}/${maxRetries}):`, error);
      console.error("DATABASE_URL exists:", !!process.env.DATABASE_URL);
      if (process.env.DATABASE_URL) {
        console.error("DATABASE_URL format check:", process.env.DATABASE_URL.startsWith('postgresql://') ? 'Valid PostgreSQL URL' : 'Invalid URL format');
      }

      if (retryCount < maxRetries - 1) {
        retryCount++;
        console.log(`Retrying connection in 5 seconds... (${retryCount}/${maxRetries})`);
        setTimeout(testConnection, 5000);
      } else {
        console.error("❌ All database connection attempts failed");
      }
    }
  };

  testConnection();
}

export default prisma;
