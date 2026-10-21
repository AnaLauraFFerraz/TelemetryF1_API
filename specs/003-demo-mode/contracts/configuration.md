# Contract: configuration

## Local mode (default)

Unchanged: `WS_PORT`, `UDP_PORT`, `HTTP_PORT` required (1–65535) with today's messages; `ANTHROPIC_API_KEY` optional; `DB_PATH` optional override, otherwise `data/telemetry.db` at the repository root (now resolved from the project root, so the compiled server agrees with the source; research.md, point 8).

## Demo mode

| Variable | Required | Rule | Default |
|---|---|---|---|
| `DEMO_MODE` | to enable | `true` turns demo mode on. Unset or empty: local mode. Any other value: the server stops with a message (a typo must not silently fall back to local mode). | — |
| `PORT` | yes | Integer 1–65535. | none in the code (Render sets `10000`) |
| `DEMO_ALLOWED_ORIGIN` | yes | A single origin, `scheme://host[:port]`, with no path and no trailing slash (`new URL(value).origin === value`). | — |
| `DEMO_MAX_CONNECTIONS` | no | Integer ≥ 1. | `5` |
| `DEMO_MAX_CONNECTION_MINUTES` | no | Integer ≥ 1. | `5` |
| `DEMO_WS_COMPRESSION` | no | `true` or `false`. Unset or empty: `true`. Any other value: the server stops with a message, as for `DEMO_MODE`. `false` turns off the WebSocket's per-message deflate, the operational way out, with no code deploy, if the process CPU time in the 15-minute summary shows the instance saturated; the messages are then sent uncompressed (47.3 KiB/s instead of 6.7 KiB/s per connection, research.md point 6). | `true` |
| `DEMO_RECORDING_PATH` | no | Path to the recording. | `recordings/demo-interlagos-tt-20hz-laps6-8.jsonl` at the project root |
| `DEMO_SEED_PATH` | no | Path to the seed file. | `demo/coach-seed.json` at the project root |
| `ANTHROPIC_API_KEY` | **forbidden** | If non-empty, the server stops with a message saying demo mode does not accept it. | — |
| `DB_PATH` | **forbidden** | If non-empty, the server stops with a message: demo mode always uses an in-memory database. | — |
| `WS_PORT`, `UDP_PORT`, `HTTP_PORT` | ignored | Not read in demo mode. | — |

All messages are in Portuguese, following the existing ones in `src/config/env.ts`. Every check runs before the database is opened and before any port is bound.

## Commands

| Command | What it does |
|---|---|
| `npm run build` | `tsc -p tsconfig.build.json` into `dist/`, then `node dist/tools/fetchDemoRecording.js` (downloads and verifies the recording unless a verified copy is already there). |
| `npm start` | `node dist/src/server.js`: the compiled server, in whichever mode the environment selects. |
| `npm run dev`, `npm test`, `npm run typecheck`, `record`, `replay`, `analyze` | Unchanged. |
| `npm run export-coach-seed` | `ts-node-dev tools/exportCoachSeed.ts`: the maintainer's paid, one-off procedure (quickstart.md, section D). Never run by the CI, the tests or the agent. |
