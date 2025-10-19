import { useLoaderData, useFetcher } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import React, { useState, useCallback, useEffect } from "react";
import {
  Page,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  Modal,
  FormLayout,
  TextField,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { logInfo, logError } from "../logger.server";
import { withCache, cacheKeys, cache } from "../cache.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const offset = (page - 1) * limit;

  // Fetch real products from Shopify with caching (products don't change frequently)
  let products: Array<{label: string, value: string}> = [];
  let productMap: {[key: string]: string} = {};
  try {
    const productsKey = cacheKeys.shopProducts(session.shop);
    const cachedProducts = await withCache(productsKey, 60 * 60 * 1000, async () => { // Cache for 1 hour
      const response = await admin.graphql(`#graphql
        query getProducts {
          products(first: 100) {
            edges {
              node {
                id
                title
                status
                variants(first: 10) {
                  edges {
                    node {
                      id
                      sku
                      title
                      price
                    }
                  }
                }
              }
            }
          }
        }
      `);
      const responseJson = await response.json();
      return responseJson.data.products.edges.flatMap((edge: any) => {
        const product = edge.node;
        return product.variants.edges.map((variant: any) => {
          // Use variant ID as value if SKU is empty
          const value = variant.node.sku || variant.node.id;
          const label = `${product.title}${variant.node.sku ? ` [${variant.node.sku}]` : ' [No SKU]'}`;
          return {
            label,
            value
          };
        });
      }).filter((product: any) => product.label && product.value);
    });

    products = cachedProducts;
    
    // Create product map for display
    products.forEach(product => {
      productMap[product.value] = product.label;
      // Also map variant IDs for backward compatibility
      if (product.value.includes('gid://shopify/ProductVariant/')) {
        productMap[product.value] = product.label;
      }
    });
  } catch (e) {
    logError(e instanceof Error ? e : new Error('Failed to fetch products from Shopify'), { shop: session.shop });
    // Try to get from cache even if expired
    const productsKey = cacheKeys.shopProducts(session.shop);
    const cachedProducts = cache.get<Array<{label: string, value: string}>>(productsKey);
    if (cachedProducts) {
      products = cachedProducts;
      cachedProducts.forEach(product => {
        productMap[product.value] = product.label;
      });
      logInfo('Using expired cached products as fallback', { shop: session.shop, productCount: products.length });
    } else {
      products = [];
    }
  }

  try {
    // Cache bundle rules for 10 minutes (rules don't change frequently)
    const rulesKey = cacheKeys.bundleRules(session.shop);
    const bundleRules = await withCache(rulesKey, 10 * 60 * 1000, async () => {
      return db.bundleRule.findMany({
        where: { shop: session.shop },
        orderBy: { createdAt: 'desc' }
      });
    });

    // Get total count for pagination
    const totalRules = bundleRules.length;

    // Apply pagination to the cached results
    const paginatedRules = bundleRules.slice(offset, offset + limit);

    logInfo('Loaded paginated bundle rules', {
      shop: session.shop,
      page,
      limit,
      rulesCount: paginatedRules.length,
      totalRules
    });

    return json({
      bundleRules: paginatedRules,
      products,
      productMap,
      pagination: {
        page,
        limit,
        total: totalRules,
        totalPages: Math.ceil(totalRules / limit)
      }
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Error loading bundle rules'), { shop: session.shop });
    return json({
      bundleRules: [],
      products,
      productMap,
      pagination: {
        page: 1,
        limit,
        total: 0,
        totalPages: 0
      }
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "createRule") {
    const name = formData.get("name") as string;
    const items = formData.get("items") as string;
    const bundledSku = formData.get("bundledSku") as string;
    const savings = parseFloat(formData.get("savings") as string) || 0;

    // Basic validation
    if (!name?.trim() || !bundledSku?.trim() || !items?.trim()) {
      return json({ 
        success: false, 
        message: "Please fill in all required fields (Name, Products, and Bundled SKU)",
        errors: {
          name: !name?.trim(),
          bundledSku: !bundledSku?.trim(),
          items: !items?.trim()
        }
      });
    }

    // Create new rule in database
    await db.bundleRule.create({
      data: {
        shop: session.shop,
        name: name.trim(),
        items: JSON.stringify(items.split(",").filter(item => item.trim())),
        bundledSku: bundledSku.trim(),
        status: "active",
        frequency: 0,
        savings,
      }
    });

    // Invalidate cache for this shop's bundle rules
    const rulesKey = cacheKeys.bundleRules(session.shop);
    cache.delete(rulesKey);
    
    logInfo('Bundle rule created successfully', { 
      shop: session.shop, 
      ruleName: name,
      bundledSku,
      itemCount: items.split(",").filter(item => item.trim()).length 
    });
    
    return json({ 
      success: true, 
      message: `Bundle rule "${name}" created successfully!`,
      reload: true
    });
  }

  if (action === "updateRule") {
    const ruleId = formData.get("ruleId") as string;
    const name = formData.get("name") as string;
    const items = formData.get("items") as string;
    const bundledSku = formData.get("bundledSku") as string;
    const savings = parseFloat(formData.get("savings") as string) || 0;

    // Basic validation
    if (!name?.trim() || !bundledSku?.trim() || !items?.trim()) {
      return json({ 
        success: false, 
        message: "Please fill in all required fields (Name, Products, and Bundled SKU)",
        errors: {
          name: !name?.trim(),
          bundledSku: !bundledSku?.trim(),
          items: !items?.trim()
        }
      });
    }

    // Update rule in database
    await db.bundleRule.update({
      where: {
        id: ruleId,
        shop: session.shop
      },
      data: {
        name: name.trim(),
        items: JSON.stringify(items.split(",").filter(item => item.trim())),
        bundledSku: bundledSku.trim(),
        savings,
      }
    });

    // Invalidate cache for this shop's bundle rules
    const rulesKey = cacheKeys.bundleRules(session.shop);
    cache.delete(rulesKey);
    
    logInfo('Bundle rule updated successfully', { 
      shop: session.shop, 
      ruleId,
      ruleName: name,
      bundledSku,
      itemCount: items.split(",").filter(item => item.trim()).length 
    });
    
    return json({ 
      success: true, 
      message: `Bundle rule "${name}" updated successfully!`,
      reload: true
    });
  }  if (action === "toggleStatus") {
    const ruleId = formData.get("ruleId") as string;
    const rule = await db.bundleRule.findFirst({
      where: {
        id: ruleId,
        shop: session.shop
      }
    });
    
    if (rule) {
      await db.bundleRule.update({
        where: { id: ruleId },
        data: {
          status: rule.status === "active" ? "draft" : "active"
        }
      });
    }

    // Invalidate cache for this shop's bundle rules
    const rulesKey = cacheKeys.bundleRules(session.shop);
    cache.delete(rulesKey);
    
    return redirect("/app/bundle-rules");
  }

  if (action === "deleteRule") {
    const ruleId = formData.get("ruleId") as string;
    await db.bundleRule.deleteMany({
      where: {
        id: ruleId,
        shop: session.shop
      }
    });

    // Invalidate cache for this shop's bundle rules
    const rulesKey = cacheKeys.bundleRules(session.shop);
    cache.delete(rulesKey);
    
    return redirect("/app/bundle-rules");
  }

  return json({ success: false, message: "Unknown action" });
};


export default function BundleRules() {
  const { bundleRules, products, productMap, pagination } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{
    success: boolean;
    message: string;
    reload?: boolean;
    errors?: {
      name?: boolean;
      bundledSku?: boolean;
      items?: boolean;
    };
  }>();
  const shopify = useAppBridge();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<any>(null);
    const [formData, setFormData] = useState({
    name: '',
    items: [] as string[],
    bundledSku: '',
    savings: '',
  });

  const isLoading = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message);
      if (fetcher.data.reload) {
        // Close modal and reset form
        setIsModalOpen(false);
        setFormData({ name: "", items: [], bundledSku: "", savings: "" });
        // Reload page to show new rule
        window.location.reload();
      }
    } else if (fetcher.data?.success === false && fetcher.data.message) {
      // Show error message
      shopify.toast.show(fetcher.data.message, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleOpenModal = useCallback((rule?: any) => {
    if (rule) {
      // Edit mode
      setEditingRule(rule);
      setFormData({
        name: rule.name,
        items: JSON.parse(rule.items || '[]'),
        bundledSku: rule.bundledSku,
        savings: rule.savings?.toString() || '',
      });
    } else {
      // Create mode
      setEditingRule(null);
      setFormData({ name: "", items: [], bundledSku: "", savings: "" });
    }
    setIsModalOpen(true);
  }, []);
  const handleCloseModal = useCallback(() => setIsModalOpen(false), []);

  const handleSubmit = useCallback(() => {
    fetcher.submit(
      { 
        action: editingRule ? "updateRule" : "createRule",
        ruleId: editingRule?.id,
        name: formData.name,
        items: formData.items.join(","),
        bundledSku: formData.bundledSku,
        savings: formData.savings,
      },
      { method: "POST" }
    );
  }, [fetcher, formData, editingRule]);

  const toggleRuleStatus = useCallback((ruleId: string) => {
    fetcher.submit({ action: "toggleStatus", ruleId }, { method: "POST" });
  }, [fetcher]);

  const deleteRule = useCallback((ruleId: string) => {
    if (confirm("Are you sure you want to delete this rule?")) {
      fetcher.submit({ action: "deleteRule", ruleId }, { method: "POST" });
    }
  }, [fetcher]);

  return (
    <Page>
      <>
      <TitleBar title="Bundle Rules Management">
        {/* Button moved to main content area */}
      </TitleBar>
      
      <BlockStack gap="600">
        {/* Premium Hero Section */}
        <div
          style={{
            background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
            padding: '48px 40px',
            borderRadius: '20px',
            color: 'white',
            boxShadow: '0 20px 25px -5px rgba(139, 92, 246, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          }}
        >
          <BlockStack gap="400">
            <div style={{ textAlign: 'center' }}>
              <Text as="h1" variant="heading3xl" fontWeight="bold">
                <span style={{ color: 'white' }}>📦 Bundle Rules Management</span>
              </Text>
            </div>
            <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
              <Text as="p" variant="bodyLg">
                <span style={{ color: 'rgba(255, 255, 255, 0.95)', fontSize: '18px', lineHeight: '1.6' }}>
                  Automatically convert customer orders into optimized bundles for <strong>40% fulfillment savings</strong>
                </span>
              </Text>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              gap: '32px', 
              flexWrap: 'wrap',
              marginTop: '16px'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: 'white' }}>
                  {pagination.total}
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)' }}>
                  Active Rules
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#fbbf24' }}>
                  {bundleRules.reduce((sum: number, rule: any) => sum + (rule.frequency || 0), 0)}
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)' }}>
                  Monthly Conversions
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#34d399' }}>
                  ${bundleRules.reduce((sum: number, rule: any) => sum + (rule.savings || 0) * (rule.frequency || 0), 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)' }}>
                  Total Savings/Month
                </div>
              </div>
            </div>
          </BlockStack>
        </div>

        {/* Main Content - Full Width */}
        <Card>
          <BlockStack gap="500">
            {/* Enhanced Header */}
            <div
              style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fbbf24 100%)',
                padding: '24px',
                borderRadius: '12px',
              }}
            >
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                      <Text as="h2" variant="heading2xl" fontWeight="bold">
                        📋 Bundle Rules ({pagination.total})
                      </Text>
                      <Text variant="bodyLg" as="p">
                        <span style={{ color: '#78350f' }}>
                          When customers order these items together, they'll be converted to bundled SKUs
                        </span>
                      </Text>
                    </BlockStack>
                    <Button onClick={handleOpenModal} size="large" variant="primary" tone="success">
                      + Create New Rule
                    </Button>
                  </InlineStack>
                </div>

                {/* Premium Table with Custom Styling */}
                {bundleRules.length > 0 ? (
                  <div style={{ 
                    marginTop: '8px',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    border: '1px solid #e5e7eb',
                    background: 'white'
                  }}>
                    {/* Table Header */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.5fr 3fr 1.5fr 1fr 0.8fr 0.8fr 1.5fr',
                        gap: '16px',
                        padding: '20px 24px',
                        background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
                        borderBottom: '2px solid #0ea5e9',
                        fontWeight: '600',
                        borderRadius: '12px 12px 0 0',
                      }}
                    >
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        <span style={{ color: 'white', fontSize: '13px', letterSpacing: '0.5px' }}>📋 RULE NAME</span>
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        <span style={{ color: 'white', fontSize: '13px', letterSpacing: '0.5px' }}>🔗 BUNDLED PRODUCTS</span>
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        <span style={{ color: 'white', fontSize: '13px', letterSpacing: '0.5px' }}>🏷️ BUNDLED SKU</span>
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        <span style={{ color: 'white', fontSize: '13px', letterSpacing: '0.5px' }}>⚡ STATUS</span>
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        <span style={{ color: 'white', fontSize: '13px', letterSpacing: '0.5px' }}>📊 FREQUENCY</span>
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        <span style={{ color: 'white', fontSize: '13px', letterSpacing: '0.5px' }}>💰 SAVINGS</span>
                      </Text>
                      <Text as="p" variant="bodySm" fontWeight="bold">
                        <span style={{ color: 'white', fontSize: '13px', letterSpacing: '0.5px' }}>⚙️ ACTIONS</span>
                      </Text>
                    </div>

                    {/* Table Rows */}
                    <div
                      style={{
                        background: 'white',
                      }}
                    >
                      {bundleRules.map((rule: any, index: number) => {
                        const itemsArray = JSON.parse(rule.items || '[]');
                        const displayItems = itemsArray.map((item: string) => {
                          const cleanItem = productMap[item] || item.replace(/gid:\/\/shopify\/ProductVariant\/\d+/, 'Unknown Product');
                          // Shorten product names
                          return cleanItem.length > 35 ? cleanItem.substring(0, 32) + '...' : cleanItem;
                        }).join(" + ");

                        return (
                          <div
                            key={rule.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1.5fr 3fr 1.5fr 1fr 0.8fr 0.8fr 1.5fr',
                              gap: '16px',
                              padding: '24px',
                              background: index % 2 === 0 ? '#ffffff' : '#fafbfc',
                              borderBottom: index < bundleRules.length - 1 ? '1px solid #e5e7eb' : 'none',
                              alignItems: 'center',
                              transition: 'all 0.3s ease',
                              borderRadius: index === 0 ? '0' : '0',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#f0f9ff';
                              e.currentTarget.style.transform = 'translateX(2px)';
                              e.currentTarget.style.boxShadow = 'inset 4px 0 0 #0ea5e9';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = index % 2 === 0 ? '#ffffff' : '#fafbfc';
                              e.currentTarget.style.transform = 'translateX(0)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            <div style={{ 
                              overflow: 'visible',
                              wordBreak: 'break-word'
                            }}>
                              <Text as="p" variant="bodySm" fontWeight="semibold">
                                <span style={{ color: '#1e293b', fontSize: '13px' }} title={rule.name}>{rule.name}</span>
                              </Text>
                            </div>
                            <div style={{ 
                              lineHeight: '1.4',
                              wordBreak: 'break-word',
                              whiteSpace: 'normal'
                            }}>
                              <Text as="p" variant="bodySm">
                                <span style={{ color: '#64748b', fontSize: '12px', lineHeight: '1.4' }}>
                                  {displayItems}
                                </span>
                              </Text>
                            </div>
                            <div style={{ 
                              overflow: 'visible',
                              wordBreak: 'break-word'
                            }}>
                              <div
                                style={{
                                  background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                                  padding: '5px 10px',
                                  borderRadius: '6px',
                                  display: 'inline-block',
                                  border: '1.5px solid #f59e0b',
                                  boxShadow: '0 1px 3px rgba(245, 158, 11, 0.2)',
                                  wordBreak: 'break-word',
                                  whiteSpace: 'normal'
                                }}
                              >
                                <span style={{ 
                                  color: '#92400e', 
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  display: 'block'
                                }}>{rule.bundledSku}</span>
                              </div>
                            </div>
                            <div style={{
                              display: 'flex',
                              justifyContent: 'flex-start'
                            }}>
                              <div
                                style={{
                                  background: rule.status === "active" 
                                    ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)'
                                    : 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  border: rule.status === "active" ? '1.5px solid #10b981' : '1.5px solid #f59e0b',
                                  fontWeight: '600',
                                  fontSize: '11px',
                                  color: rule.status === "active" ? '#065f46' : '#92400e',
                                }}
                              >
                                <span style={{ fontSize: '8px' }}>{rule.status === "active" ? "●" : "○"}</span>
                                {rule.status === "active" ? "Active" : "Paused"}
                              </div>
                            </div>
                            <div>
                              <div style={{
                                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                                padding: '5px 8px',
                                borderRadius: '6px',
                                display: 'inline-block',
                                border: '1px solid #3b82f6',
                                textAlign: 'center',
                              }}>
                                <span style={{ color: '#1e40af', fontSize: '12px', fontWeight: '600' }}>
                                  {rule.frequency || 0}/mo
                                </span>
                              </div>
                            </div>
                            <div>
                              <div style={{
                                background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                                padding: '5px 8px',
                                borderRadius: '6px',
                                display: 'inline-block',
                                border: '1.5px solid #10b981',
                                textAlign: 'center',
                              }}>
                                <span style={{ color: '#065f46', fontSize: '13px', fontWeight: '600' }}>
                                  ${rule.savings || 0}
                                </span>
                              </div>
                            </div>
                            <div>
                              <InlineStack gap="200">
                                <Button
                                  size="micro"
                                  onClick={() => handleOpenModal(rule)}
                                  variant="secondary"
                                >
                                  ✏️
                                </Button>
                                <Button
                                  size="micro"
                                  onClick={() => toggleRuleStatus(rule.id)}
                                  variant={rule.status === "active" ? "secondary" : "primary"}
                                  tone={rule.status === "active" ? undefined : "success"}
                                >
                                  {rule.status === "active" ? "⏸" : "▶"}
                                </Button>
                                <Button
                                  size="micro"
                                  variant="secondary"
                                  tone="critical"
                                  onClick={() => deleteRule(rule.id)}
                                >
                                  🗑
                                </Button>
                              </InlineStack>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '80px 40px',
                      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                      borderRadius: '20px',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)',
                    }}
                  >
                    <BlockStack gap="500">
                      <div style={{ fontSize: '80px', lineHeight: '1' }}>📦</div>
                      <BlockStack gap="200">
                        <Text as="h3" variant="heading2xl" fontWeight="bold">
                          No Bundle Rules Created Yet
                        </Text>
                        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
                          <Text as="p" variant="bodyLg" tone="subdued">
                            Create your first bundle rule to automatically optimize fulfillment costs when customers order specific item combinations
                          </Text>
                        </div>
                      </BlockStack>
                      <div style={{ marginTop: '16px' }}>
                        <Button variant="primary" size="large" tone="success" onClick={handleOpenModal}>
                          🚀 Create Your First Rule
                        </Button>
                      </div>
                    </BlockStack>
                  </div>
                )}

                {/* Pagination Controls */}
                {pagination.totalPages > 1 && (
                  <div
                    style={{
                      marginTop: '32px',
                      padding: '24px',
                      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                      borderRadius: '16px',
                      border: '1px solid #cbd5e1',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                    }}
                  >
                    <BlockStack gap="300">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Showing {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} rules
                        </Text>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <Button
                            variant="secondary"
                            disabled={pagination.page <= 1}
                            onClick={() => {
                              const newUrl = new URL(window.location.href);
                              newUrl.searchParams.set('page', (pagination.page - 1).toString());
                              window.location.assign(newUrl.toString());
                            }}
                          >
                            ← Previous
                          </Button>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                              const pageNum = i + 1;
                              return (
                                <Button
                                  key={pageNum}
                                  variant={pageNum === pagination.page ? "primary" : "secondary"}
                                  size="slim"
                                  onClick={() => {
                                    const newUrl = new URL(window.location.href);
                                    newUrl.searchParams.set('page', pageNum.toString());
                                    window.location.assign(newUrl.toString());
                                  }}
                                >
                                  {pageNum.toString()}
                                </Button>
                              );
                            })}
                          </div>
                          <Button
                            variant="secondary"
                            disabled={pagination.page >= pagination.totalPages}
                            onClick={() => {
                              const newUrl = new URL(window.location.href);
                              newUrl.searchParams.set('page', (pagination.page + 1).toString());
                              window.location.assign(newUrl.toString());
                            }}
                          >
                            Next →
                          </Button>
                        </div>
                      </div>
                    </BlockStack>
                  </div>
                )}
              </BlockStack>
            </Card>

        {/* Premium Cards Section - Below Table */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(2, 1fr)', 
          gap: '24px',
          marginTop: '24px'
        }}>
          {/* Premium Tips Card */}
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              border: '1px solid #e5e7eb',
            }}
          >
            <BlockStack gap="400">
                <div
                  style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    padding: '20px 24px',
                    borderRadius: '12px',
                    marginBottom: '8px',
                  }}
                >
                  <Text as="h3" variant="headingLg" fontWeight="bold">
                    <span style={{ color: 'white', fontSize: '20px' }}>💡 Bundle Rule Best Practices</span>
                  </Text>
                </div>

                <div
                  style={{
                    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                    padding: '20px',
                    borderRadius: '12px',
                    border: '2px solid #3b82f6',
                    boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.1)',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 12px -2px rgba(59, 130, 246, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(59, 130, 246, 0.1)';
                  }}
                >
                  <BlockStack gap="300">
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px',
                      paddingBottom: '12px',
                      borderBottom: '2px solid rgba(59, 130, 246, 0.2)'
                    }}>
                      <div style={{ 
                        fontSize: '32px', 
                        lineHeight: '1',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                      }}>📊</div>
                      <Text as="p" variant="headingMd" fontWeight="bold">
                        <span style={{ color: '#1e40af' }}>High-Frequency Combinations</span>
                      </Text>
                    </div>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      <span style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                        Focus on item combinations that appear in <strong style={{ color: '#1e40af' }}>5+ orders per month</strong> for maximum impact
                      </span>
                    </Text>
                  </BlockStack>
                </div>

                <div
                  style={{
                    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                    padding: '20px',
                    borderRadius: '12px',
                    border: '2px solid #f59e0b',
                    boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.1)',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 12px -2px rgba(245, 158, 11, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(245, 158, 11, 0.1)';
                  }}
                >
                  <BlockStack gap="300">
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px',
                      paddingBottom: '12px',
                      borderBottom: '2px solid rgba(245, 158, 11, 0.3)'
                    }}>
                      <div style={{ 
                        fontSize: '32px', 
                        lineHeight: '1',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                      }}>🏷️</div>
                      <Text as="p" variant="headingMd" fontWeight="bold">
                        <span style={{ color: '#92400e' }}>SKU Naming Convention</span>
                      </Text>
                    </div>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      <span style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                        Use <strong style={{ color: '#92400e' }}>clear, descriptive names</strong> for bundled SKUs to help your fulfillment team identify items quickly
                      </span>
                    </Text>
                  </BlockStack>
                </div>

                <div
                  style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    padding: '20px',
                    borderRadius: '12px',
                    border: '2px solid #22c55e',
                    boxShadow: '0 4px 6px -1px rgba(34, 197, 94, 0.1)',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 12px -2px rgba(34, 197, 94, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(34, 197, 94, 0.1)';
                  }}
                >
                  <BlockStack gap="300">
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px',
                      paddingBottom: '12px',
                      borderBottom: '2px solid rgba(34, 197, 94, 0.3)'
                    }}>
                      <div style={{ 
                        fontSize: '32px', 
                        lineHeight: '1',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                      }}>💰</div>
                      <Text as="p" variant="headingMd" fontWeight="bold">
                        <span style={{ color: '#15803d' }}>Cost Analysis</span>
                      </Text>
                    </div>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      <span style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                        Ensure bundled SKU pricing accounts for <strong style={{ color: '#15803d' }}>individual item costs</strong> plus savings
                      </span>
                    </Text>
                  </BlockStack>
                </div>

                <div
                  style={{
                    background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
                    padding: '20px',
                    borderRadius: '12px',
                    border: '2px solid #a855f7',
                    boxShadow: '0 4px 6px -1px rgba(168, 85, 247, 0.1)',
                    transition: 'all 0.3s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 12px -2px rgba(168, 85, 247, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(168, 85, 247, 0.1)';
                  }}
                >
                  <BlockStack gap="300">
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '12px',
                      paddingBottom: '12px',
                      borderBottom: '2px solid rgba(168, 85, 247, 0.3)'
                    }}>
                      <div style={{ 
                        fontSize: '32px', 
                        lineHeight: '1',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
                      }}>📦</div>
                      <Text as="p" variant="headingMd" fontWeight="bold">
                        <span style={{ color: '#7e22ce' }}>Inventory Management</span>
                      </Text>
                    </div>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      <span style={{ fontSize: '15px', lineHeight: '1.6', color: '#374151' }}>
                        Coordinate with suppliers to ensure bundled SKUs are <strong style={{ color: '#7e22ce' }}>available in your fulfillment center</strong>
                      </span>
                    </Text>
                  </BlockStack>
                </div>
              </BlockStack>
            </div>

            {/* Premium Performance Metrics Card */}
            <div
              style={{
                background: 'white',
                borderRadius: '16px',
                padding: '28px',
                boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                border: '1px solid #e5e7eb',
              }}
            >
              <BlockStack gap="400">
                <div
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    padding: '20px 24px',
                    borderRadius: '12px',
                  }}
                >
                  <Text as="h3" variant="headingLg" fontWeight="bold">
                    <span style={{ color: 'white', fontSize: '20px' }}>📈 Performance Metrics</span>
                  </Text>
                </div>
                <div
                  style={{
                    background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                    padding: '32px 24px',
                    borderRadius: '16px',
                    textAlign: 'center',
                    border: '2px solid #0ea5e9',
                    boxShadow: '0 8px 16px -4px rgba(14, 165, 233, 0.2)',
                  }}
                >
                  <BlockStack gap="300">
                    <div style={{ 
                      fontSize: '64px', 
                      fontWeight: 'bold', 
                      color: '#0ea5e9',
                      lineHeight: '1',
                      textShadow: '0 2px 4px rgba(14, 165, 233, 0.2)'
                    }}>
                      40%
                    </div>
                    <div style={{
                      height: '3px',
                      width: '60px',
                      background: 'linear-gradient(90deg, #0ea5e9 0%, #06b6d4 100%)',
                      margin: '0 auto',
                      borderRadius: '2px'
                    }}></div>
                    <Text as="p" variant="headingMd" fontWeight="bold">
                      <span style={{ color: '#0c4a6e', fontSize: '17px' }}>Average Savings Per Order</span>
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      <span style={{ color: '#475569', fontSize: '14px' }}>When using bundle optimization</span>
                    </Text>
                  </BlockStack>
                </div>
              </BlockStack>
            </div>
          </div>
      </BlockStack>

      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        title={editingRule ? "Edit Bundle Rule" : "Create New Bundle Rule"}
        primaryAction={{
          content: editingRule ? 'Update Rule' : 'Create Rule',
          onAction: handleSubmit,
          loading: isLoading,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: handleCloseModal,
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Rule Name"
              value={formData.name}
              onChange={(value) => setFormData({...formData, name: value})}
              placeholder="e.g., Main Product Bundle"
              helpText="Give your bundle rule a descriptive name"
              autoComplete="off"
            />
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">Select Products/Variants for Bundle</Text>
              <Text as="p" variant="bodySm" tone="subdued">Choose multiple products/variants from your store</Text>
              <div style={{maxHeight: '200px', overflowY: 'auto', border: '1px solid #e1e3e5', borderRadius: '6px', padding: '12px'}}>
                <BlockStack gap="100">
                  {products.map((product) => (
                    <label key={product.value} style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'}}>
                      <input
                        type="checkbox"
                        checked={formData.items.includes(product.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({...formData, items: [...formData.items, product.value]});
                          } else {
                            setFormData({...formData, items: formData.items.filter(item => item !== product.value)});
                          }
                        }}
                      />
                      <Text as="span" variant="bodySm">{product.label}</Text>
                    </label>
                  ))}
                </BlockStack>
              </div>
              {formData.items.length > 0 && (
                <Text as="p" variant="bodySm" tone="success">
                  Selected: {formData.items.length} product(s)
                </Text>
              )}
            </BlockStack>
            <TextField
              label="Bundled SKU"
              value={formData.bundledSku}
              onChange={(value) => setFormData({...formData, bundledSku: value})}
              placeholder="e.g., SKU-ABC"
              helpText="The pre-bundled SKU that will be sent to fulfillment"
              autoComplete="off"
            />
            <TextField
              label="Expected Savings"
              type="number"
              value={formData.savings}
              onChange={(value) => setFormData({...formData, savings: value})}
              placeholder="e.g., 45"
              helpText="Expected savings per bundle in dollars (e.g., 45 for $45.00)"
              autoComplete="off"
              prefix="$"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
      </>
    </Page>
  );
}
