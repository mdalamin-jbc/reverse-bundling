import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

// Create a single instance for production
const prisma = global.prismaGlobal ?? new PrismaClient({
  log: ["query", "error", "warn"],
});

// In development, save to global to avoid creating multiple instances
if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}

// Test database connection on startup
if (process.env.NODE_ENV === "production") {
  prisma.$connect()
    .then(() => {
      console.log("✅ Database connected successfully");
    })
    .catch((error) => {
      console.error("❌ Database connection failed:", error);
      console.error("DATABASE_URL exists:", !!process.env.DATABASE_URL);
      console.error("DATABASE_URL starts with:", process.env.DATABASE_URL?.substring(0, 20) + "...");
    });
}

export default prisma;
