/**
 * Tiered Configuration System for MCP Servers
 * 
 * Expert-recommended configuration architecture with cross-platform support
 * Implements industry-standard configuration hierarchy (like AWS CLI, kubectl, npm)
 * 
 * Priority order (first found wins):
 * 1. Environment variables (OPENAI_API_KEY, OPENAI_BASE_URL, etc.)
 * 2. Project-level: ./settings.txt or ./.env (from process.cwd())
 * 3. User-level config: Platform-specific directory
 * 4. Global fallback: Current MCP server installation directory (backward compatibility)
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Debug logging when DEBUG_CONFIG environment variable is set
const DEBUG_CONFIG = process.env.DEBUG_CONFIG === 'true';

/**
 * Cross-platform user configuration directory detection
 * Implements XDG Base Directory specification and platform standards
 */
function getUserConfigDir(): string {
  const platform = os.platform();
  
  switch (platform) {
    case 'win32':
      // Windows: %APPDATA%\claude-code-memory\settings.txt
      return path.join(process.env.APPDATA || os.homedir(), 'claude-code-memory');
    
    case 'darwin':
      // macOS: ~/Library/Application Support/claude-code-memory/settings.txt
      return path.join(os.homedir(), 'Library', 'Application Support', 'claude-code-memory');
    
    default:
      // Linux/Unix: $XDG_CONFIG_HOME/claude-code-memory/settings.txt or ~/.config/claude-code-memory/settings.txt
      const xdgConfigHome = process.env.XDG_CONFIG_HOME;
      return xdgConfigHome 
        ? path.join(xdgConfigHome, 'claude-code-memory')
        : path.join(os.homedir(), '.config', 'claude-code-memory');
  }
}

/**
 * Create user configuration directory if it doesn't exist
 */
function ensureUserConfigDir(): string {
  const configDir = getUserConfigDir();
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      if (DEBUG_CONFIG) {
        debugLog(`Created user config directory: ${configDir}`);
      }
    }
    return configDir;
  } catch (error) {
    if (DEBUG_CONFIG) {
      debugLog(`Failed to create user config directory: ${error}`);
    }
    return configDir; // Return path anyway, might work in read-only mode
  }
}

/**
 * Debug logging utility
 */
function debugLog(message: string): void {
  if (DEBUG_CONFIG) {
    console.log(`[CONFIG DEBUG] ${message}`);
  }
}

/**
 * Configuration source information
 */
interface ConfigSource {
  path: string;
  type: 'environment' | 'project' | 'user' | 'global';
  description: string;
}

/**
 * Tiered configuration loading system
 * Returns the source that was successfully loaded
 */
function loadTieredConfiguration(): ConfigSource | null {
  const userConfigDir = ensureUserConfigDir();
  
  // Define configuration search paths in priority order
  const configSources: ConfigSource[] = [
    // 1. Environment variables (checked later, not file-based)
    
    // 2. Project-level configuration
    {
      path: path.join(process.cwd(), 'settings.txt'),
      type: 'project',
      description: 'Project-level settings.txt'
    },
    {
      path: path.join(process.cwd(), '.env'),
      type: 'project', 
      description: 'Project-level .env file'
    },
    
    // 3. User-level configuration (cross-platform)
    {
      path: path.join(userConfigDir, 'settings.txt'),
      type: 'user',
      description: 'User-level configuration (cross-platform)'
    },
    {
      path: path.join(userConfigDir, '.env'),
      type: 'user',
      description: 'User-level .env file (cross-platform)'
    },
    
    // 4. Global fallback (backward compatibility)
    {
      path: path.join(__dirname, '../../settings.txt'),
      type: 'global',
      description: 'MCP server directory settings.txt (backward compatibility)'
    },
    {
      path: path.join(__dirname, '../../../settings.txt'),
      type: 'global',
      description: 'Parent directory settings.txt (backward compatibility)'
    },
    {
      path: path.join(__dirname, '../../.env'),
      type: 'global',
      description: 'MCP server directory .env (backward compatibility)'
    },
    {
      path: path.join(process.env.HOME || process.env.USERPROFILE || '.', 'settings.txt'),
      type: 'global',
      description: 'Home directory settings.txt (legacy fallback)'
    }
  ];
  
  if (DEBUG_CONFIG) {
    debugLog('Configuration search order:');
    configSources.forEach((source, index) => {
      debugLog(`  ${index + 1}. ${source.description} (${source.path})`);
    });
  }
  
  // Try to load configuration from each source
  for (const source of configSources) {
    if (DEBUG_CONFIG) {
      debugLog(`Checking: ${source.path}`);
    }
    
    const result = dotenv.config({ path: source.path });
    if (!result.error) {
      console.log(`✅ Loaded configuration from ${source.description}`);
      console.log(`   📁 Path: ${source.path}`);
      if (DEBUG_CONFIG) {
        debugLog(`Successfully loaded configuration from: ${source.path}`);
        debugLog(`Configuration keys found: ${Object.keys(result.parsed || {}).join(', ')}`);
      }
      return source;
    } else if (DEBUG_CONFIG) {
      debugLog(`Failed to load ${source.path}: ${result.error?.message}`);
    }
  }
  
  return null;
}

