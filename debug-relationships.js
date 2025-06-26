#!/usr/bin/env node

/**
 * Debug utility for analyzing relationships mode token handling
 * Helps verify token limits are enforced correctly for large datasets
 */

import { tokenCounter, TOKEN_CONFIG } from './dist/tokenCounter.js';
import { streamingResponseBuilder } from './dist/streamingResponseBuilder.js';

// Test configuration
const TEST_CONFIG = {
  ENTITY_COUNT: 10,
  RELATION_COUNT: 1000,
  MODES_TO_TEST: ['relationships', 'smart', 'raw']
};

/**
 * Generate test data
 */
function generateTestData() {
  const entities = Array.from({ length: TEST_CONFIG.ENTITY_COUNT }, (_, i) => ({
    name: `TestEntity${i}`,
    entityType: ['class', 'function', 'variable'][i % 3],
    observations: [
      `Defined in: module${Math.floor(i / 10)}.py`,
      `Line: ${10 + i * 5}`,
      `Mock entity for testing token limits`
    ]
  }));

  const relations = Array.from({ length: TEST_CONFIG.RELATION_COUNT }, (_, i) => ({
    from: `Entity${i % TEST_CONFIG.ENTITY_COUNT}`,
    to: `Target${(i + 1) % TEST_CONFIG.ENTITY_COUNT}`,
    relationType: ['contains', 'imports', 'inherits', 'uses'][i % 4]
  }));

  return { entities, relations };
}

/**
 * Analyze token usage for different modes
 */
async function analyzeTokenUsage() {
  console.log('🔍 Token Usage Analysis for Streaming Responses\n');
  console.log(`Test Configuration:`);
  console.log(`  - Entities: ${TEST_CONFIG.ENTITY_COUNT}`);
  console.log(`  - Relations: ${TEST_CONFIG.RELATION_COUNT}`);
  console.log(`  - Token Limit: ${TOKEN_CONFIG.DEFAULT_TOKEN_LIMIT}`);
  console.log(`  - Safety Margin: ${(TOKEN_CONFIG.SAFETY_MARGIN * 100).toFixed(0)}%\n`);

  const { entities, relations } = generateTestData();
  
  // Estimate raw data size
  const rawData = { entities, relations };
  const rawTokens = tokenCounter.estimateTokensWithFormatting(rawData);
  console.log(`📊 Raw Data Analysis:`);
  console.log(`  - Raw token estimate: ${rawTokens.toLocaleString()}`);
  console.log(`  - Exceeds limit: ${rawTokens > TOKEN_CONFIG.DEFAULT_TOKEN_LIMIT ? 'Yes' : 'No'}`);
  console.log(`  - Overflow ratio: ${(rawTokens / TOKEN_CONFIG.DEFAULT_TOKEN_LIMIT).toFixed(2)}x\n`);

  // Test each mode
  for (const mode of TEST_CONFIG.MODES_TO_TEST) {
    console.log(`\n📋 Testing ${mode.toUpperCase()} mode:`);
    
    try {
      const result = await streamingResponseBuilder.buildStreamingResponse(
        entities,
        relations,
        { mode }
      );
      
      const { meta, content } = result;
      
      console.log(`  ✅ Response built successfully`);
      console.log(`  - Token count: ${meta.tokenCount.toLocaleString()} / ${meta.tokenLimit.toLocaleString()}`);
      console.log(`  - Utilization: ${((meta.tokenCount / meta.tokenLimit) * 100).toFixed(1)}%`);
      console.log(`  - Truncated: ${meta.truncated ? 'Yes' : 'No'}`);
      
      if (meta.truncationReason) {
        console.log(`  - Truncation reason: ${meta.truncationReason}`);
      }
      
      console.log(`  - Sections included: ${meta.sectionsIncluded.join(', ') || 'none'}`);
      
      // Mode-specific details
      if (mode === 'relationships' && content.relations) {
        console.log(`  - Relations included: ${content.relations.length} / ${relations.length}`);
      } else if (mode === 'smart' && content.summary) {
        console.log(`  - Summary entities: ${content.summary.totalEntities}`);
        console.log(`  - Summary relations: ${content.summary.totalRelations}`);
      }
      
      // Verify token limit is respected
      if (meta.tokenCount > meta.tokenLimit) {
        console.error(`  ⚠️  WARNING: Token count exceeds limit!`);
      }
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }

  console.log('\n✅ Analysis complete!\n');
}

// Run analysis
analyzeTokenUsage().catch(console.error);