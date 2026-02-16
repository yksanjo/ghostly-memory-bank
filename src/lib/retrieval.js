/**
 * Ghostly Memory Bank - Retrieval Layer
 * Context-aware memory retrieval with confidence scoring
 */

import { loadConfig } from './config.js';
import { 
  generateEpisodeEmbedding, 
  cosineSimilarity, 
  commandSimilarity 
} from './embedding.js';
import db from './database.js';

/**
 * Determine if retrieval should be triggered based on context
 * @param {Object} context - Current terminal context
 * @param {Object} config - Configuration
 * @returns {Object} { shouldTrigger: boolean, reason: string }
 */
export function shouldTriggerRetrieval(context, config = null) {
  if (!config) {
    config = loadConfig();
  }
  
  const triggers = config.retrieval.triggers;
  
  // Trigger on error
  if (triggers.on_error && context.exit_code !== 0) {
    return { shouldTrigger: true, reason: 'error' };
  }
  
  // Trigger on repeated command
  if (triggers.on_repeat_command && context.is_repeated) {
    return { shouldTrigger: true, reason: 'repeated_command' };
  }
  
  // Trigger on project entry
  if (triggers.on_project_entry && context.is_project_entry) {
    return { shouldTrigger: true, reason: 'project_entry' };
  }
  
  // Trigger on branch change
  if (triggers.on_branch_change && context.branch_changed) {
    return { shouldTrigger: true, reason: 'branch_change' };
  }
  
  return { shouldTrigger: false, reason: null };
}

/**
 * Calculate confidence score for a memory match
 * @param {Object} memory - Retrieved memory
 * @param {Object} context - Current context
 * @param {number} semanticScore - Semantic similarity score
 * @returns {number} Confidence score (0-1)
 */
export function calculateConfidence(memory, context, semanticScore) {
  const config = loadConfig();
  const weights = config.retrieval.weights;
  
  // Project match score
  let projectScore = 0;
  if (memory.project_hash === context.project_hash) {
    projectScore = 1;
  }
  
  // Command similarity score
  let cmdScore = 0;
  if (context.command && memory.fix) {
    cmdScore = commandSimilarity(context.command, memory.fix);
  }
  
  // Weighted confidence calculation
  const confidence = 
    (weights.semantic_similarity * semanticScore) +
    (weights.project_match * projectScore) +
    (weights.command_similarity * cmdScore);
  
  return Math.min(1, Math.max(0, confidence));
}

/**
 * Retrieve relevant memories for a given context
 * @param {Object} context - Current terminal context
 * @param {number} maxResults - Maximum number of results
 * @returns {Promise<Array>} Array of memories with confidence scores
 */
export async function retrieveMemories(context, maxResults = null) {
  const config = loadConfig();
  if (!maxResults) {
    maxResults = config.retrieval.max_memories;
  }
  
  // First, try semantic search with embeddings
  let memories = await semanticSearch(context, maxResults);
  
  // If no embeddings-based results, fall back to text search
  if (memories.length === 0) {
    memories = textSearch(context, maxResults);
  }
  
  // Calculate confidence scores
  const scoredMemories = memories.map(memory => {
    const semanticScore = memory.similarity || 0;
    const confidence = calculateConfidence(memory, context, semanticScore);
    
    return {
      ...memory,
      confidence,
      semanticScore,
      projectMatch: memory.project_hash === context.project_hash
    };
  });
  
  // Filter by confidence threshold
  const minConfidence = config.retrieval.min_confidence;
  const filteredMemories = scoredMemories.filter(m => m.confidence >= minConfidence);
  
  // Sort by confidence
  filteredMemories.sort((a, b) => b.confidence - a.confidence);
  
  return filteredMemories.slice(0, maxResults);
}

/**
 * Perform semantic search using embeddings
 * @param {Object} context - Current context
 * @param {number} limit - Max results
 * @returns {Promise<Array>} Matching memories
 */
async function semanticSearch(context, limit) {
  try {
    // Generate embedding for the context
    const queryText = buildQueryText(context);
    const queryEmbedding = await generateEpisodeEmbedding({
      problem: context.error || '',
      environment: context.cwd || '',
      fix: context.command || '',
      summary: queryText
    });
    
    // Get all episodes with embeddings and calculate similarity
    const episodes = db.getRecentEpisodes(context.project_hash || 'unknown', 100);
    
    const similarities = [];
    
    for (const episode of episodes) {
      const embedding = db.getEmbedding(episode.id);
      
      if (embedding) {
        const similarity = cosineSimilarity(queryEmbedding, embedding.vector);
        
        similarities.push({
          ...episode,
          similarity
        });
      }
    }
    
    // Sort by similarity and return top results
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    return similarities.slice(0, limit);
  } catch (error) {
    // If embedding search fails, return empty array
    console.warn('Semantic search failed:', error.message);
    return [];
  }
}

