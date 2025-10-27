import { PrismaClient } from '@prisma/client';

async function checkBundleRules() {
  const prisma = new PrismaClient();

  try {
    const bundleRules = await prisma.bundleRule.findMany({
      select: {
        id: true,
        name: true,
        items: true,
        shop: true
      }
    });

    console.log(`Found ${bundleRules.length} bundle rules:`);

    bundleRules.forEach(rule => {
      const itemsArray = JSON.parse(rule.items || '[]');
      const filteredItems = itemsArray.filter((item) => item.trim());
      const emptyCount = itemsArray.length - filteredItems.length;

      console.log(`Rule: ${rule.name}`);
      console.log(`  Raw items count: ${itemsArray.length}`);
      console.log(`  Filtered items count: ${filteredItems.length}`);
      console.log(`  Empty/invalid items: ${emptyCount}`);
      console.log(`  Items: ${JSON.stringify(itemsArray)}`);
      if (emptyCount > 0) {
        console.log(`  ⚠️  DISCREPANCY FOUND!`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('Database check error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkBundleRules();