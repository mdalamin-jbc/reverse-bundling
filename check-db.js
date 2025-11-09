import { PrismaClient } from '@prisma/client';

async function checkDatabase() {
  const prisma = new PrismaClient();

  try {
    // Check tables
    const tables = await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table'`;
    console.log('Tables in database:', tables.map(t => t.name));

    // Check counts
    const orderHistoryCount = await prisma.orderHistory.count();
    const bundleRuleCount = await prisma.bundleRule.count();
    const itemCooccurrenceCount = await prisma.itemCooccurrence.count();
    const bundleSuggestionCount = await prisma.bundleSuggestion.count();

    console.log('OrderHistory records:', orderHistoryCount);
    console.log('BundleRule records:', bundleRuleCount);
    console.log('ItemCooccurrence records:', itemCooccurrenceCount);
    console.log('BundleSuggestion records:', bundleSuggestionCount);

  } catch (error) {
    console.error('Database check error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();