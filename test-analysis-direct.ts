import { OrderAnalysisService } from './app/order-analysis.server.js';

// Mock admin context for testing
const mockAdmin = {
  graphql: async (query: string, variables?: any) => {
    // Mock response - in real usage this would call Shopify API
    return {
      json: async () => ({
        data: {
          orders: {
            edges: [] // Return empty for now since we're testing with seeded data
          }
        }
      })
    };
  }
};

async function testOrderAnalysis() {
  try {
    const analysisService = new OrderAnalysisService(mockAdmin as any, 'quickstart-9525e261.myshopify.com');

    console.log('Starting full order analysis...');

    // First, analyze co-occurrences from existing data
    await analysisService.analyzeCooccurrences();

    // Then generate suggestions
    const suggestions = await analysisService.generateBundleSuggestions();

    console.log('Analysis completed!');
    console.log('Generated suggestions:', suggestions.length);

    suggestions.forEach((suggestion, index) => {
      const items = JSON.parse(suggestion.items);
      console.log(`${index + 1}. ${suggestion.name}`);
      console.log(`   Items: ${items.join(', ')}`);
      console.log(`   Confidence: ${(suggestion.confidence * 100).toFixed(1)}%`);
      console.log(`   Potential Savings: $${suggestion.potentialSavings.toFixed(2)}`);
      console.log(`   Order Frequency: ${suggestion.orderFrequency}`);
      console.log('---');
    });

  } catch (error) {
    console.error('Test error:', error);
  }
}

testOrderAnalysis();