# Feature Specification: Demo mode for a public demonstration

**Feature Branch**: `003-demo-mode`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description (verbatim, as given to `/speckit-specify`):

> Spec 003 da API: modo demo para uma demonstração pública.
>
> Contexto: a API vai ficar publicada numa hospedagem gratuita (Render, camada web gratuita: dorme depois de 15 minutos sem tráfego de entrada, leva cerca de um minuto para acordar, tem disco temporário que se perde a cada reinício e, pelo que sabemos, expõe uma porta só, pela variável PORT; o plano confirma isso na documentação). O front vai ficar numa hospedagem estática e se conectar a ela. Orçamento zero.
>
> Antes de escrever a spec, leia o código (só leitura, sem executar nada) e registre como fato ou como hipótese não confirmada:
> 1. Como o replay identifica a sessão em que grava. Numa conferência em 21/10, o replay da gravação de exemplo não criou sessão nova e pareceu regravar a sessão de 16/10, de onde a gravação saiu.
> 2. Como a duração da sessão mostrada no histórico é calculada. Na mesma conferência, a duração dessa sessão passou de 6.962 min para 7.083 min entre duas rodadas, batendo com a hora do relógio das capturas, o que sugere que ela usa a hora em que o último pacote chegou, e não o tempo da sessão.
> 3. Como as portas são configuradas hoje (REST em HTTP_PORT, WebSocket em WS_PORT, UDP em UDP_PORT) e que endpoints existem, dizendo quais escrevem no banco ou chamam a Anthropic.
>
> O que a spec precisa cobrir (o quê e por quê; o como fica para o plano):
> - Um modo demo, ligado por configuração, que não muda o funcionamento local de hoje.
> - No modo demo, a telemetria da gravação de exemplo (a Release sample-recording-v1, fora do git) é reproduzida em loop a 1x pelo próprio servidor, sem porta UDP pública.
> - REST e WebSocket atendidos na única porta que a hospedagem expõe.
> - Sem estado: a cada inicialização, o banco é criado do zero a partir da gravação, e o cache do coach é semeado a partir de um arquivo versionado. Reinícios, sono e disco temporário não podem quebrar nada.
> - O coach roda sem ANTHROPIC_API_KEY: comparações com cache respondem, as outras dão 503. Gerar o arquivo de cache exige chamadas pagas: é tarefa manual da mantenedora, feita uma vez, localmente, com o limite de gastos do Console; o agente nunca faz chamada paga.
> - A duração e os dados da sessão mostrados ao visitante continuam coerentes com o replay em loop rodando indefinidamente (ligado aos itens 1 e 2 acima).
> - Um endpoint de saúde para a hospedagem, CORS restrito à origem do front, e build e start com JavaScript compilado (tsconfig próprio de build), não com ts-node-dev.
> - Nenhum visitante consegue escrever no banco além do que o próprio replay grava, nem disparar chamada paga.
>
> Fora do escopo: a configuração de produção do front e o aviso de servidor acordando (spec 003 do front), o deploy em si e os links nos READMEs (passo seguinte), o flashback e a out-lap (spec 004).
>
> O que for decisão com trade-off ou não puder ser afirmado pelo código fica marcado como NEEDS CLARIFICATION, para o clarify. A documentação se refere à mantenedora pelo papel. Quando terminar, commite a spec como docs:, sem trailer, e me mostre o resumo: os três fatos lidos no código, os requisitos e as perguntas abertas. Edição só com Edit e Write.

## Clarifications

### Session 2026-10-21

- Q: What does a visitor see on the first request after the server starts or wakes: the complete session, or a history that fills in during the first 1x pass? → A: The complete session (the three laps and all their samples) is in place before the first request is answered, and the health endpoint reports ready only from then on. The plan measures how much this adds to startup.
- Q: Which time base do the demo session's dates and duration use? → A: The recording's own capture times (the `receivedAt` field the recorder already writes). They never change with the loop or with restarts. Using the game's session time (the former option C) is out of this spec: it goes back on a flashback, which is the subject of spec 004, and adopting it now would change the contract on a base not yet studied. Local mode keeps its current behaviour; this spec adds to Known limitations in `README.md` and `CLAUDE.md` that replaying an old recording in local mode stretches that session's duration to the current time.
- Q: Which lap pairs does the coach seed file cover? → A: All six ordered pairs of laps 6, 7 and 8.
- Q: Are the three defaults recorded in Assumptions approved (refuse to start in demo mode with `ANTHROPIC_API_KEY` set; the WebSocket handshake follows the same origin rule as CORS; the existing 503 body unchanged)? → A: Yes, all three. The origin rule only limits use from browsers, because a client outside a browser sends whatever `Origin` header it wants; the guarantee that no visitor writes to the database or triggers a paid call must not depend on it.
- Q: When many visitors open the live view at once, should the server limit the number of simultaneous WebSocket connections, and what does a visitor beyond the limit see? → A: A configurable limit of simultaneous connections, default 5. A visitor beyond the limit has the connection accepted and then closed at once with a close code and reason of its own ("demo full"), which the frontend can show (frontend spec 003); REST keeps working. The limit only protects against many simultaneous visitors, not against the volume of each connection: measured on the published recording, one connection receives about 792 KiB/s, about 2.7 GiB per hour, so a single forgotten tab consumes that much on its own. The volume per connection is a separate decision.
- Q: In demo mode, what reduces the volume of each WebSocket connection? → A: Both a maximum time per connection, 10 minutes by default (configurable), after which the connection is closed with a close code and reason of its own ("time limit") and reconnection happens only by the visitor's action; and, in demo mode only, messages that carry only the player's car, with `playerCarIndex` set to 0 (measured: 47.1 KiB/s instead of 791.6 KiB/s, about 28 MiB for a 10-minute visit, with no compression and so no extra CPU). This is recorded as a contract change even though the message shape is the same: it goes in the list of changes the frontend sees and in the contract documentation in `README.md`, so that a future reading of the other cars does not break only in the demo. Suggested for frontend spec 003: close the connection when the tab is hidden.
- Q: In demo mode, should REST have any protection against volume, or stay open as today? → A: HTTP caching of the demo's read responses plus a per-IP request limit, under two conditions. The per-IP limit is adopted only if the plan confirms how the hosting platform forwards the visitor's real IP and configures the server's proxy trust (Express `trust proxy`) with the exact number of hops, so that a forged `X-Forwarded-For` cannot escape the limit and all visitors are not counted as one; if that cannot be confirmed, only the HTTP caching applies, with the reason recorded. The limit must sit well above the number of requests of a normal visit, which the plan measures. The coach's POST is excluded from HTTP caching.
- Q: In demo mode, what should the server write to its log? → A: The per-packet log is silenced in demo mode, and only events are logged: start and time until ready, each new pass of the loop, the opening and closing of connections (normal, "demo full", "time limit"), 429 responses, and a periodic summary (every 15 minutes) with the active connections, the bytes sent over WebSocket and over REST and their sum (the bandwidth quota is a single one), and the count of coach 503 responses, which should stay at zero with the six pairs cached and signals that the frontend offers a combination with no cache. No full IP address goes to the log. Local-mode logs do not change.

