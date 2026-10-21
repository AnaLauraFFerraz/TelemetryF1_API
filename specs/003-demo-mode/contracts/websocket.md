# Contract: WebSocket stream

Owner: this repository (constitution, principle VI). The frontend mirrors it in `Telemetry-F1/src/types/ws.ts`.

## Unchanged in both modes

- Envelope (`src/ws/messageFormat.ts`, `TelemetryWsMessage`): `type` (`"motion" | "lapData" | "carTelemetry"`), `sessionUID` (decimal string), `sessionTime`, `frameIdentifier`, `playerCarIndex`, `data` (array). No field is added, removed or renamed.
- Server-to-client only; client messages are ignored.
- Ping every 15 s; a client that misses two pongs is terminated.

## Local mode (demo off): unchanged

- Address: `ws://<host>:WS_PORT`, its own port.
- `data` holds all 22 cars; `playerCarIndex` is the game's index into it.
- No connection limit, no time limit, no origin check.

## Demo mode: what changes

| Aspect | Demo mode | Requirement |
|---|---|---|
| Address | Same host and port as REST (`PORT`), any path: `wss://<service host>/` behind the platform's TLS | FR-016 |
| `data` | **Only the player's car**: an array of length 1 | FR-025 |
| `playerCarIndex` | **Always `0`**, the index of that single car | FR-025 |
| Compression | `permessage-deflate` (RFC 7692) negotiated whenever the client offers it, as every current browser does; server and client context takeover, the library's defaults. A client that does not offer it receives the same messages uncompressed. Measured on the wire: 6.7 KiB/s instead of 47.3 KiB/s. | FR-025 |
| Rate | The recording's own 20 Hz per packet type, unchanged. | FR-025 |
| Origin | Handshake with an `Origin` header different from the configured frontend origin: refused with HTTP `403 Forbidden` before the upgrade. No `Origin` header (non-browser client): accepted. This limits browsers only; it is not access control. | FR-018 |
| Capacity | At most `DEMO_MAX_CONNECTIONS` (default 5) open connections. One more is accepted and closed at once with **code `4001`, reason `"demo full"`**. | FR-023 |
| Duration | Each connection is closed **5 minutes** (`DEMO_MAX_CONNECTION_MINUTES`) after it opened, with **code `4002`, reason `"time limit"`**. The server does not reopen it. | FR-024 |
| Shutdown | On `SIGTERM` (deploy, restart, spin-down) the server closes open connections with code `1001` ("going away", standard). | — |

Codes 4001 and 4002 are in the private-use range 4000–4999 of RFC 6455 §7.4.2, accepted by `ws` 8.18.0 (`lib/validation.js`, `isValidStatusCode`). The reasons are ASCII and well under the 123-byte limit of a close reason.

**Why this is a contract change even though the shape is the same**: a frontend that reads `data[playerCarIndex]`, as today's does (`Telemetry-F1/src/context/TelemetryProvider.tsx`), works in both modes; a frontend that reads any other car, or assumes 22 entries, would break only in the demo.

## For the frontend's spec 003

- Configure the demo's WebSocket URL as the API's host on the same port as REST.
- Handle `4001` ("demo full") and `4002` ("time limit") as distinct, visible states; reconnect only on the visitor's action after either.
- Keep reading the car through `playerCarIndex`.
- Nothing to do for compression: the browser's `WebSocket` negotiates and inflates it.
- If the frontend is hosted in the same account as the API, its traffic spends the same 5 GB monthly allowance.
- Suggested in this spec's clarifications: close the connection when the tab is hidden.
