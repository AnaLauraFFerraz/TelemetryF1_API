# Contract: `POST /sessions/:id/analysis`

Owned by this repository and mirrored by the frontend. **The shape does not change.** One behaviour changes and is called out for the frontend's awareness (no frontend change is needed).

## Request (unchanged)

`POST /sessions/:id/analysis` with body `{ "lapA": <int>, "lapB": <int> }`.

## Responses (unchanged shapes and strings)

| Status | Body | When |
|---|---|---|
| 200 | `{ "analysis": string, "insights": LapInsights, "cached": true }` | A cached row with the current prompt version and model. |
| 200 | `{ "analysis": string, "insights": LapInsights, "cached": false }` | Generated now (missing or stale row, key configured), including requests that joined an in-flight generation of the same pair. |
| 400 | `{ "error": "sessionId, lapA e lapB devem ser inteiros" }` | unchanged |
| 400 | `{ "error": "lapA e lapB devem ser voltas diferentes" }` | unchanged |
| 400 | `{ "error": "uma das voltas não tem amostras de telemetria" }` | unchanged |
| 404 | `{ "error": "session not found" }` | unchanged |
| 503 | `{ "error": "coaching indisponível: configure ANTHROPIC_API_KEY" }` | No key, and the row is missing **or stale** (changed: a stale row used to be served). |
| 503 / 429 / 502 | the coach's error messages | unchanged |
| 500 | `{ "error": "erro inesperado ao gerar análise" }` | unchanged; no longer produced by two concurrent requests for the same pair. |

## Behaviour change

- **Before**: any row for `(session, lapA, lapB)` was served, whatever prompt or model produced it.
- **After**: a row is served only when its `prompt_version` and `model` equal the current ones; otherwise it is regenerated and replaced (with the key) or the request answers 503 (without the key). Every row written before this feature is stale.
- The frontend already shows the 503 body for uncached pairs; a previously cached pair can now show it too on a machine without the key.

## Unchanged

`GET /sessions/:id/benchmark` (still serves the track benchmark), every other route, the WebSocket messages.