## Current behaviour read from the code

Items 1 to 3 were read on 2026-10-21, without running anything, from `main` at `6fa1837` and, for the duration, from the frontend repository's working copy. Item 4 was measured during the clarify step of the same day, by parsing the recording, with no database and no network. Each item is marked **Fact** (stated by the code) or **Hypothesis** (consistent with the code and the observation, not confirmed).

### 1. How a replay picks the session it writes to

- **Fact.** The session is identified only by the `sessionUID` in each packet's header. `getActiveSession` (`src/persistence/sessionContext.ts`) keys its in-memory map by `header.sessionUID`, and on a miss calls `getOrCreateSession` (`src/persistence/sessionRepository.ts`), which looks the UID up in `sessions.session_uid` (UNIQUE) and inserts a row only if none exists.
- **Fact.** The replayer re-sends each recorded packet's bytes unchanged: `tools/replayer.ts` decodes the base64 `data` field into a buffer and `runReplay` (`src/replay/runner.ts`) sends that buffer as is. A replay therefore carries the `sessionUID` of the original capture. Nothing in the replay path creates a new identity.
- **Fact.** When the row already exists, the replay reuses it: `started_at` keeps its original value; `last_seen_at` is set to the current time; laps are upserted on `(session_id, lap_number)` (`lapRepository.upsertCompletedLap`), so they are overwritten with the same values; samples use `INSERT OR IGNORE` on `(session_id, overall_frame_identifier)`, so a sample whose frame is already stored is dropped, not rewritten. "Rewrote the 16/10 session" is, precisely, "reused it, refreshed its last-seen time, re-upserted identical laps and added no samples".
- **Fact.** The same holds across the passes of a looped replay inside one server process: the laps and samples of every pass after the first hit the same keys, so the stored data stays bounded.
- **Hypothesis.** The session dated 16/10 in the database used on 21/10 has the same `session_uid` as the published recording. The database was not opened. It is consistent with the recording's first line, whose `receivedAt` field (an absolute timestamp written by `tools/recorder.ts` and ignored by the replayer) is `1792168223797`, that is 2026-10-16 16:30:23 UTC.

### 2. How the session duration in the history is computed

- **Fact.** The API computes no duration. `GET /sessions` and `GET /sessions/:id` return `startedAt` and `lastSeenAt`, both server wall-clock times written by SQLite: `started_at` is set when the row is inserted and never changes; `last_seen_at` is refreshed when a server process first sees the session (`getOrCreateSession` on an existing row) and then at most every 15 s while its packets keep arriving (`TOUCH_INTERVAL_MS` in `sessionContext.ts`).
- **Fact.** The frontend computes the duration as `lastSeenAt − startedAt`, rounded to whole minutes (`formatSessionDuration` in `Telemetry-F1/src/utils/formatDate.ts`; its own comment calls it an approximation). Neither side uses the game's `sessionTime` nor the recording's own timestamps.
- **Fact, applied to the observation.** The two readings (6,962 and 7,083 minutes, about 4.8 days) are consistent with `startedAt` fixed on 16/10 and `lastSeenAt` moved by each replay to the wall-clock time it ran, 121 minutes apart. The hypothesis in the description is confirmed: the duration follows the arrival time of the last packet, not the session time.
- **Consequence.** With a replay looping indefinitely, the duration shown grows by one minute per minute of uptime, without bound, and the start date is the date the row was inserted, not the capture date.

### 3. Ports and endpoints

