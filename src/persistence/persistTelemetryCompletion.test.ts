import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupIsolatedTestDb, teardownIsolatedTestDb } from "./testDb";
import { dispatchPacket } from "../telemetry/dispatcher";
import { buildSyntheticRecording } from "../replay/testFixtures";

const handle = setupIsolatedTestDb();
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { persistTelemetry } = require("./persistTelemetry") as typeof import("./persistTelemetry");

after(() => teardownIsolatedTestDb(handle));

test("persistTelemetry devolve a volta concluída só no pacote que a fecha", () => {
  const { packets, expectedLap } = buildSyntheticRecording();

  const results = packets.map((packet) => {
    const result = dispatchPacket(packet.data);
    assert.ok(result, "pacote sintético não reconhecido pelo dispatcher");
    return persistTelemetry(result.header, result.packetId, result.data);
  });

  const lastIndex = results.length - 1;
  assert.deepEqual(
    results.slice(0, lastIndex).filter((r) => r !== null),
    [],
    "algum pacote antes do fechamento devolveu uma volta",
  );

  const closing = results[lastIndex];
  assert.ok(closing, "o pacote que fecha a volta não devolveu nada");
  assert.equal(closing.lapNumber, expectedLap.lapNumber);
  assert.equal(closing.lapTimeMs, expectedLap.lapTimeMs);
  assert.equal(closing.isValid, expectedLap.isValid);
});
