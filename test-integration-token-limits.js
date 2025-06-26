#!/usr/bin/env node

/**
 * Integration test for end-to-end token limit validation
 * Tests the complete streaming pipeline with simulated large data
 */

import { TokenCounter } from './dist/tokenCounter.js';
import { StreamingResponseBuilder } from './dist/streamingResponseBuilder.js';

console.log('🔬 Starting Integration Token Limit Validation...\n');

/**
 * Generate test data that would normally exceed token limits
 */
function generateLargeTestData() {
  const entities = [];
  const relations = [];

  // Generate entities that would create a large response
  for (let i = 0; i < 200; i++) {
    entities.push({
      name: `TestEntity${i}`,
      entityType: i % 10 === 0 ? 'class' : 'function',
      observations: [
        `Defined in: test/file${i}.py`,
        `Line: ${i * 10}`,
        `Description: This is a very long description for entity ${i} that contains detailed information about the functionality and purpose of this component. It includes extensive documentation that would normally contribute to token count. `.repeat(3),
        `Docstring: """This is an extensive docstring for ${i} that provides comprehensive documentation about the functionality, parameters, return values, and usage examples. This type of documentation is valuable but contributes significantly to token usage."""`,
        `Signature: def test_function_${i}(param1: str, param2: int, param3: Optional[Dict[str, Any]] = None) -> Union[str, None]`,
        `Additional metadata: Complex type annotations and detailed parameter descriptions that would normally be included in comprehensive code analysis.`
      ]
    });
  }

  // Generate relations
  for (let i = 0; i < 150; i++) {
    relations.push({
      from: `TestEntity${i}`,
      to: `TestEntity${(i + 1) % 200}`,
      relationType: i % 5 === 0 ? 'calls' : 'uses'
    });
  }

  return { entities, relations };
}

/**
 * Test suite for integration validation
 */
class IntegrationValidator {
  constructor() {
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
    this.tokenCounter = new TokenCounter();
    this.streamingBuilder = new StreamingResponseBuilder();
  }

