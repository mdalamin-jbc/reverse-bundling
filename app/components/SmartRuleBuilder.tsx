import React, { useState, useCallback } from "react";
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Modal,
} from "@shopify/polaris";

interface Product {
  label: string;
  value: string;
}

interface SmartRuleBuilderProps {
  products: Product[];
  onSave: (rule: {
    name: string;
    items: string[];
    bundledSku: string;
    savings: number;
  }) => void;
  onCancel: () => void;
}

export function SmartRuleBuilder({ products, onSave, onCancel }: SmartRuleBuilderProps) {
  const [ruleName, setRuleName] = useState("");
  const [bundledSku, setBundledSku] = useState("");
  const [savings, setSavings] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [draggedProduct, setDraggedProduct] = useState<Product | null>(null);

  const handleDragStart = useCallback((product: Product) => {
    setDraggedProduct(product);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (draggedProduct && !selectedProducts.find(p => p.value === draggedProduct.value)) {
      setSelectedProducts(prev => [...prev, draggedProduct]);
    }
    setDraggedProduct(null);
  }, [draggedProduct, selectedProducts]);

  const removeProduct = useCallback((productValue: string) => {
    setSelectedProducts(prev => prev.filter(p => p.value !== productValue));
  }, []);

  const handleSave = useCallback(() => {
    if (ruleName && selectedProducts.length > 0 && bundledSku) {
      onSave({
        name: ruleName,
        items: selectedProducts.map(p => p.value),
        bundledSku,
        savings: parseFloat(savings) || 0,
      });
    }
  }, [ruleName, selectedProducts, bundledSku, savings, onSave]);

  const isValid = ruleName && selectedProducts.length > 0 && bundledSku;

  return (
    <Modal
      open={true}
      onClose={onCancel}
      title="🎨 Smart Rule Builder"
      primaryAction={{
        content: 'Create Rule',
        onAction: handleSave,
        disabled: !isValid,
      }}
      secondaryActions={[
        {
          content: 'Cancel',
          onAction: onCancel,
        },
      ]}
      size="large"
    >
      <Modal.Section>
        <BlockStack gap="500">
          {/* Rule Configuration */}
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">
                📋 Rule Configuration
              </Text>
              <BlockStack gap="300">
                <TextField
                  label="Rule Name"
                  value={ruleName}
                  onChange={setRuleName}
                  placeholder="e.g., Premium Phone Bundle"
                  autoComplete="off"
                />
                <InlineStack gap="400">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Bundled SKU"
                      value={bundledSku}
                      onChange={setBundledSku}
                      placeholder="PHONE-PREMIUM-BUNDLE"
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Expected Savings ($)"
                      type="number"
                      value={savings}
                      onChange={setSavings}
                      placeholder="25.99"
                      autoComplete="off"
                    />
                  </div>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>

          {/* Visual Builder */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
            {/* Product Library */}
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  🏪 Product Library
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Drag products into the bundle zone below
                </Text>
                <div style={{
                  maxHeight: '400px',
                  overflowY: 'auto',
                  border: '2px dashed #e1e5e9',
                  borderRadius: '8px',
                  padding: '16px',
                  background: '#fafbfc',
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '12px',
                  }}>
                    {products.map((product) => (
                      <div
                        key={product.value}
                        draggable
                        onDragStart={() => handleDragStart(product)}
                        style={{
                          padding: '12px',
                          border: '1px solid #d1d5db',
                          borderRadius: '6px',
                          background: 'white',
                          cursor: 'grab',
                          transition: 'all 0.2s ease',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                        }}
                      >
                        <Text as="p" variant="bodySm" fontWeight="medium">
                          {product.label}
                        </Text>
                      </div>
                    ))}
                  </div>
                </div>
              </BlockStack>
            </Card>

            {/* Bundle Zone */}
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  📦 Bundle Zone
                </Text>
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  style={{
                    minHeight: '300px',
                    border: '2px dashed #3b82f6',
                    borderRadius: '8px',
                    padding: '16px',
                    background: selectedProducts.length > 0 ? '#eff6ff' : '#fafbfc',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {selectedProducts.length === 0 ? (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '200px',
                      color: '#6b7280',
                    }}>
                      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎯</div>
                      <Text as="p" variant="bodyMd" alignment="center">
                        Drop products here to create your bundle
                      </Text>
                    </div>
                  ) : (
                    <BlockStack gap="300">
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        alignItems: 'center',
                      }}>
                        {selectedProducts.map((product) => (
                          <div
                            key={product.value}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              background: '#dbeafe',
                              color: '#1e40af',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: '500',
                              margin: '2px',
                            }}
                          >
                            <span>{product.label}</span>
                            <button
                              onClick={() => removeProduct(product.value)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'inherit',
                                cursor: 'pointer',
                                fontSize: '14px',
                                padding: '0',
                                marginLeft: '4px',
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>

                      {selectedProducts.length > 0 && (
                        <div style={{
                          marginTop: '16px',
                          padding: '12px',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          borderRadius: '6px',
                          color: 'white',
                        }}>
                          <Text as="p" variant="bodySm" fontWeight="medium">
                            ✨ {selectedProducts.length} products bundled together
                          </Text>
                        </div>
                      )}
                    </BlockStack>
                  )}
                </div>
              </BlockStack>
            </Card>
          </div>

          {/* Rule Preview */}
          {isValid && (
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  👀 Rule Preview
                </Text>
                <div style={{
                  background: '#f8fafc',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                }}>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      📋 {ruleName}
                    </Text>
                    <Text as="p" variant="bodySm">
                      <strong>Items:</strong> {selectedProducts.map(p => p.label).join(" + ")}
                    </Text>
                    <Text as="p" variant="bodySm">
                      <strong>Bundled SKU:</strong> {bundledSku}
                    </Text>
                    <Text as="p" variant="bodySm">
                      <strong>Expected Savings:</strong> ${savings || "0.00"}
                    </Text>
                  </BlockStack>
                </div>
              </BlockStack>
            </Card>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}