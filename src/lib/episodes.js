/**
 * Ghostly Memory Bank - Episode Extraction Layer
 * Determines which events to capture as meaningful episodes
 */

import crypto from 'crypto';
import { loadConfig } from './config.js';

/**
 * Extract the base command name from a full command
 * @param {string} command - Full command string
 * @returns {string} Base command name
 */
export function getCommandName(command) {
  if (!command) return '';
  return command.trim().split(/\s+/)[0] || '';
}

/**
 * Check if a command should be ignored (noise filtering)
 * @param {string} command - Command to check
 * @returns {boolean} True if should be ignored
 */
export function shouldIgnoreCommand(command) {
  const config = loadConfig();
  const cmdName = getCommandName(command);
  return config.capture.ignore_commands.includes(cmdName);
}

/**
 * Check if output contains error patterns
 * @param {string} output - stdout or stderr text
 * @returns {boolean} True if error detected
 */
export function hasError(output) {
  if (!output) return false;
  
  const config = loadConfig();
  const lowerOutput = output.toLowerCase();
  
  return config.capture.error_patterns.some(pattern => 
    lowerOutput.includes(pattern.toLowerCase())
  );
}

/**
 * Check if output contains success patterns
 * @param {string} output - stdout or stderr text
 * @returns {boolean} True if success detected
 */
export function hasSuccess(output) {
  if (!output) return false;
  
  const config = loadConfig();
  const lowerOutput = output.toLowerCase();
  
  return config.capture.success_patterns.some(pattern => 
    lowerOutput.includes(pattern.toLowerCase())
  );
}

/**
 * Check if exit code indicates failure
 * @param {number|null} exitCode - Process exit code
 * @returns {boolean} True if exit code indicates failure
 */
export function isErrorExitCode(exitCode) {
  return exitCode !== null && exitCode !== 0;
}

/**
 * Determine if a terminal event is significant enough to store
 * @param {Object} event - Terminal event data
 * @returns {Object} { isSignificant: boolean, reason: string }
 */
export function isSignificantEvent(event) {
  // Check if it's an error
  if (isErrorExitCode(event.exit_code)) {
    return { isSignificant: true, reason: 'error_exit' };
  }
  
  if (hasError(event.stderr_text)) {
    return { isSignificant: true, reason: 'error_in_stderr' };
  }
  
  if (hasError(event.stdout_text)) {
    return { isSignificant: true, reason: 'error_in_stdout' };
  }
  
  // Check if it's a command we should track (not in ignore list)
  if (!shouldIgnoreCommand(event.command)) {
    // But still check if it's meaningful
    const cmdName = getCommandName(event.command);
    
    // Known important command patterns
    const importantCommands = [
      'git', 'npm', 'yarn', 'pnpm', 'docker', 'kubectl',
      'python', 'pip', 'cargo', 'go', 'make', 'cmake',
      'bundle', 'rake', 'gradle', 'mvn', 'javac', 'node',
      'tsc', 'eslint', 'prettier', 'jest', 'pytest',
      'curl', 'wget', 'ssh', 'scp', 'rsync',
      'psql', 'mysql', 'mongosh', 'redis-cli'
    ];
    
    if (importantCommands.includes(cmdName)) {
      return { isSignificant: true, reason: 'important_command' };
    }
  }
  
  return { isSignificant: false, reason: null };
}

/**
 * Generate a project hash from directory path
 * @param {string} cwd - Current working directory
 * @returns {string} Project hash
 */