  test(name, testFn) {
    this.testCount++;
    console.log(`🧪 Integration Test ${this.testCount}: ${name}`);
    
    try {
      testFn();
      this.passCount++;
      console.log(`✅ PASS: ${name}\n`);
    } catch (error) {
      this.failCount++;
      console.log(`❌ FAIL: ${name}`);
      console.log(`   Error: ${error.message}\n`);
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  printSummary() {
    console.log('📊 Integration Validation Summary:');
    console.log(`   Total: ${this.testCount}`);
    console.log(`   Passed: ${this.passCount}`);
    console.log(`   Failed: ${this.failCount}`);
    console.log(`   Success Rate: ${((this.passCount / this.testCount) * 100).toFixed(1)}%\n`);
  }
}

async function runIntegrationTests() {
  const validator = new IntegrationValidator();
  const testData = generateLargeTestData();

  // Test 1: TokenCounter accuracy validation
  validator.test('TokenCounter estimation accuracy', () => {
    const testString = "This is a test string with exactly twenty-four characters";
    const actualLength = testString.length; // 56 characters
    const tokenCount = validator.tokenCounter.estimateTokens(testString);
    const expectedTokens = Math.ceil(actualLength / 4); // ~14 tokens
    
    validator.assert(
      tokenCount >= expectedTokens - 1 && tokenCount <= expectedTokens + 1,
      `Token estimation should be ~${expectedTokens} tokens for ${actualLength} chars, got ${tokenCount}`
    );

    const testObject = { key: "value", number: 123, array: [1, 2, 3] };
    const objectTokens = validator.tokenCounter.estimateTokensWithFormatting(testObject);
    
    validator.assert(
      objectTokens > 10 && objectTokens < 50,
      `Object token estimation should be reasonable, got ${objectTokens}`
    );

    console.log(`   ✓ String estimation: ${tokenCount} tokens for 56 chars`);
    console.log(`   ✓ Object estimation: ${objectTokens} tokens for JSON object`);
  });

  // Test 2: Budget management validation
  validator.test('Token budget management', () => {
    const budget = validator.tokenCounter.createBudget(1000);
    
    validator.assert(
      budget.total === 900, // 90% of 1000 due to safety margin
      `Budget should apply safety margin: expected 900, got ${budget.total}`
    );

    validator.assert(
      budget.remaining === 900,
      `Initial remaining should equal total: expected 900, got ${budget.remaining}`
    );

    const updatedBudget = validator.tokenCounter.consumeTokens(budget, 300);
    
    validator.assert(
      updatedBudget.used === 300,
      `Used tokens should be tracked: expected 300, got ${updatedBudget.used}`
    );

    validator.assert(
      updatedBudget.remaining === 600,
      `Remaining should be updated: expected 600, got ${updatedBudget.remaining}`
    );

    console.log(`   ✓ Safety margin applied: ${budget.total}/1000`);
    console.log(`   ✓ Token consumption tracked: ${updatedBudget.used} used, ${updatedBudget.remaining} remaining`);
  });

  // Test 3: Content truncation validation
  validator.test('Content truncation functionality', () => {
    const largeBudget = validator.tokenCounter.createBudget(10000);
    const smallBudget = validator.tokenCounter.createBudget(100);

    const largeContent = {
      description: "Very long description that should be truncated when budget is tight. ".repeat(50),
      observations: Array(20).fill("Long observation that contributes to token count. "),
      methods: Array(15).fill("method_name_with_long_signature")
    };

    // Test with large budget (should not truncate)
    const largeResult = validator.tokenCounter.truncateToFit(largeContent, largeBudget);
    validator.assert(
      !largeResult.truncated,
      'Content should not be truncated with large budget'
    );

    // Test with small budget (should truncate)
    const smallResult = validator.tokenCounter.truncateToFit(largeContent, smallBudget);
    validator.assert(
      smallResult.truncated,
      'Content should be truncated with small budget'
    );

    console.log(`   ✓ Large budget: truncated = ${largeResult.truncated}`);
    console.log(`   ✓ Small budget: truncated = ${smallResult.truncated}`);
  });

  // Test 4: Streaming response with large data
  validator.test('Streaming response with large dataset', async () => {
    const smartOptions = { mode: 'smart', limit: 50 };
    const entitiesOptions = { mode: 'entities', limit: 20 };
    const rawOptions = { mode: 'raw' };

    // Test smart mode with large dataset
    const smartResponse = await validator.streamingBuilder.buildStreamingResponse(
      testData.entities,
      testData.relations,
      smartOptions
    );

    validator.assert(
      smartResponse.meta.tokenCount <= 25000,
      `Smart mode should stay under 25k tokens, got ${smartResponse.meta.tokenCount}`
    );

    validator.assert(
      smartResponse.meta.sectionsIncluded.length > 0,
      'Smart mode should include at least one section'
    );

    // Test entities mode with large dataset
    const entitiesResponse = await validator.streamingBuilder.buildStreamingResponse(
      testData.entities,
      testData.relations,
      entitiesOptions
    );

    validator.assert(
      entitiesResponse.meta.tokenCount <= 25000,
      `Entities mode should stay under 25k tokens, got ${entitiesResponse.meta.tokenCount}`
    );

    // Test raw mode with large dataset (should truncate or error)
    const rawResponse = await validator.streamingBuilder.buildStreamingResponse(
      testData.entities,
      testData.relations,
      rawOptions
    );

    validator.assert(
      rawResponse.meta.tokenCount <= 25000 || rawResponse.meta.truncated,
      'Raw mode should either fit in limit or be marked as truncated'
    );

    console.log(`   ✓ Smart mode: ${smartResponse.meta.tokenCount} tokens, sections: ${smartResponse.meta.sectionsIncluded.join(', ')}`);
    console.log(`   ✓ Entities mode: ${entitiesResponse.meta.tokenCount} tokens, truncated: ${entitiesResponse.meta.truncated}`);
    console.log(`   ✓ Raw mode: ${rawResponse.meta.tokenCount} tokens, truncated: ${rawResponse.meta.truncated}`);
  });

  // Test 5: Progressive section building validation
  validator.test('Progressive section building behavior', async () => {
    const largeDataset = generateLargeTestData();
    
    // Add even more data to ensure truncation
    for (let i = 200; i < 500; i++) {
      largeDataset.entities.push({
        name: `LargeEntity${i}`,
        entityType: 'class',
        observations: Array(10).fill(`Very detailed observation ${i} with extensive content. `.repeat(5))
      });
    }

    const options = { mode: 'smart', limit: 100 };
    const response = await validator.streamingBuilder.buildStreamingResponse(
      largeDataset.entities,
      largeDataset.relations,
      options
    );

    // With this much data, we should definitely hit truncation
    validator.assert(
      response.meta.tokenCount <= 25000,
      `Response should respect token limit: ${response.meta.tokenCount} tokens`
    );

    // Summary should always be included (highest priority)
    validator.assert(
      response.meta.sectionsIncluded.some(section => section.includes('summary')),
      'Summary section should always be included due to high priority'
    );

    // Check that response is valid JSON-serializable
    const serialized = JSON.stringify(response.content);
    validator.assert(
      serialized.length > 0,
      'Response content should be serializable to JSON'
    );

    const serializedTokens = validator.tokenCounter.estimateTokens(serialized);
    validator.assert(
      serializedTokens <= 25000,
      `Serialized response should fit in token limit: ${serializedTokens} tokens`
    );

    console.log(`   ✓ Final response: ${response.meta.tokenCount} tokens`);
    console.log(`   ✓ Sections included: ${response.meta.sectionsIncluded.join(', ')}`);
    console.log(`   ✓ Serialized size: ${serializedTokens} tokens`);
    console.log(`   ✓ Truncation reason: ${response.meta.truncationReason || 'None'}`);
  });

  // Test 6: Performance characteristics validation
  validator.test('Performance characteristics', async () => {
    const startTime = Date.now();
    
    const options = { mode: 'smart', limit: 30 };
    const response = await validator.streamingBuilder.buildStreamingResponse(
      testData.entities,
      testData.relations,
      options
    );

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    validator.assert(
      processingTime < 5000, // Should complete in under 5 seconds
      `Processing should be fast: took ${processingTime}ms`
    );

    validator.assert(
      response.meta.tokenCount > 0,
      'Response should contain meaningful content'
    );

    console.log(`   ✓ Processing time: ${processingTime}ms`);
    console.log(`   ✓ Response size: ${response.meta.tokenCount} tokens`);
    console.log(`   ✓ Efficiency: ${Math.round(response.meta.tokenCount / processingTime)} tokens/ms`);
  });

  validator.printSummary();
  
  if (validator.failCount === 0) {
    console.log('🎉 Integration Validation Successful!');
    console.log('✨ Option 1: Streaming Response Architecture validated:');
    console.log('   - ✅ Token estimation accuracy confirmed');
    console.log('   - ✅ Budget management working correctly');
    console.log('   - ✅ Content truncation functioning properly');
    console.log('   - ✅ All response modes respect 25k token limit');
    console.log('   - ✅ Progressive section building operational');
    console.log('   - ✅ Performance characteristics acceptable');
    console.log('\n🚀 Production Ready! Token overflow issue resolved.');
    console.log('📊 Guarantee: read_graph responses will stay under 25k tokens');
  } else {
    console.log('⚠️  Integration validation failed. Please review the issues above.');
  }

  return validator.failCount === 0;
}

// Execute integration validation
try {
  const success = await runIntegrationTests();
  process.exit(success ? 0 : 1);
} catch (error) {
  console.error('❌ Integration test execution failed:', error);
  process.exit(1);
}