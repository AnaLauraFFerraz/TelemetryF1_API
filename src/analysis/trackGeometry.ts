import { MotionSample } from "./types";
import { movingAverage } from "./smoothing";

// Espaçamento da malha comum das duas voltas: cerca de uma amostra gravada
// (mediana de 5 m, research.md seção 1.1).
export const GRID_STEP_M = 5;
// A curvatura é suavizada em 7 pontos da malha (35 m): tira o ruído de
// amostra a amostra do traçado sem apagar uma curva fechada (research.md,
// seção 10).
export const CURVATURE_SMOOTHING_POINTS = 7;
// Raio máximo de uma curva. 100 m mantém as curvas em que as voltas freiam
// ou tiram o pé e deixa de fora as curvas em que todas passam de pé
// embaixo; validado só em Interlagos (research.md, seção 10).
export const MAX_CORNER_RADIUS_M = 100;
// Ângulo mínimo girado por uma curva: tira os trechos de 3 a 6° que cruzam
// o limiar do raio por poucos metros (research.md, seção 10).
export const MIN_CORNER_ANGLE_DEG = 20;

export interface GeometricCorner {
  apexDistance: number;
  startIndex: number;
  endIndex: number;
}

// Múltiplos de GRID_STEP_M dentro das distâncias que as duas voltas cobrem:
// a mesma malha em qualquer ordem das voltas.
export function commonGrid(a: number[], b: number[]): number[] {
  if (a.length === 0 || b.length === 0) return [];
  const first = Math.max(a[0], b[0]);
  const last = Math.min(a[a.length - 1], b[b.length - 1]);
  const grid: number[] = [];
  for (let k = Math.ceil(first / GRID_STEP_M); k * GRID_STEP_M <= last; k++) grid.push(k * GRID_STEP_M);
  return grid;
}

function positionsOnGrid(motion: MotionSample[], grid: number[]): { x: number; z: number }[] {
  if (motion.length === 1) return grid.map(() => ({ x: motion[0].worldPosition.x, z: motion[0].worldPosition.z }));

  let j = 0;
  return grid.map((distance) => {
    while (j < motion.length - 2 && motion[j + 1].lapDistance < distance) j++;
    const a = motion[j];
    const b = motion[j + 1];
    const span = b.lapDistance - a.lapDistance;
    const ratio = span === 0 ? 0 : (distance - a.lapDistance) / span;
    return {
      x: a.worldPosition.x + (b.worldPosition.x - a.worldPosition.x) * ratio,
      z: a.worldPosition.z + (b.worldPosition.z - a.worldPosition.z) * ratio,
    };
  });
}

// Média das posições das duas voltas em cada ponto da malha: a soma é
// comutativa, então trocar as voltas não muda o traçado.
export function meanPath(primaryMotion: MotionSample[], comparisonMotion: MotionSample[], grid: number[]): { x: number; z: number }[] {
  if (primaryMotion.length === 0 || comparisonMotion.length === 0) return [];
  const primary = positionsOnGrid(primaryMotion, grid);
  const comparison = positionsOnGrid(comparisonMotion, grid);
  return grid.map((_, i) => ({ x: (primary[i].x + comparison[i].x) / 2, z: (primary[i].z + comparison[i].z) / 2 }));
}

// Curvatura (1/m, com o sinal do lado) em cada ponto do traçado: a variação
// do rumo entre os dois trechos vizinhos sobre o passo, suavizada. As pontas
// repetem o vizinho, que ainda não tem trecho dos dois lados.
export function curvature(path: { x: number; z: number }[], step: number): number[] {
  const n = path.length;
  if (n < 3) return path.map(() => 0);

  const heading: number[] = [];
  for (let i = 0; i < n - 1; i++) heading.push(Math.atan2(path[i + 1].z - path[i].z, path[i + 1].x - path[i].x));
  for (let i = 1; i < heading.length; i++) {
    while (heading[i] - heading[i - 1] > Math.PI) heading[i] -= 2 * Math.PI;
    while (heading[i] - heading[i - 1] < -Math.PI) heading[i] += 2 * Math.PI;
  }

  const raw: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) raw[i] = (heading[i] - heading[i - 1]) / step;
  raw[0] = raw[1];
  raw[n - 1] = raw[n - 2];

  return movingAverage(
    raw.map((k, i) => [i, k] as [number, number]),
    CURVATURE_SMOOTHING_POINTS
  ).map(([, k]) => k);
}

// Uma curva é uma sequência de pontos da malha com curvatura do mesmo sinal
// e raio de até MAX_CORNER_RADIUS_M cujo ângulo total é de pelo menos
// MIN_CORNER_ANGLE_DEG. O ápice é o ponto de maior curvatura (o primeiro, em
// empate); startIndex e endIndex são inclusivos.
export function geometricCorners(grid: number[], curvatureByPoint: number[]): GeometricCorner[] {
  const minCurvature = 1 / MAX_CORNER_RADIUS_M;
  const minAngleRad = (MIN_CORNER_ANGLE_DEG * Math.PI) / 180;
  const corners: GeometricCorner[] = [];

  let i = 0;
  while (i < curvatureByPoint.length) {
    if (Math.abs(curvatureByPoint[i]) < minCurvature) {
      i++;
      continue;
    }
    const sign = Math.sign(curvatureByPoint[i]);
    let j = i;
    let peak = i;
    let angle = 0;
    while (j < curvatureByPoint.length && Math.sign(curvatureByPoint[j]) === sign && Math.abs(curvatureByPoint[j]) >= minCurvature) {
      if (Math.abs(curvatureByPoint[j]) > Math.abs(curvatureByPoint[peak])) peak = j;
      angle += Math.abs(curvatureByPoint[j]) * GRID_STEP_M;
      j++;
    }
    if (angle >= minAngleRad) corners.push({ apexDistance: grid[peak], startIndex: i, endIndex: j - 1 });
    i = j;
  }

  return corners;
}
