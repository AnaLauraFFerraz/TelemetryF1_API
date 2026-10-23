# Contract: REST

Owner: this repository (constitution, principle VI). The frontend mirrors it in `Telemetry-F1/src/types/rest.ts`.

## Unchanged in both modes

- Routes, methods, payload shapes, status codes and error strings of `GET /sessions`, `GET /sessions/:id`, `GET /sessions/:id/benchmark`, `GET /sessions/:id/laps/:lapNumber/telemetry` and `POST /sessions/:id/analysis`, including the literal `"session not found"` and the coach's 503 body `"coaching indisponível: configure ANTHROPIC_API_KEY"`.
- Express's default weak `ETag` and its automatic `304` on a matching `If-None-Match`.

## New in both modes

### `GET /health`

| Mode | Status | Body | Headers |
|---|---|---|---|
| Local | `200` | `{"status":"ok"}` | `Cache-Control: no-store` |
| Demo, replay running | `200` | `{"status":"ok"}` | `Cache-Control: no-store` |
| Demo, replay loop stopped unexpectedly | `503` | `{"status":"replay stopped"}` | `Cache-Control: no-store` |

In demo mode the server does not listen before the demo is ready (session built, capture times written, cache seeded), so "not ready" shows to the platform as a refused connection, not as a response. The endpoint is not subject to the origin rule; the platform's probe sends no `Origin`.

## Demo mode: what changes

| Aspect | Demo mode | Requirement |
|---|---|---|
| Address | `PORT`, the single port the platform assigns, on `0.0.0.0` | FR-002, FR-016 |
| CORS | `Access-Control-Allow-Origin` only for the configured frontend origin (with `Vary: Origin`); no CORS headers for any other origin. Requests without `Origin` are served (non-browser clients). Not access control. | FR-018 |
| Read routes | `Cache-Control: no-cache` plus the ETag: the browser revalidates every time and gets `304` without a body while the data is unchanged; after a deploy that changes the data the ETag changes. Cache lifetime: zero, with revalidation. | FR-026 |
| `POST /sessions/:id/analysis` | `Cache-Control: no-store`. A seeded pair returns `200` with `cached: true`; any other pair returns the existing `503` body. Never calls Anthropic, never writes. | FR-012, FR-015 |
| Session dates | `startedAt` = capture time of the recording's first packet (`2026-10-16T16:30:23.797Z`), `lastSeenAt` = capture time of its last packet (`2026-10-16T16:34:06.755Z`), each lap's `recordedAt` = capture time of the packet that completed it. Fixed for the life of the deployment. Same fields, same ISO format. | FR-010 |
| Session id | Always `1` (the only session of an empty in-memory database), on every start. | — |
| Compression | None by the application. The platform's load balancers compress HTTP responses with Brotli and gzip ([Render vs Heroku](https://render.com/docs/render-vs-heroku-comparison), read 2026-10-21); one lap's telemetry is 554–561 KB raw, 77–79 KB with Brotli (quality 4), 84–86 KB with gzip. | T-3 |
| 429 | **Not introduced**: the per-IP limit (FR-027) is not adopted (research.md, point 1). | FR-027 |

## For the frontend's spec 003

- Point the REST base URL at the demo's host.
- Expect `304` revalidations to be handled transparently by the browser (`fetch` with the default cache mode, as today).
- In demo mode, the coach's 503 means "this comparison is not prepared"; its body still mentions `ANTHROPIC_API_KEY` and how to present it is the frontend's decision. With today's fixed primary lap, only (8, 6) and (8, 7) are requested, and both are seeded.
- If the frontend is hosted in the same account as the API, its traffic spends the same 5 GB monthly allowance.