/**
 * Fallback text-based search
 * @param {Object} context - Current context
 * @param {number} limit - Max results
 * @returns {Array} Matching memories
 */
function textSearch(context, limit) {
  // Build search query from context
  const searchTerms = [];
  
  if (context.command) {
    searchTerms.push(context.command);
  }
  
  if (context.error) {
    searchTerms.push(context.error);
  }
  
  if (context.cwd) {
    const projectName = context.cwd.split('/').pop();
    if (projectName) {
      searchTerms.push(projectName);
    }
  }
  
  const query = searchTerms.join(' ');
  
  if (!query) {
    return [];
  }
  
  // Search in episodes
  const results = db.searchEpisodes(query, limit);
  
  return results.map(ep => ({
    ...ep,
    similarity: 0.5 // Default similarity for text search
  }));
}

/**
 * Build query text from context
 * @param {Object} context - Terminal context
 * @returns {string} Query text
 */
function buildQueryText(context) {
  const parts = [];
  
  if (context.error) {
    parts.push(`Error: ${context.error}`);
  }
  
  if (context.command) {
    parts.push(`Command: ${context.command}`);
  }
  
  if (context.cwd) {
    parts.push(`Directory: ${context.cwd}`);
  }
  
  if (context.git_branch) {
    parts.push(`Branch: ${context.git_branch}`);
  }
  
  return parts.join(' | ');
}

/**
 * Format retrieved memory for display
 * @param {Object} memory - Retrieved memory
 * @param {string} format - Output format ('compact' or 'verbose')
 * @returns {string} Formatted output
 */
export function formatMemory(memory, format = 'compact') {
  if (format === 'verbose') {
    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 Episode #${memory.id}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Problem: ${memory.problem || 'N/A'}
Environment: ${memory.environment || 'N/A'}
Fix: ${memory.fix || 'N/A'}
Keywords: ${memory.keywords || 'N/A'}
Confidence: ${(memory.confidence * 100).toFixed(1)}%
Project: ${memory.project_hash || 'N/A'}
Created: ${memory.created_at || 'N/A'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();
  }
  
  // Compact format
  return `
💭 Past episode (${(memory.confidence * 100).toFixed(0)}% match):
   Problem: ${(memory.problem || 'N/A').substring(0, 80)}
   Fix: ${(memory.fix || 'N/A').substring(0, 60)}
`.trim();
}

/**
 * Generate suggested next command based on memory
 * @param {Object} memory - Retrieved memory
 * @param {Object} context - Current context
 * @returns {string|null} Suggested command
 */
export function suggestNextCommand(memory, context) {
  if (!memory.fix) return null;
  
  // If the fix is a single command, suggest it
  if (!memory.fix.includes('→')) {
    return memory.fix;
  }
  
  // For multi-step workflows, suggest the next step
  // This is a simplified implementation
  const steps = memory.fix.split('→');
  const currentStep = context.command;
  
  // Find where we are in the sequence
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i].trim();
    if (currentStep && step.includes(currentStep)) {
      // Suggest next step
      if (i < steps.length - 1) {
        return steps[i + 1].trim();
      }
    }
  }
  
  // Default to first step if we can't determine position
  return steps[0].trim();
}

/**
 * Main retrieval function - gets context, triggers retrieval, formats output
 * @param {Object} context - Terminal context
 * @returns {Promise<Object>} Retrieval result
 */
export async function retrieve(context) {
  const config = loadConfig();
  
  // Check if we should trigger retrieval
  const { shouldTrigger, reason } = shouldTriggerRetrieval(context);
  
  if (!shouldTrigger) {
    return {
      triggered: false,
      reason,
      memories: [],
      suggestion: null
    };
  }
  
  // Retrieve memories
  const memories = await retrieveMemories(context);
  
  if (memories.length === 0) {
    return {
      triggered: true,
      reason,
      memories: [],
      suggestion: null,
      message: 'No relevant memories found'
    };
  }
  
  // Get top memory for suggestion
  const topMemory = memories[0];
  const suggestion = config.output.show_suggestions 
    ? suggestNextCommand(topMemory, context)
    : null;
  
  return {
    triggered: true,
    reason,
    memories,
    suggestion,
    topMemory,
    formatted: formatMemory(topMemory, config.output.format)
  };
}

export default {
  shouldTriggerRetrieval,
  calculateConfidence,
  retrieveMemories,
  retrieve,
  formatMemory,
  suggestNextCommand
};
