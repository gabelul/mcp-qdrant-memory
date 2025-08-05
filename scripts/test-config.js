#!/usr/bin/env node

/**
 * Configuration System Test Suite
 * 
 * Tests the tiered configuration system by importing and testing actual functions
 */

import os from 'os';
import { getUserConfigDir, ensureUserConfigDir } from '../dist/config.js';

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runTest(testName, testFn) {
  try {
    log(`🧪 Testing: ${testName}`, 'blue');
    testFn();
    log(`   ✅ PASSED: ${testName}`, 'green');
    return true;
  } catch (error) {
    log(`   ❌ FAILED: ${testName}`, 'red');
    log(`      Error: ${error.message}`, 'red');
    return false;
  }
}

function testCrossPlatformPaths() {
  const userConfigDir = getUserConfigDir();
  const platform = os.platform();
  
  if (!userConfigDir.includes('claude-code-memory')) {
    throw new Error('All platforms should have claude-code-memory in path');
  }
  
  log(`      Platform: ${platform}`, 'blue');
  log(`      Config dir: ${userConfigDir}`, 'blue');
}

function testDirectoryFunction() {
  const configDir = getUserConfigDir();
  const result = ensureUserConfigDir();
  
  if (result !== configDir) {
    throw new Error('ensureUserConfigDir should return same path as getUserConfigDir');
  }
  
  log(`      Directory function working correctly`, 'blue');
}

function main() {
  log('╔══════════════════════════════════════════════════╗', 'blue');
  log('║          Configuration System Test Suite         ║', 'blue');
  log('╚══════════════════════════════════════════════════╝', 'blue');
  log('');
  
  const tests = [
    ['Cross-platform path detection', testCrossPlatformPaths],
    ['Directory utility functions', testDirectoryFunction]
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const [testName, testFn] of tests) {
    if (runTest(testName, testFn)) {
      passed++;
    } else {
      failed++;
    }
    log('');
  }
  
  log('📊 Test Results:', 'bold');
  log(`   ✅ Passed: ${passed}`, 'green');
  log(`   ❌ Failed: ${failed}`, failed > 0 ? 'red' : 'reset');
  
  if (failed === 0) {
    log('\\n🎉 All tests passed! Configuration system is working correctly.', 'green');
  } else {
    log('\\n⚠️  Some tests failed. Please review the configuration system.', 'red');
    process.exit(1);
  }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}