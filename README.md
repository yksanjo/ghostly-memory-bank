# ghostly-memory-bank

Terminal-native memory layer for developers. Ghostly captures your terminal
command events, groups them into episodes, embeds them as vectors, and lets you
recall relevant past context (e.g. "how did I fix this error last time?").
Storage is local-first: a SQLite database (`sql.js`) plus embeddings generated
**offline by default** with a local model (`Xenova/all-MiniLM-L6-v2`); OpenAI
embeddings are optional.

## Stack

- Node.js (ESM)
- `sql.js` — local SQLite storage
- `@xenova/transformers` — local, offline embeddings (OpenAI optional)
- `simple-git`, `yaml`, `chalk`/`boxen`/`ora` for the CLI
- Jest for tests

## Install

```bash
npm ci
npm run setup   # initialize the database + config
```

Configuration lives in `config.yaml`; environment overrides in `.env`
(copy `.env.example`). An `OPENAI_API_KEY` is only needed if you switch the
embedding provider to OpenAI — the default is fully local/offline.

## Usage

The `ghostly` CLI (`src/cli/index.js`) is the entrypoint. npm scripts wrap the
common subcommands:

```bash
npm run setup                        # ghostly init  — create DB + config
npm run capture -- "git push" --exit-code 1 --stderr "rejected"
npm run retrieve -- "git push failed"  # ghostly recall — find relevant memories
npm run search -- "docker build"     # keyword search over episodes
npm run stats                        # storage statistics
npm run watch                        # watch the current terminal session
npm start -- help                    # full CLI help
```

You can also run the CLI directly: `node src/cli/index.js <command>` or, once
linked, `ghostly <command>`.

## Project structure

```text
src/
  index.js              # library entrypoint (programmatic API)
  cli/index.js          # CLI entrypoint + command dispatch
  cli/rich-output.js    # formatted CLI output
  lib/config.js         # config loading (config.yaml + env)
  lib/database.js       # sql.js storage: events, episodes, embeddings
  lib/event-listener.js # event capture + episode formation
  lib/episodes.js       # episode heuristics (significance, keywords, hashing)
  lib/embedding.js      # embedding generation + similarity
  lib/retrieval.js      # trigger detection + semantic/text recall
  embeddings/local-provider.js  # local + OpenAI embedding providers
tests/                  # Jest tests
```

## Tests

```bash
npm test
```

## License

MIT — see `LICENSE`.
