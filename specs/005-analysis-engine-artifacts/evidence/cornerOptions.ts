// Uso: DB_PATH=<banco temporário> node -r ts-node/register cornerOptions.ts
// Protótipos (só investigação, nada em src/) das opções para um mesmo conjunto de curvas em (A,B) e (B,A):
//   P  hoje, com a proeminência corrigida, na volta principal só (referência)
//   A  detectar nas duas voltas (proeminência corrigida) e casar os ápices
//   B  geometria da pista: curvatura do traçado (worldPosition x,z) média das duas voltas
//   C  velocidade média das duas voltas na mesma grade de distância, mínimos com proeminência corrigida
import path from "node:path";

const repo = path.resolve(__dirname, "..", "..", "..");
if (!process.env.DB_PATH || /data[\\/]telemetry\.db$/i.test(process.env.DB_PATH)) throw new Error("DB_PATH ausente ou real");
require(path.join(repo, "src/persistence/db"));
const { listCarTelemetrySamplesForLap } = require(path.join(repo, "src/persistence/carTelemetrySampleRepository"));
const { listMotionSamplesForLap } = require(path.join(repo, "src/persistence/motionSampleRepository"));
const { movingAverage } = require(path.join(repo, "src/analysis/smoothing"));

const tel = (lap: number) => listCarTelemetrySamplesForLap(1, lap);
const mot = (lap: number) => listMotionSamplesForLap(1, lap);
const PROMINENCE = 15;
const MERGE_M = 50;
const GRID_M = 5;

type Series = [number, number][];

// Proeminência topográfica: a subida de cada lado conta só até um valor mais baixo que o mínimo.
function minimaTopo(series: Series, minProminence: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length - 1; i++) {
    const v = series[i][1];
    if (!(v < series[i - 1][1] && v <= series[i + 1][1])) continue;
    const rise = (dir: number) => {
      let r = 0;
      for (let j = i + dir; j >= 0 && j < series.length; j += dir) {
        if (series[j][1] < v) break;
        r = Math.max(r, series[j][1] - v);
      }
      return r;
    };
    if (rise(-1) >= minProminence && rise(1) >= minProminence) out.push(i);
  }
  const merged: number[] = [];
  for (const i of out) {
    const last = merged[merged.length - 1];
    if (last !== undefined && series[i][0] - series[last][0] < MERGE_M) {
      if (series[i][1] < series[last][1]) merged[merged.length - 1] = i;
    } else merged.push(i);
  }
  return merged;
}

function interp(xs: number[], ys: number[], x: number): number | null {
  if (x < xs[0] || x > xs[xs.length - 1]) return null;
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const span = xs[i + 1] - xs[i];
      return span === 0 ? ys[i] : ys[i] + ((ys[i + 1] - ys[i]) * (x - xs[i])) / span;
    }
  }
  return null;
}

function grid(a: number[], b: number[]): number[] {
  const from = Math.ceil(Math.max(a[0], b[0]) / GRID_M) * GRID_M;
  const to = Math.min(a[a.length - 1], b[b.length - 1]);
  const g: number[] = [];
  for (let d = from; d <= to; d += GRID_M) g.push(d);
  return g;
}

function speedSeries(lap: number): Series {
  return movingAverage(tel(lap).map((s: any) => [s.lapDistance, s.speed]), 5);
}

function optionP(lap: number): number[] {
  const s = speedSeries(lap);
  return minimaTopo(s, PROMINENCE).map((i) => s[i][0]);
}

function optionA(a: number, b: number, matchM: number): number[] {
  const all = [...optionP(a).map((d) => ({ d, lap: a })), ...optionP(b).map((d) => ({ d, lap: b }))].sort((x, y) => x.d - y.d);
  const clusters: { d: number; lap: number }[][] = [];
  for (const p of all) {
    const c = clusters[clusters.length - 1];
    if (c && p.d - c[c.length - 1].d <= matchM) c.push(p);
    else clusters.push([p]);
  }
  return clusters.map((c) => c.reduce((s, p) => s + p.d, 0) / c.length);
}

function optionC(a: number, b: number): number[] {
  const sa = tel(a);
  const sb = tel(b);
  const xa = sa.map((s: any) => s.lapDistance);
  const xb = sb.map((s: any) => s.lapDistance);
  const g = grid(xa, xb);
  const mean: Series = g.map((d) => [d, ((interp(xa, sa.map((s: any) => s.speed), d) ?? NaN) + (interp(xb, sb.map((s: any) => s.speed), d) ?? NaN)) / 2]);
  const sm: Series = movingAverage(mean, 5);
  return minimaTopo(sm, PROMINENCE).map((i) => sm[i][0]);
}

