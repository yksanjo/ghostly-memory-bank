#!/usr/bin/env node

/**
 * Ghostly Memory Bank - CLI Interface
 * Terminal-native memory layer for developers
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { loadConfig } from '../lib/config.js';
import { initDatabase, getStats, searchEpisodes } from '../lib/database.js';
import { simulateEvent, startWatching, stopWatching, getSessionInfo } from '../lib/event-listener.js';
import { retrieve, formatMemory } from '../lib/retrieval.js';
import { generateProjectHash } from '../lib/episodes.js';
import { RichCLI } from './rich-output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(path.dirname(__filename));

// Rich CLI output
const richCLI = new RichCLI();

// Track initialization state
let initialized = false;

/**
 * Ensure database is initialized
 */
async function ensureInit() {
  if (!initialized) {
    loadConfig();
    await initDatabase();
    initialized = true;
  }
}

/**
 * Print CLI help
 */
function printHelp() {
  console.log(`
👻 Ghostly Memory Bank - Terminal Memory Layer

USAGE:
  ghostly <command> [options]

COMMANDS:
  init                Initialize database and config
  capture [cmd]       Capture a terminal command event
  recall [query]      Recall past episodes  
  search [terms]      Search memories by keywords
  stats               Show storage statistics
  watch               Start watching terminal sessions
  session             Show current session info
  shell-integration   Output shell integration script
  help                Show this help message

EXAMPLES:
  ghostly init
  ghostly capture "npm install" --stderr "ERROR" --exit-code 1
  ghostly recall "webpack error"
  ghostly search "git commit"
  ghostly stats
  ghostly shell-integration  # Add to your .bashrc/.zshrc
`.trim());
}

/**
 * Initialize the database
 */
async function cmdInit() {
  console.log('🚀 Initializing Ghostly Memory Bank...\n');
  loadConfig();
  await initDatabase();
  initialized = true;
  console.log('✅ Initialization complete!');
}

/**
 * Capture a terminal command
 */
async function cmdCapture(args) {
  const command = args[0];
  
  if (!command) {
    console.error('❌ Error: Command is required');
    process.exit(1);
  }
  
  await ensureInit();
  
  // Parse remaining flags
  const options = { stderr: '', stdout: '', exitCode: 0, cwd: null, branch: null };
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '-e' || args[i] === '--stderr') options.stderr = args[++i] || '';
    else if (args[i] === '-o' || args[i] === '--stdout') options.stdout = args[++i] || '';
    else if (args[i] === '--exit-code') options.exitCode = parseInt(args[++i]) || 0;
    else if (args[i] === '-c' || args[i] === '--cwd') options.cwd = args[++i];
    else if (args[i] === '-b' || args[i] === '--branch') options.branch = args[++i];
  }
  
  console.log(`📝 Capturing: ${command}`);
  
  const result = await simulateEvent({
    command,
    cwd: options.cwd || process.cwd(),
    git_branch: options.branch || null,
    exit_code: options.exitCode,
    stdout: options.stdout,
    stderr: options.stderr
  });
  
  if (result.skipped) {
    console.log('⏭️  Skipped (command in ignore list)');
  } else if (result.stored) {
    console.log('✅ Event stored');
    if (result.significant) {
      console.log('📚 Episode created');
    }
  }
}

/**
 * Recall past episodes
 */
async function cmdRecall(args) {
  const query = args.join(' ');
  
  if (!query) {
    console.error('❌ Error: Query is required');
    process.exit(1);
  }
  
  await ensureInit();
  
  console.log(`🔍 Recall: "${query}"\n`);
  
  const context = {
    command: query,
    cwd: process.cwd(),
    exit_code: 1,  // Trigger as if it's an error
    error: '',
    project_hash: generateProjectHash(process.cwd())
  };
  
  const result = await retrieve(context);
  
  if (!result.triggered) {
    console.log('No triggers matched.');
    return;
  }
  
  if (result.memories?.length === 0) {
    console.log('No relevant memories found.');
    return;
  }
  
  console.log(`Found ${result.memories.length} memories:\n`);
  for (const memory of result.memories) {
    console.log(formatMemory(memory, 'compact'));
    console.log('');
  }
}

/**
 * Search memories
 */
async function cmdSearch(args) {
  const terms = args.join(' ');
  
  if (!terms) {
    console.error('❌ Error: Search terms required');
    process.exit(1);
  }
  
  await ensureInit();
  
  console.log(`🔎 Searching: "${terms}"\n`);
  
  const results = searchEpisodes(terms, 10);
  
  if (results.length === 0) {
    console.log('No results found.');
    return;
  }
  
  console.log(`Found ${results.length} results:\n`);
  for (const episode of results) {
    console.log(formatMemory(episode, 'compact'));
    console.log('');
  }
}

/**
 * Show statistics
 */
async function cmdStats() {
  await ensureInit();
  const stats = getStats();
  console.log(`
📊 Ghostly Memory Bank - Statistics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Events:     ${stats.events}
Episodes:   ${stats.episodes}
Projects:   ${stats.projects}
Sessions:   ${stats.sessions}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `.trim());
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === 'help' || args[0] === '-h') {
    printHelp();
    return;
  }
  
  const command = args[0];
  const commandArgs = args.slice(1);
  
  switch (command) {
    case 'init':
      await cmdInit();
      break;
    case 'capture':
    case 'c':
      await cmdCapture(commandArgs);
      break;
    case 'recall':
    case 'r':
      await cmdRecall(commandArgs);
      break;
    case 'search':
    case 's':
      await cmdSearch(commandArgs);
      break;
    case 'stats':
      await cmdStats();
      break;
    case 'watch':
      await ensureInit();
      startWatching();
      process.on('SIGINT', () => { stopWatching(); process.exit(0); });
      break;
    case 'session':
      await ensureInit();
      const info = getSessionInfo();
      console.log(`Session: ${info.sessionId}`);
      break;
    case 'shell-integration':
      // Output shell integration script
      const shellScript = path.join(__dirname, '..', '..', 'shell-integration.sh');
      if (fs.existsSync(shellScript)) {
        console.log(fs.readFileSync(shellScript, 'utf8'));
      } else {
        richCLI.error('shell-integration.sh not found');
      }
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
