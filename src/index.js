/**
 * Ghostly Memory Bank - Main Entry Point
 * Terminal-native memory layer for developers
 */

import { loadConfig } from './lib/config.js';
import db, { initDatabase } from './lib/database.js';
import { simulateEvent, startWatching, stopWatching } from './lib/event-listener.js';
import { retrieve, formatMemory } from './lib/retrieval.js';

/**
 * Initialize Ghostly Memory Bank
 * @param {Object} options - Initialization options
 * @returns {Promise<Object>} Initialization result
 */
export async function initialize(options = {}) {
  const config = loadConfig(options.configPath);
  const database = initDatabase();
  
  return {
    config,
    database,
    ready: true
  };
}

/**
 * Capture a terminal event
 * @param {Object} event - Terminal event data
 * @returns {Promise<Object>} Capture result
 */
export async function capture(event) {
  // Ensure initialized
  if (!db.getDatabase) {
    initDatabase();
  }
  
  return simulateEvent(event);
}

/**
 * Query memories
 * @param {Object} context - Query context
 * @returns {Promise<Object>} Retrieval result
 */
export async function recall(context) {
  return retrieve(context);
}

/**
 * Start the event watcher
 * @returns {Object} Watcher info
 */
export function watch() {
  return startWatching();
}

/**
 * Stop the event watcher
 */
export function stop() {
  stopWatching();
}

// Export library functions
export { loadConfig, getConfig } from './lib/config.js';
export { initDatabase, getStats, getRecentEpisodes, searchEpisodes } from './lib/database.js';
export { formatMemory, suggestNextCommand } from './lib/retrieval.js';
export { generateProjectHash, isSignificantEvent } from './lib/episodes.js';

export default {
  initialize,
  capture,
  recall,
  watch,
  stop,
  loadConfig,
  initDatabase,
  getStats,
  getRecentEpisodes,
  searchEpisodes,
  formatMemory,
  suggestNextCommand,
  generateProjectHash,
  isSignificantEvent
};
