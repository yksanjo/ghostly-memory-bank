# 👻 Ghostly Memory Bank

> Terminal-native memory layer that captures, indexes, and retrieves developer workflow context. Works offline with local embeddings!

Ghostly Memory Bank is a local-first infrastructure layer that captures terminal events, extracts meaningful episodes, and provides contextual memory retrieval for developers. Built to integrate with terminals like Ghostty.

## ✨ New: Works Offline!

Ghostly now uses **local embeddings** (transformers.js) by default - no API key required! Works completely offline after first model download.

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

# Capture a terminal event (works offline - no API key needed!)
node src/cli/index.js capture "npm install" --stderr "ERROR" --exit-code 1

# Recall past episodes
node src/cli/index.js recall "webpack error"

# Search memories
node src/cli/index.js search "git commit"

# View statistics
node src/cli/index.js stats
```

## 🔌 Shell Integration (Auto-Capture)

Enable automatic command capture in your shell:

```bash
# Add to your ~/.bashrc or ~/.zshrc
echo 'eval "$(ghostly shell-integration)"' >> ~/.bashrc
source ~/.bashrc
```

Or manually:
```bash
# Output the integration script
node src/cli/index.js shell-integration
```

## 📖 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Ghostly Memory Bank                    │
├─────────────────────────────────────────────────────────┤
│  CLI Interface                                         │
│  ├── capture  - Log terminal events                    │
│  ├── recall   - Query past episodes                    │
│  ├── search   - Keyword search                         │
│  └── shell-integration - Auto-capture for bash/zsh    │
├─────────────────────────────────────────────────────────┤
│  Embedding Layer (Local/Offline!)                      │
│  ├── transformers.js (Xenova/all-MiniLM-L6-v2)        │
│  ├── OpenAI fallback (optional)                        │
│  └── Caching for performance                           │
├─────────────────────────────────────────────────────────┤
│  Retrieval Layer                                       │
│  ├── Context detection & triggers                      │
│  ├── Semantic search (embeddings)                      │
│  ├── Confidence scoring                                │
│  └── Command suggestions                               │
├─────────────────────────────────────────────────────────┤
│  Episode Extraction                                    │
│  ├── Error detection                                  │
│  ├── Multi-step sequence grouping                      │
│  └── Keyword extraction                               │
├─────────────────────────────────────────────────────────┤
│  Storage Layer (SQLite)                                │
│  ├── raw_events     - Terminal events                  │
│  ├── episodes       - Extracted episodes               │
│  ├── embeddings     - Vector storage                  │
│  └── projects       - Project metadata                │
└─────────────────────────────────────────────────────────┘
```

## ⚙️ Configuration

Edit `config.yaml`:

```yaml
# Embeddings - uses local by default (no API key needed!)
embedding:
  provider: "local"  # or "openai" for cloud embeddings
  local_model: "Xenova/all-MiniLM-L6-v2"
  batch_size: 32

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

## 📱 Use Cases

### Remember Debugging Solutions
```bash
# You ran this and it failed:
ghostly capture "npm run build" --stderr "Error: Module not found" --exit-code 1

# Later, when it fails again:
ghostly recall "npm run build"
# → Finds your past error and solution!
```

### Learn Common Workflows
Ghostly detects patterns like:
- `npm install → npm run build → npm test`
- `docker build → docker run → docker logs`

### Project-Specific Memory
Each project gets its own memory bank, so suggestions are context-aware.

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
import { capture, recall, initialize, createEmbeddingProvider } from './src/index.js';

// Initialize (uses local embeddings by default)
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
- **Offline mode**: Works without internet after initial model download
- **Optional encryption**: Enable in config.yaml

## 🤝 Contributing

This is MVP infrastructure. Ideas and contributions welcome!

## 📝 License

MIT
