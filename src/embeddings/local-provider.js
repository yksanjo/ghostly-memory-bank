/**
 * Ghostly Memory Bank - Local Embedding Provider
 * Uses transformers.js for offline embeddings - no API needed!
 */

import { pipeline } from '@xenova/transformers';
import { loadConfig } from '../lib/config.js';

export class LocalEmbeddingProvider {
  constructor(config = {}) {
    this.model = config.model || 'Xenova/all-MiniLM-L6-v2';
    this.embedder = null;
    this.cache = new Map();
    this.batchSize = config.batchSize || 32;
    this.dimension = 384; // all-MiniLM-L6-v2 output dimension
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    console.log(`📦 Loading local embedding model: ${this.model}...`);
    this.embedder = await pipeline('feature-extraction', this.model);
    this.initialized = true;
    console.log('✅ Local embeddings ready (offline mode!)');
  }

  async embed(text) {
    await this.initialize();
    
    if (!text || text.trim() === '') {
      return new Array(this.dimension).fill(0);
    }

    // Check cache first
    const cacheKey = text.substring(0, 100); // Use prefix as cache key
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const output = await this.embedder(text, {
        pooling: 'mean',
        normalize: true
      });

      const embedding = Array.from(output.data);
      
      // Cache result
      this.cache.set(cacheKey, embedding);
      
      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error.message);
      // Return zeros on error
      return new Array(this.dimension).fill(0);
    }
  }

  async embedBatch(texts) {
    await this.initialize();
    
    if (!texts || texts.length === 0) return [];
    
    const embeddings = [];
    
    // Process in batches
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      
      try {
        const output = await this.embedder(batch, {
          pooling: 'mean',
          normalize: true
        });

        // Extract embeddings for each text
        for (let j = 0; j < batch.length; j++) {
          const embedding = Array.from(output.data.slice(
            j * this.dimension,
            (j + 1) * this.dimension
          ));
          embeddings.push(embedding);
          
          // Cache it
          const cacheKey = batch[j].substring(0, 100);
          this.cache.set(cacheKey, embedding);
        }
      } catch (error) {
        console.error('Batch embedding error:', error.message);
        // Add zero embeddings for failed batch
        for (let j = 0; j < batch.length; j++) {
          embeddings.push(new Array(this.dimension).fill(0));
        }
      }
    }
    
    return embeddings;
  }

  clearCache() {
    this.cache.clear();
  }

  getCacheSize() {
    return this.cache.size;
  }
}

/**
 * OpenAI Embedding Provider (fallback)
 */
export class OpenAIEmbeddingProvider {
  constructor(config = {}) {
    this.config = config;
    this.dimension = 1536;
  }

  async initialize() {
    // Lazy load OpenAI
    const OpenAI = (await import('openai')).default;
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable required for OpenAI embeddings');
    }
    
    this.client = new OpenAI({ apiKey });
    this.model = this.config.openai_model || 'text-embedding-ada-002';
    console.log('✅ OpenAI embeddings ready');
  }

  async embed(text) {
    if (!this.client) await this.initialize();
    
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text
    });
    
    return response.data[0].embedding;
  }

  async embedBatch(texts) {
    if (!this.client) await this.initialize();
    
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts
    });
    
    return response.data.map(d => d.embedding);
  }
}

/**
 * Factory function to create embedding provider based on config
 */
export async function createEmbeddingProvider(config = {}) {
  const cfg = config || loadConfig();
  const provider = cfg.embedding?.provider || 'local';
  
  switch (provider) {
    case 'local': {
      const local = new LocalEmbeddingProvider({
        model: cfg.embedding?.local_model || 'Xenova/all-MiniLM-L6-v2',
        batchSize: cfg.embedding?.batch_size || 32
      });
      await local.initialize();
      return local;
    }
    
    case 'openai': {
      const openai = new OpenAIEmbeddingProvider({
        openai_model: cfg.embedding?.openai_model || 'text-embedding-ada-002'
      });
      await openai.initialize();
      return openai;
    }
    
    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }
}

/**
 * Calculate cosine similarity between two vectors
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

export default {
  LocalEmbeddingProvider,
  OpenAIEmbeddingProvider,
  createEmbeddingProvider,
  cosineSimilarity
};