- **Fact.** `src/config/env.ts` reads `WS_PORT`, `UDP_PORT` and `HTTP_PORT`, each required, an integer from 1 to 65535, and stops with a clear message at load time otherwise. It is loaded by `src/server.ts`, `tools/recorder.ts`, `tools/replayer.ts` and `src/coaching/coachService.ts` (and so by the analysis router). No `PORT` variable is read anywhere.
- **Fact.** There are three separate listeners: REST with `app.listen(HTTP_PORT)` (`src/http/httpServer.ts`), a standalone WebSocket server on `WS_PORT` (`src/network/wsBroadcaster.ts`), and UDP bound to `0.0.0.0:UDP_PORT` (`src/network/udpListener.ts`).
- **Fact.** CORS is `cors({ origin: true })`: any origin is reflected and allowed. There is no health endpoint. No `Cache-Control` header is set anywhere, and nothing changes Express's default `etag` setting, so JSON responses carry only Express's default weak ETag.
- **Fact.** Endpoints, and what writes or pays:

| Surface | What it does | Writes to the database | Calls Anthropic |
|---|---|---|---|
| `GET /sessions` | Session list with lap count and best valid lap | No | No |
| `GET /sessions/:id` | Session detail with its laps | No | No |
| `GET /sessions/:id/benchmark` | Best lap and theoretical best on the session's track, across all sessions | No | No |
| `GET /sessions/:id/laps/:lapNumber/telemetry` | Car telemetry and motion samples of one lap | No | No |
| `POST /sessions/:id/analysis` (`{ lapA, lapB }`) | Coach analysis of a lap pair; a cached pair is returned as is; without `ANTHROPIC_API_KEY`, a non-cached pair returns 503 before any work | Yes, one `lap_analyses` row, only after a successful paid call | Yes, on a cache miss when the key is set and both laps have samples |
| WebSocket | Server-to-client broadcast of motion, lap data and car telemetry; client messages are not handled | No | No |
| UDP | Ingestion of game packets | Yes: `sessions`, `laps`, `car_telemetry_samples`, `motion_samples` | No |

Anyone who can reach the UDP port can write to the database; the REST and WebSocket surfaces cannot write anything except the coach's cache row.

### 4. Volume of the live stream (measured 2026-10-21, during the clarify step)

- **Fact (measured).** Every connected WebSocket client receives, for every motion, lap data and car telemetry packet, a JSON message with the full array of 22 cars (`src/ws/messageFormat.ts`), with no compression. Parsing the published recording with the existing parsers and serializing each message with `buildWsMessage` (no database, no network) gives, per connection: 13,374 messages per pass, averaging 10.2 KB (motion), 16.9 KB (lap data) and 13.4 KB (car telemetry); 172.3 MiB per pass; **791.6 KiB/s, 2.72 GiB per hour**.
- **Fact (measured).** Compressed message by message (deflate, default level, no shared context): 79.9 KiB/s, 9.9 times less, at a CPU cost of 0.79% of one core of the maintainer's machine (Intel i7-9750H) per client; at the fastest level: 90.4 KiB/s for 0.52%. The player's car only, uncompressed: 47.1 KiB/s; compressed: 24.2 KiB/s.
- **Hypothesis.** The free instance's CPU is a fraction of one core (to be confirmed by the plan against the platform's documentation), so compression per client would cost a multiple of the percentages above on it.
- **Fact.** The frontend reads only `message.data[message.playerCarIndex]` from each message (`Telemetry-F1/src/context/TelemetryProvider.tsx`), so a message whose array holds only the player's car, with `playerCarIndex` 0, is read the same way by today's frontend.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A visitor explores a live-looking session at any time (Priority: P1)

A visitor opens the published frontend. The API, running in demo mode on the free hosting, is replaying the published Interlagos recording at its original pace, in a loop, from inside its own process. The visitor sees one session in the history, opens it, sees laps 6, 7 and 8 with the same times, sectors and validity the README documents, opens the per-lap telemetry, and watches the live dashboard move as the replay goes on. Whether the instance just woke up, restarted or has been running for days, what they see is the same.

**Why this priority**: this is the demonstration itself. Without it nothing else in the feature has an audience.

**Independent Test**: start the server in demo mode with no database on disk, no UDP port and no API key; open the history, the session, its laps and the live view from the allowed origin; repeat after a restart and after many loop passes, and compare.

**Acceptance Scenarios**:

1. **Given** demo mode is on and no database exists, **When** the server starts, **Then** it builds its data from the published recording only, and the history lists exactly one session.
2. **Given** the demo session, **When** the visitor opens it, **Then** it shows laps 6 (1:14.306, invalid), 7 (1:14.144) and 8 (1:13.372, best valid lap), with sectors and validity identical to a local replay of the same recording at `1x`.
3. **Given** the live view is open, **When** the replay advances, **Then** the visitor receives the live telemetry continuously at the recording's pace, and the stream restarts from the beginning of the recording at the end of each pass, with no gap longer than the recording's own.
4. **Given** the replay has looped for any number of passes, **When** the visitor reloads the history, **Then** it still shows one session, three laps, the same times and the same per-lap sample counts as after the first full pass.
5. **Given** demo mode, **When** a live message reaches the visitor, **Then** its array holds only the player's car and `playerCarIndex` is 0.
6. **Given** a visitor has had the live view open for 10 minutes, **When** the time limit is reached, **Then** the server closes the connection with the demo's "time limit" close code and reason and does not reopen it; reconnecting only by the visitor's action is the frontend's behaviour (frontend spec 003).
7. **Given** the instance is restarted, put to sleep and woken, or its disk is wiped, **When** the visitor comes back, **Then** they see the same session and laps as before, with no error and no manual action by the maintainer.
8. **Given** demo mode is on, **When** the server starts, **Then** no UDP port is opened.
9. **Given** demo mode is on, **When** the visitor first loads the history after a start, **Then** the session is already complete, with its three laps and all their samples, because the server answers no request before that; the health endpoint reports ready only from then on.

