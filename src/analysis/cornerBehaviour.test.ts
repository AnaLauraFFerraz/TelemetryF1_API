import { test } from "node:test";
import assert from "node:assert/strict";
import { lapBehaviourInStretch } from "./cornerBehaviour";
import { makeLapFromRows } from "./testFixtures";

// Freada de 100 a 140 m, freio solto em 150 m, ponto mais lento em 180 m
// (30 m depois de soltar o freio), acelerador pleno em 200 m.
// Índices: 100 m = 10, 150 m = 15, 180 m = 18, 200 m = 20.
function releasedBeforeApexLap() {
  const rows: [number, number, number, number][] = [];
  for (let d = 0; d <= 220; d += 10) {
    const speed = d < 100 ? 300 : d <= 180 ? 300 - (d - 100) * 2.75 : 80 + (d - 180) * 5;
    const brake = d >= 100 && d <= 140 ? (d === 120 ? 1 : 0.8) : 0;
    const throttle = d < 100 ? 1 : d < 190 ? 0 : d === 190 ? 0.5 : 1;
    rows.push([d, speed, brake, throttle]);
  }
  return makeLapFromRows(rows);
}

test("o ponto mais lento é a amostra de menor velocidade, a primeira em empate", () => {
  const samples = makeLapFromRows([
    [0, 300, 0, 1],
    [10, 250, 0, 0],
    [20, 200, 0, 0],
    [30, 150, 0, 0],
    [40, 120, 0, 0],
    [50, 100, 0, 0],
    [60, 90, 0, 0],
    [70, 80, 0, 0],
    [80, 90, 0, 0],
    [90, 80, 0, 0],
    [100, 200, 0, 1],
  ]);
  assert.equal(lapBehaviourInStretch(samples, 0, 200)?.slowestIndex, 7);
});

test("o início da freada é a primeira amostra da fase de frenagem, mesmo com o freio solto 30 m antes do ponto mais lento", () => {
  const behaviour = lapBehaviourInStretch(releasedBeforeApexLap(), 0, 300);
  assert.deepEqual(behaviour, { slowestIndex: 18, brakingStartIndex: 10, brakingPeak: 1, fullThrottleIndex: 20 });
});

test("com duas fases de frenagem antes do ponto mais lento vale a última, e o pico é o dela", () => {
  const samples = makeLapFromRows([
    [0, 300, 0, 1],
    [10, 295, 0.6, 0.5], // toque no freio
    [20, 290, 0.6, 0.5],
    [30, 290, 0, 1],
    [40, 290, 0, 1],
    [50, 250, 0.9, 0],
    [60, 200, 0.95, 0],
    [70, 150, 0.7, 0],
    [80, 100, 0, 0], // ponto mais lento
    [90, 150, 0, 1],
  ]);
  const behaviour = lapBehaviourInStretch(samples, 0, 200);
  assert.equal(behaviour?.brakingStartIndex, 5);
  assert.equal(behaviour?.brakingPeak, 0.95);
});

test("uma frenagem ainda ativa no ponto mais lento vale até ele, não depois", () => {
  const samples = makeLapFromRows([
    [0, 300, 0, 1],
    [10, 250, 0.5, 0],
    [20, 200, 0.6, 0],
    [30, 120, 0.9, 0], // ponto mais lento, ainda freando
    [40, 130, 1, 0], // pico depois do ponto mais lento: não conta
    [50, 160, 0, 0.5],
    [60, 220, 0, 1],
  ]);
  const behaviour = lapBehaviourInStretch(samples, 0, 200);
  assert.equal(behaviour?.slowestIndex, 3);
  assert.equal(behaviour?.brakingStartIndex, 1);
  assert.equal(behaviour?.brakingPeak, 0.9);
});

test("sem fase de frenagem antes do ponto mais lento a volta não freou: início null e pico 0", () => {
  const lifted = makeLapFromRows([
    [0, 300, 0, 1],
    [10, 280, 0.05, 0], // freio abaixo do limite
    [20, 250, 0, 0],
    [30, 200, 0, 0],
    [40, 180, 0, 0], // ponto mais lento
    [50, 200, 0, 0.5],
    [60, 250, 0, 1],
  ]);
  assert.deepEqual(lapBehaviourInStretch(lifted, 0, 200), { slowestIndex: 4, brakingStartIndex: null, brakingPeak: 0, fullThrottleIndex: 6 });

  const brakedOnlyAfter = makeLapFromRows([
    [0, 300, 0, 1],
    [10, 200, 0, 0],
    [20, 150, 0, 0], // ponto mais lento
    [30, 160, 1, 0], // freio depois do ponto mais lento: de outra curva
    [40, 155, 1, 0],
    [50, 200, 0, 1],
  ]);
  assert.equal(lapBehaviourInStretch(brakedOnlyAfter, 0, 200)?.brakingStartIndex, null);
  assert.equal(lapBehaviourInStretch(brakedOnlyAfter, 0, 200)?.brakingPeak, 0);
});

test("a retomada é a primeira amostra com acelerador de 0,9 ou mais depois do ponto mais lento, dentro do trecho", () => {
  assert.equal(lapBehaviourInStretch(releasedBeforeApexLap(), 0, 300)?.fullThrottleIndex, 20);

  // sem acelerador pleno antes do fim do trecho: null, e não a retomada da curva seguinte
  const noFullThrottle = makeLapFromRows([
    [0, 300, 0, 1],
    [10, 200, 0.8, 0],
    [20, 120, 0, 0], // ponto mais lento
    [30, 140, 0, 0.6],
    [40, 150, 0, 0.8],
    [50, 160, 0, 0.85],
    [60, 200, 0, 1], // já fora do trecho
  ]);
  assert.deepEqual(lapBehaviourInStretch(noFullThrottle, 0, 55), { slowestIndex: 2, brakingStartIndex: 1, brakingPeak: 0.8, fullThrottleIndex: null });

  // acelerador pleno no próprio ponto mais lento: ele é a retomada
  const flatOut = makeLapFromRows([
    [0, 300, 0, 1],
    [10, 280, 0, 1],
    [20, 270, 0, 1], // ponto mais lento, de pé embaixo
    [30, 285, 0, 1],
  ]);
  assert.equal(lapBehaviourInStretch(flatOut, 0, 100)?.fullThrottleIndex, 2);
});

test("só as amostras dentro do trecho [from, to) contam", () => {
  // trecho de 95 a 175 m: o ponto mais lento (180 m) e a retomada (200 m) ficam fora
  const behaviour = lapBehaviourInStretch(releasedBeforeApexLap(), 95, 175);
  assert.deepEqual(behaviour, { slowestIndex: 17, brakingStartIndex: 10, brakingPeak: 1, fullThrottleIndex: null });
  // o fim do trecho é exclusivo
  assert.equal(lapBehaviourInStretch(releasedBeforeApexLap(), 95, 180)?.slowestIndex, 17);
  assert.equal(lapBehaviourInStretch(releasedBeforeApexLap(), 95, 181)?.slowestIndex, 18);
});

test("uma volta sem amostra no trecho devolve null em vez de inventar o comportamento", () => {
  assert.equal(lapBehaviourInStretch(releasedBeforeApexLap(), 1000, 1100), null);
  assert.equal(lapBehaviourInStretch([], 0, 100), null);
});
