# Research: Fix the analysis engine's artifacts

**Feature**: [spec.md](spec.md) | **Phases**: 0 (investigation, sections 0–9, 2026-10-24, verdicts approved on 2026-10-25) and 1 (design research, sections 10–15, 2026-10-25) | **Code read**: `main` at `7dc6685`; frontend `main` at `9334f87` (read only)

Sections 0–9 are the investigation that FR-001–FR-005 and FR-011a require before any correction; sections 10–15 are the research for the design, after the maintainer's decisions. Every number below was produced by the scripts in [evidence/](evidence/) on a temporary database built from the published recording (section 10 also reads a local recording of the same session, said where); the commands are in section 0 so the maintainer can re-run them. The decisions themselves are in [plan.md](plan.md).

Verdict vocabulary (FR-002): **engine artifact** (the code produces a value the samples do not show), **real on track** (the samples show it), **decimation effect** (the value comes from the 4 m / 500 ms decimation), **undeterminable** (the data cannot tell).

## Summary of verdicts

| # | Observation | Verdict | Main evidence |
|---|---|---|---|
| 1 | `totalDeltaS` not symmetric, not the official difference | **Engine artifact** | Each lap's start is its own first stored sample (0.004 / 0.028 / −0.015 s off the game's lap start) and the comparison lap is clamped at its own last sample (lap 7 ends at 4,286.8 m, laps 6 and 8 at 4,294 m): (6,7) = 74.285 − 74.005 = **0.280** (section 2) |
| 1a | `deltaLossS` not symmetric corner by corner | **Engine artifact** | The stretch is the primary lap's own braking start → throttle pick-up, so (A,B) and (B,A) measure different stretches; on the same stretch the two directions are opposite within 0.05 s, mostly 0.01 (section 2.4) |
| 2 | Neighbouring corners share a point (±80 m windows) | **Engine artifact** | (6,7) corners at 334 and 399 m both use lap 6's sample at 333.7 m and lap 7's at 391.2 m; corner 492's "apex" in lap 7 is 416.3 m, the first sample of its window, where lap 7 is accelerating (section 3) |
| 3 | Braking start stops at the apex | **Engine artifact**, plus **real on track** where a lap did not brake | Lap 7 braked at T1 from 227.9 to 365.5 m, but the engine reports its braking start at the apex, 391.2 m; the real braking points of laps 6 and 7 are 16.7 m apart, the engine says 179.97 m. Where the comparison lap did not brake at all (lap 7 and 8 near 2,050–2,150 m), a braking-point difference does not exist (section 4) |
| 4 | The same throttle pick-up for neighbouring corners | **Real on track** (no full throttle between those corners) with an **engine artifact** in the attribution | Lap 6 stays below 0.9 throttle from 211.2 to 492.3 m; the engine gives the same 497.8 m pick-up to the corners at 334, 399 and 492 m because the forward search has no bound (section 5) |
| 5 | 12 corners with lap 6 primary, 7 otherwise | **Not the out-lap, not a flashback.** Five of the twelve are an **engine artifact** (the prominence test); the remaining difference in *which* corners lap 6 has is **real on track** | No regression of time, frame or distance, constant `overallFrame − frame`, `driverStatus` 1 throughout. The prominence test does not stop at a deeper minimum, so 1–10 km/h dips pass a 15 km/h test; with a true prominence each lap gives 7 corners, but lap 6's set differs at T1–T2 and near 2,496 m (section 6) |

None of the five is a decimation effect at the points that decide them (section 1.2). Consequences for the spec are in section 9: the condition under which the clarify session accepted lap 6's extra corners as a recorded reason (the out-lap or a flashback) **is not met**, so they are this spec's subject (FR-013, in full).

---

## 0. How it was built

Environment for every command below: `DOTENV_CONFIG_PATH` pointing at an empty `.env` in the agent's scratch folder (no key, no ports), checked first:

```text
$ DOTENV_CONFIG_PATH=<scratch>/empty.env node -r dotenv/config -e "console.log(Boolean(process.env.ANTHROPIC_API_KEY))"
false
```

`DB_PATH` pointed at a new file in the scratch folder; `data/telemetry.db` was never opened. The scripts set nothing else and make no network call.

```text
$ DB_PATH=<scratch>/r005/research.db TS_NODE_TRANSPILE_ONLY=1 node -r ts-node/register \
    specs/005-analysis-engine-artifacts/evidence/buildResearchDb.ts recordings/demo-interlagos-tt-20hz-laps6-8.jsonl <scratch>/r005/raw.json
sha256 da gravação: c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033
banco: <scratch>\r005\research.db
pacotes lidos: 13960; descartados: 0
sessões: [{"id":1,"session_uid":"1026725433292396341","track_id":16}]
voltas: [{"lap_number":6,"lap_time_ms":74306,"is_valid":0},{"lap_number":7,"lap_time_ms":74144,"is_valid":1},{"lap_number":8,"lap_time_ms":73372,"is_valid":1}]
car_telemetry_samples: [{"lap":6,"n":797},{"lap":7,"n":801},{"lap":8,"n":793},{"lap":9,"n":20}]
motion_samples: [{"lap":6,"n":797},{"lap":7,"n":801},{"lap":8,"n":793},{"lap":9,"n":20}]
série crua: 8916 linhas em <scratch>\r005\raw.json
```

The hash is the published one (`003-demo-mode:specs/003-demo-mode/research.md`, section 2; spec 004 research, section 4) and the counts are the 2,411 + 2,411 of a 1x replay (FR-005). `buildResearchDb.ts` passes every packet through `dispatchPacket` and `persistTelemetry` as `src/server.ts:31-90` does, with no socket, and also writes the player car's raw series (every lap-data and car-telemetry packet, 4,458 of each, before decimation) for the decimation and flashback checks.

The readings:

```text
inspect.ts corners | window <lap> <from> <to> | events | atApex | minima | delta | deltaGameStart <raw.json> | losses | lossesSameStretch | resolution | cut
rawChecks.ts <raw.json>                     # flashback / out-lap signals
rawChecks.ts <raw.json> <lap> <from> <to>   # raw (undecimated) car telemetry between two distances
cornerOptions.ts | cornerOptions.ts design [STRETCH=open] | cornerOptions.ts places <a,b> ...   # design prototypes (sections 10–12)
```

All run as `DB_PATH=<scratch>/r005/research.db TS_NODE_TRANSPILE_ONLY=1 node -r ts-node/register specs/005-analysis-engine-artifacts/evidence/<script> ...`. Tables below are the scripts' output; where a table shows every other row, it says so.

---

## 1. Data resolution (item 7) and decimation

### 1.1 Spacing of the stored samples

```text
$ inspect.ts resolution
volta 6: Δdist min 4.00 mediana 5.11 p95 7.55 máx 10.00 m; Δt min 0.044 mediana 0.095 p95 0.156 máx 0.213 s
volta 7: Δdist min 4.00 mediana 4.98 p95 7.55 máx 9.37 m; Δt min 0.046 mediana 0.090 p95 0.157 máx 0.261 s
volta 8: Δdist min 4.00 mediana 5.12 p95 7.61 máx 9.69 m; Δt min 0.044 mediana 0.092 p95 0.155 máx 0.217 s
```

So a point along the lap is located to about **5 m** (median), **7.6 m** (p95) and **10 m** at worst, and an instant to about **0.09 s** (median), **0.16 s** (p95), **0.26 s** at worst. At 330 km/h the 20 Hz send rate alone puts 4.2–4.6 m between packets; in slow corners decimation keeps one sample per 4 m and drops packets in between. These are the figures the tolerances of FR-014 rest on.

### 1.2 Decimation is not the cause at the deciding points

At high speed every packet is stored (raw = stored); at T1's braking point of lap 7:

```text
$ rawChecks.ts raw.json 7 220 240            # raw, before decimation
    223.4  332   0.00  1.00    -0.01      542.721  10877         11177
    227.9  331   0.15  0.89     0.00      542.769  10878         11178
    232.4  328   0.46  0.51     0.02      542.818  10879         11179
    236.8  324   0.64  0.04     0.04      542.867  10880         11180
```

The same four rows are in the stored window (section 4). In slow sections decimation keeps about every second raw packet (lap 7, 365–395 m: 17 raw packets, 6 stored), but the brake release there (0.13 at 368.5 m, 0.08 at 370.4 m raw; 0.16 at 365.5 m, 0.08 at 370.4 m stored) and the minimum (104 km/h at 389.2–391.2 m raw, 104 at 391.2 m stored) are the same to one sample. The one place decimation matters is the **end of lap 7** (section 2.2): its last raw packet (4,289.2 m) is 2.4 m after the previous one and is not stored.

---

## 2. `totalDeltaS` and `deltaLossS` (observation 1, item 3)

### 2.1 How the series is computed today

`computeDelta` (`src/analysis/segmentDelta.ts:43-53`) normalizes each lap by subtracting **its own first stored sample's** `sessionTime` (`normalizeToLapStart`, lines 15-19), then, for every sample of the primary lap, interpolates the comparison lap's elapsed time at the same `lapDistance` (`interpolateElapsedAtDistance`, lines 21-37), **clamping** to the comparison lap's first or last sample outside its range (lines 23-24). `totalDeltaS` is the series' last value (`buildInsights.ts:26`): the primary lap's last sample against the comparison lap at that distance.

