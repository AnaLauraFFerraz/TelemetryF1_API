# Feature Specification: Real-time replay of telemetry recordings

**Feature Branch**: `001-realtime-replay`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Replay em tempo real de gravações de telemetria. Hoje o replayer envia todos os pacotes de uma gravação o mais rápido possível, o que estoura o buffer UDP e perde de 67% a 79% das amostras; além disso, o dashboard não pode ser acompanhado ao vivo durante um replay. Quero reproduzir uma gravação respeitando o intervalo original entre os pacotes, com opção de velocidade (1x, 2x e o modo máximo atual) e de repetir a gravação em loop, para a demo pública. Hoje, reexecutar a mesma gravação duplica amostras no banco; esse comportamento precisa ser definido. Precisa funcionar com a gravação de exemplo de Interlagos (20 Hz) e ser testável sem o jogo."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Replay a recording at its original speed (Priority: P1)

A maintainer who does not have the game running wants to work against realistic data. They start the server, then replay a recording. The recording is re-sent at the pace it was captured at, so the ingestion side receives it exactly as it would receive a live session: no burst, no lost packets, and the complete set of laps and per-distance samples ends up stored.

**Why this priority**: this is the root cause of the current defect. Today a replay delivers only 21–33% of the expected samples, which makes every chart and every lap analysis derived from a replay untrustworthy. Honouring the original interval fixes the data loss and is also the prerequisite for the two stories below.

**Independent Test**: replay the Interlagos example recording at original speed against a fresh database and compare the stored laps and sample counts with the content of the recording file. Delivers value on its own: a usable offline dataset.

**Acceptance Scenarios**:

1. **Given** the ingestion side is running and a recording captured at 20 Hz, **When** the maintainer replays it at original speed, **Then** every packet in the file is delivered and none is dropped for lack of receive capacity.
2. **Given** the Interlagos example recording spanning 3 min 43 s of wall clock, **When** it is replayed at original speed, **Then** the replay takes approximately the same 3 min 43 s and reports how many packets it sent.
3. **Given** a completed original-speed replay, **When** the stored laps are inspected, **Then** the laps, their times, sectors and validity match what the recording contains, as they already do today.
4. **Given** a completed original-speed replay, **When** the stored per-distance samples are inspected, **Then** their number matches what the decimation rule would keep for that recording, instead of a fraction of it.
5. **Given** a recording whose packets were captured with gaps (the car sitting in the garage, a pause), **When** it is replayed at original speed, **Then** those gaps are reproduced rather than collapsed.

---

### User Story 2 - Choose the replay speed (Priority: P2)

The maintainer does not always want to wait for a full real-time replay. They can pick the speed: original speed, twice as fast, or the current "as fast as possible" mode, and the choice is stated when the replay starts.

**Why this priority**: original speed solves correctness but costs the full duration of the recording. A faster-than-real-time option keeps the short feedback loop that the current tool provides, while the unpaced mode has to stay available because it is still the quickest way to reach the end of a long recording when sample fidelity does not matter.

**Independent Test**: replay the same recording three times, once per speed, and compare each run's elapsed time against the recording's own duration.

**Acceptance Scenarios**:

1. **Given** a recording of known duration, **When** it is replayed at twice the speed, **Then** it finishes in about half that duration and the interval between consecutive packets is halved rather than removed.
2. **Given** no speed is stated, **When** the replay starts, **Then** it runs at original speed and says so.
3. **Given** the unpaced mode is selected, **When** the replay runs, **Then** it behaves as the tool does today and the maintainer is warned that most samples will be lost.
4. **Given** an unsupported speed is requested, **When** the replay starts, **Then** it stops with a message listing the accepted values instead of silently falling back.

---

### User Story 3 - Loop a recording for the public demo (Priority: P3)

For the public demo there is nobody driving. A recording is replayed in a loop so a visitor who opens the dashboard at any moment sees a session in progress, with the live stream updating and laps completing.

**Why this priority**: it is the motivation for the feature, but it depends on both stories above being in place, and the demo deployment itself is a separate piece of work. A single pass already lets the dashboard be followed live.

**Independent Test**: start a looped replay of the example recording, confirm the dashboard keeps receiving updates past the end of the first pass, and let it run for several passes while watching what the stored data does.

**Acceptance Scenarios**:

1. **Given** a looped replay, **When** the recording reaches its end, **Then** it starts again from the beginning without the operator intervening, and each pass is announced.
2. **Given** a looped replay running for several passes, **When** the stored data is inspected, **Then** laps are overwritten pass over pass and no new per-distance samples are added after the first pass, per FR-010 and FR-011.
3. **Given** a looped replay, **When** the operator stops it, **Then** it shuts down cleanly, reporting how many passes and packets it sent.
4. **Given** a looped replay in progress, **When** a visitor opens the dashboard mid-pass, **Then** they see live updates within the next few seconds, without having to wait for the pass to restart.

---

### Edge Cases

- A recording whose first entry is not at time zero, or whose entries are not in chronological order: the replay must not stall or send packets in the wrong order.
- A recording with a very large gap between two packets, which happens when the capture was left running: at original speed the gap is honoured, which can look like a frozen replay, so the replay reports that it is waiting.
- A truncated or corrupt line at the end of a recording, which happens when the recorder was killed mid-write: the line is skipped with a message and the replay continues.
- An empty recording, or a file that is not a recording: the replay stops with a clear message before sending anything.
- The ingestion side is not running: the packets go nowhere. The replay cannot detect this over a connectionless transport, so it must not claim success in a way that hides it.
- A recording whose session identity already exists in storage from an earlier run: covered by FR-010.
- The operator interrupts a replay mid-pass: a partial session is left stored, which is acceptable, and the next replay must behave according to FR-010 rather than failing.
- The Time Trial out-lap in the example recording shares its lap number with the first flying lap, which is a known pre-existing limitation of the analysis. This feature reproduces the recording faithfully and neither fixes nor worsens it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The replay tool MUST re-send each packet of a recording at the offset it was captured at, so the interval between any two consecutive packets is preserved rather than collapsed.
- **FR-002**: The replay tool MUST accept a speed selection with three values: original speed, twice the original speed, and unpaced (the current behaviour). Original speed MUST be the default when none is given.
- **FR-003**: The replay tool MUST accept a loop option that restarts the recording from the beginning when it reaches the end, and MUST default to a single pass.
- **FR-004**: The replay tool MUST keep the timing error from accumulating: the elapsed time of a paced replay MUST stay within 2% of the recording's own duration divided by the selected speed, however long the recording is.
- **FR-005**: The replay tool MUST preserve the order of the packets in the recording, including packets sharing the same capture offset.
- **FR-006**: The replay tool MUST report, when it starts, the recording it is replaying, the selected speed, whether it will loop, and the recording's packet count and duration; and MUST report, when it ends or is interrupted, the number of packets and passes sent.
- **FR-007**: The replay tool MUST reject an invalid invocation — missing file, unreadable file, unsupported speed, empty recording — with a message that names the problem, before sending any packet.
- **FR-008**: The replay tool MUST skip an unparsable line in a recording, log it, and continue, instead of aborting the replay.
- **FR-009**: The replay tool MUST shut down cleanly on an interruption, including in the middle of a wait between packets and in the middle of a loop pass.
- **FR-010**: Replaying a recording MUST be idempotent at the sample level: a per-distance sample already stored for a packet MUST NOT be stored again when that same packet is seen again, whether in a second replay run or in a later pass of the same looped run. The identity used to recognise "the same packet" MUST be the session together with the packet's `overallFrameIdentifier` — a counter that never repeats within a session and does not reset or go backwards on a flashback — rather than session time or lap distance, which do go backwards on a flashback (see the known limitation covered by spec 002). Storing this identifier on every per-distance sample is a new requirement on the sample tables; existing databases MUST be migrated rather than left unreadable.
- **FR-011**: A looped replay MUST reuse the same stored session for every pass, matching the recording's own fixed session identity. A lap reported in pass 2 MUST overwrite the equivalent lap from pass 1, exactly as the existing per-lap upsert already does for a single pass. Once FR-010's deduplication is in place, a pass that resends exactly the packets of a previous pass MUST NOT add new sample rows — this depends on the per-lap decimation decision (which samples are kept) being deterministic, so it reaches the same decision for the same packet on every pass; this determinism MUST be verified before the feature is considered complete.
- **FR-012**: The live stream MUST stay usable for the whole duration of a paced replay, so a dashboard connected to it is updated continuously rather than in a single burst.
- **FR-013**: The pacing behaviour MUST be covered by two layers of automated tests, neither requiring the game: (a) unit tests of the pacing decision as a pure function — which packet is due at which elapsed time, for each speed, and across a loop boundary; and (b) an integration test that replays a small synthetic recording through the real ingestion path and asserts the resulting lap count and per-distance sample count, including that a second pass over the same synthetic recording adds no new samples. The integration test MUST use an isolated, disposable database and an OS-assigned port, and MUST complete quickly enough to run on every `npm test` invocation without flaking.
- **FR-014**: The replay tool MUST work with the Interlagos example recording (13,960 packets, 222,839 ms, 20 Hz send rate) without any change to the recording format, so recordings captured before this feature remain replayable.

