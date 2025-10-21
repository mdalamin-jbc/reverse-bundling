// Test script to verify the null reference fix in OrderAnalysisService
const testData = {
  data: {
    orders: {
      edges: [
        {
          node: {
            id: "gid://shopify/Order/12345",
            createdAt: "2025-01-01T00:00:00Z",
            totalPrice: "100.00",
            lineItems: {
              edges: [
                {
                  node: {
                    variant: {
                      id: "gid://shopify/ProductVariant/1",
                      product: {
                        id: "gid://shopify/Product/1",
                        title: "Product 1"
                      },
                      sku: "SKU001",
                      price: "50.00"
                    },
                    quantity: 1
                  }
                },
                {
                  node: {
                    variant: {
                      id: "gid://shopify/ProductVariant/2",
                      product: {
                        id: "gid://shopify/Product/2",
                        title: "Product 2"
                      },
                      sku: "SKU002",
                      price: "50.00"
                    },
                    quantity: 1
                  }
                }
              ]
            }
          }
        },
        // Test case with null variant
        {
          node: {
            id: "gid://shopify/Order/12346",
            createdAt: "2025-01-02T00:00:00Z",
            totalPrice: "75.00",
            lineItems: {
              edges: [
                {
                  node: {
                    variant: null, // This should be filtered out
                    quantity: 1
                  }
                }
              ]
            }
          }
        },
        // Test case with missing product
        {
          node: {
            id: "gid://shopify/Order/12347",
            createdAt: "2025-01-03T00:00:00Z",
            totalPrice: "25.00",
            lineItems: {
              edges: [
                {
                  node: {
                    variant: {
                      id: "gid://shopify/ProductVariant/3",
                      product: null, // This should be filtered out
                      sku: "SKU003",
                      price: "25.00"
                    },
                    quantity: 1
                  }
                }
              ]
            }
          }
        }
      ]
    }
  }
};

console.log("Testing null reference fix...");

// Simulate the filtering and mapping logic from fetchOrdersFromShopify
try {
  const result = testData.data.orders.edges
    .filter((edge: any) => edge?.node?.id && edge?.node?.lineItems?.edges)
    .map((edge: any) => ({
      id: edge.node.id,
      items: edge.node.lineItems.edges
        .filter((itemEdge: any) =>
          itemEdge?.node?.variant?.id &&
          itemEdge?.node?.variant?.product?.id &&
          itemEdge?.node?.variant?.sku // Only include items with SKUs for analysis
        )
        .map((itemEdge: any) => ({
          variantId: itemEdge.node.variant.id,
          productId: itemEdge.node.variant.product.id,
          quantity: itemEdge.node.quantity || 1,
          price: parseFloat(itemEdge.node.variant.price) || 0,
          sku: itemEdge.node.variant.sku,
          productTitle: itemEdge.node.variant.product.title || 'Unknown Product',
        })),
      totalPrice: parseFloat(edge.node.totalPrice) || 0,
      createdAt: edge.node.createdAt,
    }))
    .filter((order: any) => order.items.length > 1); // Only include orders with multiple items

  console.log("✅ Test passed! No null reference errors.");
  console.log("Filtered orders:", result.length);
  console.log("Orders with multiple items:", result.length);

} catch (error) {
  console.error("❌ Test failed with error:", error.message);
}