---

### User Story 2 - The session's dates and duration stay believable forever (Priority: P1)

The visitor looks at the session in the history: its date, start time and duration. Those values describe the session the recording contains, about 3 min 43 s of driving, not how long the demo instance has been up. They do not drift while the replay loops, and they do not jump after a restart. The live dashboard still shows the replay as it happens.

**Why this priority**: today the duration grows by one minute per minute of uptime (see "Current behaviour", item 2). After one day of looping the history would show a 1,440-minute session for 3 laps, which makes the whole demo look broken.

**Independent Test**: read the session's start, last-seen and resulting duration after the first pass, after many passes and after a restart; all readings must agree with the rule chosen below and with each other.

**Acceptance Scenarios**:

1. **Given** the demo has been looping for hours, **When** the visitor reads the session's duration, **Then** it equals the value after the first pass.
2. **Given** a restart, **When** the visitor reads the session's dates and duration, **Then** they follow the same rule as before the restart.
3. **Given** demo mode, **When** the session's dates are shown, **Then** they are the recording's own capture times: the session starts at the capture time of the recording's first packet (2026-10-16 16:30:23 UTC), its last-seen time is the capture time of the last packet, so the duration the frontend shows is the recording's span (222.8 s, displayed as 4 min), and each lap's recorded time is the capture time of the packet that completed it.
4. **Given** local mode, **When** any replay or live session runs, **Then** the session's dates and duration behave exactly as they do today; replaying an old recording still stretches that session's duration to the current time, now documented as a known limitation.

---

### User Story 3 - Visitors cannot write data or cost money (Priority: P1)

Anyone on the internet can call the public API, with a browser or with a script. In demo mode, the only thing that ever writes to the database is the server's own replay of the published recording (plus the coach cache seeded at startup). No request from a visitor adds, changes or deletes data, and nothing a visitor does can make the server call a paid service. The coach answers the comparisons the maintainer has prepared in advance and declines the others with the existing 503.

**Why this priority**: the budget is zero. A single path to a paid call or to unbounded writes on a public URL is a cost or an abuse risk.

**Independent Test**: with demo mode running, send every route and method the API exposes, including malformed bodies, cached and non-cached lap pairs and any UDP traffic to the instance; compare the row counts of every table before and after, and confirm no outbound call to Anthropic was attempted.

**Acceptance Scenarios**:

1. **Given** demo mode, **When** a visitor requests the coach analysis for a seeded pair, **Then** the answer is the seeded analysis, marked as cached, with no outbound call.
2. **Given** demo mode, **When** a visitor requests a pair that is not seeded, **Then** the response is 503 with the existing error body, and nothing is written.
3. **Given** demo mode is configured with an `ANTHROPIC_API_KEY` present, **When** the server starts, **Then** it stops at startup with a clear message saying demo mode does not accept the key, so a misconfiguration can never enable paid calls.
4. **Given** demo mode, **When** any client sends any message over the WebSocket, **Then** nothing is written.
5. **Given** demo mode, **When** a visitor sends any other method or path, **Then** it is rejected as it is today, and nothing is written.
6. **Given** demo mode, **When** packets are sent to the instance's UDP port number, **Then** nothing receives them, because no UDP socket exists in demo mode.
7. **Given** demo mode and a visitor who already loaded a read endpoint, **When** their browser asks for it again, **Then** it is served from the browser's HTTP cache or revalidated without downloading the body again; the coach's POST and the health endpoint are never cached.
8. **Given** demo mode with the per-IP limit in force (FR-027), **When** one client exceeds it, **Then** it receives 429 until its window resets, other visitors are unaffected, and adding a forged `X-Forwarded-For` header does not reset or move its count.

---

### User Story 4 - The hosting can run, probe and restart the API (Priority: P2)

The hosting platform builds the API once, starts it from compiled JavaScript, routes all traffic to the single port it assigns, probes a health endpoint to decide whether the instance is up, and restarts or sleeps it when it wants. REST and WebSocket both work on that one port. Only the frontend's published origin can use the API from a browser.

**Why this priority**: it is what makes the demo deployable on the chosen free tier. It is secondary to the demo being correct, and the deploy itself is the next step, not this feature.

**Independent Test**: build with the documented command, start with the documented command and only the demo configuration, then probe the health endpoint, call REST and open the WebSocket on the single port, from the allowed origin and from another origin.

**Acceptance Scenarios**:

1. **Given** a clean checkout with dependencies installed, **When** the documented build command runs, **Then** it produces compiled JavaScript using a build configuration of its own, separate from the type check.
2. **Given** the build output, **When** the documented start command runs, **Then** the server runs from the compiled output, with no TypeScript runtime involved.
3. **Given** demo mode and the single port the platform assigns, **When** clients connect, **Then** REST and WebSocket are both served on that port.
4. **Given** the health endpoint, **When** the platform probes it, **Then** it answers success only once the demo is ready to serve visitors (data built, coach cache seeded, replay running), and failure otherwise, without requiring any origin header.
5. **Given** a browser page on the frontend's configured origin, **When** it calls REST or opens the WebSocket, **Then** it succeeds.
6. **Given** a browser page on any other origin, **When** it calls REST or opens the WebSocket, **Then** the browser is not granted access to REST responses and the WebSocket handshake is refused.
7. **Given** demo mode without the frontend origin configured, **When** the server starts, **Then** it stops with a clear message naming the missing setting.

