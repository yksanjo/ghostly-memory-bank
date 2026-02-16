/**
 * Ghostly Memory Bank - Database Layer
 * SQLite storage for terminal events, episodes, and embeddings using sql.js
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;
let SQL = null;

/**
 * Initialize database connection and create tables
 * @returns {Promise<Object>} SQLite database instance
 */
export async function initDatabase() {
  const config = loadConfig();
  const dbPath = path.resolve(process.cwd(), config.storage.db_path);
  
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  // Initialize SQL.js
  SQL = await initSqlJs();
  
  // Load existing database or create new
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  // Create tables
  createTables();
  
  // Save to disk
  saveDatabase();
  
  console.log(`📂 Database initialized at ${dbPath}`);
  return db;
}

/**
 * Get database instance
 * @returns {Promise<Object>} SQLite database instance
 */
export async function getDatabase() {
  if (!db) {
    await initDatabase();
  }
  return db;
}

/**
 * Save database to disk
 */
function saveDatabase() {
  if (!db) return;
  
  const config = loadConfig();
  const dbPath = path.resolve(process.cwd(), config.storage.db_path);
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

/**
 * Create database tables
 */
function createTables() {
  // Terminal events table
  db.run(`
    CREATE TABLE IF NOT EXISTS raw_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      cwd TEXT,
      git_branch TEXT,
      command TEXT NOT NULL,
      exit_code INTEGER,
      stdout_text TEXT,
      stderr_text TEXT,
      project_hash TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // Episodes table (grouped events with summaries)
  db.run(`
    CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_hash TEXT,
      summary TEXT NOT NULL,
      problem TEXT,
      environment TEXT,
      fix TEXT,
      keywords TEXT,
      embedding_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // Embeddings table (vector storage)
  db.run(`
    CREATE TABLE IF NOT EXISTS embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episode_id INTEGER NOT NULL,
      model TEXT NOT NULL,
      vector BLOB NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
    )
  `);
  
  // Projects table (for project-aware retrieval)
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_hash TEXT UNIQUE NOT NULL,
      name TEXT,
      root_path TEXT,
      git_remote TEXT,
      first_seen TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // Sessions table (terminal session tracking)
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      cwd TEXT,
      git_branch TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      last_activity TEXT DEFAULT (datetime('now')),
      ended_at TEXT
    )
  `);
  
  // Create indexes for faster queries
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_session ON raw_events(session_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_project ON raw_events(project_hash)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON raw_events(timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_episodes_project ON episodes(project_hash)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_episodes_embedding ON episodes(embedding_id)`);
  } catch (e) {
    // Indexes may already exist
  }
}

/**
 * Insert a raw terminal event
 * @param {Object} event - Terminal event data
 * @returns {number} Inserted event ID
 */
