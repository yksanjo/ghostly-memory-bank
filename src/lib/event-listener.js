/**
 * Ghostly Memory Bank - Event Capture Layer
 * Captures terminal events from various sources
 */

import { v4 as uuidv4 } from 'uuid';
import simpleGit from 'simple-git';
import { loadConfig } from './config.js';
import db, { initDatabase } from './database.js';
import { 
  generateProjectHash, 
  isSignificantEvent, 
  createEpisodeFromEvent,
  shouldIgnoreCommand,
  getCommandName
} from './episodes.js';
import { generateEpisodeEmbedding } from './embedding.js';
import { retrieve } from './retrieval.js';

// Session tracking
let currentSession = null;
let sessionId = uuidv4();
let lastDirectory = null;
let lastBranch = null;
let dbInitialized = false;

/**
 * Ensure database is initialized
 */
async function ensureDbInit() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

/**
 * Get current git branch
 * @param {string} cwd - Current working directory
 * @returns {Promise<string|null>} Git branch name
 */
async function getGitBranch(cwd) {
  try {
    const git = simpleGit(cwd);
    const branch = await git.branch();
    return branch.current || null;
  } catch (error) {
    return null;
  }
}

/**
 * Detect context changes
 * @param {Object} event - Terminal event
 * @returns {Object} Context changes
 */
function detectContextChanges(event) {
  const changes = {
    is_project_entry: false,
    branch_changed: false,
    is_repeated: false
  };
  
  // Project entry detection
  if (lastDirectory && event.cwd !== lastDirectory) {
    // Check if entering a known project
    const lastProject = generateProjectHash(lastDirectory);
    const currentProject = generateProjectHash(event.cwd);
    
    if (lastProject !== currentProject) {
      const existingProject = db.getProject(currentProject);
      changes.is_project_entry = !!existingProject;
    }
  }
  
  // Branch change detection
  if (lastBranch && event.git_branch && event.git_branch !== lastBranch) {
    changes.branch_changed = true;
  }
  
  return changes;
}

/**
 * Process a terminal event
 * @param {Object} event - Raw terminal event
 * @returns {Promise<Object>} Processed result
 */
export async function processEvent(event) {
  // Ensure DB is initialized
  await ensureDbInit();
  
  const config = loadConfig();
  
  // Ensure we have a session
  if (!currentSession) {
    currentSession = db.getOrCreateSession(sessionId, {
      cwd: event.cwd,
      git_branch: event.git_branch
    });
  }
  
  // Update session activity
  db.updateSession(sessionId, {
    cwd: event.cwd,
    git_branch: event.git_branch
  });
  
  // Generate project hash
  const projectHash = generateProjectHash(event.cwd);
  
  // Upsert project
  db.upsertProject({
    project_hash: projectHash,
    name: event.cwd?.split('/').pop() || 'unknown',
    root_path: event.cwd
  });
  
  // Truncate output if needed
  const stdoutTruncated = event.stdout?.substring(0, config.output.max_stdout_length);
  const stderrTruncated = event.stderr?.substring(0, config.output.max_stderr_length);
  
  // Create structured event
  const structuredEvent = {
    session_id: sessionId,
    timestamp: event.timestamp || new Date().toISOString(),
    cwd: event.cwd,
    git_branch: event.git_branch,
    command: event.command,
    exit_code: event.exit_code,
    stdout_truncated: stdoutTruncated,
    stderr_truncated: stderrTruncated,
    project_hash: projectHash
  };
  
  // Check if command should be ignored
  if (shouldIgnoreCommand(event.command)) {
    return { skipped: true, reason: 'ignored_command' };
  }
  
  // Insert event into database
  const eventId = db.insertEvent(structuredEvent);
  structuredEvent.id = eventId;
  
  // Check if event is significant
  const significance = isSignificantEvent(structuredEvent);
  
  if (!significance.isSignificant) {
    return { 
      stored: true, 
      significant: false, 
      eventId 
    };
  }
  
  // Create episode from significant event
  const episode = createEpisodeFromEvent(structuredEvent);
  const episodeId = db.insertEpisode(episode);
  
  // Generate embedding for the episode
  try {
    const embedding = await generateEpisodeEmbedding(episode);
    const embeddingId = db.insertEmbedding(episodeId, config.embedding.openai_model, embedding);
    
    // Update episode with embedding ID
    db.updateEpisode(episodeId, {
      ...episode,
      embedding_id: embeddingId
    });
  } catch (error) {
    console.warn('Failed to generate embedding:', error.message);
  }
  
  // Update tracking variables
  const contextChanges = detectContextChanges(structuredEvent);
  lastDirectory = event.cwd;
  lastBranch = event.git_branch;
  
  // Try to retrieve relevant memories
  const context = {
    command: event.command,
    cwd: event.cwd,
    git_branch: event.git_branch,
    exit_code: event.exit_code,
    error: stderrTruncated,
    project_hash: projectHash,
    ...contextChanges
  };
  
  const retrievalResult = await retrieve(context);
  
  return {
    stored: true,
    significant: true,
    eventId,
    episodeId,
    retrieval: retrievalResult
  };
}

/**
 * Simulate a terminal event (for testing)
 * @param {Object} params - Event parameters
 * @returns {Promise<Object>} Processing result
 */
export async function simulateEvent(params) {
  // Ensure DB is initialized
  await ensureDbInit();
  
  const event = {
    timestamp: params.timestamp || new Date().toISOString(),
    cwd: params.cwd || process.cwd(),
    git_branch: params.git_branch || null,
    command: params.command,
    exit_code: params.exit_code || 0,
    stdout: params.stdout || '',
    stderr: params.stderr || ''
  };
  
  // Get git branch if not provided
  if (!event.git_branch) {
    event.git_branch = await getGitBranch(event.cwd);
  }
  
  return processEvent(event);
}

/**
 * Start watching terminal sessions
 * This is a placeholder for actual terminal integration
 * In production, this would connect to Ghostty's event system
 */
export function startWatching() {
  console.log('👁️  Ghostly Memory Bank - Event Listener Started');
  console.log('📝 Use ghostly capture <command> to log terminal events');
  console.log('');
  console.log('Example:');
  console.log('  ghostly capture "npm install" --stderr "ERROR" --exit-code 1');
  console.log('');
  
  // In a full implementation, this would:
  // 1. Connect to Ghostty's IPC/event system
  // 2. Listen for command execution events
  // 3. Parse command output
  // 4. Trigger processEvent for each command
  
  return {
    sessionId,
    startTime: new Date().toISOString()
  };
}

/**
 * Stop watching and close session
 */
export function stopWatching() {
  if (currentSession) {
    db.endSession(sessionId);
    currentSession = null;
  }
  
  console.log('🛑 Event listener stopped');
}

/**
 * Get current session info
 * @returns {Object} Session information
 */
export function getSessionInfo() {
  return {
    sessionId,
    currentProject: lastDirectory ? generateProjectHash(lastDirectory) : null,
    currentDirectory: lastDirectory,
    currentBranch: lastBranch
  };
}

export default {
  processEvent,
  simulateEvent,
  startWatching,
  stopWatching,
  getSessionInfo
};
