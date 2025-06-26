#!/usr/bin/env node

// Debug script to analyze relationships mode token handling
const { tokenCounter } = await import('./dist/tokenCounter.js');
const { streamingResponseBuilder } = await import('./dist/streamingResponseBuilder.js');

// Mock test data similar to what would be in a real collection
const mockEntities = [
  {
    name: "TestClass",
    entityType: "class",
    observations: ["Defined in: test.py", "Line: 10", "A test class"]
  },
  {
    name: "test_function", 
    entityType: "function",
    observations: ["Defined in: test.py", "Line: 20", "A test function"]
  }
];

const mockRelations = [];
// Generate a large number of relations to test token limits
for (let i = 0; i < 1000; i++) {
  mockRelations.push({
    from: `Entity${i}`,
    to: `Target${i}`,
    relationType: 'contains'
  });
}

console.log('🔍 Testing relationships mode token handling...');
console.log(`Generated ${mockRelations.length} test relations`);

// Test the streaming response builder with relationships mode
const options = { mode: 'relationships' };

try {
  const result = await streamingResponseBuilder.buildStreamingResponse(
    mockEntities,
    mockRelations,
    options
  );
  
  console.log('\n📊 Results:');
  console.log(`Token count: ${result.meta.tokenCount}`);
  console.log(`Token limit: ${result.meta.tokenLimit}`);
  console.log(`Truncated: ${result.meta.truncated}`);
  console.log(`Sections included: ${result.meta.sectionsIncluded.join(', ')}`);
  if (result.meta.truncationReason) {
    console.log(`Truncation reason: ${result.meta.truncationReason}`);
  }
  
  console.log(`\nRelations in response: ${result.content.relations?.length || 0}`);
  console.log(`Entities in response: ${result.content.entities?.length || 0}`);
  
  // Test the token counter directly
  console.log('\n🧮 Direct token counter test:');
  const budget = tokenCounter.createBudget(24000);
  console.log(`Budget total: ${budget.total}`);
  console.log(`Budget remaining: ${budget.remaining}`);
  
  const relationResponse = { entities: [], relations: mockRelations };
  const estimatedTokens = tokenCounter.estimateTokensWithFormatting(relationResponse);
  console.log(`Estimated tokens for ${mockRelations.length} relations: ${estimatedTokens}`);
  console.log(`Fits in budget: ${tokenCounter.fitsInBudget(budget, relationResponse)}`);
  
} catch (error) {
  console.error('❌ Error:', error);
}