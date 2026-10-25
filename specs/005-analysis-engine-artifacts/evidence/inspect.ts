// Uso: DB_PATH=<banco temporário> node -r ts-node/register inspect.ts <comando> [args]
//   corners                       curvas de cada par com os pontos que o motor usou em cada volta
//   window <volta> <de> <até>     amostras gravadas da volta entre duas distâncias
//   delta                         totalDeltaS de hoje e definições alternativas, contra a diferença oficial
//   losses                        deltaLossS curva a curva nos dois sentidos de cada par
//   resolution                    espaçamento entre amostras gravadas (m e s)
//   cut                           tamanho de um recorte das três voltas com só os campos que o motor usa
// Só lê o banco; nenhuma escrita.
import path from "node:path";
import zlib from "node:zlib";

const repo = path.resolve(__dirname, "..", "..", "..");
if (!process.env.DB_PATH || /data[\\/]telemetry\.db$/i.test(process.env.DB_PATH)) throw new Error("DB_PATH ausente ou real");
const { db } = require(path.join(repo, "src/persistence/db"));
const { listCarTelemetrySamplesForLap } = require(path.join(repo, "src/persistence/carTelemetrySampleRepository"));
const { listMotionSamplesForLap } = require(path.join(repo, "src/persistence/motionSampleRepository"));
const { buildInsights } = require(path.join(repo, "src/analysis/buildInsights"));
const { detectCorners } = require(path.join(repo, "src/analysis/cornerDetection"));
const { computeDelta } = require(path.join(repo, "src/analysis/segmentDelta"));
const { findApexIndexNear, findBrakingStartIndex, findThrottleOnIndex } = require(path.join(repo, "src/analysis/sampleSearch"));

const SESSION = 1;
const LAPS = [6, 7, 8];
const PAIRS: [number, number][] = [[6, 7], [6, 8], [7, 6], [7, 8], [8, 6], [8, 7]];
const tel = (lap: number) => listCarTelemetrySamplesForLap(SESSION, lap);
const mot = (lap: number) => listMotionSamplesForLap(SESSION, lap);
const lapTimeS = (lap: number) =>
  (db.prepare("SELECT lap_time_ms FROM laps WHERE session_id = ? AND lap_number = ?").get(SESSION, lap).lap_time_ms as number) / 1000;
const f = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? "null" : n.toFixed(d));
const pad = (s: string, n: number) => s.padStart(n);

function insights(a: number, b: number) {
  return buildInsights({ primaryTelemetry: tel(a), comparisonTelemetry: tel(b), primaryMotion: mot(a), comparisonMotion: mot(b) });
}

function corners(): void {
  for (const lap of LAPS) {
    const cs = detectCorners(tel(lap));
    console.log(`volta ${lap} como principal: ${cs.length} curvas, ápices ${cs.map((c: any) => Math.round(c.apexDistance)).join(", ")}`);
  }
  for (const [a, b] of PAIRS) {
    const pa = tel(a);
    const pb = tel(b);
    const ins = insights(a, b);
    console.log(`\npar (${a},${b})`);
    console.log("idx  ápice  | P:ápice  P:freada  P:retomada | C:ápice  C:freada  C:retomada | bpDiff  peakDiff  thrDiff  deltaLoss");
    for (const ci of ins.corners) {
      const c = ci.corner;
      const ia = findApexIndexNear(pa, c.apexDistance, 80);
      const ib = findApexIndexNear(pb, c.apexDistance, 80);
      const pt = (s: any[], i: number | null) => {
        if (i === null) return ["-", "-", "-"];
        return [s[i].lapDistance, s[findBrakingStartIndex(s, i, 0.1)].lapDistance, s[findThrottleOnIndex(s, i, 0.9)].lapDistance].map((x: number) => x.toFixed(1));
      };
      const [aA, aB, aT] = pt(pa, ia);
      const [bA, bB, bT] = pt(pb, ib);
      console.log(
        `${pad(String(c.index), 3)} ${pad(c.apexDistance.toFixed(0), 6)} | ${pad(aA, 7)} ${pad(aB, 9)} ${pad(aT, 10)} | ${pad(bA, 7)} ${pad(bB, 9)} ${pad(bT, 10)} | ` +
          `${pad(f(ci.braking.brakingPointDiffM), 7)} ${pad(f(ci.braking.peakBrakeDiff), 8)} ${pad(f(ci.throttle.throttleOnDiffM), 8)} ${pad(f(ci.deltaLossS), 9)}`
      );
    }
  }
}