export function insertEvent(event) {
  const stmt = db.prepare(`
    INSERT INTO raw_events 
    (session_id, timestamp, cwd, git_branch, command, exit_code, stdout_text, stderr_text, project_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run([
    event.session_id,
    event.timestamp,
    event.cwd || null,
    event.git_branch || null,
    event.command,
    event.exit_code || null,
    event.stdout_truncated || null,
    event.stderr_truncated || null,
    event.project_hash || null
  ]);
  
  stmt.free();
  
  const result = db.exec('SELECT last_insert_rowid() as id');
  saveDatabase();
  
  return result[0]?.values[0][0] || 0;
}

/**
 * Insert an episode (grouped events with summary)
 * @param {Object} episode - Episode data
 * @returns {number} Inserted episode ID
 */
export function insertEpisode(episode) {
  const stmt = db.prepare(`
    INSERT INTO episodes 
    (project_hash, summary, problem, environment, fix, keywords, embedding_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run([
    episode.project_hash,
    episode.summary,
    episode.problem,
    episode.environment,
    episode.fix,
    episode.keywords,
    episode.embedding_id || null
  ]);
  
  stmt.free();
  
  const result = db.exec('SELECT last_insert_rowid() as id');
  saveDatabase();
  
  return result[0]?.values[0][0] || 0;
}

/**
 * Update an existing episode
 * @param {number} id - Episode ID
 * @param {Object} episode - Updated episode data
 */
export function updateEpisode(id, episode) {
  const stmt = db.prepare(`
    UPDATE episodes 
    SET summary = ?, problem = ?, environment = ?, fix = ?, keywords = ?, 
        embedding_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  
  stmt.run([
    episode.summary,
    episode.problem,
    episode.environment,
    episode.fix,
    episode.keywords,
    episode.embedding_id || null,
    id
  ]);
  
  stmt.free();
  saveDatabase();
}

/**
 * Get episode by ID
 * @param {number} id - Episode ID
 * @returns {Object|null} Episode data
 */
export function getEpisode(id) {
  const stmt = db.prepare('SELECT * FROM episodes WHERE id = ?');
  stmt.bind([id]);
  
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  
  stmt.free();
  return null;
}

/**
 * Get recent episodes for a project
 * @param {string} projectHash - Project hash
 * @param {number} limit - Max number of episodes
 * @returns {Array} Episode list
 */
export function getRecentEpisodes(projectHash, limit = 10) {
  const results = db.exec(`
    SELECT * FROM episodes 
    WHERE project_hash = '${projectHash}'
    ORDER BY created_at DESC 
    LIMIT ${limit}
  `);
  
  if (!results[0]) return [];
  
  const columns = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

/**
 * Search episodes by similarity (basic text search fallback)
 * @param {string} query - Search query
 * @param {number} limit - Max results
 * @returns {Array} Matching episodes
 */
export function searchEpisodes(query, limit = 5) {
  const escapedQuery = query.replace(/'/g, "''");
  
  const results = db.exec(`
    SELECT * FROM episodes 
    WHERE summary LIKE '%${escapedQuery}%' 
       OR problem LIKE '%${escapedQuery}%' 
       OR keywords LIKE '%${escapedQuery}%'
    ORDER BY created_at DESC 
    LIMIT ${limit}
  `);
  
  if (!results[0]) return [];
  
  const columns = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

/**
 * Insert embedding for an episode
 * @param {number} episodeId - Episode ID
 * @param {string} model - Embedding model name
 * @param {Array} vector - Embedding vector
 */
export function insertEmbedding(episodeId, model, vector) {
  // Convert vector to base64 string for storage
  const vectorStr = JSON.stringify(vector);
  
  const stmt = db.prepare(`
    INSERT INTO embeddings (episode_id, model, vector)
    VALUES (?, ?, ?)
  `);
  
  stmt.run([episodeId, model, vectorStr]);
  stmt.free();
  
  const result = db.exec('SELECT last_insert_rowid() as id');
  saveDatabase();
  
  return result[0]?.values[0][0] || 0;
}

/**
 * Get embedding for an episode
 * @param {number} episodeId - Episode ID
 * @returns {Object|null} Embedding data with vector
 */
export function getEmbedding(episodeId) {
  const stmt = db.prepare(`
    SELECT id, episode_id, model, vector, created_at 
    FROM embeddings 
    WHERE episode_id = ?
  `);
  
  stmt.bind([episodeId]);
  
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    
    return {
      ...row,
      vector: JSON.parse(row.vector)
    };
  }
  
  stmt.free();
  return null;
}

/**
 * Upsert project record
 * @param {Object} project - Project data
 */
export function upsertProject(project) {
  // Check if exists
  const existing = db.exec(`SELECT id FROM projects WHERE project_hash = '${project.project_hash}'`);
  
  if (existing[0]?.values?.length > 0) {
    db.run(`
      UPDATE projects 
      SET name = '${(project.name || '').replace(/'/g, "''")}', 
          root_path = '${(project.root_path || '').replace(/'/g, "''")}', 
          git_remote = '${(project.git_remote || '').replace(/'/g, "''")}', 
          last_seen = datetime('now')
      WHERE project_hash = '${project.project_hash}'
    `);
  } else {
    db.run(`
      INSERT INTO projects (project_hash, name, root_path, git_remote, last_seen)
      VALUES (
        '${project.project_hash}', 
        '${(project.name || '').replace(/'/g, "''")}', 
        '${(project.root_path || '').replace(/'/g, "''")}', 
        '${(project.git_remote || '').replace(/'/g, "''")}', 
        datetime('now')
      )
    `);
  }
  
  saveDatabase();
}

/**
 * Get project by hash
 * @param {string} projectHash - Project hash
 * @returns {Object|null} Project data
 */
export function getProject(projectHash) {
  const results = db.exec(`SELECT * FROM projects WHERE project_hash = '${projectHash}'`);
  
  if (!results[0]?.values?.length) return null;
  
  const columns = results[0].columns;
  const row = results[0].values[0];
  const obj = {};
  columns.forEach((col, i) => obj[col] = row[i]);
  return obj;
}

/**
 * Get or create session
 * @param {string} sessionId - Session ID
 * @param {Object} initialData - Initial session data
 * @returns {Object} Session data
 */
export function getOrCreateSession(sessionId, initialData = {}) {
  const existing = db.exec(`SELECT * FROM sessions WHERE session_id = '${sessionId}'`);
  
  if (existing[0]?.values?.length > 0) {
    const columns = existing[0].columns;
    const row = existing[0].values[0];
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  }
  
  // Create new session
  db.run(`
    INSERT INTO sessions (session_id, cwd, git_branch)
    VALUES ('${sessionId}', '${(initialData.cwd || '').replace(/'/g, "''")}', '${(initialData.git_branch || '').replace(/'/g, "''")}')
  `);
  
  saveDatabase();
  
  const result = db.exec(`SELECT * FROM sessions WHERE session_id = '${sessionId}'`);
  const columns = result[0].columns;
  const row = result[0].values[0];
  const obj = {};
  columns.forEach((col, i) => obj[col] = row[i]);
  return obj;
}

/**
 * Update session activity
 * @param {string} sessionId - Session ID
 * @param {Object} data - Updated session data
 */
export function updateSession(sessionId, data) {
  const updates = [];
  
  if (data.cwd) {
    updates.push(`cwd = '${data.cwd.replace(/'/g, "''")}'`);
  }
  
  if (data.git_branch) {
    updates.push(`git_branch = '${data.git_branch.replace(/'/g, "''")}'`);
  }
  
  updates.push("last_activity = datetime('now')");
  
  if (updates.length > 0) {
    db.run(`UPDATE sessions SET ${updates.join(', ')} WHERE session_id = '${sessionId}'`);
    saveDatabase();
  }
}