### 2.2 Why (A,B) and (B,A) diverge

```text
$ inspect.ts delta
volta 6: 797 amostras, primeira 1.7 m em t=465.989, última 4294.2 m em t=540.274, duração amostrada 74.285 s, oficial 74.306 s
volta 7: 801 amostras, primeira 4.0 m em t=540.321, última 4286.8 m em t=614.326, duração amostrada 74.004 s, oficial 74.144 s
volta 8: 793 amostras, primeira 1.7 m em t=614.429, última 4294.0 m em t=687.788, duração amostrada 73.359 s, oficial 73.372 s

$ inspect.ts deltaGameStart raw.json
início pelo jogo: volta 6 465.985, volta 7 540.293, volta 8 614.444
atraso da primeira amostra gravada: volta 6 0.004 s, volta 7 0.028 s, volta 8 -0.015 s
```

("Início pelo jogo" is the median of `sessionTime − currentLapTimeInMS/1000` over the lap's lap-data packets; consecutive starts differ by 74.308, 74.151 and 73.369 s against the official 74.306, 74.144 and 73.372 s.)

Two effects, both from treating the first and last stored samples as the lap's start and end:

1. **Start offset.** Lap 7's first sample is at 4.0 m, 0.028 s after the game's lap start; lap 6's is 0.004 s after, lap 8's 0.015 s *before* (the game's `currentLapTimeInMS` and the packet phase are not aligned to the millisecond). The 20 Hz send rate decides where the first packet of a lap falls; the engine takes it as zero.
2. **End clamp, primary-only grid.** In (6,7) the primary lap's last sample is at 4,294.2 m, beyond lap 7's last stored sample (4,286.8 m), so lap 7's time is clamped at its own last sample: 74.285 − 74.005 = **0.280**. In (7,6) the primary lap 7 ends at 4,286.8 m and lap 6 is interpolated there: **−0.198**. Lap 7's last raw packet is at 4,289.2 m (section 1.2) and is not stored, because it is 2.4 m after the previous one (decimation); the next packet would already belong to lap 8. (6,8) and (8,6) end at 4,294.2 and 4,294.0 m, and the two starts are 0.019 s apart, so they nearly agree: +0.926 / −0.923.

**Verdict: engine artifact.** The definition depends on where the first and last packets of each lap fall (send rate, plus decimation at lap 7's end), and on which lap's distances the series is evaluated.

### 2.3 Alternative definitions against the official difference

```text
par     oficial  hoje(total)  alt1(fim-fim)  alt2(t0 extrapolado)  alt3(início do jogo)
(6,7)    0.162        0.280          0.198                 0.173                 0.174
(6,8)    0.934        0.926          0.923                 0.924                 0.943
(7,6)   -0.162       -0.198         -0.198                -0.173                -0.174
(7,8)    0.772        0.725          0.725                 0.751                 0.769
(8,6)   -0.934       -0.923         -0.923                -0.924                -0.943
(8,7)   -0.772       -0.645         -0.725                -0.751                -0.769
```

- **alt1**: today's normalization, both laps evaluated at the last distance covered by both (no clamp). Symmetric by construction; the start offset remains (error up to 0.047 s).
- **alt2**: alt1, with each lap's start extrapolated to 0 m from its first two samples. Symmetric; error **0.011, 0.010, 0.021 s**.
- **alt3**: alt1, with each lap's start taken from the game (`sessionTime − currentLapTimeInMS`, raw series). Symmetric; error **0.012, 0.009, 0.003 s**. The stored samples do not carry `currentLapTimeInMS` today; the plan would have to say where the start comes from.

All three alternatives are evaluated at the last common distance, so the last few metres (up to 7.4 m, about 0.08 s at 324 km/h for both laps, which largely cancel) are not covered; that is the residual of alt2 and alt3. An end anchored on the official lap time would be exact by construction; whether that is a definition or a substitution of `totalDeltaS` by the official difference is a plan question (FR-012).

So a definition that agrees with the official difference **within about 0.02 s** (about one sample's time, section 1.1) and is symmetric by construction exists. With the preference recorded in the clarify session, this points at correcting `totalDeltaS`, not removing it; the plan decides.

### 2.4 `deltaLossS` corner by corner, six pairs

Today, the corners present in both directions (matched by apex within 40 m):

```text
$ inspect.ts losses                     (abridged: corners present in both directions)
(6,7) 12 curvas / (7,6) 7 curvas         (6,8) 12 / (8,6) 7                 (7,8) 7 / (8,7) 7
ápice  (A,B)  (B,A)  soma                ápice  (A,B)  (B,A)  soma          ápice  (A,B)  (B,A)  soma
  399  -0.08   0.19  0.11                  399  -0.24   0.30  0.06            391  -0.20   0.16 -0.04
 1404  -0.26   0.17 -0.09                 1404  -0.20   0.29  0.09           1415  -0.15   0.04 -0.11
 2149   0.20   0.00  0.20                 2149   0.24  -0.08  0.16           2121   0.02  -0.02  0.00
 2375   0.03   0.01  0.04                 2375   0.08   0.05  0.13           2368   0.00   0.01  0.01
 2463  -0.15   0.18  0.03                 2463  -0.02   0.13  0.11           2496   0.11  -0.06  0.05
 2795   0.28  -0.16  0.12                 2795  -0.14   0.08 -0.06           2790  -0.26   0.08 -0.18
 3279  -0.25   0.38  0.13                 3279  -0.12   0.36  0.24           3276   0.20  -0.69 -0.49
totalDeltaS: (6,7) 0.28 / (7,6) -0.2      (6,8) 0.93 / (8,6) -0.92           (7,8) 0.72 / (8,7) -0.65
```

The sum should be 0. It reaches **−0.49** at the last corner of (7,8)/(8,7) and is above 0.1 in absolute value in 11 of the 21 matched corners. Five of lap 6's corners have no counterpart at all (334, 492, 1492, 2053, 2541 m).

**Cause.** `cornerLoss` measures the series between the corner's own `brakingStartDistance` and `exitDistance` (`buildInsights.ts:33`), and those come from the **primary lap's** own braking start and throttle pick-up (`cornerDetection.ts:94-97`). The same corner therefore has different stretches in the two directions: at the last corner, (7,8) measures 3,281.1–3,331.7 m (lap 7's braking start fell on its apex, section 4) and (8,7) measures 3,178.3–3,345.3 m; the time lost between 3,178 and 3,281 m is counted in one direction only.

Measured over **the same stretch** in both directions (the union of the two stretches of today), with today's series:

```text
$ inspect.ts lossesSameStretch          (sum of the two directions)
(6,7)×(7,6):  0.00  0.00  0.00  0.01  0.01  0.00  0.01
(6,8)×(8,6): -0.05 -0.01 -0.01  0.00 -0.01 -0.01 -0.02
(7,8)×(8,7):  0.00 -0.01  0.01 -0.01 -0.01 -0.05  0.00
```

and the last corner of (7,8) becomes +0.69 / −0.69. So the asymmetry of `deltaLossS` is **an engine artifact of the stretch**, not of the series: on a common stretch the two directions are opposite within **0.05 s** (19 of 21 within 0.02). The two 0.05 residuals are consistent with `deltaAtDistance` (`segmentDelta.ts:69-74`) taking the first sample at or after the bound instead of interpolating, on two different sample grids — a hypothesis, not separately measured. The start offset of section 2.2 cancels inside a stretch (both bounds carry it).

**Verdict (observation 1a, FR-011a): engine artifact.** It also shows that the stretch, and therefore which corners become the coach's opportunities, changes with the primary lap.

---

## 3. Shared points between neighbouring corners (observation 2)

`analyzeBraking` and `analyzeThrottle` look for each lap's "apex" as the slowest sample within ±80 m of the primary corner's apex (`brakingAnalysis.ts:5,16-17`, `throttleAnalysis.ts:5,18-19`, `findApexIndexNear` in `sampleSearch.ts:9-23`). The points each corner used in (6,7):

```text
$ inspect.ts corners        (pair (6,7), first three corners)
idx  ápice  | P:ápice  P:freada  P:retomada | C:ápice  C:freada  C:retomada | bpDiff  peakDiff  thrDiff  deltaLoss
  0    334 |   333.7     211.2      497.8 |   391.2     391.2      478.3 | -179.97     1.00    19.43      0.29
  1    399 |   333.7     211.2      497.8 |   391.2     391.2      478.3 | -179.97     1.00    19.43     -0.08
  2    492 |   486.0     470.8      497.8 |   416.3     416.3      478.3 |   54.53     0.44    19.43      0.03
```

The stored samples, 180–520 m (every row):

```text
Lap 6                                                     Lap 7
dist(m)  vel freio acel volante  sessionTime              dist(m)  vel freio acel volante  sessionTime
  207.1  331  0.00 1.00  -0.00     468.236                  223.4  332  0.00 1.00  -0.01     542.721
  211.2  331  0.17 0.83  -0.00     468.281                  227.9  331  0.15 0.89   0.00     542.769
  215.4  328  0.48 0.41  -0.00     468.326                  232.4  328  0.46 0.51   0.02     542.818
  221.4  320  0.92 0.00  -0.00     468.394                  236.8  324  0.64 0.04   0.04     542.867
  225.4  313  1.00 0.00  -0.00     468.439                  243.3  315  0.81 0.00   0.03     542.940
  ...  (brake 0.94–1.00, 300 → 179 km/h)                    ...  (brake 0.90–1.00, 308 → 207 km/h)
  296.8  168  0.89 0.00  -0.04     469.528                  304.4  198  0.89 0.00  -0.06     543.810
  305.5  149  0.70 0.00  -0.08     469.727                  315.6  180  0.71 0.00  -0.15     544.027
  314.5  131  0.51 0.12  -0.10     469.965                  327.0  164  0.41 0.00  -0.17     544.272
  324.4  118  0.30 0.27  -0.10     470.262                  341.7  147  0.39 0.00  -0.29     544.625
  329.5  115  0.13 0.31  -0.14     470.425                  355.2  131  0.29 0.00  -0.33     544.978
  333.7  114  0.12 0.33  -0.21     470.561  ← min, lap 6     365.5  118  0.16 0.00  -0.33     545.269
  338.6  114  0.04 0.41  -0.25     470.723                  370.4  113  0.08 0.00  -0.35     545.413
  343.5  116  0.00 0.48  -0.23     470.883                  375.4  110  0.00 0.00  -0.34     545.558
  372.2  131  0.00 0.59  -0.30     471.682                  386.5  105  0.00 0.05  -0.36     545.884
  393.7  133  0.00 0.41  -0.45     472.171                  391.2  104  0.00 0.35  -0.38     546.019  ← min, lap 7
  398.5  132  0.00 0.24  -0.49     472.281                  395.3  105  0.00 0.49  -0.34     546.131
  404.4  130  0.00 0.17  -0.43     472.424  ← lift dip       405.3  109  0.00 0.50  -0.07     546.412
  410.1  131  0.00 0.77  -0.30     472.571                  416.3  119  0.00 0.67  -0.01     546.725  ← "apex" of corner 492
  433.3  148  0.00 0.53   0.00     473.173                  435.9  137  0.00 0.62   0.06     547.262
  454.6  150  0.00 0.00   0.18     473.666                  458.5  150  0.00 0.45   0.28     547.828
  464.1  145  0.04 0.00   0.42     473.864                  465.1  149  0.00 0.26   0.34     547.976
  470.8  137  0.44 0.00   0.55     474.004                  469.3  149  0.00 0.50   0.37     548.067
  480.4  126  0.26 0.09   0.59     474.217                  473.7  149  0.00 0.84   0.38     548.161
  486.0  122  0.02 0.57   0.56     474.357  ← min, T2        478.3  151  0.00 1.00   0.38     548.257
  492.3  124  0.00 0.82   0.49     474.518                  488.3  153  0.00 0.99   0.31     548.472
  497.8  126  0.00 0.96   0.44     474.669                  501.2  157  0.00 0.98   0.15     548.767
```

(Abridged: the full 64 and 65 rows are `inspect.ts window 6 180 520` and `window 7 180 520`; lap 8, same command, brakes 221.2–386.5 m with a minimum of 93 km/h at 401.1 m and no braking for T2.)

- Corner 1's window (319–479 m) contains lap 6's 114 km/h at 333.7 m, which is slower than the 130 km/h dip at 404.4 m that the corner was detected on, so corner 1 uses corner 0's apex. In lap 7 both windows (254–414 and 319–479 m) contain the single minimum at 391.2 m.
- Corner 2's window in lap 7 (412–572 m) contains no minimum: lap 7 is accelerating through it, so the slowest sample is the window's first, 416.3 m (119 km/h). Lap 7 did not brake for T2 (steering right from 433 m, a throttle lift to 0.26 at 465.1 m, 149 km/h); lap 6 braked (0.44 at 470.8 m) down to 122 km/h at 486.0 m. The engine compares lap 6's T2 braking with a point of lap 7's T1 exit: **54.53 m**.

**Verdict: engine artifact** (`sampleSearch.ts:9-23` with overlapping ±80 m windows; corners 0 and 1 are 65 m apart). The same pattern appears in (6,8), with −189.82 on corners 0 and 1.

---

## 4. Braking start at the apex (observation 3)

`findBrakingStartIndex` (`sampleSearch.ts:28-34`) walks back from the apex only while the previous sample has brake > 0.1. When the brake is released before the apex, the walk stops at once and the braking start is the apex. `peakInRange` (lines 46-58) then measures the peak brake over `[apex, apex]`.

### 4.1 How often, and whether the lap had braked

Every braking phase of each lap (brake > 0.1):

```text
$ inspect.ts events
volta 6: 211.2–333.7 (pico 1.00), 470.8–480.4 (0.44), 1287.4–1399.4 (0.88), 1958.7–2042.6 (0.80), 2279.4–2360.6 (0.77), 2473.3 (0.26), 2697.0–2765.8 (0.88), 3186.8–3264.0 (1.00)
volta 7: 227.9–365.5 (1.00), 1285.6–1406.0 (0.87), 2276.5–2357.7 (0.86), 2468.2–2492.3 (0.58), 2703.0–2774.9 (0.86), 3166.5–3251.6 (0.91)
volta 8: 221.2–386.5 (1.00), 1306.0–1435.5 (0.95), 2273.3–2365.7 (1.00), 2455.4–2484.7 (0.87), 2692.4–2767.4 (0.99), 3178.3–3277.7 (0.99)
```

Per pair and per lap, how many corners have the engine's braking start on the apex, and how many of those had a braking phase ending in the 150 m before the apex:

```text
$ inspect.ts atApex
(6,7) principal (volta 6): início = ápice em 7 de 12; com freada nos 150 m antes: 7
(6,7) comparação (volta 7): início = ápice em 10 de 12; com freada nos 150 m antes: 8
(6,8) principal (volta 6): 7 de 12; 7          (6,8) comparação (volta 8): 8 de 12; 6
(7,6) principal (volta 7): 5 de 7; 4           (7,6) comparação (volta 6): 4 de 7; 4
(7,8) principal (volta 7): 5 de 7; 4           (7,8) comparação (volta 8): 4 de 7; 3
(8,6) principal (volta 8): 4 de 7; 3           (8,6) comparação (volta 6): 5 de 7; 5
(8,7) principal (volta 8): 4 de 7; 3           (8,7) comparação (volta 7): 5 de 7; 4
```

(These counts are of the points `analyzeBraking` uses. On the corner's own bounds from `detectCorners`, `brakingStartDistance` equals `apexDistance` in 10 of 12 corners of lap 6, 6 of 7 of lap 7 and 4 of 7 of lap 8, as observation 3 stated.) In most cases the lap had braked and released 5–25 m before the apex; that is how these laps were driven (the brake is off at the slowest point of T1, the hairpin at ~2,370 m, the corner at ~2,790 m and the last corner).

### 4.2 The cases the observation named

**T1, (6,7) / (6,8) index 0.** Lap 6 braked from 211.2 m, lap 7 from 227.9 m, lap 8 from 221.2 m (section 3's table; raw = stored at these points, section 1.2). The engine takes lap 6's start (211.2, its brake is still 0.12 at its apex) against lap 7's and lap 8's apexes (391.2, 401.1).

| Pair | Engine `brakingPointDiffM` | From the samples (braking onsets) |
|---|---|---|
| (6,7) idx 0 | −179.97 | 211.2 − 227.9 = **−16.7 m** |
| (6,8) idx 0 | −189.82 | 211.2 − 221.2 = **−10.0 m** |

`peakBrakeDiff` = 1.00 in both: lap 6's peak over 211.2–333.7 m is 1.00, the comparison's over [391.2, 391.2] is 0. Both laps peaked at 1.00 (lap 7 from 251.7 m, lap 8 from 275.9 m): the real difference is **0**. This is the "braked 179.97 m earlier/later" together with "braked harder (1)" of the coach texts.

**Last corner (Junção), (7,8) idx 6 and (8,6) idx 6.** Every other stored row, 3,160–3,300 m:

```text
Lap 6                               Lap 7                               Lap 8
3179.2 256 0.06 1.00                3160.3 254 0.09 0.99                3172.3 253 0.08 0.71
3194.2 247 0.70 0.43                3174.3 243 0.69 0.33                3184.2 244 0.61 0.02
3218.5 200 0.98 0.00                3199.3 200 0.86 0.00                3210.8 197 0.98 0.00
3238.9 155 0.99 0.00                3218.6 154 0.86 0.00                3230.1 159 0.83 0.00
3259.5 121 0.55 0.00                3237.2 119 0.73 0.00                3248.4 130 0.59 0.00
3269.4 111 0.00 0.00                3256.1  86 0.00 0.00                3267.7 104 0.16 0.01
3279.0 105 0.00 0.33  ← apex        3275.5  84 0.00 0.15                3277.7  97 0.16 0.00
3288.2 108 0.00 0.70                3285.3  82 0.00 0.35  (apex 3281.1) 3288.4  97 0.00 0.46
(dist, speed, brake, throttle)
```

Braking phases: lap 6 3,186.8–3,264.0 m, lap 7 3,166.5–3,251.6 m, lap 8 3,178.3–3,277.7 m. Laps 6 and 7 released the brake before their apex; lap 8 was still braking at 3,277.7 m.

| Pair | Engine | From the samples |
|---|---|---|
| (7,8) idx 6 | +102.83 (3,281.1 − 3,178.3) | 3,166.5 − 3,178.3 = **−11.8 m** (lap 7 braked earlier, not later) |
| (8,6) idx 6 | −100.70 (3,178.3 − 3,279.0) | 3,178.3 − 3,186.8 = **−8.5 m** |

**The corner at ~2,050–2,150 m, (6,7) idx 5 and (6,8) idx 5.** Every other stored row:

```text
Lap 6                               Lap 7
1944.1 287 0.00 0.98                1944.0 283 0.00 0.06
1958.7 284 0.34 0.26                1955.9 279 0.00 0.00
1981.7 253 0.78 0.00                1979.0 271 0.00 0.00
2006.9 216 0.73 0.00                2004.3 258 0.00 0.00
2031.9 185 0.43 0.00                2051.4 235 0.00 0.00
2042.6 174 0.19 0.31                2083.9 210 0.00 0.00
2053.1 173 0.00 0.61  ← apex        2104.7 191 0.00 0.00
2114.5 184 0.00 0.32                2115.4 184 0.00 0.62  ← apex
2134.8 177 0.00 0.13                2135.7 187 0.00 0.93
2144.3 174 0.00 0.46                2157.9 197 0.00 1.00
```

Lap 6 braked (1,958.7–2,042.6 m, peak 0.80); lap 7 did not brake at all — it lifted (throttle 0.00–0.06 from 1,932 to 2,105 m) and coasted down to 184 km/h; lap 8 did not brake either (`events`: no braking phase between 1,435 and 2,273 m). The engine's −156.71 (6,7) and −172.47 (6,8) compare lap 6's braking onset with the other lap's apex. **There is no braking point in laps 7 and 8 to compare with:** the difference is undeterminable from the samples, which is FR-007's `null`. The fact that only one lap braked is real; `peakBrakeDiff` 0.80 (lap 6 peak 0.80, lap 7 peak 0) is a real measurement over the two laps' own ranges here.

**Verdict: engine artifact** where the lap braked and released before the apex (`sampleSearch.ts:28-34`, and `peakInRange` over a zero-length range); **real on track** that some laps did not brake for some corners, where the engine invents a difference instead of reporting none. Not a decimation effect (section 1.2).

---

## 5. The same throttle pick-up for neighbouring corners (observation 4)

`findThrottleOnIndex` (`sampleSearch.ts:38-44`) walks forward from the apex to the first sample with throttle ≥ 0.9, with no bound. Stretches without full throttle, longer than 20 m:

```text
$ inspect.ts events
volta 6: 211.2–492.3, 1287.4–1492.1, 1951.4–2238.7, 2272.7–2589.0, 2697.0–2959.1, 3194.2–3312.5
volta 7: 227.9–473.7, 1285.6–1479.3, 1932.4–2125.7, 2258.5–2575.5, 2703.0–2904.8, 2980.4–3005.0, 3166.5–3326.9
volta 8: 213.2–474.9, 1306.0–1538.9, 1952.6–2161.3, 2280.4–2551.6, 2692.4–2897.8, 3168.1–3339.5
```

Lap 6 is below 0.9 throttle from 211.2 to 492.3 m (section 3: its maximum between T1 and T2 is 0.77 at 410.1 m), from 1,287.4 to 1,492.1 m and from 2,272.7 to 2,589.0 m. So the first full-throttle sample after the apexes at 334, 399 and 492 m really is 497.8 m; after 1,404 and 1,492 m, 1,496.5 m; after 2,375, 2,463 and 2,541 m, 2,593.0 m. In lap 7, no full throttle between the hairpin (2,368 m) and the next corner (2,496 m): both get 2,582.2 m, as in (6,7) indices 7–9 (10.81), (7,6) 3–4, (7,8) 3–4 (24.46) and (8,6) 3–4 (−35.27).

**Verdict: real on track** (the samples) **with an engine artifact in the attribution**: the pick-up after the second corner is reported as the first corner's, so a corner's "exit" can lie past the next corner's apex, and its stretch (section 2.4) overlaps the next one (lap 6: corners at 334, 399 and 492 m all end at 498 m). Not a decimation effect: decimation can move a threshold crossing by at most one stored spacing (4–5 m at these 120–160 km/h exits, where raw packets are 1.7–2.2 m apart), and the repetition across corners is the same sample whatever the spacing.

---

## 6. The number of corners, and lap 6 (observation 5, item 4)

### 6.1 No out-lap and no flashback in lap 6

```text
$ rawChecks.ts raw.json
pacotes de volta (2): 4458; de telemetria (6): 4458
primeiro pacote: t=465.989 frame=9337 overall=9637
volta  driverStatus  pitStatus  pacotes  t início   t fim     dist início  dist fim  dist mín  dist máx
    6             1          0     1487   465.989   540.274          1.7    4294.2       1.7    4294.2
    7             1          0     1482   540.321   614.352          4.0    4289.2       4.0    4289.2
    8             1          0     1468   614.429   687.788          1.7    4294.0       1.7    4294.0
    9             1          0       21   687.833   688.798          3.6      91.7       3.6      91.7
sessionTime voltando: 0; frameIdentifier voltando: 0; lapDistance voltando (>1 m, mesma volta): 0
overallFrame − frame: 300
troca 6→7 em t=540.321: lastLapTimeInMS=74306, dist 4294.2 → 4.0
troca 7→8 em t=614.429: lastLapTimeInMS=74144, dist 4289.2 → 1.7
troca 8→9 em t=687.833: lastLapTimeInMS=73372, dist 4294.0 → 3.6
```

The recording starts at lap 6's line crossing (1.7 m); lap 6 is a flying lap (`driverStatus` 1, not 3 = out lap) from its first packet, its distance only grows, `sessionTime` and `frameIdentifier` never go back, and `overallFrameIdentifier − frameIdentifier` is a constant 300 through the whole recording (a flashback inside it would change that difference). The constant 300 means a flashback, or a restart, happened *before* the recording began; nothing of it is in the recorded laps. The Time Trial out-lap is not in the recording. **Neither the out-lap nor a flashback explains lap 6's extra corners.**

### 6.2 Where the extra corners are, and why they are detected

`detectCorners` (`cornerDetection.ts:26-36`) smooths the speed (5-sample moving average), keeps local minima that pass `hasProminence` (lines 52-67) with 15 km/h, and merges minima less than 50 m apart. `hasProminence` walks left and right taking the maximum rise, **without stopping at a deeper minimum**, so a dip of 1 km/h next to a deep corner passes, because the walk crosses the deep corner and reaches the straight before it. Each lap's minima, with the rise as the engine measures it and as a topographic prominence (stopping at the first lower value):

```text
$ inspect.ts minima
               engine left/right    stopping at a lower minimum
lap 6    333.7   17.0 / 16.0          215.6 / 207.4
         398.5   17.6 / 16.2            0.6 /  17.6   ← lift dip after T1 (404.4 m, throttle 0.17)
         492.3   17.0 / 15.4           24.4 / 197.8   ← T2, braked (470.8–480.4 m)
        1403.8   17.0 / 15.8          165.6 / 129.6
        1492.1   19.0 / 15.0            1.4 / 113.2   ← lift dip (1,482.3 m, throttle 0.22)
        2053.1   19.0 / 15.8          112.6 /  38.6
        2149.4   18.2 / 15.0            9.6 /  37.8   ← lift dip (2,134.8 m, throttle 0.13)
        2375.1   16.8 / 16.0          246.8 / 239.8
        2462.7   16.6 / 15.4           10.2 / 102.2   ← lift, no braking (2,447.9 m, throttle 0.00)
        2541.0   17.6 / 18.8            5.6 /  95.0   ← lift, no braking (2,531.1 m, throttle 0.01)
        2794.9   17.6 / 15.2          124.8 / 236.6
        3279.0   16.2 / 19.2          147.2 / 216.6
lap 7    391.2, 1415.4, 2121.3, 2367.8, 2448.0 (0.6 / 0.0, merged into 2496.5), 2496.5, 2789.7, 3275.5
lap 8    401.1, 1439.8, 2144.0, 2374.5, 2490.1, 2781.1, 3283.5     (all with a true prominence above 15)
```

With a true prominence of 15 km/h on both sides, lap 6 keeps **7** corners — 334, 492, 1,404, 2,053, 2,375, 2,795, 3,279 m — and laps 7 and 8 keep the same 7 they have today. **Five of lap 6's twelve corners (399, 1,492, 2,149, 2,463, 2,541 m) are an engine artifact of `hasProminence`**: throttle lifts of 1–10 km/h.

The count then agrees, but the *set* does not: lap 6 has T1 and T2 as two corners (334 and 492 m) because it braked twice (211.2–333.7 and 470.8–480.4 m), where laps 7 and 8 take the S as one braking (227.9–365.5, 221.2–386.5 m) with a minimum at 391/401 m and only a lift for T2; and around 2,496 m, where laps 7 and 8 brake (2,468.2–2,492.3, 2,455.4–2,484.7 m, down to 97–101 km/h), lap 6 only lifted twice (2,447.9 and 2,531.1 m, down to 109 and 114 km/h) and has no corner there. **That difference is real on track** — lap 6, the invalid lap, was driven differently in those two places. Why lap 6 was invalidated is not in the data.

Because corners are detected on the primary lap only (`buildInsights.ts:24`), (A,B) and (B,A) describe different corners whenever the two laps' speed traces differ, real or not. That is a property of the design, not of these laps.

**Verdict:** five extra corners are an **engine artifact** (`cornerDetection.ts:52-67`); the remaining difference in lap 6's corner set is **real on track**; out-lap and flashback are **excluded** by the raw data. Demo impact (FR-013a): the frontend always uses the most recent lap as the primary (`Telemetry-F1/src/pages/sessionAnalysis/SessionAnalysisPage.tsx:62`, `laps[laps.length - 1]`), so the visitor only reaches (8,6) and (8,7); the texts of (6,7) and (6,8), with lap 6's twelve corners, go into the seed file and are never shown.

---

## 7. The frontend's copy of the delta algorithm (item 5)

`Telemetry-F1/src/components/chart/computeDelta.ts` (read only, frontend `main` at `9334f87`) against `src/analysis/segmentDelta.ts`, with comments removed and the sample type's name unified:

```text
$ diff <(strip frontend computeDelta.ts) <(strip backend normalizeToLapStart + interpolateElapsedAtDistance + computeDelta) && echo IDENTICAL
IDENTICAL
```

The three functions are identical today; only the comments and the type name (`CarTelemetrySample` from `@/types/rest`, `TelemetrySample` here) differ. The backend file additionally has `cornerLoss` and `deltaAtDistance`, which the frontend does not use. The chart is fed the same rows: `SessionAnalysisPage.tsx:152` calls `computeDelta(primaryData.carTelemetry, comparisonData.carTelemetry)`, and `GET /sessions/:id/laps/:lap` returns `listCarTelemetrySamplesForLap` (`sessionsRouter.ts:71`), the same function the analysis uses. So today the chart's last point is `totalDeltaS` before rounding, and its hover values carry the artifacts of section 2.2 (for example 0.28 s at the end of (6,7), against the 0.162 s the laps table shows). Any change to the series in the backend makes the copy differ (FR-020).

**Recorded at the maintainer's review (2026-10-25).** Because the copy is identical, the "Delta acumulado" chart **already shows the error today**: it ends at 0.28 s in (6,7) against the official 0.162 s, and at −0.645 s in (8,7) against −0.772 s, **0.13 s off in a pair the demo shows** (the visitor reaches (8,6) and (8,7), section 6.2). The frontend spec therefore fixes an error that is already visible, not one this feature introduces, and the dependency of FR-020 blocks publishing the demo.

---

## 8. Size of a recording cut (item 6)

The three laps' stored samples with only the fields the engine reads (telemetry: `lapDistance`, `sessionTime`, `speed`, `throttle`, `brake`, `steer`, `tyreSurfaceTemp` of four wheels; motion: `lapDistance`, `worldPosition.x`, `worldPosition.z`), plus each lap's number and official time, 2,391 + 2,391 samples (lap 9's 20 left out):

```text
$ inspect.ts cut
JSON compacto: 690431 bytes; gzip -9: 124324 bytes
JSON indentado: 1223800 bytes
```

About **690 KB** compact, **124 KB** gzipped, 1.2 MB indented. The values are stored doubles at full precision (for example `lapDistance` and `sessionTime` with 13–15 digits); whether to round them, change the layout (one array per field) or commit it compressed are plan decisions, and each changes the size. Which fields the engine reads was taken from `src/analysis/` (`grep` of the field accesses; `lineDeviation.ts` uses `worldPosition.x` and `.z` only, `tyreAnalysis.ts` `tyreSurfaceTemp` only); the plan re-checks it against the final engine.

---

## 9. Consequences for the spec and the plan

Recorded here for the design step; nothing is decided yet.

1. **FR-013's condition is not met.** The clarify session accepted lap 6's extra corners as a recorded reason only if the investigation confirmed the out-lap or a flashback. It confirms neither (section 6.1). So the extra corners are this spec's subject: five come from `hasProminence`, which a correction can address; the remaining difference (T1–T2 as two corners, no corner at ~2,496 m in lap 6) is real driving, and FR-013 then needs the plan to say how (A,B) and (B,A) describe the same corners when the laps were driven differently, or to record that as the reason. The test "extra corners only when lap 6 is the primary" of the clarify answer does not apply. The spec's FR-013, SC-006 and the related clarification were written for the other case and need an update after the maintainer reads this.
2. **Every observation with an engine-artifact verdict has a code cause** (FR-003): the start/end definition of the delta series (section 2.2), the primary lap's behaviour used as the corner's stretch (2.4), the overlapping ±80 m windows (3), the backward walk that stops at the apex and the zero-length peak range (4), the unbounded forward walk (5), and the prominence test (6.2). The parts with a real-on-track verdict (some laps did not brake for a corner; no full throttle between two corners; lap 6's different line through T1–T2 and at ~2,496 m) are not to be "fixed": FR-007 and FR-008 turn them into `null` or into the right corner's own value.
3. **`totalDeltaS`**: definitions exist that are symmetric and within about 0.02 s of the official difference (section 2.3). With the recorded preference, that favours correcting it; the plan picks the definition and states the impact on the prompt (line 14 of `coachPrompt.ts` says it is not the official difference) and on `PROMPT_VERSION`.
4. **`deltaLossS`** becomes symmetric within 0.05 s once both directions measure the same stretch (section 2.4), which is what FR-009's separation of the corner's stretch from the driver's behaviour does.
5. **Tolerances (FR-014)**: the data puts one sample at about 5 m (p95 7.6 m) and 0.09 s (p95 0.16 s); the alternatives reach 0.021 s on the total and the same-stretch losses 0.05 s. The plan fixes the numbers from these before any correction.
6. **The frontend's chart** uses the identical algorithm on the same rows (section 7); if the plan changes the series, FR-020's publishing dependency applies.
7. **Cut size**: 690 KB compact / 124 KB gzipped as measured; the plan sets the ceiling (FR-015a).

The maintainer approved the verdicts on 2026-10-25 and took five decisions for the design (spec, Clarifications, session 2026-10-25). Sections 10–15 are the research for that design.

---

## 10. The same set of corners in (A,B) and (B,A)

Decision of the maintainer: a corner is a place on the track; the pair has one set of corners whatever the primary lap. Four ways of getting there were prototyped on the recording ([evidence/cornerOptions.ts](evidence/cornerOptions.ts), nothing in `src/`); each one also uses a **corrected prominence** (the rise on each side counts only until a value lower than the minimum, section 6.2), where it uses speed minima at all.

```text
$ cornerOptions.ts
P (primary lap only, corrected prominence)
  volta 6: 7 curvas: 334, 492, 1404, 2053, 2375, 2795, 3279
  volta 7: 7 curvas: 391, 1415, 2121, 2368, 2496, 2790, 3276
  volta 8: 7 curvas: 401, 1440, 2144, 2375, 2490, 2781, 3283

par 6–7
  A (casar ≤ 40 m): 10 curvas: 334, 391, 492, 1410, 2053, 2121, 2371, 2496, 2792, 3277  | simétrico: true
  A (casar ≤ 60 m):  9 curvas: 362, 492, 1410, 2053, 2121, 2371, 2496, 2792, 3277       | simétrico: true
  A (casar ≤ 80 m):  8 curvas: 362, 492, 1410, 2087, 2371, 2496, 2792, 3277             | simétrico: true
  C (velocidade média): 6 curvas: 395, 1410, 2135, 2370, 2790, 3280                     | simétrico: true
  B (raio ≤ 100 m): 9 trechos: 370-(R49,97°) 495+(R57,56°) 1405-(R74,77°) 2120+(R80,43°) 2360+(R33,116°) 2490-(R41,148°) 2785+(R25,149°) 2990-(R97,3°) 3275-(R45,79°)
par 6–8
  A (≤ 40 / 60 / 80 m): 10 / 10 / 9 curvas
  C (velocidade média): 7 curvas: 400, 1435, 2145, 2375, 2485, 2790, 3280
  B (raio ≤ 100 m): 10 trechos: 390- 490+ 1430- 2130+ 2365+ 2490- 2785+ 2970-(R100,3°) 2985-(R99,6°) 3275-
par 7–8
  A (≤ 40 / 60 / 80 m): 7 curvas: 396, 1428, 2133, 2371, 2493, 2785, 3279
  C (velocidade média): 7 curvas: 395, 1440, 2125, 2375, 2495, 2785, 3280
  B (raio ≤ 100 m): 8 trechos: 385- 480+ 1440- 2110+ 2360+ 2490- 2780+ 3290-
```

(`B` is shown with its radius and turning angle; `+`/`−` is the sign of the curvature in the game's x/z axes, a side the design does not expose. The output with radii of 150 and 250 m, which also catch flat-out bends such as the one near 645 m, is in the script's full output.)

| Option | How | Same set both ways | Corner count (6–7 / 6–8 / 7–8) | Problem seen in the data |
|---|---|---|---|---|
| **P** | today's detection, prominence corrected, primary lap only | **no** (lap 6 differs at T1–T2 and ~2,496 m) | 7 / 7 / 7 but different places | the requirement fails |
| **A** | detect on each lap (corrected), merge apexes within a distance | yes, by construction | 10 / 10 / 7 at 40 m; 8 / 9 / 7 at 80 m | the same place is counted twice when the laps' slowest points are far apart (T1: 334 m in lap 6, 391 m in lap 7, 57 m apart); the count depends on the matching distance |
| **C** | minima of the two laps' mean speed on a common 5 m grid | yes, by construction | 6 / 7 / 7 | the mean washes out a corner where only one lap slowed (T2 and ~2,496 m in 6–7): a corner exists or not depending on the pair |
| **B** | the track's geometry: curvature of the mean path of the two laps (`worldPosition` x, z) on a 5 m grid, smoothed over 35 m; a corner is a stretch with radius ≤ 100 m and turning angle ≥ 20° | yes, by construction | **8 / 8 / 8** | thresholds tuned on one track; needs motion samples |

With the angle filter (≥ 20°), B's two 3–6° stretches near 2,970–2,990 m (a radius just under 100 m over a few metres, noise at the threshold) drop out, and the three pairs give the same **eight places**: T1 (370–390 m, left), T2 (480–495 m, right), 1,405–1,440 m, 2,110–2,130 m, the hairpin at 2,360–2,365 m, 2,490 m, 2,780–2,785 m and the last corner at 3,275–3,290 m. T1 and T2 are two corners, as on the track, whichever lap braked for T2; and 2,110–2,130 m is a corner even though laps 7 and 8 only lifted there.

**Stability on other laps of the same session.** The maintainer's local recording `session-2026-10-16T16-20-26-342Z.jsonl` (gitignored, **not published**; SHA-256 `f5f32fd1059345f6578c1e3931aa1ec5eed4d73b3b8e095036c833717269fb81`, the same session, laps 1–3) gives the same eight places in every pair. Because the recording is not published, **this check cannot be reproduced by third parties**; it supports the choice, it is not part of the feature's evidence base (which stays the published recording):

```text
$ DB_PATH=<scratch>/r005/s1620.db cornerOptions.ts places 1,2 2,3 1,3
(1,2): 8 curvas: 395- 460+ 1440- 2125+ 2360+ 2490- 2785+ 3285-
(2,3): 8 curvas: 395- 460+ 1445- 2150+ 2365+ 2480- 2780+ 3285-
(1,3): 8 curvas: 395- 465+ 1460- 2130+ 2365+ 2490- 2780+ 3285-
```

No recording of another track exists locally (the other local recordings are the same Interlagos session), so **the thresholds are validated on Interlagos only**; that is a limitation to record (FR-022), not a result.

### 10.1 The corner's stretch

Two ways of bounding a geometric corner were prototyped (`cornerOptions.ts design`, `STRETCH=open`):

- **Partition**: consecutive corners split at the point of highest mean speed (both laps) between their geometric apexes — the end of the straight, where braking for the next corner starts. Stretches are contiguous, never overlap, always numeric, and their losses add up to the total delta.
- **Trimmed**: inside the partition, from the last point before the corner where both laps were at full throttle with no brake, to the first point after it where both are again.

The trimmed stretch breaks the behaviour measurements: in (8,7) T2 is taken flat by both laps and its stretch shrinks to the apex's neighbourhood; in (6,7) T2's stretch (485–505 m) cuts out lap 6's braking at 470.8 m; and because the stretch ends where the *slower* lap reaches full throttle, the faster lap's pick-up falls at or outside the bound, so `throttleOnDiffM` comes out `null` in most corners. The partition does not have these problems; its cost is that a corner's loss includes the straight after it (the exit's effect on the straight, which is how the time is actually lost), and the first corner's stretch starts at the line.

### 10.2 The prototype end to end (partition stretch)

Each lap's behaviour measured inside the stretch: slowest point, braking start (the start of the last braking phase, brake > 0.1, before the slowest point; "não" = the lap did not brake in this stretch), full-throttle pick-up after the slowest point ("não" = it did not reach 0.9 before the stretch ends), and the loss with the alternative-2 series (section 12) at the two bounds:

```text
$ cornerOptions.ts design                (8,6) and (8,7), the pairs the demo shows
(8,6) — 8 curvas; total alt2: -0.923
ápice geom.  trecho        | A: vel.mín@dist  freada  retomada | B: vel.mín@dist  freada  retomada | bpDiff  thrDiff  deltaLoss
   390-        5–455       |   93@401     221.2      não |  114@334     211.2      não |   10.0     null    -0.003
   490+      455–1285      |  139@455       não    480.4 |  122@486     470.8    497.8 |   null    -17.4    -0.815
  1430-     1285–1950      |  127@1435   1306.0   1543.9 |  155@1404   1287.4   1496.5 |   18.7     47.5     0.313
  2130+     1950–2270      |  206@2138      não   2167.6 |  172@2048   1958.7   2244.4 |   null    -76.8    -0.926
  2365+     2270–2435      |   76@2375   2273.3      não |   82@2375   2279.4      não |   -6.1     null     0.041
  2490-     2435–2690      |   96@2485   2455.4   2557.7 |  109@2458      não   2593.0 |   null    -35.3    -0.216
  2785+     2690–3170      |   80@2777   2692.4   2903.1 |   84@2795   2697.0   2965.5 |   -4.5    -62.4     0.177
  3275-     3170–4290      |   95@3283   3178.3   3345.3 |  105@3279   3186.8   3318.2 |   -8.5     27.0     0.505
soma dos deltaLoss: -0.924
(8,7) — 8 curvas; total alt2: -0.751
   385-        5–475       |   93@401     221.2      não |  104@391     227.9      não |   -6.7     null     0.246
   480+      475–1285      |  147@480       não    480.4 |  151@478       não    478.3 |   null      2.1    -0.072
  1440-     1285–1930      |  127@1435   1306.0   1543.9 |  135@1411   1285.6   1485.9 |   20.4     58.1     0.196
  2110+     1930–2270      |  206@2138      não   2167.6 |  184@2115      não   2131.4 |   null     36.1    -0.245
  2360+     2270–2435      |   76@2375   2273.3      não |   77@2368   2276.5      não |   -3.2     null    -0.036
  2490-     2435–2690      |   96@2485   2455.4   2557.7 |   97@2496   2468.2   2582.2 |  -12.8    -24.5    -0.244
  2780+     2690–3160      |   80@2777   2692.4   2903.1 |   74@2790   2703.0   2910.9 |  -10.6     -7.8     0.251
  3290-     3160–4285      |   95@3283   3178.3   3345.3 |   82@3281   3166.5   3331.7 |   11.8     13.5    -0.846
soma dos deltaLoss: -0.751
```

The reverse pairs (6,8), (7,8), (7,6) print the same rows with every difference and loss negated **exactly** (to the printed digit), and the losses add up to the total in every pair. The braking differences are the ones read off the samples in section 4 (T1 −16.6 / −10.0 / −6.7 m, last corner −8.5 / +11.8 / +20.3 m), the 100–190 m values are gone, and the corners where one lap did not brake show it instead of a number. With these insights the demo's opportunities would be, for (8,6): 3,275 m (+0.51 s), 1,430 m (+0.31 s), 2,785 m (+0.18 s); for (8,7): 2,780 m (+0.25 s), 385 m (+0.25 s), 1,440 m (+0.20 s) — a preview from the prototype, not the implementation's numbers.

### 10.3 Without motion samples

B needs `worldPosition` for both laps. `buildInsights` treats motion as optional today (line deviation is skipped without it). In every recording read here, motion and car telemetry are stored by the same pipeline with identical counts per lap (2,411 / 2,411; 2,929 / 2,929 for laps 1–4 of the local recording, 1,025 / 772 / 759 / 373 per lap). Options for a lap without motion: no corners (only the total delta), or option C as a fallback (symmetric, but a second definition to test). See the plan.

---

## 11. "Did not brake" against "could not be determined"

Section 4 and the prototype show that one lap lifting where the other brakes is common: T2 (laps 7 and 8), 2,050–2,150 m (laps 7 and 8), ~2,490 m (lap 6). Likewise "no full throttle before the next corner" is a fact (T1, the hairpin, in every lap). These are facts read from the samples, different from a value that cannot be determined (a lap's samples missing in the stretch, for example a lap cut short near the line).

| Option | Contract | Coach reading (spec 004) | Cost |
|---|---|---|---|
| **N** — keep only `null` | no change | `null` is omitted, as today | the coach never learns that a lap did not brake; "only lifted" — the main finding at T2 — is invisible |
| **F** — add per-lap booleans `brakedPrimary`/`brakedComparison` in `braking`, `fullThrottlePrimary`/`fullThrottleComparison` in `throttle`: `true`/`false` as the samples show, `null` when undeterminable; the differences stay `number \| null` | additive fields, the same pattern as `trailBrakingPrimary/Comparison` | new phrases: "a volta principal não freou nesta curva (só tirou o pé); a de comparação freou", "não voltou ao acelerador pleno antes da próxima curva" | small; the frontend mirrors four optional fields |
| **S** — a status per difference (`brakingPoint: { status: "measured" \| "primaryDidNotBrake" \| …, diffM }`) | replaces `brakingPointDiffM` and `throttleOnDiffM` (breaking change) | one phrase per status | renames two fields the frontend types; larger diff for the same information |

---

## 12. `totalDeltaS` and `deltaLossS`: the chosen series

Decision of the maintainer: alternative 2 of section 2.3 — each lap's elapsed time counted from its start **extrapolated to 0 m** from its first two samples, both laps interpolated on the same distances and the total taken at the **last distance both cover**; alternative 3 (the game's lap start) is rejected because the samples do not store `currentLapTimeInMS`. Errors against the official difference: 0.011, 0.010 and 0.021 s; symmetric by construction.

With the series evaluated for both laps on the same distances (instead of the primary lap's samples against an interpolated comparison), `deltaLossS` over a common stretch is the exact negative in the reverse pair (section 10.2), not only within 0.05 s as with today's series on the same stretch (section 2.4). Consequence for the frontend: its chart (identical copy, section 7) has to change too, and with the partition stretch the highlighted corner (`brakingStartDistance`–`exitDistance`) becomes the corner's whole stretch.

---

## 13. The recording cut: precision and size

Every stored value the engine reads is an exact float32 (the game sends `float`; `speed` and tyre temperatures are integers):

```text
$ inspect.ts cut
  telemetry.lapDistance: 2391 valores, float32 exatos 2391, mín 1.688, máx 4294.174
  telemetry.sessionTime: 2391 valores, float32 exatos 2391, mín 465.989, máx 687.788
  telemetry.speed: inteiros 2391; throttle, brake, steer: float32 exatos 2391
  telemetry.tyreSurfaceTemp.*: inteiros 2391 (93 °C constante nesta gravação)
  motion.lapDistance, x, z: float32 exatos 2391
JSON compacto: 690431 bytes; gzip -9: 124324 bytes
9 algarismos significativos (float32 sem perda): JSON 600523 bytes; gzip -9 100756 bytes
por domínio: dist e posição 3 casas, tempo 4, pedais e volante 4: JSON 548948 bytes; gzip -9 75573 bytes
9 algarismos devolve o float32 exato em toda a telemetria: true
```

Nine significant digits are the shortest decimal form that gives back every float32 exactly (checked over the whole telemetry), so the real precision of the data costs **600,523 bytes** (101 KB gzipped, which is roughly what git stores). Rounding by domain saves another 52 KB but changes values the engine reads (for example `sessionTime` to 0.1 ms, coarser than its float32 step of 61 µs at 512–1,024 s).

---

## 14. Tolerances (FR-014), fixed before the correction

From section 1.1 (median 0.09 s and 5 m between stored samples) and the constructions above:

| Property | Tolerance | Why |
|---|---|---|
| Same set of corners in (A,B) and (B,A) | identical (count and apex distances) | the definition is symmetric by construction (section 10); a difference is a defect |
| Every difference and `deltaLossS`, (A,B) + (B,A) | 0.01 + 1e-9 | exact by construction; 0.01 absorbs one `round2` step at a rounding boundary, 1e-9 its binary representation — the same rule as `insightsMatch` (spec 003) |
| `totalDeltaS` against the official difference | 0.045 s | half the median time between stored samples (0.09 s): an instant cannot be located better than that; the chosen definition errs by at most 0.021 s |
| `totalDeltaS`, (A,B) + (B,A) | 0.01 + 1e-9 | as above |

These numbers are fixed now, before the implementation, and are not widened afterwards (FR-014).

---

## 15. Alternatives considered and rejected

- **Corners by option A, C or P** (section 10): A counts one place twice and depends on a matching distance; C makes a corner exist or not depending on the pair; P fails the requirement.
- **Trimmed stretch** (section 10.1): breaks the behaviour measurements.
- **Alternative 3 for `totalDeltaS`** (section 12): needs a field the samples do not store.
- **Removing `totalDeltaS`**: not needed; a definition within 0.021 s exists (the preference recorded at the clarify session).
- **Cut rounded by domain** (section 13): smaller, but not the data the engine reads.
- **A gap rule per measurement** (a value `null` when the sample next to the measured point is more than some distance away): rejected on 2026-10-25 by the maintainer. A lap's values for a corner are `null` only when the lap has no sample in the stretch; gaps inside the stretch are tolerated, since the largest interval in the recording is 10 m (section 1.1), normal for the 4 m decimation.

**Future work, outside this spec**: a quality check at the level of the whole lap — mark a lap as incomplete when it has gaps between stored samples above a limit (for example from UDP packet loss, as in a `--speed=max` replay), so that no measurement is interpolated across a large gap. The limit, where the flag is stored and how the analysis and the coach treat an incomplete lap are that work's decisions.

**Future work, outside this spec** (recorded at M1, 2026-10-25): a fixed corner map per track, instead of corners found from the two laps compared. The geometric apex comes from the mean path of the pair, so the same corner reads a few metres differently from pair to pair (in (8,6) and (8,7): 390/385, 1430/1440, 2130/2110, 2785/2780 and 3275/3290 m). The map would also be the place to revalidate the geometry thresholds (radius, turning angle) on other tracks.

---

## Implementation evidence

### Vacuous universal properties (T019)

Against the zero-corner stub of T018, three cut properties (same corners both ways, contiguous stretches, antisymmetry corner by corner) passed, because "for every corner" over an empty set is true. They were first seen failing by running them against the commit-5 engine. The fix, decided on 2026-10-25: each of them first requires 8 corners in every pair (`requireCorners`), and a test shows the precondition refuses an empty set. Checked without `git stash`: with `detectCorners` replaced in memory by `() => []`, the cut tests for the three properties and the precondition test all fail on their assertions (`esperava 8 curvas, veio 0`); with the real engine, 237/237 pass. The rule is in the header of tasks.md.

### CI runs

The workflow runs only on `pull_request` to `main` and on push to `main`, so a branch push alone starts nothing; the first run began when the draft pull request (#14) was opened.

| Push | Head SHA | Run id | Event | `typecheck` | `test` |
|---|---|---|---|---|---|
| first push, commits 3–7 | `914369b` | 40199241345 | pull_request | completed / success | completed / success |
| second push, commits 8–9 | `b731024` | 40205712400 | pull_request | completed / success | completed / success |

### Pick-up search (T023)

The full-throttle pick-up is searched from the slowest sample on, the slowest sample included, as the research prototype did (section 10.2); data-model.md was corrected to say so.

### Implementation evidence — the six pairs after

Recorded on 2026-10-25 at `b731024`, no paid call (`npm run analyze` makes none).

```text
$ node -r dotenv/config -e "console.log(Boolean(process.env.ANTHROPIC_API_KEY))"      # DOTENV_CONFIG_PATH = scratch keyless.env
false
$ DB_PATH=<scratch>/after2.db node -r ts-node/register evidence/buildResearchDb.ts recordings/demo-interlagos-tt-20hz-laps6-8.jsonl <scratch>/raw-after2.json
sha256 da gravação: c41bdfaf7ff0feb40702875b15031654742de5fdb10ea3a05c0a21f1ac70b033
pacotes lidos: 13960; descartados: 0
car_telemetry_samples: lap 6 797, lap 7 801, lap 8 793, lap 9 20  (the counts of section 0)
$ DB_PATH=<scratch>/after2.db npm run analyze -- 1 <a> <b> > <scratch>/after/analyze-<a>-<b>.txt      # the six ordered pairs of 6, 7, 8
$ PROMPT_VERSION printed by every run: 47c613f401ab8f43
```

`totalDeltaS` against the official difference (tolerance 0.045 s, FR-014; unchanged):

| Pair | `totalDeltaS` | Official | Error | Sum of the corners' `deltaLossS` |
|---|---|---|---|---|
| (6,7) | 0.17 | 0.162 | 0.008 | 0.17 |
| (7,6) | −0.17 | −0.162 | 0.008 | −0.17 |
| (6,8) | 0.92 | 0.934 | 0.014 | 0.93 |
| (8,6) | −0.92 | −0.934 | 0.014 | −0.93 |
| (7,8) | 0.75 | 0.772 | 0.022 | 0.75 |
| (8,7) | −0.75 | −0.772 | 0.022 | −0.75 |

The largest |sum| of opposite pairs (every `deltaLossS`, braking, peak and throttle difference, and `totalDeltaS`) over the six outputs is 0.0000: the reverse pairs are exact negatives, and the same 8 corners (same apexes) appear in all six. The losses add up to `totalDeltaS` within one `round2` step (0.01), the rounding of eight terms.

Corners (apex; stretch), the booleans (A braked / B braked; A full throttle / B full throttle), the differences and the loss, for the three unordered pairs in the direction (6,7), (6,8), (8,7) (the others are their negatives):

```text
(6,7)  apex   stretch     brk  Δbrake  Δpeak   thr  Δthrottle  loss
        370     5–455     T/T  −16.63   0.00   F/F      null    0.24
        495   455–1275    T/F    null   0.44   T/T     19.43    0.76
       1405  1275–1930    T/T    1.71   0.01   T/T     10.60   −0.12
       2120  1930–2270    T/F    null   0.80   T/T    112.93    0.68
       2360  2270–2430    T/T    2.88  −0.09   F/F      null   −0.09
       2490  2430–2695    F/T    null  −0.58   T/T     10.81   −0.02
       2785  2695–3160    T/T   −6.05   0.02   T/T     54.60    0.07
       3275  3160–4285    T/T   20.27   0.09   T/T    −13.48   −1.35
(6,8)   390     5–455     T/T   −9.97   0.00   F/F      null    0.00
        490   455–1285    T/F    null   0.44   T/T     17.38    0.81
       1430  1285–1950    T/T  −18.68  −0.07   T/T    −47.49   −0.31
       2130  1950–2270    T/F    null   0.80   T/T     76.80    0.93
       2365  2270–2435    T/T    6.05  −0.23   F/F      null   −0.04
       2490  2435–2690    F/T    null  −0.87   T/T     35.27    0.22
       2785  2690–3170    T/T    4.53  −0.12   T/T     62.40   −0.18
       3275  3170–4290    T/T    8.47   0.01   T/T    −27.03   −0.50
(8,7)   385     5–475     T/T   −6.66   0.00   F/F      null    0.25
        480   475–1285    F/F    null   0.00   T/T      2.05   −0.07
       1440  1285–1930    T/T   20.39   0.08   T/T     58.09    0.20
       2110  1930–2270    F/F    null   0.00   T/T     36.13   −0.25
       2360  2270–2435    T/T   −3.17   0.14   F/F      null   −0.04
       2490  2435–2690    T/T  −12.83   0.28   T/T    −24.46   −0.24
       2780  2690–3160    T/T  −10.58   0.14   T/T     −7.80    0.25
       3290  3160–4285    T/T   11.80   0.09   T/T     13.54   −0.85
```

The three opportunities the coach is shown, per pair: (6,7) 495 m (+0.76 s), 2,120 m (+0.68 s), 370 m (+0.24 s); (7,6) 3,275 m (+1.35 s), 1,405 m (+0.12 s), 2,360 m (+0.09 s); (6,8) 2,130 m (+0.93 s), 490 m (+0.81 s), 2,490 m (+0.22 s); (8,6) 3,275 m (+0.50 s), 1,430 m (+0.31 s), 2,785 m (+0.18 s); (7,8) 3,290 m (+0.85 s), 2,110 m (+0.25 s), 2,490 m (+0.24 s); (8,7) 385 m (+0.25 s), 2,780 m (+0.25 s), 1,440 m (+0.20 s).

Against the prototype's preview (section 10.2) and the research values (sections 4 and 5):

- Corners, stretches and apexes: the same 8 in the same places, to the printed digit (the prototype's (8,6) and (8,7) tables).
- Braking differences: T1 −16.6 / −10.0 / −6.7 m and last corner −8.5 / +11.8 / +20.3 m as in section 4; the 100–190 m values are gone; "did not brake" shows as `false` with a `null` difference (the 495 m and 2,120 m corners of (6,7), where lap 7 did not brake; the 2,490 m corner). Throttle: the 2,490 m corner's 10.81 m, and no full throttle for lap 6 at the 2,360 m hairpin, as in section 5.
- Losses: the prototype's, to the second decimal, except two rounding cases. (8,6) 3,275 m is 0.50 here against 0.505 in the preview (the preview printed three decimals; the implementation rounds to two, and 0.505 falls on a `round2` boundary, within the 0.01 tolerance). (8,7): 385 m and 2,780 m both read +0.25 s here, against 0.246 and 0.251 in the preview, so the opportunity rule, which orders the rounded `deltaLossS` and breaks ties by corner order (spec 004, unchanged), lists 385 m first; the preview listed 2,780 m first because it ordered the unrounded values. Neither case is a defect of the engine or a widened tolerance; both are explained by the printed precision.
- `totalDeltaS`: 0.008–0.022 s from the official difference, inside the 0.045 s tolerance; the prototype's alternative 2 was within 0.021 s (section 12). The 0.022 s of (7,8) and (8,7) is 0.001 s above the prototype's bound, from the `round2` of the total (0.75 against 0.772), still far inside the tolerance.

### Implementation evidence — coverage

| Requirement | Met by |
|---|---|
| FR-001–FR-005, SC-001 | research.md sections 1–6 and "Summary of verdicts": verdict per observation; FR-005: the temporary database holds 2,411 car telemetry and 2,411 motion samples (laps 6–8 plus the 20 of lap 9; section 0), never `data/telemetry.db` |
| FR-006, SC-002 | `src/analysis/cornerBehaviour.ts` (points measured inside `[from, to)`), `brakingAnalysis.test.ts` ("duas curvas vizinhas medem cada uma a sua própria freada"), `recordingCut.test.ts` ("nenhuma curva divide a mesma amostra…") |
| FR-007, SC-003 | `cornerBehaviour.ts`, `brakingAnalysis.ts`; `cornerBehaviour.test.ts` (braking start, two phases, still braking at the slowest point, no braking), `brakingAnalysis.test.ts` ("com o freio solto 30 m antes…", "uma volta que só tirou o pé não freou…"), `recordingCut.test.ts` ("a freada de cada volta em cada curva bate com as amostras…", "os casos da pesquisa (seção 4)") |
| FR-008 | `cornerBehaviour.ts`, `throttleAnalysis.ts`; `cornerBehaviour.test.ts` (pick-up inside the stretch), `throttleAnalysis.test.ts` ("a retomada de outra curva, depois do fim do trecho, não vira a desta"), `recordingCut.test.ts` ("os casos da pesquisa (seção 5)") |
| FR-009, SC-004a | `cornerDetection.ts` (`cornerStretches`: stretch bounds), `types.ts`; `cornerDetection.test.ts` ("os trechos são contíguos…"), `recordingCut.test.ts` ("os trechos das curvas têm limites numéricos, contíguos…"); the names `brakingStartDistance`/`exitDistance` kept (O5), documented in contracts/insights.md, README and CLAUDE.md |
| FR-010 | `null` in `cornerBehaviour.ts`/`brakingAnalysis.ts`/`throttleAnalysis.ts`; tests "sem amostras no trecho…", "uma volta sem amostra no trecho devolve null…" |
| FR-011, FR-011a, SC-004 | `segmentDelta.ts` (`cornerLoss`, `totalDelta`); `segmentDelta.test.ts`, `recordingCut.test.ts` ("curva a curva, toda diferença e deltaLossS…", "totalDeltaS de (A,B) mais o de (B,A)…"), `brakingAnalysis.test.ts`/`throttleAnalysis.test.ts` ("trocar as voltas inverte…"); `deltaLossS` findings in research.md section 2.4 |
| FR-012, SC-005 | `segmentDelta.ts` (`totalDelta`), `buildInsights.ts`; `recordingCut.test.ts` ("totalDeltaS fica a 0,045 s da diferença oficial nos seis pares"); table above |
| FR-013, SC-006 | `trackGeometry.ts`, `cornerDetection.ts`; `trackGeometry.test.ts`, `cornerDetection.test.ts`, `recordingCut.test.ts` ("(A,B) e (B,A) têm as mesmas curvas…"); the prominence-based detection is removed |
| FR-013a | research.md section 6.2, verdict paragraph ("Demo impact (FR-013a)") |
| FR-014 | tolerances in section 14, not widened (every cut property uses them; `recordingCut.test.ts`) |
| FR-015, SC-007 | synthetic tests in `src/analysis/*.test.ts` with `testFixtures.ts` (`makeLapOnPath`, `makePath`); `promptVersion.test.ts` ("mudar só os valores do motor não muda a versão (SC-007)") |
| FR-015a–c, SC-006a | `src/analysis/recordingCut.json`, `recordingCutFormat.ts`, `tools/exportRecordingCut.ts`; `recordingCut.test.ts` (hash, laps, ceiling 660,000 bytes: 643,689), regenerated twice into two databases, byte-identical (tasks T009); the exception written in CLAUDE.md (Rules) and README |
| FR-016 | contracts/insights.md (four added fields, the changed meanings, the HTTP status change); no field removed or renamed |
| FR-017 | `promptVersion.ts`, `promptVersion.test.ts`; `PROMPT_VERSION` changed only by the prompt text, the new reading phrases and the reference inputs (`47c613f401ab8f43`) |
| FR-018, SC-004b | `insightsMatch.ts`, `analysisStaleness.ts`, `analysisResolver.ts`; `analysisStaleness.test.ts`, `analysisResolver.test.ts`; the demo's seed side is spec 003's (it imports `insightsMatch` from `main` when updated) |
| FR-019 | the before (sections 2.4, 4, 10) and this section; the seed file is spec 003's |
| FR-020, FR-020a, SC-007a | research.md section 7; the dependency note in spec 003's tasks is T051 (pending) |
| FR-021, SC-008 | every dotenv-loading command ran with the keyless file after a `false` check; `git grep telemetry.db -- src tools` finds only the path resolution, comments and the refusals of the export tool and `testDb.ts`; no test calls the coach (fakes only) |
| FR-022 | README and CLAUDE.md changed in the commit of each behaviour (commits 3–9); re-read in commit 10 |

### Implementation evidence — the six pairs after (reading order)

At the M1 review (2026-10-25) the maintainer asked that the "Acelerador pleno" phrase be read in the throttle slot of the opportunity, after the trail braking phrase, so that each opportunity follows the order of the corner (T066–T067). The change is in `opportunityBlock` only; `REFERENCE_INPUTS` needed no adjustment (the template-coverage test passes), and `PROMPT_VERSION` changed through the builder: `47c613f401ab8f43` → `0cb0df9eaefa147e`.

The six messages were generated again (same temporary database, same commands as above, keyless check `false`; outputs in `<scratch>/after2/`) and compared with `<scratch>/after/` by a script that drops the ts-node-dev start line and the version value, then requires: the same number of lines, the same lines (as multisets), the lines other than "Acelerador pleno" in the same order, and counts the pairs where the phrase moved. Result for all six pairs: the same lines, the rest in the same order; the phrase appears in (6,7), (7,6) and (8,7) and moved in each of them (it is absent from the top three opportunities of (6,8), (7,8) and (8,6)). Nothing else differs: the insights, the opportunities and their numbers are those of the table above.

Open until later tasks: SC-007a (T051–T053), the readings of the six messages (T055) and the token count (T056).