function windowCmd(lap: number, from: number, to: number): void {
  const rows = db
    .prepare(
      `SELECT lap_distance, speed, brake, throttle, steer, session_time, overall_frame_identifier FROM car_telemetry_samples
       WHERE session_id = ? AND lap_number = ? AND lap_distance BETWEEN ? AND ? ORDER BY overall_frame_identifier`
    )
    .all(SESSION, lap, from, to);
  console.log(`volta ${lap}, ${from}–${to} m (${rows.length} amostras)`);
  console.log("   dist(m)  vel  freio  acel  volante  sessionTime  overallFrame");
  for (const r of rows) {
    console.log(
      `${pad(r.lap_distance.toFixed(1), 9)} ${pad(String(r.speed), 4)} ${pad(r.brake.toFixed(2), 6)} ${pad(r.throttle.toFixed(2), 5)} ${pad(r.steer.toFixed(2), 8)} ${pad(r.session_time.toFixed(3), 12)} ${pad(String(r.overall_frame_identifier), 13)}`
    );
  }
}

// Tempo decorrido na distância d, interpolado; null fora do intervalo coberto pelas amostras.
function elapsedAt(s: { lapDistance: number; sessionTime: number }[], t0: number, d: number): number | null {
  for (let i = 0; i < s.length - 1; i++) {
    if (d >= s[i].lapDistance && d <= s[i + 1].lapDistance) {
      const span = s[i + 1].lapDistance - s[i].lapDistance;
      const r = span === 0 ? 0 : (d - s[i].lapDistance) / span;
      return s[i].sessionTime + (s[i + 1].sessionTime - s[i].sessionTime) * r - t0;
    }
  }
  return null;
}

function delta(): void {
  for (const lap of LAPS) {
    const s = tel(lap);
    const first = s[0];
    const last = s[s.length - 1];
    console.log(
      `volta ${lap}: ${s.length} amostras, primeira ${first.lapDistance.toFixed(1)} m em t=${first.sessionTime.toFixed(3)}, ` +
        `última ${last.lapDistance.toFixed(1)} m em t=${last.sessionTime.toFixed(3)}, ` +
        `duração amostrada ${(last.sessionTime - first.sessionTime).toFixed(3)} s, oficial ${lapTimeS(lap).toFixed(3)} s`
    );
  }
  console.log("\npar     oficial  hoje(total)  alt1(fim-fim)  alt2(t0 extrapolado)");
  for (const [a, b] of PAIRS) {
    const official = lapTimeS(a) - lapTimeS(b);
    const series = computeDelta(tel(a), tel(b));
    const today = series[series.length - 1][1];
    const sa = tel(a);
    const sb = tel(b);
    // alt1: delta na última distância coberta pelas duas voltas, mais a diferença oficial que sobra fora dela: não usado; só o comum
    const dEnd = Math.min(sa[sa.length - 1].lapDistance, sb[sb.length - 1].lapDistance);
    const alt1 = (elapsedAt(sa, sa[0].sessionTime, dEnd) ?? NaN) - (elapsedAt(sb, sb[0].sessionTime, dEnd) ?? NaN);
    // alt2: t0 de cada volta extrapolado para a distância 0 a partir das duas primeiras amostras
    const t0 = (s: any[]) => {
      const [p, q] = [s[0], s[1]];
      const v = (q.lapDistance - p.lapDistance) / (q.sessionTime - p.sessionTime);
      return p.sessionTime - p.lapDistance / v;
    };
    const alt2 = (elapsedAt(sa, t0(sa), dEnd) ?? NaN) - (elapsedAt(sb, t0(sb), dEnd) ?? NaN);
    console.log(`(${a},${b})  ${pad(official.toFixed(3), 7)}  ${pad(today.toFixed(3), 11)}  ${pad(alt1.toFixed(3), 13)}  ${pad(alt2.toFixed(3), 20)}`);
  }
}

