// Uso: node -r ts-node/register rawChecks.ts <saída-crua.json> [volta de até]
// Sem argumentos extras: sinais de flashback e out-lap na série crua (todos os pacotes 2 e 6 do carro do jogador).
// Com "volta de até": a série crua de telemetria (pacote 6) daquela volta entre duas distâncias.
import fs from "node:fs";

const [rawPath, lapArg, fromArg, toArg] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(rawPath, "utf8")) as any[];
const pad = (s: string, n: number) => s.padStart(n);

if (lapArg) {
  const lap = Number(lapArg);
  const rows = raw.filter((r) => r.packetId === 6 && r.lapNum === lap && r.lapDistance >= Number(fromArg) && r.lapDistance <= Number(toArg));
  console.log(`volta ${lap}, ${fromArg}–${toArg} m, série crua (${rows.length} pacotes de telemetria)`);
  console.log("   dist(m)  vel  freio  acel  volante  sessionTime  frame  overallFrame");
  for (const r of rows) {
    console.log(
      `${pad(r.lapDistance.toFixed(1), 9)} ${pad(String(r.speed), 4)} ${pad(r.brake.toFixed(2), 6)} ${pad(r.throttle.toFixed(2), 5)} ${pad(r.steer.toFixed(2), 8)} ${pad(r.sessionTime.toFixed(3), 12)} ${pad(String(r.frame), 6)} ${pad(String(r.overallFrame), 13)}`
    );
  }
  process.exit(0);
}

const lapRows = raw.filter((r) => r.packetId === 2);
console.log(`pacotes de volta (2): ${lapRows.length}; de telemetria (6): ${raw.filter((r) => r.packetId === 6).length}`);
console.log(`primeiro pacote: t=${raw[0].sessionTime.toFixed(3)} frame=${raw[0].frame} overall=${raw[0].overallFrame}`);

// Trechos contíguos por (volta, driverStatus, pitStatus)
let seg: any = null;
const segs: any[] = [];
for (const r of lapRows) {
  const key = `${r.lapNum}|${r.driverStatus}|${r.pitStatus}`;
  if (!seg || seg.key !== key) {
    seg = { key, lapNum: r.lapNum, driverStatus: r.driverStatus, pitStatus: r.pitStatus, first: r, last: r, n: 0, minDist: r.lapDistance, maxDist: r.lapDistance };
    segs.push(seg);
  }
  seg.last = r;
  seg.n++;
  seg.minDist = Math.min(seg.minDist, r.lapDistance);
  seg.maxDist = Math.max(seg.maxDist, r.lapDistance);
}
console.log("\ntrechos contíguos dos pacotes de volta (driverStatus: 1 volta lançada, 2 in lap, 3 out lap, 4 na pista)");
console.log("volta  driverStatus  pitStatus  pacotes  t início   t fim     dist início  dist fim  dist mín  dist máx");
for (const s of segs) {
  console.log(
    `${pad(String(s.lapNum), 5)} ${pad(String(s.driverStatus), 13)} ${pad(String(s.pitStatus), 10)} ${pad(String(s.n), 8)} ${pad(s.first.sessionTime.toFixed(3), 9)} ${pad(s.last.sessionTime.toFixed(3), 9)} ${pad(s.first.lapDistance.toFixed(1), 12)} ${pad(s.last.lapDistance.toFixed(1), 9)} ${pad(s.minDist.toFixed(1), 9)} ${pad(s.maxDist.toFixed(1), 9)}`
  );
}

// Regressões dentro de uma volta: sessionTime, frameIdentifier, lapDistance; divergência frame vs overallFrame
let prev: any = null;
let timeBack = 0;
let frameBack = 0;
let distBack = 0;
const distBackSamples: string[] = [];
const offsets = new Set<number>();
for (const r of raw) {
  offsets.add(r.overallFrame - r.frame);
  if (prev) {
    if (r.sessionTime < prev.sessionTime) timeBack++;
    if (r.frame < prev.frame) frameBack++;
    if (r.packetId === 2 && prev.lapNum === r.lapNum && r.lapDistance < prev.lapDistance - 1) {
      distBack++;
      if (distBackSamples.length < 10) distBackSamples.push(`volta ${r.lapNum}: ${prev.lapDistance.toFixed(1)} → ${r.lapDistance.toFixed(1)} m em t=${r.sessionTime.toFixed(3)}`);
    }
  }
  if (r.packetId === 2) prev = r;
  else prev = { ...r, lapNum: prev?.lapNum, lapDistance: prev?.lapDistance };
}
console.log(`\nsessionTime voltando: ${timeBack}; frameIdentifier voltando: ${frameBack}; lapDistance voltando (>1 m, mesma volta): ${distBack}`);
for (const s of distBackSamples) console.log(`  ${s}`);
console.log(`overallFrame − frame: ${[...offsets].join(", ")}`);

// Início de cada volta segundo o jogo: sessionTime − currentLapTimeInMS
console.log("\ninício de volta segundo o jogo (sessionTime − currentLapTimeInMS/1000), mediana por volta, e lastLapTimeInMS ao trocar de volta");
const byLap = new Map<number, number[]>();
for (const r of lapRows) {
  if (!byLap.has(r.lapNum)) byLap.set(r.lapNum, []);
  byLap.get(r.lapNum)!.push(r.sessionTime - r.currentLapTimeInMS / 1000);
}
for (const [lap, xs] of byLap) {
  const sorted = [...xs].sort((a, b) => a - b);
  console.log(`volta ${lap}: início ${sorted[Math.floor(sorted.length / 2)].toFixed(3)} (mín ${sorted[0].toFixed(3)}, máx ${sorted[sorted.length - 1].toFixed(3)})`);
}
for (let i = 1; i < lapRows.length; i++) {
  if (lapRows[i].lapNum !== lapRows[i - 1].lapNum) {
    console.log(`troca ${lapRows[i - 1].lapNum}→${lapRows[i].lapNum} em t=${lapRows[i].sessionTime.toFixed(3)}: lastLapTimeInMS=${lapRows[i].lastLapTimeInMS}, dist ${lapRows[i - 1].lapDistance.toFixed(1)} → ${lapRows[i].lapDistance.toFixed(1)}`);
  }
}