// Curvatura (1/m, sinal = lado) do traçado médio das duas voltas numa grade de 5 m, suavizada em ~35 m.
function curvature(a: number, b: number): Series {
  const ma = mot(a);
  const mb = mot(b);
  const xa = ma.map((s: any) => s.lapDistance);
  const xb = mb.map((s: any) => s.lapDistance);
  const g = grid(xa, xb);
  const pos = g.map((d) => ({
    x: ((interp(xa, ma.map((s: any) => s.worldPosition.x), d) ?? NaN) + (interp(xb, mb.map((s: any) => s.worldPosition.x), d) ?? NaN)) / 2,
    z: ((interp(xa, ma.map((s: any) => s.worldPosition.z), d) ?? NaN) + (interp(xb, mb.map((s: any) => s.worldPosition.z), d) ?? NaN)) / 2,
  }));
  const heading: number[] = [];
  for (let i = 1; i < pos.length; i++) heading.push(Math.atan2(pos[i].z - pos[i - 1].z, pos[i].x - pos[i - 1].x));
  for (let i = 1; i < heading.length; i++) {
    while (heading[i] - heading[i - 1] > Math.PI) heading[i] -= 2 * Math.PI;
    while (heading[i] - heading[i - 1] < -Math.PI) heading[i] += 2 * Math.PI;
  }
  const k: Series = [];
  for (let i = 1; i < heading.length; i++) k.push([g[i], (heading[i] - heading[i - 1]) / GRID_M]);
  return movingAverage(k, 7);
}

function optionB(a: number, b: number, maxRadiusM: number): { d: number; radius: number; side: string; angleDeg: number }[] {
  const k = curvature(a, b);
  const out: { d: number; radius: number; side: string; angleDeg: number }[] = [];
  let i = 0;
  while (i < k.length) {
    if (Math.abs(k[i][1]) < 1 / maxRadiusM) {
      i++;
      continue;
    }
    const sign = Math.sign(k[i][1]);
    let j = i;
    let peak = i;
    let angle = 0;
    while (j < k.length && Math.sign(k[j][1]) === sign && Math.abs(k[j][1]) >= 1 / maxRadiusM) {
      if (Math.abs(k[j][1]) > Math.abs(k[peak][1])) peak = j;
      angle += k[j][1] * GRID_M;
      j++;
    }
    out.push({ d: k[peak][0], radius: 1 / Math.abs(k[peak][1]), side: sign > 0 ? "+" : "-", angleDeg: (Math.abs(angle) * 180) / Math.PI });
    i = j;
  }
  return out;
}

