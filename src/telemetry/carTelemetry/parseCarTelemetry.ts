import { BufferCursor } from "../shared/BufferCursor";
import {
  HEADER_SIZE,
  CAR_TELEMETRY_CAR_SIZE,
  CAR_TELEMETRY_PACKET_SIZE,
  NUM_CARS,
  assertBytesRead,
} from "../shared/constants";
import { readWheelData } from "../shared/wheelData";
import { PacketHeader } from "../header/types";
import { CarTelemetryData, PacketCarTelemetryData } from "./types";

function parseSingleCarTelemetry(cursor: BufferCursor): CarTelemetryData {
  const startPosition = cursor.position;

  const data: CarTelemetryData = {
    speed: cursor.readUInt16LE(),
    throttle: cursor.readFloatLE(),
    steer: cursor.readFloatLE(),
    brake: cursor.readFloatLE(),
    clutch: cursor.readUInt8(),
    gear: cursor.readInt8(),
    engineRPM: cursor.readUInt16LE(),
    drs: cursor.readUInt8(),
    revLightsPercent: cursor.readUInt8(),
    revLightsBitValue: cursor.readUInt16LE(),
    brakesTemperature: readWheelData(cursor, () => cursor.readUInt16LE()),
    tyresSurfaceTemperature: readWheelData(cursor, () => cursor.readUInt8()),
    tyresInnerTemperature: readWheelData(cursor, () => cursor.readUInt8()),
    engineTemperature: cursor.readUInt16LE(),
    tyresPressure: readWheelData(cursor, () => cursor.readFloatLE()),
    surfaceType: readWheelData(cursor, () => cursor.readUInt8()),
  };

  assertBytesRead(cursor.position - startPosition, CAR_TELEMETRY_CAR_SIZE, "CarTelemetryData");

  return data;
}

export function parseCarTelemetryPacket(buffer: Buffer, header: PacketHeader): PacketCarTelemetryData {
  const cursor = new BufferCursor(buffer, HEADER_SIZE);

  const carTelemetryData = cursor.readArray(NUM_CARS, () => parseSingleCarTelemetry(cursor));

  const mfdPanelIndex = cursor.readUInt8();
  const mfdPanelIndexSecondaryPlayer = cursor.readUInt8();
  const suggestedGear = cursor.readInt8();

  assertBytesRead(cursor.position, CAR_TELEMETRY_PACKET_SIZE, "PacketCarTelemetryData");

  return { header, carTelemetryData, mfdPanelIndex, mfdPanelIndexSecondaryPlayer, suggestedGear };
}
