import { buildCarTelemetryPacket, buildLapDataPacket, buildMotionPacket, type HeaderFields } from "../replay/testFixtures";
import type { DemoPacket } from "./recording";

export interface DemoRecordingFixture {
  packets: DemoPacket[];
  sessionUID: bigint;
  completedLaps: number[];
  lapTimesMs: Map<number, number>;
}

const TICKS_PER_LAP = 5;
const SECTOR1_MS = 20000;
const SECTOR2_MS = 25000;

/**
 * Gravação sintética do modo demo: pacotes binários de verdade (lap data,
 * motion e car telemetry do mesmo builder de src/replay/testFixtures.ts),
 * `laps` voltas completas e um último pacote que abre a volta seguinte, cada
 * pacote com um receivedAt crescente (50 ms entre eles). Cada volta tem
 * 5 ticks espaçados de 4 m, o limiar de decimação, então todos viram
 * amostras. O primeiro pacote de cada volta nova traz o lastLapTimeInMS da
 * anterior, que é o que fecha a volta no lapCompletionDetector.
 */
export function buildDemoRecording(options: { sessionUID: bigint; laps: number; firstReceivedAt?: number }): DemoRecordingFixture {
  const { sessionUID, laps } = options;
  const firstReceivedAt = options.firstReceivedAt ?? 1792168223797;
  const packets: DemoPacket[] = [];
  const lapTimesMs = new Map<number, number>();
  let frame = 1;

  const push = (data: Buffer) => {
    const index = packets.length;
    packets.push({ timestampMs: index * 50, receivedAt: firstReceivedAt + index * 50, data });
  };

  for (let lap = 1; lap <= laps + 1; lap += 1) {
    const previousLapTime = lapTimesMs.get(lap - 1) ?? 0;
    const ticks = lap <= laps ? TICKS_PER_LAP : 1;
    for (let i = 0; i < ticks; i += 1) {
      const header: HeaderFields = { packetId: 2, sessionTime: frame / 10, frameIdentifier: frame, overallFrameIdentifier: frame, sessionUID };
      const lapDistance = i * 4;
      push(
        buildLapDataPacket({
          header,
          currentLapNum: lap,
          lapDistance,
          currentLapTimeInMS: i * 1000,
          sector1TimeMSPart: lap <= laps ? SECTOR1_MS : 0,
          sector1TimeMinutesPart: 0,
          sector2TimeMSPart: lap <= laps ? SECTOR2_MS : 0,
          sector2TimeMinutesPart: 0,
          currentLapInvalid: 0,
          carPosition: 1,
          lastLapTimeInMS: i === 0 ? previousLapTime : 0,
        })
      );
      if (lap <= laps) {
        push(buildMotionPacket({ ...header, packetId: 0 }, lapDistance));
        push(buildCarTelemetryPacket({ ...header, packetId: 6 }));
      }
      frame += 1;
    }
    if (lap <= laps) lapTimesMs.set(lap, 63000 + lap * 100);
  }

  return { packets, sessionUID, completedLaps: Array.from({ length: laps }, (_, i) => i + 1), lapTimesMs };
}