function losses(): void {
  for (const [a, b] of [[6, 7], [6, 8], [7, 8]]) {
    const ab = insights(a, b);
    const ba = insights(b, a);
    console.log(`\n(${a},${b}) ${ab.corners.length} curvas / (${b},${a}) ${ba.corners.length} curvas`);
    console.log("ápice(A,B)  deltaLoss(A,B) | ápice(B,A)  deltaLoss(B,A) | soma");
    for (const c of ab.corners) {
      const m = ba.corners.find((x: any) => Math.abs(x.corner.apexDistance - c.corner.apexDistance) <= 40);
      console.log(
        `${pad(c.corner.apexDistance.toFixed(0), 10)}  ${pad(f(c.deltaLossS), 14)} | ${pad(m ? m.corner.apexDistance.toFixed(0) : "-", 10)}  ${pad(m ? f(m.deltaLossS) : "-", 14)} | ${m ? f(c.deltaLossS + m.deltaLossS) : "-"}`
      );
    }
    for (const m of ba.corners) {
      if (!ab.corners.some((c: any) => Math.abs(c.corner.apexDistance - m.corner.apexDistance) <= 40)) {
        console.log(`${pad("-", 10)}  ${pad("-", 14)} | ${pad(m.corner.apexDistance.toFixed(0), 10)}  ${pad(f(m.deltaLossS), 14)} | -`);
      }
    }
    console.log(`totalDeltaS: (${a},${b}) ${ab.totalDeltaS} / (${b},${a}) ${ba.totalDeltaS} / soma ${(ab.totalDeltaS + ba.totalDeltaS).toFixed(2)}`);
  }
}

function resolution(): void {
  for (const lap of LAPS) {
    const s = tel(lap);
    const dd: number[] = [];
    const dt: number[] = [];
    for (let i = 1; i < s.length; i++) {
      dd.push(s[i].lapDistance - s[i - 1].lapDistance);
      dt.push(s[i].sessionTime - s[i - 1].sessionTime);
    }
    const q = (xs: number[], p: number) => [...xs].sort((x, y) => x - y)[Math.floor(p * (xs.length - 1))];
    console.log(
      `volta ${lap}: Δdist min ${q(dd, 0).toFixed(2)} mediana ${q(dd, 0.5).toFixed(2)} p95 ${q(dd, 0.95).toFixed(2)} máx ${q(dd, 1).toFixed(2)} m; ` +
        `Δt min ${q(dt, 0).toFixed(3)} mediana ${q(dt, 0.5).toFixed(3)} p95 ${q(dt, 0.95).toFixed(3)} máx ${q(dt, 1).toFixed(3)} s`
    );
  }
}

