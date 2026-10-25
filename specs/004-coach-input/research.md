# Research: Fix the coach's input

Evidence for the plan of spec 004. Commands were run on the branch `004-coach-input` (from `main` at `6fa1837`), Node v22.23.1. No paid call was made. Every command that loads the dotenv configuration ran with `DOTENV_CONFIG_PATH` pointing at an empty `.env` in the agent's scratch folder, after this check:

```text
$ node -e "require('dotenv').config({path:process.env.DOTENV_CONFIG_PATH});console.log(Boolean(process.env.ANTHROPIC_API_KEY))"
false
```

Nothing pointed at `data/telemetry.db`: the databases below are temporary files under the system temp folder, removed at the end of each command. The research prototype (the proposed message builder and prompt) lived in the agent's scratch folder, outside the repository; it is not part of the implementation, which follows the TDD of the tasks.

---

## 1. The coach's code today, and what changes

| File | Today (`main`) | Change |
|---|---|---|
| `src/coaching/coachPrompt.ts` | Static prompt, 3,236 characters. Line 7: the comparison lap is "normalmente a melhor volta do próprio piloto". Line 9: `totalDeltaS` is "tempo total que a volta principal está mais lenta". Line 15: `peakBrakeDiff` with no sign. Line 25: the coach picks "as 3 curvas com maior deltaLossS positivo". Line 34: example title "Curva 4 - freada tardia". | Replaced by the new prompt (section 4, 5,229 characters): reads the laps and the opportunities from the message, never ranks or numbers, signs of every difference, coasting and trail braking defined as the code computes them, the arbitrary sign of the lateral deviation, no sectors, no reason for an invalidation, no driver states the data do not measure, no sum of the losses against the official difference, proportion. The comment on lines 1–4 (static prompt) stays. |
| `src/coaching/coachUserMessage.ts` | `buildCoachUserMessage(insights, benchmark?)` (line 20): the personal best (line 24) and the theoretical best (line 27), then `JSON.stringify(insights)` (line 32). No lap number, time or validity. | `buildCoachUserMessage(insights, primary, comparison)`: the compared laps block, the invalid-comparison warning, the opportunity reading, then the JSON (section 4). No benchmark parameter. The opportunity rule, the label and the direction phrases live in their own pure modules (plan, Project Structure). |
| `src/coaching/coachService.ts` | `MODEL` constant (line 8), `generateCoaching(insights, benchmark?)` (line 39), imports `env` (line 2) for the key. | `generateCoaching(insights, primary, comparison)`. The model constant moves to a module without the `env` import (`coachModel.ts`) so the analysis resolver and `analyze` can read it without the ports; on `003-demo-mode` it is already exported (`export const MODEL`), the same need. |
| `src/http/routes/analysisRouter.ts` | Serves any cached row (lines 44–52), then 503 without the key (lines 57–60), builds insights, reads the track benchmark (line 72), calls the coach (line 75), `insertAnalysis` (line 76). | Delegates to an analysis resolver (section 7): a row with the current prompt version and model is served; a stale one is regenerated and replaced with the key, 503 without it; one paid call per pair at a time. Reads the two laps (section 3) instead of the benchmark. Status codes and bodies unchanged. |
| `src/persistence/lapRepository.ts` | `getTrackBenchmark` (lines 110–139), used by `analysisRouter` (line 72) and `GET /sessions/:id/benchmark` (`sessionsRouter.ts:29-50`). | Unchanged, plus a prepared statement that reads one lap of a session (`getLapForSession`). The benchmark stops being sent to the coach; `GET /sessions/:id/benchmark` keeps serving it. |
| `src/persistence/analysisRepository.ts`, `schema.ts`, `db.ts` | `lap_analyses` without prompt version (`schema.ts:91-101`); `insertAnalysis` is a plain `INSERT` (`analysisRepository.ts:39-42`). | Column `prompt_version`, migration in `db.ts`, the row read with it, and an upsert that replaces the row (section 6). |
| `tools/analyze.ts` | Prints `JSON.stringify(insights, null, 2)` (line 51). | Also prints the coach's message and the prompt version (FR-016a), reading the two laps; no coach call, no `env` import. |

