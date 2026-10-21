import { test } from "node:test";
import assert from "node:assert/strict";
import type { TelemetryWsMessage } from "../ws/messageFormat";
import { toPlayerOnlyMessage } from "./playerOnly";

function message22Cars(): TelemetryWsMessage<{ car: number }> {
  return {
    type: "carTelemetry",
    sessionUID: "1026725433292396341",
    sessionTime: 12.5,
    frameIdentifier: 640,
    playerCarIndex: 7,
    data: Array.from({ length: 22 }, (_, car) => ({ car })),
  };
}

test("a mensagem do modo demo leva só o carro do jogador, no índice 0", () => {
  const result = toPlayerOnlyMessage(message22Cars());

  assert.deepEqual(result.data, [{ car: 7 }]);
  assert.equal(result.playerCarIndex, 0);
});

test("os outros campos do envelope não mudam", () => {
  const original = message22Cars();
  const result = toPlayerOnlyMessage(original);

  assert.equal(result.type, original.type);
  assert.equal(result.sessionUID, original.sessionUID);
  assert.equal(result.sessionTime, original.sessionTime);
  assert.equal(result.frameIdentifier, original.frameIdentifier);
});

test("a mensagem original e o array dela não são alterados", () => {
  const original = message22Cars();
  toPlayerOnlyMessage(original);

  assert.equal(original.playerCarIndex, 7);
  assert.equal(original.data.length, 22);
  assert.deepEqual(original.data[7], { car: 7 });
});
