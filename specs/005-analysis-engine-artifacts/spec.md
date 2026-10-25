# Feature Specification: Fix the analysis engine's artifacts

**Feature Branch**: `005-analysis-engine-artifacts`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description (verbatim, as given to `/speckit-specify`):

> Spec da API: corrigir os artefatos do motor de análise.
>
> Contexto: na spec 003 (modo demo, branch 003-demo-mode, PR #12 em rascunho), a leitura dos textos do coach levou a uma investigação que encontrou números suspeitos nos insights do motor de análise. A spec 004 (já na main) corrigiu como o coach lê os insights, mas não os insights em si: o coach agora explica com clareza o que o motor calcula, inclusive o que pode ser artefato. As observações estão no research.md da branch 003: leia com git show 003-demo-mode:specs/003-demo-mode/research.md, seção "Analysis engine observations". As seis mensagens da demo, com os insights atuais, estão em specs/004-coach-input/research.md, seção 4, na main.
>
> As observações, ainda hipóteses coerentes com o código, não medidas:
> - o totalDeltaS não é simétrico e não bate com a diferença oficial: (6,7) dá +0.28 e (7,6) dá -0.20, contra 0.162 s oficiais; (7,8) dá +0.72 e (8,7) dá -0.65, contra 0.772 s;
> - curvas vizinhas com ápices próximos (por exemplo a 334 m e a 399 m) caem em janelas de busca de ±80 m que se sobrepõem e pegam o mesmo ponto, produzindo freada, pico e retomada de acelerador idênticos;
> - o início da freada para no ápice quando o freio soltou antes dele, gerando diferenças de 100 a 190 m e combinações como "freou 179.97 m depois" com "freou mais leve (1)";
> - a mesma retomada de acelerador é atribuída a curvas vizinhas;
> - a volta 6 como principal detecta 12 curvas, e as outras, 7.
>
> O que a spec precisa cobrir (o quê e por quê; o como fica para o plano):
> - Investigação primeiro: antes de qualquer correção, os dados crus da gravação publicada nas curvas suspeitas mostram, para cada observação, se ela é artefato do motor ou se aconteceu de fato na pista. A spec diz que nenhuma correção é feita sobre uma hipótese não confirmada.
> - Os insights de uma curva descrevem aquela curva, e não um ponto compartilhado com a vizinha.
> - O início da freada e a retomada do acelerador refletem o que as amostras mostram, ou o campo fica nulo quando não puder ser determinado, em vez de um valor inventado.
> - Propriedades que um motor correto precisa ter, como critérios de sucesso: a simetria entre comparar A com B e B com A, dentro de uma tolerância; a coerência do delta total com a diferença oficial de tempo de volta, ou a decisão explícita de não expô-lo; e o número de curvas detectadas não depender de qual volta é a principal sem uma razão registrada.
> - O que muda nos insights muda a entrada do coach: registre que a spec 003 regenera o arquivo de cache depois desta spec, e que o PROMPT_VERSION não muda por causa dela (os insights entram na comparação com tolerância, não na versão).
> - O front tem uma cópia do algoritmo do delta acumulado (o gráfico "Delta acumulado"). Uma mudança no algoritmo do backend deixa a cópia do front diferente: registre isso como dependência de uma spec do front, sem mudar o front aqui.
>
> Fora do escopo: o front, o modo demo e o arquivo de cache da demo (spec 003), o prompt e a mensagem do coach (spec 004, já feita), o flashback e a out-lap (a spec do flashback), exceto o que a investigação mostrar que é necessário para entender a diferença no número de curvas da volta 6, registrado como achado.
>
> Regras: nenhuma chamada paga. O .env do repositório tem a chave: qualquer comando que carregue o dotenv roda com DOTENV_CONFIG_PATH apontando para um .env sem chave fora do repositório, depois da conferência true/false, que tem de imprimir false. Nada aponta para o data/telemetry.db, que ainda não passou pela migração da spec 004: toda investigação usa um banco temporário montado a partir da gravação publicada. Commits com os tipos da lista fechada da constituição, sem trailer Co-Authored-By; PR sem rodapé "Generated with". Edição só com Edit e Write, nunca com shell. A documentação se refere à mantenedora pelo papel.
>
> Quando terminar, commite a spec como docs:, sem trailer, e me mostre o resumo: os requisitos, os critérios de sucesso e as perguntas abertas.

## Background (read in the code, `main` at `7dc6685`)

Facts this spec builds on. The observations and their numbers are in `003-demo-mode:specs/003-demo-mode/research.md`, section "Analysis engine observations" (computed by `buildInsights` on the published recording, code references at `ef19bf4`); the six demo messages with today's insights are in `specs/004-coach-input/research.md`, section 4. None of the causes below has been measured; they are readings of the code consistent with the numbers.

- **The published recording** is `demo-interlagos-tt-20hz-laps6-8.jsonl` (release `sample-recording-v1`, README): a Time Trial at Interlagos at a 20 Hz send rate, laps 6 (74.306 s, invalid), 7 (74.144 s) and 8 (73.372 s). A 1x replay into a temporary database stores 2,411 car telemetry and 2,411 motion samples (797 / 801 / 793 for laps 6–8, 20 for lap 9). The stored resolution is about one sample every 4 m (decimation at 4 m or 500 ms, README); no point along the lap can be located more precisely than that.
- **`totalDeltaS`** is the last value of the cumulative delta series (`src/analysis/buildInsights.ts`), which normalizes each lap by its own first stored sample's `sessionTime` and clamps the comparison lap's time at its own first and last samples (`src/analysis/segmentDelta.ts`). The three pairs measured: (6,7) +0.28 / (7,6) −0.20 against an official ±0.162; (7,8) +0.72 / (8,7) −0.65 against ±0.772; (6,8) +0.93 / (8,6) −0.92 against ±0.934 — so one pair out of three is already close to symmetric and to the official difference.
- **Corners are detected on the primary lap only** (`detectCorners`, `src/analysis/cornerDetection.ts`): with lap 6 as primary, 12 corners; with lap 7 or 8, 7. So (A, B) and (B, A) can describe different corners.
- **Braking and throttle per corner** look for the "equivalent" apex in each lap as the slowest sample within ±80 m of the primary lap's apex (`findApexIndexNear`, `src/analysis/sampleSearch.ts`; `CORNER_SEARCH_WINDOW_M` in `brakingAnalysis.ts` and `throttleAnalysis.ts`). Two corners whose apexes are less than 160 m apart share part of their windows.
- **The braking start** (`findBrakingStartIndex`) walks back from the apex only while the previous sample is braking above 0.1: when the brake is off at the apex, the braking start is the apex itself. `brakingStartDistance` equals `apexDistance` in 10 of 12 corners with lap 6 primary, 6 of 7 with lap 7, 4 of 7 with lap 8.
- **The throttle pick-up** (`findThrottleOnIndex`) walks forward from the apex to the first sample at full throttle (0.9), with no limit at the next corner.
- **The same two functions define the corner's own bounds** (`Corner.brakingStartDistance`, `Corner.exitDistance`), which in turn bound `deltaLossS` (`cornerLoss`) and the line deviation summary. So an artifact in the braking start or the throttle pick-up also changes `deltaLossS`, which decides the coach's opportunities and the frontend's chips.
- **The insights are part of the REST contract**: `POST /sessions/:id/analysis` answers `{ analysis, insights, cached }` (`src/http/routes/analysisRouter.ts`), and the frontend mirrors `LapInsights` by hand (`Telemetry-F1/src/types/rest.ts`: `brakingStartDistance: number`, `exitDistance: number`, `totalDeltaS: number`). The frontend uses `corner.brakingStartDistance` and `corner.exitDistance` to highlight the selected corner on its charts (`SessionAnalysisPage.tsx`), shows `apexDistance` and `deltaLossS` on the coach chips, and does not display `totalDeltaS`.
- **The frontend has its own copy of the delta algorithm** (`Telemetry-F1/src/components/chart/computeDelta.ts`, drawn as the "Delta acumulado" chart); the backend's `segmentDelta.ts` says it is an intentional port of it.
- **The prompt version** (`src/coaching/promptVersion.ts`) is a hash of the system prompt and of the coach messages built from three fixed, synthetic `REFERENCE_INPUTS`, not from real insights. Changing the engine's *values* does not change it. Changing the *shape* of `LapInsights` (a field removed or renamed) changes the reference inputs and therefore the version, and changing a field's *meaning* would need the prompt to describe it differently (it says today, line 14 of `coachPrompt.ts`, that `totalDeltaS` "não é a diferença oficial de tempo de volta; não o cite"), which also changes the version.
- **The local analysis cache** (`lap_analyses`, spec 004) marks a row stale only when its prompt version or model differs from the current ones; it returns the insights stored with the row, not freshly computed ones.

## Clarifications

### Session 2026-10-24

- Q: When a corner's braking start or throttle pick-up cannot be determined in the primary lap, do the corner's bounds (`brakingStartDistance`, `exitDistance`) become nullable, or do they stay numbers? → A: They stay numbers. The two roles `brakingStartDistance` holds today are separated: the driver's behaviour (where the lap began to brake, where it was back on full throttle) and the corner's bounds (the stretch the frontend highlights and over which `deltaLossS` is measured). The corner's stretch is defined by the corner itself and always has a numeric value; only the behaviour differences become `null` when they cannot be determined. If the plan concludes that a field's name became misleading, renaming it is a plan decision, recorded as a contract change and as a dependency of the frontend spec.
- Q: Is `totalDeltaS` corrected or removed from the insights? → A: Decided in the plan, after the investigation, with this recorded preference: correct it if the cause is confirmed and a definition exists that agrees with the official difference within the tolerance; remove it only if none does. Either way, the impact on the prompt and on `PROMPT_VERSION` is stated in the plan. Added with this answer: the investigation also checks each corner's `deltaLossS`, which comes from the same delta series and is what picks and orders the opportunities the coach explains; the symmetry property holds corner by corner, not only for the total.
- Q: Does this feature make the `lap_analyses` rows cached before it stale? → A: One rule for both caches (the local `lap_analyses` and the demo's seed file). A cached analysis is valid while its prompt version, its model and its insights are the current ones; the stored insights are compared with freshly computed ones by the same tolerance rule as the demo's seed file. A row whose insights differ is stale: with the key, it is generated again; without the key, the request answers 503. This changes spec 004's staleness rule and holds for any future change to the engine, with no manual clean-up.
- Q: The tolerance rule FR-018 reuses (`insightsMatch`: structural comparison, numbers within 0.01 + 1e-9) exists only on the unmerged `003-demo-mode` branch (`src/demo/insightsMatch.ts`); where does it come from on `main`? → A: Option A. This feature brings the function and its tests to `main` in a neutral module (for example under `src/coaching/`, since the local cache is not demo code), with the same rule; the commit message says where it came from (`src/demo/insightsMatch.ts` on `003-demo-mode`). Spec 003 is not rebased (its branch is published): when spec 003 is updated with `main`, it imports this module and deletes its own copy; the path of that update is recorded in spec 003's `tasks.md`.
- Q: Are the properties measured on the six pairs of the published recording (SC-002–SC-006) checked by an automated test or by a manual check recorded in `research.md`? → A: Both, options A and C together. (1) Synthetic tests for each case the investigation finds. (2) A cut of the published recording, versioned as a test fixture: the decimated samples of the three whole laps (not only the suspect corners, because the total delta against the official difference needs the whole lap), only the fields the engine uses, generated by a reproducible script that records the SHA-256 of the source recording; the plan measures its size and sets a ceiling. The tests on the cut check properties (no point shared between corners, symmetry corner by corner and in total, total delta against the official difference within the tolerance, corner count), not exact values. (3) The exception to the rule "recordings stay out of git" is recorded where that rule is written, with the reason: the cut has none of the packets the engine does not use, is small, and comes from data already public as a Release asset; if the rule is in the constitution, the plan proposes the amendment, which would also remove the Sync Impact Report from the top of that file and evaluate adding `refactor:` to the commit types. (4) The six-pair check with the documented command stays, its output recorded in `research.md` before and after the correction. (Read at the clarify: the rule is written in `CLAUDE.md`, Rules — "`.env`, `data/` and `recordings/` are gitignored" — in `.gitignore` and in the README's "published as a release asset (not committed to git)", not in the constitution, so no amendment is triggered; see FR-015c.)
- Q: If the investigation shows that lap 6's extra corners come from the out-lap or a flashback, is the recorded reason enough for the corner-count criterion, or must this spec make (6, x) and (x, 6) describe the same corners? → A: **Cancelled on 2026-10-25** (see the entry of that date below): the answer that follows applied only if the cause were the out-lap or a flashback, and the investigation (research.md, section 6.1) showed it is neither. Original answer, kept for the record: Option C. The recorded reason is enough, symmetry is required on the corners present in both directions, and the fix belongs to the flashback spec; in addition, the test on the recording cut checks that the extra corners exist only in the pairs where lap 6 is the primary, with a comment saying it describes a known limitation and that the flashback spec inverts it when it fixes the cause. This holds only if the investigation confirms the out-lap or a flashback as the cause; if the extra corners come from anything else, they are this spec's subject again. Demo impact, recorded: the frontend always uses the most recent lap as the primary (`Telemetry-F1/src/pages/sessionAnalysis/SessionAnalysisPage.tsx:62`, `laps[laps.length - 1]`, read on the frontend's `main` at `9334f87`), so no visitor sees lap 6 as the primary; the texts of (6, 7) and (6, 8) go into the seed file but are not shown on screen.
- Q: If this spec changes the cumulative delta algorithm, must the frontend spec that ports the change be live before the demo is published, or is a temporary divergence acceptable? → A: Option A, with option D's condition built in. Blocking only for publishing the demo: this spec merges on its own, but spec 003 does not publish the demo until the frontend spec is live with the new algorithm; the dependency is recorded in both specs. It applies only if the plan changes the cumulative delta algorithm; if it does not, the dependency does not apply and that is recorded. Also recorded, as an alternative for the frontend spec to evaluate: instead of porting the new algorithm to the frontend's copy, the API delivers the delta series ready-made and the frontend stops computing it, removing the duplication — a contract change, to be decided in that spec, together with the same way out already recorded for the opportunity rule (`specs/004-coach-input/research.md`, section 2, "Known debt").

### Session 2026-10-25 (after the investigation)

- Q: The investigation found no out-lap and no flashback in lap 6 (research.md, section 6.1); five of its twelve corners come from the prominence test, and the rest of the difference is real driving. How do (A, B) and (B, A) relate to corners now? → A: A corner is a place on the track, not a behaviour of the driver. The same pair of laps has the same set of corners in (A, B) and in (B, A); what changes between laps is what each lap did in each corner. The rule accepted on 2026-10-24 (extra corners only when lap 6 is the primary, with a test describing the defect) is cancelled, because it applied only if the cause were the out-lap or a flashback, and it is not. The design presents the options for reaching the same set of corners (detecting on both laps and matching the apexes, using the track's geometry from the motion positions, or another), together with the correction of the prominence test, the evidence on the recording cut, and a recommendation.
- Q: How are "the lap did not brake" and "it could not be determined" told apart? → A: They are different facts: the investigation showed that a lap lifting where another brakes is common (near 2,050 m, near 2,496 m and at T2). The design proposes how to represent it in the contract and in spec 004's coach reading, stating the impact on `PROMPT_VERSION`, the frontend and the demo's seed file, with the alternative of keeping only `null`.
- Q: Which definition corrects `totalDeltaS`? → A: Alternative 2 of research.md, section 2.3: each lap's start extrapolated to 0 m from its first two samples, both laps evaluated at the last distance they both cover. It uses the data already stored and errs by at most 0.021 s, less than the interval between samples. Alternative 3 (the game's lap start) is recorded and rejected because it depends on a field the samples do not store. `deltaLossS` is measured over the same stretch in both directions. The plan states the impact on the prompt (which today tells the coach not to cite `totalDeltaS`) and on `PROMPT_VERSION`.
- Recorded with these answers: the frontend's copy of the delta algorithm is identical to the backend's, so the "Delta acumulado" chart already shows the error today (0.28 against 0.162 s at the end of (6, 7), and 0.13 s off in (8, 7), a pair the demo shows); the frontend spec fixes an error already visible, and the dependency blocks publishing the demo. The design decides the rounding of the recording cut at the data's real precision and its ceiling, from the 690 KB of JSON and 124 KB compressed measured.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Each suspect number is classified before anything is changed (Priority: P1)

The maintainer, before accepting any change to the engine, reads, for each of the five observations, what the recording's own samples show around the suspect corners: whether the driver really braked 180 m earlier, really never reached full throttle between two corners, really took a different number of corners, or whether the engine made it up. Only observations confirmed as engine artifacts are fixed.

**Why this priority**: the observations are hypotheses read from the code. Fixing an engine behaviour that turns out to describe what happened on track would replace a true number with a false one; the constitution forbids inventing values (principle IV).

**Independent Test**: from a temporary database built from the published recording, the investigation record lists each observation with its verdict and the samples (distance, speed, brake, throttle, time) that support it, and the maintainer can re-run the same reading and get the same samples.

**Acceptance Scenarios**:

1. **Given** observation 2 (corners at 334 m and 399 m with identical values in (6,7)), **When** the investigation reads both laps' samples between the two corners, **Then** it records which sample each corner's analysis used in each lap and whether the two corners are two corners on the track, one corner seen twice, or undeterminable.
2. **Given** observation 3 (braking start equal to the apex), **When** the investigation reads the brake trace before each such apex, **Then** it records whether the lap braked for that corner, where the braking began and ended, and whether the reported difference (for example −179.97 m) matches anything on the track.
3. **Given** observation 5 (12 corners with lap 6 primary, 7 otherwise), **When** the investigation compares lap 6's speed trace with laps 7 and 8, **Then** it records the extra corners' distances and the reason they are detected (driving, out-lap or flashback samples, noise), as a finding; a fix that belongs to the flashback spec is recorded there, not made here.
4. **Given** an observation the investigation finds to be real driving, **When** the plan is written, **Then** no requirement changes that behaviour, and the record says so.

---

### User Story 2 - A corner's insights describe that corner (Priority: P1)

Someone reading the analysis of a pair, on screen or through the coach, gets braking, peak braking and throttle values for each corner that come from that corner, and gets "unknown" instead of a number when the samples do not show it.

**Why this priority**: shared points between neighbouring corners and braking starts that fall on the apex produce the 100–190 m differences the coach explains as facts; they also move the corner bounds and therefore `deltaLossS`, which picks the three opportunities.

**Independent Test**: on synthetic laps built so that two corners are close, a lap releases the brake before the apex, a lap never brakes for a corner, and no full throttle occurs between two corners, the insights of each corner use points inside that corner only and give `null` where the samples do not determine the value.

**Acceptance Scenarios**:

1. **Given** two corners whose apexes are 65 m apart, each with its own braking and its own minimum speed, **When** the insights are built, **Then** each corner's braking start, apex and throttle pick-up in each lap are different samples, inside that corner's own stretch.
2. **Given** a lap that braked from 150 m before the apex to 30 m before it and then released, **When** the braking start is determined, **Then** it is the sample where that braking began, not the apex.
3. **Given** a corner where one of the two laps did not brake at all (a lift, or flat out), **When** the insights are built, **Then** the braking-point difference for that corner is `null`, not a difference between a braking point and an apex.
4. **Given** two corners with no full-throttle sample between them in a lap, **When** the insights are built, **Then** the first corner's throttle pick-up in that lap is not the second corner's: it is `null` for the first corner (or determined by a rule that stays inside the first corner), and the two corners never report the same pick-up.
5. **Given** a confirmed artifact that changed a corner's bounds, **When** the insights are rebuilt, **Then** `deltaLossS` and the line deviation of that corner are measured over the corrected bounds.

---

### User Story 3 - Comparing A with B and B with A tells the same story (Priority: P2)

The analysis of (7, 6) and of (6, 7) describe the same corners, with opposite differences of the same size, and the total delta either agrees with the official lap-time difference or is not offered as a number.

**Why this priority**: an analysis that changes its corners and its numbers when the two laps are swapped cannot be explained to a visitor; but it depends on Stories 1 and 2 (shared points and false braking starts are themselves sources of asymmetry).

**Independent Test**: for the six ordered pairs of laps 6, 7 and 8 of the published recording, built in a temporary database, compare each pair with its reverse and with the official times.

**Acceptance Scenarios**:

1. **Given** the pairs (A, B) and (B, A), **When** both insights are built, **Then** they describe the same corners (same count and apexes within the stated tolerance).
2. **Given** a corner present in both directions with a non-null difference in both (`deltaLossS` included), **When** the two values are compared, **Then** one is the negative of the other within the stated tolerance.
3. **Given** a pair with official times known, **When** the total delta is reported, **Then** it agrees with the official difference within the stated tolerance, or it is not reported (decision recorded, see FR-012).

---

### Edge Cases

- A corner where both laps did not brake: braking-point and peak-brake differences are reported as the samples show (no braking point in either lap → braking-point difference `null`; peak braking 0 in both → peak difference 0), with no invented braking point.
- A corner where only one lap braked: braking-point difference `null`; the peak-brake difference is still a measured fact (one lap at some peak, the other at 0) and is kept.
- A lap that brakes twice before one apex (a dab, then the main braking): the investigation records which one the engine uses; the rule chosen is recorded in the plan.
- A corner near the start/finish line, where one lap's samples begin after the other's: values that would need samples outside the lap are `null`.
- A comparison lap missing samples in a corner (gap larger than the stated tolerance): the values that depend on them are `null`.
- The out-lap of a Time Trial sharing its `lap_number` with the first flying lap, and a flashback inside a lap (known limitation): out of scope; the investigation found neither in the published recording (research.md, section 6.1).
- A lap that lifts where the other brakes (common in the recording: near 2,050 m, near 2,496 m, at T2): the corner exists for both laps (it is a place); the lap that did not brake has no braking point, which is a fact, not an unknown (representation decided in the plan).
- Two laps with equal official times: the total delta's expected value is zero.
- A cached analysis whose laps no longer have samples: its insights cannot be recomputed, so it cannot be confirmed as current; it is not served, and the request answers as today for a pair without samples.
- A pair answered from the local cache before this feature, without the key: after it, the row is stale and the request answers 503, a status and body the frontend already handles for uncached pairs.

## Requirements *(mandatory)*

### Investigation first

- **FR-001**: Before any change to the analysis code, the investigation MUST read, for each of the five observations, the samples of the published recording around the suspect corners — both the samples stored after decimation (what the engine sees) and, where they differ, the recording's own packets — and record the samples it relies on (distance, speed, brake, throttle, time) in this feature's `research.md`.
- **FR-002**: Each observation MUST receive one recorded verdict: an artifact of the engine (with the code that produces it), something that happened on track, an effect of decimation or sample resolution, or undeterminable from the data.
- **FR-003**: No correction MUST be made for an observation not confirmed as an engine artifact by FR-002. An observation found to be real driving is left as it is and stays recorded; an undeterminable one is recorded as open, with no change.
- **FR-004**: The investigation MUST include the reason lap 6 as primary yields 12 corners and laps 7 and 8 yield 7, recorded as a finding even when the cause is the out-lap or a flashback; fixing those belongs to the flashback spec.
- **FR-005**: The investigation MUST run on a temporary database built from the published recording with no sample loss (the 2,411 car telemetry and 2,411 motion samples of a 1x replay), never on `data/telemetry.db`.

### Each corner describes itself

- **FR-006**: The points a corner's insights use in each lap (equivalent apex, braking start, throttle pick-up) MUST lie within that corner's own stretch of track; two corners of the same insights MUST NOT use the same sample of the same lap as their apex, their braking start or their throttle pick-up.
- **FR-007**: A lap's braking start for a corner (driver behaviour) MUST be the sample where the braking that precedes that corner's apex began, within the corner's stretch; when the lap did not brake for that corner, its braking start is unknown and the braking-point difference is `null`.
- **FR-008**: A lap's throttle pick-up for a corner (driver behaviour) MUST be the first full-throttle sample after the apex within the corner's stretch; when none exists before the next corner's stretch begins, it is unknown and the throttle difference is `null`.
- **FR-009**: The two roles the corner's `brakingStartDistance` holds today MUST be separated: the driver's behaviour (FR-007, FR-008) and the corner's bounds — the stretch the frontend highlights and over which `deltaLossS` and the line deviation summary are measured. The corner's stretch MUST be defined by the corner itself, not by where a lap braked or accelerated, and MUST always have numeric bounds (`brakingStartDistance` and `exitDistance` stay `number` in the contract); only the behaviour differences become `null` when undeterminable. If the plan concludes that a field's name became misleading (for example `brakingStartDistance` for a bound that is no longer a braking point), renaming it is a plan decision, recorded as a contract change and as a dependency of the frontend spec (FR-016).
- **FR-010**: Unknown values MUST be `null`, never estimated (constitution, principle IV); fields that already allow `null` keep that meaning.

### Properties of a correct engine

- **FR-011**: Comparing A with B and B with A MUST describe the same corners (FR-013); for every corner, every non-null difference of (A, B) — `deltaLossS` included — MUST be the negative of (B, A) within the stated tolerance. Symmetry holds corner by corner, not only for the total.
- **FR-011a**: The investigation (FR-001) MUST also check each corner's `deltaLossS` in the six ordered pairs: it comes from the same delta series as `totalDeltaS`, and it picks and orders the opportunities the coach explains and the visitor sees as chips. Its findings follow FR-002 and FR-003 like the five observations.
- **FR-012**: The total delta MUST either agree with the official lap-time difference (primary − comparison, from the stored lap times) within the stated tolerance, or stop being exposed. The decision is taken in the plan, after the investigation, with this recorded preference: correct `totalDeltaS` if its cause is confirmed and a definition exists that agrees with the official difference within the tolerance; remove it only if none does. Either way the plan MUST state the impact on the prompt (which today tells the coach not to cite it) and on `PROMPT_VERSION` (FR-017).
- **FR-013**: A corner is a place on the track, not a behaviour of the driver. For a pair of laps, (A, B) and (B, A) MUST have the same set of corners (same count, same places within the stated tolerance); what differs between the two laps is what each did in each corner (FR-007, FR-008). The prominence test MUST no longer accept a minimum only because the walk crosses a deeper neighbouring minimum (research.md, section 6.2). (Revised on 2026-10-25: the earlier rule, accepting lap 6's extra corners when lap 6 is the primary as a known limitation, applied only if the cause were the out-lap or a flashback; research.md, section 6.1, showed it is neither.)
- **FR-013a**: The demo impact MUST be recorded in `research.md`: the frontend always uses the most recent lap as the primary (`SessionAnalysisPage.tsx:62`), so no visitor sees lap 6 as the primary; the texts of (6, 7) and (6, 8) go into the seed file but are not shown on screen.
- **FR-014**: The tolerances of FR-011 and FR-012 MUST be fixed in the plan from the data's resolution (about 4 m per sample, the time between stored samples), before any correction is implemented, and MUST NOT be widened afterwards to make a result pass.
- **FR-015**: `src/analysis/` stays pure and deterministic. Each property (no shared points between corners, braking start not at the apex when the brake was released before it, `null` when undeterminable, symmetry) MUST be covered by tests on synthetic fixtures (`src/analysis/testFixtures.ts`), each one designed from a case the investigation found, with no database and no paid call.
- **FR-015a**: A cut of the published recording MUST be versioned as a test fixture: the decimated samples of laps 6, 7 and 8, each lap whole, with only the fields the engine uses, plus the official lap times and validity needed for the checks. It MUST be generated by a reproducible script, committed with it, that records the SHA-256 of the source recording in the fixture. The plan measures the fixture's size and sets a ceiling, and a test fails if the fixture exceeds it.
- **FR-015b**: Tests on that fixture MUST check properties, not exact values: no point shared between corners, symmetry corner by corner and in total, total delta against the official difference within the tolerance (or its absence, per FR-012), and the corner count of FR-013. They run in the CI with no network, no database and no key.
- **FR-015c**: The fixture is an exception to the rule that recordings stay out of git, and it MUST be recorded where that rule is written — `CLAUDE.md`, Rules, and the README, where the recording is described as a release asset not committed to git — with the reason: the cut holds none of the packets the engine does not use, it is small, and it comes from data already public as a Release asset. The rule is not in the constitution, so no constitution amendment is part of this feature. The six-pair check with the documented command (FR-019) stays alongside these tests.

### What depends on the insights

- **FR-016**: Any change to the shape of `LapInsights` (a field removed, renamed or made nullable) MUST be called out in the plan as a contract change for the frontend's `src/types/rest.ts` (constitution, principle VI). A change of values only is not a shape change, but the plan MUST still list the values the visitor sees that change (`deltaLossS` on the chips, the highlighted corner's bounds).
- **FR-017**: A change of the insights' values changes the coach's input but MUST NOT change `PROMPT_VERSION`: the version hashes the prompt and fixed synthetic reference inputs, and the demo's seed file compares insights with a tolerance (spec 003), not through the version. A test MUST show the version is unchanged by this feature's value changes. If a decision of FR-009, FR-012 or FR-013, or the representation of "did not brake", changes the shape or the documented meaning of a field the prompt describes, the version changes automatically; that consequence MUST be stated in the plan and is accepted only with that decision. (The decisions of 2026-10-25 — `totalDeltaS` becoming coherent with the official difference, corners as places — do change the prompt's description, so the plan states the change of version.)
- **FR-018**: One staleness rule MUST hold for both caches, the local `lap_analyses` and the demo's seed file: a cached analysis is valid while its prompt version, its model and its insights are the current ones. The stored insights MUST be compared with insights freshly computed for the pair by the same tolerance rule as the demo's seed file (spec 003). That rule (`insightsMatch`) MUST come to `main` in this feature, with its tests, in a module outside `src/demo/`, unchanged from `003-demo-mode:src/demo/insightsMatch.ts`, the origin named in the commit message; when spec 003 is updated with `main`, it imports this module instead of keeping its own copy (one rule, never two). A row whose insights differ is stale: with the API key configured, the text is generated again and the row replaced; without it, the request answers 503 and the old text is not served. This replaces spec 004's staleness rule (FR-014 there), needs no manual clean-up, and holds for any future change to the engine, not only this one.
- **FR-019**: After this feature merges, spec 003 regenerates the demo's seed file from the corrected insights; this spec does not touch the seed file, demo mode or the frontend. `research.md` MUST record, for the six ordered pairs of laps 6, 7 and 8, the insights before and after the correction, produced by a documented, reproducible command on a temporary database built from the published recording, as input to that regeneration and to the maintainer's reading of the new texts.
- **FR-020**: If the plan changes the backend's cumulative delta algorithm, the frontend's copy (`computeDelta`, "Delta acumulado" chart) no longer matches it, and the visitor would see the chart and the chips' `deltaLossS` disagree on the same screen. Then: this spec merges on its own, but spec 003 MUST NOT publish the demo until a frontend spec is live with the new algorithm; the dependency MUST be recorded in this spec's plan and in spec 003, with the change described precisely enough to port. If the plan does not change the algorithm, the dependency does not apply, and the plan says so. The frontend is not changed here.
- **FR-020a**: The frontend spec MUST be offered, as an alternative to porting, that the API deliver the cumulative delta series ready-made in the analysis response and the frontend stop computing it, removing the duplication. It is a contract change, decided in that spec together with the same way out already recorded for the opportunity rule (`specs/004-coach-input/research.md`, section 2).

### Rules of work

- **FR-021**: No step makes a paid call. Every command that loads the dotenv configuration runs with `DOTENV_CONFIG_PATH` pointing at a `.env` without the key, outside the repository, after a presence check that prints `false`. Nothing points at `data/telemetry.db`, which has not yet been migrated by spec 004.
- **FR-022**: Documentation (README, `CLAUDE.md`) MUST describe the engine as it is after the change; a limitation fixed here is removed from both files in the same piece of work, and one found but not fixed is added to both.

### Key Entities

- **Observation**: one of the five suspect behaviours, with its verdict (engine artifact, real driving, decimation effect, undeterminable) and the samples that support it.
- **Corner stretch**: the part of the track that belongs to one corner, defined by the corner itself and bounded so that it does not overlap its neighbours; its bounds are always numbers (today's `brakingStartDistance` and `exitDistance`); every point a corner's insights use lies in it, and `deltaLossS` and the line deviation are measured over it.
- **Driver behaviour in a corner**: where each lap began to brake and was back on full throttle; each is a sample of that lap inside the corner's stretch, or unknown.
- **Corner insight**: braking, throttle, line deviation and `deltaLossS` of one corner; behaviour differences are measured from that corner's samples or `null`.
- **Cached analysis**: a stored text with its insights, prompt version and model, valid only while all three match the current ones (insights within the tolerance rule), in the local cache and in the demo's seed file alike.
- **Total delta**: the time difference at the end of the lap; either coherent with the official difference or not exposed.
- **Tolerance**: the stated, fixed margin for symmetry and for agreement with the official difference, derived from the sample resolution.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Before the first implementation commit, `research.md` gives each of the five observations a verdict and the samples supporting it, and every correction in the plan traces back to an observation with the verdict "engine artifact"; none traces to an unconfirmed one.
- **SC-002**: For each of the six ordered pairs of laps 6, 7 and 8, no two corners of the same insights use the same sample of the same lap as apex, braking start or throttle pick-up.
- **SC-003**: For each of the six pairs, no reported braking start equals its apex in a lap where the samples show the brake was applied and released before the apex; where a lap did not brake for a corner, its braking-point difference is `null`. In particular, the differences of 100–190 m listed in observation 3 either disappear or are confirmed by the samples as real.
- **SC-004**: For each of the three pairs of laps and both directions, every corner present in both directions has differences — `deltaLossS` included — that are opposite within the stated tolerance, and the total delta of (A, B) plus that of (B, A) is zero within the stated tolerance.
- **SC-004a**: For every corner of the six pairs, the corner's stretch has numeric bounds, and no braking-point or throttle difference is a difference between a behaviour point and a bound.
- **SC-004b**: In the tests, a cached analysis (local cache) whose stored insights differ from the freshly computed ones beyond the tolerance is never served: it is regenerated with a (fake) coach available and answers 503 without the key; one within the tolerance is served.
- **SC-005**: For each of the six pairs, the total delta agrees with the official difference (±0.162, ±0.772, ±0.934 s) within the stated tolerance, or it is not in the insights and the decision is recorded.
- **SC-006**: For each of the three pairs of laps, (A, B) and (B, A) have the same set of corners (same count, apexes within the stated tolerance), checked by a test on the recording cut; no corner comes from a speed dip whose prominence, measured without crossing a deeper minimum, is below the detection threshold.
- **SC-006a**: The properties of SC-002, SC-004, SC-005 and SC-006 pass as automated tests on the versioned cut of the recording (FR-015a/b), in the CI, and the cut stays under the ceiling set in the plan; regenerating it with the script from a recording with the recorded SHA-256 gives the same file.
- **SC-007**: The properties of FR-015 are covered by tests that pass with no API key and no database; `PROMPT_VERSION` changes only through the prompt and reference-input changes the plan declares, and a test shows that a change of engine values alone leaves it unchanged.
- **SC-007a**: The plan states whether the cumulative delta algorithm changes; if it does, the publishing dependency (FR-020) is written in this plan and in spec 003 before this spec merges.
- **SC-008**: No paid call and no access to `data/telemetry.db` at any step; every dotenv-loading command was preceded by a key check printing `false`.

## Assumptions

- The published recording and its three laps are the evidence base; conclusions are not generalized to other tracks without saying so.
- The official lap time (stored from the game's `lastLapTimeInMS`) is authoritative (constitution, principle IV) and is the reference for the total delta.
- The sample resolution (about 4 m) bounds how precisely any point can be located; differences smaller than it are not treated as meaningful.
- The decimation rule (4 m or 500 ms) is not changed by this spec; if the investigation finds that it causes an observation, that is recorded as a finding.
- The coach's prompt and message building (spec 004) are not changed by this spec, except as an automatic consequence recorded under FR-017.
- The frontend's `topOpportunities` rule and chip label are not changed; they keep consuming `deltaLossS` and `apexDistance`.
- The out-lap and flashback (known limitations) are handled by the flashback spec.
