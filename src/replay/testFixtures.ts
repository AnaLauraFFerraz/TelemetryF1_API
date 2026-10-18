import {
  HEADER_SIZE,
  NUM_CARS,
  LAP_DATA_PACKET_SIZE,
  LAP_DATA_CAR_SIZE,
  MOTION_PACKET_SIZE,
  MOTION_CAR_SIZE,
  CAR_TELEMETRY_PACKET_SIZE,
  CAR_TELEMETRY_CAR_SIZE,
} from "../telemetry/shared/constants";
import { RecordedPacket } from "./types";

/**
 * Escreve campos sequencialmente num Buffer, no sentido contrário de
 * BufferCursor (src/telemetry/shared/BufferCursor.ts): a ordem/tamanho de
 * cada write aqui precisa bater exatamente com a ordem/tamanho de leitura
 * dos parsers reais, senão os parsers leem lixo ou assertBytesRead falha.
 * Só usado por fixtures de teste - não é código de produção.
 */
class WriteCursor {
  private offset: number;

  constructor(private readonly buffer: Buffer, startOffset = 0) {
    this.offset = startOffset;
  }

  writeUInt8(value: number): void {
    this.buffer.writeUInt8(value, this.offset);
    this.offset += 1;
  }

  writeUInt16LE(value: number): void {
    this.buffer.writeUInt16LE(value, this.offset);
    this.offset += 2;
  }

  writeUInt32LE(value: number): void {
    this.buffer.writeUInt32LE(value, this.offset);
    this.offset += 4;
  }

  writeFloatLE(value: number): void {
    this.buffer.writeFloatLE(value, this.offset);
    this.offset += 4;
  }

  writeBigUInt64LE(value: bigint): void {
    this.buffer.writeBigUInt64LE(value, this.offset);
    this.offset += 8;
  }

  skip(bytes: number): void {
    this.offset += bytes;
  }
}

const SESSION_UID = 42n;
const PLAYER_CAR_INDEX = 0;

interface HeaderFields {
  packetId: number;
  sessionTime: number;
  frameIdentifier: number;
  overallFrameIdentifier: number;
}

function writeHeader(cursor: WriteCursor, fields: HeaderFields): void {
  cursor.writeUInt16LE(2024); // packetFormat
  cursor.writeUInt8(24); // gameYear
  cursor.writeUInt8(1); // gameMajorVersion
  cursor.writeUInt8(0); // gameMinorVersion
  cursor.writeUInt8(1); // packetVersion
  cursor.writeUInt8(fields.packetId);
  cursor.writeBigUInt64LE(SESSION_UID);
  cursor.writeFloatLE(fields.sessionTime);
  cursor.writeUInt32LE(fields.frameIdentifier);
  cursor.writeUInt32LE(fields.overallFrameIdentifier);
  cursor.writeUInt8(PLAYER_CAR_INDEX);
  cursor.writeUInt8(255); // secondaryPlayerCarIndex: nenhum segundo jogador
}

interface SyntheticLapDataTick {
  header: HeaderFields;
  currentLapNum: number;
  lapDistance: number;
  currentLapTimeInMS: number;
  sector1TimeMSPart: number;
  sector1TimeMinutesPart: number;
  sector2TimeMSPart: number;
  sector2TimeMinutesPart: number;
  currentLapInvalid: 0 | 1;
  carPosition: number;
  lastLapTimeInMS: number;
}