/**
 * Validate configuration and provide helpful error messages
 */
function validateConfiguration(): void {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check required environment variables
  if (!process.env.OPENAI_API_KEY) {
    errors.push('OPENAI_API_KEY is required');
  }
  
  if (!process.env.QDRANT_URL) {
    errors.push('QDRANT_URL is required');
  }
  
  if (!process.env.QDRANT_COLLECTION_NAME) {
    errors.push('QDRANT_COLLECTION_NAME is required');
  }
  
  // Validate API key format (basic check)
  if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('sk-') && !process.env.OPENAI_API_KEY.startsWith('helix-')) {
    warnings.push('OPENAI_API_KEY format looks unusual (expected to start with "sk-" or "helix-")');
  }
  
  // Validate URL format
  if (process.env.QDRANT_URL) {
    try {
      new URL(process.env.QDRANT_URL);
    } catch {
      warnings.push('QDRANT_URL format appears invalid');
    }
  }
  
  if (process.env.OPENAI_BASE_URL) {
    try {
      new URL(process.env.OPENAI_BASE_URL);
    } catch {
      warnings.push('OPENAI_BASE_URL format appears invalid');
    }
  }
  
  // Display warnings
  if (warnings.length > 0) {
    console.log('⚠️ Configuration warnings:');
    warnings.forEach(warning => console.log(`   - ${warning}`));
  }
  
  // Handle errors
  if (errors.length > 0) {
    console.error('❌ Configuration errors found:');
    errors.forEach(error => console.error(`   - ${error}`));
    
    console.error('\n📋 How to fix:');
    console.error('   1. Set environment variables directly:');
    console.error('      export OPENAI_API_KEY="your-key-here"');
    console.error('      export QDRANT_URL="http://localhost:6333"');
    console.error('      export QDRANT_COLLECTION_NAME="your-collection"');
    
    console.error('   2. Or create a configuration file in one of these locations:');
    const userConfigDir = getUserConfigDir();
    console.error(`      - Project: ${path.join(process.cwd(), 'settings.txt')}`);
    console.error(`      - User:    ${path.join(userConfigDir, 'settings.txt')}`);
    
    console.error('   3. Configuration file format:');
    console.error('      OPENAI_API_KEY=your-key-here');
    console.error('      QDRANT_URL=http://localhost:6333');
    console.error('      QDRANT_COLLECTION_NAME=your-collection');
    
    process.exit(1);
  }
}

// Initialize configuration system
if (DEBUG_CONFIG) {
  debugLog('Starting tiered configuration system...');
  debugLog(`Platform: ${os.platform()}`);
  debugLog(`User config directory: ${getUserConfigDir()}`);
  debugLog(`Current working directory: ${process.cwd()}`);
  debugLog(`MCP server directory: ${__dirname}`);
}

// Check if environment variables are already set (highest priority)
const hasEnvVars = process.env.OPENAI_API_KEY && process.env.QDRANT_URL && process.env.QDRANT_COLLECTION_NAME;
if (hasEnvVars) {
  console.log('✅ Using environment variables (highest priority)');
  if (DEBUG_CONFIG) {
    debugLog('Environment variables detected, skipping file-based configuration');
  }
} else {
  // Load from configuration files
  const configSource = loadTieredConfiguration();
  
  if (!configSource) {
    console.log('⚠️ No configuration file found, checking environment variables only');
    if (DEBUG_CONFIG) {
      debugLog('No configuration files found, relying on environment variables');
    }
  }
}

// Validate final configuration
validateConfiguration();

// Export validated configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const QDRANT_URL = process.env.QDRANT_URL!;
const COLLECTION_NAME = process.env.QDRANT_COLLECTION_NAME!;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY; // Optional
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL!;

// Additional configuration exports
const CONFIG_DEBUG = DEBUG_CONFIG;
const USER_CONFIG_DIR = getUserConfigDir();

if (DEBUG_CONFIG) {
  debugLog('Final configuration:');
  debugLog(`  OPENAI_API_KEY: ${OPENAI_API_KEY ? '[REDACTED]' : 'NOT SET'}`);
  debugLog(`  OPENAI_BASE_URL: ${OPENAI_BASE_URL}`);
  debugLog(`  QDRANT_URL: ${QDRANT_URL}`);
  debugLog(`  QDRANT_COLLECTION_NAME: ${COLLECTION_NAME}`);
  debugLog(`  QDRANT_API_KEY: ${QDRANT_API_KEY ? '[REDACTED]' : 'NOT SET'}`);
}

export {
  OPENAI_API_KEY,
  QDRANT_URL,
  COLLECTION_NAME,
  QDRANT_API_KEY,
  OPENAI_BASE_URL,
  CONFIG_DEBUG,
  USER_CONFIG_DIR,
  getUserConfigDir,
  ensureUserConfigDir,
};