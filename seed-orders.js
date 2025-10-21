import { PrismaClient } from '@prisma/client';

async function seedSampleOrders() {
  const prisma = new PrismaClient();

  try {
    // Sample order data with common item combinations
    const sampleOrders = [
      {
        orderId: 'ORD-001',
        orderNumber: '#1001',
        orderDate: new Date('2024-10-01'),
        customerId: 'CUST-001',
        lineItems: JSON.stringify([
          { sku: 'SNOWBOARD-001', quantity: 1, price: 299.99 },
          { sku: 'SNOWBOARD-BINDINGS-001', quantity: 1, price: 149.99 },
          { sku: 'SNOWBOARD-BOOTS-001', quantity: 1, price: 199.99 }
        ]),
        totalValue: 649.97
      },
      {
        orderId: 'ORD-002',
        orderNumber: '#1002',
        orderDate: new Date('2024-10-02'),
        customerId: 'CUST-002',
        lineItems: JSON.stringify([
          { sku: 'SNOWBOARD-001', quantity: 1, price: 299.99 },
          { sku: 'SNOWBOARD-BINDINGS-001', quantity: 1, price: 149.99 }
        ]),
        totalValue: 449.98
      },
      {
        orderId: 'ORD-003',
        orderNumber: '#1003',
        orderDate: new Date('2024-10-03'),
        customerId: 'CUST-003',
        lineItems: JSON.stringify([
          { sku: 'SNOWBOARD-HELmets-001', quantity: 1, price: 89.99 },
          { sku: 'SNOWBOARD-GOGGLES-001', quantity: 1, price: 79.99 }
        ]),
        totalValue: 169.98
      },
      {
        orderId: 'ORD-004',
        orderNumber: '#1004',
        orderDate: new Date('2024-10-04'),
        customerId: 'CUST-004',
        lineItems: JSON.stringify([
          { sku: 'SNOWBOARD-001', quantity: 1, price: 299.99 },
          { sku: 'SNOWBOARD-BINDINGS-001', quantity: 1, price: 149.99 },
          { sku: 'SNOWBOARD-HELmets-001', quantity: 1, price: 89.99 }
        ]),
        totalValue: 539.97
      },
      {
        orderId: 'ORD-005',
        orderNumber: '#1005',
        orderDate: new Date('2024-10-05'),
        customerId: 'CUST-005',
        lineItems: JSON.stringify([
          { sku: 'SNOWBOARD-BOOTS-001', quantity: 1, price: 199.99 },
          { sku: 'SNOWBOARD-BINDINGS-001', quantity: 1, price: 149.99 }
        ]),
        totalValue: 349.98
      },
      {
        orderId: 'ORD-006',
        orderNumber: '#1006',
        orderDate: new Date('2024-10-06'),
        customerId: 'CUST-006',
        lineItems: JSON.stringify([
          { sku: 'SNOWBOARD-001', quantity: 1, price: 299.99 },
          { sku: 'SNOWBOARD-GOGGLES-001', quantity: 1, price: 79.99 }
        ]),
        totalValue: 379.98
      },
      {
        orderId: 'ORD-007',
        orderNumber: '#1007',
        orderDate: new Date('2024-10-07'),
        customerId: 'CUST-007',
        lineItems: JSON.stringify([
          { sku: 'SNOWBOARD-HELmets-001', quantity: 1, price: 89.99 },
          { sku: 'SNOWBOARD-BINDINGS-001', quantity: 1, price: 149.99 },
          { sku: 'SNOWBOARD-BOOTS-001', quantity: 1, price: 199.99 }
        ]),
        totalValue: 439.97
      },
      {
        orderId: 'ORD-008',
        orderNumber: '#1008',
        orderDate: new Date('2024-10-08'),
        customerId: 'CUST-008',
        lineItems: JSON.stringify([
          { sku: 'SNOWBOARD-001', quantity: 1, price: 299.99 }
        ]),
        totalValue: 299.99
      }
    ];

    // Insert sample orders
    for (const order of sampleOrders) {
      await prisma.orderHistory.create({
        data: {
          shop: 'quickstart-9525e261.myshopify.com', // Use the shop from the dev environment
          ...order
        }
      });
    }

    console.log(`Seeded ${sampleOrders.length} sample orders`);

    // Check final counts
    const orderCount = await prisma.orderHistory.count();
    console.log('Total OrderHistory records:', orderCount);

  } catch (error) {
    console.error('Seeding error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedSampleOrders();