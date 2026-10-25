# Feature Specification: Fix the coach's input

**Feature Branch**: `004-coach-input`

**Created**: 2026-10-23

**Status**: Implemented; pull request #13

**Input**: User description (verbatim, as given to `/speckit-specify`):

> Spec da API: corrigir a entrada do coach.
>
> Contexto: na spec 003 (modo demo, branch 003-demo-mode, PR #12 em rascunho), a mantenedora gerou os seis textos do coach para a demo e reprovou o arquivo na leitura: cinco dos seis textos tinham erros de interpretação. A investigação no código, os erros e as causas estão registrados no research.md daquela branch. Leia com git show 003-demo-mode:specs/003-demo-mode/research.md (seções "T061 — the first coach seed, rejected" e "Analysis engine observations") e o arquivo reprovado em C:\Telemetry\evidence-003\coach-seed-v1-reprovado.json, só leitura. Esta spec começa da main e não depende da branch 003.
>
> Os problemas, em resumo:
> - quatro textos trataram o totalDeltaS como diferença contra o recorde pessoal, porque a mensagem do coach não diz quais voltas estão sendo comparadas, o prompt diz que a comparação é "normalmente a melhor volta" e a linha seguinte é o recorde;
> - um texto inverteu sinais que o prompt documenta, e o sinal de peakBrakeDiff não está documentado;
> - os textos inventam uma numeração "Curva N", que o front nunca mostra: o front mostra chips "1. 334m · +0.29s" (posição no ranking das três maiores perdas e ápice em metros, regra de topOpportunities em Telemetry-F1/src/utils/coachInsights.ts);
> - textos afirmaram trail braking com o campo false, citaram "setor" sem dado e descreveram coasting como derrapagem.
>
> O que a spec precisa cobrir (o quê e por quê; o como fica para o plano):
> - A mensagem do coach diz quais voltas estão sendo comparadas, com os tempos oficiais e a diferença oficial entre elas, e deixa claro que todos os deltas são contra a volta de comparação. O recorde aparece rotulado só como contexto.
> - O código entrega ao coach uma leitura determinística das até três oportunidades, na mesma regra e ordem do front, com a direção de cada diferença já escrita em palavras e com o mesmo rótulo que o visitante vê. O coach só explica; ele não ordena, não numera e não interpreta sinais.
> - O prompt proíbe a numeração inventada, menções a setores e afirmações que contradigam os campos (por exemplo, trail braking quando o campo é false), e explica o que é coasting.
> - Uma identificação da versão do prompt, derivada automaticamente do prompt e da montagem da mensagem, exportada para a spec 003 usar no arquivo de cache. A mudança no formato do arquivo de cache da demo fica na spec 003, não nesta.
> - O cache local de análises (lap_analyses) hoje ignora o prompt e o modelo, então textos de um prompt antigo continuam sendo servidos. Marque como NEEDS CLARIFICATION se a versão do prompt e o modelo entram na chave do cache local; se entrarem, há uma migração que roda no banco real, e o backup antes é obrigatório.
> - O que não dá para garantir por teste (se o modelo obedece) continua dependendo da leitura humana dos textos, e a spec diz isso.
>
> Fora do escopo: os artefatos do motor de análise (outra spec, logo depois desta), o modo demo e o arquivo de cache da demo (spec 003), qualquer mudança no front.
>
> Regras: nenhuma chamada paga; o que exigir a chave (por exemplo, medir os tokens do prompt novo) é tarefa manual da mantenedora. O .env do repositório tem a chave: qualquer comando que carregue o dotenv roda com DOTENV_CONFIG_PATH apontando para um .env sem chave, depois da conferência true/false, que tem de imprimir false. Nada aponta para o data/telemetry.db. Commits com os tipos da lista fechada da constituição, sem trailer Co-Authored-By; PR sem rodapé "Generated with". Edição só com Edit e Write. A documentação se refere à mantenedora pelo papel.
>
> Quando terminar, commite a spec como docs:, sem trailer, e me mostre o resumo: os requisitos e as perguntas abertas.

## Background (read in the code, `main` at `6fa1837`)

Facts this spec builds on. The rejected file and its analysis are in `003-demo-mode:specs/003-demo-mode/research.md`, sections "T061 — the first coach seed, rejected" and "Analysis engine observations"; the file itself stays outside the repository.

- **What the coach receives today.** The user message (`src/coaching/coachUserMessage.ts`) is, at most, two context lines — "Recorde pessoal do piloto nesta pista" and "Volta teórica na pista (melhores setores combinados…)" — followed by `JSON.stringify(insights)`. It names neither the primary lap nor the comparison lap, nor their official times. `analysisRouter` knows `lapA` and `lapB` but does not pass them on.
- **What the prompt says** (`src/coaching/coachPrompt.ts`): the comparison lap is "normalmente a melhor volta do próprio piloto"; `totalDeltaS` is the total time the primary lap is slower; the signs of `brakingPointDiffM` and `throttleOnDiffM` are stated correctly; the sign of `peakBrakeDiff` is not stated (in the code it is primary − comparison, positive = the primary braked harder, `src/analysis/brakingAnalysis.ts`); the coach itself is told to pick the three corners with the largest positive `deltaLossS`; the example title is "Curva 4 - freada tardia".
- **The benchmark** (`getTrackBenchmark`, `src/persistence/lapRepository.ts`) is the best valid lap over every session on the track, and carries its session id and lap number. In the demo recording, the personal best (1:13.372) is lap 8 itself, one of the compared laps.
- **`totalDeltaS` is not the official difference** of the lap times and is not symmetric between (A, B) and (B, A) (research.md, observation 1). Fixing it belongs to the analysis-engine spec; this spec only stops the coach from presenting it as the lap-time difference.
- **What the visitor sees** (frontend, read-only): coach chips labelled `<rank>. <round(apexDistance)>m · +<deltaLossS with 2 decimals>s` (`Telemetry-F1/src/components/coach/CoachPanel.tsx:65`), the rank coming from `topOpportunities` (`Telemetry-F1/src/utils/coachInsights.ts`: corners with `deltaLossS > 0`, sorted by `deltaLossS` descending with a stable sort, first three). The frontend never shows a corner number or a sector attributed to a corner.
- **The local cache** (`lap_analyses`) is unique on `(session_id, lap_a, lap_b)`; it stores the model but ignores it on read, and stores nothing about the prompt. A text produced by an old prompt keeps being served (Known limitation in `CLAUDE.md` and `README.md`).

## Clarifications

### Session 2026-10-23

- Q: Do the prompt version and the model become part of the `lap_analyses` key? → A: Option B. The key stays `(session_id, lap_a, lap_b)`; each row records the prompt version and the model that produced it. A row whose prompt version or model differs from the current ones is stale: with the API key configured, it is generated again and replaced; without it, the request answers 503 instead of serving the old text. Rows that already exist, with no prompt version, are stale. It is the same rule as the export of the demo's seed file. The migration runs on the real database at the first start of the new version, so a backup with `VACUUM INTO` comes before it, as a documented manual task of the maintainer.
- Q: Does the theoretical-best line ("Volta teórica na pista (melhores setores combinados…)") stay in the coach's message? → A: Option B. It is removed from the coach's message; the calculation stays in the code for its other uses.
- Maintainer addition to FR-013: the prompt version must be the same whatever the checkout's line endings. The repository is cloned on Windows with `core.autocrlf`, so the prompt text in a `.ts` file can arrive with CRLF on the maintainer's machine (where the export runs) and with LF on the hosting platform (where demo mode checks it); a hash over raw line breaks would make demo mode refuse its own seed file. Line breaks are normalized before the version is computed, with a success criterion checking the same result for CRLF and LF text.
- Q: When the track's personal best changes after a text was cached, does that text become stale? → A: The question no longer applies: the personal best is removed from the coach's message, like the theoretical best. It was the source of the main error of the rejected seed (the comparison lap confused with the personal best), it would add one more dimension of cache staleness, and the coach's job is to compare two laps. The text depends only on the two compared laps. The personal best's calculation and its display stay in the code and on screen. (Corrected at the plan review: what stays is the calculation and the `GET /sessions/:id/benchmark` endpoint; no frontend code displays the track benchmark — research.md, section 1. FR-004 states it.)
- Q: Does the coach's message say whether each of the two compared laps is valid or invalid in the game? → A: Option A, yes. Added: when the comparison lap is invalid, the deterministic reading written by the code says that the time it gains over the primary lap is not a target, because it may come from a stretch where the track was cut; the model is not left to conclude this on its own. The prompt forbids stating where or why a lap was invalidated.
- Q: Should there be a no-cost way to print, for a pair of laps, the exact message the coach would receive and the prompt version, so the maintainer reads the input before paying for the export? → A: Option A. `npm run analyze` also prints the coach's message and the prompt version, with no paid call. When the agent runs it, it uses a temporary database; against the real database, the maintainer runs it. Recorded as work for spec 003 when it resumes, not for this spec: a `--dry-run` in the export tool that prints the six exact messages the coach would receive and the prompt version, built from the recording as the real export does, with no call; it becomes a mandatory step before T061, so the maintainer reads the input before paying.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The coach compares the right laps (Priority: P1)

A driver (or a demo visitor) asks for the analysis of lap A against lap B. The text opens with the official difference between those two laps, names them, and never presents a delta as a difference against anything but the comparison lap. The coach is not told the personal best or any other benchmark, so it cannot confuse one with the comparison lap.

**Why this priority**: four of the six rejected texts failed here, and the opening sentence is the first thing the reader sees; a wrong reference lap makes every number after it suspect.

**Independent Test**: build the coach message for a synthetic pair of laps with known official times, with a track benchmark present in the database, with no API call, and check that it names both laps, gives both official times and their difference with its direction in words, states that every delta is against the comparison lap, and contains neither the personal best nor the theoretical best.

**Acceptance Scenarios**:

1. **Given** lap 7 (1:14.144) as primary and lap 6 (1:14.306) as comparison, **When** the message is built, **Then** it names lap 7 as the primary and lap 6 as the comparison, gives both times, and states the official difference as 0.162 s with the primary faster, in words.
2. **Given** the track's personal best is lap 8 of the same session and the pair is (8, 6), **When** the message is built, **Then** it is the same message as with no benchmark at all: neither the personal best nor the theoretical best appears in it.
3. **Given** two databases holding the same two laps but different track benchmarks, **When** the message is built for that pair in each, **Then** the two messages are identical.
4. **Given** the pair (7, 6), where lap 6 (the comparison lap) is invalid, **When** the message is built, **Then** it says lap 6 is invalid and lap 7 valid, and the reading says that the time lap 6 gains over lap 7 is not a target, because it may come from a stretch where the track was cut.
5. **Given** the pair (6, 7), where only the primary lap is invalid, **When** the message is built, **Then** it says lap 6 is invalid and carries no "not a target" statement.
6. **Given** the prompt and message of this spec, **When** the maintainer reads a generated text, **Then** the opening sentence states the official difference between the two compared laps (human check, see FR-016).

---

### User Story 2 - The coach explains the same opportunities the visitor sees (Priority: P1)

The visitor sees up to three chips, for example "1. 334m · +0.29s". The coach's text covers the same opportunities, in the same order, with the same labels, and states each braking and throttle difference in the right direction, because the code already wrote the direction in words.

**Why this priority**: the inverted signs, the inconsistent "Curva N" numbers and the two different corners both called "Curva 1" all come from the coach doing the ranking, numbering and sign reading itself.

**Independent Test**: build the message from synthetic insights whose ranking, ties, signs and `null`s are known, and compare the deterministic reading to the expected labels, order and direction phrases.

**Acceptance Scenarios**:

1. **Given** insights with five corners, three of them with positive `deltaLossS`, **When** the message is built, **Then** it contains exactly three opportunities, ordered by `deltaLossS` descending, each labelled exactly as the frontend chip would be for the same insights (for example `1. 334m · +0.29s`).
2. **Given** an opportunity whose `brakingPointDiffM` is +179.97, **When** the message is built, **Then** the reading says in words that the primary lap braked 179.97 m later than the comparison lap; a negative value says earlier.
3. **Given** `peakBrakeDiff` positive, **When** the message is built, **Then** the reading says the primary lap braked harder; negative, softer.
4. **Given** `throttleOnDiffM` −10.6, **When** the message is built, **Then** the reading says the primary lap was back on the throttle 10.6 m earlier than the comparison lap.
5. **Given** two corners with equal `deltaLossS`, **When** the message is built, **Then** they keep their order in the insights, as the frontend's stable sort does.
6. **Given** no corner with positive `deltaLossS`, **When** the message is built, **Then** it states that no corner lost time against the comparison lap and lists no opportunity.

---

### User Story 3 - The prompt forbids what the rejected texts invented (Priority: P2)

The coach's instructions forbid corner numbers of its own, mentions of sectors not in the data, and statements that contradict a field (trail braking when the field is `false`), and explain coasting as time with neither brake nor throttle, not wheelspin or a slide.

**Why this priority**: these were the remaining errors in the rejected texts; they matter, but the deterministic reading of Story 2 removes most of the room for them.

**Independent Test**: tests over the prompt text check that each instruction is present (the prohibitions, the coasting definition, the sign of each difference, the use of the given labels and order); whether the model obeys is not testable (FR-016).

**Acceptance Scenarios**:

1. **Given** the new prompt, **When** it is read, **Then** it tells the coach to refer to each opportunity only by the label given, in the order given, and never to number or name corners otherwise.
2. **Given** the new prompt, **When** it is read, **Then** it forbids attributing time to sectors, and forbids any statement contradicting a field (example: trail braking with the field `false`).
3. **Given** the new prompt, **When** it is read, **Then** it defines coasting as time with neither brake nor throttle between the apex and the exit, and says it is not wheelspin or a slide.
4. **Given** the new prompt, **When** it is read, **Then** it no longer says the comparison lap is "normally the best lap", and it tells the coach to open with the official difference given in the message.

---

### User Story 4 - A prompt version that the demo can check (Priority: P2)

The demo's coach seed (spec 003) must be refused when it was produced by a different prompt. This spec provides a prompt version identifier that changes by itself whenever the prompt or the message building changes, so nobody has to remember to bump it.

**Why this priority**: it is what spec 003 needs to refuse a stale seed; it has no visible effect on its own.

**Independent Test**: compute the identifier twice and on a modified prompt or message builder, with no API call.

**Acceptance Scenarios**:

1. **Given** the same code, **When** the identifier is computed twice, in two processes, **Then** it is the same.
2. **Given** a change of one character in the system prompt, **When** the identifier is computed, **Then** it differs.
3. **Given** a change in how the message is built that changes the message produced for the same input, **When** the identifier is computed, **Then** it differs.

---

### User Story 5 - The local cache stops serving texts of an old prompt (Priority: P3)

A driver who analysed a pair before this change asks for it again. Today the old text, written from the old prompt, comes back as `cached: true`.

**Why this priority**: it affects only local databases that already hold analyses, and it brings a migration on the real database (FR-014).

**Independent Test**: on a disposable database, insert cached rows with the current prompt version and model, with another prompt version, with another model and with no prompt version, then request each pair with a fake coaching function (no paid call), with and without the key configured.

**Acceptance Scenarios**:

1. **Given** a cached row with the current prompt version and model, **When** the pair is requested, **Then** the stored text is served with `cached: true`, with or without the key.
2. **Given** a cached row with a different prompt version, a different model, or no prompt version, and the key configured, **When** the pair is requested, **Then** a new text is generated, replaces the row (recording the current prompt version and model), and is served with `cached: false`.
3. **Given** the same stale row and no key configured, **When** the pair is requested, **Then** the request answers 503 and the old text is not served.
4. **Given** a real database created before this feature, **When** the new version starts for the first time, **Then** the migration adds what the rows need to record the prompt version, keeps every existing row (now stale), and the maintainer's backup with `VACUUM INTO`, taken beforehand as documented, still holds the original database.

---

### Edge Cases

- One of the compared laps has telemetry samples but no row in the laps table (for example a lap not completed): the message states that its official time is unknown and gives no official difference; the prompt tells the coach not to state one. No time is estimated from samples (constitution, principle IV).
- The comparison lap has no row in the laps table: its validity is unknown, the message says so, and no "not a target" statement is made (it is made only when the game marked the lap invalid).
- Both laps are invalid: the message says so for each, and the "not a target" statement applies, since the comparison lap is invalid.
- The two official times are equal: the difference is stated as zero, in words, with no "faster" or "slower".
- A difference field (`brakingPointDiffM`, `peakBrakeDiff`, `throttleOnDiffM`) is `null`: the reading omits that aspect for that opportunity; it says neither "unknown" nor a direction.
- A difference field is exactly zero: the reading says "the same" (no earlier/later, harder/softer).
- `trailBrakingPrimary` and `trailBrakingComparison` are both `false`: the reading says neither lap trail-braked; the prompt forbids saying otherwise.
- `lineDeviation` is `null` for an opportunity: omitted, as today.
- Fewer than three corners with positive `deltaLossS`: only those are read, ranked 1..n.
- Insights from today's engine with the observations of research.md (shared ±80 m windows, braking start at the apex): the reading states what the fields say; correcting the fields is the analysis-engine spec's job.

## Requirements *(mandatory)*

### Functional Requirements

**The laps being compared**

- **FR-001**: The coach's message MUST name the primary lap and the comparison lap by their lap numbers, and give each one's official lap time (the game's lap time, as stored for the lap) and whether the game marked it valid or invalid, or say that these are unknown.
- **FR-001a**: When the comparison lap is invalid, the deterministic reading MUST say, in words written by the code, that the time the comparison lap gains over the primary lap is not a target to chase, because it may come from a stretch where the track was cut. The model is not left to draw this conclusion.
- **FR-002**: When both official times are known, the message MUST state the official difference (primary − comparison, in seconds with millisecond precision) with its direction written in words (primary slower, faster, or the same time).
- **FR-003**: The message MUST state that every delta and difference in the data is the primary lap against the comparison lap, and nothing else.
- **FR-004**: The coach's message MUST NOT contain the personal best or any other track benchmark; it depends only on the two compared laps (their numbers, official times and insights). The track benchmark's calculation and the endpoint that serves it (`GET /sessions/:id/benchmark`) stay as they are; only the coach stops receiving it. (No frontend code requests that endpoint: the best lap the visitor sees is the session's own, from the laps list.)
- **FR-005**: The coach's opening sentence is instructed to state the official difference from FR-002, never `totalDeltaS`; when the official difference is unknown, the prompt tells the coach not to state a lap-time difference.

**The opportunities, read by the code**

- **FR-006**: The message MUST carry a deterministic reading of up to three opportunities, chosen and ordered by the same rule as the frontend's `topOpportunities`: corners with `deltaLossS > 0`, by `deltaLossS` descending, ties kept in insights order, first three.
- **FR-007**: Each opportunity MUST be labelled with the text the visitor sees on its chip: `<rank>. <apexDistance rounded to the metre>m · +<deltaLossS with two decimals>s`, character for character, for the same insights.
- **FR-008**: For each opportunity, the reading MUST state in words the direction of `brakingPointDiffM` (earlier/later braking), `peakBrakeDiff` (harder/softer braking), `throttleOnDiffM` (earlier/later back on the throttle), whether each lap trail-braked, and the coasting time of each lap, using only values present in the insights; `null` values are omitted and zero values read as "the same".
- **FR-009**: The reading MUST introduce no number that is not in the insights or in the official lap times (constitution, principle III); the only derived number is the official difference of FR-002.
- **FR-010**: The insights returned to the frontend and the REST response shape (`analysis`, `insights`, `cached`) MUST NOT change; the reading exists only in the coach's message.

**The prompt**

- **FR-011**: The prompt MUST tell the coach to explain the opportunities given, by their labels and in their order, and MUST forbid it to rank, renumber or name corners in any other way (no "Curva N").
- **FR-012**: The prompt MUST forbid mentioning sectors, stating where or why a lap was invalidated (there is no data about it), and statements that contradict a field (for example trail braking when the field is `false`); MUST define coasting as time with neither brake nor throttle between the apex and the exit, not wheelspin or a slide; MUST state the sign of each difference, including `peakBrakeDiff`; and MUST no longer describe the comparison lap as "normally the best lap".

**Prompt version**

- **FR-013**: The coaching module MUST export a prompt version identifier derived automatically from the system prompt and from the message building (any change to the prompt text or to the message produced for the same input changes it), stable across runs and across platforms for the same code, with no manual bump. Line breaks MUST be normalized before the identifier is computed, so the same prompt gives the same identifier whether the checkout has CRLF (the maintainer's Windows clone with `core.autocrlf`, where the export runs) or LF (the hosting platform, where demo mode checks it). Spec 003 uses it in the demo's seed file; the seed file's format is changed in spec 003, not here.

**Local cache**

- **FR-014**: The local analysis cache MUST keep its key `(session_id, lap_a, lap_b)` and MUST record, on each row, the prompt version (FR-013) and the model that produced it. A row whose prompt version or model differs from the current ones, or that has no prompt version (every row written before this feature), is stale: with the API key configured, the request generates a new text and replaces the row; without it, the request answers 503 and the old text is not served. A row with the current prompt version and model is served as today. This is the same staleness rule as the export of the demo's seed file (spec 003).
- **FR-014a**: The schema change MUST be applied automatically to an existing database at the first start of the new version, keeping the existing rows. Because it runs on the real database, a backup with `VACUUM INTO` comes before it, as a manual task of the maintainer documented in the README; the backup is kept until this feature merges (`CLAUDE.md`, Rules). The agent never runs the migration or the backup against `data/telemetry.db`. Since the message no longer depends on the benchmark (FR-004), the change removes the `lap_analyses` limitation from Known limitations in `CLAUDE.md` and `README.md`.
- **FR-015**: The theoretical-best line ("Volta teórica na pista (melhores setores combinados…)") MUST be removed from the coach's message, so the coach sees no sector at all; the theoretical-best calculation stays in the code for its other uses.

**What tests cannot prove**

- **FR-016**: Automated tests MUST cover the message building, the deterministic reading, the presence of each instruction in the prompt and the prompt version, with no paid call. Whether the model follows the instructions cannot be tested: the texts generated from this prompt MUST still be read and approved by the maintainer before they are published (the demo seed of spec 003 included), and the documentation MUST say so.
- **FR-016a**: `npm run analyze -- <sessionId> <lapA> <lapB>` MUST print, besides the insights, the exact message the coach would receive for that pair and the current prompt version, with no paid call and without needing the API key. When the agent runs it, `DB_PATH` points at a temporary database (FR-018); against the real database, the maintainer runs it.

**Constraints of the work**

- **FR-017**: No step of this feature makes a paid call. Measuring the new prompt's token count needs the API key and is a manual task of the maintainer; until it is measured, the documentation MUST NOT keep the old figure (1,378 tokens) as the current prompt's size — it says the size is not yet measured.
- **FR-018**: Any command run by the agent that loads the dotenv configuration MUST point `DOTENV_CONFIG_PATH` at a `.env` without the key, after a check that prints `false` for the key's presence; nothing in this feature's tests or manual checks points at `data/telemetry.db`.

### Key Entities

- **Compared pair**: the primary lap and the comparison lap, each with its lap number, official lap time and validity (or unknown), the official difference between them, and the "not a target" statement when the comparison lap is invalid.
- **Opportunity reading**: one of up to three corners chosen by the frontend's rule, with its rank, its chip label, and each difference stated in words.
- **Prompt version**: an identifier derived from the system prompt and the message building, computed after normalizing line breaks, exported for the demo's seed file.
- **Cached analysis** (`lap_analyses`): the stored text, insights, model and prompt version of a pair, keyed by `(session_id, lap_a, lap_b)`; stale when its prompt version or model differs from the current ones or its prompt version is missing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For each of the six ordered pairs of laps 6, 7 and 8 of the demo recording's session, the coach message names both laps, both official times and the official difference matching the lap times (74.306, 74.144, 73.372 s) to the millisecond, each lap's validity as stored (lap 6 invalid), the "not a target" statement exactly in the pairs whose comparison lap is lap 6, and no benchmark, checked by a test or with `npm run analyze` (FR-016a).
- **SC-002**: For every set of insights in the tests, the opportunity labels in the message are character-identical to the frontend chip labels computed by the same rule, in the same order.
- **SC-003**: 100% of the non-null braking and throttle differences in the reading carry a direction phrase consistent with the sign of the field, checked by tests covering positive, negative, zero and `null`.
- **SC-004**: The prompt version identifier is identical across two runs and changes for every modification in the tests' set (prompt text, message building).
- **SC-004a**: The prompt version identifier computed from the prompt text with CRLF line breaks equals the one computed from the same text with LF line breaks, checked by a test.
- **SC-004b**: In the tests, 100% of stale cached rows (other prompt version, other model, no prompt version) are never served: they are replaced when a (fake) coach is available and answer 503 when the key is absent.
- **SC-005**: No paid call is made by the agent at any step; the tests pass with no API key configured.
- **SC-006**: When the maintainer reads texts generated with this prompt (in the demo seed, after the analysis-engine spec), none has a delta against the personal best, an inverted sign, a corner number of its own, a sector, a trail-braking claim against a `false` field, or coasting described as wheelspin. This criterion is verified by human reading, not by tests.

## Assumptions

- The official lap time is the stored lap time (from the game's `lastLapTimeInMS`), which takes precedence over values reconstructed from samples (constitution, principle IV); a lap's validity is the stored flag the game reported for it.
- The reading is written in Brazilian Portuguese, the language the coach answers in; the exact phrasing is a plan decision.
- The full insights JSON is still sent to the coach alongside the reading; the reading adds an interpretation, it does not replace the data.
- The frontend rule (`topOpportunities` and the chip label) is the one on the frontend's current `main`; if it changes, the reading must follow it, and the frontend is not changed by this spec.
- The model (`claude-opus-4-8`) is not changed by this spec.
- The values themselves (`totalDeltaS`, the shared ±80 m windows, the braking start at the apex, the corner count depending on the primary lap) are the analysis-engine spec's subject; this spec makes the coach read them correctly, not makes them right.
- The demo's seed file, its `formatVersion` 2 and its check of the prompt version at start are spec 003's work; the seed is generated once, after this spec and the analysis-engine spec are merged.
- Recorded for spec 003 when it resumes (not a requirement of this spec): a `--dry-run` in the export tool that prints the six exact coach messages and the prompt version, built from the recording as the real export does, with no call; a mandatory step before T061.
- The REST and WebSocket contract does not change (FR-010), so the frontend needs no update. With FR-014, a pair that was answered from the cache can now answer 503 without the key (its row is stale); the 503 status and body already exist for uncached pairs, so the frontend sees nothing new.
