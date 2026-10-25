import { test } from "node:test";
import assert from "node:assert/strict";
import { fromRecordingCut, RecordingCutInput, toRecordingCut } from "./recordingCutFormat";
import { makeMotionSample, makeSample } from "./testFixtures";

interface RawLap {
  telemetry: Record<string, unknown>[];
  motion: Record<string, unknown>[];
}

function parseLaps(json: string): RawLap[] | undefined {
  return (JSON.parse(json) as { laps?: RawLap[] }).laps;
}

function cut(): RecordingCutInput {
  return {
    sourceSha256: "abc123",
    laps: [
      {
        lapNumber: 6,
        lapTimeMs: 74306,
        isValid: false,
        telemetry: [
          makeSample({
            lapDistance: Math.fround(1.6881237),
            sessionTime: Math.fround(465.98935),
            speed: 331,
            throttle: Math.fround(0.83137256),
            brake: Math.fround(0.17254902),
            steer: Math.fround(-0.0039215689),
            tyreSurfaceTemp: { rearLeft: 93, rearRight: 94, frontLeft: 95, frontRight: 96 },
          }),
          makeSample({ lapDistance: Math.fround(4294.1738), sessionTime: Math.fround(540.27393) }),
        ],
        motion: [
          makeMotionSample({
            lapDistance: Math.fround(1.6881237),
            sessionTime: Math.fround(465.98935),
            worldPosition: { x: Math.fround(-123.45679), y: Math.fround(7.25), z: Math.fround(987.65432) },
            gForce: { lat: 1, lon: 2, vert: 3 },
          }),
        ],
      },
    ],
  };
}

function zeroedUnread(input: RecordingCutInput): RecordingCutInput {
  const zeroWheels = { rearLeft: 0, rearRight: 0, frontLeft: 0, frontRight: 0 };
  return {
    ...input,
    laps: input.laps.map((lap) => ({
      ...lap,
      telemetry: lap.telemetry.map((sample) => ({
        ...sample,
        gear: 0,
        engineRpm: 0,
        drs: 0,
        tyrePressure: { ...zeroWheels },
        tyreInnerTemp: { ...zeroWheels },
      })),
      motion: lap.motion.map((sample) => ({
        ...sample,
        sessionTime: 0,
        worldPosition: { x: sample.worldPosition.x, y: 0, z: sample.worldPosition.z },
        gForce: { lat: 0, lon: 0, vert: 0 },
      })),
    })),
  };
}

test("o recorte grava só os campos que o motor lê", () => {
  const laps = parseLaps(toRecordingCut(cut()));
  assert.equal(laps?.length, 1);
  assert.deepEqual(Object.keys(laps![0].telemetry[0]), [
    "lapDistance",
    "sessionTime",
    "speed",
    "throttle",
    "brake",
    "steer",
    "tyreSurfaceTemp",
  ]);
  assert.deepEqual(Object.keys(laps![0].telemetry[0].tyreSurfaceTemp as object), ["rearLeft", "rearRight", "frontLeft", "frontRight"]);
  assert.deepEqual(Object.keys(laps![0].motion[0]), ["lapDistance", "worldPosition"]);
  assert.deepEqual(Object.keys(laps![0].motion[0].worldPosition as object), ["x", "z"]);
});

test("o recorte grava o hash da gravação e os dados oficiais de cada volta", () => {
  const parsed = JSON.parse(toRecordingCut(cut())) as { sourceSha256?: string; laps?: { lapNumber: number; lapTimeMs: number; isValid: boolean }[] };
  assert.equal(parsed.sourceSha256, "abc123");
  assert.equal(parsed.laps?.length, 1);
  assert.deepEqual(
    { lapNumber: parsed.laps![0].lapNumber, lapTimeMs: parsed.laps![0].lapTimeMs, isValid: parsed.laps![0].isValid },
    { lapNumber: 6, lapTimeMs: 74306, isValid: false }
  );
});

test("os números saem com 9 algarismos significativos e voltam o float32 exato", () => {
  const json = toRecordingCut(cut());
  const tokens = json.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g) ?? [];
  assert.ok(tokens.length > 0);
  for (const token of tokens) {
    const digits = token.replace(/^-/, "").replace(/e.*$/, "").replace(".", "").replace(/^0+/, "");
    assert.ok(digits.length <= 9, `${token} tem mais de 9 algarismos significativos`);
  }

  const original = cut().laps[0];
  const laps = parseLaps(json);
  assert.equal(laps?.length, 1);
  const first = laps![0].telemetry[0];
  assert.equal(Math.fround(first.lapDistance as number), original.telemetry[0].lapDistance);
  assert.equal(Math.fround(first.sessionTime as number), original.telemetry[0].sessionTime);
  assert.equal(Math.fround(first.throttle as number), original.telemetry[0].throttle);
  assert.equal(Math.fround(first.brake as number), original.telemetry[0].brake);
  assert.equal(Math.fround(first.steer as number), original.telemetry[0].steer);
  const position = laps![0].motion[0].worldPosition as { x: number; z: number };
  assert.equal(Math.fround(position.x), original.motion[0].worldPosition.x);
  assert.equal(Math.fround(position.z), original.motion[0].worldPosition.z);
});

test("os inteiros saem como inteiros", () => {
  const json = toRecordingCut(cut());
  assert.match(json, /"speed":331[,}]/);
  assert.match(json, /"rearLeft":93[,}]/);
  assert.doesNotMatch(json, /"speed":331\./);
});

test("ler o que foi gravado devolve amostras que o motor aceita, com o que ele não lê zerado", () => {
  assert.deepEqual(fromRecordingCut(toRecordingCut(cut())), zeroedUnread(cut()));
});

test("a mesma entrada gera a mesma saída, byte a byte", () => {
  assert.equal(toRecordingCut(cut()), toRecordingCut(cut()));
  assert.ok(toRecordingCut(cut()).length > 2);
});
