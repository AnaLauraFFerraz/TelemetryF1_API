# Research: Demo mode for a public demonstration

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-21

Every point gives the evidence first (command output, or the official documentation with its link and the date it was read), then the decision. Commands were run on the maintainer's machine (Windows 11, Node 22.23.1, Intel i7-9750H), from the `003-demo-mode` branch. No paid call was made. Nothing touched `data/telemetry.db`: the measurements use `:memory:` or a temporary file in the session's scratch folder, and the scripts refuse `data/telemetry.db` explicitly. The measurement scripts are versioned in [evidence/](evidence/) so they can be re-run; the published recording was downloaded into an empty scratch folder by [evidence/fetch-recording.mjs](evidence/fetch-recording.mjs).

Documentation pages were read on **2026-10-21**. Render articles (under `render.com/articles/`) are Render's own content but not the reference documentation; they are cited as such.

---

## 1. The hosting platform (Render, free web service)

### Evidence

| Topic | What the official source says | Source |
|---|---|---|
| Single port | "Render forwards inbound traffic to only *one* HTTP port per web service." "always bind your public HTTP server to the value of the `PORT` environment variable." Bind on host `0.0.0.0`. "The default value of `PORT` is `10000`." | [Web Services](https://render.com/docs/web-services); [Default Environment Variables](https://render.com/docs/environment-variables) |
| Spin-down | "Render spins down a Free web service that goes 15 minutes without receiving any inbound traffic." "This includes both HTTP requests and WebSocket messages from existing connections." Spin-up "takes about one minute". | [Deploy for Free](https://render.com/docs/free) |
| WebSocket messages as activity | Changelog of **2026-02-24**: free web services "now spin down after going 15 minutes without receiving *either*" an incoming HTTP request or "An incoming WebSocket message from an existing connection". "Previously, only incoming HTTP requests delayed spindown." It does not mention messages sent by the server, nor ping/pong control frames. | [Changelog](https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages) |
| Instance hours | "750 Free instance hours" per workspace per calendar month; spun-down services do not consume them; when they run out, all Free web services are suspended until the next month. | [Deploy for Free](https://render.com/docs/free) |
| CPU and memory | Plan `free`: "0.1 CPU", "512 MB". | [Compute Plans](https://render.com/docs/compute-plans) |
| Outbound bandwidth | Hobby workspace: **5 GB per month** included; "$0.15 per GB" beyond it. HTTP responses and WebSocket messages sent to the public internet count; inbound traffic does not. Free page: without a payment method, Render "suspends all of your Free services for the remainder of the month". Render "may suspend a Free web service that initiates an uncommonly high volume of traffic". | [Outbound Bandwidth](https://render.com/docs/outbound-bandwidth); [Deploy for Free](https://render.com/docs/free) |
| WebSocket | "Render does not enforce a maximum duration for WebSocket connections." Connections "close automatically when the instance is replaced (for example, during a deploy)"; `SIGTERM` then a 30-second grace period. Outbound WebSocket messages count as outbound bandwidth. | [WebSockets on Render](https://render.com/docs/websocket) |
| Temporary disk | Ephemeral filesystem: local changes, "such as uploads or SQLite files", are lost on redeploy, restart or spin-down. No persistent disk on Free. "Render might restart a Free web service at any time." | [Deploy for Free](https://render.com/docs/free) |
| Health checks | GET to a configured path "every few seconds"; any `2xx`/`3xx` is healthy, must answer within five seconds; without a path, a TCP probe on the port. During a deploy, traffic is not routed to the new instance until it passes; after 15 minutes Render cancels the deploy and keeps the existing one. On a running service: 15 s of failures stop routing, 60 s restart the instance. The page does not say whether Free services support it (the service creation steps list it under Advanced). | [Health Checks](https://render.com/docs/health-checks) |
| Deploys | A failed build or deploy leaves the last good deploy running, "with zero downtime". Build command timeout 120 min, start command 15 min. The page does not say explicitly that build outputs are present at run time. | [Deploying on Render](https://render.com/docs/deploys) |
| Build environment | `NODE_ENV` is `production` "(runtime only)"; the other default variables are available at build time and run time. | [Default Environment Variables](https://render.com/docs/environment-variables) |
| Client IP | Reference docs: no page found that names the header or the number of proxies. Render article (2026-04-01): traffic "passes through Cloudflare's global network" and "Render's load balancers"; "read the client IP from `x-forwarded-for`". Render article (2026-07-08): "Cloudflare appends to `X-Forwarded-For` rather than replacing it, so a caller who sends their own copy of the header controls the leftmost entry"; it recommends `CF-Connecting-IP`, which Cloudflare "overwrites whatever the caller sent". Neither gives a hop count. | [How Render handles DDoS attacks](https://render.com/articles/how-render-handles-ddos-attacks); [Host PocketBase on Render](https://render.com/articles/host-pocketbase-on-render) |

### Consequences

- **One port.** REST and WebSocket share the `PORT` the platform gives (point 5).
- **Sleep and the connection time limit.** Only messages *received* by the service keep it awake. In this project the browser sends nothing but the automatic pong replies to the server's 15-second pings; whether a pong counts as a "WebSocket message" is not documented. Either way, the 5-minute limit (FR-024) ends every connection, so an abandoned tab keeps the instance awake for at most 5 minutes plus the 15-minute idle window. Instance hours: a month has at most 744 hours, below the 750 included, so one service running all month fits **if it is the only Free web service in the workspace**; the hours become a risk only with other Free services in the same workspace.
- **Bandwidth is the binding limit.** 5 GB per month, and a suspension (not a charge) without a payment method. At the clarified settings (single car, uncompressed, 10 minutes), a full visit cost about 27.6 MiB of live stream plus 1.1–1.7 MB of REST, about 30 MB, so the allowance covered only **about 165–175 full visits a month**. With the settings decided at the plan review (T-3: per-message deflate and 5 minutes; 20 Hz kept), recomputed from the measurements of points 6 and 9:

  | Part of a full visit | Bytes |
  |---|---|
  | Live stream, 5 minutes at 6.7 KiB/s on the wire | 2,010 KiB ≈ **2.06 MB** |
  | REST, history + session + 2 laps (8, 7) + 2 coach answers | 1.14 MB uncompressed, about 0.17 MB with the platform's Brotli/gzip |
  | REST, the same with 3 laps (8, 7, 6) | 1.70 MB uncompressed, about 0.27 MB compressed |
  | **Total per full visit** | **about 2.2–2.3 MB** if bandwidth is counted after the platform's compression; **about 3.2–3.8 MB** if before |

  **5 GB therefore covers roughly 1,330–2,410 full visits a month**: about 1,330–1,680 if REST is counted uncompressed, about 2,150–2,410 if compressed (each range spans the 10⁹ / 2³⁰ reading of "GB", which the page does not define, and 2 or 3 laps). The documentation does not say whether bandwidth is counted before or after the platform's compression (point 9). The coach answers (about 10 KB each: 3.7–6.4 KB of insights plus the text) and response headers are small against the stream and not itemized. A visitor who reconnects after the 5 minutes spends another 2.06 MB per connection.
- **CPU.** 0.1 CPU. Every local timing in this file is on a full core of an i7-9750H; on the instance, the same work takes on the order of ten times longer (an estimate, not a measurement: the deploy is out of scope). The heaviest steady cost is the WebSocket compression, 1.1–1.2% of a local core per client (point 6), so roughly 11–12% of the instance per client and 55–60% with all 5 connections open, on top of the loop itself (estimates). FR-028's "time until ready" line and the summary's process CPU time measure both on the platform.
- **Disk.** Nothing written at run time survives; the demo database lives in memory (point 3).
- **Health check.** The server listens only once the demo is ready (point 3), so both the TCP probe and an HTTP probe of the health path fail until then and succeed after; a deploy that never becomes ready is cancelled and the previous one keeps serving.
- **Build.** `NODE_ENV` is unset during the build, so `npm ci` installs the devDependencies (TypeScript) the build needs.
- **FR-027 (per-IP limit) is not adopted.** The maintainer's condition was that the plan confirm how the platform forwards the visitor's address and configure the proxy trust with the exact number of hops. The reference documentation does not state either; the two Render articles name at least two proxy layers (Cloudflare and Render's load balancer) without a count, and say the leftmost `X-Forwarded-For` entry is caller-controlled. A hop count cannot be confirmed from the documentation, and verifying it empirically needs a deployed instance (out of scope). Per the clarification, only the HTTP caching (FR-026) applies, and this is the recorded reason. The `CF-Connecting-IP` route is a different mechanism from the one the maintainer specified; it was put to the maintainer as T-6 and not adopted (plan review, 2026-10-21).

---

## 2. The recording on the server

### Evidence

```text
$ node specs/003-demo-mode/evidence/fetch-recording.mjs <empty scratch folder>/demo.jsonl
status 200, final host release-assets.githubusercontent.com, content-length 25173414
bytes 25173414, download 4206 ms, sha256 55 ms
sha256 c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033, matches README: true
missing asset: status 404
```

(A first run, before the script was versioned, took 5,828 ms to download and 72 ms to hash, with the same result.) Node 22's built-in `fetch` follows GitHub's redirect to `release-assets.githubusercontent.com`; `node:crypto` computes the SHA-256. No dependency is needed.

### Decision

- A build-time tool, `tools/fetchDemoRecording.ts`, downloads the asset into `recordings/demo-interlagos-tt-20hz-laps6-8.jsonl` (gitignored), verifies the SHA-256 against the constant `PUBLISHED_RECORDING_SHA256` (the README's value), writes to a temporary name and renames only after the hash matches, and exits non-zero with a clear message on a non-2xx status, a network error or a mismatch. If a file with the right hash is already there, it does nothing (local runs do not download twice).
- The build fails on any of those errors, and Render keeps the previous deploy running ([Deploying on Render](https://render.com/docs/deploys)).
- At start, demo mode **always** re-verifies the hash (55–72 ms locally) and **refuses to start** if the file is missing or different; it never downloads at start (T-4, decided at the plan review).
- A unit test asserts that `README.md` contains `PUBLISHED_RECORDING_SHA256`, so the two cannot drift apart.

### Alternatives considered

- **Download at every start, or only when missing**: about 4–6 s locally per wake (more on 0.1 CPU) and a dependency on GitHub being reachable at a wake. Rejected (T-4).
- **Commit the recording**: forbidden by FR-007 and the project rules (25.2 MB).

---

## 3. The replay inside the process, the complete session before "ready", and where the database lives

### Evidence

```text
$ npx ts-node --transpile-only --project tsconfig.json specs/003-demo-mode/evidence/measure-preload.ts <recording> :memory:
start: rss 82.6 MiB, heapUsed 37.1 MiB, external 11.8 MiB
read+decode 13960 packets: 121 ms; missing receivedAt: 0
after decode: rss 143.4 MiB, heapUsed 65.3 MiB, external 25.6 MiB
[db] usando banco em :memory:
in-process preload: 282 ms
after preload: rss 171.0 MiB, heapUsed 90.2 MiB, external 25.6 MiB
laps [{"lap_number":6,"lap_time_ms":74306,"sector1_ms":19307,"sector2_ms":38182,"sector3_ms":16817,"is_valid":0,...},
      {"lap_number":7,"lap_time_ms":74144,"sector1_ms":18310,"sector2_ms":37654,"sector3_ms":18180,"is_valid":1,...},
      {"lap_number":8,"lap_time_ms":73372,"sector1_ms":18474,"sector2_ms":37573,"sector3_ms":17325,"is_valid":1,...}]
car samples per lap [{"lap_number":6,"n":797},{"lap_number":7,"n":801},{"lap_number":8,"n":793},{"lap_number":9,"n":20}]
motion samples per lap [{"lap_number":6,"n":797},{"lap_number":7,"n":801},{"lap_number":8,"n":793},{"lap_number":9,"n":20}]
totals {"car":2411,"motion":2411}
db size 0.67 MiB; journal_mode memory
[sessionContext] reinício de passada detectado na sessão 1 (overallFrameIdentifier caiu de 14111 para 9635) - reiniciando estado em memória
second pass (same process): 218 ms; counts after {"sessions":1,"laps":3,"car":2411,"motion":2411}

$ ... measure-preload.ts <recording> <scratch>/tmpdb2/preload.db
in-process preload: 718 ms
after preload: rss 165.3 MiB, heapUsed 71.4 MiB, external 27.8 MiB
db size 0.67 MiB; journal_mode wal
```

- Feeding every packet through the real `dispatchPacket` and `persistTelemetry`, as fast as possible, stores exactly what a `1x` UDP replay stores: **2,411 car telemetry and 2,411 motion samples**, the ground truth of spec 001 ([baseline-measurement.md](../001-realtime-replay/baseline-measurement.md)), and the laps, times, sectors and validity in the README. Decimation keys on the game's `sessionTime` and lap distance, not on wall-clock arrival, so speed does not change what is kept; the loss of `--speed=max` came from the UDP receive buffer, which an in-process feed does not have.
- A second pass in the same process changes nothing (dedup by `overallFrameIdentifier`, lap upsert), and the existing pass-restart detection fires as designed.
- In memory, the build takes 282 ms; with a temporary file in WAL mode, 718 ms. The database is 0.67 MiB either way. Peak RSS is about 171 MiB, of which about 80 MiB is ts-node's own baseline (the `start` line); the compiled server needs less. Both fit in 512 MB.
- Estimated on 0.1 CPU (about ten times the local numbers, not measured): read and decode about 1.2 s, hash about 0.6 s, build about 3 s; a few seconds in all, against the platform's one-minute wake.

### Decisions

- **Reuse, no socket.** A new `src/demo/` module reads the recording once (keeping the decoded `RecordedPacket[]` in memory, about 25 MiB), builds the session by calling `dispatchPacket` + `persistTelemetry` for every packet, then starts `runReplay` (spec 001, unchanged) with `{ speed: "1x", loop: true }` and an `io.send` that dispatches the buffer in-process. No UDP socket is created (FR-006).
- **Order at start**: validate the demo configuration → verify the recording's hash → open the database → build the whole session → write the capture times (point 4) → seed the coach cache (point 7) → switch the connection to read-only (see below) → start listening on `PORT` → start the `1x` loop → "ready". The server answers no request before that, because it is not listening yet (FR-009). Render holds and retries during the wake; the health check fails until the port is open.
- **Database in memory** (`:memory:`). It cannot be the real file, it is new on every start by construction, nothing on the temporary disk can be reused by mistake (FR-004), and it is faster. A temporary file was measured (718 ms vs 282 ms) and brings only a file to delete on each start. `dbPath.ts`, the only configuration file persistence imports, returns `:memory:` in demo mode, and demo mode refuses to start if `DB_PATH` is also set, so the two can never be combined by mistake.
- **The loop does not persist** (T-1, decided at the plan review; FR-005 reworded accordingly). After the build, every further write would be a no-op (identical lap upserts, ignored samples) plus `last_seen_at` refreshes, which FR-010 forbids. With a broadcast-only loop, the database is complete before "ready" and never written again, which lets the connection be switched to `PRAGMA query_only = ON` after seeding: any write from any code path then fails inside SQLite, a guarantee for FR-015 that does not depend on reviewing every route.

### Alternatives considered

- **Persist in the loop too** (FR-005 as first written): requires suppressing `touchSession` in demo mode inside `sessionContext.ts`, keeps writes running forever for no data gain, and rules out `query_only`.
- **Listen early and answer 503 while building**: a visitor who wakes the instance would get an error instead of waiting a few more seconds.

---

## 4. Dates from `receivedAt`, for the session and its laps

### Evidence

From the same run of `measure-preload.ts`:

```text
capture times: first 2026-10-16T16:30:23.797Z last 2026-10-16T16:34:06.755Z span 222.958 s
lap completed at [{"lap":6,"at":"2026-10-16T16:31:38.248Z"},{"lap":7,"at":"2026-10-16T16:32:52.362Z"},{"lap":8,"at":"2026-10-16T16:34:05.758Z"}]
sessions [{"id":1,...,"started_at":"2026-10-21T20:22:29.051Z","last_seen_at":"2026-10-21T20:22:29.051Z"}]
```

```text
$ node -e "<reads timestampMs and receivedAt of every line of the recording>"
first [ 0, 1792168223797 ] last [ 222839, 1792168446755 ] timestamp span 222839 receivedAt span 222958 offset min 1792168219812 max 1792168223917
```

- Every one of the 13,960 lines has `receivedAt`. Without intervention, the build writes the wall-clock time of the build (2026-10-21 above), which is what FR-010 forbids.
- The capture-time span is **222.958 s**, not the 222.8 s in the README (which is the `timestampMs` span). The difference between `receivedAt` and `timestampMs` is not constant across the file (it varies by about 4.1 s), so the two fields were not produced from one clock reading in the published file; the cut it was made from is not in this repository and was not investigated. FR-010 names `receivedAt`, so the session shows 222.958 s, displayed by the frontend as `Math.round(3.716)` = **4 min**, as SC-010 expects. The spec's "222.8 s" in Story 2, scenario 3, is corrected in the same commit as this plan (see the plan's spec amendments).
- `strftime('%Y-%m-%dT%H:%M:%fZ','now')` and `Date.prototype.toISOString()` produce the same format (`2026-10-21T20:22:29.051Z`, `2026-10-16T16:30:23.797Z`), so capture times written from JavaScript are indistinguishable in shape from the times SQLite writes today.

### Decision

- `persistTelemetry` returns the lap that a lap data packet completed (`CompletedLap | null`, today discarded inside `handleLapDataPacket`). `server.ts` ignores the return value, so local mode is unchanged; the demo build records `lapNumber → receivedAt` of the completing packet.
- A pure function `buildCaptureTimes(firstReceivedAt, lastReceivedAt, completions)` returns the session's start and last-seen times and each lap's recorded time as ISO strings; it throws when any of them is missing (FR-010: refuse rather than invent). "First" and "last" are the first and last packets carrying the session's UID.
- A new repository function, `applyCaptureTimes(sessionId, times)`, writes them with two prepared statements (`UPDATE sessions SET started_at, last_seen_at`; `UPDATE laps SET recorded_at`), called once by the demo build before seeding. No existing statement changes, so local mode keeps SQLite's wall-clock defaults.

### Alternatives considered

- **An injectable clock inside the repositories**: touches every insert statement and `sessionContext`'s touch interval, which local mode uses, for the same result.

---

## 5. REST and WebSocket on the same port

### Evidence

- Installed versions: `ws` 8.18.0, `express` 5.2.1, `cors` 2.8.6, `typescript` 5.6.3 (`node -p "require('ws/package.json').version ..."`).
- `ws` README (`node_modules/ws/README.md`, section "Client authentication") shows the pattern: `new WebSocketServer({ noServer: true })`, `server.on('upgrade', ...)`, reject with `socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy()`, accept with `wss.handleUpgrade(...)`.
- `ws` defaults `perMessageDeflate: false` (`node_modules/ws/lib/websocket-server.js`, line 67), so no compression happens today.
- Valid close codes in `ws` (`node_modules/ws/lib/validation.js`, `isValidStatusCode`): 1000–1014 except 1004–1006, and 3000–4999. RFC 6455 §7.4.2 reserves 4000–4999 for private use.

### Decisions

- **Local mode**: unchanged, a standalone `WebSocketServer` on `WS_PORT` and Express on `HTTP_PORT`.
- **Demo mode**: one `http.Server` created from the Express app, listening on `PORT` and `0.0.0.0`; the `WebSocketServer` uses `noServer: true`, and the server's `upgrade` handler decides:
  1. `Origin` present and different from `DEMO_ALLOWED_ORIGIN` (exact match): answer `403 Forbidden` and destroy the socket, before any WebSocket exists (FR-018). `Origin` absent (a non-browser client): accepted, since the rule only limits browsers.
  2. Otherwise `handleUpgrade`. If the number of open connections is already at `DEMO_MAX_CONNECTIONS` (default 5), close the new socket at once with **4001** and reason `"demo full"` (FR-023); the browser receives the code and reason in its `close` event, which a refused handshake would not give it.
  3. Otherwise register it, and start a timer of `DEMO_MAX_CONNECTION_MINUTES` (default 10) that closes it with **4002** and reason `"time limit"` (FR-024); the timer is cleared on close.
- The existing 15-second ping/pong heartbeat is kept in both modes.
- The decisions on whether to accept, refuse with 4001 or close with 4002 are pure functions (origin check, capacity check), unit-tested; the wiring is covered by the integration test (plan, test strategy).

---

## 6. The message with only the player's car

### Evidence

```text
$ npx ts-node --transpile-only --project tsconfig.json specs/003-demo-mode/evidence/measure-ws-volume.ts <recording>
lapData: 4458 msgs, avg 16938 B, 330.9 KiB/s
motion: 4458 msgs, avg 10192 B, 199.1 KiB/s
carTelemetry: 4458 msgs, avg 13391 B, 261.6 KiB/s
all 22 cars: 13374 msgs per pass, 172.3 MiB per pass, 791.6 KiB/s, 2.72 GiB/h
deflate per message, default level: 79.9 KiB/s (9.9x), CPU 0.826% of one core
deflate per message, level 1: 90.4 KiB/s, CPU 0.547% of one core
player car only: 47.1 KiB/s; deflated 24.2 KiB/s, CPU 0.289% of one core
span 222.8 s
```

- The frontend reads only `message.data[message.playerCarIndex]` (`Telemetry-F1/src/context/TelemetryProvider.tsx`, line 51, read-only).

### Decision

- A pure function `toPlayerOnlyMessage(message)` returns the same envelope with `data: [data[playerCarIndex]]` and `playerCarIndex: 0`; the demo's broadcast applies it to every message (FR-025). Local mode broadcasts the full array as today.
- Measured: 47.1 KiB/s per connection instead of 791.6 KiB/s before compression (47.3 KiB/s on the wire with frames); compressed, see below.
- **Where the README documents it**: the Features bullet "Live WebSocket stream of motion, lap data and car telemetry (all 22 cars per message)" gains "in demo mode, only the player's car, with `playerCarIndex` 0"; the "Contract ownership" paragraph under "Technical decisions and trade-offs" gains a sentence that the demo's message content differs and that the frontend must read the car through `playerCarIndex`; and the new "Demo mode" section lists every demo difference (contract summary in [contracts/websocket.md](contracts/websocket.md)).
### Compression of the single-car message (T-3, decided at the plan review)

The figure above (24.2 KiB/s at 0.289% of a core) came from compressing each message independently with `deflateRawSync`. The real library behaves differently, so it was measured with `ws` itself: a server and a client on loopback, one full pass of single-car messages sent without pauses, the bytes taken from the server socket's `bytesWritten` (frames included), and, in the "server only" runs, the client in a separate process ([evidence/ws-sink.mjs](evidence/ws-sink.mjs)) so that the CPU is only the server's:

```text
$ npx ts-node --transpile-only --project tsconfig.json specs/003-demo-mode/evidence/measure-compression.ts <recording>
player-only lapData: avg 917 B per message
player-only motion: avg 688 B per message
player-only carTelemetry: avg 804 B per message
ws server only, uncompressed: 10.29 MiB per pass, 47.3 KiB/s at 1x, server CPU 313 ms per pass (0.140% of one core at 1x)
ws server only, perMessageDeflate (defaults: context takeover): 1.46 MiB per pass, 6.7 KiB/s at 1x, server CPU 2765 ms per pass (1.241% of one core at 1x)
ws server only, perMessageDeflate, zlib level 1: 1.68 MiB per pass, 7.7 KiB/s at 1x, server CPU 2562 ms per pass (1.150% of one core at 1x)
(second run) uncompressed 0.119%; defaults 1.220%; level 1 1.045%
ws perMessageDeflate threshold 0, no context takeover: ... 5.33 MiB on the wire per pass, 24.5 KiB/s at 1x
ws perMessageDeflate default threshold (1024 B): ... 1.46 MiB on the wire per pass, 6.7 KiB/s at 1x
```

- With context takeover (the library's default, which browsers accept), the compressor keeps its dictionary across messages of the same connection, and consecutive telemetry messages are very similar: **6.7 KiB/s on the wire, 7 times less than uncompressed**, against 24.5 KiB/s without context takeover.
- `ws` documents its `threshold` (default 1024 B) as applying only "if context takeover is disabled" (`node_modules/ws/lib/permessage-deflate.js`, lines 44–45), which is why the default and `threshold: 0` give the same 1.46 MiB with context takeover even though the messages average 688–917 B.
- **CPU**: 1.1–1.2% of a local core per client for the server, about ten times the uncompressed send. Level 1 saves little (1.0–1.15%): the cost is mostly the library's per-message asynchronous zlib work, not the compression level. On the 0.1-CPU instance this is roughly 11–12% per client (estimate). The summary log reports the process CPU time so the estimate can be checked after the deploy (point 10).
- **Memory**: with context takeover each connection keeps its own zlib state (about 256 KiB for the default window and memory level, from zlib's documented formula), so about 1.3 MiB for 5 connections.

**Decision**: `perMessageDeflate` with the library's defaults (context takeover, default level) on the demo's WebSocket server only; 20 Hz kept; the maximum connection time is 5 minutes (FR-024). A client that does not offer the extension receives the same messages uncompressed. Because the CPU figure on 0.1 CPU is an estimate, `DEMO_WS_COMPRESSION=false` (default `true`) turns compression off without a code deploy if the summary's process CPU time shows the instance saturated (added after the plan review, at the maintainer's request).

---

## 7. The coach seed file

### Evidence

From `measure-preload.ts` (no API call; only the inputs the coach would receive):

```text
coach system prompt 3236 chars
pair (6,7): insights 6250 chars, deterministic true, user message 6396 chars
pair (6,8): insights 6260 chars, deterministic true, user message 6406 chars
pair (7,6): insights 3677 chars, deterministic true, user message 3823 chars
pair (7,8): insights 3670 chars, deterministic true, user message 3816 chars
pair (8,6): insights 3658 chars, deterministic true, user message 3804 chars
pair (8,7): insights 3657 chars, deterministic true, user message 3803 chars
```

- The system prompt is 1,378 tokens (measured earlier, `CLAUDE.md`); `MAX_TOKENS` is 2,048 (`src/coaching/coachService.ts`). The user messages are 3.8–6.4 thousand characters of mostly JSON; their token count was not measured (it needs the API key) and is not estimated here. The procedure logs the real `usage` of each call, as `coachService` already does.
- Insights computed twice from the same data, on the same machine, are identical for all six pairs. That says nothing about another platform or engine version, which is what T-5 is about (below).
- **Frontend reachability** (read-only, `Telemetry-F1/src/pages/sessionAnalysis/SessionAnalysisPage.tsx`, lines 60–79): the primary lap is always the latest lap (`laps[laps.length - 1]`, lap 8) and "volta atual não é des-selecionável". Today's frontend can therefore only request (8, 6) and (8, 7). The six pairs decided in the clarification cover those two plus four that no current frontend path reaches; the maintainer kept the six at the plan review (T-2), with the limitation recorded. (The clarify question's option B described lap 8 as the "default" primary; it is in fact fixed. The answer, option A, does not depend on that wording.)

### Decisions

- **Location and format**: `demo/coach-seed.json` at the repository root, read at run time through the project root (point 8), so the build copies nothing. Shape in [contracts/coach-seed-file.md](contracts/coach-seed-file.md): `formatVersion`, `recordingSha256`, `sessionUid`, and one entry per ordered pair with `lapA`, `lapB`, `model`, `analysisText` and `insights`. The file is public once committed, so it holds nothing about the account, the request or the usage (no timestamp of the call, no token counts).
- **Identity**: the seed is tied to the recording by `recordingSha256` and `sessionUid`. At start, demo mode refuses to run when `recordingSha256` differs from the verified hash of the recording in use, when `sessionUid` differs from the built session, when a pair's laps do not exist in the built session, or when the file is missing or malformed (FR-013). Seeding inserts one `lap_analyses` row per entry, before the connection becomes read-only.
- **Tests use a synthetic seed file** (FR-014, Story 5 scenario 5): `DEMO_SEED_PATH` points the integration test at a seed generated for the synthetic recording.
- **The procedure** (written by the agent, never run by it with a key): `tools/exportCoachSeed.ts`. It requires `DB_PATH` to be `:memory:` or a path outside `data/` (refusing `data/telemetry.db` and an unset `DB_PATH`), verifies the recording's hash, builds the session with the same function the demo uses, applies the capture times, computes the insights for each pair and calls the existing `generateCoaching`, then writes the file. It is idempotent with respect to paid calls (constitution, principle III): when `demo/coach-seed.json` already holds a pair for the same recording, the same model and identical insights, that pair is copied, not requested again; only missing or stale pairs are called. It runs only with `ANTHROPIC_API_KEY` set in the maintainer's own shell, under the spending limit configured in the Anthropic Console, and it prints each call's token `usage`. The core loop takes the coaching function as a parameter, so its test passes a fake and no test can make a paid call. The step-by-step procedure for the maintainer is in [quickstart.md](quickstart.md), section D.

### Comparing the seeded insights at start (T-5, decided at the plan review)

**How the coach receives the insights** (read in the code): `buildCoachUserMessage` (`src/coaching/coachUserMessage.ts`) sends `JSON.stringify(insights)` as is, so the coach sees each number with the shortest decimal representation of its double. The values are of two kinds:

- **Rounded by `round2`** (`Math.round(n * 100) / 100`, `src/analysis/numberUtils.ts`): `totalDeltaS`, `deltaLossS`, `brakingPointDiffM`, `peakBrakeDiff`, `throttleOnDiffM`, the coasting times, `maxLateralDeviationM`, `avgLateralDeviationM`, `avgTempC`. These are the values computed with arithmetic, and `lineDeviation.ts` is the only place a transcendental function enters (`Math.hypot`).
- **Copied from a sample, not computed**: the corner's `apexDistance`, `apexSpeed`, `brakingStartDistance`, `exitDistance`, and the tyre window's `distanceStart`/`distanceEnd` (`cornerDetection.ts`, lines 101–104; `tyreAnalysis.ts`, lines 33–34); plus counts, booleans, strings (`severity`, `wheel`, `status`) and `null`s.

**Where a cross-platform difference can come from**: the seed is produced on the maintainer's Windows machine and checked on the platform's Linux, and `.nvmrc` pins only the major version, so the V8 version may differ too (local: V8 12.4.254.21-node.56). Additions, multiplications and divisions in the same order are IEEE-754 exact on both; a function like `Math.hypot` is not guaranteed bit-identical across engine versions. A one-ulp difference before `round2` changes nothing, unless the value sits on a rounding boundary (`x.xx5`), where it flips the rounded result by exactly 0.01. A different sample could also be chosen if two computed values tie, which would move a copied distance by metres; that is a real difference in what the coach was told.

**Comparison rule** (`insightsMatch(stored, computed)`, a pure function):

- the same structure: the same keys, arrays of the same length in the same order, the same strings, booleans and `null`s;
- numbers equal within **|a − b| ≤ 0.01 + 1e-9**: 0.01 absorbs a `round2` flip, and 1e-9 absorbs the binary representation of the step itself (`0.36 − 0.35` is `0.010000000000000009`). For the copied values, which are not computed, it also absorbs any representation noise, while a different sample (metres) still fails.

A failed comparison stops the demo with a message naming the pair and the first differing path (for example `corners[3].deltaLossS: 0.12 vs 0.15`). The failed deploy leaves the previous one running.

**Tests**: equal objects match; a `round2` flip (0.35 vs 0.36) matches; 0.35 vs 0.37 does not; a one-ulp difference in a copied distance matches; a corner more or less, a boolean or `severity` changed, a `null` against a number, and a missing or extra key do not; the message names the path.

---

## 8. Build and start

### Evidence

Compiling `src/` with a separate configuration into a scratch folder (`tsconfig.build.json` extending the repository's, `rootDir` the repository root, test files excluded):

```text
$ npx tsc -p <scratch>/build/tsconfig.build.json
exit 0 in 3142 ms
src\server.js, src\analysis\..., src\config\dbPath.js, src\config\env.js, ... src\ws\messageFormat.js
```

Where the compiled `dbPath.ts` points (only the path was printed; no database was opened):

```text
dbPath resolved from compiled dist/src/config: <scratch>\build\dist\data\telemetry.db
from ts source:                                C:\Telemetry\TelemetryF1_API\data\telemetry.db
```

- `dbPath.ts` resolves `data/` as `__dirname/../..`. From `dist/src/config/` that is `dist/data/`, not the repository's `data/`. A compiled server in local mode (`npm start` without demo mode) would silently create a new, empty database under `dist/`.

### Decisions

- `tsconfig.build.json` at the root: extends `tsconfig.json`, `outDir: dist`, includes `src` and `tools`, excludes `**/*.test.ts`, `**/testFixtures.ts` and `src/persistence/testDb.ts`. `npm run typecheck` keeps using `tsconfig.json` with `--noEmit` (FR-019).
- A small `src/config/projectRoot.ts` finds the repository root by walking up from `__dirname` to the first folder containing `package.json`; `dbPath.ts`, the demo's default recording path and the seed path resolve from it, so source and compiled code agree. A unit test asserts that the root resolved from source holds this repository's `package.json`.
- Scripts: `"build": "tsc -p tsconfig.build.json && node dist/tools/fetchDemoRecording.js"`, `"start": "node dist/src/server.js"`. On Render, build command `npm ci && npm run build`, start command `npm start` (configured at deploy time, out of scope).
- Nothing besides JavaScript needs copying: the schema is a TypeScript string, the seed file and the recording are read from the repository root at run time, and `better-sqlite3`'s native binary is installed by `npm ci` on the build machine (Linux, already exercised by the CI of spec 002).
- `dist/` is already in `.gitignore`.

---

## 9. HTTP caching, and the per-IP limit

### Evidence

- Express 5.2.1 (`node_modules/express/lib/application.js`, line 95): `this.set('etag', 'weak')` by default, and `this.set('trust proxy', false)` (line 99). `res.send` computes the ETag (`lib/response.js`, lines 168–194) and answers 304 when `req.fresh` (line 199). No code in this repository sets `Cache-Control` or changes `etag`.
- `cors` adds `Vary: Origin` when it reflects a specific origin (`node_modules/cors/lib/index.js`).
- The frontend's `httpGet` calls `fetch(url)` with no `cache` option (`Telemetry-F1/src/api/httpClient.ts`), so the browser's HTTP cache and conditional requests apply as usual.
- Response sizes in demo mode (from `measure-preload.ts`): `GET /sessions` 172 B, `GET /sessions/1` 622 B, `GET /sessions/1/laps/{6,7,8}/telemetry` 560,795 / 561,147 / 554,889 B.
- **Requests of a normal visit**, read from the frontend (read-only): the history page makes 1 request (`/sessions`); the session page makes 1 (`/sessions/:id`) plus 1 telemetry request per selected lap (`useLapTelemetry`, refetched when the selection changes); the coach makes 1 POST per click. The dashboard uses only the WebSocket. No polling exists (`setInterval` appears only in `useIsRecent`, a local clock). A visit that opens the history, the session, compares lap 8 with 7 and then 6, and asks the coach twice makes about **8 requests and 1.1–1.7 MB** of REST.

### Decisions

- **Demo mode** sets `Cache-Control: no-cache` on the four read routes, keeping Express's ETag. A browser revalidates every time and gets `304` with no body while the data is unchanged (SC-013); since the ETag is derived from the body, a deploy that changes the data changes the ETag, so a visitor never sees data from a previous deploy. The documented cache lifetime is therefore zero, with revalidation (FR-026). `POST /sessions/:id/analysis` and `GET /health` get `Cache-Control: no-store`.
- **Local mode** keeps today's headers (Express's ETag only).
- **Per-IP limit (FR-027): not adopted**, for the reason recorded in point 1. The visit count above (about 8 requests) is recorded for when the limit is revisited.
### Does the platform compress REST responses? (T-3, decided at the plan review)

| Question | Official source (read 2026-10-21) |
|---|---|
| Does the platform compress HTTP responses? | **Yes.** "Render's load balancers automatically compress HTTP responses from your apps using Brotli and gzip compression" ([Render vs Heroku](https://render.com/docs/render-vs-heroku-comparison)); "Brotli compression" listed among the web services' additional features ([Web Services](https://render.com/docs/web-services)). Neither page names which content types are compressed or mentions `Accept-Encoding`. |
| Is bandwidth counted after that compression? | **Not stated.** The bandwidth page counts "network traffic sent from your workspace's services to destinations outside of Render" and never mentions compression or where it measures ([Outbound Bandwidth](https://render.com/docs/outbound-bandwidth)). |
| Cloudflare | No Render reference page documents Cloudflare's role in compression; the earlier articles (point 1) only place Cloudflare in front of the services. |

Measured on one lap's telemetry body (same script, `zlib` of Node 22):

```text
REST lap 6 telemetry: raw 560795 B; gzip(6) 86284 B in 10.6 ms; brotli(4) 78752 B in 8.0 ms; brotli(11) 64882 B in 1778.3 ms
REST lap 7 telemetry: raw 561147 B; gzip(6) 85487 B in 10.6 ms; brotli(4) 78079 B in 6.8 ms; brotli(11) 64310 B in 1726.3 ms
REST lap 8 telemetry: raw 554889 B; gzip(6) 84400 B in 7.9 ms; brotli(4) 77314 B in 5.7 ms; brotli(11) 63622 B in 1778.4 ms
```

**Decision**: by the maintainer's rule (compress in the application only if the platform does not), **the application does not compress REST**: the platform documents that it does. What remains unknown is only how the bytes are counted, which is why point 1 gives the visit count as a range. Hypothesis to check after the deploy (out of scope): JSON responses arrive with `Content-Encoding: br` or `gzip` in the browser, and the Metrics page's outbound graph is closer to the compressed figure.

---

## 10. Logging in demo mode

### Decisions

- `server.ts`'s per-packet lines (`shouldLog`) are not used in demo mode; the demo's in-process loop does not go through them, and `sessionContext`'s pass-restart line does not occur because the loop does not persist (point 3).
- A small demo logger writes, in Portuguese and with the `[demo]` prefix: the start and the milliseconds until ready (with the build, hash and seed times); each new pass (`onPass` of `runReplay`); each connection opened and closed with its reason (normal, `4001 demo full`, `4002 time limit`, `403` origin refusal); and, every 15 minutes (`setInterval(...).unref()`), a summary with the active connections, the WebSocket, REST and total bytes since start, and the count of coach 503s since start. Since FR-027 is not adopted, there are no 429 lines.
- **Counting bytes.** With compression, the serialized message size no longer says what leaves the server, so both counts use Node's public `socket.bytesWritten`. WebSocket: the `upgrade` handler holds each connection's socket; the count is the sum of `bytesWritten` of closed sockets plus the open ones at summary time (handshake, frames, compression and pings included). REST: a demo-only middleware, on each response's `finish`, adds the increase of `req.socket.bytesWritten` since that socket's last response (kept in a `WeakMap`, since keep-alive reuses sockets); headers included. These are the bytes the application writes, before the platform's HTTP compression, so the REST figure is an upper bound of what that compression lets out, and neither figure is the platform's billing number; the log line says so.
- **CPU.** The summary also logs the process CPU time since start (`process.cpuUsage()`), so the estimate of point 6 can be checked on the 0.1-CPU instance.
- **Coach 503s**: the same middleware counts responses to `POST /sessions/:id/analysis` with status 503.
- **No IP address is logged** at all (simpler than masking, and enough for the summary).

---

## 11. Test strategy and the recording fixture

### Evidence

- `src/replay/testFixtures.ts` already builds real binary packets in memory (`buildSyntheticRecording`, `buildLoopableSyntheticRecording`: lap data, motion and car telemetry, a closing lap, a chosen `sessionUID` and frame span), with no file in git. `src/config/serverFailFast.test.ts` already spawns the server as a child process with a controlled environment and a temporary directory.

### Decision (T-7, decided at the plan review)

A **synthetic recording generated by the test itself**: the demo integration test extends the existing builders with `receivedAt` values, writes the packets to a `.jsonl` in a temporary folder, computes its SHA-256, writes a synthetic seed file for its laps, and spawns the server in demo mode with `DEMO_RECORDING_PATH`, `DEMO_SEED_PATH` and a `PORT` the test has just found free (binding port 0 on loopback and releasing it), since `PORT` keeps the 1–65535 validation. It needs no file in git, no network and no key.

### Alternatives considered

- **A minimal real recording committed as a registered exception**: real game bytes, but it breaks the "recordings stay out of git" rule, even if small.
- **Download the published recording in the test**: network in the CI, 25 MB per run, and the CI would then depend on GitHub's release hosting.

---

## Implementation evidence

### T026 — the recording at build time (2026-10-21)

Run from the repository with `DOTENV_CONFIG_PATH` pointing at an empty scratch `.env` (key check: `false`).

```text
$ npm run build                       # recording already in recordings/
[fetchDemoRecording] gravação já presente e conferida em C:\Telemetry\TelemetryF1_API\recordings\demo-interlagos-tt-20hz-laps6-8.jsonl; nada baixado.
exit 0

$ DEMO_RECORDING_PATH=<scratch>/download3/demo.jsonl node dist/tools/fetchDemoRecording.js    # empty folder
[fetchDemoRecording] gravação baixada e conferida em <scratch>\download3\demo.jsonl.
elapsed 3347 ms, exit 0, 25173414 bytes, no demo.jsonl.part left

$ (same command again)
[fetchDemoRecording] gravação já presente e conferida em <scratch>\download3\demo.jsonl; nada baixado.
```

Decided at the stop before T025 (2026-10-21): `ensureRecording` takes an optional third parameter `{ url, expectedSha256 }` defaulting to the Release URL and `PUBLISHED_RECORDING_SHA256` (a test calls it without the parameter and checks both defaults); an existing file with a wrong hash is replaced by a verified download, with a log line, and stays untouched if the download fails; the destination folder is created when missing.

---

## CI runs

Pull request [#12](https://github.com/AnaLauraFFerraz/TelemetryF1_API/pull/12) (draft). Each row is read from `gh api repos/AnaLauraFFerraz/TelemetryF1_API/actions/runs/<run>/jobs`; a run counts as green only with both jobs `completed` and `success`.

| Push | Head SHA | Run | Event | `typecheck` | `test` | Note |
|---|---|---|---|---|---|---|
| T020, first push (foundational phase) | `84879db` | 39678700345 | `pull_request` | completed, success (21:25:45–21:25:56 UTC) | completed, success (21:25:45–21:26:36 UTC) | — |
