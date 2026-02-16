/**
 * Ghostly Memory Bank - Embedding Layer
 * Handles embedding generation for terminal episodes
 */

import OpenAI from 'openai';
import { loadConfig } from './config.js';

// Simple embedding cache
const embeddingCache = new Map();

let openaiClient = null;

/**
 * Initialize OpenAI client
 * @returns {OpenAI} OpenAI client instance
 */
export function getOpenAIClient() {
  if (!openaiClient) {
    const config = loadConfig();
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    openaiClient = new OpenAI({ apiKey });
  }
  
  return openaiClient;
}

/**
 * Generate embedding for text using OpenAI
 * @param {string} text - Text to embed
 * @returns {Promise<Array<number>>} Embedding vector
 */
export async function generateEmbedding(text) {
  const config = loadConfig();
  const model = config.embedding.openai_model;
  
  // Check cache first
  const cacheKey = `${model}:${text}`;
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey);
  }
  
  try {
    const client = getOpenAIClient();
    const response = await client.embeddings.create({
      model: model,
      input: text
    });
    
    const embedding = response.data[0].embedding;
    
    // Cache the result
    embeddingCache.set(cacheKey, embedding);
    
    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error.message);
    throw error;
  }
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
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same dimension');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
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
  const promises = episodes.map(ep => generateEpisodeEmbedding(ep));
  return Promise.all(promises);
}

/**
 * Clear embedding cache
 */
export function clearCache() {
  embeddingCache.clear();
}

export default {
  getOpenAIClient,
  generateEmbedding,
  generateEpisodeEmbedding,
  formatEpisodeForEmbedding,
  cosineSimilarity,
  commandSimilarity,
  batchGenerateEmbeddings,
  clearCache
};