function cut(): void {
  const laps = LAPS.map((lap) => ({
    lapNumber: lap,
    lapTimeMs: Math.round(lapTimeS(lap) * 1000),
    telemetry: tel(lap).map((s: any) => ({
      lapDistance: s.lapDistance, sessionTime: s.sessionTime, speed: s.speed, throttle: s.throttle, brake: s.brake, steer: s.steer,
      tyreSurfaceTemp: s.tyreSurfaceTemp,
    })),
    motion: mot(lap).map((s: any) => ({ lapDistance: s.lapDistance, x: s.worldPosition.x, z: s.worldPosition.z })),
  }));
  const json = JSON.stringify({ laps });
  console.log("campos: telemetria lapDistance, sessionTime, speed, throttle, brake, steer, tyreSurfaceTemp (4 rodas); movimento lapDistance, worldPosition.x, worldPosition.z");
  console.log(`JSON compacto: ${Buffer.byteLength(json)} bytes; gzip -9: ${zlib.gzipSync(json, { level: 9 }).length} bytes`);
  const pretty = JSON.stringify({ laps }, null, 2);
  console.log(`JSON indentado: ${Buffer.byteLength(pretty)} bytes`);

  // Precisão real: os campos do jogo chegam como float32 (ou inteiros); um double que é float32 exato satisfaz fround(x) === x.
  const nums: Record<string, number[]> = {};
  const walk = (o: any, p: string) => {
    if (typeof o === "number") (nums[p] ??= []).push(o);
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, Array.isArray(o) ? p : p ? `${p}.${k}` : k);
  };
  for (const l of laps) {
    l.telemetry.forEach((s: any) => walk(s, "telemetry"));
    l.motion.forEach((s: any) => walk(s, "motion"));
  }
  for (const [k, xs] of Object.entries(nums)) {
    const f32 = xs.filter((x) => Math.fround(x) === x).length;
    const ints = xs.filter((x) => Number.isInteger(x)).length;
    console.log(`  ${k}: ${xs.length} valores, float32 exatos ${f32}, inteiros ${ints}, mín ${Math.min(...xs).toFixed(3)}, máx ${Math.max(...xs).toFixed(3)}`);
  }
  const round = (decimals: Record<string, number>) =>
    JSON.stringify({ laps }, (key, v) => (typeof v === "number" && key in decimals ? Number(v.toFixed(decimals[key])) : v));
  const sig9 = JSON.stringify({ laps }, (_k, v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toPrecision(9)) : v));
  const back = JSON.parse(sig9);
  let lossless = true;
  JSON.parse(json).laps.forEach((l: any, i: number) =>
    l.telemetry.forEach((s: any, j: number) => {
      for (const k of Object.keys(s)) if (typeof s[k] === "number" && Math.fround(back.laps[i].telemetry[j][k]) !== s[k]) lossless = false;
    })
  );
  const domain = round({ lapDistance: 3, sessionTime: 4, throttle: 4, brake: 4, steer: 4, x: 3, z: 3 });
  for (const [name, text] of [["9 algarismos significativos (float32 sem perda)", sig9], ["por domínio: dist e posição 3 casas, tempo 4, pedais e volante 4", domain]] as const) {
    console.log(`${name}: JSON ${Buffer.byteLength(text)} bytes; gzip -9 ${zlib.gzipSync(text, { level: 9 }).length} bytes`);
  }
  console.log(`9 algarismos devolve o float32 exato em toda a telemetria: ${lossless}`);
}

// Mínimos locais da série suavizada (mesma suavização de cornerDetection.ts) com a subida de cada lado
// como o motor mede (sem parar num mínimo mais baixo) e como proeminência topográfica (parando nele).
function minima(): void {
  const { movingAverage } = require(path.join(repo, "src/analysis/smoothing"));
  for (const lap of LAPS) {
    const s = tel(lap);
    const sm: [number, number][] = movingAverage(s.map((x: any) => [x.lapDistance, x.speed]), 5);
    console.log(`\nvolta ${lap}: mínimos locais da velocidade suavizada`);
    console.log("   dist(m)  vel(suav)  subida esq./dir. (motor)  subida esq./dir. (parando em mínimo mais baixo)");
    for (let i = 1; i < sm.length - 1; i++) {
      const v = sm[i][1];
      if (!(v < sm[i - 1][1] && v <= sm[i + 1][1])) continue;
      const rise = (dir: number, stopAtLower: boolean) => {
        let r = 0;
        for (let j = i + dir; j >= 0 && j < sm.length; j += dir) {
          if (stopAtLower && sm[j][1] < v) break;
          r = Math.max(r, sm[j][1] - v);
          if (!stopAtLower && r >= 15) break;
        }
        return r;
      };
      const engine = [rise(-1, false), rise(1, false)];
      const topo = [rise(-1, true), rise(1, true)];
      if (engine[0] < 15 || engine[1] < 15) continue;
      console.log(
        `${pad(sm[i][0].toFixed(1), 9)} ${pad(v.toFixed(1), 10)}  ${pad(engine[0].toFixed(1), 10)} / ${pad(engine[1].toFixed(1), 6)}           ${pad(topo[0].toFixed(1), 10)} / ${pad(topo[1].toFixed(1), 6)}`
      );
    }
  }
}