export function generateProjectHash(cwd) {
  if (!cwd) return 'unknown';
  
  // Find the project root (look for package.json, Cargo.toml, go.mod, etc.)
  const markers = [
    'package.json',      // Node.js
    'Cargo.toml',        // Rust
    'go.mod',            // Go
    'pyproject.toml',    // Python
    'requirements.txt',  // Python
    'Gemfile',           // Ruby
    'pom.xml',           // Java
    'build.gradle',      // Java/Kotlin
    'CMakeLists.txt',    // C/C++
    'Makefile',          // Generic
    '.git'               // Git repo
  ];
  
  const pathParts = cwd.split('/');
  
  // Walk up from current directory to find project root
  for (let i = pathParts.length; i >= 1; i--) {
    const testPath = pathParts.slice(0, i).join('/');
    const lastPart = pathParts[i - 1];
    
    // Skip common non-project directories
    if (['node_modules', '.git', 'vendor', 'venv', 'dist', 'build'].includes(lastPart)) {
      continue;
    }
    
    // Use directory name as project identifier
    if (lastPart && lastPart[0] !== '.') {
      return crypto.createHash('md5').update(testPath).digest('hex').substring(0, 8);
    }
  }
  
  // Fallback: hash the full path
  return crypto.createHash('md5').update(cwd).digest('hex').substring(0, 8);
}

/**
 * Extract keywords from command and output
 * @param {Object} event - Terminal event
 * @returns {string} Comma-separated keywords
 */
export function extractKeywords(event) {
  const keywords = new Set();
  
  // Add command name
  const cmdName = getCommandName(event.command);
  if (cmdName) {
    keywords.add(cmdName);
  }
  
  // Add git-related keywords
  if (event.command?.includes('git')) {
    const gitSubcommands = ['push', 'pull', 'commit', 'merge', 'rebase', 'checkout', 'branch'];
    gitSubcommands.forEach(sub => {
      if (event.command.includes(sub)) {
        keywords.add(`git-${sub}`);
      }
    });
  }
  
  // Add package manager keywords
  if (event.command?.includes('npm') || event.command?.includes('yarn') || event.command?.includes('pnpm')) {
    const npmActions = ['install', 'run', 'build', 'test', 'start', 'dev'];
    npmActions.forEach(action => {
      if (event.command.includes(action)) {
        keywords.add(action);
      }
    });
  }
  
  // Add error keywords from stderr
  if (event.stderr_text) {
    const errorPatterns = [
      'error', 'fail', 'exception', 'ENOENT', 'EACCES', 'ECONNREFUSED',
      'timeout', 'invalid', 'undefined', 'null', 'cannot', 'unable'
    ];
    
    errorPatterns.forEach(pattern => {
      if (event.stderr_text.toLowerCase().includes(pattern)) {
        keywords.add(pattern);
      }
    });
  }
  
  // Add directory context
  if (event.cwd) {
    const pathParts = event.cwd.split('/');
    const projectDir = pathParts[pathParts.length - 1];
    if (projectDir && projectDir.length > 1) {
      keywords.add(projectDir);
    }
  }
  
  return Array.from(keywords).join(', ');
}

/**
 * Parse command to extract arguments
 * @param {string} command - Full command
 * @returns {Object} Parsed command parts
 */
export function parseCommand(command) {
  if (!command) return { name: '', args: [], raw: '' };
  
  const parts = command.trim().split(/\s+/);
  const name = parts[0] || '';
  const args = parts.slice(1);
  
  return { name, args, raw: command };
}

/**
 * Detect if this is a repeated command (within 24 hours)
 * @param {Object} event - Current event
 * @param {Array} recentEvents - Recent events from DB
 * @returns {boolean} True if command was run recently
 */
export function isRepeatedCommand(event, recentEvents) {
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  const eventTime = new Date(event.timestamp).getTime();
  
  if (eventTime < oneDayAgo) return false;
  
  const currentCmdName = getCommandName(event.command);
  
  return recentEvents.some(e => {
    const prevCmdName = getCommandName(e.command);
    return prevCmdName === currentCmdName && 
           e.project_hash === event.project_hash;
  });
}

/**
 * Create episode summary from event
 * @param {Object} event - Terminal event
 * @returns {Object} Episode data
 */
