import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCaptureTimes } from "./captureTimes";

// Horas de captura da gravação publicada (research.md, ponto 4).
const FIRST = 1792168223797;
const LAST = 1792168446755;
const COMPLETIONS = [
  { lapNumber: 6, receivedAt: 1792168298248 },
  { lapNumber: 7, receivedAt: 1792168372362 },
  { lapNumber: 8, receivedAt: 1792168445758 },
];

test("as datas da sessão e das voltas vêm das horas de captura, em ISO", () => {
  const times = buildCaptureTimes(FIRST, LAST, COMPLETIONS);

  assert.equal(times.startedAt, "2026-10-16T16:30:23.797Z");
  assert.equal(times.lastSeenAt, "2026-10-16T16:34:06.755Z");
  assert.deepEqual(
    [...times.lapRecordedAt.entries()],
    [
      [6, "2026-10-16T16:31:38.248Z"],
      [7, "2026-10-16T16:32:52.362Z"],
      [8, "2026-10-16T16:34:05.758Z"],
    ],
  );
});

test("sem receivedAt no primeiro pacote, recusa em vez de inventar", () => {
  assert.throws(() => buildCaptureTimes(undefined, LAST, COMPLETIONS), {
    message: "[demo] a gravação não tem receivedAt em primeiro pacote da sessão: o modo demo não inventa datas.",
  });
});

test("sem receivedAt no último pacote, recusa em vez de inventar", () => {
  assert.throws(() => buildCaptureTimes(FIRST, undefined, COMPLETIONS), {
    message: "[demo] a gravação não tem receivedAt em último pacote da sessão: o modo demo não inventa datas.",
  });
});

test("sem receivedAt no pacote que fecha uma volta, recusa em vez de inventar", () => {
  assert.throws(() => buildCaptureTimes(FIRST, LAST, [{ lapNumber: 7, receivedAt: undefined }]), {
    message: "[demo] a gravação não tem receivedAt em pacote que fecha a volta 7: o modo demo não inventa datas.",
  });
});

test("último antes do primeiro é recusado", () => {
  assert.throws(() => buildCaptureTimes(LAST, FIRST, []), {
    message: `[demo] horas de captura fora de ordem: o último pacote (${FIRST}) vem antes do primeiro (${LAST}).`,
  });
});
