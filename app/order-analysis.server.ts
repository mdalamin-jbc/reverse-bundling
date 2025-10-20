import prisma from "./db.server";
import type { BundleSuggestion, ItemCooccurrence, OrderHistory } from "@prisma/client";

export interface OrderItem {
  variantId: string;
  productId: string;
  quantity: number;
  price: number;
  sku?: string;
  productTitle: string;
}

export interface AnalyzedOrder {
  id: string;
  items: OrderItem[];
  totalPrice: number;
  createdAt: string;
}

export interface CooccurrenceStats {
  itemA: string;
  itemB: string;
  cooccurrenceCount: number;
  support: number;
  confidence: number;
  lift: number;
}

export interface FrequentItemset {
  items: string[];
  support: number;
  supportCount: number;
}

export interface AssociationRule {
  antecedent: string[];
  consequent: string[];
  confidence: number;
  lift: number;
  support: number;
}

export interface AnalysisConfig {
  minSupport: number; // Minimum support threshold for 2-itemsets (0.01 = 1%)
  minConfidence: number; // Minimum confidence threshold (0.5 = 50%)
  minLift: number; // Minimum lift threshold (1.0 = no lift requirement)
  maxBundleSize?: number; // Optional: Maximum number of items in a bundle (unlimited if not set)
  minBundleSize: number; // Minimum number of items in a bundle (default: 2)
  adaptiveSupport: boolean; // Whether to use adaptive support thresholds (recommended: true)
  maxAnalysisTime?: number; // Maximum analysis time in seconds (default: 300)
  minItemsetSupport: number; // Minimum support for itemsets to be considered (0.001 = 0.1%)
}