---

### User Story 5 - The maintainer prepares the coach cache once (Priority: P2)

Before publishing, the maintainer runs, once, on their own machine, a documented procedure that replays the published recording into a disposable database, asks the coach for each lap pair to be offered in the demo, and writes the results to a file committed to the repository. This is the only step that costs money, it is bounded by the spending limit set in the Anthropic Console, and it is never run by the CI, the tests or the agent.

**Why this priority**: without the file, every comparison in the demo returns 503. It is P2 because the rest of the demo works without it.

**Independent Test**: with a synthetic seed file, start demo mode and request each seeded pair (cached answer) and an unseeded pair (503). The real file is produced only by the maintainer.

**Acceptance Scenarios**:

1. **Given** the procedure, **When** the maintainer runs it, **Then** it never opens `data/telemetry.db`, it uses a disposable database, and it logs the token usage of every call.
2. **Given** the committed seed file, **When** demo mode starts, **Then** every analysis in the file is served as cached for its pair.
3. **Given** a seed file produced from a different recording, **When** demo mode starts, **Then** it stops with a clear message instead of serving analyses that do not match the data the visitor sees.
4. **Given** the procedure, **When** it produces analyses, **Then** it produces exactly the six ordered pairs of laps 6, 7 and 8 (six paid calls), so any comparison a visitor can choose in the demo has a cached answer.
5. **Given** the CI or the test suite, **When** they run, **Then** none of them can make a paid call; tests use a synthetic seed file.

---

### User Story 6 - Local use is unchanged (Priority: P1)

With demo mode off, which is the default, the maintainer runs the server, the recorder, the replayer and the analyze tool exactly as today: three ports from `.env`, UDP from the game or from `npm run replay`, the real database at `data/telemetry.db`, any origin allowed, the coach enabled by the key, `npm run dev` with live reload.

**Why this priority**: the local workflow is the product; the demo is a showcase of it. A regression here is worse than a missing demo.

**Independent Test**: with demo mode off, run the test suite, the type check and the spec 001 replay validation (a `1x` replay of the published recording into a disposable database delivers every lap and the 2,411 predicted samples); all must match today's results.

**Acceptance Scenarios**:

1. **Given** demo mode is off, **When** the server starts, **Then** it requires and uses `WS_PORT`, `UDP_PORT` and `HTTP_PORT` as today, with the same messages when one is missing.
2. **Given** demo mode is off, **When** the game or the replayer sends UDP packets, **Then** they are ingested as today.
3. **Given** demo mode is off, **When** the coach is asked for a non-cached pair with a key set, **Then** it calls Anthropic and caches the result as today.
4. **Given** demo mode is on, on any machine, **When** the server starts, **Then** it never opens, modifies or deletes `data/telemetry.db`.

### Edge Cases

- **First request right after a cold start.** The free tier takes about a minute to wake, and building the session adds to that (measured by the plan). A visitor never sees a partial session: the server answers no request until the session is complete (Story 1, scenario 9).
- **A lap only exists once the next one starts.** Lap completion is detected when the game reports the next lap number, so lap 8 is only recorded at the very end of a pass. Because the session is built before the first request, this is invisible to the visitor.
- **Building the session must not lose data.** The session built at startup must hold the same laps and the same samples as a full `1x` pass (2,411 per-distance samples, spec 001); building it faster than `1x` is acceptable only if nothing is lost, unlike the `max` replay speed over UDP.
- **The recording lacks capture times.** If the recording's first or last packet has no `receivedAt`, the demo cannot know the session's dates and refuses to start rather than invent them.
- **Restart in the middle of a pass.** The new process starts from a fresh database; the WebSocket clients of the old process are disconnected. Telling the visitor the server is waking or reconnecting is the frontend's job (frontend spec 003).
- **The temporary disk survives a process restart.** A database left on disk by a previous process must not be reused: every start in demo mode begins from an empty database.
- **The recording is unavailable or altered at build or start.** The published asset may be missing, partially downloaded or replaced. The demo must refuse to run with a clear message, checking the recording against the SHA-256 published in the README, rather than serve partial or different data.
- **Loop boundary.** The recording's `overallFrameIdentifier` span (about 4,500 frames) is well above the threshold that resets the in-memory lap state between passes (100), so each pass starts clean (spec 001). A shorter recording would not; this feature uses only the published one.
- **Cache seeded for a pair whose laps differ in the demo.** The coach cache is keyed only by session and lap numbers (known limitation). In demo mode the session is always the same recording, so the file must be tied to that recording (Story 5, scenario 3).
- **An `ANTHROPIC_API_KEY` set by mistake on the hosting.** Demo mode refuses to start (Story 3, scenario 3) rather than silently ignoring it, so the mistake is visible on the first deploy.
- **Non-browser clients.** The origin rule (CORS and the WebSocket handshake) only limits use from browsers: a client outside a browser sends whatever `Origin` header it wants. A script can therefore call every read endpoint and open the WebSocket, which is acceptable because everything readable is public demo data. The guarantee that no visitor writes or triggers a paid call does not rely on the origin rule (FR-015).
- **Health probe during startup.** While the session is being built or the seed loaded, the health endpoint reports not ready, so the platform does not route visitors to a half-built demo.
- **Local replay of an old recording.** In local mode, replaying a recording whose session already exists in the database moves that session's last-seen time to now, so its duration stretches to the current time. Unchanged by this feature; documented as a known limitation.
- **Several visitors at once.** All share one replay and one broadcast; a visitor joining mid-pass sees the stream from that point, not from the start of the recording. At most 5 live connections are served at once (configurable); the sixth is accepted and closed immediately with the demo's own "demo full" close code and reason, while its REST pages keep working. When a connection ends, the next visitor can connect.
- **One forgotten tab.** The connection limit does not reduce what each connection costs: at today's message volume an open tab takes about 2.7 GiB per hour (see "Current behaviour", item 4). In demo mode, sending only the player's car brings it to about 0.16 GiB per hour, and the 10-minute limit closes the connection after about 28 MiB; the tab reconnects only if the visitor acts.
- **A forged `X-Forwarded-For`.** A client can send any `X-Forwarded-For` value. Unless the server trusts exactly the platform's proxy hops, it either reads a forged address (the client escapes the limit by changing it) or reads the proxy's own address (every visitor shares one count and the first busy visitor blocks everyone). This is why the per-IP limit is conditional on the plan confirming the platform's forwarding (FR-027).
- **Visitors sharing one address.** Several visitors behind one network address (an office, a school, a mobile carrier) share one count; the limit is set well above a normal visit, measured by the plan, so a handful of them together are not refused.
- **Cached responses across deploys.** The demo's data is identical on every start, but a later deploy may change the recording or the seed; a browser cache must not keep a visitor on the old data longer than the cache lifetime the plan documents.
- **A client that reconnects on its own.** The server cannot stop a script, or a frontend that reconnects automatically, from opening a new connection after the time limit; each new connection simply counts against the limit of 5 and gets its own 10 minutes. Reconnecting only by the visitor's action is the frontend's behaviour (frontend spec 003).
- **The frontend offers a pair with no cache.** With all six ordered pairs seeded, a coach 503 in demo mode means the frontend offered a combination outside them (for example a lap number the recording does not have); the periodic summary's 503 count makes that visible to the maintainer (FR-028).
- **The existing 503 body.** The coach's 503 message says to configure `ANTHROPIC_API_KEY`. It is part of the contract and stays unchanged here; how the frontend presents it to a visitor belongs to the frontend's spec 003.

