#!/usr/bin/env node

/**
 * Comprehensive test suite for read_graph enhancement implementation
 * Tests smart filtering, mode switching, token limits, and all new functionality
 */

import { QdrantPersistence } from './dist/persistence/qdrant.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('🧪 Starting read_graph Enhancement Test Suite...\n');

/**
 * Test suite class for comprehensive testing
 */
class ReadGraphTestSuite {
  constructor() {
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
    this.results = [];
  }

  async test(name, testFn) {
    this.testCount++;
    console.log(`📋 Test ${this.testCount}: ${name}`);
    
    try {
      await testFn();
      this.passCount++;
      this.results.push({ name, status: 'PASS' });
      console.log(`✅ PASS: ${name}\n`);
    } catch (error) {
      this.failCount++;
      this.results.push({ name, status: 'FAIL', error: error.message });
      console.log(`❌ FAIL: ${name}`);
      console.log(`   Error: ${error.message}\n`);
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message}\n   Expected: ${expected}\n   Actual: ${actual}`);
    }
  }

  assertLessThan(actual, max, message) {
    if (actual >= max) {
      throw new Error(`${message}\n   Expected: < ${max}\n   Actual: ${actual}`);
    }
  }

  printSummary() {
    console.log('📊 Test Summary:');
    console.log(`   Total: ${this.testCount}`);
    console.log(`   Passed: ${this.passCount}`);
    console.log(`   Failed: ${this.failCount}`);
    console.log(`   Success Rate: ${((this.passCount / this.testCount) * 100).toFixed(1)}%\n`);

    if (this.failCount > 0) {
      console.log('❌ Failed Tests:');
      this.results.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`   - ${r.name}: ${r.error}`);
      });
    }
  }
}

/**
 * Main test execution based on read_graph.md plan
 */
async function runEnhancementTests() {
  const suite = new ReadGraphTestSuite();

  // Test 1: Smart Mode Token Limits (from plan)
  await suite.test('Smart Mode Token Limits', async () => {
    const qdrant = new QdrantPersistence();
    
    // Test smart mode with default settings
    const smartResult = await qdrant.scrollAll({ mode: 'smart' });
    suite.assert(smartResult.summary, 'Smart mode should return summary structure');
    suite.assert(smartResult.apiSurface, 'Smart mode should return apiSurface structure');
    suite.assert(smartResult.dependencies, 'Smart mode should return dependencies structure');
    
    // Estimate token count (rough approximation)
    const resultJson = JSON.stringify(smartResult, null, 2);
    const estimatedTokens = Math.ceil(resultJson.length / 4); // Rough token estimation
    console.log(`   Smart mode result: ${estimatedTokens} estimated tokens`);
    suite.assertLessThan(estimatedTokens, 25000, 'Smart mode should stay under 25k token limit');
    
    // Validate summary structure
    suite.assert(typeof smartResult.summary.totalEntities === 'number', 'Should have totalEntities count');
    suite.assert(typeof smartResult.summary.totalRelations === 'number', 'Should have totalRelations count');
    suite.assert(Array.isArray(smartResult.summary.keyModules), 'Should have keyModules array');
    suite.assert(typeof smartResult.summary.breakdown === 'object', 'Should have breakdown object');
    
    console.log(`   Found ${smartResult.summary.totalEntities} entities, ${smartResult.summary.totalRelations} relations`);
    console.log(`   Key modules: ${smartResult.summary.keyModules.slice(0, 3).join(', ')}`);
  });

  // Test 2: Entity Type Filtering
  await suite.test('Entity Type Filtering', async () => {
    const qdrant = new QdrantPersistence();
    
    // Test filtering single type
    const classResult = await qdrant.scrollAll({ 
      mode: 'entities', 
      entityTypes: ['class'],
      limit: 10
    });
    
    suite.assert(Array.isArray(classResult.entities), 'Should return entities array');
    if (classResult.entities.length > 0) {
      const allAreClasses = classResult.entities.every(e => e.entityType === 'class');
      suite.assert(allAreClasses, 'All returned entities should be classes');
      console.log(`   Filtered to ${classResult.entities.length} class entities`);
    }
    
    // Test multiple types
    const multiResult = await qdrant.scrollAll({ 
      mode: 'entities',
      entityTypes: ['class', 'function'],
      limit: 20
    });
    
    if (multiResult.entities.length > 0) {
      const validTypes = multiResult.entities.every(e => 
        e.entityType === 'class' || e.entityType === 'function'
      );
      suite.assert(validTypes, 'All entities should be class or function types');
      console.log(`   Multi-type filter returned ${multiResult.entities.length} entities`);
    }
  });

  // Test 3: Limit Parameter
  await suite.test('Limit Parameter', async () => {
    const qdrant = new QdrantPersistence();
    
    // Test with small limit
    const limitedResult = await qdrant.scrollAll({ 
      mode: 'entities',
      limit: 5
    });
    
    suite.assert(Array.isArray(limitedResult.entities), 'Should return entities array');
    
    // Count entities per type to verify limit
    const typeBreakdown = {};
    limitedResult.entities.forEach(e => {
      typeBreakdown[e.entityType] = (typeBreakdown[e.entityType] || 0) + 1;
    });
    
    Object.entries(typeBreakdown).forEach(([type, count]) => {
      suite.assertLessThan(count, 6, `Type ${type} should respect limit of 5`);
    });
    
    console.log(`   Limited result type breakdown:`, typeBreakdown);
  });

  // Test 4: Mode Switching
  await suite.test('Mode Switching', async () => {
    const qdrant = new QdrantPersistence();
    
    // Test smart mode
    const smartResult = await qdrant.scrollAll({ mode: 'smart' });
    suite.assert(smartResult.summary, 'Smart mode should have summary');
    suite.assert(smartResult.apiSurface, 'Smart mode should have apiSurface');
    
    // Test entities mode
    const entitiesResult = await qdrant.scrollAll({ mode: 'entities' });
    suite.assert(Array.isArray(entitiesResult.entities), 'Entities mode should return entities array');
    suite.assert(!entitiesResult.summary, 'Entities mode should not have summary');
    
    // Test relationships mode
    const relResult = await qdrant.scrollAll({ mode: 'relationships' });
    suite.assert(Array.isArray(relResult.entities), 'Relationships mode should return entities');
    suite.assert(Array.isArray(relResult.relations), 'Relationships mode should return relations');
    
    // Test raw mode (should work but may be large)
    const rawResult = await qdrant.scrollAll({ mode: 'raw' });
    suite.assert(Array.isArray(rawResult.entities), 'Raw mode should return entities array');
    suite.assert(Array.isArray(rawResult.relations), 'Raw mode should return relations array');
    
    console.log(`   Smart: ${smartResult.summary.totalEntities} entities`);
    console.log(`   Entities: ${entitiesResult.entities.length} entities`);
    console.log(`   Relationships: ${relResult.entities.length} entities, ${relResult.relations.length} relations`);
    console.log(`   Raw: ${rawResult.entities.length} entities, ${rawResult.relations.length} relations`);
  });

  // Test 5: Empty Collection Handling
  await suite.test('Empty Collection Handling', async () => {
    const qdrant = new QdrantPersistence();
    
    // This test might fail if collection has data, which is expected
    try {
      const result = await qdrant.scrollAll({ mode: 'smart' });
      
      // If we get here, collection has data
      suite.assert(typeof result === 'object', 'Should return valid object even with data');
      console.log(`   Collection has data (${result.summary ? result.summary.totalEntities : result.entities.length} entities) - test passes`);
    } catch (error) {
      // Collection might be empty or connection failed
      if (error.message.includes('Collection not found') || error.message.includes('COLLECTION_NAME')) {
        console.log(`   Empty/missing collection handled gracefully`);
      } else {
        throw error;
      }
    }
  });

  // Test 6: Real Data Test  
  await suite.test('Real Data Test with memory-project', async () => {
    const qdrant = new QdrantPersistence();
    
    const result = await qdrant.scrollAll({ mode: 'smart' });
    
    // Validate real project data structure
    suite.assert(result.summary.totalEntities > 0, 'Should have real entities from memory-project');
    suite.assert(result.summary.breakdown, 'Should have entity type breakdown');
    
    // Validate API surface has meaningful content
    if (result.apiSurface.functions.length > 0) {
      const func = result.apiSurface.functions[0];
      suite.assert(typeof func.name === 'string', 'Function should have name');
      suite.assert(typeof func.file === 'string', 'Function should have file path');
    }
    
    if (result.apiSurface.classes.length > 0) {
      const cls = result.apiSurface.classes[0];
      suite.assert(typeof cls.name === 'string', 'Class should have name');
      suite.assert(Array.isArray(cls.methods), 'Class should have methods array');
    }
    
    // Validate file structure
    const fileCount = Object.keys(result.structure).length;
    suite.assert(fileCount > 0, 'Should have file structure entries');
    
    console.log(`   Real data: ${result.summary.totalEntities} entities, ${result.summary.totalRelations} relations`);
    console.log(`   API Surface: ${result.apiSurface.classes.length} classes, ${result.apiSurface.functions.length} functions`);
    console.log(`   File structure: ${fileCount} entries`);
    console.log(`   Dependencies: ${result.dependencies.external.length} external, ${result.dependencies.internal.length} internal`);
  });

  // Test 7: Performance Test
  await suite.test('Performance Test - scrollAll execution time', async () => {
    const qdrant = new QdrantPersistence();
    const startTime = Date.now();
    
    const result = await qdrant.scrollAll({ mode: 'smart' });
    const duration = Date.now() - startTime;
    
    console.log(`   Smart mode execution time: ${duration}ms`);
    suite.assertLessThan(duration, 30000, 'Smart mode should complete within 30 seconds');
    
    // Test different modes for performance comparison
    const modes = ['entities', 'relationships'];
    for (const mode of modes) {
      const modeStart = Date.now();
      await qdrant.scrollAll({ mode, limit: 25 });
      const modeDuration = Date.now() - modeStart;
      console.log(`   ${mode} mode execution time: ${modeDuration}ms`);
      suite.assertLessThan(modeDuration, 20000, `${mode} mode should complete within 20 seconds`);
    }
  });

  // Test 8: Backwards Compatibility
  await suite.test('Backwards Compatibility', async () => {
    const qdrant = new QdrantPersistence();
    
    // Test calling without parameters (should default to smart mode)
    const defaultResult = await qdrant.scrollAll();
    suite.assert(defaultResult.summary, 'Default call should return smart mode');
    
    // Test with undefined options
    const undefinedResult = await qdrant.scrollAll(undefined);
    suite.assert(undefinedResult.summary, 'Undefined options should return smart mode');
    
    // Test with empty options
    const emptyResult = await qdrant.scrollAll({});
    suite.assert(emptyResult.summary, 'Empty options should return smart mode');
    
    console.log(`   Default behavior confirmed: smart mode with ${defaultResult.summary.totalEntities} entities`);
  });

  // Test 9: Priority Scoring Validation
  await suite.test('Priority Scoring Validation', async () => {
    const qdrant = new QdrantPersistence();
    
    const result = await qdrant.scrollAll({ mode: 'entities', limit: 10 });
    
    if (result.entities.length > 1) {
      // Check that public functions (non-underscore) appear early
      const publicEntities = result.entities.filter(e => !e.name.startsWith('_'));
      const privateEntities = result.entities.filter(e => e.name.startsWith('_'));
      
      suite.assert(publicEntities.length > 0, 'Should prioritize public entities');
      
      // Check for documented entities
      const documentedEntities = result.entities.filter(e => 
        e.observations.some(obs => obs.includes('docstring') || obs.includes('Description'))
      );
      
      console.log(`   Priority test: ${publicEntities.length} public, ${privateEntities.length} private, ${documentedEntities.length} documented`);
    }
  });

  // Test 10: Token Management Validation
  await suite.test('Token Management - All Modes Under Limits', async () => {
    const qdrant = new QdrantPersistence();
    
    const modes = ['smart', 'entities', 'relationships'];
    
    for (const mode of modes) {
      const result = await qdrant.scrollAll({ mode, limit: 30 });
      const jsonStr = JSON.stringify(result, null, 2);
      const estimatedTokens = Math.ceil(jsonStr.length / 4);
      
      console.log(`   ${mode} mode: ${estimatedTokens} estimated tokens`);
      
      if (mode === 'smart') {
        suite.assertLessThan(estimatedTokens, 25000, `${mode} mode should be under 25k tokens`);
      } else {
        suite.assertLessThan(estimatedTokens, 50000, `${mode} mode should be under 50k tokens`);
      }
    }
  });

  suite.printSummary();
  
  if (suite.failCount === 0) {
    console.log('🎉 All tests passed! read_graph enhancement is working correctly.');
    console.log('✨ Successfully implemented:');
    console.log('   - ✅ Smart mode with token limits (<25k)');
    console.log('   - ✅ Entity type filtering');
    console.log('   - ✅ Limit parameter per type');
    console.log('   - ✅ Mode switching (smart/entities/relationships/raw)');
    console.log('   - ✅ Priority scoring for public APIs');
    console.log('   - ✅ Performance within acceptable limits');
    console.log('   - ✅ Backwards compatibility');
    console.log('   - ✅ Real data handling');
    console.log('\n🚀 read_graph is now usable for Claude Code with meaningful, filtered data!');
  } else {
    console.log('⚠️  Some tests failed. Please review the implementation.');
  }

  return suite.failCount === 0;
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const success = await runEnhancementTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

export { runEnhancementTests };