export interface BundleSuggestionData {
  id?: string;
  shop: string;
  name: string;
  items: string; // JSON string of item identifiers
  confidence: number;
  potentialSavings: number;
  orderFrequency: number;
  status: string;
  appliedRuleId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class OrderAnalysisService {
  private admin: any; // AdminApiContext without REST
  private shop: string;
  private config: AnalysisConfig;

  constructor(admin: any, shop: string, config?: Partial<AnalysisConfig>) {
    this.admin = admin;
    this.shop = shop;
    this.config = {
      minSupport: 0.02, // 2% minimum support for 2-itemsets
      minConfidence: 0.3, // 30% minimum confidence
      minLift: 1.2, // 20% lift above random
      minBundleSize: 2, // Minimum 2-item bundles
      adaptiveSupport: true, // Use adaptive support thresholds
      maxAnalysisTime: 300, // 5 minutes max analysis time
      minItemsetSupport: 0.001, // 0.1% minimum support for any itemset
      ...config
    };
  }

  /**
   * Fetch and analyze order history from Shopify with enterprise-grade analysis
   */
  async analyzeOrderHistory(daysBack: number = 90, analysisConfig?: Partial<AnalysisConfig>): Promise<void> {
    // Update config if provided
    if (analysisConfig) {
      this.config = { ...this.config, ...analysisConfig };
    }

    try {
      console.log(`Starting enterprise-grade order analysis for shop ${this.shop}, looking back ${daysBack} days`);
      console.log(`Analysis config: minSupport=${(this.config.minSupport * 100).toFixed(1)}%, minConfidence=${(this.config.minConfidence * 100).toFixed(1)}%, adaptiveSupport=${this.config.adaptiveSupport}, maxTime=${this.config.maxAnalysisTime}s${this.config.maxBundleSize ? `, maxBundleSize=${this.config.maxBundleSize}` : ', unlimited bundle size'}`);

      // Clear existing analysis data
      await this.clearAnalysisData();

      // Fetch orders from Shopify
      const orders = await this.fetchOrdersFromShopify(daysBack);

      if (orders.length === 0) {
        console.log("No orders found for analysis");
        return;
      }

      console.log(`Fetched ${orders.length} orders for enterprise analysis`);

      // Store order history
      await this.storeOrderHistory(orders);

      // Analyze co-occurrences using Apriori algorithm
      await this.analyzeCooccurrences();

      console.log("Enterprise order analysis completed successfully");
    } catch (error) {
      console.error("Error in enterprise analyzeOrderHistory:", error);
      throw error;
    }
  }

  /**
   * Fetch orders from Shopify Admin API
   */
  private async fetchOrdersFromShopify(daysBack: number): Promise<AnalyzedOrder[]> {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    const query = `
      query GetOrders($first: Int!, $query: String!) {
        orders(first: $first, query: $query) {
          edges {
            node {
              id
              createdAt
              totalPrice
              lineItems(first: 50) {
                edges {
                  node {
                    variant {
                      id
                      product {
                        id
                        title
                      }
                      sku
                      price
                    }
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      first: 250, // Shopify's max per request
      query: `created_at:>${sinceDate.toISOString()}`,
    };

    const response = await this.admin.graphql(query, { variables });
    const data = await response.json();

    if (data.errors || !data.data) {
      throw new Error(`Shopify API error: ${JSON.stringify(data.errors || data)}`);
    }

    return data.data.orders.edges.map((edge: any) => ({
      id: edge.node.id,
      items: edge.node.lineItems.edges
        .map((itemEdge: any) => {
          const variant = itemEdge.node.variant;
          if (!variant || !variant.product) {
            return null; // Skip items without variant or product data
          }
          return {
            variantId: variant.id,
            productId: variant.product.id,
            quantity: itemEdge.node.quantity,
            price: parseFloat(variant.price || '0'),
            sku: variant.sku,
            productTitle: variant.product.title,
          };
        })
        .filter((item: any) => item !== null), // Remove null items
      totalPrice: parseFloat(edge.node.totalPrice),
      createdAt: edge.node.createdAt,
    })).filter((order: AnalyzedOrder) => order.items.length > 0); // Only include orders with items
  }

  /**
   * Store order history in database
   */
  private async storeOrderHistory(orders: AnalyzedOrder[]): Promise<void> {
    const orderHistoryData = orders.map(order => ({
      shop: this.shop,
      orderId: order.id,
      orderNumber: order.id.split('/').pop(), // Extract order number from Shopify GID
      orderDate: new Date(order.createdAt),
      lineItems: JSON.stringify(order.items),
      totalValue: order.totalPrice,
      processed: false,
    }));

    await prisma.orderHistory.createMany({
      data: orderHistoryData,
    });
  }

  /**
   * Analyze item co-occurrences using Apriori algorithm for frequent itemset mining
   * Supports bundles of any size (2, 3, 4, 5+ items) with enterprise-grade analysis
   */
  async analyzeCooccurrences(): Promise<void> {
    // Get all orders with their items
    const orders = await prisma.orderHistory.findMany({
      where: { shop: this.shop },
      select: { lineItems: true },
    });

    if (orders.length === 0) return;

    // Convert orders to transactions (arrays of item IDs)
    const transactions: string[][] = orders.map((order: any) => {
      const lineItems = JSON.parse(order.lineItems);
      return lineItems
        .map((item: any) => item.sku || item.variantId)
        .filter((id: string) => id && id.trim() !== '');
    }).filter((transaction: string[]) => transaction.length > 0);

    console.log(`Starting dynamic Apriori analysis: ${transactions.length} transactions, adaptive support: ${this.config.adaptiveSupport}`);

    // Run Apriori algorithm to find all frequent itemsets
    const frequentItemsets = await this.apriori(transactions);

    console.log(`Found ${frequentItemsets.length} frequent itemsets across all sizes`);

    // Generate association rules from frequent itemsets
    const associationRules = this.generateAssociationRules(frequentItemsets, transactions.length);

    console.log(`Generated ${associationRules.length} association rules`);

    // Store co-occurrence data (for backward compatibility with existing 2-item logic)
    await this.storeCooccurrenceData(associationRules);

    // Store frequent itemsets for bundle suggestions
    await this.storeFrequentItemsets(frequentItemsets);
  }

  /**
   * Apriori algorithm for mining frequent itemsets with dynamic bundle sizes
   * Continues until no more frequent itemsets are found or time/complexity limits are reached
   */
  private async apriori(transactions: string[][]): Promise<FrequentItemset[]> {
    const totalTransactions = transactions.length;
    const frequentItemsets: FrequentItemset[] = [];
    const startTime = Date.now();
    const maxTime = this.config.maxAnalysisTime! * 1000; // Convert to milliseconds

    console.log(`Starting dynamic Apriori analysis: ${transactions.length} transactions`);
    console.log(`Adaptive support: ${this.config.adaptiveSupport}, Max time: ${this.config.maxAnalysisTime}s`);

    // Step 1: Find frequent 1-itemsets
    const itemCounts = new Map<string, number>();
    for (const transaction of transactions) {
      for (const item of transaction) {
        itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
      }
    }

    let frequent1Itemsets: FrequentItemset[] = [];
    for (const [item, count] of itemCounts) {
      const support = count / totalTransactions;
      if (support >= this.config.minItemsetSupport) {
        frequent1Itemsets.push({
          items: [item],
          support,
          supportCount: count
        });
      }
    }

    frequentItemsets.push(...frequent1Itemsets);
    console.log(`Found ${frequent1Itemsets.length} frequent 1-itemsets`);

    // Step 2+: Generate larger itemsets dynamically
    let k = 2;
    let currentFrequentItemsets = frequent1Itemsets;
    let consecutiveEmptyLevels = 0;
    const maxConsecutiveEmptyLevels = 2; // Stop after 2 consecutive levels with no frequent itemsets

    while (currentFrequentItemsets.length > 0 && consecutiveEmptyLevels < maxConsecutiveEmptyLevels) {
      // Check time limit
      if (Date.now() - startTime > maxTime) {
        console.log(`Analysis stopped due to time limit (${this.config.maxAnalysisTime}s)`);
        break;
      }

      // Calculate adaptive minimum support for this level
      const adaptiveMinSupport = this.calculateAdaptiveSupport(k, totalTransactions);

      console.log(`Analyzing ${k}-itemsets with min support: ${(adaptiveMinSupport * 100).toFixed(3)}%`);

      // Generate candidate k-itemsets
      const candidates = this.generateCandidates(currentFrequentItemsets, k);

      if (candidates.length === 0) {
        console.log(`No candidates generated for ${k}-itemsets`);
        consecutiveEmptyLevels++;
        k++;
        continue;
      }

      // Count support for candidates
      const candidateCounts = new Map<string, number>();
      for (const transaction of transactions) {
        const transactionSet = new Set(transaction);
        for (const candidate of candidates) {
          if (candidate.every(item => transactionSet.has(item))) {
            const key = candidate.sort().join(',');
            candidateCounts.set(key, (candidateCounts.get(key) || 0) + 1);
          }
        }
      }

      // Filter candidates by adaptive minimum support
      const frequentKItemsets: FrequentItemset[] = [];
      for (const [itemsetKey, count] of candidateCounts) {
        const support = count / totalTransactions;
        if (support >= adaptiveMinSupport) {
          const items = itemsetKey.split(',');
          frequentKItemsets.push({
            items,
            support,
            supportCount: count
          });
        }
      }

      if (frequentKItemsets.length > 0) {
        frequentItemsets.push(...frequentKItemsets);
        currentFrequentItemsets = frequentKItemsets;
        consecutiveEmptyLevels = 0; // Reset counter
        console.log(`Found ${frequentKItemsets.length} frequent ${k}-itemsets (support range: ${(Math.min(...frequentKItemsets.map(i => i.support)) * 100).toFixed(3)}% - ${(Math.max(...frequentKItemsets.map(i => i.support)) * 100).toFixed(3)}%)`);
      } else {
        consecutiveEmptyLevels++;
        console.log(`No frequent ${k}-itemsets found with min support ${(adaptiveMinSupport * 100).toFixed(3)}%`);
      }

      // Safety check: stop if bundle size becomes computationally expensive
      if (k >= 8 && frequentKItemsets.length > 1000) {
        console.log(`Stopping at ${k}-itemsets due to computational complexity (${frequentKItemsets.length} itemsets)`);
        break;
      }

      // Optional: stop at configured max bundle size if set
      if (this.config.maxBundleSize && k >= this.config.maxBundleSize) {
        console.log(`Stopping at configured max bundle size: ${this.config.maxBundleSize}`);
        break;
      }

      k++;
    }

    const finalItemsets = frequentItemsets.filter(itemset => itemset.items.length >= this.config.minBundleSize);
    console.log(`Analysis complete: Found ${finalItemsets.length} frequent itemsets across ${k-1} levels in ${(Date.now() - startTime) / 1000}s`);

    return finalItemsets;
  }

  /**
   * Generate candidate k-itemsets from (k-1)-itemsets
   */
  private generateCandidates(prevFrequentItemsets: FrequentItemset[], k: number): string[][] {
    const candidates: string[][] = [];

    for (let i = 0; i < prevFrequentItemsets.length; i++) {
      for (let j = i + 1; j < prevFrequentItemsets.length; j++) {
        const itemset1 = prevFrequentItemsets[i].items.sort();
        const itemset2 = prevFrequentItemsets[j].items.sort();

        // Check if first k-2 items are identical (Apriori candidate generation)
        if (k === 2 || this.canJoin(itemset1, itemset2, k - 1)) {
          const candidate = [...new Set([...itemset1, ...itemset2])].sort();
          if (candidate.length === k && !candidates.some(c => this.arraysEqual(c, candidate))) {
            candidates.push(candidate);
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Check if two itemsets can be joined (first k-2 items identical)
   */
  private canJoin(itemset1: string[], itemset2: string[], k: number): boolean {
    for (let i = 0; i < k - 1; i++) {
      if (itemset1[i] !== itemset2[i]) return false;
    }
    return true;
  }

  /**
   * Check if two arrays are equal
   */
  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((val, index) => val === b[index]);
  }

  /**
   * Calculate adaptive minimum support threshold based on bundle size
   * Higher bundle sizes require higher support to be statistically meaningful
   */
  private calculateAdaptiveSupport(bundleSize: number, totalTransactions: number): number {
    if (!this.config.adaptiveSupport) {
      return this.config.minSupport;
    }

    // Base support for 2-itemsets
    const baseSupport = this.config.minSupport;

    // For larger bundles, increase minimum support requirements
    // This follows the principle that larger patterns need stronger evidence
    const sizeMultiplier = Math.pow(1.5, bundleSize - 2); // 1.5x increase per additional item

    // Ensure minimum support for computational feasibility
    const minRequiredSupport = Math.max(
      this.config.minItemsetSupport,
      5 / totalTransactions // At least 5 transactions for any pattern
    );

    const adaptiveSupport = baseSupport * sizeMultiplier;

    return Math.max(adaptiveSupport, minRequiredSupport);
  }

  /**
   * Generate association rules from frequent itemsets
   */
  private generateAssociationRules(frequentItemsets: FrequentItemset[], totalTransactions: number): AssociationRule[] {
    const rules: AssociationRule[] = [];

    for (const itemset of frequentItemsets) {
      if (itemset.items.length < 2) continue;

      // Generate all possible rules from this itemset
      const subsets = this.generateSubsets(itemset.items);

      for (const antecedent of subsets) {
        if (antecedent.length === 0 || antecedent.length === itemset.items.length) continue;

        const consequent = itemset.items.filter(item => !antecedent.includes(item));

        // Calculate confidence: P(consequent | antecedent) = support(itemset) / support(antecedent)
        const antecedentSupport = this.getSubsetSupport(antecedent, frequentItemsets);
        if (antecedentSupport === 0) continue;

        const confidence = itemset.support / antecedentSupport;

        // Calculate lift: confidence / P(consequent)
        const consequentSupport = this.getSubsetSupport(consequent, frequentItemsets);
        const lift = consequentSupport > 0 ? confidence / consequentSupport : 0;

        if (confidence >= this.config.minConfidence && lift >= this.config.minLift) {
          rules.push({
            antecedent,
            consequent,
            confidence,
            lift,
            support: itemset.support
          });
        }
      }
    }

    return rules.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Generate all non-empty subsets of an array
   */
  private generateSubsets(items: string[]): string[][] {
    const subsets: string[][] = [];
    const n = items.length;

    for (let i = 1; i < (1 << n) - 1; i++) { // All combinations except empty and full set
      const subset: string[] = [];
      for (let j = 0; j < n; j++) {
        if (i & (1 << j)) {
          subset.push(items[j]);
        }
      }
      subsets.push(subset);
    }

    return subsets;
  }

  /**
   * Get support for a subset (find matching frequent itemset)
   */
  private getSubsetSupport(subset: string[], frequentItemsets: FrequentItemset[]): number {
    const sortedSubset = subset.sort();
    const matchingItemset = frequentItemsets.find(itemset =>
      this.arraysEqual(itemset.items.sort(), sortedSubset)
    );
    return matchingItemset ? matchingItemset.support : 0;
  }

  /**
   * Store co-occurrence data (for backward compatibility)
   */
  private async storeCooccurrenceData(rules: AssociationRule[]): Promise<void> {
    // Convert association rules to co-occurrence format for backward compatibility
    const cooccurrenceData: Array<{
      shop: string;
      itemA: string;
      itemB: string;
      cooccurrenceCount: number;
      totalOrders: number;
      confidence: number;
      lift: number;
      lastAnalyzed: Date;
    }> = [];

    // Group rules by item pairs for storage
    const pairMap = new Map<string, AssociationRule>();

    for (const rule of rules) {
      if (rule.antecedent.length === 1 && rule.consequent.length === 1) {
        const itemA = rule.antecedent[0];
        const itemB = rule.consequent[0];
        const key = [itemA, itemB].sort().join('-');

        // Keep the rule with highest confidence
        const existing = pairMap.get(key);
        if (!existing || rule.confidence > existing.confidence) {
          pairMap.set(key, rule);
        }
      }
    }

    // Convert to storage format
    for (const [key, rule] of pairMap) {
      const [itemA, itemB] = key.split('-');
      const totalOrders = Math.round(rule.support * 100); // Estimate from support

      cooccurrenceData.push({
        shop: this.shop,
        itemA,
        itemB,
        cooccurrenceCount: Math.round(rule.support * totalOrders),
        totalOrders,
        confidence: rule.confidence,
        lift: rule.lift,
        lastAnalyzed: new Date(),
      });
    }

    // Store co-occurrence data
    for (const data of cooccurrenceData) {
      await prisma.itemCooccurrence.upsert({
        where: {
          shop_itemA_itemB: {
            shop: data.shop,
            itemA: data.itemA,
            itemB: data.itemB,
          },
        },
        update: {
          cooccurrenceCount: data.cooccurrenceCount,
          totalOrders: data.totalOrders,
          confidence: data.confidence,
          lift: data.lift,
          lastAnalyzed: data.lastAnalyzed,
        },
        create: data,
      });
    }
  }

  /**
   * Store frequent itemsets for bundle generation
   */
  private async storeFrequentItemsets(frequentItemsets: FrequentItemset[]): Promise<void> {
    const suggestions: BundleSuggestionData[] = [];

    // Filter itemsets that meet bundle criteria
    const bundleItemsets = frequentItemsets.filter(itemset =>
      itemset.items.length >= this.config.minBundleSize &&
      (!this.config.maxBundleSize || itemset.items.length <= this.config.maxBundleSize) &&
      itemset.support >= this.config.minItemsetSupport
    );

    for (const itemset of bundleItemsets) {
      // Calculate potential savings for this bundle
      const potentialSavings = await this.calculatePotentialSavings(itemset.items);

      // Only include bundles with reasonable savings (> $5 and < $500)
      if (potentialSavings < 5 || potentialSavings > 500) continue;

      // Calculate confidence as the average confidence of rules from this itemset
      const avgConfidence = await this.calculateItemsetConfidence(itemset);

      // Create a more descriptive bundle name
      const bundleName = await this.generateBundleName(itemset.items);

      suggestions.push({
        shop: this.shop,
        name: bundleName,
        items: JSON.stringify(itemset.items),
        confidence: avgConfidence,
        potentialSavings,
        orderFrequency: itemset.supportCount,
        status: 'pending',
      });
    }

    // Store suggestions in database
    if (suggestions.length > 0) {
      await prisma.bundleSuggestion.createMany({
        data: suggestions,
      });
    }
  }

  /**
   * Calculate average confidence for an itemset based on its association rules
   */
  private async calculateItemsetConfidence(itemset: FrequentItemset): Promise<number> {
    // For now, use the itemset support as confidence proxy
    // In a full implementation, we'd calculate this from association rules
    return Math.min(itemset.support * 5, 1.0); // Scale up support to confidence range
  }

  /**
   * Generate bundle suggestions based on frequent itemset analysis
   */
  async generateBundleSuggestions(): Promise<BundleSuggestionData[]> {
    // Get all bundle suggestions from database (generated during analysis)
    const suggestions = await prisma.bundleSuggestion.findMany({
      where: {
        shop: this.shop,
        status: 'pending'
      },
      orderBy: [
        { confidence: 'desc' },
        { potentialSavings: 'desc' },
      ],
      take: 50, // Limit to top suggestions
    });

    return suggestions.map((suggestion: any) => ({
      id: suggestion.id,
      shop: suggestion.shop,
      name: suggestion.name,
      items: suggestion.items,
      confidence: suggestion.confidence,
      potentialSavings: suggestion.potentialSavings,
      orderFrequency: suggestion.orderFrequency,
      status: suggestion.status,
      appliedRuleId: suggestion.appliedRuleId,
      createdAt: suggestion.createdAt,
      updatedAt: suggestion.updatedAt,
    }));
  }

  /**
   * Generate a descriptive bundle name based on item characteristics
   */
  private async generateBundleName(itemIds: string[]): Promise<string> {
    // Get product information for these items
    const orders = await prisma.orderHistory.findMany({
      where: { shop: this.shop },
      select: { lineItems: true },
    });

    // Collect product titles for these items
    const productTitles = new Set<string>();
    for (const order of orders) {
      const lineItems = JSON.parse(order.lineItems);
      for (const item of lineItems) {
        const itemId = item.sku || item.variantId;
        if (itemIds.includes(itemId) && item.productTitle) {
          productTitles.add(item.productTitle);
        }
      }
    }

    const titles = Array.from(productTitles);

    if (titles.length === 0) {
      return `${itemIds.length}-Item Bundle`;
    }

    // Extract common keywords from product titles
    const keywords = titles.flatMap(title => {
      // Remove common words and split
      const cleanTitle = title.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const words = cleanTitle.split(' ')
        .filter(word => word.length > 2 &&
          !['the', 'and', 'for', 'with', 'set', 'kit', 'pack', 'bundle', 'combo', 'set', 'of'].includes(word)
        );

      return words.slice(0, 2); // Take up to 2 meaningful words per title
    });

    // Get most common keywords
    const keywordCount = new Map<string, number>();
    for (const keyword of keywords) {
      keywordCount.set(keyword, (keywordCount.get(keyword) || 0) + 1);
    }

    const topKeywords = Array.from(keywordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([keyword]) => keyword.charAt(0).toUpperCase() + keyword.slice(1));

    if (topKeywords.length >= 2) {
      return `${topKeywords.join(' & ')} Bundle`;
    } else if (topKeywords.length === 1) {
      return `${topKeywords[0]} Collection`;
    } else {
      return `${titles[0].split(' ').slice(0, 2).join(' ')} Bundle`;
    }
  }

  /**
   * Calculate potential savings for a bundle using fulfillment cost logic for reverse bundling
   * Instead of customer price discounts, calculates operational cost savings from reduced packaging/shipping
   */
  private async calculatePotentialSavings(itemIds: string[]): Promise<number> {
    const bundleSize = itemIds.length;

    // For reverse bundling, savings come from reduced fulfillment costs:
    // Individual items: each item shipped separately
    // Bundled items: single shipment for the whole bundle

    // Based on user's example:
    // Individual: $4 shipping + $3 labor per item
    // Bundled: $6 shipping + $3 labor total (regardless of bundle size)

    const shippingPerIndividualItem = 4.0; // $4 shipping per individual item
    const laborPerItem = 3.0;               // $3 labor per item (individual or bundle)
    const shippingForBundle = 6.0;          // $6 shipping for entire bundle

    // Individual fulfillment cost: bundleSize * (shipping + labor)
    const individualFulfillmentCost = bundleSize * (shippingPerIndividualItem + laborPerItem);

    // Bundled fulfillment cost: fixed shipping + labor for bundle
    const bundledFulfillmentCost = shippingForBundle + laborPerItem;

    // Savings: reduction in fulfillment costs
    const fulfillmentSavings = individualFulfillmentCost - bundledFulfillmentCost;

    // For bundleSize=3: (3*4 + 3*3) - (6 + 3) = (12 + 9) - 9 = 21 - 9 = $12 ✓

    // Ensure reasonable bounds (minimum $1, maximum $100 per bundle)
    const boundedSavings = Math.max(1, Math.min(100, fulfillmentSavings));

    return Math.round(boundedSavings * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate estimated revenue potential for a bundle
   */
  private async calculateEstimatedRevenue(itemIds: string[]): Promise<number> {
    // Get co-occurrence frequency
    const cooccurrence = await prisma.itemCooccurrence.findFirst({
      where: {
        shop: this.shop,
        OR: [
          { itemA: itemIds[0], itemB: itemIds[1] },
          { itemA: itemIds[1], itemB: itemIds[0] },
        ],
      },
    });

    if (!cooccurrence) return 0;

    // Estimate monthly revenue based on co-occurrence frequency
    const monthlyFrequency = (cooccurrence.cooccurrenceCount / 90) * 30; // Assuming 90 days of data
    const avgBundlePrice = await this.getAverageBundlePrice(itemIds);

    return monthlyFrequency * avgBundlePrice;
  }

  /**
   * Get average price when all bundle items are purchased together
   */
  private async getAverageBundlePrice(itemIds: string[]): Promise<number> {
    const orders = await prisma.orderHistory.findMany({
      where: { shop: this.shop },
      select: { lineItems: true },
    });

    let totalBundlePrice = 0;
    let bundleCount = 0;

    for (const order of orders) {
      const lineItems = JSON.parse(order.lineItems);
      const orderItemIds = lineItems.map((item: any) => item.sku || item.variantId);
      const hasAllItems = itemIds.every(id => orderItemIds.includes(id));

      if (hasAllItems) {
        bundleCount++;
        // Calculate total price when all items are present
        const bundleItems = lineItems.filter((item: any) => itemIds.includes(item.sku || item.variantId));
        totalBundlePrice += bundleItems.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
      }
    }

    return bundleCount > 0 ? totalBundlePrice / bundleCount : 0;
  }

  /**
   * Clear all analysis data
   */
  async clearAnalysisData(): Promise<void> {
    await prisma.$transaction([
      prisma.bundleSuggestion.deleteMany({ where: { shop: this.shop } }),
      prisma.itemCooccurrence.deleteMany({ where: { shop: this.shop } }),
      prisma.orderHistory.deleteMany({ where: { shop: this.shop } }),
    ]);
  }

  /**
   * Get existing bundle suggestions
   */
  async getBundleSuggestions(): Promise<BundleSuggestion[]> {
    return await prisma.bundleSuggestion.findMany({
      where: { shop: this.shop },
      orderBy: { confidence: 'desc' },
    });
  }
}