// Protótipo do desenho recomendado: curvas pela geometria (raio ≤ 100 m, ângulo ≥ 20°), trecho de cada curva entre
// os máximos da velocidade média das duas voltas, e o comportamento de cada volta medido dentro do trecho.
function design(a: number, b: number): void {
  const corners = optionB(a, b, 100).filter((c) => c.angleDeg >= 20);
  const sa = tel(a);
  const sb = tel(b);
  const xa = sa.map((s: any) => s.lapDistance);
  const xb = sb.map((s: any) => s.lapDistance);
  const g = grid(xa, xb);
  const meanSpeed = g.map((d) => ((interp(xa, sa.map((s: any) => s.speed), d) ?? NaN) + (interp(xb, sb.map((s: any) => s.speed), d) ?? NaN)) / 2);
  const bounds: number[] = [g[0]];
  for (let i = 0; i < corners.length - 1; i++) {
    let best = -1;
    for (let j = 0; j < g.length; j++) {
      if (g[j] <= corners[i].d || g[j] >= corners[i + 1].d) continue;
      if (best < 0 || meanSpeed[j] > meanSpeed[best]) best = j;
    }
    bounds.push(g[best]);
  }
  bounds.push(g[g.length - 1]);

  // Variante "aberto": dentro de cada partição, o trecho vai da última amostra em que as duas voltas estavam em pé
  // embaixo (acelerador ≥ 0.9, freio ≤ 0.1) antes do ápice geométrico até a primeira em que as duas voltam a estar.
  const open = process.env.STRETCH === "open";
  const flat = (s: any[], xs: number[], d: number) => {
    let i = xs.findIndex((x) => x >= d);
    if (i < 0) i = xs.length - 1;
    return s[i].throttle >= 0.9 && s[i].brake <= 0.1;
  };
  const both = (d: number) => flat(sa, xa, d) && flat(sb, xb, d);
  const stretches = corners.map((c, i) => {
    if (!open) return [bounds[i], bounds[i + 1]];
    let from = c.d;
    while (from - GRID_M >= bounds[i] && !both(from)) from -= GRID_M;
    let to = c.d;
    while (to + GRID_M <= bounds[i + 1] && !both(to)) to += GRID_M;
    // As duas voltas em pé embaixo no próprio ápice (curva feita sem tirar o pé): sobra só a vizinhança do ápice.
    if (to - from < 2 * GRID_M) return [c.d - 2 * GRID_M, c.d + 2 * GRID_M];
    return [from, to];
  });

  // Início de volta extrapolado a 0 m (alternativa 2) e delta nos dois sentidos na mesma grade.
  const t0 = (s: any[]) => s[0].sessionTime - s[0].lapDistance / ((s[1].lapDistance - s[0].lapDistance) / (s[1].sessionTime - s[0].sessionTime));
  const ta = sa.map((s: any) => s.sessionTime - t0(sa));
  const tb = sb.map((s: any) => s.sessionTime - t0(sb));
  const deltaAt = (d: number) => (interp(xa, ta, d) ?? NaN) - (interp(xb, tb, d) ?? NaN);

  const behaviour = (s: any[], from: number, to: number) => {
    const inS = s.filter((x) => x.lapDistance >= from && x.lapDistance < to);
    let minI = 0;
    inS.forEach((x, i) => (x.speed < inS[minI].speed ? (minI = i) : null));
    let k = minI;
    while (k >= 0 && inS[k].brake <= 0.1) k--;
    let brakeStart: number | null = null;
    let peak = 0;
    if (k >= 0) {
      let m = k;
      while (m > 0 && inS[m - 1].brake > 0.1) m--;
      brakeStart = inS[m].lapDistance;
      for (let q = m; q <= minI; q++) peak = Math.max(peak, inS[q].brake);
    }
    let t = minI;
    while (t < inS.length && inS[t].throttle < 0.9) t++;
    return { minAt: inS[minI].lapDistance, minSpeed: inS[minI].speed, brakeStart, peak, throttleOn: t < inS.length ? inS[t].lapDistance : null };
  };
  const fmt = (n: number | null) => (n === null ? "não" : n.toFixed(1));
  const diff = (p: number | null, q: number | null) => (p === null || q === null ? "null" : (p - q).toFixed(1));
  console.log(`\n(${a},${b}) — ${corners.length} curvas; total alt2 na última distância comum: ${deltaAt(g[g.length - 1]).toFixed(3)}`);
  console.log("ápice geom.  trecho          | A: vel.mín@dist  freada  retomada | B: vel.mín@dist  freada  retomada | bpDiff  thrDiff  deltaLoss");
  let lossSum = 0;
  corners.forEach((c, i) => {
    const [from, to] = stretches[i];
    const pa = behaviour(sa, from, to);
    const pb = behaviour(sb, from, to);
    const loss = deltaAt(to) - deltaAt(from);
    lossSum += loss;
    console.log(
      `${String(Math.round(c.d)).padStart(6)}${c.side}     ${String(Math.round(from)).padStart(5)}–${String(Math.round(to)).padEnd(5)}   | ${String(pa.minSpeed).padStart(4)}@${pa.minAt.toFixed(0).padEnd(5)} ${fmt(pa.brakeStart).padStart(7)} ${fmt(pa.throttleOn).padStart(8)} | ${String(pb.minSpeed).padStart(4)}@${pb.minAt.toFixed(0).padEnd(5)} ${fmt(pb.brakeStart).padStart(7)} ${fmt(pb.throttleOn).padStart(8)} | ${diff(pa.brakeStart, pb.brakeStart).padStart(6)} ${diff(pa.throttleOn, pb.throttleOn).padStart(8)} ${loss.toFixed(3).padStart(9)}`
    );
  });
  console.log(`soma dos deltaLoss: ${lossSum.toFixed(3)}`);
}

// Estabilidade dos lugares (opção B) em outros pares de voltas da mesma sessão: cornerOptions.ts places <a,b> <c,d> ...
if (process.argv[2] === "places") {
  for (const pair of process.argv.slice(3)) {
    const [a, b] = pair.split(",").map(Number);
    const cs = optionB(a, b, 100).filter((c) => c.angleDeg >= 20);
    console.log(`(${a},${b}): ${cs.length} curvas: ${cs.map((c) => `${Math.round(c.d)}${c.side}`).join(" ")}`);
  }
  process.exit(0);
}

if (process.argv[2] === "design") {
  for (const [a, b] of [[8, 6], [6, 8], [8, 7], [7, 8], [6, 7], [7, 6]]) design(a, b);
  process.exit(0);
}

const r0 = (xs: number[]) => xs.map((d) => Math.round(d)).join(", ");
console.log("P (só a volta principal, proeminência corrigida)");
for (const lap of [6, 7, 8]) console.log(`  volta ${lap}: ${optionP(lap).length} curvas: ${r0(optionP(lap))}`);
for (const [a, b] of [[6, 7], [6, 8], [7, 8]]) {
  console.log(`\npar ${a}–${b}`);
  for (const m of [40, 60, 80]) {
    const x = optionA(a, b, m);
    const y = optionA(b, a, m);
    console.log(`  A (casar ≤ ${m} m): ${x.length} curvas: ${r0(x)}  | simétrico: ${r0(x) === r0(y)}`);
  }
  const c1 = optionC(a, b);
  const c2 = optionC(b, a);
  console.log(`  C (velocidade média): ${c1.length} curvas: ${r0(c1)}  | simétrico: ${r0(c1) === r0(c2)}`);
  for (const rad of [100, 150, 250]) {
    const g = optionB(a, b, rad);
    console.log(`  B (raio ≤ ${rad} m): ${g.length} trechos: ${g.map((c) => `${Math.round(c.d)}${c.side}(R${Math.round(c.radius)},${Math.round(c.angleDeg)}°)`).join(" ")}`);
  }
}
