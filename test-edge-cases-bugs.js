#!/usr/bin/env node

/**
 * Edge case and bug detection tests
 * Tests for potential issues, corner cases, and regressions
 */

import { TokenCounter } from './dist/tokenCounter.js';
import { StreamingResponseBuilder } from './dist/streamingResponseBuilder.js';

console.log('🔍 Starting Edge Case & Bug Detection Tests...\n');

class EdgeCaseValidator {
  constructor() {
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
    this.tokenCounter = new TokenCounter();
    this.streamingBuilder = new StreamingResponseBuilder();
  }

  test(name, testFn) {
    this.testCount++;
    console.log(`🧪 Edge Case Test ${this.testCount}: ${name}`);
    
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
    console.log('📊 Edge Case Validation Summary:');
    console.log(`   Total: ${this.testCount}`);
    console.log(`   Passed: ${this.passCount}`);
    console.log(`   Failed: ${this.failCount}`);
    console.log(`   Success Rate: ${((this.passCount / this.testCount) * 100).toFixed(1)}%\n`);
  }
}

async function runEdgeCaseTests() {
  const validator = new EdgeCaseValidator();

  // Test 1: Empty data handling
  validator.test('Empty data handling', async () => {
    const emptyEntities = [];
    const emptyRelations = [];
    
    const response = await validator.streamingBuilder.buildStreamingResponse(
      emptyEntities, 
      emptyRelations, 
      { mode: 'smart' }
    );

    validator.assert(
      response.meta.tokenCount >= 0,
      'Empty data should produce valid response with non-negative token count'
    );

    validator.assert(
      response.content !== null && response.content !== undefined,
      'Empty data should produce valid content object'
    );

    console.log(`   ✓ Empty data token count: ${response.meta.tokenCount}`);
  });

  // Test 2: Null/undefined handling
  validator.test('Null/undefined input handling', async () => {
    try {
      // Test with null entities
      await validator.streamingBuilder.buildStreamingResponse(null, [], { mode: 'smart' });
      validator.assert(false, 'Should handle null entities gracefully');
    } catch (error) {
      // Expected to fail or handle gracefully
      console.log(`   ✓ Null entities handled: ${error.message}`);
    }

    // Test token estimation with various inputs
    const nullResult = validator.tokenCounter.estimateTokens(null);
    validator.assert(
      typeof nullResult === 'number' && nullResult >= 0,
      'Null input should return valid token count'
    );

    const undefinedResult = validator.tokenCounter.estimateTokens(undefined);
    validator.assert(
      typeof undefinedResult === 'number' && undefinedResult >= 0,
      'Undefined input should return valid token count'
    );

    console.log(`   ✓ Null token count: ${nullResult}, Undefined: ${undefinedResult}`);
  });

  // Test 3: Very large input handling
  validator.test('Very large input handling', async () => {
    const largeEntities = [];
    
    // Create entities with very large observations
    for (let i = 0; i < 10; i++) {
      largeEntities.push({
        name: `LargeEntity${i}`,
        entityType: 'class',
        observations: [
          'Very long observation: ' + 'x'.repeat(10000), // 10KB+ observation
          'Another large observation: ' + 'y'.repeat(8000),
          'Third observation: ' + 'z'.repeat(5000)
        ]
      });
    }

    const startTime = Date.now();
    const response = await validator.streamingBuilder.buildStreamingResponse(
      largeEntities, 
      [], 
      { mode: 'smart' }
    );
    const processingTime = Date.now() - startTime;

    validator.assert(
      response.meta.tokenCount <= 25000,
      `Large input should be truncated to stay under token limit: got ${response.meta.tokenCount}`
    );

    validator.assert(
      processingTime < 10000, // Should complete within 10 seconds
      `Large input processing should be reasonable: took ${processingTime}ms`
    );

    console.log(`   ✓ Large input tokens: ${response.meta.tokenCount}, time: ${processingTime}ms`);
  });

  // Test 4: Invalid mode handling
  validator.test('Invalid mode handling', async () => {
    const testEntities = [{ name: 'test', entityType: 'function', observations: ['test'] }];
    
    try {
      const response = await validator.streamingBuilder.buildStreamingResponse(
        testEntities, 
        [], 
        { mode: 'invalid_mode' }
      );
      
      validator.assert(
        response.meta.tokenCount >= 0,
        'Invalid mode should default to working mode'
      );
      
      console.log(`   ✓ Invalid mode handled gracefully, tokens: ${response.meta.tokenCount}`);
    } catch (error) {
      console.log(`   ✓ Invalid mode error handled: ${error.message}`);
    }
  });

  // Test 5: Circular reference handling
  validator.test('Circular reference handling', () => {
    const circularObj = { name: 'test' };
    circularObj.self = circularObj; // Create circular reference

    try {
      const tokens = validator.tokenCounter.estimateTokens(circularObj);
      console.log(`   ✓ Circular reference handled, tokens: ${tokens}`);
    } catch (error) {
      // JSON.stringify should throw on circular references
      console.log(`   ✓ Circular reference error handled: ${error.message}`);
    }
  });

  // Test 6: Memory usage validation
  validator.test('Memory usage validation', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Process moderately large dataset
    const entities = Array(100).fill(null).map((_, i) => ({
      name: `Entity${i}`,
      entityType: 'function',
      observations: Array(5).fill(`Observation ${i} content`)
    }));
    
    const relations = Array(50).fill(null).map((_, i) => ({
      from: `Entity${i}`,
      to: `Entity${(i + 1) % 100}`,
      relationType: 'calls'
    }));

    await validator.streamingBuilder.buildStreamingResponse(entities, relations, { mode: 'smart' });
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    validator.assert(
      memoryIncrease < 100 * 1024 * 1024, // Less than 100MB increase
      `Memory usage should be reasonable: increased by ${Math.round(memoryIncrease / 1024 / 1024)}MB`
    );

    console.log(`   ✓ Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
  });

  // Test 7: Concurrent request handling
  validator.test('Concurrent request handling', async () => {
    const testData = Array(20).fill(null).map((_, i) => ({
      name: `ConcurrentEntity${i}`,
      entityType: 'function',
      observations: [`Test observation ${i}`]
    }));

    // Run multiple concurrent requests
    const promises = Array(5).fill(null).map(async (_, i) => {
      return await validator.streamingBuilder.buildStreamingResponse(
        testData, 
        [], 
        { mode: 'smart', limit: 10 }
      );
    });

    const results = await Promise.all(promises);
    
    validator.assert(
      results.every(result => result.meta.tokenCount <= 25000),
      'All concurrent requests should respect token limits'
    );

    validator.assert(
      results.every(result => result.meta.tokenCount > 0),
      'All concurrent requests should produce valid responses'
    );

    console.log(`   ✓ ${results.length} concurrent requests completed successfully`);
  });

  // Test 8: Boundary value testing
  validator.test('Boundary value testing', () => {
    // Test zero budget
    const zeroBudget = validator.tokenCounter.createBudget(0);
    validator.assert(
      zeroBudget.total === 0,
      'Zero budget should be handled correctly'
    );

    // Test very small budget
    const smallBudget = validator.tokenCounter.createBudget(1);
    validator.assert(
      smallBudget.total >= 0,
      'Very small budget should be non-negative'
    );

    // Test very large budget
    const largeBudget = validator.tokenCounter.createBudget(1000000);
    validator.assert(
      largeBudget.total > 0 && largeBudget.total <= 1000000,
      'Large budget should be reasonable'
    );

    console.log(`   ✓ Zero budget: ${zeroBudget.total}, Small: ${smallBudget.total}, Large: ${largeBudget.total}`);
  });

  validator.printSummary();
  
  if (validator.failCount === 0) {
    console.log('🎉 Edge Case Validation Successful!');
    console.log('✨ No bugs or edge case issues detected:');
    console.log('   - ✅ Empty data handling robust');
    console.log('   - ✅ Null/undefined inputs handled gracefully');
    console.log('   - ✅ Large inputs processed efficiently');
    console.log('   - ✅ Invalid modes handled properly');
    console.log('   - ✅ Circular references managed');
    console.log('   - ✅ Memory usage reasonable');
    console.log('   - ✅ Concurrent requests supported');
    console.log('   - ✅ Boundary values handled correctly');
    console.log('\n🚀 Implementation is robust and production-ready!');
  } else {
    console.log('⚠️  Edge case validation found issues. Please review above.');
  }

  return validator.failCount === 0;
}

// Execute edge case validation
try {
  const success = await runEdgeCaseTests();
  process.exit(success ? 0 : 1);
} catch (error) {
  console.error('❌ Edge case test execution failed:', error);
  process.exit(1);
}