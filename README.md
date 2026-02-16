# 👻 Ghostly Memory Bank

> Terminal-native memory layer that captures, indexes, and retrieves developer workflow context.

Ghostly Memory Bank is a local-first infrastructure layer that captures terminal events, extracts meaningful episodes, and provides contextual memory retrieval for developers. Built to integrate with terminals like Ghostty.

## 🎯 What It Does

- **Captures** terminal commands, errors, and context (cwd, git branch, etc.)
- **Extracts** meaningful episodes from multi-step debugging workflows
- **Indexes** memories with semantic embeddings for similarity search
- **Retrieves** past relevant episodes when similar contexts reappear
- **Suggests** next commands based on learned workflows

## 🚀 Quick Start

```bash
# Install dependencies
cd ghostly-memory-bank
npm install

# Initialize database
npm run setup
# or: node src/cli/index.js init

# Set OpenAI API key (for embeddings)
export OPENAI_API_KEY=sk-...

# Capture a terminal event
node src/cli/index.js capture "npm install" --stderr "ERROR" --exit-code 1

# Recall past episodes
node src/cli/index.js recall "webpack error"

# Search memories
node src/cli/index.js search "git commit"

# View statistics
node src/cli/index.js stats
```

## 📖 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Ghostly Memory Bank                    │
├─────────────────────────────────────────────────────────┤
│  CLI Interface                                          │
│  ├── capture  - Log terminal events                     │
│  ├── recall   - Query past episodes                     │
│  └── search   - Keyword search                          │
├─────────────────────────────────────────────────────────┤
│  Retrieval Layer                                        │
│  ├── Context detection & triggers                       │
│  ├── Semantic search (embeddings)                       │
│  ├── Confidence scoring                                 │
│  └── Command suggestions                                │
├─────────────────────────────────────────────────────────┤
│  Episode Extraction                                     │
│  ├── Error detection                                    │
│  ├── Multi-step sequence grouping                       │
│  └── Keyword extraction                                 │
├─────────────────────────────────────────────────────────┤
│  Storage Layer (SQLite)                                 │
│  ├── raw_events     - Terminal events                   │
│  ├── episodes       - Extracted episodes                 │
│  ├── embeddings     - Vector storage                    │
│  └── projects       - Project metadata                  │
└─────────────────────────────────────────────────────────┘
```

## ⚙️ Configuration

Edit `config.yaml`:

```yaml
capture:
  # Commands to ignore (noise filtering)
  ignore_commands:
    - "ls"
    - "ll"
    - "pwd"
    - "cd"

retrieval:
  # Minimum confidence to surface memories
  min_confidence: 0.75
  
  # Trigger retrieval on:
  triggers:
    on_error: true
    on_repeat_command: true
    on_project_entry: true
```

## 🔌 Ghostty Integration

This is designed to integrate with Ghostty. In production:

1. Ghostty emits terminal events (command, output, cwd)
2. Ghostly captures and processes these events
3. On errors/repeats, retrieves relevant past episodes
4. Displays inline suggestions

## 🛠️ Development

```bash
# Watch mode (placeholder for terminal integration)
npm run watch

# Run tests
npm test

# Rebuild embeddings index
npm run index
```

## 📦 API Usage

```javascript
import { capture, recall, initialize } from './src/index.js';

// Initialize
await initialize();

// Capture a terminal event
const result = await capture({
  command: 'npm run build',
  cwd: '/path/to/project',
  git_branch: 'main',
  exit_code: 1,
  stderr: 'Error: Module not found'
});

// Recall past episodes
const memories = await recall({
  command: 'npm run build',
  cwd: '/path/to/project',
  exit_code: 1,
  error: 'Module not found'
});
```

## 🔒 Privacy

- **Local-first**: All data stored locally in SQLite
- **No cloud sync**: Data never leaves your machine
- **Encrypted storage**: Optional encryption available

## 🤝 Contributing

This is MVP infrastructure. Ideas and contributions welcome!

## 📝 License

MIT
