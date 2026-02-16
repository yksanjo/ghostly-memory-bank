/**
 * Ghostly Memory Bank - Rich CLI Output
 * Beautiful terminal UI with colors, tables, and progress indicators
 */

import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import boxen from 'boxen';

export class RichCLI {
  constructor(ghostly = null) {
    this.ghostly = ghostly;
  }

  /**
   * Display recall results with rich formatting
   */
  async displayRecall(results) {
    if (!results || results.length === 0) {
      console.log(boxen(
        chalk.yellow('No relevant memories found.\n') +
        chalk.gray('Try running more commands to build your memory bank!'),
        { padding: 1, borderColor: 'yellow', title: '🔍 Search Results' }
      ));
      return;
    }

    console.log(chalk.bold.cyan('\n📚 Found Memories\n'));

    // Summary table
    const table = new Table({
      head: [
        chalk.bold('Time'),
        chalk.bold('Command'),
        chalk.bold('Project'),
        chalk.bold('Match')
      ],
      colWidths: [18, 35, 25, 10],
      style: { head: ['cyan'] }
    });

    results.slice(0, 5).forEach(r => {
      table.push([
        chalk.dim(this.formatTimeAgo(r.timestamp || r.created_at)),
        this.formatCommand(r.command || r.fix || 'unknown', r.exit_code),
        chalk.gray(this.truncate(r.project_hash || r.environment || 'unknown', 23)),
        this.confidenceBar(r.confidence || r.similarity || 0)
      ]);
    });

    console.log(table.toString());

    // Show most relevant episode in detail
    const topResult = results[0];
    const confidence = topResult.confidence || topResult.similarity || 0;
    
    if (confidence > 0.5) {
      console.log('\n' + this.formatEpisodeDetail(topResult));
    }
  }

  /**
   * Format episode detail with boxen
   */
  formatEpisodeDetail(episode) {
    const lines = [];

    lines.push(chalk.bold.green('💡 Most Relevant Episode'));
    lines.push('');
    lines.push(chalk.dim('Command:    ') + chalk.cyan(episode.command || episode.fix || 'N/A'));
    lines.push(chalk.dim('Time:       ') + this.formatTimeAgo(episode.timestamp || episode.created_at));
    lines.push(chalk.dim('Confidence: ') + this.confidenceText(episode.confidence || episode.similarity || 0));

    if (episode.problem || episode.error) {
      lines.push('');
      lines.push(chalk.dim('Problem:'));
      const problemText = episode.problem || episode.error;
      lines.push(chalk.red('  ' + problemText.split('\n')[0].substring(0, 100)));
    }

    if (episode.fix || episode.resolution_command) {
      lines.push('');
      lines.push(chalk.dim('Solution:'));
      lines.push(chalk.green('  $ ' + (episode.fix || episode.resolution_command)));

      if (episode.keywords) {
        lines.push(chalk.gray('  Keywords: ' + episode.keywords));
      }
    }

    return boxen(lines.join('\n'), {
      padding: 1,
      borderColor: 'green',
      borderStyle: 'round'
    });
  }

  /**
   * Format command with success/failure indicator
   */
  formatCommand(command, exitCode) {
    if (!command) return chalk.gray('(none)');
    
    const truncated = this.truncate(command, 32);
    if (exitCode === 0) {
      return chalk.green('✓ ') + truncated;
    } else if (exitCode !== undefined && exitCode !== null) {
      return chalk.red('✗ ') + truncated;
    }
    return chalk.cyan(truncated);
  }

  /**
   * Create confidence bar visualization
   */
  confidenceBar(confidence) {
    const width = 8;
    const filled = Math.round(confidence * width);
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);

    if (confidence > 0.8) return chalk.green(bar);
    if (confidence > 0.6) return chalk.yellow(bar);
    return chalk.red(bar);
  }

  /**
   * Format confidence as colored text
   */
  confidenceText(confidence) {
    const percent = (confidence * 100).toFixed(0) + '%';
    if (confidence > 0.8) return chalk.green(percent + ' (high)');
    if (confidence > 0.6) return chalk.yellow(percent + ' (medium)');
    return chalk.red(percent + ' (low)');
  }

  /**
   * Format timestamp as relative time
   */
  formatTimeAgo(timestamp) {
    if (!timestamp) return 'unknown';
    
    let date;
    if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      date = timestamp;
    }
    
    const now = Date.now();
    const diff = now - date.getTime();

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
  }

  /**
   * Truncate string to max length
   */
  truncate(str, length) {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length - 3) + '...';
  }

  /**
   * Display statistics with rich formatting
   */
  async displayStats(stats) {
    if (!stats) {
      stats = { events: 0, episodes: 0, projects: 0, sessions: 0 };
    }

    console.log('\n' + boxen(
      chalk.bold.cyan('📊 Memory Bank Statistics\n\n') +
      chalk.dim('Total events:     ') + chalk.white(stats.events?.toLocaleString() || '0') + '\n' +
      chalk.dim('Episodes:         ') + chalk.white(stats.episodes?.toLocaleString() || '0') + '\n' +
      chalk.dim('Projects tracked: ') + chalk.white(stats.projects?.toLocaleString() || '0') + '\n' +
      chalk.dim('Sessions:         ') + chalk.white(stats.sessions?.toLocaleString() || '0'),
      {
        padding: 1,
        borderColor: 'cyan',
        borderStyle: 'round'
      }
    ));
  }

  /**
   * Display error with rich formatting
   */
  error(message) {
    console.log(chalk.red('✗ ') + message);
  }

  /**
   * Display success message
   */
  success(message) {
    console.log(chalk.green('✓ ') + message);
  }

  /**
   * Display warning message
   */
  warn(message) {
    console.log(chalk.yellow('⚠ ') + message);
  }

  /**
   * Display info message
   */
  info(message) {
    console.log(chalk.blue('ℹ ') + message);
  }

  /**
   * Create loading spinner
   */
  spinner(text) {
    return ora({
      text,
      spinner: 'dots',
      color: 'cyan'
    });
  }

  /**
   * Display capture result
   */
  displayCaptureResult(result) {
    if (result.skipped) {
      this.warn('Skipped (command in ignore list)');
      return;
    }

    if (result.stored) {
      this.success('Event stored');
      
      if (result.significant) {
        this.info('Episode created');
      }
    }

    if (result.retrieval && result.retrieval.triggered) {
      const memories = result.retrieval.memories;
      if (memories && memories.length > 0) {
        console.log('\n' + chalk.bold.yellow('💡 Past memories found:'));
        this.displayRecall(memories);
      }
    }
  }
}

export default RichCLI;