## Requirements *(mandatory)*

### Functional Requirements

**Mode and configuration**

- **FR-001**: The server MUST have a demo mode, switched on by configuration and off by default. With demo mode off, the behaviour of the server, the recorder, the replayer, the analyze tool and the test suite MUST be identical to today's, including the required ports, their error messages, `npm run dev` and the `DB_PATH` semantics.
- **FR-002**: In demo mode, the server MUST listen on the single port given by the hosting platform's port variable and MUST NOT require `WS_PORT`, `UDP_PORT` or `HTTP_PORT`. A missing or invalid required demo setting MUST stop the server at startup with a clear message naming it (constitution, principle II).
- **FR-003**: In demo mode, the server MUST refuse to start when `ANTHROPIC_API_KEY` is set, with a clear message.
- **FR-004**: In demo mode, the server MUST NOT open, modify or delete `data/telemetry.db`; it uses a database of its own, and every start begins from an empty one, regardless of anything left on disk.

**Replay of the recording**

- **FR-005**: In demo mode, the server MUST replay the published recording (Release `sample-recording-v1`, file `demo-interlagos-tt-20hz-laps6-8.jsonl`) from inside its own process, at `1x`, in a loop, for as long as it runs, feeding the same parsing, persistence and live broadcast as a UDP packet would.
- **FR-006**: In demo mode, the server MUST NOT open any UDP socket.
- **FR-007**: The recording MUST NOT be committed to git. The demo MUST obtain it from the published Release and MUST verify it against the SHA-256 published in the README before using it; on a missing file or a mismatch it MUST refuse to run with a clear message.
- **FR-008**: The data visible to visitors MUST be bounded and stable across passes: one session, the recording's completed laps with the times, sectors and validity of a local `1x` replay, and per-lap sample counts that do not change after the first full pass.
- **FR-009**: In demo mode, before answering its first request after a start, the server MUST have the whole session in place: the recording's completed laps and all their samples, equal to what a full `1x` pass stores, with no sample lost. The health endpoint (FR-017) MUST report not ready until then. The plan measures the time this adds to startup.

**Session dates and duration**

- **FR-010**: In demo mode, the session's start time MUST be the capture time (`receivedAt`) of the recording's first packet, its last-seen time the capture time of the recording's last packet, and each lap's recorded time the capture time of the packet that completed it. These values MUST NOT change while the replay loops or across restarts. If the recording lacks those capture times, the server MUST refuse to start rather than invent them (constitution, principle IV). The payload shapes do not change.
- **FR-011**: In local mode, the session's dates and duration MUST behave as today. The game's session time is not adopted as a time base by this feature, because it goes back on a flashback (spec 004).

**Coach**

- **FR-012**: In demo mode, the coach MUST answer seeded pairs from the cache and MUST answer any other pair with the existing 503 status and body, with no outbound call and no write.
- **FR-013**: At every start in demo mode, the coach cache MUST be seeded from a file versioned in the repository. The file MUST identify the recording it was produced from, and a mismatch with the recording in use MUST stop the server with a clear message.
- **FR-014**: The repository MUST provide and document a procedure for the maintainer to produce the seed file locally, once, against a disposable database, logging the token usage of each call. It MUST NOT run in the CI or the test suite. Running it is a manual task of the maintainer; tasks of this feature MUST NOT require the agent to make any paid call.

