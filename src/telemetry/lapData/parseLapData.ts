import { BufferCursor } from "../shared/BufferCursor";
import { HEADER_SIZE, LAP_DATA_CAR_SIZE, LAP_DATA_PACKET_SIZE, NUM_CARS, assertBytesRead } from "../shared/constants";
import { PacketHeader } from "../header/types";
import { LapData, PacketLapData } from "./types";

function parseSingleLapData(cursor: BufferCursor): LapData {
  const startPosition = cursor.position;

  const data: LapData = {
    lastLapTimeInMS: cursor.readUInt32LE(),
    currentLapTimeInMS: cursor.readUInt32LE(),
    sector1TimeMSPart: cursor.readUInt16LE(),
    sector1TimeMinutesPart: cursor.readUInt8(),
    sector2TimeMSPart: cursor.readUInt16LE(),
    sector2TimeMinutesPart: cursor.readUInt8(),
    deltaToCarInFrontMSPart: cursor.readUInt16LE(),
    deltaToCarInFrontMinutesPart: cursor.readUInt8(),
    deltaToRaceLeaderMSPart: cursor.readUInt16LE(),
    deltaToRaceLeaderMinutesPart: cursor.readUInt8(),
    lapDistance: cursor.readFloatLE(),
    totalDistance: cursor.readFloatLE(),
    safetyCarDelta: cursor.readFloatLE(),
    carPosition: cursor.readUInt8(),
    currentLapNum: cursor.readUInt8(),
    pitStatus: cursor.readUInt8(),
    numPitStops: cursor.readUInt8(),
    sector: cursor.readUInt8(),
    currentLapInvalid: cursor.readUInt8(),
    penalties: cursor.readUInt8(),
    totalWarnings: cursor.readUInt8(),
    cornerCuttingWarnings: cursor.readUInt8(),
    numUnservedDriveThroughPens: cursor.readUInt8(),
    numUnservedStopGoPens: cursor.readUInt8(),
    gridPosition: cursor.readUInt8(),
    driverStatus: cursor.readUInt8(),
    resultStatus: cursor.readUInt8(),
    pitLaneTimerActive: cursor.readUInt8(),
    pitLaneTimeInLaneInMS: cursor.readUInt16LE(),
    pitStopTimerInMS: cursor.readUInt16LE(),
    pitStopShouldServePen: cursor.readUInt8(),
    speedTrapFastestSpeed: cursor.readFloatLE(),
    speedTrapFastestLap: cursor.readUInt8(),
  };

  assertBytesRead(cursor.position - startPosition, LAP_DATA_CAR_SIZE, "LapData");

  return data;
}

export function parseLapDataPacket(buffer: Buffer, header: PacketHeader): PacketLapData {
  const cursor = new BufferCursor(buffer, HEADER_SIZE);

  const lapData = cursor.readArray(NUM_CARS, () => parseSingleLapData(cursor));

  const timeTrialPBCarIdx = cursor.readUInt8();
  const timeTrialRivalCarIdx = cursor.readUInt8();

  assertBytesRead(cursor.position, LAP_DATA_PACKET_SIZE, "PacketLapData");

  return { header, lapData, timeTrialPBCarIdx, timeTrialRivalCarIdx };
}