function buildLapDataPacket(tick: SyntheticLapDataTick): Buffer {
  const buffer = Buffer.alloc(LAP_DATA_PACKET_SIZE);
  const cursor = new WriteCursor(buffer);
  writeHeader(cursor, tick.header);

  for (let car = 0; car < NUM_CARS; car += 1) {
    if (car !== PLAYER_CAR_INDEX) {
      cursor.skip(LAP_DATA_CAR_SIZE); // outros carros: tudo zero, não usado pelo teste
      continue;
    }
    cursor.writeUInt32LE(tick.lastLapTimeInMS);
    cursor.writeUInt32LE(tick.currentLapTimeInMS);
    cursor.writeUInt16LE(tick.sector1TimeMSPart);
    cursor.writeUInt8(tick.sector1TimeMinutesPart);
    cursor.writeUInt16LE(tick.sector2TimeMSPart);
    cursor.writeUInt8(tick.sector2TimeMinutesPart);
    cursor.writeUInt16LE(0); // deltaToCarInFrontMSPart
    cursor.writeUInt8(0); // deltaToCarInFrontMinutesPart
    cursor.writeUInt16LE(0); // deltaToRaceLeaderMSPart
    cursor.writeUInt8(0); // deltaToRaceLeaderMinutesPart
    cursor.writeFloatLE(tick.lapDistance);
    cursor.writeFloatLE(tick.lapDistance); // totalDistance
    cursor.writeFloatLE(0); // safetyCarDelta
    cursor.writeUInt8(tick.carPosition);
    cursor.writeUInt8(tick.currentLapNum);
    cursor.writeUInt8(0); // pitStatus
    cursor.writeUInt8(0); // numPitStops
    cursor.writeUInt8(0); // sector
    cursor.writeUInt8(tick.currentLapInvalid);
    cursor.writeUInt8(0); // penalties
    cursor.writeUInt8(0); // totalWarnings
    cursor.writeUInt8(0); // cornerCuttingWarnings
    cursor.writeUInt8(0); // numUnservedDriveThroughPens
    cursor.writeUInt8(0); // numUnservedStopGoPens
    cursor.writeUInt8(1); // gridPosition
    cursor.writeUInt8(4); // driverStatus: na pista
    cursor.writeUInt8(2); // resultStatus: ativo
    cursor.writeUInt8(0); // pitLaneTimerActive
    cursor.writeUInt16LE(0); // pitLaneTimeInLaneInMS
    cursor.writeUInt16LE(0); // pitStopTimerInMS
    cursor.writeUInt8(0); // pitStopShouldServePen
    cursor.writeFloatLE(0); // speedTrapFastestSpeed
    cursor.writeUInt8(255); // speedTrapFastestLap: não definido
  }

  cursor.writeUInt8(255); // timeTrialPBCarIdx
  cursor.writeUInt8(255); // timeTrialRivalCarIdx

  return buffer;
}

function buildMotionPacket(header: HeaderFields, lapDistance: number): Buffer {
  const buffer = Buffer.alloc(MOTION_PACKET_SIZE);
  const cursor = new WriteCursor(buffer);
  writeHeader(cursor, header);

  for (let car = 0; car < NUM_CARS; car += 1) {
    if (car !== PLAYER_CAR_INDEX) {
      cursor.skip(MOTION_CAR_SIZE);
      continue;
    }
    cursor.writeFloatLE(lapDistance); // worldPosition.x - usa a mesma distância só pra ter um valor não-zero
    cursor.writeFloatLE(0);
    cursor.writeFloatLE(0);
    cursor.writeFloatLE(0); // worldVelocity x/y/z
    cursor.writeFloatLE(0);
    cursor.writeFloatLE(0);
    cursor.writeUInt16LE(0); // worldForwardDir x/y/z (int16)
    cursor.writeUInt16LE(0);
    cursor.writeUInt16LE(0);
    cursor.writeUInt16LE(0); // worldRightDir x/y/z (int16)
    cursor.writeUInt16LE(0);
    cursor.writeUInt16LE(0);
    cursor.writeFloatLE(0); // gForceLateral
    cursor.writeFloatLE(0); // gForceLongitudinal
    cursor.writeFloatLE(0); // gForceVertical
    cursor.writeFloatLE(0); // yaw
    cursor.writeFloatLE(0); // pitch
    cursor.writeFloatLE(0); // roll
  }

  return buffer;
}

function buildCarTelemetryPacket(header: HeaderFields): Buffer {
  const buffer = Buffer.alloc(CAR_TELEMETRY_PACKET_SIZE);
  const cursor = new WriteCursor(buffer);
  writeHeader(cursor, header);

  for (let car = 0; car < NUM_CARS; car += 1) {
    if (car !== PLAYER_CAR_INDEX) {
      cursor.skip(CAR_TELEMETRY_CAR_SIZE);
      continue;
    }
    cursor.writeUInt16LE(200); // speed
    cursor.writeFloatLE(1); // throttle
    cursor.writeFloatLE(0); // steer
    cursor.writeFloatLE(0); // brake
    cursor.writeUInt8(0); // clutch
    cursor.writeUInt8(4); // gear (int8, mas valor positivo cabe em writeUInt8)
    cursor.writeUInt16LE(10000); // engineRPM
    cursor.writeUInt8(0); // drs
    cursor.writeUInt8(0); // revLightsPercent
    cursor.writeUInt16LE(0); // revLightsBitValue
    for (let i = 0; i < 4; i += 1) cursor.writeUInt16LE(0); // brakesTemperature RL/RR/FL/FR
    for (let i = 0; i < 4; i += 1) cursor.writeUInt8(0); // tyresSurfaceTemperature
    for (let i = 0; i < 4; i += 1) cursor.writeUInt8(0); // tyresInnerTemperature
    cursor.writeUInt16LE(90); // engineTemperature
    for (let i = 0; i < 4; i += 1) cursor.writeFloatLE(22); // tyresPressure
    for (let i = 0; i < 4; i += 1) cursor.writeUInt8(0); // surfaceType
  }

  cursor.writeUInt8(255); // mfdPanelIndex
  cursor.writeUInt8(255); // mfdPanelIndexSecondaryPlayer
  cursor.writeUInt8(0); // suggestedGear (int8)

  return buffer;
}