/**
 * End a session
 * @param {string} sessionId - Session ID
 */
export function endSession(sessionId) {
  db.run(`UPDATE sessions SET ended_at = datetime('now') WHERE session_id = '${sessionId}'`);
  saveDatabase();
}

/**
 * Get events for a session
 * @param {string} sessionId - Session ID
 * @returns {Array} Event list
 */
export function getSessionEvents(sessionId) {
  const results = db.exec(`
    SELECT * FROM raw_events 
    WHERE session_id = '${sessionId}' 
    ORDER BY timestamp ASC
  `);
  
  if (!results[0]) return [];
  
  const columns = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

/**
 * Get recent events across all sessions
 * @param {number} limit - Max number of events
 * @returns {Array} Event list
 */
export function getRecentEvents(limit = 100) {
  const results = db.exec(`
    SELECT * FROM raw_events 
    ORDER BY timestamp DESC 
    LIMIT ${limit}
  `);
  
  if (!results[0]) return [];
  
  const columns = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

/**
 * Get statistics about stored data
 * @returns {Object} Statistics
 */
export function getStats() {
  const eventCount = db.exec('SELECT COUNT(*) as count FROM raw_events');
  const episodeCount = db.exec('SELECT COUNT(*) as count FROM episodes');
  const projectCount = db.exec('SELECT COUNT(*) as count FROM projects');
  const sessionCount = db.exec('SELECT COUNT(*) as count FROM sessions');
  
  return {
    events: eventCount[0]?.values[0][0] || 0,
    episodes: episodeCount[0]?.values[0][0] || 0,
    projects: projectCount[0]?.values[0][0] || 0,
    sessions: sessionCount[0]?.values[0][0] || 0
  };
}

/**
 * Close database connection
 */
export function closeDatabase() {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}

export default {
  initDatabase,
  getDatabase,
  insertEvent,
  insertEpisode,
  updateEpisode,
  getEpisode,
  getRecentEpisodes,
  searchEpisodes,
  insertEmbedding,
  getEmbedding,
  upsertProject,
  getProject,
  getOrCreateSession,
  updateSession,
  endSession,
  getSessionEvents,
  getRecentEvents,
  getStats,
  closeDatabase
};