// Freadas de cada volta: trechos contíguos com freio > 0.1 (o limiar do motor), e trechos sem acelerador pleno (< 0.9).
function events(): void {
  for (const lap of LAPS) {
    const s = tel(lap);
    const runs = (pred: (x: any) => boolean) => {
      const out: { from: number; to: number; peak: number; minSpeed: number }[] = [];
      let cur: any = null;
      for (const x of s) {
        if (pred(x)) {
          if (!cur) cur = { from: x.lapDistance, to: x.lapDistance, peak: x.brake, minSpeed: x.speed };
          cur.to = x.lapDistance;
          cur.peak = Math.max(cur.peak, x.brake);
          cur.minSpeed = Math.min(cur.minSpeed, x.speed);
        } else if (cur) {
          out.push(cur);
          cur = null;
        }
      }
      if (cur) out.push(cur);
      return out;
    };
    console.log(`\nvolta ${lap}: freadas (freio > 0.1)`);
    for (const r of runs((x) => x.brake > 0.1)) console.log(`  ${r.from.toFixed(1)}–${r.to.toFixed(1)} m, pico ${r.peak.toFixed(2)}, vel. mín. ${r.minSpeed}`);
    console.log(`volta ${lap}: trechos sem acelerador pleno (< 0.9) com mais de 20 m`);
    for (const r of runs((x) => x.throttle < 0.9).filter((r) => r.to - r.from > 20)) console.log(`  ${r.from.toFixed(1)}–${r.to.toFixed(1)} m, vel. mín. ${r.minSpeed}`);
  }
}

// Em cada par, para cada volta: quantas vezes o início da freada que o motor usa é o próprio ápice, e em
// quantas dessas a volta tinha uma freada (freio > 0.1) terminando nos 150 m antes do ápice.
function atApex(): void {
  for (const [a, b] of PAIRS) {
    const cs = detectCorners(tel(a));
    for (const [role, lap] of [["principal", a], ["comparação", b]] as const) {
      const s = tel(lap);
      let same = 0;
      let braked = 0;
      const cases: string[] = [];
      for (const c of cs) {
        const ia = findApexIndexNear(s, c.apexDistance, 80);
        if (ia === null) continue;
        if (findBrakingStartIndex(s, ia, 0.1) !== ia) continue;
        same++;
        const apexD = s[ia].lapDistance;
        let j = ia - 1;
        while (j >= 0 && s[j].lapDistance >= apexD - 150 && s[j].brake <= 0.1) j--;
        if (j >= 0 && s[j].lapDistance >= apexD - 150) {
          let k = j;
          while (k > 0 && s[k - 1].brake > 0.1) k--;
          braked++;
          cases.push(`ápice ${apexD.toFixed(1)}: freada ${s[k].lapDistance.toFixed(1)}–${s[j].lapDistance.toFixed(1)}`);
        }
      }
      console.log(`(${a},${b}) ${role} (volta ${lap}): início = ápice em ${same} de ${cs.length}; com freada nos 150 m antes: ${braked}${cases.length ? " — " + cases.join("; ") : ""}`);
    }
  }
}

