import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCorners } from "./cornerDetection";
import { makeSample } from "./testFixtures";
import { TelemetrySample } from "./types";

const STEP_M = 5;
const TRACK_LENGTH_M = 300;

function buildLap(
  speedAt: (d: number) => number,
  throttleAt: (d: number) => number,
  brakeAt: (d: number) => number
): TelemetrySample[] {
  const samples: TelemetrySample[] = [];
  for (let d = 0; d <= TRACK_LENGTH_M; d += STEP_M) {
    samples.push(
      makeSample({
        lapDistance: d,
        sessionTime: d / 50, // ~50m/s, irrelevante pra detecção de curva
        speed: speedAt(d),
        throttle: throttleAt(d),
        brake: brakeAt(d),
      })
    );
  }
  return samples;
}

// Reta -> frenagem 100-150 -> apex em 150 (80km/h) -> retomada 150-200 -> reta
function singleCornerLap(): TelemetrySample[] {
  return buildLap(
    (d) => {
      if (d < 100) return 300;
      if (d <= 150) return 300 - (d - 100) * 4.4;
      if (d <= 200) return 80 + (d - 150) * 4.4;
      return 300;
    },
    (d) => {
      if (d < 100) return 1;
      if (d <= 150) return 0;
      if (d <= 200) return (d - 150) / 50;
      return 1;
    },
    (d) => (d >= 100 && d < 150 ? 1 : 0)
  );
}

test("detecta exatamente uma curva numa reta-frenagem-apex-retomada-reta", () => {
  const corners = detectCorners(singleCornerLap());

  assert.equal(corners.length, 1);
  const [corner] = corners;
  assert.ok(Math.abs(corner.apexDistance - 150) <= 15, `apexDistance foi ${corner.apexDistance}`);
  assert.ok(corner.apexSpeed < 150, `apexSpeed foi ${corner.apexSpeed}`);
  assert.ok(Math.abs(corner.brakingStartDistance - 100) <= STEP_M, `brakingStartDistance foi ${corner.brakingStartDistance}`);
  assert.ok(corner.exitDistance >= 190 && corner.exitDistance <= 200, `exitDistance foi ${corner.exitDistance}`);
});

test("array com menos de 3 amostras não detecta curvas", () => {
  assert.deepEqual(detectCorners([makeSample(), makeSample()]), []);
});

test("array vazio não detecta curvas", () => {
  assert.deepEqual(detectCorners([]), []);
});

test("ruído de amostragem numa reta (dip pequeno) não vira curva", () => {
  const samples = buildLap(
    (d) => (d === 150 ? 290 : 300), // dip de só 10km/h numa amostra
    () => 1,
    () => 0
  );
  assert.deepEqual(detectCorners(samples), []);
});

test("duas curvas a menos de 50m uma da outra são fundidas numa só (chicane)", () => {
  const samples = buildLap(
    (d) => {
      if (d < 100) return 300;
      if (d <= 150) return 300 - (d - 100) * 4.2; // desce até ~90
      if (d <= 165) return 90 + (d - 150) * 4; // sobe até ~150
      if (d <= 180) return 150 - (d - 165) * 4.67; // desce até ~80 (apex mais baixo)
      if (d <= 220) return 80 + (d - 180) * 5.5; // sobe de volta pra 300
      return 300;
    },
    (d) => (d >= 200 && d <= 220 ? (d - 200) / 20 : d > 220 ? 1 : 0),
    (d) => (d >= 100 && d < 180 ? 1 : 0)
  );

  const corners = detectCorners(samples);
  assert.equal(corners.length, 1, `esperava 1 curva fundida, achou ${corners.length}`);
  // fica com o apex de menor velocidade dos dois mínimos (perto de 180)
  assert.ok(corners[0].apexDistance >= 165 && corners[0].apexDistance <= 190, `apexDistance foi ${corners[0].apexDistance}`);
});

test("classifica severidade pela velocidade do apex", () => {
  const slow = singleCornerLap(); // apex ~80-106km/h após suavização
  assert.equal(detectCorners(slow)[0].severity, "slow");
});
