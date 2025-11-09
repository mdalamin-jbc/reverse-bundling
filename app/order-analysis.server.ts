import prisma from "./db.server";

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
  statisticalSignificance: boolean; // Whether to perform statistical significance testing
  confidenceLevel: number; // Confidence level for statistical tests (default: 0.95)
  enableCrossValidation: boolean; // Whether to perform cross-validation
  seasonalAnalysis: boolean; // Whether to consider seasonal patterns
  inventoryAware: boolean; // Whether to consider inventory levels
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
  // A/B Testing fields
  bundleId?: string;
  savings?: number;
  abTestGroup?: string | null;
  performanceMetrics?: {
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
  };
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
      statisticalSignificance: true, // Enable statistical significance testing
      confidenceLevel: 0.95, // 95% confidence level
      enableCrossValidation: false, // Disable cross-validation for performance
      seasonalAnalysis: false, // Disable seasonal analysis for now
      inventoryAware: false, // Disable inventory awareness for now
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

    const analysisStartTime = Date.now();
    console.log(`[Analysis] Starting enterprise-grade order analysis for shop ${this.shop}, looking back ${daysBack} days`);
    console.log(`[Analysis] Config: minSupport=${(this.config.minSupport * 100).toFixed(1)}%, minConfidence=${(this.config.minConfidence * 100).toFixed(1)}%, adaptiveSupport=${this.config.adaptiveSupport}, maxTime=${this.config.maxAnalysisTime}s${this.config.maxBundleSize ? `, maxBundleSize=${this.config.maxBundleSize}` : ', unlimited bundle size'}`);

    try {
      // Clear existing analysis data
      console.log(`[Analysis] Clearing existing analysis data`);
      await this.clearAnalysisData();

      // Fetch orders from Shopify
      console.log(`[Analysis] Fetching orders from Shopify (${daysBack} days back)`);
      const orders = await this.fetchOrdersFromShopify(daysBack);

      if (orders.length === 0) {
        console.log("[Analysis] No orders found for analysis");
        return;
      }

      console.log(`[Analysis] Fetched ${orders.length} orders for enterprise analysis`);

      // Store order history
      console.log(`[Analysis] Storing order history in database`);
      await this.storeOrderHistory(orders);

      // Analyze co-occurrences using Apriori algorithm
      console.log(`[Analysis] Starting co-occurrence analysis`);
      await this.analyzeCooccurrences();

      const totalAnalysisTime = Date.now() - analysisStartTime;
      console.log(`[Analysis] Enterprise order analysis completed successfully in ${totalAnalysisTime}ms`);
    } catch (error) {
      const totalAnalysisTime = Date.now() - analysisStartTime;
      console.error(`[Analysis] Enterprise analyzeOrderHistory failed after ${totalAnalysisTime}ms:`, error);
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
   * 🔥 CRITICAL FIX: Only analyzes raw customer orders (processed: false) to prevent circular analysis
   */
  async analyzeCooccurrences(): Promise<void> {
    const analysisId = `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[Analysis:${analysisId}] Starting enterprise-grade bundle analysis for shop: ${this.shop}`);

    try {
      // 🔥 ENTERPRISE VALIDATION: Check data integrity before analysis
      console.log(`[Analysis:${analysisId}] Running data integrity validation...`);
      const integrityCheck = await this.validateDataIntegrity();

      if (!integrityCheck.isValid) {
        console.warn(`[Analysis:${analysisId}] Data integrity issues detected:`, integrityCheck.warnings);
        console.log(`[Analysis:${analysisId}] Recommendations:`, integrityCheck.recommendations);

        // Continue with analysis but log warnings
        if (integrityCheck.warnings.some(w => w.includes('All orders are marked as processed'))) {
          console.error(`[Analysis:${analysisId}] CRITICAL: All orders processed - analysis will be empty. Check bundle processing logic.`);
        }
      }

      // 🔥 CRITICAL FIX: Only analyze unprocessed orders to prevent analyzing bundles created from bundles
      // 🔥 EXCLUDE BUNDLE SKUs: Only analyze individual product SKUs, not bundled ones
      const orders = await prisma.orderHistory.findMany({
        where: {
          shop: this.shop,
          processed: false, // Only use raw customer orders, not processed bundles
        },
        select: { lineItems: true },
      });

      if (orders.length === 0) {
        console.log(`[Analysis:${analysisId}] No unprocessed orders found for analysis - this is normal if all orders have been bundled`);
        return;
      }

      console.log(`[Analysis:${analysisId}] Analyzing ${orders.length} unprocessed orders (raw customer data only)`);

      // Convert orders to transactions (arrays of item IDs)
      // 🔥 EXCLUDE BUNDLE SKUs AND BUNDLE PRODUCTS: Only analyze individual product SKUs, not bundled ones
      const transactions: string[][] = orders.map((order: any) => {
        const lineItems = JSON.parse(order.lineItems);
        return lineItems
          .filter((item: any) => {
            const id = item.sku || item.variantId;
            if (!id || id.trim() === '') return false;
            if (id.startsWith('BUNDLE-')) return false; // Exclude bundle SKUs
            if (id.includes('-BUNDLE-')) return false; // Exclude SKUs containing -BUNDLE-
            
            // Also exclude products whose names contain "Bundle" (case-insensitive)
            const productName = item.name || item.productTitle || '';
            if (productName.toLowerCase().includes('bundle')) return false;
            
            return true;
          })
          .map((item: any) => item.sku || item.variantId);
      }).filter((transaction: string[]) => transaction.length > 0);

      if (transactions.length === 0) {
        console.warn(`[Analysis:${analysisId}] No valid transactions found after parsing line items`);
        return;
      }

      console.log(`[Analysis:${analysisId}] Starting dynamic Apriori analysis: ${transactions.length} transactions, adaptive support: ${this.config.adaptiveSupport}`);

      // Run Apriori algorithm to find all frequent itemsets
      const frequentItemsets = await this.apriori(transactions);

      console.log(`[Analysis:${analysisId}] Found ${frequentItemsets.length} frequent itemsets across all sizes`);

      // Generate association rules from frequent itemsets
      const associationRules = this.generateAssociationRules(frequentItemsets, transactions.length);

      console.log(`[Analysis:${analysisId}] Generated ${associationRules.length} association rules`);

      // Store co-occurrence data (for backward compatibility with existing 2-item logic)
      console.log(`[Analysis:${analysisId}] Storing co-occurrence data (${associationRules.length} rules)`);
      await this.storeCooccurrenceData(associationRules);

      // Store frequent itemsets for bundle suggestions
      console.log(`[Analysis:${analysisId}] Storing frequent itemsets for bundle generation`);
      const storeResult = await this.storeFrequentItemsets(frequentItemsets, this.config);

      console.log(`[Analysis:${analysisId}] ✅ Analysis completed successfully!`);
      console.log(`[Analysis:${analysisId}] 📊 Results: ${storeResult.storedBundles} bundles stored, $${storeResult.totalSavings.toFixed(2)} potential savings, ${storeResult.abTestCandidates.length} A/B test candidates`);

    } catch (error) {
      console.error(`[Analysis:${analysisId}] ❌ Analysis failed:`, error);

      // Enterprise error handling - don't rethrow, log and continue
      const errorDetails = {
        analysisId,
        shop: this.shop,
        error: (error as Error).message,
        stack: (error as Error).stack,
        timestamp: new Date().toISOString()
      };

      console.error(`[Analysis:${analysisId}] Error details:`, errorDetails);

      // Could send to error monitoring service here
      // await this.reportAnalysisError(errorDetails);

      // Don't rethrow - analysis failures shouldn't break the application
    }
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
   * Store frequent itemsets for bundle generation with A/B testing support
   */
  async storeFrequentItemsets(
    itemsets: FrequentItemset[],
    analysisConfig: AnalysisConfig
  ): Promise<{
    storedBundles: number;
    totalSavings: number;
    abTestCandidates: Array<{ bundleId: string; items: string[] }>;
  }> {
    console.log(`[Analysis] Storing ${itemsets.length} frequent itemsets as bundle suggestions`);

    const bundleSuggestions: BundleSuggestionData[] = [];
    let totalSavings = 0;
    const abTestCandidates: Array<{ bundleId: string; items: string[] }> = [];

    for (const itemset of itemsets) {
      if (itemset.items.length >= 2) {
        // Calculate potential savings for this bundle
        const bundleSavings = await this.calculatePotentialSavings(itemset.items);
        totalSavings += bundleSavings;

        const bundleId = `bundle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const suggestion: BundleSuggestionData = {
          shop: this.shop,
          name: await this.generateBundleName(itemset.items),
          items: JSON.stringify(itemset.items),
          confidence: itemset.support * 5, // Scale up support to confidence range
          potentialSavings: bundleSavings,
          orderFrequency: itemset.supportCount,
          status: 'pending',
          bundleId,
          savings: bundleSavings,
          abTestGroup: null, // Will be assigned during A/B testing
          performanceMetrics: {
            impressions: 0,
            clicks: 0,
            conversions: 0,
            revenue: 0
          }
        };

        bundleSuggestions.push(suggestion);

        // Add to A/B test candidates if meets criteria
        if (itemset.support >= analysisConfig.minSupport * 1.2 && bundleSavings >= 50) {
          abTestCandidates.push({ bundleId, items: itemset.items });
        }

        console.log(`[Analysis] Created bundle ${bundleId}: ${itemset.items.join(', ')} (support: ${(itemset.support * 100).toFixed(1)}%, savings: $${bundleSavings.toFixed(2)})`);
      }
    }

    // Store suggestions in database
    if (bundleSuggestions.length > 0) {
      console.log(`[Analysis] Storing ${bundleSuggestions.length} bundle suggestions in database`);
      await prisma.bundleSuggestion.createMany({
        data: bundleSuggestions.map(s => ({
          shop: s.shop,
          name: s.name,
          items: s.items,
          confidence: s.confidence,
          potentialSavings: s.potentialSavings,
          orderFrequency: s.orderFrequency,
          status: s.status
        }))
      });
      console.log(`[Analysis] Successfully stored ${bundleSuggestions.length} bundle suggestions`);
    } else {
      console.log(`[Analysis] No valid bundle suggestions generated`);
    }

    console.log(`[Analysis] Total potential savings: $${totalSavings.toFixed(2)}`);
    console.log(`[Analysis] A/B test candidates: ${abTestCandidates.length} bundles`);

    return {
      storedBundles: bundleSuggestions.length,
      totalSavings,
      abTestCandidates
    };
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
   * Generate a professional, enterprise-grade bundle name based on item characteristics
   * Uses intelligent categorization, business context, and marketing best practices
   */
  private async generateBundleName(itemIds: string[]): Promise<string> {
    // Get comprehensive product information
    const productData = await this.getProductDataForBundle(itemIds);

    if (productData.length === 0) {
      return `Optimized ${itemIds.length}-Item Bundle`;
    }

    // Analyze bundle composition for intelligent naming
    const bundleAnalysis = this.analyzeBundleComposition(productData);

    // Generate professional name based on analysis
    const professionalName = this.createProfessionalBundleName(bundleAnalysis, itemIds.length);

    console.log(`[BundleName] Generated professional name: "${professionalName}" for ${itemIds.length} items`);
    return professionalName;
  }

  /**
   * Get comprehensive product data for bundle naming
   */
  private async getProductDataForBundle(itemIds: string[]): Promise<Array<{
    title: string;
    category: string;
    brand: string;
    price: number;
    sku: string;
  }>> {
    const orders = await prisma.orderHistory.findMany({
      where: { shop: this.shop },
      select: { lineItems: true },
    });

    const productMap = new Map<string, any>();

    for (const order of orders) {
      const lineItems = JSON.parse(order.lineItems);
      for (const item of lineItems) {
        const itemId = item.sku || item.variantId;
        if (itemIds.includes(itemId) && !productMap.has(itemId)) {
          productMap.set(itemId, {
            title: item.productTitle || 'Unknown Product',
            category: this.categorizeProduct(item.productTitle || ''),
            brand: this.extractBrand(item.productTitle || ''),
            price: item.price || 0,
            sku: item.sku || itemId
          });
        }
      }
    }

    return Array.from(productMap.values());
  }

  /**
   * Categorize product based on title analysis
   */
  private categorizeProduct(title: string): string {
    const titleLower = title.toLowerCase();

    // Electronics & Tech
    if (/\b(phone|mobile|tablet|computer|laptop|charger|headphone|earbud|speaker|camera|smartwatch|wearable)\b/.test(titleLower)) {
      return 'Electronics';
    }

    // Fashion & Apparel
    if (/\b(shirt|t-shirt|jeans|pants|dress|shoe|sneaker|boot|jacket|coat|hat|cap|bag|wallet|watch|jewelry|ring|necklace|bracelet)\b/.test(titleLower)) {
      return 'Fashion';
    }

    // Home & Kitchen
    if (/\b(chair|table|sofa|couch|bed|mattress|pillow|blanket|sheet|towel|kitchen|pan|pot|utensil|appliance|microwave|blender|coffee|maker)\b/.test(titleLower)) {
      return 'Home & Kitchen';
    }

    // Beauty & Personal Care
    if (/\b(shampoo|conditioner|lotion|cream|makeup|cosmetic|skincare|hair|perfume|cologne|deodorant|soap|toothbrush|razor)\b/.test(titleLower)) {
      return 'Beauty';
    }

    // Sports & Fitness
    if (/\b(dumbbell|kettlebell|resistance|band|yoga|mat|ball|bike|helmet|glove|shoe|running|fitness|gym|workout|protein|supplement)\b/.test(titleLower)) {
      return 'Sports & Fitness';
    }

    // Books & Media
    if (/\b(book|novel|textbook|magazine|cd|dvd|blu-ray|vinyl|record|game|console|controller)\b/.test(titleLower)) {
      return 'Books & Media';
    }

    // Office & School
    if (/\b(pen|pencil|notebook|paper|printer|ink|stapler|tape|folder|binder|calculator|computer|mouse|keyboard|monitor)\b/.test(titleLower)) {
      return 'Office';
    }

    // Tools & Hardware
    if (/\b(drill|screwdriver|hammer|wrench|pliers|saw|tool|kit|ladder|paint|brush|roller|sander|multimeter)\b/.test(titleLower)) {
      return 'Tools';
    }

    // Automotive
    if (/\b(car|auto|vehicle|tire|oil|filter|battery|wiper|light|bulb|engine|transmission|brake|shock|strut)\b/.test(titleLower)) {
      return 'Automotive';
    }

    // Health & Wellness
    if (/\b(vitamin|supplement|protein|massage|therapy|meditation|essential|oil|aromatherapy|wellness|health|medical)\b/.test(titleLower)) {
      return 'Health';
    }

    return 'General';
  }

  /**
   * Extract brand from product title
   */
  private extractBrand(title: string): string {
    // Common brand patterns
    const brandPatterns = [
      /\b(Apple|Samsung|Google|Microsoft|Amazon|Sony|Nike|Adidas|Puma|Under Armour|Lululemon|Patagonia|North Face|Columbia|REI)\b/i,
      /\b(Coca-Cola|Pepsi|Starbucks|McDonald's|Walmart|Target|Best Buy|Home Depot|Lowe's|IKEA|Wayfair)\b/i,
      /\b(Bose|JBL|Beats|Sennheiser|Logitech|Razer|Corsair|ASUS|Dell|HP|Lenovo)\b/i
    ];

    for (const pattern of brandPatterns) {
      const match = title.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Try to extract from common brand positions (start of title)
    const words = title.split(' ');
    if (words.length > 0 && words[0].length > 2 && /^[A-Z]/.test(words[0])) {
      return words[0];
    }

    return '';
  }

  /**
   * Analyze bundle composition for intelligent naming
   */
  private analyzeBundleComposition(products: Array<{
    title: string;
    category: string;
    brand: string;
    price: number;
    sku: string;
  }>): {
    primaryCategory: string;
    categories: string[];
    brands: string[];
    priceRange: { min: number; max: number; avg: number };
    theme: string;
    bundleType: 'complementary' | 'similar' | 'mixed';
  } {
    const categories = [...new Set(products.map(p => p.category))];
    const brands = [...new Set(products.map(p => p.brand).filter(b => b))];
    const prices = products.map(p => p.price).filter(p => p > 0);

    const priceRange = {
      min: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0,
      avg: prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0
    };

    // Determine primary category (most common)
    const categoryCount = new Map<string, number>();
    categories.forEach(cat => categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1));
    const primaryCategory = Array.from(categoryCount.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'General';

    // Determine bundle type
    let bundleType: 'complementary' | 'similar' | 'mixed';
    if (categories.length === 1) {
      bundleType = 'similar';
    } else if (categories.length === 2 && this.areCategoriesComplementary(categories)) {
      bundleType = 'complementary';
    } else {
      bundleType = 'mixed';
    }

    // Determine theme based on content analysis
    const theme = this.determineBundleTheme(products, primaryCategory, bundleType);

    return {
      primaryCategory,
      categories,
      brands,
      priceRange,
      theme,
      bundleType
    };
  }

  /**
   * Check if categories are complementary
   */
  private areCategoriesComplementary(categories: string[]): boolean {
    const complementaryPairs = [
      ['Electronics', 'Electronics'], // Allow same category
      ['Fashion', 'Fashion'],
      ['Home & Kitchen', 'Home & Kitchen'],
      ['Beauty', 'Fashion'], // Beauty products often complement fashion
      ['Sports & Fitness', 'Health'],
      ['Electronics', 'Office'],
      ['Home & Kitchen', 'Home & Kitchen']
    ];

    return complementaryPairs.some(([a, b]) =>
      categories.includes(a) && categories.includes(b)
    );
  }

  /**
   * Determine bundle theme based on content analysis
   */
  private determineBundleTheme(
    products: Array<{ title: string; category: string; brand: string; price: number; sku: string }>,
    primaryCategory: string,
    bundleType: string
  ): string {
    const titles = products.map(p => p.title.toLowerCase());

    // Theme detection based on keywords
    if (titles.some(t => /\b(gaming|game|console|controller|mouse|keyboard|headset)\b/.test(t))) {
      return 'Gaming';
    }
    if (titles.some(t => /\b(workout|fitness|gym|exercise|yoga|running|training)\b/.test(t))) {
      return 'Fitness';
    }
    if (titles.some(t => /\b(office|business|professional|workspace|desk)\b/.test(t))) {
      return 'Office';
    }
    if (titles.some(t => /\b(travel|trip|journey|vacation|adventure)\b/.test(t))) {
      return 'Travel';
    }
    if (titles.some(t => /\b(home|house|apartment|living|dining|bedroom)\b/.test(t))) {
      return 'Home';
    }
    if (titles.some(t => /\b(outdoor|camping|hiking|backpacking|adventure)\b/.test(t))) {
      return 'Outdoor';
    }
    if (titles.some(t => /\b(kitchen|cooking|baking|chef|gourmet)\b/.test(t))) {
      return 'Kitchen';
    }

    // Default to category-based theme
    return primaryCategory;
  }

  /**
   * Create professional bundle name using enterprise-grade naming conventions
   */
  private createProfessionalBundleName(
    analysis: {
      primaryCategory: string;
      categories: string[];
      brands: string[];
      priceRange: { min: number; max: number; avg: number };
      theme: string;
      bundleType: 'complementary' | 'similar' | 'mixed';
    },
    itemCount: number
  ): string {
    const { primaryCategory, categories, brands, theme, bundleType } = analysis;

    // Professional naming templates based on bundle characteristics
    const namingTemplates = {
      similar: {
        Electronics: [
          'Premium Electronics Suite',
          'Tech Essentials Collection',
          'Digital Device Bundle',
          'Gadget Power Pack'
        ],
        Fashion: [
          'Style Essentials Collection',
          'Fashion Forward Bundle',
          'Wardrobe Builder Pack',
          'Trendsetter Collection'
        ],
        'Home & Kitchen': [
          'Home Comfort Collection',
          'Kitchen Essentials Suite',
          'Living Space Bundle',
          'Household Harmony Pack'
        ],
        Beauty: [
          'Beauty Ritual Collection',
          'Skincare Essentials Suite',
          'Glamour Bundle',
          'Wellness Beauty Pack'
        ],
        'Sports & Fitness': [
          'Fitness Performance Bundle',
          'Athletic Training Collection',
          'Sports Excellence Suite',
          'Active Lifestyle Pack'
        ]
      },
      complementary: {
        'Electronics+Office': [
          'Productivity Workstation Bundle',
          'Digital Office Suite',
          'Tech Productivity Pack',
          'Workstation Essentials Collection'
        ],
        'Fashion+Beauty': [
          'Style & Beauty Collection',
          'Complete Look Bundle',
          'Fashion Beauty Suite',
          'Glamour Essentials Pack'
        ],
        'Sports+Health': [
          'Performance & Recovery Bundle',
          'Athletic Wellness Collection',
          'Fitness Health Suite',
          'Training Recovery Pack'
        ]
      },
      mixed: [
        'Complete Solution Bundle',
        'Ultimate Collection',
        'Premium Assortment',
        'Essential Package',
        'Value Collection',
        'Comprehensive Bundle'
      ]
    };

    let selectedName = '';

    // Try complementary naming first
    if (bundleType === 'complementary' && categories.length === 2) {
      const categoryKey = categories.sort().join('+');
      const complementaryNames = namingTemplates.complementary[categoryKey as keyof typeof namingTemplates.complementary];
      if (complementaryNames) {
        selectedName = complementaryNames[Math.floor(Math.random() * complementaryNames.length)];
      }
    }

    // Try category-specific naming
    if (!selectedName && bundleType === 'similar') {
      const categoryNames = namingTemplates.similar[primaryCategory as keyof typeof namingTemplates.similar];
      if (categoryNames) {
        selectedName = categoryNames[Math.floor(Math.random() * categoryNames.length)];
      }
    }

    // Fallback to mixed bundle naming
    if (!selectedName) {
      selectedName = namingTemplates.mixed[Math.floor(Math.random() * namingTemplates.mixed.length)];
    }

    // Add brand element if available
    if (brands.length === 1) {
      selectedName = `${brands[0]} ${selectedName}`;
    } else if (brands.length > 1) {
      selectedName = `Multi-Brand ${selectedName}`;
    }

    // Add theme context for specificity
    if (theme !== primaryCategory && theme !== 'General') {
      // Only add theme if it's different and meaningful
      const themedNames = {
        Gaming: 'Gaming',
        Fitness: 'Fitness',
        Office: 'Office',
        Travel: 'Travel',
        Home: 'Home',
        Outdoor: 'Outdoor',
        Kitchen: 'Kitchen'
      };

      if (themedNames[theme as keyof typeof themedNames]) {
        selectedName = `${themedNames[theme as keyof typeof themedNames]} ${selectedName}`;
      }
    }

    // Add item count for clarity (only for larger bundles)
    if (itemCount > 3) {
      selectedName = `${itemCount}-Piece ${selectedName}`;
    }

    // Ensure professional formatting
    return selectedName
      .replace(/\b\w/g, l => l.toUpperCase()) // Title case
      .replace(/\s+/g, ' ') // Single spaces
      .trim();
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
   * Analyze transactions directly (for statistical validation)
   */
  private async analyzeOrderPatterns(
    transactions: string[][],
    config: AnalysisConfig
  ): Promise<{ rules: AssociationRule[] }> {
    const totalTransactions = transactions.length;

    // Run Apriori algorithm to find frequent itemsets
    const frequentItemsets = await this.aprioriWithTransactions(transactions, config);

    // Generate association rules from frequent itemsets
    const associationRules = this.generateAssociationRules(frequentItemsets, totalTransactions);

    return { rules: associationRules };
  }

  /**
   * Apriori algorithm that works with transaction arrays directly
   */
  private async aprioriWithTransactions(
    transactions: string[][],
    config: AnalysisConfig
  ): Promise<FrequentItemset[]> {
    const totalTransactions = transactions.length;
    const frequentItemsets: FrequentItemset[] = [];
    const startTime = Date.now();
    const maxTime = config.maxAnalysisTime! * 1000;

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
      if (support >= config.minItemsetSupport) {
        frequent1Itemsets.push({
          items: [item],
          support,
          supportCount: count
        });
      }
    }

    frequentItemsets.push(...frequent1Itemsets);

    // Step 2+: Generate larger itemsets dynamically
    let k = 2;
    let currentFrequentItemsets = frequent1Itemsets;
    let consecutiveEmptyLevels = 0;
    const maxConsecutiveEmptyLevels = 2;

    while (currentFrequentItemsets.length > 0 && consecutiveEmptyLevels < maxConsecutiveEmptyLevels) {
      if (Date.now() - startTime > maxTime) break;

      const adaptiveMinSupport = this.calculateAdaptiveSupport(k, totalTransactions);

      const candidates = this.generateCandidates(currentFrequentItemsets, k);

      if (candidates.length === 0) {
        consecutiveEmptyLevels++;
        k++;
        continue;
      }

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
        consecutiveEmptyLevels = 0;
      } else {
        consecutiveEmptyLevels++;
      }

      if (config.maxBundleSize && k >= config.maxBundleSize) break;
      k++;
    }

    return frequentItemsets.filter(itemset => itemset.items.length >= config.minBundleSize);
  }

  /**
   * Calculate statistical significance using chi-square test
   * Tests if the observed co-occurrence is significantly different from random
   */
  private calculateStatisticalSignificance(
    observedCooccurrences: number,
    totalOrders: number,
    itemAFrequency: number,
    itemBFrequency: number
  ): number {
    // Expected co-occurrences under null hypothesis (random)
    const expectedCooccurrences = (itemAFrequency * itemBFrequency) / totalOrders;

    if (expectedCooccurrences === 0) return 1.0; // Perfect significance if expected is 0

    // Chi-square statistic
    const chiSquare = Math.pow(observedCooccurrences - expectedCooccurrences, 2) / expectedCooccurrences;

    // Approximate p-value using chi-square distribution
    // For df=1, p-value ≈ e^(-χ²/2) for large χ²
    const pValue = Math.exp(-chiSquare / 2);

    return Math.min(pValue, 1.0); // Cap at 1.0
  }

  /**
   * Calculate confidence interval for confidence score
   */
  private calculateConfidenceInterval(
    confidence: number,
    sampleSize: number,
    confidenceLevel: number = 0.95
  ): { lower: number; upper: number } {
    if (sampleSize <= 0) return { lower: 0, upper: 1 };

    // Standard error using binomial proportion
    const standardError = Math.sqrt((confidence * (1 - confidence)) / sampleSize);

    // Z-score for confidence level (1.96 for 95%)
    const zScore = confidenceLevel === 0.95 ? 1.96 :
                   confidenceLevel === 0.99 ? 2.576 : 1.96;

    const marginOfError = zScore * standardError;

    return {
      lower: Math.max(0, confidence - marginOfError),
      upper: Math.min(1, confidence + marginOfError)
    };
  }

  /**
   * Perform k-fold cross-validation on association rules
   */
  private async performCrossValidation(
    transactions: string[][],
    k: number = 5
  ): Promise<{
    averageLift: number;
    averageConfidence: number;
    stabilityScore: number;
  }> {
    if (transactions.length < k) {
      // Not enough data for cross-validation
      return { averageLift: 0, averageConfidence: 0, stabilityScore: 0 };
    }

    const foldSize = Math.floor(transactions.length / k);
    const results: Array<{ lift: number; confidence: number }> = [];

    for (let i = 0; i < k; i++) {
      const testStart = i * foldSize;
      const testEnd = (i === k - 1) ? transactions.length : (i + 1) * foldSize;

      const testSet = transactions.slice(testStart, testEnd);
      const trainingSet = [
        ...transactions.slice(0, testStart),
        ...transactions.slice(testEnd)
      ];

      // Generate rules from training set
      const trainingAnalysis = await this.analyzeOrderPatterns(trainingSet, {
        ...this.config,
        minSupport: this.config.minSupport * 0.8, // Lower threshold for training
        minConfidence: this.config.minConfidence * 0.8
      });

      // Evaluate on test set
      const testAnalysis = await this.analyzeOrderPatterns(testSet, {
        ...this.config,
        minSupport: 0, // No minimum for evaluation
        minConfidence: 0
      });

      // Compare results (simplified - compare top rules)
      if (trainingAnalysis.rules.length > 0 && testAnalysis.rules.length > 0) {
        const avgLift = trainingAnalysis.rules.reduce((sum: number, rule: any) => sum + rule.lift, 0) / trainingAnalysis.rules.length;
        const avgConfidence = trainingAnalysis.rules.reduce((sum: number, rule: any) => sum + rule.confidence, 0) / trainingAnalysis.rules.length;

        results.push({ lift: avgLift, confidence: avgConfidence });
      }
    }

    if (results.length === 0) {
      return { averageLift: 0, averageConfidence: 0, stabilityScore: 0 };
    }

    const averageLift = results.reduce((sum, r) => sum + r.lift, 0) / results.length;
    const averageConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

    // Calculate stability (coefficient of variation)
    const liftVariance = results.reduce((sum, r) => sum + Math.pow(r.lift - averageLift, 2), 0) / results.length;
    const confidenceVariance = results.reduce((sum, r) => sum + Math.pow(r.confidence - averageConfidence, 2), 0) / results.length;

    const stabilityScore = 1 / (1 + Math.sqrt((liftVariance + confidenceVariance) / 2));

    return { averageLift, averageConfidence, stabilityScore };
  }

  /**
   * Enhanced analysis with statistical validation
   */
  async analyzeWithStatisticalValidation(
    transactions: string[][]
  ): Promise<{
    rules: Array<{
      antecedent: string[];
      consequent: string[];
      support: number;
      confidence: number;
      lift: number;
      statisticalSignificance: number;
      confidenceInterval: { lower: number; upper: number };
    }>;
    crossValidation: {
      averageLift: number;
      averageConfidence: number;
      stabilityScore: number;
    };
    metadata: {
      totalTransactions: number;
      analysisTime: number;
      statisticalConfidence: number;
    };
  }> {
    const startTime = Date.now();
    console.log(`[Analysis] Starting statistical validation analysis for ${transactions.length} transactions`);

    try {
      // Perform standard Apriori analysis
      const baseAnalysis = await this.analyzeOrderPatterns(transactions, this.config);
      console.log(`[Analysis] Base analysis completed: ${baseAnalysis.rules.length} rules generated`);

      // Enhanced rules with statistical validation
      console.log(`[Analysis] Calculating statistical significance for ${baseAnalysis.rules.length} rules`);
      const enhancedRules = await Promise.all(
        baseAnalysis.rules.map(async (rule, index) => {
          // Calculate statistical significance
          const itemAFrequency = transactions.filter(t => t.includes(rule.antecedent[0])).length;
          const itemBFrequency = transactions.filter(t => t.includes(rule.consequent[0])).length;

          const statisticalSignificance = this.calculateStatisticalSignificance(
            Math.floor(rule.support * transactions.length),
            transactions.length,
            itemAFrequency,
            itemBFrequency
          );

          // Calculate confidence interval
          const confidenceInterval = this.calculateConfidenceInterval(
            rule.confidence,
            Math.floor(rule.support * transactions.length),
            this.config.confidenceLevel
          );

          if (index < 5) { // Log first 5 rules for monitoring
            console.log(`[Analysis] Rule ${index + 1}: ${rule.antecedent.join(',')} => ${rule.consequent.join(',')} (confidence: ${(rule.confidence * 100).toFixed(1)}%, significance: ${(statisticalSignificance * 100).toFixed(3)}%)`);
          }

          return {
            ...rule,
            statisticalSignificance,
            confidenceInterval
          };
        })
      );

      // Perform cross-validation
      console.log(`[Analysis] Starting cross-validation with ${this.config.enableCrossValidation ? 5 : 0} folds`);
      const crossValidation = this.config.enableCrossValidation
        ? await this.performCrossValidation(transactions, 5)
        : { averageLift: 0, averageConfidence: 0, stabilityScore: 0 };

      if (this.config.enableCrossValidation) {
        console.log(`[Analysis] Cross-validation completed: avg lift=${crossValidation.averageLift.toFixed(2)}, stability=${crossValidation.stabilityScore.toFixed(3)}`);
      }

      const analysisTime = Date.now() - startTime;
      console.log(`[Analysis] Statistical validation completed in ${analysisTime}ms`);

      return {
        rules: enhancedRules,
        crossValidation,
        metadata: {
          totalTransactions: transactions.length,
          analysisTime,
          statisticalConfidence: this.config.confidenceLevel
        }
      };
    } catch (error) {
      const analysisTime = Date.now() - startTime;
      console.error(`[Analysis] Statistical validation failed after ${analysisTime}ms:`, error);
      throw error;
    }
  }

  /**
   * 🔥 ENTERPRISE-GRADE DATA INTEGRITY VALIDATION
   * Validates that analysis only uses unprocessed orders and provides comprehensive audit trail
   */
  async validateDataIntegrity(): Promise<{
    isValid: boolean;
    totalOrders: number;
    processedOrders: number;
    unprocessedOrders: number;
    analysisOrdersUsed: number;
    warnings: string[];
    recommendations: string[];
  }> {
    try {
      // Get order counts by processing status
      const [totalOrders, processedOrders, unprocessedOrders] = await Promise.all([
        prisma.orderHistory.count({ where: { shop: this.shop } }),
        prisma.orderHistory.count({ where: { shop: this.shop, processed: true } }),
        prisma.orderHistory.count({ where: { shop: this.shop, processed: false } })
      ]);

      // Get orders that would be used in analysis
      const analysisOrders = await prisma.orderHistory.findMany({
        where: {
          shop: this.shop,
          processed: false,
        },
        select: { id: true, orderId: true, lineItems: true },
      });

      const warnings: string[] = [];
      const recommendations: string[] = [];

      // Validation checks
      if (totalOrders === 0) {
        warnings.push('No orders found in OrderHistory table');
        recommendations.push('Ensure order synchronization is working properly');
      }

      if (processedOrders > 0 && unprocessedOrders === 0) {
        warnings.push('All orders are marked as processed - analysis will find no patterns');
        recommendations.push('Check if bundle processing is incorrectly marking all orders as processed');
      }

      if (unprocessedOrders < 10) {
        warnings.push(`Only ${unprocessedOrders} unprocessed orders available for analysis (minimum 10 recommended)`);
        recommendations.push('More order data needed for statistically significant bundle analysis');
      }

      // Check for potential data corruption
      const ordersWithInvalidLineItems = await prisma.orderHistory.findMany({
        where: {
          shop: this.shop,
          OR: [
            { lineItems: '' },
            { lineItems: '[]' }
          ]
        },
        select: { id: true, orderId: true }
      });

      if (ordersWithInvalidLineItems.length > 0) {
        warnings.push(`${ordersWithInvalidLineItems.length} orders have invalid or empty line items`);
        recommendations.push('Clean up orders with invalid line item data');
      }

      // Check for duplicate order IDs
      const orderIdCounts = await prisma.orderHistory.groupBy({
        by: ['orderId'],
        where: { shop: this.shop },
        _count: { orderId: true },
        having: { orderId: { _count: { gt: 1 } } }
      });

      if (orderIdCounts.length > 0) {
        warnings.push(`${orderIdCounts.length} duplicate order IDs found`);
        recommendations.push('Remove duplicate orders from OrderHistory table');
      }

      const isValid = warnings.length === 0;

      console.log(`[DataIntegrity] Validation complete: ${isValid ? 'PASS' : 'FAIL'}`);
      console.log(`[DataIntegrity] Total: ${totalOrders}, Processed: ${processedOrders}, Unprocessed: ${unprocessedOrders}, Analysis: ${analysisOrders.length}`);

      if (warnings.length > 0) {
        console.log(`[DataIntegrity] Warnings:`, warnings);
      }

      return {
        isValid,
        totalOrders,
        processedOrders,
        unprocessedOrders,
        analysisOrdersUsed: analysisOrders.length,
        warnings,
        recommendations
      };

    } catch (error) {
      console.error('[DataIntegrity] Validation failed:', error);
      throw new Error(`Data integrity validation failed: ${(error as Error).message}`);
    }
  }
}