**No writes or costs from visitors**

- **FR-015**: In demo mode, no request or message from a client, on any route, method or channel, MAY write to the database or trigger a call to a paid service. The only writes are those of the server's own replay and of the seeding at startup. This guarantee MUST hold for a client that sends any `Origin` header, or none, so it MUST NOT depend on the origin rule of FR-018.

**Hosting**

- **FR-016**: In demo mode, REST and WebSocket MUST be served on the same single port. The WebSocket messages and the REST payloads MUST keep their current shapes; the only change in content is the one in FR-025.
- **FR-017**: The API MUST expose a health endpoint that reports success only when the demo is ready to serve visitors and failure otherwise, and that does not depend on the request's origin. In local mode it MAY exist; it MUST NOT change any other route.
- **FR-018**: In demo mode, CORS MUST allow only the frontend's configured origin, and the WebSocket handshake MUST be refused for any browser origin other than that one. This rule only limits use from browsers, since a client outside a browser chooses its own `Origin` header; it is not an access control, and the documentation MUST say so. In local mode, any origin remains allowed, as today.
- **FR-019**: The repository MUST provide a build command that compiles the server to JavaScript using a build configuration of its own, separate from the type check, and a start command that runs the compiled output with no TypeScript runtime. `npm run dev` and `npm run typecheck` MUST keep working as today.

**Contract and documentation**

- **FR-020**: Every change visible to the frontend MUST be listed in the plan so the frontend's types and configuration can follow (constitution, principle VI). Known so far: the new health endpoint (addition), the single-port WebSocket address in demo mode (configuration), CORS restricted in demo mode, the demo session's date and duration values (FR-010), the "demo full" and "time limit" close codes and reasons (FR-023, FR-024), the demo's live messages carrying only the player's car with `playerCarIndex` 0 (FR-025, a contract change despite the unchanged shape), HTTP caching headers on the demo's read responses (FR-026), the 429 status for a client over the per-IP limit if FR-027 is adopted, and no change to any existing route, error string or WebSocket message shape.
- **FR-021**: `README.md` and `CLAUDE.md` MUST describe the demo mode, the build and start commands and the seed procedure as built, and the "no `build`, `start`" statement in `CLAUDE.md` MUST be updated in the same change. Limitations introduced by demo mode MUST be added to Known limitations in both files, and so MUST the existing local-mode behaviour that replaying an old recording stretches that session's duration to the current time.
- **FR-022**: No runtime dependency MAY be added without a reason stated in the plan (constitution, principle V).

**Live stream capacity**

- **FR-023**: In demo mode, the server MUST limit the number of simultaneous WebSocket connections, configurable, with a default of 5. A connection beyond the limit MUST be accepted and closed immediately with a close code and a reason specific to the demo ("demo full"), so a browser can tell why; REST MUST keep working for that visitor. In local mode there is no limit, as today. The limit protects against many simultaneous visitors only, not against the volume of each connection.
- **FR-024**: In demo mode, the server MUST close each WebSocket connection when it reaches a maximum duration, configurable, with a default of 10 minutes, using a close code and a reason specific to the demo ("time limit"), distinct from "demo full". The server MUST NOT reopen it; a new connection is a new visit, subject to FR-023 and to its own time limit. In local mode there is no time limit, as today.
- **FR-025**: In demo mode, each WebSocket message MUST carry only the player's car in its data array, with `playerCarIndex` set to 0. This is a contract change even though the message shape is the same, and MUST be documented as such in `README.md` wherever it describes the WebSocket payload (today, "all 22 cars per message" under Features, and the contract-ownership note; the README has no dedicated contract section yet) and in the list of FR-020. In local mode the array keeps all 22 cars and the game's `playerCarIndex`, as today.

**REST volume**

