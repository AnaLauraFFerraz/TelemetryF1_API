import { test } from "node:test";
import assert from "node:assert/strict";
import { findTyreWindowExcursions } from "./tyreAnalysis";
import { makeSample } from "./testFixtures";
import { TelemetrySample } from "./types";

function buildLapWithFrontLeftTemp(temps: number[]): TelemetrySample[] {
  return temps.map((t, i) =>
    makeSample({
      lapDistance: i * 10,
      tyreSurfaceTemp: { rearLeft: 95, rearRight: 95, frontLeft: t, frontRight: 95 },
    })
  );
}

test("pneu o tempo todo na janela ideal não gera excursão", () => {
  const samples = buildLapWithFrontLeftTemp(new Array(10).fill(95));
  assert.deepEqual(findTyreWindowExcursions(samples), []);
});

test("excursão longa o suficiente (>=30m) fora da janela é reportada", () => {
  // frio (70°C) por 50m (5 amostras de 10m), ideal antes/depois
  const temps = [95, 95, 70, 70, 70, 70, 70, 95, 95];
  const samples = buildLapWithFrontLeftTemp(temps);

  const excursions = findTyreWindowExcursions(samples);
  const flExcursion = excursions.find((e) => e.wheel === "frontLeft");

  assert.ok(flExcursion, "esperava uma excursão no pneu dianteiro esquerdo");
  assert.equal(flExcursion!.status, "cold");
  assert.equal(flExcursion!.distanceStart, 20);
  // distanceEnd é a distância da amostra que já voltou à faixa ideal (fim
  // do trecho "fora da janela", não a última amostra ainda fria)
  assert.equal(flExcursion!.distanceEnd, 70);
});

test("excursão curta demais (<30m) não é reportada", () => {
  const temps = [95, 95, 70, 95, 95]; // só 1 amostra fora, 10m de extensão
  const samples = buildLapWithFrontLeftTemp(temps);
  assert.deepEqual(findTyreWindowExcursions(samples), []);
});

test("array vazio não gera excursões", () => {
  assert.deepEqual(findTyreWindowExcursions([]), []);
});

test("temperatura quente também é detectada como excursão", () => {
  const temps = [95, 95, 130, 130, 130, 130, 130, 95];
  const samples = buildLapWithFrontLeftTemp(temps);

  const excursions = findTyreWindowExcursions(samples);
  const flExcursion = excursions.find((e) => e.wheel === "frontLeft");

  assert.ok(flExcursion);
  assert.equal(flExcursion!.status, "hot");
});