export interface SyntheticRecording {
  packets: RecordedPacket[];
  expectedLap: {
    lapNumber: number;
    lapTimeMs: number;
    sector1Ms: number;
    sector2Ms: number;
    sector3Ms: number;
    isValid: boolean;
  };
  expectedSampleCount: number;
}

/**
 * Gravação sintética mínima, mas feita de pacotes binários reais (passam
 * pelos parsers de verdade, não são mocks) - 5 ticks da volta 1, espaçados
 * em exatamente MIN_DISTANCE_DELTA_M (4m) pra decimação manter todos, mais
 * 1 tick final que fecha a volta 1 ao reportar a volta 2. overallFrameId
 * e timestampMs sobem 1 por tick, cada um com margem de sobra abaixo de
 * qualquer limiar usado em src/persistence/sessionContext.ts.
 */
export function buildSyntheticRecording(): SyntheticRecording {
  const packets: RecordedPacket[] = [];
  const ticks = 5;

  for (let i = 0; i < ticks; i += 1) {
    const overallFrameIdentifier = i + 1;
    const timestampMs = i * 10;
    const lapDistance = i * 4; // 0, 4, 8, 12, 16 - cada passo bate o threshold de decimação
    const header: HeaderFields = {
      packetId: 2,
      sessionTime: i,
      frameIdentifier: overallFrameIdentifier,
      overallFrameIdentifier,
    };

    packets.push({
      timestampMs,
      data: buildLapDataPacket({
        header,
        currentLapNum: 1,
        lapDistance,
        currentLapTimeInMS: i * 1000,
        sector1TimeMSPart: 20000 % 60000,
        sector1TimeMinutesPart: 0,
        sector2TimeMSPart: 25000 % 60000,
        sector2TimeMinutesPart: 0,
        currentLapInvalid: 0,
        carPosition: 1,
        lastLapTimeInMS: 0, // só importa no tick que fecha a volta - ver tick final
      }),
    });
    packets.push({ timestampMs, data: buildMotionPacket({ ...header, packetId: 0 }, lapDistance) });
    packets.push({ timestampMs, data: buildCarTelemetryPacket({ ...header, packetId: 6 }) });
  }

  // Tick final: só LapData, reportando a volta 2 - fecha a volta 1 usando
  // os setores/validade do último snapshot da volta 1 (tick 5 acima) e o
  // lastLapTimeInMS deste próprio pacote (ver lapCompletionDetector.ts).
  const closingOverallFrameId = ticks + 1;
  const closingHeader: HeaderFields = {
    packetId: 2,
    sessionTime: ticks,
    frameIdentifier: closingOverallFrameId,
    overallFrameIdentifier: closingOverallFrameId,
  };
  const sector1Ms = 20000;
  const sector2Ms = 25000;
  const sector3Ms = 18000;
  packets.push({
    timestampMs: ticks * 10,
    data: buildLapDataPacket({
      header: closingHeader,
      currentLapNum: 2,
      lapDistance: 0,
      currentLapTimeInMS: 0,
      sector1TimeMSPart: 0,
      sector1TimeMinutesPart: 0,
      sector2TimeMSPart: 0,
      sector2TimeMinutesPart: 0,
      currentLapInvalid: 0,
      carPosition: 1,
      lastLapTimeInMS: sector1Ms + sector2Ms + sector3Ms,
    }),
  });

  return {
    packets,
    expectedLap: {
      lapNumber: 1,
      lapTimeMs: sector1Ms + sector2Ms + sector3Ms,
      sector1Ms,
      sector2Ms,
      sector3Ms,
      isValid: true,
    },
    expectedSampleCount: ticks, // uma amostra de motion e uma de carTelemetry por tick da volta 1
  };
}