export function createEpisodeFromEvent(event) {
  let problem = '';
  let environment = '';
  let fix = '';
  
  // Extract problem from stderr/stdout
  if (event.stderr_text) {
    // Take first few lines of error
    const errorLines = event.stderr_text.split('\n').slice(0, 3);
    problem = errorLines.join(' ').substring(0, 500);
  } else if (event.exit_code !== 0) {
    problem = `Command exited with code ${event.exit_code}`;
  }
  
  // Build environment context
  const envParts = [];
  if (event.cwd) envParts.push(`dir: ${event.cwd}`);
  if (event.git_branch) envParts.push(`branch: ${event.git_branch}`);
  environment = envParts.join(', ');
  
  // Fix is the command itself (for now)
  fix = event.command;
  
  // Generate summary
  const cmdName = getCommandName(event.command);
  const summary = `${cmdName} - ${problem || 'success'} (${event.cwd || 'unknown'})`;
  
  return {
    project_hash: event.project_hash,
    summary,
    problem,
    environment,
    fix,
    keywords: extractKeywords(event),
    embedding_id: null
  };
}

/**
 * Group events into multi-step episodes
 * @param {Array} events - Array of terminal events
 * @returns {Array} Array of episodes
 */
export function groupEventsIntoEpisodes(events) {
  if (!events || events.length === 0) return [];
  
  const config = loadConfig();
  const episodes = [];
  let currentEpisode = [];
  let episodeStartTime = null;
  
  for (const event of events) {
    const eventTime = new Date(event.timestamp).getTime();
    
    // Start new episode if:
    // 1. No current episode
    // 2. Too much time has passed
    // 3. Different project
    
    const timeWindow = config.capture.sequence_window * 60 * 1000; // Convert to ms
    
    if (!episodeStartTime || 
        (eventTime - episodeStartTime > timeWindow) ||
        event.project_hash !== currentEpisode[0]?.project_hash) {
      
      // Save previous episode if it has enough events
      if (currentEpisode.length >= config.capture.min_sequence_length) {
        episodes.push(currentEpisode);
      }
      
      currentEpisode = [event];
      episodeStartTime = eventTime;
    } else {
      currentEpisode.push(event);
    }
  }
  
  // Don't forget the last episode
  if (currentEpisode.length >= config.capture.min_sequence_length) {
    episodes.push(currentEpisode);
  }
  
  return episodes;
}

/**
 * Create episode summary from multiple events
 * @param {Array} events - Group of related events
 * @returns {Object} Episode data
 */
export function createEpisodeFromEvents(events) {
  if (!events || events.length === 0) return null;
  
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  
  // Find the error event (if any)
  const errorEvent = events.find(e => isErrorExitCode(e.exit_code) || hasError(e.stderr_text));
  const successEvent = events.find(e => hasSuccess(e.stdout_text) || hasSuccess(e.stderr_text));
  
  let problem = '';
  if (errorEvent?.stderr_text) {
    problem = errorEvent.stderr_text.split('\n').slice(0, 3).join(' ');
  } else if (errorEvent?.exit_code) {
    problem = `Commands failed with exit code ${errorEvent.exit_code}`;
  }
  
  // The "fix" is the sequence of commands that eventually led to success
  const fixCommands = events.map(e => e.command).join(' → ');
  
  const environment = [
    firstEvent.cwd ? `cwd: ${firstEvent.cwd}` : '',
    firstEvent.git_branch ? `branch: ${firstEvent.git_branch}` : ''
  ].filter(Boolean).join(', ');
  
  const summary = `Multi-step workflow: ${events.length} commands${problem ? ` - ${problem.substring(0, 100)}` : ''}`;
  
  return {
    project_hash: firstEvent.project_hash,
    summary,
    problem: problem || null,
    environment,
    fix: fixCommands,
    keywords: extractKeywords(firstEvent),
    embedding_id: null
  };
}

export default {
  getCommandName,
  shouldIgnoreCommand,
  hasError,
  hasSuccess,
  isErrorExitCode,
  isSignificantEvent,
  generateProjectHash,
  extractKeywords,
  parseCommand,
  isRepeatedCommand,
  createEpisodeFromEvent,
  groupEventsIntoEpisodes,
  createEpisodeFromEvents
};
