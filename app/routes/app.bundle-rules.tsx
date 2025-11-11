import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import React, { useState, useCallback, useEffect, useMemo } from "react";
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
  IndexTable,
  Badge,
  useIndexResourceState,
  Filters,
  ChoiceList,
  Select,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { logInfo, logError, logWarning } from "../logger.server";
import { withCache, cacheKeys, cache } from "../cache.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log('Bundle rules loader called');
  const { admin, session } = await authenticate.admin(request);
  console.log('Authentication successful for shop:', session.shop);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const sortBy = url.searchParams.get("sortBy") || "createdAt";
  const sortDirection = url.searchParams.get("sortDirection") || "desc";
  const search = url.searchParams.get("search") || "";
  const statusFilter = url.searchParams.get("status") || "";
  const categoryFilter = url.searchParams.get("category") || "";
  const tagFilter = url.searchParams.get("tag") || "";
  const offset = (page - 1) * limit;

  // Fetch real products from Shopify with caching (products don't change frequently)
  let products: Array<{
    label: string,
    value: string,
    sku?: string,
    price?: number,
    productTitle?: string,
    variantTitle?: string
  }> = [];
  let productMap: {[key: string]: string} = {};
  let dynamicCategories: string[] = [];
  let dynamicTags: string[] = [];
  try {
    const productsKey = cacheKeys.shopProducts(session.shop);
    const cachedProducts = await withCache(productsKey, 60 * 60 * 1000, async () => { // Cache for 1 hour
      console.log('Fetching products from Shopify for shop:', session.shop);
      const response = await admin.graphql(`#graphql
        query getProducts($query: String) {
          products(first: 100, query: $query) {
            edges {
              node {
                id
                title
                productType
                status
                collections(first: 5) {
                  edges {
                    node {
                      title
                    }
                  }
                }
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
      `, {
        variables: {
          query: "status:active"
        }
      });
      const responseJson = await response.json();
      console.log('Shopify products response:', JSON.stringify(responseJson, null, 2));
      
      if ((responseJson as any).errors) {
        console.error('GraphQL errors:', (responseJson as any).errors);
        throw new Error(`GraphQL errors: ${JSON.stringify((responseJson as any).errors)}`);
      }
      
      const productsData = responseJson.data?.products?.edges || [];
      console.log(`Found ${productsData.length} products`);
      
      return productsData.flatMap((edge: any) => {
        const product = edge.node;
        console.log(`Processing product: ${product.title}, status: ${product.status}, variants: ${product.variants.edges.length}`);
        return product.variants.edges.map((variant: any) => {
          // Always use variant ID as value for GraphQL queries
          const value = variant.node.id;
          const label = `${product.title}${variant.node.sku ? ` [${variant.node.sku}]` : ' [No SKU]'}`;
          console.log(`Variant: ${label}, value: ${value}, price: ${variant.node.price}`);
          return {
            label,
            value,
            sku: variant.node.sku || '',
            price: parseFloat(variant.node.price || '0') || 0,
            productTitle: product.title,
            variantTitle: variant.node.title || '',
            productType: product.productType || '',
            collections: product.collections?.edges?.map((edge: any) => ({ title: edge.node.title })) || []
          };
        });
      }).filter((product: any) => product.label && product.value);
    });

    products = cachedProducts;
    console.log(`Final products array length: ${products.length}`);
    
    // Extract unique categories from products
    const categoriesSet = new Set<string>();
    cachedProducts.forEach((product: any) => {
      // Add product type as category
      if (product.productType && product.productType.trim()) {
        categoriesSet.add(product.productType.trim());
      }
      // Add collection titles as categories
      if (product.collections) {
        product.collections.forEach((collection: any) => {
          if (collection.title && collection.title.trim()) {
            categoriesSet.add(collection.title.trim());
          }
        });
      }
    });
    const dynamicCategories = Array.from(categoriesSet).sort();
    
    // Create product map for display (map both variant IDs and SKUs to labels)
    products.forEach(product => {
      // Map variant ID to label
      productMap[product.value] = product.label;
      // Also map SKU to label for backward compatibility with existing rules
      if (product.sku) {
        productMap[product.sku] = product.label;
      }
    });
    
    console.log('Loaded products from Shopify:', products.length);
    console.log('Dynamic categories extracted:', dynamicCategories);
    console.log('Sample products:', products.slice(0, 2));
  } catch (e) {
    console.error('Error fetching products:', e);
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
    // Set empty arrays for categories and tags when products can't be fetched
    dynamicCategories = [];
    dynamicTags = [];
  }

  try {
    // Cache bundle rules for 10 minutes (rules don't change frequently)
    const rulesKey = cacheKeys.bundleRules(session.shop);
    const allBundleRules = await withCache(rulesKey, 10 * 60 * 1000, async () => {
      return db.bundleRule.findMany({
        where: { shop: session.shop },
        orderBy: { createdAt: 'desc' },
        include: {
          conversions: {
            where: {
              convertedAt: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
              }
            }
          }
        }
      });
    });

    // Calculate performance metrics for each rule
    const rulesWithMetrics = allBundleRules.map(rule => {
      const recentConversions = rule.conversions?.length || 0;
      const totalRevenue = rule.conversions?.reduce((sum, conv) => sum + conv.savingsAmount, 0) || 0;
      
      // Calculate conversion rate (simplified - would need total orders data)
      const conversionRate = recentConversions > 0 ? Math.min((recentConversions / Math.max(rule.frequency || 1, 1)) * 100, 100) : 0;
      
      // Calculate health score based on performance and recency
      let healthScore = 100;
      const ruleWithFields = rule as any;
      const daysSinceLastConversion = ruleWithFields.lastConversionAt ?
        Math.floor((Date.now() - new Date(ruleWithFields.lastConversionAt).getTime()) / (1000 * 60 * 60 * 24)) : 999;

      if (daysSinceLastConversion > 30) healthScore -= 30;
      if (conversionRate < 5) healthScore -= 20;
      if (!ruleWithFields.category) healthScore -= 10;
      if (!ruleWithFields.tags || JSON.parse(ruleWithFields.tags).length === 0) healthScore -= 10;

      healthScore = Math.max(0, Math.min(100, healthScore));

      return {
        ...rule,
        conversionRate: Math.round(conversionRate * 10) / 10,
        revenueImpact: totalRevenue,
        healthScore,
        lastConversionAt: ruleWithFields.lastConversionAt || rule.createdAt,
      };
    });

    // Extract unique tags from all bundle rules
    const tagsSet = new Set<string>();
    allBundleRules.forEach((rule: any) => {
      const ruleTags = JSON.parse(rule.tags || '[]');
      ruleTags.forEach((tag: string) => {
        if (tag && tag.trim()) {
          tagsSet.add(tag.trim());
        }
      });
    });
    const dynamicTags = Array.from(tagsSet).sort();

    // Extract unique categories from bundle rules
    const ruleCategoriesSet = new Set<string>();
    allBundleRules.forEach((rule: any) => {
      if (rule.category && rule.category.trim()) {
        ruleCategoriesSet.add(rule.category.trim());
      }
    });
    const ruleCategories = Array.from(ruleCategoriesSet);

    // Combine product categories and rule categories
    const allCategoriesSet = new Set([...dynamicCategories, ...ruleCategories]);
    const finalCategories = Array.from(allCategoriesSet).sort();

    // Apply filters
    let filteredRules = rulesWithMetrics;

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filteredRules = filteredRules.filter(rule => 
        rule.name.toLowerCase().includes(searchLower) ||
        rule.bundledSku.toLowerCase().includes(searchLower) ||
        JSON.parse(rule.items || '[]').some((item: string) => 
          productMap[item]?.toLowerCase().includes(searchLower) || 
          item.toLowerCase().includes(searchLower)
        )
      );
    }

    // Apply status filter
    if (statusFilter) {
      filteredRules = filteredRules.filter(rule => rule.status === statusFilter);
    }

    // Apply category filter
    if (categoryFilter) {
      filteredRules = filteredRules.filter((rule: any) => rule.category === categoryFilter);
    }

    // Apply tag filter
    if (tagFilter) {
      filteredRules = filteredRules.filter((rule: any) => {
        const tags = JSON.parse(rule.tags || '[]');
        return tags.includes(tagFilter);
      });
    }

    // Apply sorting
    const sortedRules = [...filteredRules].sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'frequency':
          aValue = a.frequency || 0;
          bValue = b.frequency || 0;
          break;
        case 'savings':
          aValue = a.savings || 0;
          bValue = b.savings || 0;
          break;
        case 'createdAt':
        default:
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
      }
      
      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    // Get total count for pagination (after filtering)
    const totalRules = sortedRules.length;

    // Apply pagination to the sorted results
    const paginatedRules = sortedRules.slice(offset, offset + limit);

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
      categories: finalCategories,
      tags: dynamicTags,
      pagination: {
        page,
        limit,
        total: totalRules,
        totalPages: Math.ceil(totalRules / limit)
      },
      sorting: {
        sortBy,
        sortDirection
      },
      filters: {
        search,
        status: statusFilter,
        category: categoryFilter,
        tag: tagFilter
      }
    });
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Error loading bundle rules'), { shop: session.shop });
    return json({
      bundleRules: [],
      products,
      productMap,
      categories: dynamicCategories, // Use product categories only in error case
      tags: dynamicTags,
      pagination: {
        page: 1,
        limit,
        total: 0,
        totalPages: 0
      },
      sorting: {
        sortBy,
        sortDirection
      },
      filters: {
        search,
        status: statusFilter,
        category: categoryFilter,
        tag: tagFilter
      }
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log('Bundle rules action called');
  const { session } = await authenticate.admin(request);
  console.log('Action authentication successful for shop:', session.shop);
  const formData = await request.formData();
  const action = formData.get("action");

  if (action === "createRule") {
    const name = formData.get("name") as string;
    const items = formData.get("items") as string;
    const bundledSku = formData.get("bundledSku") as string;
    const savings = parseFloat(formData.get("savings") as string) || 0;
    const autoCreateProduct = formData.get("autoCreateProduct") === "true";

    // Basic validation
    if (!name?.trim() || !items?.trim()) {
      return json({ 
        success: false, 
        message: "Please fill in all required fields (Name and Products)",
        errors: {
          name: !name?.trim(),
          items: !items?.trim()
        }
      });
    }

    // If not auto-creating, require SKU
    if (!autoCreateProduct && !bundledSku?.trim()) {
      return json({ 
        success: false, 
        message: "Please provide a Bundled SKU for your existing product",
        errors: {
          bundledSku: true
        }
      });
    }

    // Generate rule ID once at the beginning - this will be used for both database and product tagging
    const ruleId = Date.now().toString();

    let finalBundledSku = bundledSku?.trim() || '';

    // Auto-create Shopify product if requested
    if (autoCreateProduct) {
      console.log('Action: Starting auto-create with bundledSku from form:', bundledSku);
      let itemIds: string[] = [];
      let variantIds: string[] = [];
      let bundlePrice = 0;

      // Generate a unique SKU for auto-created products if none provided
      if (!finalBundledSku) {
        finalBundledSku = `BUNDLE-${ruleId}`;
      }

      console.log('Using generated/final bundled SKU:', finalBundledSku);

      try {
        console.log('Starting auto-create product process');
        const { admin } = await authenticate.admin(request);
        
        // Use the ruleId generated at the beginning for consistent tagging
        console.log('Using ruleId for tagging:', ruleId);
        
        // Parse items to calculate bundle price
        itemIds = items.split(",").filter(item => item.trim());
        console.log('Parsed itemIds:', itemIds);
        
        // Convert any SKUs to variant IDs (for backward compatibility with existing rules)
        for (const itemId of itemIds) {
          if (itemId.startsWith('gid://shopify/ProductVariant/')) {
            // Already a variant ID
            variantIds.push(itemId);
          } else {
            // It's a SKU, need to find the variant ID
            console.log('Resolving SKU to variant ID:', itemId);
            try {
              const variantResponse = await admin.graphql(`
                query getVariantBySku($sku: String!) {
                  productVariants(first: 1, query: "sku:$sku") {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              `, {
                variables: { sku: itemId }
              });
              const variantData = await variantResponse.json();
              console.log('Variant lookup response:', variantData);
              const foundVariant = variantData.data?.productVariants?.edges?.[0]?.node;
              if (foundVariant) {
                variantIds.push(foundVariant.id);
                console.log('Found variant ID:', foundVariant.id);
              } else {
                logWarning(`Could not find variant for SKU: ${itemId}`, { shop: session.shop });
              }
            } catch (skuError) {
              logWarning(`Error resolving SKU to variant ID: ${itemId}`, { shop: session.shop, error: skuError });
            }
          }
        }
        
        console.log('Final variantIds:', variantIds);
        
        // Ensure we have valid variant IDs
        if (variantIds.length === 0) {
          return json({ 
            success: false, 
            message: "No valid products found for bundle creation. Please check that the selected products exist and have valid SKUs.",
            errors: {}
          });
        }

        // Validate variant IDs format
        const invalidIds = variantIds.filter(id => !id.startsWith('gid://shopify/ProductVariant/'));
        if (invalidIds.length > 0) {
          console.error('Invalid variant IDs found:', invalidIds);
          return json({ 
            success: false, 
            message: "Invalid product variant IDs detected. Please refresh the page and try again.",
            errors: {}
          });
        }
        
        // Get product prices from cached data (we'll need to pass this from loader)
        // For now, use a simplified calculation - in production you'd fetch fresh prices
        let totalIndividualPrice = 0;

        // This is a placeholder - in a real implementation, you'd have access to product prices
        // For now, assume we need to fetch them
        console.log('About to fetch prices for variantIds:', variantIds);
        try {
          const productsResponse = await admin.graphql(`
            query getProductVariants($ids: [ID!]!) {
              nodes(ids: $ids) {
                ... on ProductVariant {
                  price
                }
              }
            }
          `, {
            variables: {
              ids: variantIds
            }
          });

          const productsData = await productsResponse.json();
          console.log('Price fetch response status:', productsResponse.status);
          console.log('Price fetch response data:', JSON.stringify(productsData, null, 2));

          // Check for GraphQL errors
          if ((productsData as any).errors) {
            console.error('GraphQL errors in price fetch:', (productsData as any).errors);
            throw new Error(`GraphQL errors: ${JSON.stringify((productsData as any).errors)}`);
          }

          if (productsData.data?.errors) {
            console.error('Data errors in price fetch:', productsData.data.errors);
            throw new Error(`Data errors: ${JSON.stringify(productsData.data.errors)}`);
          }

          const variants = productsData.data?.nodes || [];
          console.log('Found variants:', variants.length);
          
          if (variants.length !== variantIds.length) {
            console.warn(`Expected ${variantIds.length} variants but got ${variants.length}`);
          }

          totalIndividualPrice = variants.reduce((sum: number, variant: any) => {
            if (!variant) {
              console.warn('Null variant found in response');
              return sum;
            }
            const price = parseFloat(variant?.price || '0');
            console.log('Variant price:', variant?.price, 'parsed:', price);
            return sum + price;
          }, 0);
          console.log('Total individual price calculated:', totalIndividualPrice);
        } catch (priceError) {
          const errorMessage = priceError instanceof Error ? priceError.message : String(priceError);
          console.error('Price fetch error details:', errorMessage);
          logWarning('Could not fetch product prices for bundle calculation, using default', {
            shop: session.shop,
            error: errorMessage,
            variantIds
          });
          totalIndividualPrice = variantIds.length * 10; // Fallback
          console.log('Using fallback price:', totalIndividualPrice);
        }
        
        bundlePrice = totalIndividualPrice; // Keep original total price, savings applied separately
        console.log('Bundle price set to original total (savings applied separately):', bundlePrice, 'from total:', totalIndividualPrice, 'savings will be applied at checkout:', savings);
        
        // Create Shopify product using productSet mutation
        console.log('Creating Shopify product with input:', {
          title: `${name} Bundle`,
          status: "ACTIVE",
          productType: "Bundle",
          tags: ["auto-generated", "bundle", `rule-${ruleId}`],
          productOptions: [{
            name: "Title",
            values: [{ name: "Default Title" }]
          }],
          variants: [{
            optionValues: [{
              name: "Default Title",
              optionName: "Title"
            }],
            sku: finalBundledSku,
            price: bundlePrice.toFixed(2),
            inventoryPolicy: "DENY"
          }]
        });

        try {
          const { admin } = await authenticate.admin(request);

          const productSetMutation = `
            mutation productSet($input: ProductSetInput!) {
              productSet(input: $input) {
                product {
                  id
                  title
                  variants(first: 1) {
                    edges {
                      node {
                        id
                        sku
                        price
                        inventoryPolicy
                      }
                    }
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const productSetResponse = await admin.graphql(productSetMutation, {
            variables: {
              input: {
                title: `${name} Bundle`,
                status: "ACTIVE",
                productType: "Bundle",
                tags: ["auto-generated", "bundle", `rule-${ruleId}`],
                productOptions: [{
                  name: "Title",
                  values: [{ name: "Default Title" }]
                }],
                variants: [{
                  optionValues: [{
                    name: "Default Title",
                    optionName: "Title"
                  }],
                  sku: finalBundledSku,
                  price: bundlePrice.toFixed(2),
                  inventoryPolicy: "DENY"
                }]
              }
            }
          });

          const productSetData = await productSetResponse.json();
          console.log('Product set response status:', productSetResponse.status);
          console.log('Product set response data:', JSON.stringify(productSetData, null, 2));
          
          if ((productSetData as any).errors) {
            console.error('GraphQL errors in product creation:', (productSetData as any).errors);
            throw new Error(`GraphQL errors in product creation: ${JSON.stringify((productSetData as any).errors)}`);
          }

          if (productSetData.data?.productSet?.userErrors?.length > 0) {
            const errors = productSetData.data.productSet.userErrors;
            console.error('User errors in product creation:', errors);
            const errorMessages = errors.map((err: any) => `${err.field}: ${err.message}`).join(', ');
            throw new Error(`Product creation failed: ${errorMessages}`);
          }

          const product = productSetData.data?.productSet?.product;
          if (!product) {
            throw new Error('Product creation failed: No product returned');
          }

          const defaultVariant = product.variants?.edges?.[0]?.node;
          
          if (!defaultVariant) {
            throw new Error('Product creation failed: No default variant created');
          }

          console.log('Product created successfully with ID:', product.id);
          console.log('Default variant ID:', defaultVariant.id);

          logInfo('Auto-created Shopify bundle product', { 
            shop: session.shop, 
            productId: product.id,
            variantId: defaultVariant.id,
            sku: finalBundledSku,
            title: `${name} Bundle`
          });
        } catch (createError) {
          const errorMessage = createError instanceof Error ? createError.message : String(createError);
          console.error('Product/variant creation failed:', errorMessage);
          logError(createError instanceof Error ? createError : new Error(errorMessage), { 
            context: 'product_variant_creation', 
            shop: session.shop,
            input: {
              title: `${name} Bundle`,
              status: "ACTIVE",
              productType: "Bundle",
              tags: ["auto-generated", "bundle", `rule-${ruleId}`],
              productOptions: [{
                name: "Title",
                values: [{ name: "Default Title" }]
              }],
              variants: [{
                optionValues: [{
                  name: "Default Title",
                  optionName: "Title"
                }],
                sku: finalBundledSku,
                price: bundlePrice.toFixed(2),
                inventoryPolicy: "DENY"
              }]
            }
          });
          return json({ 
            success: false, 
            message: `Failed to create bundle product in Shopify: ${errorMessage}`,
            errors: {}
          });
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Auto-create product failed:', errorMessage);
        logError(error instanceof Error ? error : new Error(errorMessage), { 
          context: 'auto_create_product', 
          shop: session.shop,
          itemIds,
          variantIds: variantIds.length,
          finalBundledSku,
          bundlePrice
        });
        return json({ 
          success: false, 
          message: `Failed to create bundle product automatically: ${errorMessage}`,
          errors: {}
        });
      }
    }

    // Create new rule in database
    await db.bundleRule.create({
      data: {
        id: ruleId,
        shop: session.shop,
        name: name.trim(),
        items: JSON.stringify(items.split(",").filter(item => item.trim())),
        bundledSku: finalBundledSku,
        status: "active",
        frequency: 0,
        savings,
        category: formData.get("category") as string || null,
        tags: formData.get("tags") as string || null,
      } as any
    });

    // Invalidate cache for this shop's bundle rules
    const rulesKey = cacheKeys.bundleRules(session.shop);
    cache.delete(rulesKey);
    
    logInfo('Bundle rule created successfully', { 
      shop: session.shop, 
      ruleName: name,
      bundledSku: finalBundledSku,
      itemCount: items.split(",").filter(item => item.trim()).length,
      autoCreated: autoCreateProduct
    });
    
    return json({ 
      success: true, 
      message: autoCreateProduct 
        ? `Bundle rule created and Shopify product auto-generated with combined price (savings: $${savings.toFixed(2)})!`
        : `Bundle rule "${name}" created successfully!`,
      reload: true
    });
  }

  if (action === "updateRule") {
    const ruleId = formData.get("ruleId") as string;
    const name = formData.get("name") as string;
    const items = formData.get("items") as string;
    const bundledSku = formData.get("bundledSku") as string;
    const savings = parseFloat(formData.get("savings") as string) || 0;

    console.log('updateRule action received:', { ruleId, name, items, bundledSku, savings, shop: session.shop });

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

    // Check if rule exists first
    const existingRule = await db.bundleRule.findFirst({
      where: {
        id: ruleId,
        shop: session.shop
      }
    });

    if (!existingRule) {
      logError(new Error(`Bundle rule not found for update: ruleId=${ruleId}, shop=${session.shop}`), { ruleId, shop: session.shop });
      return json({ 
        success: false, 
        message: "Bundle rule not found. It may have been deleted or you may not have permission to edit it.",
        errors: {}
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
        category: formData.get("category") as string || null,
        tags: formData.get("tags") as string || null,
      } as any
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
    const ruleIds = formData.get("ruleIds") as string; // For bulk operations

    let ruleIdsArray: string[] = [];

    if (ruleIds) {
      // Bulk operation
      ruleIdsArray = ruleIds.split(",");
    } else if (ruleId) {
      // Single operation
      ruleIdsArray = [ruleId];
    }

    if (ruleIdsArray.length === 0) {
      return json({ success: false, message: "No rule IDs provided" });
    }

    // Process all rules
    const updatedRules = [];
    for (const id of ruleIdsArray) {
      const rule = await db.bundleRule.findFirst({
        where: {
          id,
          shop: session.shop
        }
      });

      if (rule) {
        const newStatus = rule.status === "active" ? "draft" : "active";
        await db.bundleRule.update({
          where: { id },
          data: { status: newStatus }
        });
        updatedRules.push({ id, newStatus });
      }
    }

    // Invalidate cache for this shop's bundle rules
    const rulesKey = cacheKeys.bundleRules(session.shop);
    cache.delete(rulesKey);

    return json({
      success: true,
      message: `Updated ${updatedRules.length} rule(s)`,
      updatedRules
    });
  }

  if (action === "deleteRule") {
    const ruleId = formData.get("ruleId") as string;
    const ruleIds = formData.get("ruleIds") as string; // For bulk operations

    let ruleIdsArray: string[] = [];

    if (ruleIds) {
      // Bulk operation
      ruleIdsArray = ruleIds.split(",");
    } else if (ruleId) {
      // Single operation
      ruleIdsArray = [ruleId];
    }

    if (ruleIdsArray.length === 0) {
      return json({ success: false, message: "No rule IDs provided" });
    }

    // First, get the rules to be deleted to check for auto-created products
    const rulesToDelete = await db.bundleRule.findMany({
      where: {
        id: { in: ruleIdsArray },
        shop: session.shop
      }
    });

    // Delete associated Shopify products for auto-created rules
    const { admin } = await authenticate.admin(request);
    let deletedProductsCount = 0;

    for (const rule of rulesToDelete) {
      try {
        // Find products with the rule tag (auto-generated products)
        // Use Shopify's correct GraphQL query syntax for tag filtering
        const productsQuery = `
          query GetProductsByTag($query: String!) {
            products(first: 50, query: $query) {
              edges {
                node {
                  id
                  title
                  tags
                  status
                }
              }
            }
          }
        `;

        const productsResponse = await admin.graphql(productsQuery, {
          variables: {
            query: `tag:"rule-${rule.id}"`
          }
        });

        const productsData = await productsResponse.json();
        console.log('Products query response for rule', rule.id, ':', JSON.stringify(productsData, null, 2));

        const products = productsData.data?.products?.edges || [];

        console.log(`Found ${products.length} products with tag "rule-${rule.id}" for rule ${rule.id}`);

        // Delete each auto-created product
        for (const productEdge of products) {
          const product = productEdge.node;
          console.log('Checking product:', product.title, 'Tags:', product.tags);

          // Verify it's an auto-generated bundle product
          if (product.tags.includes("auto-generated") && product.tags.includes("bundle") && product.tags.includes(`rule-${rule.id}`)) {
            console.log('Deleting auto-created bundle product:', product.title, 'ID:', product.id);

            const deleteMutation = `
              mutation DeleteProduct($input: ProductDeleteInput!) {
                productDelete(input: $input) {
                  deletedProductId
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;

            const deleteResponse = await admin.graphql(deleteMutation, {
              variables: {
                input: {
                  id: product.id
                }
              }
            });

            const deleteData = await deleteResponse.json();
            console.log('Delete response:', JSON.stringify(deleteData, null, 2));

            if (deleteData.data?.productDelete?.deletedProductId) {
              deletedProductsCount++;
              logInfo('Auto-created bundle product deleted', { 
                shop: session.shop, 
                ruleId: rule.id,
                productId: product.id,
                productTitle: product.title
              });
            } else if (deleteData.data?.productDelete?.userErrors?.length > 0) {
              const error = deleteData.data.productDelete.userErrors[0];
              logError(new Error(`Failed to delete Shopify product: ${error.message}`), { 
                shop: session.shop, 
                ruleId: rule.id,
                productId: product.id,
                error: error.message
              });
            } else {
              console.error('Unexpected delete response structure:', deleteData);
            }
          } else {
            console.log('Skipping product - not an auto-generated bundle product:', product.tags);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Error deleting products for rule', rule.id, ':', errorMessage);
        logError(error instanceof Error ? error : new Error(errorMessage), { 
          context: 'delete_auto_created_products', 
          shop: session.shop,
          ruleId: rule.id
        });
        // Continue with rule deletion even if product deletion fails
      }
    }

    // Now delete the rules from database
    const deletedCount = await db.bundleRule.deleteMany({
      where: {
        id: { in: ruleIdsArray },
        shop: session.shop
      }
    });

    // Invalidate cache for this shop's bundle rules
    const rulesKey = cacheKeys.bundleRules(session.shop);
    cache.delete(rulesKey);
    
    const message = deletedProductsCount > 0 
      ? `Deleted ${deletedCount.count} rule(s) and ${deletedProductsCount} associated Shopify product(s)`
      : `Deleted ${deletedCount.count} rule(s)`;
    
    return json({ success: true, message });
  }

  if (action === "updateCategory") {
    const ruleId = formData.get("ruleId") as string;
    const ruleIds = formData.get("ruleIds") as string; // For bulk operations
    const category = formData.get("category") as string;

    let ruleIdsArray: string[] = [];

    if (ruleIds) {
      // Bulk operation
      ruleIdsArray = ruleIds.split(",");
    } else if (ruleId) {
      // Single operation
      ruleIdsArray = [ruleId];
    }

    if (ruleIdsArray.length === 0) {
      return json({ success: false, message: "No rule IDs provided" });
    }

    // Process all rules
    const updatedCount = await db.bundleRule.updateMany({
      where: {
        id: { in: ruleIdsArray },
        shop: session.shop
      },
      data: {
        category: category || null,
      } as any
    });

    // Invalidate cache for this shop's bundle rules
    const rulesKey = cacheKeys.bundleRules(session.shop);
    cache.delete(rulesKey);
    
    return json({ success: true, message: `Category updated for ${updatedCount.count} rule(s)` });
  }

  if (action === "addTag") {
    const ruleId = formData.get("ruleId") as string;
    const ruleIds = formData.get("ruleIds") as string; // For bulk operations
    const tag = formData.get("tag") as string;

    let ruleIdsArray: string[] = [];

    if (ruleIds) {
      // Bulk operation
      ruleIdsArray = ruleIds.split(",");
    } else if (ruleId) {
      // Single operation
      ruleIdsArray = [ruleId];
    }

    if (ruleIdsArray.length === 0) {
      return json({ success: false, message: "No rule IDs provided" });
    }

    // Process all rules
    let updatedCount = 0;
    for (const id of ruleIdsArray) {
      const rule = await db.bundleRule.findFirst({
        where: {
          id,
          shop: session.shop
        }
      }) as any;

      if (rule) {
        const currentTags = JSON.parse(rule.tags || '[]');
        if (!currentTags.includes(tag)) {
          currentTags.push(tag);
          await db.bundleRule.update({
            where: {
              id,
              shop: session.shop
            },
            data: {
              tags: JSON.stringify(currentTags),
            }
          } as any);
          updatedCount++;
        }
      }
    }

    // Invalidate cache for this shop's bundle rules
    const rulesKey = cacheKeys.bundleRules(session.shop);
    cache.delete(rulesKey);
    
    return json({ success: true, message: `Tag added to ${updatedCount} rule(s)` });
  }

  if (action === "analyzeOrders") {
    console.log('analyzeOrders action called');
    try {
      const { admin } = await authenticate.admin(request);
      
      // Import the order analysis service
      const { OrderAnalysisService } = await import("../order-analysis.server");
      
      const analysisService = new OrderAnalysisService(admin, session.shop);
      
      // Run the analysis
      await analysisService.analyzeOrderHistory(90); // Analyze last 90 days
      const suggestions = await analysisService.generateBundleSuggestions();
      
      logInfo('Order analysis completed', { 
        shop: session.shop, 
        suggestionsCount: suggestions.length 
      });
      
      return json({ 
        success: true, 
        message: `Analysis complete! Found ${suggestions.length} bundle suggestions.`,
        suggestions
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError(error instanceof Error ? error : new Error(errorMessage), { 
        context: 'analyze_orders', 
        shop: session.shop 
      });
      return json({ 
        success: false, 
        message: `Analysis failed: ${errorMessage}`,
        suggestions: []
      });
    }
  }
};


export default function BundleRules() {
  const { bundleRules, products, categories, tags, pagination, sorting, filters } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{
    success: boolean;
    message: string;
    reload?: boolean;
    updatedRules?: Array<{ id: string; newStatus: string }>;
    errors?: {
      name?: boolean;
      bundledSku?: boolean;
      items?: boolean;
    };
    suggestions?: any[];
  }>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  
  console.log('BundleRules component loaded with products:', products.length);
  console.log('First few products:', products.slice(0, 3));
  
  console.log('BundleRules component loaded with products:', products.length);
  console.log('First few products:', products.slice(0, 3));
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '',
    items: [] as string[],
    bundledSku: '',
    savings: '',
    autoCreateProduct: true, // Default to true for simplified experience
    category: '',
    tags: [] as string[],
  });
  const [showCustomCategoryInput, setShowCustomCategoryInput] = useState(false);
  const [customCategoryValue, setCustomCategoryValue] = useState('');
  const [selectedTotalPrice, setSelectedTotalPrice] = useState(0);
  const [tagInput, setTagInput] = useState('');

  // Modal-specific search state
  const [modalSearchQuery, setModalSearchQuery] = useState('');

  // Products modal state
  const [showProductsModal, setShowProductsModal] = useState(false);

  // Filter products for modal
  const modalFilteredProducts = useMemo(() => {
    console.log('Modal filtering products:', products.length, 'modalSearchQuery:', modalSearchQuery);
    if (!modalSearchQuery.trim()) {
      console.log('No modal search query, returning all products');
      return products;
    }
    
    const query = modalSearchQuery.toLowerCase().trim();
    const filtered = products.filter(product => 
      product.label.toLowerCase().includes(query) ||
      product.productTitle?.toLowerCase().includes(query) ||
      product.variantTitle?.toLowerCase().includes(query) ||
      product.sku?.toLowerCase().includes(query) ||
      product.price?.toString().includes(query)
    );
    console.log('Modal filtered products:', filtered.length, 'from', products.length);
    return filtered;
  }, [products, modalSearchQuery]);

  // Bundle suggestions state
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<any>(null);
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);

  // Filter state
  const [searchValue, setSearchValue] = useState(filters.search);
  const [statusFilter, setStatusFilter] = useState(filters.status);
  const [categoryFilter, setCategoryFilter] = useState(filters.category);
  const [tagFilter, setTagFilter] = useState(filters.tag);
  const [appliedFilters, setAppliedFilters] = useState<any[]>([]);

  // Sync local state with filters prop when it changes
  useEffect(() => {
    setSearchValue(filters.search);
  }, [filters.search]);

  useEffect(() => {
    setStatusFilter(filters.status);
  }, [filters.status]);

  useEffect(() => {
    setCategoryFilter(filters.category);
  }, [filters.category]);

  useEffect(() => {
    setTagFilter(filters.tag);
  }, [filters.tag]);

  // IndexTable resource management
  const resourceName = {
    singular: 'bundle rule',
    plural: 'bundle rules',
  };

  const { selectedResources, handleSelectionChange } = useIndexResourceState(bundleRules);

  const isLoading = fetcher.state === "submitting";

  // Bulk actions
  const bulkActions = [
    {
      content: 'Activate selected',
      onAction: () => {
        fetcher.submit({
          action: "toggleStatus",
          ruleIds: selectedResources.join(",")
        }, { method: "POST" });
      },
    },
    {
      content: 'Pause selected',
      onAction: () => {
        fetcher.submit({
          action: "toggleStatus",
          ruleIds: selectedResources.join(",")
        }, { method: "POST" });
      },
    },
    {
      content: 'Add category',
      onAction: () => {
        const category = prompt('Enter category name:');
        if (category) {
          fetcher.submit({
            action: "updateCategory",
            ruleIds: selectedResources.join(","),
            category
          }, { method: "POST" });
          shopify.toast.show(`Added category "${category}" to ${selectedResources.length} rule(s)`);
        }
      },
    },
    {
      content: 'Add tag',
      onAction: () => {
        const tag = prompt('Enter tag:');
        if (tag) {
          fetcher.submit({
            action: "addTag",
            ruleIds: selectedResources.join(","),
            tag
          }, { method: "POST" });
          shopify.toast.show(`Added tag "${tag}" to ${selectedResources.length} rule(s)`);
        }
      },
    },
    {
      content: 'Delete selected',
      onAction: () => {
        if (confirm(`Are you sure you want to delete ${selectedResources.length} rule(s)? This action cannot be undone.`)) {
          fetcher.submit({
            action: "deleteRule",
            ruleIds: selectedResources.join(",")
          }, { method: "POST" });
          shopify.toast.show(`Deleted ${selectedResources.length} rule(s)`);
        }
      },
    },
  ];

  // Handle sorting
  const handleSort = useCallback((headingIndex: number, direction: 'ascending' | 'descending') => {
    const sortFields = ['name', 'bundledSku', 'status', 'frequency', 'savings', 'createdAt'];
    const sortBy = sortFields[headingIndex];
    const sortDirection = direction === 'ascending' ? 'asc' : 'desc';
    
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('sortBy', sortBy);
    newUrl.searchParams.set('sortDirection', sortDirection);
    newUrl.searchParams.set('page', '1'); // Reset to first page when sorting
    navigate(window.location.pathname + newUrl.search, { replace: true, preventScrollReset: true });
  }, [navigate]);

  // Handle filters
  const handleFiltersQueryChange = useCallback((value: string) => {
    setSearchValue(value);
    const newUrl = new URL(window.location.href);
    if (value) {
      newUrl.searchParams.set('search', value);
    } else {
      newUrl.searchParams.delete('search');
    }
    newUrl.searchParams.set('page', '1');
    navigate(window.location.pathname + newUrl.search, { replace: true, preventScrollReset: true });
  }, [navigate]);

  const handleStatusFilterChange = useCallback((value: string) => {
    setStatusFilter(value);
    const newUrl = new URL(window.location.href);
    if (value) {
      newUrl.searchParams.set('status', value);
    } else {
      newUrl.searchParams.delete('status');
    }
    newUrl.searchParams.set('page', '1');
    navigate(window.location.pathname + newUrl.search, { replace: true, preventScrollReset: true });
    // Close the filter popup by dispatching Escape key event
    setTimeout(() => {
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(escapeEvent);
    }, 150);
  }, [navigate]);

  const handleCategoryFilterChange = useCallback((value: string) => {
    setCategoryFilter(value);
    const newUrl = new URL(window.location.href);
    if (value) {
      newUrl.searchParams.set('category', value);
    } else {
      newUrl.searchParams.delete('category');
    }
    newUrl.searchParams.set('page', '1');
    navigate(window.location.pathname + newUrl.search, { replace: true, preventScrollReset: true });
    // Close the filter popup by dispatching Escape key event
    setTimeout(() => {
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(escapeEvent);
    }, 150);
  }, [navigate]);

  const handleTagFilterChange = useCallback((value: string) => {
    setTagFilter(value);
    const newUrl = new URL(window.location.href);
    if (value) {
      newUrl.searchParams.set('tag', value);
    } else {
      newUrl.searchParams.delete('tag');
    }
    newUrl.searchParams.set('page', '1');
    navigate(window.location.pathname + newUrl.search, { replace: true, preventScrollReset: true });
    // Close the filter popup by dispatching Escape key event
    setTimeout(() => {
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(escapeEvent);
    }, 150);
  }, [navigate]);

  const handleFiltersClearAll = useCallback(() => {
    setSearchValue('');
    setStatusFilter('');
    setCategoryFilter('');
    setTagFilter('');
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete('search');
    newUrl.searchParams.delete('status');
    newUrl.searchParams.delete('category');
    newUrl.searchParams.delete('tag');
    newUrl.searchParams.set('page', '1');
    navigate(window.location.pathname + newUrl.search, { replace: true, preventScrollReset: true });
  }, [navigate]);

  // Filters are applied via the toolbar Apply button; useQuery/Apply handled inline where needed

  // Update applied filters
  useEffect(() => {
    const filterTags: any[] = [];
    if (filters.search) {
      filterTags.push({
        key: 'search',
        label: `Search: ${filters.search}`,
        onRemove: () => {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('search');
          navigate(window.location.pathname + newUrl.search, { replace: true, preventScrollReset: true });
        },
      });
    }
    if (filters.status) {
      const statusLabel = filters.status === 'active' ? 'Active' : filters.status === 'draft' ? 'Paused' : filters.status;
      filterTags.push({
        key: 'status',
        label: `Status: ${statusLabel}`,
        onRemove: () => {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('status');
          navigate(window.location.pathname + newUrl.search, { replace: true, preventScrollReset: true });
        },
      });
    }
    if (filters.category) {
      filterTags.push({
        key: 'category',
        label: `Category: ${filters.category}`,
        onRemove: () => {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('category');
          navigate(window.location.pathname + newUrl.search, { replace: true, preventScrollReset: true });
        },
      });
    }
    if (filters.tag) {
      filterTags.push({
        key: 'tag',
        label: `Tag: ${filters.tag}`,
        onRemove: () => {
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('tag');
          navigate(window.location.pathname + newUrl.search, { replace: true, preventScrollReset: true });
        },
      });
    }
    setAppliedFilters(filterTags);
  }, [filters, navigate]);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message);
      if (fetcher.data.reload) {
        // Close modal and reset form
        setIsModalOpen(false);
        setFormData({ name: "", items: [], bundledSku: "", savings: "", autoCreateProduct: true, category: "", tags: [] });
        // Navigate to the same page to refresh data
        navigate(window.location.pathname + window.location.search, { replace: true, preventScrollReset: true });
      } else if (fetcher.data.updatedRules) {
        // Bulk operation completed, refresh the page
        navigate(window.location.pathname + window.location.search, { replace: true, preventScrollReset: true });
      } else if (fetcher.data.suggestions) {
        // Update suggestions state when analysis completes
        setSuggestions(fetcher.data.suggestions);
      }
    } else if (fetcher.data?.success === false && fetcher.data.message) {
      // Show error message
      shopify.toast.show(fetcher.data.message, { isError: true });
    }
  }, [fetcher.data, shopify, navigate]);

  const generateProfessionalRuleName = useCallback((productNames: string[], itemsArray: string[]) => {
    // Extract meaningful keywords from product names
    const keywords = productNames.flatMap(name => {
      // Remove common words and split by spaces/hyphens
      const cleanName = name.toLowerCase()
        .replace(/[^\w\s-]/g, '') // Remove special chars except spaces and hyphens
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();
      
      // Split by spaces and hyphens, filter out common words
      const words = cleanName.split(/[\s-]+/).filter(word => 
        word.length > 2 && !['the', 'and', 'for', 'with', 'set', 'kit', 'pack', 'bundle', 'combo'].includes(word)
      );
      
      return words.slice(0, 3); // Take up to 3 meaningful words per product
    });

    // Remove duplicates and take first 4 unique keywords
    const uniqueKeywords = [...new Set(keywords)].slice(0, 4);
    
    // Create professional name based on keyword patterns
    if (uniqueKeywords.length >= 2) {
      // Check for common product categories
      const categoryPatterns = {
        office: ['office', 'desk', 'chair', 'computer', 'laptop', 'monitor', 'keyboard', 'mouse'],
        electronics: ['phone', 'charger', 'cable', 'headphone', 'speaker', 'tablet', 'camera'],
        kitchen: ['kitchen', 'cook', 'bake', 'pan', 'pot', 'utensil', 'appliance'],
        home: ['home', 'decor', 'lamp', 'pillow', 'blanket', 'storage', 'organizer'],
        fitness: ['fitness', 'exercise', 'workout', 'yoga', 'dumbbell', 'resistance', 'mat'],
        gaming: ['gaming', 'game', 'controller', 'headset', 'mouse', 'keyboard'],
        outdoor: ['outdoor', 'camping', 'hiking', 'tent', 'backpack', 'water', 'bottle']
      };

      // Find matching category
      let matchedCategory = '';
      for (const [category, patterns] of Object.entries(categoryPatterns)) {
        if (patterns.some(pattern => uniqueKeywords.some(keyword => keyword.includes(pattern)))) {
          matchedCategory = category;
          break;
        }
      }

      if (matchedCategory) {
        return `${matchedCategory.charAt(0).toUpperCase() + matchedCategory.slice(1)} Essentials Bundle`;
      }

      // Fallback: Create name from first two keywords
      const firstTwo = uniqueKeywords.slice(0, 2);
      return `${firstTwo.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' & ')} Bundle`;
    }

    // Final fallback
    return `Custom Bundle (${itemsArray.length} Items)`;
  }, []);

  const handleOpenModal = useCallback((rule?: any) => {
    if (rule) {
      // Edit mode
      setEditingRule(rule);
      setFormData({
        name: rule.name,
        items: JSON.parse(rule.items || '[]').filter((item: string) => item.trim()),
        bundledSku: rule.bundledSku,
        savings: rule.savings ? parseFloat(rule.savings).toFixed(2) : '',
        autoCreateProduct: false, // For existing rules, assume they use manual SKUs
        category: rule.category || '',
        tags: JSON.parse(rule.tags || '[]'),
      });
    } else {
      // Create mode
      setEditingRule(null);
        setFormData({ name: "", items: [], bundledSku: "", savings: "", autoCreateProduct: true, category: "", tags: [] });
    }
    setShowCustomCategoryInput(false);
    setCustomCategoryValue('');
    setModalSearchQuery(''); // Reset modal search when opening
    setIsModalOpen(true);
  }, []);
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingRule(null);
    setFormData({ name: "", items: [], bundledSku: "", savings: "", autoCreateProduct: true, category: "", tags: [] });
    setShowCustomCategoryInput(false);
    setCustomCategoryValue('');
  }, []);

  const handleSubmit = useCallback(() => {
    const isUpdate = editingRule && editingRule.id;
    fetcher.submit(
      { 
        action: isUpdate ? "updateRule" : "createRule",
        ruleId: editingRule?.id,
        name: formData.name,
        items: formData.items.join(","),
        bundledSku: formData.bundledSku,
        savings: formData.savings,
        category: formData.category,
        tags: JSON.stringify(formData.tags),
        autoCreateProduct: formData.autoCreateProduct.toString(),
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
        {/* Compact Hero Section */}
        <div
          style={{
            background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
            padding: '24px 32px',
            borderRadius: '16px',
            color: 'white',
            boxShadow: '0 10px 15px -3px rgba(139, 92, 246, 0.3)',
          }}
        >
          <BlockStack gap="300">
            <div style={{ textAlign: 'center' }}>
              <Text as="h1" variant="headingXl" fontWeight="bold">
                <span style={{ color: 'white' }}>📦 Bundle Rules Management</span>
              </Text>
            </div>
            <div style={{ textAlign: 'center', maxWidth: '700px', margin: '0 auto' }}>
              <Text as="p" variant="bodyMd">
                <span style={{ color: 'rgba(255, 255, 255, 0.95)', fontSize: '16px', lineHeight: '1.5' }}>
                  Automatically convert customer orders into optimized bundles for <strong>40% fulfillment savings</strong>
                </span>
              </Text>
            </div>

            {/* Compact Feature Highlights */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginTop: '20px',
              marginBottom: '20px'
            }}>
              {/* Manual Bundle Creation */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(8px)',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onClick={() => {
                const element = document.getElementById('bundle-rules-section');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚙️</div>
                <div style={{ color: 'white', marginBottom: '4px' }}>
                  <Text as="h4" variant="headingSm" fontWeight="bold">
                    Manual Creation
                  </Text>
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                  <Text as="p" variant="bodySm">
                    Custom bundle rules with precise control
                  </Text>
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '12px', marginTop: '4px' }}>
                  <Text as="span" variant="bodySm" fontWeight="medium">
                    Click here →
                  </Text>
                </div>
              </div>

              {/* Data-Driven Analysis */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(8px)',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onClick={() => {
                const element = document.getElementById('data-suggestions-section');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🤖</div>
                <div style={{ color: 'white', marginBottom: '4px' }}>
                  <Text as="h4" variant="headingSm" fontWeight="bold">
                    Statistical Analysis
                  </Text>
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                  <Text as="p" variant="bodySm">
                    Auto-discover profitable opportunities
                  </Text>
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '12px', marginTop: '4px' }}>
                  <Text as="span" variant="bodySm" fontWeight="medium">
                    Click here →
                  </Text>
                </div>
              </div>

              {/* Best Practices Guide */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(8px)',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
              onClick={() => {
                const element = document.getElementById('best-practices-section');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>💡</div>
                <div style={{ color: 'white', marginBottom: '4px' }}>
                  <Text as="h4" variant="headingSm" fontWeight="bold">
                    Best Practices
                  </Text>
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                  <Text as="p" variant="bodySm">
                    Industry-standard strategies & tips
                  </Text>
                </div>
                <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '12px', marginTop: '4px' }}>
                  <Text as="span" variant="bodySm" fontWeight="medium">
                    Click here →
                  </Text>
                </div>
              </div>
            </div>

            {/* Compact Stats */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '32px',
              flexWrap: 'wrap',
              marginTop: '16px'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', marginBottom: '2px' }}>
                  {pagination.total}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>
                  Active Rules
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fbbf24', marginBottom: '2px' }}>
                  {bundleRules.reduce((sum: number, rule: any) => sum + (rule.frequency || 0), 0)}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>
                  Monthly Conversions
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#34d399', marginBottom: '2px' }}>
                  ${bundleRules.reduce((sum: number, rule: any) => sum + (rule.savings || 0) * (rule.frequency || 0), 0).toLocaleString()}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)' }}>
                  Total Savings/Month
                </div>
              </div>
            </div>
          </BlockStack>
        </div>

        {/* Main Content - Full Width */}
        <div id="bundle-rules-section">
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

                {/* Filters */}
                <Filters
                  queryValue={searchValue}
                  filters={[
                    {
                      key: 'status',
                      label: 'Status',
                      filter: (
                        <ChoiceList
                          title="Status"
                          titleHidden
                          choices={[
                            { label: 'Active', value: 'active' },
                            { label: 'Paused', value: 'draft' },
                          ]}
                          selected={statusFilter ? [statusFilter] : []}
                          onChange={(selected) => handleStatusFilterChange(selected[0] || '')}
                        />
                      ),
                      shortcut: true,
                    },
                    {
                      key: 'category',
                      label: 'Category',
                      filter: (
                        <ChoiceList
                          title="Category"
                          titleHidden
                          choices={(categories as string[]).map((cat: string) => ({ label: cat, value: cat }))}
                          selected={categoryFilter ? [categoryFilter] : []}
                          onChange={(selected) => handleCategoryFilterChange(selected[0] || '')}
                        />
                      ),
                    },
                    {
                      key: 'tag',
                      label: 'Tags',
                      filter: (
                        <ChoiceList
                          title="Tags"
                          titleHidden
                          choices={tags.map((tag: string) => ({ label: tag, value: tag }))}
                          selected={tagFilter ? [tagFilter] : []}
                          onChange={(selected) => handleTagFilterChange(selected[0] || '')}
                        />
                      ),
                    },
                  ]}
                  appliedFilters={appliedFilters}
                  onQueryChange={handleFiltersQueryChange}
                  onQueryClear={() => setSearchValue('')}
                  onClearAll={handleFiltersClearAll}
                  queryPlaceholder="Search bundle rules..."
                />

                {/* Enterprise IndexTable */}
                {bundleRules.length > 0 ? (
                  <IndexTable
                    resourceName={resourceName}
                    itemCount={bundleRules.length}
                    selectedItemsCount={selectedResources.length}
                    onSelectionChange={handleSelectionChange}
                    hasMoreItems={pagination.page < pagination.totalPages}
                    loading={isLoading}
                    bulkActions={bulkActions}
                    promotedBulkActions={bulkActions.slice(0, 2)}
                    sortable={[true, false, true, true, true, true, false]}
                    sortDirection={sorting.sortDirection === 'asc' ? 'ascending' : 'descending'}
                    sortColumnIndex={['name', 'bundledSku', 'status', 'frequency', 'savings', 'createdAt'].indexOf(sorting.sortBy)}
                    onSort={handleSort}
                    pagination={{
                      hasNext: pagination.page < pagination.totalPages,
                      hasPrevious: pagination.page > 1,
                      onNext: () => {
                        const newUrl = new URL(window.location.href);
                        newUrl.searchParams.set('page', (pagination.page + 1).toString());
                        navigate(window.location.pathname + newUrl.search, { replace: true, preventScrollReset: true });
                      },
                      onPrevious: () => {
                        const newUrl = new URL(window.location.href);
                        newUrl.searchParams.set('page', (pagination.page - 1).toString());
                        navigate(window.location.pathname + newUrl.search, { replace: true, preventScrollReset: true });
                      },
                      label: `Page ${pagination.page} of ${pagination.totalPages}`,
                    }}
                    headings={[
                      { title: 'Bundle Rule' },
                      { title: 'Status' },
                      { title: 'Savings' },
                      { title: 'Performance' },
                      { title: 'Actions' },
                    ]}
                  >
                    {bundleRules.map((rule: any, index: number) => {
                      const itemsArray = JSON.parse(rule.items || '[]').filter((item: string) => item.trim());
                      
                      // Calculate performance metrics
                      const conversionRate = rule.conversionRate || 0;

                      return (
                        <IndexTable.Row
                          id={rule.id}
                          key={rule.id}
                          selected={selectedResources.includes(rule.id)}
                          position={index}
                        >
                          <IndexTable.Cell>
                            <div style={{ maxWidth: '300px', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                              <BlockStack gap="100">
                                <Text variant="bodyMd" fontWeight="semibold" as="span">
                                  {rule.name}
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="span">
                                  {itemsArray.length} items • ${(rule.savings || 0).toFixed(2)} savings
                                </Text>
                              </BlockStack>
                            </div>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <div style={{ minWidth: '120px', paddingLeft: '8px' }}>
                              <Badge 
                                tone={rule.status === "active" ? "success" : "attention"} 
                                size="small"
                              >
                                {rule.status === "active" ? "Active" : "Paused"}
                              </Badge>
                            </div>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <div style={{ minWidth: '120px' }}>
                              <Text variant="bodyMd" as="span" tone="success" fontWeight="medium">
                                ${(rule.savings || 0).toFixed(2)}
                              </Text>
                              <Text variant="bodySm" tone="subdued" as="span">
                                per bundle
                              </Text>
                            </div>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <div style={{ minWidth: '120px' }}>
                              <Text variant="bodyMd" as="span">
                                {conversionRate.toFixed(1)}%
                              </Text>
                              <Text variant="bodySm" tone="subdued" as="span">
                                conversion
                              </Text>
                            </div>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <div style={{ minWidth: '140px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Button
                                size="slim"
                                onClick={() => handleOpenModal(rule)}
                                variant="secondary"
                              >
                                Edit
                              </Button>
                              <Button
                                size="slim"
                                onClick={() => toggleRuleStatus(rule.id)}
                                variant={rule.status === "active" ? "secondary" : "primary"}
                                tone={rule.status === "active" ? undefined : "success"}
                              >
                                {rule.status === "active" ? "Pause" : "Activate"}
                              </Button>
                              <Button
                                size="slim"
                                variant="secondary"
                                tone="critical"
                                onClick={() => deleteRule(rule.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </IndexTable.Cell>
                        </IndexTable.Row>
                      );
                    })}
                  </IndexTable>
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

                {/* Pagination Summary */}
                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                  <Text variant="bodySm" tone="subdued" as="p">
                    Showing {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} rules
                  </Text>
                </div>
              </BlockStack>
            </Card>
            </div>

          {/* Bundle Suggestions Section */}
          <div id="data-suggestions-section">
          <Card>
          <BlockStack gap="500">
            <div
              style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                padding: '24px',
                borderRadius: '12px',
              }}
            >
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="heading2xl" fontWeight="bold">
                    <span style={{ color: 'white' }}>📊 Data-Driven Bundle Suggestions</span>
                  </Text>
                  <Text variant="bodyLg" as="p">
                    <span style={{ color: 'rgba(255, 255, 255, 0.95)' }}>
                      Automatically discovered profitable bundle opportunities from your order history
                    </span>
                  </Text>
                </BlockStack>
                <Button 
                  onClick={() => {
                    fetcher.submit({ action: "analyzeOrders" }, { method: "POST" });
                  }}
                  loading={isLoading}
                  variant="primary" 
                  tone="success"
                  size="large"
                >
                  🔄 Analyze Orders
                </Button>
              </InlineStack>
            </div>

            {/* Suggestions Table */}
            {suggestions && suggestions.length > 0 ? (
              <div style={{ maxHeight: '600px', overflowY: 'auto', border: '1px solid #e1e5e9', borderRadius: '8px' }}>
                <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e1e5e9' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', backgroundColor: 'white', position: 'sticky', top: '0', zIndex: '1', borderBottom: '1px solid #e1e5e9' }}>Suggested Bundle</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', backgroundColor: 'white', position: 'sticky', top: '0', zIndex: '1', borderBottom: '1px solid #e1e5e9' }}>Confidence Score</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', backgroundColor: 'white', position: 'sticky', top: '0', zIndex: '1', borderBottom: '1px solid #e1e5e9' }}>Potential Savings</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', backgroundColor: 'white', position: 'sticky', top: '0', zIndex: '1', borderBottom: '1px solid #e1e5e9' }}>Order Frequency</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', color: '#374151', backgroundColor: 'white', position: 'sticky', top: '0', zIndex: '1', borderBottom: '1px solid #e1e5e9' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestions.map((suggestion: any, index: number) => {
                        const itemsArray = JSON.parse(suggestion.items || '[]').filter((item: string) => item.trim());
                        const productNames = itemsArray.map((itemId: string) => {
                          // Try to find product by variant ID first, then by SKU
                          let product = products.find((p: any) => p.value === itemId);
                          if (!product && itemId) {
                            // If not found by variant ID, try by SKU
                            product = products.find((p: any) => p.sku === itemId);
                          }
                          return product ? product.label.split(' [')[0] : itemId;
                        });

                        return (
                          <tr key={suggestion.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '16px', verticalAlign: 'top' }}>
                              <div style={{ maxWidth: '300px', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                <BlockStack gap="100">
                                  <Text variant="bodyMd" fontWeight="semibold" as="span">
                                    {productNames.slice(0, 2).join(' + ')}
                                    {productNames.length > 2 && ` + ${productNames.length - 2} more`}
                                  </Text>
                                  <Text variant="bodySm" tone="subdued" as="span">
                                    {productNames.length} items • ${suggestion.potentialSavings?.toFixed(2) || '0.00'} potential savings
                                  </Text>
                                </BlockStack>
                              </div>
                            </td>
                            <td style={{ padding: '16px', verticalAlign: 'top' }}>
                              <div style={{ minWidth: '120px', paddingLeft: '8px' }}>
                                <Badge 
                                  tone={suggestion.confidence > 0.8 ? "success" : suggestion.confidence > 0.6 ? "warning" : "attention"}
                                  size="small"
                                >
                                  {`${(suggestion.confidence * 100).toFixed(1)}%`}
                                </Badge>
                              </div>
                            </td>
                            <td style={{ padding: '16px', verticalAlign: 'top' }}>
                              <div style={{ minWidth: '120px' }}>
                                <Text variant="bodyMd" as="span" tone="success" fontWeight="medium">
                                  ${suggestion.potentialSavings?.toFixed(2) || '0.00'}
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="span">
                                  per bundle
                                </Text>
                              </div>
                            </td>
                            <td style={{ padding: '16px', verticalAlign: 'top' }}>
                              <div style={{ minWidth: '120px' }}>
                                <Text variant="bodyMd" as="span">
                                  {suggestion.orderFrequency || 0}
                                </Text>
                                <Text variant="bodySm" tone="subdued" as="span">
                                  times/month
                                </Text>
                              </div>
                            </td>
                            <td style={{ padding: '16px', verticalAlign: 'top' }}>
                              <div style={{ minWidth: '140px', display: 'flex', alignItems: 'stretch', gap: '8px' }}>
                                <div style={{ flex: 1, whiteSpace: 'nowrap' }}>
                                  <Button
                                    size="slim"
                                    variant="primary"
                                    tone="success"
                                    fullWidth
                                    onClick={() => {
                                      // Create bundle rule from suggestion
                                      const itemsArray = JSON.parse(suggestion.items || '[]').filter((item: string) => item.trim());
                                      const ruleName = generateProfessionalRuleName(productNames, itemsArray);
                                      const bundledSku = `BUNDLE-STAT-${Date.now()}`;
                                      
                                      fetcher.submit({
                                        action: "createRule",
                                        name: ruleName,
                                        items: itemsArray.join(","),
                                        bundledSku: bundledSku,
                                        savings: (suggestion.potentialSavings || 0).toFixed(2),
                                        autoCreateProduct: "true",
                                        category: "Data Suggested",
                                        tags: JSON.stringify(["data-generated", "high-confidence"]),
                                      }, { method: "POST" });
                                    }}
                                  >
                                    Create Rule
                                  </Button>
                                </div>
                                <div style={{ flex: 1, whiteSpace: 'nowrap' }}>
                                  <Button
                                    size="slim"
                                    variant="secondary"
                                    fullWidth
                                    onClick={() => {
                                      // View details modal
                                      setSelectedSuggestion(suggestion);
                                      setShowSuggestionModal(true);
                                    }}
                                  >
                                    Details
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '60px 40px',
                  background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                  borderRadius: '20px',
                  border: '2px solid #f59e0b',
                }}
              >
                <BlockStack gap="400">
                  <div style={{ fontSize: '60px', lineHeight: '1' }}>🔍</div>
                  <BlockStack gap="200">
                    <Text as="h3" variant="heading2xl" fontWeight="bold">
                      No Bundle Suggestions Yet
                    </Text>
                    <div style={{ maxWidth: '500px', margin: '0 auto' }}>
                      <Text as="p" variant="bodyLg" tone="subdued">
                        Click "Analyze Orders" to discover profitable bundle opportunities from your order history using statistical data mining algorithms
                      </Text>
                    </div>
                  </BlockStack>
                  <div style={{ marginTop: '16px' }}>
                    <Button 
                      variant="primary" 
                      size="large" 
                      tone="success" 
                      onClick={() => {
                        fetcher.submit({ action: "analyzeOrders" }, { method: "POST" });
                      }}
                      loading={isLoading}
                    >
                      🚀 Start Analysis
                    </Button>
                  </div>
                </BlockStack>
              </div>
            )}
          </BlockStack>
        </Card>
        </div>

        {/* Performance Metrics Section */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(1, 1fr)', 
          gap: '24px',
          marginTop: '24px'
        }}>
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

        {/* Enterprise-Grade Bundle Rule Best Practices Section */}
        <div id="best-practices-section">
        <Card>
          <BlockStack gap="600">
            <div
              style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
                padding: '32px',
                borderRadius: '16px',
                boxShadow: '0 10px 25px -5px rgba(30, 41, 59, 0.3)',
              }}
            >
              <BlockStack gap="300">
                <div style={{ textAlign: 'center' }}>
                  <Text as="h2" variant="heading2xl" fontWeight="bold">
                    <span style={{ color: 'white', fontSize: '28px' }}>💡 Bundle Rule Best Practices</span>
                  </Text>
                  <div style={{ 
                    width: '80px', 
                    height: '4px', 
                    background: 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)',
                    margin: '16px auto',
                    borderRadius: '2px'
                  }}></div>
                </div>
                <div style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.9)', fontSize: '16px', lineHeight: '1.6' }}>
                  <Text variant="bodyLg" as="p">
                    Industry-standard strategies for maximizing bundle efficiency and operational excellence
                  </Text>
                </div>
              </BlockStack>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', 
              gap: '24px',
              marginTop: '24px'
            }}>
              {/* High-Frequency Combinations */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  borderRadius: '16px',
                  padding: '32px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
                  border: '1px solid #e2e8f0',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)';
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '0',
                  left: '0',
                  width: '4px',
                  height: '100%',
                  background: 'linear-gradient(180deg, #3b82f6 0%, #06b6d4 100%)'
                }}></div>
                <BlockStack gap="400">
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '16px',
                    paddingBottom: '16px',
                    borderBottom: '2px solid #e2e8f0'
                  }}>
                    <div style={{ 
                      fontSize: '48px', 
                      lineHeight: '1',
                      filter: 'drop-shadow(0 2px 8px rgba(59, 130, 246, 0.3))'
                    }}>📊</div>
                    <div>
                    <div style={{ color: '#1e293b', marginBottom: '4px' }}>
                      <Text as="h3" variant="headingLg" fontWeight="bold">
                        High-Frequency Combinations
                      </Text>
                    </div>
                      <div style={{ 
                        width: '60px', 
                        height: '3px', 
                        background: 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)',
                        borderRadius: '2px'
                      }}></div>
                    </div>
                  </div>
                  <div style={{ color: '#475569', fontSize: '16px', lineHeight: '1.7', fontWeight: '500' }}>
                    <Text as="p" variant="bodyMd">
                      Focus on item combinations that appear in <strong style={{ color: '#1e293b', fontWeight: '700' }}>5+ orders per month</strong> for maximum impact and operational efficiency.
                    </Text>
                  </div>
                  <div style={{
                    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: '1px solid #bfdbfe',
                    marginTop: '16px'
                  }}>
                    <div style={{ color: '#1e40af', fontWeight: '600' }}>
                      <Text variant="bodySm" as="span">
                        💡 Pro Tip: Prioritize combinations with consistent monthly volume to ensure sustainable fulfillment operations.
                      </Text>
                    </div>
                  </div>
                </BlockStack>
              </div>

              {/* SKU Naming Convention */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  borderRadius: '16px',
                  padding: '32px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
                  border: '1px solid #e2e8f0',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)';
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '0',
                  left: '0',
                  width: '4px',
                  height: '100%',
                  background: 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)'
                }}></div>
                <BlockStack gap="400">
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '16px',
                    paddingBottom: '16px',
                    borderBottom: '2px solid #e2e8f0'
                  }}>
                    <div style={{ 
                      fontSize: '48px', 
                      lineHeight: '1',
                      filter: 'drop-shadow(0 2px 8px rgba(245, 158, 11, 0.3))'
                    }}>🏷️</div>
                    <div>
                    <div style={{ color: '#1e293b', marginBottom: '4px' }}>
                      <Text as="h3" variant="headingLg" fontWeight="bold">
                        SKU Naming Convention
                      </Text>
                    </div>
                      <div style={{ 
                        width: '60px', 
                        height: '3px', 
                        background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
                        borderRadius: '2px'
                      }}></div>
                    </div>
                  </div>
                  <div style={{ color: '#475569', fontSize: '16px', lineHeight: '1.7', fontWeight: '500' }}>
                    <Text as="p" variant="bodyMd">
                      Use <strong style={{ color: '#1e293b', fontWeight: '700' }}>clear, descriptive names</strong> for bundled SKUs to help your fulfillment team identify items quickly and reduce processing errors.
                    </Text>
                  </div>
                  <div style={{
                    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: '1px solid #fcd34d',
                    marginTop: '16px'
                  }}>
                    <div style={{ color: '#92400e', fontWeight: '600' }}>
                      <Text variant="bodySm" as="span">
                        📋 Example: "OFFICE-ESSENTIALS-BUNDLE" instead of "BUNDLE-123"
                      </Text>
                    </div>
                  </div>
                </BlockStack>
              </div>

              {/* Cost Analysis */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  borderRadius: '16px',
                  padding: '32px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
                  border: '1px solid #e2e8f0',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)';
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '0',
                  left: '0',
                  width: '4px',
                  height: '100%',
                  background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)'
                }}></div>
                <BlockStack gap="400">
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '16px',
                    paddingBottom: '16px',
                    borderBottom: '2px solid #e2e8f0'
                  }}>
                    <div style={{ 
                      fontSize: '48px', 
                      lineHeight: '1',
                      filter: 'drop-shadow(0 2px 8px rgba(16, 185, 129, 0.3))'
                    }}>💰</div>
                    <div>
                    <div style={{ color: '#1e293b', marginBottom: '4px' }}>
                      <Text as="h3" variant="headingLg" fontWeight="bold">
                        Cost Analysis
                      </Text>
                    </div>
                      <div style={{ 
                        width: '60px', 
                        height: '3px', 
                        background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                        borderRadius: '2px'
                      }}></div>
                    </div>
                  </div>
                  <div style={{ color: '#475569', fontSize: '16px', lineHeight: '1.7', fontWeight: '500' }}>
                    <Text as="p" variant="bodyMd">
                      Ensure bundled SKU pricing accounts for <strong style={{ color: '#1e293b', fontWeight: '700' }}>individual item costs</strong> plus savings to maintain healthy profit margins.
                    </Text>
                  </div>
                  <div style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: '1px solid #bbf7d0',
                    marginTop: '16px'
                  }}>
                    <div style={{ color: '#166534', fontWeight: '600' }}>
                      <Text variant="bodySm" as="span">
                        💼 Business Rule: Bundle price should be ≤ (Sum of individual prices - Desired savings)
                      </Text>
                    </div>
                  </div>
                </BlockStack>
              </div>

              {/* Inventory Management */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                  borderRadius: '16px',
                  padding: '32px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
                  border: '1px solid #e2e8f0',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)';
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '0',
                  left: '0',
                  width: '4px',
                  height: '100%',
                  background: 'linear-gradient(180deg, #8b5cf6 0%, #7c3aed 100%)'
                }}></div>
                <BlockStack gap="400">
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '16px',
                    paddingBottom: '16px',
                    borderBottom: '2px solid #e2e8f0'
                  }}>
                    <div style={{ 
                      fontSize: '48px', 
                      lineHeight: '1',
                      filter: 'drop-shadow(0 2px 8px rgba(139, 92, 246, 0.3))'
                    }}>📦</div>
                    <div>
                    <div style={{ color: '#1e293b', marginBottom: '4px' }}>
                      <Text as="h3" variant="headingLg" fontWeight="bold">
                        Inventory Management
                      </Text>
                    </div>
                      <div style={{ 
                        width: '60px', 
                        height: '3px', 
                        background: 'linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%)',
                        borderRadius: '2px'
                      }}></div>
                    </div>
                  </div>
                  <div style={{ color: '#475569', fontSize: '16px', lineHeight: '1.7', fontWeight: '500' }}>
                    <Text as="p" variant="bodyMd">
                      Coordinate with suppliers to ensure bundled SKUs are <strong style={{ color: '#1e293b', fontWeight: '700' }}>available in your fulfillment center</strong> and maintain optimal stock levels.
                    </Text>
                  </div>
                  <div style={{
                    background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: '1px solid #d8b4fe',
                    marginTop: '16px'
                  }}>
                    <div style={{ color: '#6b21a8', fontWeight: '600' }}>
                      <Text variant="bodySm" as="span">
                        📈 Strategy: Implement automated reorder points based on bundle demand forecasting.
                      </Text>
                    </div>
                  </div>
                </BlockStack>
              </div>
            </div>
          </BlockStack>
        </Card>
        </div>
      </BlockStack>

      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        title={(editingRule && editingRule.id) ? "Edit Bundle Rule" : "Create New Bundle Rule"}
        primaryAction={{
          content: (editingRule && editingRule.id) ? 'Update Rule' : 'Create Rule',
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
              placeholder="e.g., Office Essentials Bundle"
              helpText="Give your bundle rule a descriptive name"
              autoComplete="off"
            />
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.autoCreateProduct}
                  onChange={(e) => setFormData({...formData, autoCreateProduct: e.target.checked})}
                />
                <Text as="span" variant="bodyMd" fontWeight="medium">
                  🤖 Auto-create bundle product in Shopify
                </Text>
              </label>
              <div style={{ marginLeft: '24px', marginTop: '4px' }}>
                <Text as="p" variant="bodySm" tone="subdued">
                  {formData.autoCreateProduct 
                    ? "We'll create a Shopify product with the combined price (savings applied automatically at checkout)" 
                    : "You'll need to manually create a Shopify product with the SKU you specify"
                  }
                </Text>
              </div>
            </div>
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">Select Products/Variants for Bundle</Text>
              <Text as="p" variant="bodySm" tone="subdued">Choose multiple products/variants from your store</Text>
              
              {/* Search Box */}
              <TextField
                label=""
                value={modalSearchQuery}
                onChange={(value) => {
                  console.log('Modal search query changed to:', value);
                  setModalSearchQuery(value);
                }}
                placeholder="Search products... (e.g., 'snowboard', 'electronics', 'under $50')"
                autoComplete="off"
                clearButton
                onClearButtonClick={() => {
                  console.log('Modal clear button clicked');
                  setModalSearchQuery("");
                }}
              />
              
              <div style={{maxHeight: '200px', overflowY: 'auto', border: '1px solid #e1e3e5', borderRadius: '6px', padding: '12px'}}>
                <BlockStack gap="100">
                  {modalFilteredProducts.length > 0 ? (
                    modalFilteredProducts.map((product) => (
                      <label key={product.value} style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'}}>
                        <input
                          type="checkbox"
                          checked={formData.items.includes(product.value)}
                          onChange={(e) => {
                            console.log('Checkbox changed:', e.target.checked, 'for product:', product.value);
                            console.log('Current formData:', formData);

                            const nextItems = e.target.checked ? [...formData.items, product.value] : formData.items.filter(item => item !== product.value);
                            console.log('Next items:', nextItems);

                            // Update total price from products list
                            const priceMap: Record<string, number> = {};
                            products.forEach((p: any) => { priceMap[p.value] = p.price || 0; });
                            const total = nextItems.reduce((sum, val) => sum + (priceMap[val] || 0), 0);
                            setSelectedTotalPrice(total);

                            // Auto-generate SKU if auto-create is enabled
                            let newBundledSku = formData.bundledSku;
                            console.log('Auto-create enabled:', formData.autoCreateProduct, 'items length:', nextItems.length);
                            if (formData.autoCreateProduct && nextItems.length > 0) {
                              const timestamp = Date.now();
                              newBundledSku = `BUNDLE-${timestamp}`;
                              console.log('Form: Generating SKU:', newBundledSku, 'from timestamp:', timestamp);
                            }

                            console.log('Setting bundledSku to:', newBundledSku);
                            setFormData(prev => ({
                              ...prev,
                              bundledSku: newBundledSku,
                              items: nextItems
                            }));
                          }}
                        />
                        <Text as="span" variant="bodySm">{product.label} — ${product.price?.toFixed ? product.price.toFixed(2) : (product.price || 0).toFixed(2)}</Text>
                      </label>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                      <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        No products found in your store.
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Make sure you have active products with variants in your Shopify store.
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Try refreshing the page to reload products.
                      </Text>
                    </div>
                  )}
                </BlockStack>
                {modalFilteredProducts.length === 0 && modalSearchQuery && (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                    No products found matching "{modalSearchQuery}"
                  </div>
                )}
              </div>
              {formData.items.length > 0 && (
                <div>
                  <Text as="p" variant="bodySm" tone="success">
                    Selected: {formData.items.length} product(s)
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Total price: <strong>${selectedTotalPrice.toFixed(2)}</strong>
                  </Text>
                  {formData.autoCreateProduct && (
                    <Text as="p" variant="bodySm" tone="success">
                      Bundle price will be: <strong>${(selectedTotalPrice - parseFloat(formData.savings || '0')).toFixed(2)}</strong> (savings applied at checkout)
                    </Text>
                  )}
                </div>
              )}
            </BlockStack>
            {!formData.autoCreateProduct && (
              <TextField
                label="Bundled SKU"
                value={formData.bundledSku}
                onChange={(value) => setFormData({...formData, bundledSku: value})}
                placeholder="e.g., BUNDLE-OFFICE-SET"
                helpText="The SKU of your existing Shopify product that contains this bundle"
                autoComplete="off"
              />
            )}
            {formData.autoCreateProduct && (
              <div style={{ padding: '12px', backgroundColor: '#f0f9ff', border: '1px solid #0ea5e9', borderRadius: '6px' }}>
                <Text as="p" variant="bodySm" fontWeight="medium">
                  📦 Auto-generated SKU: <strong>{formData.bundledSku || 'Will be generated on save'}</strong>
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  We'll create a Shopify product with this SKU automatically
                </Text>
              </div>
            )}
            <TextField
              label="Expected Savings"
              type="number"
              value={formData.savings}
              onChange={(value) => setFormData({...formData, savings: value})}
              placeholder="e.g., 10"
              helpText="Savings per bundle in dollars (e.g., 10 for $10.00 savings)"
              autoComplete="off"
              prefix="$"
            />
            <Select
              label="Category"
              value={formData.category}
              onChange={(value) => {
                if (value === '__custom__') {
                  setShowCustomCategoryInput(true);
                  setFormData({...formData, category: ''});
                } else {
                  setShowCustomCategoryInput(false);
                  setCustomCategoryValue('');
                  setFormData({...formData, category: value});
                }
              }}
              placeholder="Select a category"
              options={[
                { label: 'Select a category...', value: '' },
                ...(categories as string[]).map((cat: string) => ({ label: cat, value: cat })),
                { label: '+ Add custom category', value: '__custom__' }
              ]}
              helpText="Group related bundle rules together"
            />
            {showCustomCategoryInput && (
              <TextField
                label="Custom Category"
                value={customCategoryValue}
                onChange={(value) => {
                  setCustomCategoryValue(value);
                  setFormData({...formData, category: value});
                }}
                placeholder="Enter custom category name"
                helpText="Create a new category for this bundle rule"
                autoComplete="off"
              />
            )}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Tags
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                {formData.tags.map((tag, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Badge tone="success" size="small">
                      {tag}
                    </Badge>
                    <Button
                      size="slim"
                      variant="plain"
                      onClick={() => {
                        const newTags = formData.tags.filter((_, i) => i !== index);
                        setFormData({...formData, tags: newTags});
                      }}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
              <TextField
                label=""
                value={tagInput}
                placeholder="Add a tag (e.g., bestseller, high-margin)"
                onChange={(value) => {
                  setTagInput(value);
                  // Check for separators (comma, space, enter-like behavior)
                  if (value.includes(',') || value.includes(' ')) {
                    const newTag = value.replace(/[,\s]+$/, '').trim();
                    if (newTag && !formData.tags.includes(newTag)) {
                      setFormData({...formData, tags: [...formData.tags, newTag]});
                      setTagInput('');
                    }
                  }
                }}
                helpText="Type a tag and press comma, space, or Enter to add"
                autoComplete="off"
              />
              {tagInput && (
                <Button
                  size="slim"
                  onClick={() => {
                    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
                      setFormData({...formData, tags: [...formData.tags, tagInput.trim()]});
                      setTagInput('');
                    }
                  }}
                >
                  Add Tag
                </Button>
              )}
            </div>
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Products Modal */}
      <Modal
        open={showProductsModal}
        onClose={() => setShowProductsModal(false)}
        title="Bundled Products"
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text variant="bodyMd" as="p">
              The following products are bundled together in this rule:
            </Text>
            <div style={{ 
              backgroundColor: '#f8fafc', 
              borderRadius: '8px', 
              padding: '16px',
              border: '1px solid #e2e8f0'
            }}>
              <BlockStack gap="200">
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px',
                  padding: '8px 12px',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}>
                  <div style={{ 
                    fontSize: '18px', 
                    lineHeight: '1',
                    color: '#6b7280'
                  }}>
                    📦
                  </div>
                  <Text variant="bodyMd" as="span" fontWeight="medium">
                    No products available
                  </Text>
                </div>
              </BlockStack>
            </div>
            <Text variant="bodySm" tone="subdued" as="p">
              Total items: 0
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Suggestion Details Modal */}
      <Modal
        open={showSuggestionModal}
        onClose={() => setShowSuggestionModal(false)}
        title="Bundle Suggestion Details"
      >
        <Modal.Section>
          <BlockStack gap="300">
            {selectedSuggestion && (
              <>
                <div style={{ 
                  backgroundColor: '#f0f9ff', 
                  borderRadius: '8px', 
                  padding: '16px',
                  border: '1px solid #0ea5e9'
                }}>
                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p" fontWeight="semibold">
                      {(() => {
                        const itemsArray = JSON.parse(selectedSuggestion.items || '[]').filter((item: string) => item.trim());
                        const productNames = itemsArray.map((itemId: string) => {
                          const product = products.find((p: any) => p.value === itemId);
                          return product ? product.label.split(' [')[0] : itemId;
                        }).slice(0, 2).join(' + ');
                        const moreText = itemsArray.length > 2 ? ` + ${itemsArray.length - 2} more` : '';
                        return `Suggested Bundle: ${productNames}${moreText}`;
                      })()}
                    </Text>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <div>
                        <Text variant="bodySm" tone="subdued" as="span">Confidence: </Text>
                        <Badge tone="success">
                          {`${(selectedSuggestion.confidence * 100).toFixed(1)}%`}
                        </Badge>
                      </div>
                      <div>
                        <Text variant="bodySm" tone="subdued" as="span">Lift Score: </Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          N/A
                        </Text>
                      </div>
                      <div>
                        <Text variant="bodySm" tone="subdued" as="span">Support: </Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          N/A
                        </Text>
                      </div>
                    </div>
                  </BlockStack>
                </div>

                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p" fontWeight="semibold">
                    📊 Analysis Details
                  </Text>
                  <div style={{ 
                    backgroundColor: '#f8fafc', 
                    borderRadius: '8px', 
                    padding: '16px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <BlockStack gap="200">
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text variant="bodySm" as="span">Potential Monthly Savings:</Text>
                        <Text variant="bodySm" as="span" tone="success" fontWeight="medium">
                          ${selectedSuggestion.potentialSavings?.toFixed(2) || '0.00'}
                        </Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text variant="bodySm" as="span">Estimated Monthly Revenue:</Text>
                        <Text variant="bodySm" as="span" tone="success" fontWeight="medium">
                          ${((selectedSuggestion.potentialSavings || 0) * (selectedSuggestion.orderFrequency || 0)).toFixed(2)}
                        </Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Text variant="bodySm" as="span">Order Frequency:</Text>
                        <Text variant="bodySm" as="span" fontWeight="medium">
                          {selectedSuggestion.orderFrequency || 0} times/month
                        </Text>
                      </div>
                    </BlockStack>
                  </div>
                </BlockStack>

                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p" fontWeight="semibold">
                    🛒 Individual Products
                  </Text>
                  <div style={{ 
                    backgroundColor: '#f8fafc', 
                    borderRadius: '8px', 
                    padding: '16px',
                    border: '1px solid #e2e8f0'
                  }}>
                    <BlockStack gap="200">
                      {(() => {
                        const itemsArray = JSON.parse(selectedSuggestion.items || '[]');
                        return itemsArray.map((itemId: string, idx: number) => {
                          const product = products.find((p: any) => p.value === itemId);
                          const productName = product ? product.label.split(' [')[0] : itemId;
                          const productPrice = product ? product.price : 0;
                          
                          return (
                            <div key={idx} style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 12px',
                              backgroundColor: 'white',
                              borderRadius: '6px',
                              border: '1px solid #e2e8f0'
                            }}>
                              <Text variant="bodySm" as="span" fontWeight="medium">
                                {productName}
                              </Text>
                              <Text variant="bodySm" as="span">
                                ${productPrice?.toFixed(2) || '0.00'}
                              </Text>
                            </div>
                          );
                        });
                      })()}
                    </BlockStack>
                  </div>
                </BlockStack>
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  </Page>
  );
}