- **FR-026**: In demo mode, the read endpoints' responses MUST carry HTTP caching information that lets a browser reuse or revalidate them without downloading the body again, with a cache lifetime documented by the plan that also bounds how long a visitor can see data from a previous deploy. The coach's POST and the health endpoint MUST NOT be cacheable. In local mode, the caching behaviour stays as today (Express's default validators only; see "Current behaviour", item 3).
- **FR-027**: In demo mode, REST requests MUST be limited per client IP address, answering 429 beyond the limit, under these conditions: the plan MUST confirm how the hosting platform forwards the visitor's real address and MUST configure the server's proxy trust with the exact number of hops, so that a forged `X-Forwarded-For` neither escapes the limit nor makes all visitors count as one; the limit MUST sit well above the number of requests of a normal visit, which the plan measures; the health endpoint is not limited. If the platform's forwarding cannot be confirmed, this requirement is dropped, only FR-026 applies, and the plan records the reason. In local mode there is no limit, as today.

**Observability**

- **FR-028**: In demo mode, the server MUST NOT write the per-packet log lines it writes today, and MUST log these events instead: the start and the time until ready; each new pass of the loop; each WebSocket connection opened and closed, with the reason (normal, "demo full", "time limit"); each 429 response, if FR-027 is adopted; and, every 15 minutes, a summary with the number of active connections, the bytes sent since start over WebSocket, over REST and their sum, and the number of coach 503 responses since start. The byte counts are the application's own count, not the platform's billing figure. No full IP address MAY be written to the log. In local mode, the logs stay as today.

### Key Entities *(include if feature involves data)*

- **Demo configuration**: the setting that turns demo mode on, the port assigned by the platform, the frontend's allowed origin, and where the recording comes from. Distinct from the local `.env` ports.
- **Demo recording**: the published Interlagos recording (13,960 packets, 222.8 s, laps 6–8, SHA-256 in the README), the only telemetry source in demo mode; identified by its checksum.
- **Demo session**: the single session the replay produces from the recording; its laps, samples and reported dates are what visitors see.
- **Coach seed file**: a versioned file holding, for each offered lap pair, the analysis text, the insights it was produced from and the model, plus the identity of the recording it belongs to.
- **Health status**: whether the demo is ready (data built, seed loaded, replay running), as reported to the hosting platform.
- **Live connection (demo mode)**: one visitor's WebSocket connection; counts against the limit of simultaneous connections (default 5), lives at most the maximum duration (default 10 minutes), receives only the player's car, and ends with a normal close, "demo full" or "time limit".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In demo mode, from the first request answered after any start, the history shows exactly 1 session with laps 6, 7 and 8 whose times, sectors, validity and per-lap sample counts match a local `1x` replay of the recording (2,411 per-distance samples in total).
- **SC-002**: After at least 20 consecutive loop passes (about 75 minutes), the session count, lap count, lap times and per-lap sample counts equal those after the first full pass, and the session's reported duration has changed by 0 minutes.
- **SC-003**: After 3 restarts in a row, each starting with no database, visitors see the same session, laps and dates rule every time.
- **SC-004**: A scripted battery that hits every route and method, with valid and malformed inputs, cached and non-cached pairs, WebSocket client messages and UDP traffic, changes 0 rows in any table and causes 0 outbound calls to Anthropic.
- **SC-005**: Every seeded comparison is answered as cached; every other comparison returns 503; both in under 1 second.
- **SC-006**: From the frontend's origin, REST and the live stream both work on the single port; from another browser origin, 0 REST responses are readable and 0 WebSocket handshakes succeed.
- **SC-007**: With demo mode off, the test suite and the type check pass, and the spec 001 validation still delivers every lap and all 2,411 predicted samples at `1x`.
- **SC-008**: The health endpoint reports not ready until the demo can serve visitors, and ready from then on, checked once by probing during and after startup.
- **SC-009**: The server starts from the compiled output with the documented build and start commands and runs without any TypeScript runtime.
- **SC-010**: The demo session's start is 2026-10-16 16:30:23 UTC and its displayed duration is 4 min, read after the first pass, after 20 passes and after a restart.
- **SC-011**: With 5 live connections open, a sixth receives the "demo full" close code and reason within 1 second and can still load the history; after one of the 5 closes, a new connection succeeds.
- **SC-012**: In demo mode, a live connection receives on average no more than 50 KiB/s over a full pass (47.1 KiB/s measured for the player's car alone, against 791.6 KiB/s today), and is closed with the "time limit" close code and reason 10 minutes after it opened, having received no more than 30 MiB.
- **SC-013**: In demo mode, a second load of the same pages by the same browser downloads 0 response bodies again for unchanged read endpoints (served from cache or revalidated), while the coach's POST and the health endpoint are answered fresh every time.
- **SC-014**: If FR-027 is adopted: a scripted normal visit, repeated by the plan's measured margin, never receives 429; a client exceeding the limit receives 429; the same client sending forged `X-Forwarded-For` values keeps one count; and two clients from different addresses are counted separately.
- **SC-015**: Over one hour of demo mode with visitors, the log holds 0 per-packet lines, one summary every 15 minutes whose WebSocket, REST and total byte counts are each non-zero when traffic occurred, a coach 503 count of 0 while visitors use only the six cached pairs, and no full IP address.

## Assumptions

- **Hosting (to be confirmed by the plan against the platform's documentation).** Free web instance; sleeps after 15 minutes without inbound traffic and takes about a minute to wake; temporary disk lost on restart; a single public port given by the `PORT` variable; WebSocket supported on that port; memory limits large enough for the recording and the database. Whether an open WebSocket counts as inbound traffic, and so keeps the instance awake, is not known and does not change the requirements: sleeping and waking must be harmless either way.
- **Budget zero.** No paid service runs in demo mode. The only paid step is the maintainer's one-off generation of the seed file, bounded by the spending limit set in the Anthropic Console.
- **Data.** The published recording has no flashback, and its laps are 6, 7 and 8, so the flashback and Time Trial out-lap limitations do not affect the demo; fixing them is spec 004.
- **Coach semantics.** An analysis is directional: the pair (8, 7) and the pair (7, 8) are different cache entries, as today.
- **CI.** The CI keeps its `typecheck` and `test` checks unchanged. Whether the build is also verified in the CI is a plan decision; adding a required check follows the check-names rule in `CLAUDE.md`.
- **Approved by the maintainer (clarify session 2026-10-21).** Demo mode refuses to start with an API key present (FR-003) rather than ignoring it; the WebSocket handshake follows the same origin rule as CORS (FR-018); the existing 503 body stays unchanged.
- **Suggestions for frontend spec 003** (recorded here, decided there): show the "demo full" and "time limit" closes to the visitor; reconnect only by the visitor's action; close the connection when the tab is hidden.
- **Out of scope.** The frontend's production configuration and its "server is waking up" notice (frontend spec 003); the deploy itself and the links in both READMEs (the next step); flashback and out-lap handling (spec 004); changing how local mode reports session dates (only documented as a known limitation); the game's session time as a time base (spec 004).
- Commits follow the project rule: spec, plan and tasks are committed (`docs:`) before any implementation, with Conventional Commits and no `Co-Authored-By` trailer.