// deltaLossS das curvas comuns medido nos dois sentidos sobre o MESMO trecho (a união dos dois trechos de hoje),
// com a série de delta de hoje: separa o efeito do trecho do efeito da série.
function lossesSameStretch(): void {
  const { cornerLoss } = require(path.join(repo, "src/analysis/segmentDelta"));
  for (const [a, b] of [[6, 7], [6, 8], [7, 8]]) {
    const ab = insights(a, b);
    const ba = insights(b, a);
    const sAB = computeDelta(tel(a), tel(b));
    const sBA = computeDelta(tel(b), tel(a));
    console.log(`\n(${a},${b}) × (${b},${a}): trecho comum = união dos dois trechos de hoje`);
    console.log("ápice(A,B)  trecho             hoje A,B / B,A / soma     mesmo trecho A,B / B,A / soma");
    for (const c of ab.corners) {
      const m = ba.corners.find((x: any) => Math.abs(x.corner.apexDistance - c.corner.apexDistance) <= 40);
      if (!m) continue;
      const from = Math.min(c.corner.brakingStartDistance, m.corner.brakingStartDistance);
      const to = Math.max(c.corner.exitDistance, m.corner.exitDistance);
      const x = cornerLoss(sAB, from, to);
      const y = cornerLoss(sBA, from, to);
      console.log(
        `${pad(c.corner.apexDistance.toFixed(0), 10)}  ${pad(from.toFixed(0), 6)}–${to.toFixed(0).padEnd(6)}   ${pad(f(c.deltaLossS), 6)} / ${pad(f(m.deltaLossS), 5)} / ${pad(f(c.deltaLossS + m.deltaLossS), 5)}     ${pad(f(x), 6)} / ${pad(f(y), 5)} / ${pad(f(x + y), 5)}`
      );
    }
  }
}

// Total com o início de volta dado pelo jogo (sessionTime − currentLapTimeInMS na série crua), na última distância comum.
function deltaGameStart(rawPath: string): void {
  const raw = JSON.parse(require("node:fs").readFileSync(rawPath, "utf8")) as any[];
  const start = new Map<number, number>();
  for (const lap of LAPS) {
    const xs = raw.filter((r) => r.packetId === 2 && r.lapNum === lap).map((r) => r.sessionTime - r.currentLapTimeInMS / 1000).sort((p, q) => p - q);
    start.set(lap, xs[Math.floor(xs.length / 2)]);
  }
  console.log(`início pelo jogo: ${LAPS.map((l) => `volta ${l} ${start.get(l)!.toFixed(3)}`).join(", ")}`);
  console.log(`atraso da primeira amostra gravada: ${LAPS.map((l) => `volta ${l} ${(tel(l)[0].sessionTime - start.get(l)!).toFixed(3)} s`).join(", ")}`);
  console.log("par     oficial  alt3(início do jogo, última distância comum)  erro");
  for (const [a, b] of PAIRS) {
    const sa = tel(a);
    const sb = tel(b);
    const dEnd = Math.min(sa[sa.length - 1].lapDistance, sb[sb.length - 1].lapDistance);
    const v = (elapsedAt(sa, start.get(a)!, dEnd) ?? NaN) - (elapsedAt(sb, start.get(b)!, dEnd) ?? NaN);
    const official = lapTimeS(a) - lapTimeS(b);
    console.log(`(${a},${b})  ${pad(official.toFixed(3), 7)}  ${pad(v.toFixed(3), 44)}  ${pad((v - official).toFixed(3), 6)}`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (["minima", "events", "atApex", "lossesSameStretch", "deltaGameStart"].includes(cmd)) {
  if (cmd === "minima") minima();
  else if (cmd === "events") events();
  else if (cmd === "atApex") atApex();
  else if (cmd === "lossesSameStretch") lossesSameStretch();
  else deltaGameStart(args[0]);
  process.exit(0);
}
if (cmd === "corners") corners();
else if (cmd === "window") windowCmd(Number(args[0]), Number(args[1]), Number(args[2]));
else if (cmd === "delta") delta();
else if (cmd === "losses") losses();
else if (cmd === "resolution") resolution();
else if (cmd === "cut") cut();
else throw new Error(`comando desconhecido: ${cmd}`);