### Key Entities *(include if feature involves data)*

- **Recording**: an ordered list of captured packets, each with the raw packet bytes, its size and the offset in milliseconds since the start of the capture. Written by the existing recorder; this feature only reads it and does not change its format.
- **Replay run**: one execution of the tool over one recording, with a selected speed and a loop setting. Has a start, a packet count, a pass count and an end, and is reported to the operator.
- **Pass**: one complete traversal of a recording inside a replay run. A single-pass run has exactly one; a looped run has an unbounded number.
- **Stored session data**: the sessions, laps and per-distance samples the ingestion side writes. Shared with live ingestion from the game, which is why FR-010 deduplicates by packet identity (`overallFrameIdentifier`) rather than by anything replay-specific — the same rule protects a live session that happens to receive a duplicated UDP packet.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A replay at original speed delivers at least 99% of the recording's packets to the ingestion side, up from the 21–33% of samples that survive today.
- **SC-002**: The number of per-distance samples stored after an original-speed replay of the Interlagos example recording is within 2% of the number the decimation rule predicts for that recording. Running the same recording a second time, in a separate replay, adds zero new sample rows.
- **SC-003**: An original-speed replay of the Interlagos example recording (3 min 43 s) finishes within 2% of that duration; the 2x replay finishes within 2% of 1 min 52 s.
- **SC-004**: A dashboard connected during a paced replay receives updates continuously for the whole replay, with no gap longer than one second where the recording itself has none.
- **SC-005**: A looped replay runs for at least 30 consecutive passes (about 2 hours of the example recording) without operator intervention, without failing, and without the sample count growing after the first pass.
- **SC-006**: Lap times, sectors and validity after an original-speed replay match the recording exactly, as they already do with the unpaced replay today — the fix must not regress what already works.
- **SC-007**: The pacing behaviour is covered by automated tests (pacing-logic unit tests plus one ingestion integration test) that run with the project's existing test command, complete in a few seconds, and need neither the game nor a recording of several minutes.
- **SC-008**: The two replay-related known limitations currently listed in the documentation (most samples lost in a fast replay; duplicate samples when the same recording is replayed twice) are either removed because they are fixed, or restated to describe only what still holds.

## Assumptions

- The speed and loop settings are given when the replay is started, following the existing tools' pattern of taking their input from the command line. No interface for controlling a replay while it is running is in scope.
- The three speeds are exactly the ones named: original, 2x and unpaced. An arbitrary multiplier is not required, and the unpaced mode keeps its current lossy behaviour rather than being made lossless.
- The recording format is unchanged, so every existing recording stays replayable. The recorder itself is not touched.
- Deploying and hosting the public demo is a separate piece of work. This feature delivers the replay capability the demo needs, not the demo.
- Fixing the multiple-passes-per-lap problem (flashbacks and the Time Trial out-lap sharing a lap number) stays out of scope and remains a known limitation.
- The replay keeps sending to the ingestion side on the loopback address and on the configured port, as it does today.
- The session's start and last-seen timestamps still reflect the replay's wall clock, not the original capture time; this is pre-existing and accepted.
- A replay with nothing listening is a legitimate situation during development and must not be treated as an error, since the transport gives no feedback either way.
- The pacing accuracy expected is that of ordinary timers on a developer machine, not a real-time guarantee; a few milliseconds of jitter per packet is acceptable as long as it does not accumulate (FR-004).
- The example recording referred to throughout is `recordings/demo-interlagos-tt-20hz-laps6-8.jsonl`, which is present on the development machine but not in version control, since recordings are not committed.
- The sample deduplication key (FR-010) assumes `overallFrameIdentifier` is unique per session across the whole recording, including across a flashback — this already holds today per the protocol's own design and per the known limitation this project documents about `frameIdentifier` diverging from `overallFrameIdentifier` on a flashback.
- Deduplicating by `overallFrameIdentifier` requires storing it on `car_telemetry_samples` and `motion_samples`, which did not carry it before this feature; the migration for pre-existing databases is addressed in the plan, not in this spec.
- The integration test added for FR-013 uses a disposable database and an OS-assigned port so it can run alongside other tests without clashing with a developer's own `data/telemetry.db` or the ports in `.env`.