**The benchmark on screen (a correction to the spec's wording).** The spec's FR-004 says the personal best's "display" stays "on screen". Read in the frontend (`main` at `9334f87`, read only): nothing calls `GET /sessions/:id/benchmark` (`grep -rn -i "benchmark" src` finds no caller). The best lap the visitor sees is the session's own, from the laps list (`Telemetry-F1/src/components/sessions/LapsTable.tsx:25-26`, `SessionsTable.tsx:49`). So the track benchmark is served by the API and shown nowhere today; this spec changes neither. At the plan review the maintainer had FR-004 corrected: what stays is the calculation and the endpoint, not a display on screen.

**`totalDeltaS` stays in the JSON** (it is the analysis engine's, and the REST contract returns it); the prompt tells the coach it is not the official difference and not to cite it.

---

## 2. The frontend chip label

Read in `Telemetry-F1` (`main`, `9334f87`, up to date with `origin/main`, read only):

- **Rule** (`src/utils/coachInsights.ts:5-10`): `[...insights.corners].filter((c) => c.deltaLossS > 0).sort((a, b) => b.deltaLossS - a.deltaLossS).slice(0, max)`, `max = MAX_OPPORTUNITIES = 3`.
- **Label** (`src/components/coach/CoachPanel.tsx:65`): `{i + 1}. {Math.round(c.corner.apexDistance)}m · +{c.deltaLossS.toFixed(2)}s`. Character by character: the rank (`i + 1`), `.`, one space, the apex distance rounded by `Math.round`, `m`, one space, `·` (U+00B7 MIDDLE DOT, bytes `C2 B7`, checked with `od -c`), one space, a literal `+`, `deltaLossS.toFixed(2)`, `s`. The `+` is literal, safe because only positive values pass the filter.

**Edge cases** (Node v22.23.1; the API uses the same expressions in the same engine family):

```text
Math.round(2.5) 3 | Math.round(-2.5) -2 | String(Math.round(-0.4)) 0 | `${-0}` 0
(1.005).toFixed(2) 1.00 | (0.125).toFixed(2) 0.13 | -0>0 false | (-0).toFixed(2) 0.00
[{v:1,a},{v:2,b},{v:1,c}].sort(desc) -> b,a,c   (stable)
```

- **Ties**: `Array.prototype.sort` is stable (ES2019), so equal `deltaLossS` keep the insights order, on both sides.
- **Exactly 0 and −0**: excluded by `> 0` on both sides.
- **`.5` rounding**: `Math.round` rounds half toward +∞ (`2.5 → 3`, `−2.5 → −2`). A negative apex distance (possible before the line on an out-lap) renders `-0` as `0` in both JSX and a template literal. Using `Math.round` (not `toFixed(0)`, which rounds half away from zero) keeps the two identical.
- **`toFixed(2)`** works on the binary value (`1.005 → "1.00"`). `deltaLossS` is already `round2`ed; using the same `toFixed(2)` gives the same string.
- **Where they could diverge**: only if one side changed its expression, or the frontend ran an engine with a different `toFixed`/`Math.round` (both are specified exactly by ECMAScript). The API copies the expressions verbatim; a test pins the label for these edge values.

**Checked on the demo data**: the label built with a copy of the frontend's `topOpportunities` and the JSX expression is identical to the prototype's, and present in each message:

```text
message-6-7.txt: front ["1. 2053m · +0.38s","2. 334m · +0.29s","3. 2795m · +0.28s"] | iguais ao protótipo: true | presentes na mensagem: true
message-6-8.txt: front ["1. 2053m · +0.58s","2. 2149m · +0.24s","3. 2541m · +0.22s"] | iguais ao protótipo: true | presentes na mensagem: true
message-7-6.txt: front ["1. 3276m · +0.38s","2. 391m · +0.19s","3. 2496m · +0.18s"] | iguais ao protótipo: true | presentes na mensagem: true
message-7-8.txt: front ["1. 3276m · +0.20s","2. 2496m · +0.11s","3. 2121m · +0.02s"] | iguais ao protótipo: true | presentes na mensagem: true
message-8-6.txt: front ["1. 3283m · +0.36s","2. 401m · +0.30s","3. 1440m · +0.29s"] | iguais ao protótipo: true | presentes na mensagem: true
message-8-7.txt: front ["1. 401m · +0.16s","2. 2781m · +0.08s","3. 1440m · +0.04s"] | iguais ao protótipo: true | presentes na mensagem: true
todos iguais: true
```

(The frontend file is an ES module, `"type": "module"`, so it was copied into the scratch folder to be loaded; the frontend repository was not modified.)

**Known debt, outside this spec**: the rule and the label are duplicated in the frontend and the API, kept equal by hand and by a test on the API side. The way out is for the API to deliver the ranked opportunities and their labels in the analysis response, and the frontend to stop computing them; that changes the REST contract, so it is a later spec with a frontend counterpart.

---

## 3. Official time and validity of each lap

- **Where**: table `laps` (`schema.ts:20-32`), `lap_time_ms INTEGER NOT NULL` and `is_valid INTEGER NOT NULL CHECK (is_valid IN (0,1))`, unique on `(session_id, lap_number)`. Read by `listLapsForSession` (`lapRepository.ts:51-80`), which maps `is_valid` to a boolean.
- **Source**: `lapCompletionDetector.ts`: when `currentLapNum` grows, the lap that ended gets `lapTimeMs = player.lastLapTimeInMS` (line 60, the game's authoritative value) and `isValid = previousSnapshot.currentLapInvalid === 0` (line 67, the flag of the last packet of that lap). Written by `upsertCompletedLap` (`lapRepository.ts:27-38`).
- **When the time is not recorded**: there is no row with a `NULL` time; a lap without a row is a lap whose end was never seen (the lap in progress, or the last lap of a recording that stops before the line). Its samples can exist (they are stored per packet), so `POST /sessions/:id/analysis` can be asked for it today. The message then says "tempo oficial desconhecido, validade desconhecida" and gives no official difference (FR-001, FR-002); nothing is estimated from samples (principle IV).
- **On the demo recording** (section 4): laps 6 (74,306 ms, invalid), 7 (74,144 ms, valid), 8 (73,372 ms, valid). All six pairs have both times.

---

## 4. The six demo messages, and the new prompt

### How they were built

A research script in the agent's scratch folder (not in the repository) set `DB_PATH` to a new temporary file **before** loading `src/persistence/db`, checked that the opened connection was that file, read the published recording line by line and passed each packet through the ingestion that exists on `main`: `dispatchPacket` (`src/telemetry/dispatcher.ts:28`) and `persistTelemetry` (`src/persistence/persistTelemetry.ts:10`) for packets 0, 1, 2 and 6, as `src/server.ts:31-90` does, with no UDP socket and no network. It then built the insights for the six ordered pairs with `buildInsights` and the message with the prototype of the proposed design.

```text
$ sha256sum recordings/demo-interlagos-tt-20hz-laps6-8.jsonl
c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033   (the published hash, 003 research.md section 2)

$ DOTENV_CONFIG_PATH=<empty .env> node -r ts-node/register <scratch>/proto/buildDemoMessages.ts recordings/demo-interlagos-tt-20hz-laps6-8.jsonl
[db] usando banco em C:\Users\anala\AppData\Local\Temp\telemetryf1-004-z8mszT\research.db
banco temporário: C:\Users\anala\AppData\Local\Temp\telemetryf1-004-z8mszT\research.db
sessões: [{"id":1,"session_uid":"1026725433292396341"}]; pacotes descartados: 0
voltas: [{"lap":6,"ms":74306,"valid":false},{"lap":7,"ms":74144,"valid":true},{"lap":8,"ms":73372,"valid":true}]
versão do prompt (protótipo): 395e27bac6daabc6
versão com o prompt em CRLF: 395e27bac6daabc6
par (6,7): 8242 caracteres
par (6,8): 8256 caracteres
par (7,6): 5832 caracteres
par (7,8): 5664 caracteres
par (8,6): 5857 caracteres
par (8,7): 5592 caracteres
banco temporário removido
```

The insights are today's `buildInsights` output, unchanged; they carry the engine artefacts recorded in `003-demo-mode:specs/003-demo-mode/research.md`, "Analysis engine observations" (for example the 179.97 m and 189.82 m braking differences, and identical braking and throttle values on neighbouring corners). This spec makes the coach read them correctly, not makes them right; that is the analysis-engine spec.

**The prompt version shown (`395e27bac6daabc6`) is the prototype's.** The implemented version will differ: it hashes the implemented prompt and the implemented builder's reference messages (section 5). The real value is printed by `npm run analyze` after implementation.

**The texts below are the generated files, unedited**: after writing this file, a script extracted each pair's block and the new prompt's block from it and compared them with the files the prototype wrote:

```text
6 7 idêntica: true
6 8 idêntica: true
7 6 idêntica: true
7 8 idêntica: true
8 6 idêntica: true
8 7 idêntica: true
prompt idêntico: true
diff idêntico: true
```

(Re-run after the maintainer's review of the prompt; the diff check was added then.)

**Today's frontend reaches only (8, 6) and (8, 7)** (the primary lap is fixed to the latest, 003 research.md section 7); the other four are shown because the demo seed covers six pairs.

### Pair (6, 7)

```text
Voltas comparadas (mesma sessão):
- Volta principal (a que o piloto quer melhorar): volta 6, tempo oficial 1:14.306, inválida.
- Volta de comparação: volta 7, tempo oficial 1:14.144, válida.
Diferença oficial: a volta principal foi 0.162 s mais lenta que a volta de comparação.
Todos os deltas e diferenças abaixo são da volta principal contra a volta de comparação, e de nada mais.

Oportunidades (já escolhidas e ordenadas pelo sistema; use exatamente estes rótulos, nesta ordem):
1. 2053m · +0.38s
   - Ponto de frenagem: a volta principal começou a frear 156.71 m antes da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais forte (diferença de 0.8 numa escala de 0 a 1).
   - Trail braking: só a volta principal fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 112.93 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0 s na volta de comparação.
2. 334m · +0.29s
   - Ponto de frenagem: a volta principal começou a frear 179.97 m antes da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais forte (diferença de 1 numa escala de 0 a 1).
   - Trail braking: só a volta principal fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 19.43 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0.34 s na volta principal, 0 s na volta de comparação.
3. 2795m · +0.28s
   - Ponto de frenagem: a volta principal começou a frear 5.2 m depois da volta de comparação.
   - Pressão máxima de freio: igual nas duas voltas.
   - Trail braking: nenhuma das duas voltas fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 54.6 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0 s na volta de comparação.

Dados completos (JSON):
{"totalDeltaS":0.28,"corners":[{"corner":{"index":0,"apexDistance":333.693359375,"apexSpeed":114,"brakingStartDistance":211.248046875,"exitDistance":497.76953125,"severity":"medium"},"deltaLossS":0.29,"braking":{"brakingPointDiffM":-179.97,"peakBrakeDiff":1,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":19.43,"coastingTimePrimaryS":0.34,"coastingTimeComparisonS":0,"throttleOscillationPrimary":6,"throttleOscillationComparison":6},"lineDeviation":{"maxLateralDeviationM":5.3,"avgLateralDeviationM":1.7}},{"corner":{"index":1,"apexDistance":398.529296875,"apexSpeed":132,"brakingStartDistance":398.529296875,"exitDistance":497.76953125,"severity":"medium"},"deltaLossS":-0.08,"braking":{"brakingPointDiffM":-179.97,"peakBrakeDiff":1,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":19.43,"coastingTimePrimaryS":0.34,"coastingTimeComparisonS":0,"throttleOscillationPrimary":6,"throttleOscillationComparison":6},"lineDeviation":{"maxLateralDeviationM":5.3,"avgLateralDeviationM":3.8}},{"corner":{"index":2,"apexDistance":492.28515625,"apexSpeed":124,"brakingStartDistance":492.28515625,"exitDistance":497.76953125,"severity":"medium"},"deltaLossS":0.03,"braking":{"brakingPointDiffM":54.53,"peakBrakeDiff":0.44,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":19.43,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":0,"throttleOscillationComparison":4},"lineDeviation":{"maxLateralDeviationM":2.28,"avgLateralDeviationM":2.26}},{"corner":{"index":3,"apexDistance":1403.765625,"apexSpeed":155,"brakingStartDistance":1287.357421875,"exitDistance":1496.458984375,"severity":"medium"},"deltaLossS":-0.26,"braking":{"brakingPointDiffM":1.71,"peakBrakeDiff":0.01,"trailBrakingPrimary":true,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":10.6,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":6,"throttleOscillationComparison":4},"lineDeviation":{"maxLateralDeviationM":2.18,"avgLateralDeviationM":-0.09}},{"corner":{"index":4,"apexDistance":1492.0859375,"apexSpeed":172,"brakingStartDistance":1492.0859375,"exitDistance":1496.458984375,"severity":"medium"},"deltaLossS":0,"braking":{"brakingPointDiffM":-2.84,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":10.6,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":5,"throttleOscillationComparison":4},"lineDeviation":{"maxLateralDeviationM":2.05,"avgLateralDeviationM":1.96}},{"corner":{"index":5,"apexDistance":2053.13671875,"apexSpeed":173,"brakingStartDistance":2053.13671875,"exitDistance":2244.3671875,"severity":"medium"},"deltaLossS":0.38,"braking":{"brakingPointDiffM":-156.71,"peakBrakeDiff":0.8,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":112.93,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":6,"throttleOscillationComparison":0},"lineDeviation":{"maxLateralDeviationM":2.46,"avgLateralDeviationM":0.03}},{"corner":{"index":6,"apexDistance":2149.44140625,"apexSpeed":174,"brakingStartDistance":2149.44140625,"exitDistance":2244.3671875,"severity":"medium"},"deltaLossS":0.2,"braking":{"brakingPointDiffM":28.89,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":112.93,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":0},"lineDeviation":{"maxLateralDeviationM":2.46,"avgLateralDeviationM":-0.39}},{"corner":{"index":7,"apexDistance":2375.140625,"apexSpeed":82,"brakingStartDistance":2375.140625,"exitDistance":2592.984375,"severity":"slow"},"deltaLossS":0.03,"braking":{"brakingPointDiffM":7.34,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":10.81,"coastingTimePrimaryS":0.75,"coastingTimeComparisonS":0.21,"throttleOscillationPrimary":8,"throttleOscillationComparison":8},"lineDeviation":{"maxLateralDeviationM":4.68,"avgLateralDeviationM":-1.89}},{"corner":{"index":8,"apexDistance":2462.732421875,"apexSpeed":109,"brakingStartDistance":2462.732421875,"exitDistance":2592.984375,"severity":"slow"},"deltaLossS":-0.15,"braking":{"brakingPointDiffM":-2.08,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":10.81,"coastingTimePrimaryS":0.75,"coastingTimeComparisonS":0,"throttleOscillationPrimary":8,"throttleOscillationComparison":7},"lineDeviation":{"maxLateralDeviationM":4.68,"avgLateralDeviationM":-1.61}},{"corner":{"index":9,"apexDistance":2540.970703125,"apexSpeed":114,"brakingStartDistance":2540.970703125,"exitDistance":2592.984375,"severity":"medium"},"deltaLossS":0.13,"braking":{"brakingPointDiffM":-5.51,"peakBrakeDiff":-0.58,"trailBrakingPrimary":false,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":10.81,"coastingTimePrimaryS":0.29,"coastingTimeComparisonS":0,"throttleOscillationPrimary":6,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":0.96,"avgLateralDeviationM":0.64}},{"corner":{"index":10,"apexDistance":2794.90625,"apexSpeed":84,"brakingStartDistance":2794.90625,"exitDistance":2965.455078125,"severity":"slow"},"deltaLossS":0.28,"braking":{"brakingPointDiffM":5.2,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":54.6,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":3.18,"avgLateralDeviationM":-0.83}},{"corner":{"index":11,"apexDistance":3278.9921875,"apexSpeed":105,"brakingStartDistance":3278.9921875,"exitDistance":3318.23046875,"severity":"slow"},"deltaLossS":-0.25,"braking":{"brakingPointDiffM":-2.14,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-13.48,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0.48,"throttleOscillationPrimary":0,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":2.21,"avgLateralDeviationM":1.11}}],"tyreWindowExcursions":[]}
```

### Pair (6, 8)

```text
Voltas comparadas (mesma sessão):
- Volta principal (a que o piloto quer melhorar): volta 6, tempo oficial 1:14.306, inválida.
- Volta de comparação: volta 8, tempo oficial 1:13.372, válida.
Diferença oficial: a volta principal foi 0.934 s mais lenta que a volta de comparação.
Todos os deltas e diferenças abaixo são da volta principal contra a volta de comparação, e de nada mais.

Oportunidades (já escolhidas e ordenadas pelo sistema; use exatamente estes rótulos, nesta ordem):
1. 2053m · +0.58s
   - Ponto de frenagem: a volta principal começou a frear 172.47 m antes da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais forte (diferença de 0.8 numa escala de 0 a 1).
   - Trail braking: só a volta principal fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 76.8 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0 s na volta de comparação.
2. 2149m · +0.24s
   - Ponto de frenagem: a volta principal começou a frear 6.2 m depois da volta de comparação.
   - Pressão máxima de freio: igual nas duas voltas.
   - Trail braking: nenhuma das duas voltas fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 76.8 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0 s na volta de comparação.
3. 2541m · +0.22s
   - Ponto de frenagem: a volta principal começou a frear 7.32 m depois da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais leve (diferença de 0.87 numa escala de 0 a 1).
   - Trail braking: só a volta de comparação fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 35.27 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0.29 s na volta principal, 0 s na volta de comparação.

Dados completos (JSON):
{"totalDeltaS":0.93,"corners":[{"corner":{"index":0,"apexDistance":333.693359375,"apexSpeed":114,"brakingStartDistance":211.248046875,"exitDistance":497.76953125,"severity":"medium"},"deltaLossS":0.05,"braking":{"brakingPointDiffM":-189.82,"peakBrakeDiff":1,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":17.38,"coastingTimePrimaryS":0.34,"coastingTimeComparisonS":0,"throttleOscillationPrimary":6,"throttleOscillationComparison":4},"lineDeviation":{"maxLateralDeviationM":4.47,"avgLateralDeviationM":1.39}},{"corner":{"index":1,"apexDistance":398.529296875,"apexSpeed":132,"brakingStartDistance":398.529296875,"exitDistance":497.76953125,"severity":"medium"},"deltaLossS":-0.24,"braking":{"brakingPointDiffM":-189.82,"peakBrakeDiff":1,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":17.38,"coastingTimePrimaryS":0.34,"coastingTimeComparisonS":0,"throttleOscillationPrimary":6,"throttleOscillationComparison":4},"lineDeviation":{"maxLateralDeviationM":4.47,"avgLateralDeviationM":2.7}},{"corner":{"index":2,"apexDistance":492.28515625,"apexSpeed":124,"brakingStartDistance":492.28515625,"exitDistance":497.76953125,"severity":"medium"},"deltaLossS":0.03,"braking":{"brakingPointDiffM":55.47,"peakBrakeDiff":0.44,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":17.38,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":0,"throttleOscillationComparison":3},"lineDeviation":{"maxLateralDeviationM":0.51,"avgLateralDeviationM":0.46}},{"corner":{"index":3,"apexDistance":1403.765625,"apexSpeed":155,"brakingStartDistance":1287.357421875,"exitDistance":1496.458984375,"severity":"medium"},"deltaLossS":-0.2,"braking":{"brakingPointDiffM":-18.68,"peakBrakeDiff":-0.07,"trailBrakingPrimary":true,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":-47.49,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":6,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":2.66,"avgLateralDeviationM":-0.29}},{"corner":{"index":4,"apexDistance":1492.0859375,"apexSpeed":172,"brakingStartDistance":1492.0859375,"exitDistance":1496.458984375,"severity":"medium"},"deltaLossS":-0.01,"braking":{"brakingPointDiffM":106.5,"peakBrakeDiff":-0.95,"trailBrakingPrimary":false,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":-47.49,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":5,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":2.55,"avgLateralDeviationM":2.42}},{"corner":{"index":5,"apexDistance":2053.13671875,"apexSpeed":173,"brakingStartDistance":2053.13671875,"exitDistance":2244.3671875,"severity":"medium"},"deltaLossS":0.58,"braking":{"brakingPointDiffM":-172.47,"peakBrakeDiff":0.8,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":76.8,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":6,"throttleOscillationComparison":0},"lineDeviation":{"maxLateralDeviationM":2.28,"avgLateralDeviationM":-0.59}},{"corner":{"index":6,"apexDistance":2149.44140625,"apexSpeed":174,"brakingStartDistance":2149.44140625,"exitDistance":2244.3671875,"severity":"medium"},"deltaLossS":0.24,"braking":{"brakingPointDiffM":6.2,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":76.8,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":0},"lineDeviation":{"maxLateralDeviationM":2.27,"avgLateralDeviationM":-0.57}},{"corner":{"index":7,"apexDistance":2375.140625,"apexSpeed":82,"brakingStartDistance":2375.140625,"exitDistance":2592.984375,"severity":"slow"},"deltaLossS":0.08,"braking":{"brakingPointDiffM":0.61,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":35.27,"coastingTimePrimaryS":0.75,"coastingTimeComparisonS":0,"throttleOscillationPrimary":8,"throttleOscillationComparison":8},"lineDeviation":{"maxLateralDeviationM":5.34,"avgLateralDeviationM":-1.29}},{"corner":{"index":8,"apexDistance":2462.732421875,"apexSpeed":109,"brakingStartDistance":2462.732421875,"exitDistance":2592.984375,"severity":"slow"},"deltaLossS":-0.02,"braking":{"brakingPointDiffM":0.96,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":35.27,"coastingTimePrimaryS":0.75,"coastingTimeComparisonS":0,"throttleOscillationPrimary":8,"throttleOscillationComparison":8},"lineDeviation":{"maxLateralDeviationM":5.34,"avgLateralDeviationM":-1.72}},{"corner":{"index":9,"apexDistance":2540.970703125,"apexSpeed":114,"brakingStartDistance":2540.970703125,"exitDistance":2592.984375,"severity":"medium"},"deltaLossS":0.22,"braking":{"brakingPointDiffM":7.32,"peakBrakeDiff":-0.87,"trailBrakingPrimary":false,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":35.27,"coastingTimePrimaryS":0.29,"coastingTimeComparisonS":0,"throttleOscillationPrimary":6,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":1.03,"avgLateralDeviationM":0.28}},{"corner":{"index":10,"apexDistance":2794.90625,"apexSpeed":84,"brakingStartDistance":2794.90625,"exitDistance":2965.455078125,"severity":"slow"},"deltaLossS":-0.14,"braking":{"brakingPointDiffM":17.87,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":62.4,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":3.96,"avgLateralDeviationM":-2.14}},{"corner":{"index":11,"apexDistance":3278.9921875,"apexSpeed":105,"brakingStartDistance":3278.9921875,"exitDistance":3318.23046875,"severity":"slow"},"deltaLossS":-0.12,"braking":{"brakingPointDiffM":100.7,"peakBrakeDiff":-0.99,"trailBrakingPrimary":false,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":-27.03,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":0,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":2.19,"avgLateralDeviationM":1.02}}],"tyreWindowExcursions":[]}
```

### Pair (7, 6)

```text
Voltas comparadas (mesma sessão):
- Volta principal (a que o piloto quer melhorar): volta 7, tempo oficial 1:14.144, válida.
- Volta de comparação: volta 6, tempo oficial 1:14.306, inválida.
Diferença oficial: a volta principal foi 0.162 s mais rápida que a volta de comparação.
Todos os deltas e diferenças abaixo são da volta principal contra a volta de comparação, e de nada mais.

Aviso: a volta de comparação é inválida. O tempo que ela ganha da volta principal não serve de meta: pode vir de um trecho em que a pista foi cortada.

Oportunidades (já escolhidas e ordenadas pelo sistema; use exatamente estes rótulos, nesta ordem):
1. 3276m · +0.38s
   - Ponto de frenagem: a volta principal começou a frear 2.14 m depois da volta de comparação.
   - Pressão máxima de freio: igual nas duas voltas.
   - Trail braking: nenhuma das duas voltas fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 13.48 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0.48 s na volta principal, 0 s na volta de comparação.
2. 391m · +0.19s
   - Ponto de frenagem: a volta principal começou a frear 179.97 m depois da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais leve (diferença de 1 numa escala de 0 a 1).
   - Trail braking: só a volta de comparação fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 19.43 m antes da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0.34 s na volta de comparação.
3. 2496m · +0.18s
   - Ponto de frenagem: a volta principal começou a frear 10.13 m depois da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais forte (diferença de 0.58 numa escala de 0 a 1).
   - Trail braking: só a volta principal fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 10.81 m antes da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0.29 s na volta de comparação.

Dados completos (JSON):
{"totalDeltaS":-0.2,"corners":[{"corner":{"index":0,"apexDistance":391.22265625,"apexSpeed":104,"brakingStartDistance":391.22265625,"exitDistance":478.33984375,"severity":"slow"},"deltaLossS":0.19,"braking":{"brakingPointDiffM":179.97,"peakBrakeDiff":-1,"trailBrakingPrimary":false,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":-19.43,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0.34,"throttleOscillationPrimary":6,"throttleOscillationComparison":6},"lineDeviation":{"maxLateralDeviationM":5.26,"avgLateralDeviationM":-3.78}},{"corner":{"index":1,"apexDistance":1415.37109375,"apexSpeed":137,"brakingStartDistance":1415.37109375,"exitDistance":1485.859375,"severity":"medium"},"deltaLossS":0.17,"braking":{"brakingPointDiffM":-1.71,"peakBrakeDiff":-0.01,"trailBrakingPrimary":true,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":-10.6,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":4,"throttleOscillationComparison":6},"lineDeviation":{"maxLateralDeviationM":2.13,"avgLateralDeviationM":-0.65}},{"corner":{"index":2,"apexDistance":2121.28125,"apexSpeed":184,"brakingStartDistance":2121.28125,"exitDistance":2131.435546875,"severity":"fast"},"deltaLossS":0,"braking":{"brakingPointDiffM":156.71,"peakBrakeDiff":-0.8,"trailBrakingPrimary":false,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":-112.93,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":0,"throttleOscillationComparison":6},"lineDeviation":{"maxLateralDeviationM":0.95,"avgLateralDeviationM":0.51}},{"corner":{"index":3,"apexDistance":2367.798828125,"apexSpeed":77,"brakingStartDistance":2367.798828125,"exitDistance":2582.169921875,"severity":"slow"},"deltaLossS":0.01,"braking":{"brakingPointDiffM":-7.34,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-10.81,"coastingTimePrimaryS":0.21,"coastingTimeComparisonS":0.75,"throttleOscillationPrimary":8,"throttleOscillationComparison":8},"lineDeviation":{"maxLateralDeviationM":4.8,"avgLateralDeviationM":2.02}},{"corner":{"index":4,"apexDistance":2496.470703125,"apexSpeed":97,"brakingStartDistance":2468.2421875,"exitDistance":2582.169921875,"severity":"slow"},"deltaLossS":0.18,"braking":{"brakingPointDiffM":10.13,"peakBrakeDiff":0.58,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-10.81,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0.29,"throttleOscillationPrimary":2,"throttleOscillationComparison":6},"lineDeviation":{"maxLateralDeviationM":4.8,"avgLateralDeviationM":1.99}},{"corner":{"index":5,"apexDistance":2789.705078125,"apexSpeed":74,"brakingStartDistance":2789.705078125,"exitDistance":2910.8515625,"severity":"slow"},"deltaLossS":-0.16,"braking":{"brakingPointDiffM":-5.2,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-54.6,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":4.53,"avgLateralDeviationM":0.49}},{"corner":{"index":6,"apexDistance":3275.505859375,"apexSpeed":84,"brakingStartDistance":3275.505859375,"exitDistance":3331.712890625,"severity":"slow"},"deltaLossS":0.38,"braking":{"brakingPointDiffM":2.14,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":13.48,"coastingTimePrimaryS":0.48,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":0},"lineDeviation":{"maxLateralDeviationM":2.51,"avgLateralDeviationM":-1.41}}],"tyreWindowExcursions":[]}
```

### Pair (7, 8)

```text
Voltas comparadas (mesma sessão):
- Volta principal (a que o piloto quer melhorar): volta 7, tempo oficial 1:14.144, válida.
- Volta de comparação: volta 8, tempo oficial 1:13.372, válida.
Diferença oficial: a volta principal foi 0.772 s mais lenta que a volta de comparação.
Todos os deltas e diferenças abaixo são da volta principal contra a volta de comparação, e de nada mais.

Oportunidades (já escolhidas e ordenadas pelo sistema; use exatamente estes rótulos, nesta ordem):
1. 3276m · +0.20s
   - Ponto de frenagem: a volta principal começou a frear 102.83 m depois da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais leve (diferença de 0.99 numa escala de 0 a 1).
   - Trail braking: só a volta de comparação fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 13.54 m antes da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0.48 s na volta principal, 0 s na volta de comparação.
2. 2496m · +0.11s
   - Ponto de frenagem: a volta principal começou a frear 12.83 m depois da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais leve (diferença de 0.28 numa escala de 0 a 1).
   - Trail braking: as duas voltas fizeram.
   - Retomada do acelerador: a volta principal voltou ao acelerador 24.46 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0 s na volta de comparação.
3. 2121m · +0.02s
   - Ponto de frenagem: a volta principal começou a frear 22.7 m antes da volta de comparação.
   - Pressão máxima de freio: igual nas duas voltas.
   - Trail braking: nenhuma das duas voltas fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 36.13 m antes da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0 s na volta de comparação.

Dados completos (JSON):
{"totalDeltaS":0.72,"corners":[{"corner":{"index":0,"apexDistance":391.22265625,"apexSpeed":104,"brakingStartDistance":391.22265625,"exitDistance":478.33984375,"severity":"slow"},"deltaLossS":-0.2,"braking":{"brakingPointDiffM":-9.85,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-2.05,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":6,"throttleOscillationComparison":4},"lineDeviation":{"maxLateralDeviationM":1.52,"avgLateralDeviationM":-0.91}},{"corner":{"index":1,"apexDistance":1415.37109375,"apexSpeed":137,"brakingStartDistance":1415.37109375,"exitDistance":1485.859375,"severity":"medium"},"deltaLossS":-0.15,"braking":{"brakingPointDiffM":-20.39,"peakBrakeDiff":-0.08,"trailBrakingPrimary":true,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":-58.09,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":4,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":1.37,"avgLateralDeviationM":-0.6}},{"corner":{"index":2,"apexDistance":2121.28125,"apexSpeed":184,"brakingStartDistance":2121.28125,"exitDistance":2131.435546875,"severity":"fast"},"deltaLossS":0.02,"braking":{"brakingPointDiffM":-22.7,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-36.13,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":0,"throttleOscillationComparison":0},"lineDeviation":{"maxLateralDeviationM":1.48,"avgLateralDeviationM":-1.27}},{"corner":{"index":3,"apexDistance":2367.798828125,"apexSpeed":77,"brakingStartDistance":2367.798828125,"exitDistance":2582.169921875,"severity":"slow"},"deltaLossS":0,"braking":{"brakingPointDiffM":-6.73,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":24.46,"coastingTimePrimaryS":0.21,"coastingTimeComparisonS":0,"throttleOscillationPrimary":8,"throttleOscillationComparison":8},"lineDeviation":{"maxLateralDeviationM":3.98,"avgLateralDeviationM":0.78}},{"corner":{"index":4,"apexDistance":2496.470703125,"apexSpeed":97,"brakingStartDistance":2468.2421875,"exitDistance":2582.169921875,"severity":"slow"},"deltaLossS":0.11,"braking":{"brakingPointDiffM":12.83,"peakBrakeDiff":-0.28,"trailBrakingPrimary":true,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":24.46,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":1.49,"avgLateralDeviationM":0.04}},{"corner":{"index":5,"apexDistance":2789.705078125,"apexSpeed":74,"brakingStartDistance":2789.705078125,"exitDistance":2910.8515625,"severity":"slow"},"deltaLossS":-0.26,"braking":{"brakingPointDiffM":12.67,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":7.8,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":7.94,"avgLateralDeviationM":-2.17}},{"corner":{"index":6,"apexDistance":3275.505859375,"apexSpeed":84,"brakingStartDistance":3275.505859375,"exitDistance":3331.712890625,"severity":"slow"},"deltaLossS":0.2,"braking":{"brakingPointDiffM":102.83,"peakBrakeDiff":-0.99,"trailBrakingPrimary":false,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":-13.54,"coastingTimePrimaryS":0.48,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":1.59,"avgLateralDeviationM":-0.35}}],"tyreWindowExcursions":[]}
```

### Pair (8, 6)

```text
Voltas comparadas (mesma sessão):
- Volta principal (a que o piloto quer melhorar): volta 8, tempo oficial 1:13.372, válida.
- Volta de comparação: volta 6, tempo oficial 1:14.306, inválida.
Diferença oficial: a volta principal foi 0.934 s mais rápida que a volta de comparação.
Todos os deltas e diferenças abaixo são da volta principal contra a volta de comparação, e de nada mais.

Aviso: a volta de comparação é inválida. O tempo que ela ganha da volta principal não serve de meta: pode vir de um trecho em que a pista foi cortada.

Oportunidades (já escolhidas e ordenadas pelo sistema; use exatamente estes rótulos, nesta ordem):
1. 3283m · +0.36s
   - Ponto de frenagem: a volta principal começou a frear 100.7 m antes da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais forte (diferença de 0.99 numa escala de 0 a 1).
   - Trail braking: só a volta principal fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 27.03 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0 s na volta de comparação.
2. 401m · +0.30s
   - Ponto de frenagem: a volta principal começou a frear 189.82 m depois da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais leve (diferença de 1 numa escala de 0 a 1).
   - Trail braking: só a volta de comparação fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 17.38 m antes da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0.34 s na volta de comparação.
3. 1440m · +0.29s
   - Ponto de frenagem: a volta principal começou a frear 18.68 m depois da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais forte (diferença de 0.07 numa escala de 0 a 1).
   - Trail braking: as duas voltas fizeram.
   - Retomada do acelerador: a volta principal voltou ao acelerador 47.49 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0 s na volta de comparação.

Dados completos (JSON):
{"totalDeltaS":-0.92,"corners":[{"corner":{"index":0,"apexDistance":401.072265625,"apexSpeed":93,"brakingStartDistance":401.072265625,"exitDistance":480.392578125,"severity":"slow"},"deltaLossS":0.3,"braking":{"brakingPointDiffM":189.82,"peakBrakeDiff":-1,"trailBrakingPrimary":false,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":-17.38,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0.34,"throttleOscillationPrimary":4,"throttleOscillationComparison":6},"lineDeviation":{"maxLateralDeviationM":4.49,"avgLateralDeviationM":-3.18}},{"corner":{"index":1,"apexDistance":1439.76171875,"apexSpeed":127,"brakingStartDistance":1306.0390625,"exitDistance":1543.9453125,"severity":"medium"},"deltaLossS":0.29,"braking":{"brakingPointDiffM":18.68,"peakBrakeDiff":0.07,"trailBrakingPrimary":true,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":47.49,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":6},"lineDeviation":{"maxLateralDeviationM":2.64,"avgLateralDeviationM":0.08}},{"corner":{"index":2,"apexDistance":2144.044921875,"apexSpeed":206,"brakingStartDistance":2144.044921875,"exitDistance":2167.56640625,"severity":"fast"},"deltaLossS":-0.08,"braking":{"brakingPointDiffM":-6.2,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-76.8,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":0,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":2.26,"avgLateralDeviationM":2}},{"corner":{"index":3,"apexDistance":2374.53125,"apexSpeed":76,"brakingStartDistance":2374.53125,"exitDistance":2557.712890625,"severity":"slow"},"deltaLossS":0.05,"braking":{"brakingPointDiffM":-0.61,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-35.27,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0.75,"throttleOscillationPrimary":8,"throttleOscillationComparison":8},"lineDeviation":{"maxLateralDeviationM":5.46,"avgLateralDeviationM":1.59}},{"corner":{"index":4,"apexDistance":2490.0625,"apexSpeed":99,"brakingStartDistance":2455.41015625,"exitDistance":2557.712890625,"severity":"slow"},"deltaLossS":0.13,"braking":{"brakingPointDiffM":-2.7,"peakBrakeDiff":0.87,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-35.27,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0.29,"throttleOscillationPrimary":2,"throttleOscillationComparison":6},"lineDeviation":{"maxLateralDeviationM":5.46,"avgLateralDeviationM":2.55}},{"corner":{"index":5,"apexDistance":2781.07421875,"apexSpeed":80,"brakingStartDistance":2781.07421875,"exitDistance":2903.05078125,"severity":"slow"},"deltaLossS":0.08,"braking":{"brakingPointDiffM":-17.87,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-62.4,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":3.8,"avgLateralDeviationM":2.78}},{"corner":{"index":6,"apexDistance":3283.45703125,"apexSpeed":95,"brakingStartDistance":3178.296875,"exitDistance":3345.2578125,"severity":"slow"},"deltaLossS":0.36,"braking":{"brakingPointDiffM":-100.7,"peakBrakeDiff":0.99,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":27.03,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":0},"lineDeviation":{"maxLateralDeviationM":2.4,"avgLateralDeviationM":-0.75}}],"tyreWindowExcursions":[]}
```

### Pair (8, 7)

```text
Voltas comparadas (mesma sessão):
- Volta principal (a que o piloto quer melhorar): volta 8, tempo oficial 1:13.372, válida.
- Volta de comparação: volta 7, tempo oficial 1:14.144, válida.
Diferença oficial: a volta principal foi 0.772 s mais rápida que a volta de comparação.
Todos os deltas e diferenças abaixo são da volta principal contra a volta de comparação, e de nada mais.

Oportunidades (já escolhidas e ordenadas pelo sistema; use exatamente estes rótulos, nesta ordem):
1. 401m · +0.16s
   - Ponto de frenagem: a volta principal começou a frear 9.85 m depois da volta de comparação.
   - Pressão máxima de freio: igual nas duas voltas.
   - Trail braking: nenhuma das duas voltas fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 2.05 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0 s na volta de comparação.
2. 2781m · +0.08s
   - Ponto de frenagem: a volta principal começou a frear 12.67 m antes da volta de comparação.
   - Pressão máxima de freio: igual nas duas voltas.
   - Trail braking: nenhuma das duas voltas fez.
   - Retomada do acelerador: a volta principal voltou ao acelerador 7.8 m antes da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0 s na volta de comparação.
3. 1440m · +0.04s
   - Ponto de frenagem: a volta principal começou a frear 20.39 m depois da volta de comparação.
   - Pressão máxima de freio: a volta principal freou mais forte (diferença de 0.08 numa escala de 0 a 1).
   - Trail braking: as duas voltas fizeram.
   - Retomada do acelerador: a volta principal voltou ao acelerador 58.09 m depois da volta de comparação.
   - Coasting (sem freio e sem acelerador, entre o ápice e a retomada do acelerador): 0 s na volta principal, 0 s na volta de comparação.

Dados completos (JSON):
{"totalDeltaS":-0.65,"corners":[{"corner":{"index":0,"apexDistance":401.072265625,"apexSpeed":93,"brakingStartDistance":401.072265625,"exitDistance":480.392578125,"severity":"slow"},"deltaLossS":0.16,"braking":{"brakingPointDiffM":9.85,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":2.05,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":4,"throttleOscillationComparison":6},"lineDeviation":{"maxLateralDeviationM":1.48,"avgLateralDeviationM":0.99}},{"corner":{"index":1,"apexDistance":1439.76171875,"apexSpeed":127,"brakingStartDistance":1306.0390625,"exitDistance":1543.9453125,"severity":"medium"},"deltaLossS":0.04,"braking":{"brakingPointDiffM":20.39,"peakBrakeDiff":0.08,"trailBrakingPrimary":true,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":58.09,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":4},"lineDeviation":{"maxLateralDeviationM":1.44,"avgLateralDeviationM":0.19}},{"corner":{"index":2,"apexDistance":2144.044921875,"apexSpeed":206,"brakingStartDistance":2144.044921875,"exitDistance":2167.56640625,"severity":"fast"},"deltaLossS":-0.02,"braking":{"brakingPointDiffM":22.7,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":36.13,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":0,"throttleOscillationComparison":0},"lineDeviation":{"maxLateralDeviationM":0.48,"avgLateralDeviationM":0.26}},{"corner":{"index":3,"apexDistance":2374.53125,"apexSpeed":76,"brakingStartDistance":2374.53125,"exitDistance":2557.712890625,"severity":"slow"},"deltaLossS":0.01,"braking":{"brakingPointDiffM":6.73,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-24.46,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0.21,"throttleOscillationPrimary":8,"throttleOscillationComparison":8},"lineDeviation":{"maxLateralDeviationM":4.07,"avgLateralDeviationM":-0.8}},{"corner":{"index":4,"apexDistance":2490.0625,"apexSpeed":99,"brakingStartDistance":2455.41015625,"exitDistance":2557.712890625,"severity":"slow"},"deltaLossS":-0.06,"braking":{"brakingPointDiffM":-12.83,"peakBrakeDiff":0.28,"trailBrakingPrimary":true,"trailBrakingComparison":true},"throttle":{"throttleOnDiffM":-24.46,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":1.41,"avgLateralDeviationM":0.07}},{"corner":{"index":5,"apexDistance":2781.07421875,"apexSpeed":80,"brakingStartDistance":2781.07421875,"exitDistance":2903.05078125,"severity":"slow"},"deltaLossS":0.08,"braking":{"brakingPointDiffM":-12.67,"peakBrakeDiff":0,"trailBrakingPrimary":false,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":-7.8,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0,"throttleOscillationPrimary":2,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":8.12,"avgLateralDeviationM":2.77}},{"corner":{"index":6,"apexDistance":3283.45703125,"apexSpeed":95,"brakingStartDistance":3178.296875,"exitDistance":3345.2578125,"severity":"slow"},"deltaLossS":-0.69,"braking":{"brakingPointDiffM":-102.83,"peakBrakeDiff":0.99,"trailBrakingPrimary":true,"trailBrakingComparison":false},"throttle":{"throttleOnDiffM":13.54,"coastingTimePrimaryS":0,"coastingTimeComparisonS":0.48,"throttleOscillationPrimary":2,"throttleOscillationComparison":2},"lineDeviation":{"maxLateralDeviationM":1.77,"avgLateralDeviationM":0.77}}],"tyreWindowExcursions":[]}
```

### What the reading shows (for the review)

- The opening data is right in every pair: the laps, the official times and differences (0.162, 0.934, 0.772 s) and the validity of lap 6. The "não serve de meta" warning appears exactly in (7, 6) and (8, 6), the pairs whose comparison lap is lap 6.
- The direction phrases follow the signs one to one. In (7, 6), the two inversions of the rejected text are now written by the code: index 0 `brakingPointDiffM` +179.97 → "começou a frear 179.97 m depois"; `throttleOnDiffM` of index 1 (−10.6) is not among the three opportunities of (7, 6), so it is not read; index 4's −10.81 → "10.81 m antes".
- What still looks wrong comes from the insights, not from the reading: "freou mais leve (diferença de 1)" together with "começou a frear 179.97 m depois" on `391m` of (7, 6) is the braking start stopping at the apex (observation 3 of 003's research); identical values on neighbouring corners are the shared ±80 m windows (observation 2). The coach will explain them as facts. That is why the seed waits for the analysis-engine spec.
- `throttleOscillation*` and `lineDeviation` are not read in words (FR-008 does not list them); they stay in the JSON and the prompt explains them, including the arbitrary sign of `avgLateralDeviationM` (below).

### The new prompt (full text, 5,229 characters; today's is 3,236)

```text
Você é um engenheiro de pista experiente, especialista em telemetria de F1 24. Sua função é explicar ao piloto, em linguagem de piloto, onde a volta principal perdeu tempo para a volta de comparação e como melhorar.

A mensagem do usuário traz, nesta ordem:
1. As duas voltas comparadas: o número de cada uma, o tempo oficial, se é válida ou inválida, e a diferença oficial entre elas, já escrita em palavras. Todos os deltas e diferenças da mensagem são da volta principal contra a volta de comparação, e de nada mais.
2. Às vezes, um aviso de que a volta de comparação é inválida.
3. As oportunidades: até três curvas, já escolhidas e ordenadas pelo sistema, cada uma com um rótulo (ex: "1. 334m · +0.29s": posição, ápice em metros na volta e tempo perdido nessa curva) e com a direção de cada diferença já escrita em palavras.
4. O JSON completo da comparação, para consulta.

Estrutura do JSON (todas as diferenças são volta principal menos volta de comparação):
- totalDeltaS: delta acumulado medido pelas amostras. Não é a diferença oficial de tempo de volta; não o cite.
- corners: curvas detectadas na volta principal, cada uma com:
  - corner.apexDistance (metros na volta), corner.apexSpeed (km/h no ápice), corner.severity (slow/medium/fast). corner.index é um índice interno: nunca o mostre.
  - deltaLossS: tempo (segundos) perdido nessa curva. Positivo = a volta principal perdeu tempo ali.
  - braking.brakingPointDiffM: negativo = a volta principal começou a frear ANTES (mais longe da curva); positivo = DEPOIS.
  - braking.peakBrakeDiff: diferença da pressão máxima de freio, numa escala de 0 a 1. Positivo = a volta principal freou mais forte; negativo = mais leve.
  - braking.trailBrakingPrimary / trailBrakingComparison: true se a volta fez trail braking (freio ainda aplicado com o volante já virado, entre o início da frenagem e o ápice); false se não fez.
  - throttle.throttleOnDiffM: negativo = a volta principal voltou ao acelerador ANTES; positivo = DEPOIS.
  - throttle.coastingTimePrimaryS / coastingTimeComparisonS: coasting, em segundos: tempo entre o ápice e a retomada do acelerador em que o carro anda sem freio e sem acelerador, só rolando. Coasting não é patinar, derrapar nem perder tração.
  - throttle.throttleOscillationPrimary / throttleOscillationComparison: quantas vezes o acelerador mudou de direção entre o ápice e a retomada (correção na saída).
  - lineDeviation.maxLateralDeviationM / avgLateralDeviationM: desvio lateral (metros) em relação à linha da volta de comparação naquela curva, ou null se não houver dado. maxLateralDeviationM é o maior afastamento, sem sinal. O sinal de avgLateralDeviationM é arbitrário: não diga para que lado (dentro, fora, esquerda, direita) a volta principal foi.
- tyreWindowExcursions: trechos em que algum pneu (rearLeft/rearRight/frontLeft/frontRight) saiu da janela de temperatura ideal (status "cold" ou "hot"), com a distância do trecho.

Sua tarefa:
1. Abra com uma frase que resume a diferença oficial entre as duas voltas, como a mensagem a escreve. Se a diferença oficial for desconhecida, não afirme nenhuma diferença de tempo de volta.
2. Explique as oportunidades na ordem em que vieram, cada uma identificada só pelo rótulo dado (ex: "1. 334m · +0.29s"). Não escolha, não reordene, não renumere e não dê nome nem número próprio às curvas (nada de "Curva 4"). Se não houver oportunidades, diga que nenhuma curva perdeu tempo e não invente outras.
3. Para cada oportunidade, use as direções já escritas na mensagem; nunca as inverta nem as reinterprete a partir do JSON. Diagnostique a causa raiz (frenagem, traçado, retomada do acelerador na saída, ou uma combinação) e dê uma dica curta e acionável.
4. Nunca afirme algo que contradiga um campo: se trailBraking de uma volta é false, não diga que ela fez trail braking; se um campo vier null, omita aquele aspecto, sem dizer que o dado não está disponível.
5. Não atribua ao piloto estados que os dados não medem (insegurança, hesitação, medo, falta de confiança). Descreva o que os dados mostram e dê a dica.
6. Não some as perdas das curvas nem as compare com a diferença oficial: a volta principal pode ter ganhado tempo em outras curvas, e por isso a soma das oportunidades pode ser maior que a diferença oficial.
7. Guarde a proporção: uma perda de poucos centésimos é ajuste fino, não o maior problema da volta.
8. Não fale de setores: os dados não têm tempo por setor.
9. Se a volta de comparação for inválida, repita o aviso da mensagem com suas palavras. Nunca afirme onde nem por que uma volta foi invalidada: não há dado sobre isso.
10. Nunca cite nomes de campos do JSON (não diga "brakingPointDiffM", diga "você começou a frear X metros antes") e nunca invente números que não estejam na mensagem.
11. Se houver excursões de temperatura de pneu relevantes (trechos longos), mencione brevemente ao final.
12. Responda em português do Brasil, tom direto e técnico mas acessível, como um engenheiro de pista falando no rádio durante um treino.

Formato da resposta:
- A frase de abertura com a diferença oficial.
- As oportunidades, cada uma começando pelo rótulo dado, seguido de 2-3 frases de diagnóstico e a dica.
- Se aplicável, um parágrafo final curto sobre pneus.
```

**Changes from the maintainer's review of the prompt (2026-10-23)**, applied to the text above:

1. Task 3: "tração na saída" became "retomada do acelerador na saída". The data do not measure traction (there is no wheel slip in the insights), and the word invites the model to talk about wheelspin or losing traction, as in the rejected texts.
2. New rule 5: no driver states the data do not measure (insecurity, hesitation, fear, lack of confidence); describe what the data show and give the tip.
3. New rule 6: do not add up the corners' losses or compare them with the official difference; the primary lap may have gained time elsewhere, so the opportunities can add up to more than the official difference (in (7, 6): 0.38 + 0.19 + 0.18 s of loss in a lap 0.162 s faster).
4. New rule 7: proportion; a loss of a few hundredths is fine-tuning, not the lap's biggest problem (in (7, 8), `3. 2121m · +0.02s`).

The six messages do not change (the builder did not change; their SHA-256 were checked against the files written before the review).

**Where each definition comes from in the code**: the signs (`brakingAnalysis.ts:33-34`, `throttleAnalysis.ts:38`); `peakBrakeDiff` on the 0–1 brake scale (`brakingAnalysis.ts:29-30, 34`); trail braking = brake above 0.1 with `|steer|` above 0.15 between the braking start and the apex (`brakingAnalysis.ts:6, 9, 40-48`); coasting = brake ≤ 0.05 and throttle ≤ 0.05 between the apex and the first sample at throttle 0.9 (`throttleAnalysis.ts:6-8, 31, 46-59`); oscillation between the apex and that point (`throttleAnalysis.ts:61-77`); `maxLateralDeviationM` is the largest absolute value and the sign of the deviation is arbitrary, "perpendicular à direita da tangente da comparação" (`lineDeviation.ts:49-57, 80-84`). The arbitrary sign of the lateral deviation was found in this research; it is the same kind of error as the rejected texts (a sign the model may read as "inside/outside"), so the prompt covers it under FR-012 (approved by the maintainer at the plan review).

### Diff against today's prompt

```diff
@@ -1,29 +1,40 @@
-Você é um engenheiro de pista experiente, especialista em telemetria de F1 24. Sua função é analisar a comparação entre duas voltas de um piloto e explicar, em linguagem de piloto, onde ele está perdendo tempo e como melhorar.
+Você é um engenheiro de pista experiente, especialista em telemetria de F1 24. Sua função é explicar ao piloto, em linguagem de piloto, onde a volta principal perdeu tempo para a volta de comparação e como melhorar.
 
-Você recebe um JSON com a comparação entre a volta "principal" (que o piloto quer melhorar) e uma volta de "comparação" (benchmark - normalmente a melhor volta do próprio piloto). Estrutura do JSON:
+A mensagem do usuário traz, nesta ordem:
+1. As duas voltas comparadas: o número de cada uma, o tempo oficial, se é válida ou inválida, e a diferença oficial entre elas, já escrita em palavras. Todos os deltas e diferenças da mensagem são da volta principal contra a volta de comparação, e de nada mais.
+2. Às vezes, um aviso de que a volta de comparação é inválida.
+3. As oportunidades: até três curvas, já escolhidas e ordenadas pelo sistema, cada uma com um rótulo (ex: "1. 334m · +0.29s": posição, ápice em metros na volta e tempo perdido nessa curva) e com a direção de cada diferença já escrita em palavras.
+4. O JSON completo da comparação, para consulta.
 
-- totalDeltaS: tempo total (segundos) que a volta principal está mais lenta que a comparação. Positivo = principal mais lenta.
-- corners: array de curvas detectadas na volta principal, cada uma com:
-  - corner.apexDistance (metros na volta), corner.apexSpeed (km/h no ápice), corner.severity (slow/medium/fast)
-  - deltaLossS: tempo (segundos) ganho ou perdido ESPECIFICAMENTE nessa curva. Positivo = perdeu tempo ali.
-  - braking.brakingPointDiffM: diferença do ponto de frenagem em metros. Negativo = freou ANTES (mais longe da curva) que a comparação. Positivo = freou DEPOIS.
-  - braking.peakBrakeDiff: diferença na intensidade máxima de freio aplicada.
-  - braking.trailBrakingPrimary / trailBrakingComparison: se houve frenagem em curva (freio liberado gradualmente com o volante virado).
-  - throttle.throttleOnDiffM: diferença de onde voltou ao acelerador. Positivo = acelerou DEPOIS (mais longe da curva) que a comparação.
-  - throttle.coastingTimePrimaryS / coastingTimeComparisonS: tempo (segundos) sem frear nem acelerar entre o ápice e a saída - "tempo morto".
-  - throttle.throttleOscillationPrimary / throttleOscillationComparison: quantas vezes o acelerador mudou de direção na saída (correção de tração/traçado).
-  - lineDeviation.maxLateralDeviationM / avgLateralDeviationM: desvio lateral (metros) em relação à linha da volta de comparação naquela curva, ou null se não houver dado.
+Estrutura do JSON (todas as diferenças são volta principal menos volta de comparação):
+- totalDeltaS: delta acumulado medido pelas amostras. Não é a diferença oficial de tempo de volta; não o cite.
+- corners: curvas detectadas na volta principal, cada uma com:
+  - corner.apexDistance (metros na volta), corner.apexSpeed (km/h no ápice), corner.severity (slow/medium/fast). corner.index é um índice interno: nunca o mostre.
+  - deltaLossS: tempo (segundos) perdido nessa curva. Positivo = a volta principal perdeu tempo ali.
+  - braking.brakingPointDiffM: negativo = a volta principal começou a frear ANTES (mais longe da curva); positivo = DEPOIS.
+  - braking.peakBrakeDiff: diferença da pressão máxima de freio, numa escala de 0 a 1. Positivo = a volta principal freou mais forte; negativo = mais leve.
+  - braking.trailBrakingPrimary / trailBrakingComparison: true se a volta fez trail braking (freio ainda aplicado com o volante já virado, entre o início da frenagem e o ápice); false se não fez.
+  - throttle.throttleOnDiffM: negativo = a volta principal voltou ao acelerador ANTES; positivo = DEPOIS.
+  - throttle.coastingTimePrimaryS / coastingTimeComparisonS: coasting, em segundos: tempo entre o ápice e a retomada do acelerador em que o carro anda sem freio e sem acelerador, só rolando. Coasting não é patinar, derrapar nem perder tração.
+  - throttle.throttleOscillationPrimary / throttleOscillationComparison: quantas vezes o acelerador mudou de direção entre o ápice e a retomada (correção na saída).
+  - lineDeviation.maxLateralDeviationM / avgLateralDeviationM: desvio lateral (metros) em relação à linha da volta de comparação naquela curva, ou null se não houver dado. maxLateralDeviationM é o maior afastamento, sem sinal. O sinal de avgLateralDeviationM é arbitrário: não diga para que lado (dentro, fora, esquerda, direita) a volta principal foi.
 - tyreWindowExcursions: trechos em que algum pneu (rearLeft/rearRight/frontLeft/frontRight) saiu da janela de temperatura ideal (status "cold" ou "hot"), com a distância do trecho.
 
 Sua tarefa:
-1. Identifique as 3 curvas com maior deltaLossS positivo (as maiores oportunidades de ganho de tempo). Se houver menos de 3 curvas com perda, liste as que existirem.
-2. Para cada uma, traduza os números pra linguagem de piloto - NUNCA cite nomes de campos do JSON (não diga "brakingPointDiffM", diga "você freou X metros antes"). Diagnostique a causa raiz: foi frenagem, traçado, tração na saída, ou uma combinação?
-3. Dê uma dica curta e acionável pra cada curva.
-4. Se houver excursões de temperatura de pneu relevantes (trechos longos, non-trivial), mencione brevemente ao final, sem alongar.
-5. Nunca invente números que não estejam no JSON. Se um campo vier null, simplesmente não comente aquele aspecto daquela curva - não diga que o dado "não está disponível", apenas omita.
-6. Responda em português do Brasil, tom direto e técnico mas acessível, como um engenheiro de pista falando no rádio durante um treino.
+1. Abra com uma frase que resume a diferença oficial entre as duas voltas, como a mensagem a escreve. Se a diferença oficial for desconhecida, não afirme nenhuma diferença de tempo de volta.
+2. Explique as oportunidades na ordem em que vieram, cada uma identificada só pelo rótulo dado (ex: "1. 334m · +0.29s"). Não escolha, não reordene, não renumere e não dê nome nem número próprio às curvas (nada de "Curva 4"). Se não houver oportunidades, diga que nenhuma curva perdeu tempo e não invente outras.
+3. Para cada oportunidade, use as direções já escritas na mensagem; nunca as inverta nem as reinterprete a partir do JSON. Diagnostique a causa raiz (frenagem, traçado, retomada do acelerador na saída, ou uma combinação) e dê uma dica curta e acionável.
+4. Nunca afirme algo que contradiga um campo: se trailBraking de uma volta é false, não diga que ela fez trail braking; se um campo vier null, omita aquele aspecto, sem dizer que o dado não está disponível.
+5. Não atribua ao piloto estados que os dados não medem (insegurança, hesitação, medo, falta de confiança). Descreva o que os dados mostram e dê a dica.
+6. Não some as perdas das curvas nem as compare com a diferença oficial: a volta principal pode ter ganhado tempo em outras curvas, e por isso a soma das oportunidades pode ser maior que a diferença oficial.
+7. Guarde a proporção: uma perda de poucos centésimos é ajuste fino, não o maior problema da volta.
+8. Não fale de setores: os dados não têm tempo por setor.
+9. Se a volta de comparação for inválida, repita o aviso da mensagem com suas palavras. Nunca afirme onde nem por que uma volta foi invalidada: não há dado sobre isso.
+10. Nunca cite nomes de campos do JSON (não diga "brakingPointDiffM", diga "você começou a frear X metros antes") e nunca invente números que não estejam na mensagem.
+11. Se houver excursões de temperatura de pneu relevantes (trechos longos), mencione brevemente ao final.
+12. Responda em português do Brasil, tom direto e técnico mas acessível, como um engenheiro de pista falando no rádio durante um treino.
 
 Formato da resposta:
-- Uma frase de abertura resumindo o delta total.
-- As oportunidades numeradas (1, 2, 3), cada uma com um título curto identificando a curva (ex: "Curva 4 - freada tardia") seguido de 2-3 frases de diagnóstico e a dica.
+- A frase de abertura com a diferença oficial.
+- As oportunidades, cada uma começando pelo rótulo dado, seguido de 2-3 frases de diagnóstico e a dica.
 - Se aplicável, um parágrafo final curto sobre pneus.
```

**Size and tokens**: 5,229 characters against 3,236 (+62%), and each user message grows by the reading (the six messages: 5,592–8,256 characters, against 3,803–6,406 before, 003 research.md section 7). The token counts are not measured or estimated here: measuring needs the API key (manual task of the maintainer, quickstart). Until then, the documentation stops citing 1,378 tokens (FR-017).

---

## 5. The prompt version

### Decision

`PROMPT_VERSION` = the first 16 hex characters of SHA-256 over:

1. the system prompt with its line breaks normalized (`\r\n` and lone `\r` → `\n`);
2. a separator (`"\n\u0000\n"`, which cannot occur in the prompt);
3. the messages built by the real `buildCoachUserMessage` from **fixed reference inputs** in the code, line breaks normalized the same way.

The reference inputs cover every branch of the message: braking earlier, later and equal; harder, softer and equal; throttle earlier, later, `null`; trail braking in all four combinations; a corner with `deltaLossS ≤ 0` that must be left out; an invalid comparison lap with the warning; and a last pair with unknown times and validity and no opportunity. A message shows at most three opportunities, so the branches are spread over **three** reference inputs (amended at T025, see plan). `coachReading.ts` exports `PHRASE_TEMPLATES`, the closed set of phrase templates the code writes, and a test requires each template to appear in at least one reference message, so a new branch without a reference fails the test instead of silently not affecting the version, with no hand-written list to keep up to date.

It is computed once, at module load, by a pure function `computePromptVersion(systemPrompt, buildMessage)`; the module imports only the prompt and the builder (no `env`, no database), so `analyze`, the resolver and spec 003's export and start check can import it.

### Evidence

```text
versão do prompt (protótipo): 395e27bac6daabc6
versão com o prompt em CRLF: 395e27bac6daabc6
```

And how a CRLF checkout reaches a template literal today:

```text
$ node <scratch>/crlf-template.js <scratch>     # writes a module whose template literal spans a CRLF line break, then requires it
template literal lido de arquivo CRLF contém \r? false "linha 1\nlinha 2"
```

ECMAScript normalizes `CR LF` and `CR` to `LF` in the value of a template literal, so `COACH_SYSTEM_PROMPT` is already the same string under a CRLF and an LF checkout. The explicit normalization is still required (FR-013): it does not depend on the prompt staying a template literal, and it also covers the reference messages and any text read from a file later.

### The repository's line-ending settings (read only)

```text
$ cat .gitattributes
.specify/** linguist-vendored
$ git config --get core.autocrlf
true
```

`.gitattributes` exists but sets no `eol`/`text` rule, so line endings depend on each clone's `core.autocrlf` (`true` on the maintainer's machine; the hosting platform's Linux clone gets LF). **Debt, outside this spec**: a `* text=auto eol=lf` rule (or per extension) would make every checkout identical; changing it renormalizes files and deserves its own change.

### Alternatives considered

- **Hash of the source files** (`coachPrompt.ts`, `coachUserMessage.ts`) read at run time: changes on a comment or a formatting edit (a seed refused for nothing), depends on the files being present next to `dist/`, and is exactly the case where raw CRLF would leak in. Rejected.
- **A manual version string**: forbidden by FR-013 (no manual bump).
- **Hash of the six demo messages**: needs the recording, so it could not be a constant of the code. Rejected; spec 003 can still compare messages if it wants.

---

## 6. The `lap_analyses` migration

### How migrations run today

`src/persistence/db.ts` runs `SCHEMA_SQL` (`CREATE TABLE IF NOT EXISTS`, line 23), then defensive `ALTER TABLE … ADD COLUMN` statements that ignore only the "duplicate column name" error (lines 25–51: `sessions.track_id`, `overall_frame_identifier` on the two sample tables), then `CREATE UNIQUE INDEX IF NOT EXISTS` (lines 53–58). There is no version table; every start re-runs all of it, and each step is idempotent by construction. It runs at import of `db.ts`, so the first start of a new version migrates the real database.

### Decision

- `schema.ts`: `lap_analyses` gains `prompt_version TEXT` (new databases).
- `db.ts`: `ALTER TABLE lap_analyses ADD COLUMN prompt_version TEXT`, with the same "duplicate column name" guard, extracted with the existing ones into a function that receives the connection, so a test can run it on a database it created itself.
- Existing rows keep every column; `prompt_version` is `NULL` on them, which the staleness rule treats as stale (FR-014). Nothing is deleted or rewritten by the migration; a stale row is replaced only when its pair is requested with the key.
- The column stays nullable: SQLite cannot add a `NOT NULL` column without a default, and a default would invent a version (principle IV). New rows always carry the current version.

### Evidence: on a temporary database with the old schema

```text
banco: C:\Users\anala\AppData\Local\Temp\telemetryf1-004-mig-9VSsk6\old.db
INSERT repetido hoje: SQLITE_CONSTRAINT_UNIQUE UNIQUE constraint failed: lap_analyses.session_id, lap_analyses.lap_a, lap_analyses.lap_b
rodada 1 : coluna adicionada
rodada 2 : já existe -> duplicate column name: prompt_version
linhas: [{"session_id":1,"lap_a":8,"lap_b":7,"analysis_text":"texto antigo","model":"claude-opus-4-8","prompt_version":null}]
após upsert: [{"id":1,"analysis_text":"texto novo","prompt_version":"abc"}]
removido
```

(The old `lap_analyses` DDL copied from `schema.ts:91-101`; `better-sqlite3` from the project; the file under the system temp folder, removed at the end.) It shows: idempotent (the second run hits the guard), the existing row kept with `prompt_version` `NULL`, and the upsert replacing the row in place (same `id`).

### Test

`node:test`, a database file created by the test in `os.tmpdir()` with the **old** `lap_analyses` DDL (a literal in the test, copied from `main`) and one row; the migration function run twice on that connection; asserts the column exists, the row is intact with `prompt_version` `NULL`, and no error. A second test runs it on a database created with the new `SCHEMA_SQL` (no error, nothing changed). No `DB_PATH` is needed, because the function receives the connection; `data/telemetry.db` is never opened.

### The maintainer's backup (README)

Before the first start of the new version on the real database, with the API **stopped** (no writer during the copy):

```bash
node -e "require('fs').mkdirSync('C:/Telemetry/backups',{recursive:true}); const D=require('better-sqlite3'); const db=new D('data/telemetry.db',{readonly:true}); db.exec(\"VACUUM INTO 'C:/Telemetry/backups/telemetry-before-004.db'\"); db.close()"
```

`VACUUM INTO` writes a consistent, compacted copy and leaves the original unchanged; it refuses to overwrite an existing file. `better-sqlite3` is already a dependency, so no `sqlite3` CLI is needed. The copy goes to `C:/Telemetry/backups/`, outside the repository (changed at M1 by the maintainer; `.gitignore` already ignores the whole `data` folder, checked with `git check-ignore -v`, but a copy outside cannot be committed by accident), and stays there until spec 004 merges (`CLAUDE.md`, Rules). This is a manual task: the agent never runs it against `data/telemetry.db`.

---

## 7. Concurrent requests for the same stale pair

### Today

Two requests for the same uncached pair both pass the cache check (`analysisRouter.ts:44`), both call the paid API (line 75), and the second `insertAnalysis` fails on the `UNIQUE` (evidence above: `SQLITE_CONSTRAINT_UNIQUE`); that error is not one of the `Coaching*` errors, so the second request answers 500 "erro inesperado ao gerar análise" (lines 78–92) and its paid text is lost.

**This is a bug, fixed by this spec**: two paid calls for one pair, and the second ends in a 500 that discards a text already paid for. The single-flight and the upsert below remove both. When the fix lands (plan, commit 7), the README records it as fixed by spec 004.

### Decision

- **Single-flight per pair**: a small generic module keeps a `Map<string, Promise<T>>` keyed by `${sessionId}:${lapA}:${lapB}`. The first stale or missing request starts the generation and stores its promise; requests for the same key that arrive meanwhile await the same promise. The entry is removed when the promise settles, success or failure, so a failure is not cached and the next request tries again. Joiners receive the same result (`cached: false`) or the same error (same status).
- **Replace, don't insert**: `INSERT … ON CONFLICT(session_id, lap_a, lap_b) DO UPDATE SET insights_json, analysis_text, model, prompt_version, created_at` (shown above). The row keeps its `id`; `created_at` becomes the time of the new text.
- **Scope**: one process. The local server is one process, and demo mode never generates; several processes on one database would still be serialized only by the upsert (two calls, last text wins), which is recorded, not solved.
- **Where**: an analysis resolver (`src/coaching/analysisResolver.ts`) with its dependencies injected (read the cached row, is the key configured, build the inputs, generate, save, current model and prompt version). The router passes the real ones; tests pass fakes, so no test can make a paid call and no test needs a database for this logic.

### Alternatives considered

- **No single-flight, upsert only**: no 500, but two paid calls for one pair. Rejected (principle III: the same input is never sent twice).
- **A "pending" row in the table** as a lock: survives a crash as a stuck lock and needs cleanup. Rejected for a single local process.

---

## 8. Test strategy (TDD)

The pure functions are written test-first. For each one, the test is written against a stub that returns a deliberately wrong value of the right type (an empty string, `[]`, `"x"`, `false`), run, and seen failing **on its own assertion** (an `AssertionError` with expected/actual, not a `TypeError` or an import error); then the stub is replaced by the implementation. The failing output is recorded in the task. Because `npm test` must pass before every commit (constitution), a failing test is never committed on its own: the test and its implementation go in the same `feat:` commit.

| Pure function | What the tests pin |
|---|---|
| `topOpportunities`, `opportunityLabel` | filter `> 0` (0, −0, negatives out), descending, stable ties, at most 3; the label byte for byte, including `Math.round(x.5)`, a negative apex, `toFixed(2)` of 1.005, U+00B7 |
| direction phrases | positive, negative, zero and `null` for each of the three differences; the four trail-braking combinations; coasting values as given |
| compared laps and official difference | slower, faster, equal; unknown time or validity; the millisecond formatting (0.162, 0.934, 0.772 s) |
| invalid-comparison warning | present only when the comparison lap is invalid (not when only the primary is, not when unknown) |
| `buildCoachUserMessage` | order of the blocks; no benchmark anywhere (no "Recorde", no "teórica", no "setores"); the JSON is `JSON.stringify(insights)` unchanged |
| `computePromptVersion` | same input twice → same; one character of the prompt → different; a builder that changes a phrase → different; the prompt with CRLF and with LF → same (SC-004a); the reference messages cover every branch |
| `isCachedAnalysisCurrent` | current version and model → current; other version, other model, `null` version → stale |
| prompt text | contains each instruction of FR-011/FR-012 (labels and order, no "Curva", no sectors, no contradiction, coasting definition, the four signs, the invalidation rule) and the review's rules (no unmeasured driver states, no sum of losses against the official difference, proportion, "retomada do acelerador" as a cause); no "normalmente a melhor volta", no "tração na saída" |

The analysis resolver (orchestration with fakes: current row served, stale with key regenerated and saved once, stale without key → unavailable, two concurrent calls → one generation, a failure not cached), and the migration (temporary database, section 6) are tested after, as integration tests. The `analyze` output is a pure function (`formatAnalyzeOutput`), tested like the others; the command itself stays thin and is checked by the V2 run (plan.md, "Amendments").

---

## CI runs

Confirmed through the jobs API (`status` completed and `conclusion` success on every job).

| Push | Head commit | Run | `typecheck` | `test` |
|---|---|---|---|---|
| First push (commits 1–4) | `a48ba2c` | [40013161554](https://github.com/AnaLauraFFerraz/TelemetryF1_API/actions/runs/40013161554) | success | success |
| Second push (commits 5–7 and the backup docs) | `38ac1e9` | [40030469003](https://github.com/AnaLauraFFerraz/TelemetryF1_API/actions/runs/40030469003) | success | success |
| Third push (commit 8 and the validation docs) | pending | pending | pending | pending |

---

## Implementation evidence

Nothing here pointed at `data/telemetry.db`: the database of V2 and V3 is a temporary file in the agent's scratch folder (`DB_PATH`), its use confirmed by the `[db] usando banco em …/v2.db` line of each server log. No paid call: every command ran after the key check printed `false`, with the keyless `.env` files outside the repository.

### T056 — contract check

`git diff main --stat -- src/ws/messageFormat.ts src/http/routes/sessionsRouter.ts src/persistence/sessionRepository.ts src/persistence/carTelemetrySampleRepository.ts src/persistence/motionSampleRepository.ts` is empty. `src/http/routes/analysisRouter.ts` keeps every status code and error string of `main`: 400 (two messages), 404 `session not found`, 503 `coaching indisponível: configure ANTHROPIC_API_KEY`, 400 `uma das voltas não tem amostras de telemetria`, and the `Coaching*` errors 503/429/502 and 500 `erro inesperado ao gerar análise`; the response body stays `{ analysis, insights, cached }`. `LapRow` is unchanged (the diff of `lapRepository.ts` only adds `LapDbRow`, `mapLapRow` and `getLapForSession`). The one behaviour change is the stale-row 503 (contracts/analysis-endpoint.md).

### T057 — V2, and the six messages

Server with the ports `.env`, then the replay to completion (`13960 pacotes reenviados, 1 passada(s)`), then the server stopped (its process ended by PID, after checking its command line, since stopping the task left the node child listening); `analyze` for the six ordered pairs with the portless `.env`:

```text
$ DOTENV_CONFIG_PATH=<keyless-ports.env> DB_PATH=<scratch>/v2.db npm run dev
$ DOTENV_CONFIG_PATH=<keyless-ports.env> DB_PATH=<scratch>/v2.db npm run replay -- recordings/demo-interlagos-tt-20hz-laps6-8.jsonl --speed=2x
$ DOTENV_CONFIG_PATH=<keyless.env> DB_PATH=<scratch>/v2.db npm run -s analyze -- 1 <a> <b>     # six pairs → <scratch>/m3/analyze-<a>-<b>.txt
voltas: [{"lap_number":6,"lap_time_ms":74306,"is_valid":0},{"lap_number":7,"lap_time_ms":74144,"is_valid":1},{"lap_number":8,"lap_time_ms":73372,"is_valid":1}]
par (6,7): idêntica true (8242 caracteres, bloco 8242); versão 8c4d40e60f323e80
par (6,8): idêntica true (8256 caracteres, bloco 8256); versão 8c4d40e60f323e80
par (7,6): idêntica true (5832 caracteres, bloco 5832); versão 8c4d40e60f323e80
par (7,8): idêntica true (5664 caracteres, bloco 5664); versão 8c4d40e60f323e80
par (8,6): idêntica true (5857 caracteres, bloco 5857); versão 8c4d40e60f323e80
par (8,7): idêntica true (5592 caracteres, bloco 5592); versão 8c4d40e60f323e80
todas idênticas: true
prompt idêntico: true   (T024: 5229 characters on both sides)
```

The message of each saved output equals, character for character, the block of section 4 for that pair, and the lap times are the expected 74.306 / 74.144 / 73.372 s. The implemented `PROMPT_VERSION` is **`8c4d40e60f323e80`** (it changes with any later edit of the prompt or of the message).

### T058 — V3, the stale-row policy

Same temporary database, server with the ports `.env`, no key; a row for (8, 7) inserted with `prompt_version` NULL by a one-off `better-sqlite3` script:

```text
POST /sessions/1/analysis {"lapA":8,"lapB":7}   prompt_version NULL
{"error":"coaching indisponível: configure ANTHROPIC_API_KEY"} [HTTP 503]
(row updated: prompt_version 8c4d40e60f323e80, model claude-opus-4-8)
{"analysis":"texto antigo guardado","insights":{"totalDeltaS":0,"corners":[],"tyreWindowExcursions":[]},"cached":true} [HTTP 200]
```

### T060 — M2, the token count of the new prompt (run by the maintainer)

Run by the maintainer in her own PowerShell, with the key read from the repository's `.env` by `dotenv`, after a check that only the token-counting endpoint is called. The script (`countPromptTokens.js`, in the agent's scratch folder) reads `COACH_SYSTEM_PROMPT` and `COACH_MODEL` from the source through `ts-node` (no copy of the text) and makes two counts with the same one-character user message `.`, because the endpoint requires at least one message: one without the prompt, one with the prompt in the coach's `system` block format (with `cache_control`). The prompt's own count is the difference; count 2 alone would include the minimal message.

```text
modelo: claude-opus-4-8
caracteres do prompt: 5229
1) so a mensagem minima ("."): 7 tokens
2) prompt + mensagem minima: 2179 tokens
prompt isolado (2 - 1): 2172 tokens
```

The 5,229 characters equal the implemented prompt's length checked at T024. Notes from the documentation of the endpoint ([Token counting](https://platform.claude.com/docs/en/build-with-claude/token-counting)):

- It is **free to use**, subject only to requests-per-minute limits, which are separate from the limits of creating messages.
- The count is an **estimate**: the real number of input tokens may differ by a small amount, and it may include tokens added by Anthropic for system optimizations, which are not billed.
- It counts under the tokenizer of the `model` passed; models from Claude Opus 4.7 on use a newer tokenizer (about 30% more tokens for the same text), so the count must be taken with `claude-opus-4-8` and a figure measured on another model is not reusable.
- It uses no caching logic, even when the request carries `cache_control`.

### T061 — the minimum cacheable length, and a wrong sentence corrected

The [prompt caching page](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), "Cache limitations", gives **1,024 tokens** as the minimum for Claude Opus 4.8 (2,048 for Opus 4.7, 4,096 for Opus 4.6 and 4.5). The current prompt (2,172 tokens, an estimate) is above it.

The maintainer supplied the execution evidence the agent did not have: when the demo's cache file was exported, on 2026-10-23, still with the previous prompt, the usage log showed `cache_write=1380` on the first call and `cache_read=1380` on the five that followed. Prompt caching of the system block therefore already worked with `claude-opus-4-8`, and the sentence that the prompt "is below the model's minimum cacheable length, so `cache_control` has no effect" was already wrong in `README.md`, `CLAUDE.md` and the comment of `coachService.ts` (the figure of 1,378 tokens it rested on was a count of the previous prompt; the observed 1,380 cached tokens agree with it within the estimate's tolerance, so the figure was right and the conclusion drawn from it was not). The three places now say the prompt is cacheable, with the 1,024-token minimum, the 2,172-token estimate and the observation; the current prompt's own cache behaviour is stated as expected, not observed, since it has not been sent to the API.

### T063 — FR coverage rechecked against the code

| Requirement | Where it is in the code, and what covers it |
|---|---|
| FR-001, FR-001a, FR-002, FR-003 | `comparedLapsBlock`, `invalidComparisonWarning` in `coachReading.ts`; `coachReading.test.ts`, `coachUserMessage.test.ts`; the six messages of V2 equal section 4 |
| FR-004, FR-015 | `buildCoachUserMessage` takes only the insights and the two laps; no `getTrackBenchmark` or sector text in `src/coaching/` (grep); `GET /sessions/:id/benchmark` untouched (T056) |
| FR-005, FR-011, FR-012 | `COACH_SYSTEM_PROMPT` equals section 4 (T024); `coachPrompt.test.ts` |
| FR-006, FR-007 | `opportunities.ts`; `opportunities.test.ts` (rule, label, ties, cap) |
| FR-008, FR-009 | `PHRASE_TEMPLATES` and the phrase functions in `coachReading.ts`; every magnitude is the absolute value of a field; `coachReading.test.ts` |
| FR-010 | T056: no change in the response shape or in any status code or string |
| FR-013 | `promptVersion.ts`; `promptVersion.test.ts` (including CRLF/LF and the coverage of every phrase template) |
| FR-014, FR-014a | `analysisStaleness.ts`, `singleFlight.ts`, `analysisResolver.ts`, `migrations.ts`, `analysisRepository.ts` and their tests; V3 (T058); README and CLAUDE.md updated; M1 answered (T037) |
| FR-016, FR-016a | the test files above; the README sentence on human reading; `analyzeOutput.ts` and `tools/analyze.ts` (V2) |
| FR-017, FR-018 | no paid call by the agent (every command ran after the key check printed `false`); M2 run by the maintainer; nothing pointed at `data/telemetry.db` |
| SC-001 to SC-005 | V2 (six messages), `opportunities.test.ts`, `coachReading.test.ts`, `promptVersion.test.ts`, `analysisResolver.test.ts`, V3 |
| SC-006 | pending: M3 approved the six messages; the reading of generated texts belongs to spec 003 |

---

## Debt outside this spec

- **`src/config/serverFailFast.test.ts` is not hermetic.** Its child process inherits the environment of whoever runs the test (`DOTENV_CONFIG_PATH` and the ports; it only deletes `WS_PORT`, `UDP_PORT` and `HTTP_PORT` from the variables it copies, not the path of a `.env` that defines them). Found at T001: with a scratch `.env` holding the three ports, "o servidor para na inicialização quando nenhuma porta está definida" fails (94 of 95; the server starts and the test hits its 30 s timeout); with a `.env` without ports, 95 of 95. The local result therefore depends on the `.env` pointed at, and on CI it passes only because there is no `.env` there. The fix, in a future spec, is for the test to build the child's environment explicitly instead of copying `process.env`. Until then this feature runs `npm test` with a portless keyless `.env` (tasks.md header, T001).
