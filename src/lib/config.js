/**
 * Ghostly Memory Bank - Configuration Loader
 * Loads and validates config from config.yaml
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let config = null;

/**
 * Load configuration from config.yaml
 * @param {string} configPath - Optional path to config file
 * @returns {Object} Configuration object
 */
export function loadConfig(configPath = null) {
  if (config && !configPath) {
    return config;
  }

  const defaultConfigPath = path.join(process.cwd(), 'config.yaml');
  const actualPath = configPath || defaultConfigPath;

  if (!fs.existsSync(actualPath)) {
    console.warn(`⚠️  Config file not found at ${actualPath}, using defaults`);
    config = getDefaultConfig();
    return config;
  }

  try {
    const fileContents = fs.readFileSync(actualPath, 'utf8');
    const yamlConfig = YAML.parse(fileContents);
    config = mergeWithDefaults(yamlConfig);
    return config;
  } catch (error) {
    console.error(`Error loading config: ${error.message}`);
    config = getDefaultConfig();
    return config;
  }
}

/**
 * Get default configuration
 * @returns {Object} Default configuration
 */
function getDefaultConfig() {
  return {
    storage: {
      db_path: './data/ghostly.db',
      vector_dimensions: 1536,
      index_type: 'hnsw'
    },
    capture: {
      session_timeout_minutes: 30,
      sequence_window: 5,
      min_sequence_length: 3,
      error_patterns: [
        'error', 'fail', 'failed', 'exception', 'fatal', 
        'critical', 'ermission denied', 'not found', 
        'no such file', 'command not found'
      ],
      success_patterns: [
        'success', 'done', 'completed', 'passed', 'ok'
      ],
      ignore_commands: [
        'ls', 'll', 'la', 'pwd', 'cd', 'clear', 
        'echo', 'history', 'which', 'whoami', 'date', 'time'
      ]
    },
    embedding: {
      provider: 'openai',
      openai_model: 'text-embedding-ada-002',
      local_model: 'sentence-transformers',
      local_model_path: './models'
    },
    retrieval: {
      min_confidence: 0.75,
      weights: {
        semantic_similarity: 0.5,
        project_match: 0.3,
        command_similarity: 0.2
      },
      max_memories: 3,
      triggers: {
        on_error: true,
        on_repeat_command: true,
        on_project_entry: true,
        on_branch_change: true
      }
    },
    output: {
      format: 'compact',
      show_suggestions: true,
      max_stdout_length: 10000,
      max_stderr_length: 5000
    },
    security: {
      local_only: true,
      encrypt: false,
      exclude_projects: [
        '*/node_modules/*',
        '*/.git/*',
        '*/vendor/*',
        '*/venv/*'
      ]
    }
  };
}

/**
 * Merge YAML config with defaults
 * @param {Object} yamlConfig - Configuration from YAML
 * @returns {Object} Merged configuration
 */
function mergeWithDefaults(yamlConfig) {
  const defaults = getDefaultConfig();
  
  return {
    storage: { ...defaults.storage, ...yamlConfig.storage },
    capture: { ...defaults.capture, ...yamlConfig.capture },
    embedding: { ...defaults.embedding, ...yamlConfig.embedding },
    retrieval: { ...defaults.retrieval, ...yamlConfig.retrieval },
    output: { ...defaults.output, ...yamlConfig.output },
    security: { ...defaults.security, ...yamlConfig.security }
  };
}

/**
 * Get a specific config value
 * @param {string} key - Dot-notation key (e.g., 'retrieval.min_confidence')
 * @returns {any} Configuration value
 */
export function getConfig(key) {
  const cfg = loadConfig();
  
  if (!key) {
    return cfg;
  }
  
  const keys = key.split('.');
  let value = cfg;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return undefined;
    }
  }
  
  return value;
}

/**
 * Reset config (for testing)
 */
export function resetConfig() {
  config = null;
}

export default { loadConfig, getConfig, resetConfig };
