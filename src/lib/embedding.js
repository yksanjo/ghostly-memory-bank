/**
 * Ghostly Memory Bank - Embedding Layer
 * Handles embedding generation for terminal episodes
 * Supports both local (transformers.js) and OpenAI embeddings
 */

import { loadConfig } from './config.js';
import { createEmbeddingProvider, cosineSimilarity as computeCosineSimilarity } from '../embeddings/local-provider.js';

// Lazy-loaded providers
let embeddingProvider = null;

/**
 * Get or create the embedding provider based on config
 */
async function getEmbeddingProvider() {
  if (!embeddingProvider) {
    const config = loadConfig();
    embeddingProvider = await createEmbeddingProvider(config);
  }
  return embeddingProvider;
}

/**
 * Generate embedding for text 
 * @param {string} text - Text to embed
 * @returns {Promise<Array<number>>} Embedding vector
 */
export async function generateEmbedding(text) {
  const provider = await getEmbeddingProvider();
  return provider.embed(text);
}

/**
 * Generate embedding for a terminal episode
 * @param {Object} episode - Episode data with problem, environment, fix, keywords
 * @returns {Promise<Array<number>>} Embedding vector
 */
export async function generateEpisodeEmbedding(episode) {
  const prompt = formatEpisodeForEmbedding(episode);
  return generateEmbedding(prompt);
}

/**
 * Format episode data into embedding prompt
 * @param {Object} episode - Episode data
 * @returns {string} Formatted text for embedding
 */
export function formatEpisodeForEmbedding(episode) {
  const parts = [];
  
  if (episode.problem) {
    parts.push(`Problem: ${episode.problem}`);
  }
  
  if (episode.environment) {
    parts.push(`Environment: ${episode.environment}`);
  }
  
  if (episode.fix) {
    parts.push(`Fix: ${episode.fix}`);
  }
  
  if (episode.keywords) {
    parts.push(`Keywords: ${episode.keywords}`);
  }
  
  if (episode.summary) {
    parts.push(`Summary: ${episode.summary}`);
  }
  
  return parts.join('\n');
}

/**
 * Calculate cosine similarity between two vectors
 * @param {Array<number>} a - First vector
 * @param {Array<number>} b - Second vector
 * @returns {number} Similarity score (0-1)
 */
export function cosineSimilarity(a, b) {
  return computeCosineSimilarity(a, b);
}

/**
 * Calculate similarity between two commands
 * @param {string} cmd1 - First command
 * @param {string} cmd2 - Second command
 * @returns {number} Similarity score (0-1)
 */
export function commandSimilarity(cmd1, cmd2) {
  if (!cmd1 || !cmd2) return 0;
  
  // Normalize commands
  const normalize = (cmd) => cmd.toLowerCase().trim().split(/\s+/);
  
  const parts1 = normalize(cmd1);
  const parts2 = normalize(cmd2);
  
  // Get command name similarity
  const cmdName1 = parts1[0];
  const cmdName2 = parts2[0];
  
  // Exact match
  if (cmdName1 === cmdName2) {
    // Check if arguments are similar
    const args1 = parts1.slice(1).sort();
    const args2 = parts2.slice(1).sort();
    
    if (args1.length === 0 && args2.length === 0) {
      return 1.0;
    }
    
    // Jaccard similarity on args
    const intersection = args1.filter(arg => args2.includes(arg)).length;
    const union = new Set([...args1, ...args2]).size;
    
    return intersection / union;
  }
  
  // Partial match (edit distance could be added)
  return 0;
}

/**
 * Batch generate embeddings
 * @param {Array<Object>} episodes - Array of episode data
 * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
 */
export async function batchGenerateEmbeddings(episodes) {
  const provider = await getEmbeddingProvider();
  const texts = episodes.map(ep => formatEpisodeForEmbedding(ep));
  return provider.embedBatch(texts);
}

/**
 * Clear embedding cache (if supported)
 */
export async function clearCache() {
  if (embeddingProvider && typeof embeddingProvider.clearCache === 'function') {
    embeddingProvider.clearCache();
  }
}

export default {
  generateEmbedding,
  generateEpisodeEmbedding,
  formatEpisodeForEmbedding,
  cosineSimilarity,
  commandSimilarity,
  batchGenerateEmbeddings,
  clearCache
};
