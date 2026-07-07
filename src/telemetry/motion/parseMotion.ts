import { BufferCursor } from "../shared/BufferCursor";
import { HEADER_SIZE, MOTION_CAR_SIZE, MOTION_PACKET_SIZE, NUM_CARS, assertBytesRead } from "../shared/constants";
import { PacketHeader } from "../header/types";
import { CarMotionData, PacketMotionData } from "./types";

// m_worldForwardDirX/Y/Z e m_worldRightDirX/Y/Z são int16 normalizados -
// dividir por 32767.0 devolve o vetor unitário (spec: "to convert to float
// values divide by 32767.0f").
const NORMALIZED_INT16_SCALE = 32767.0;

function parseCarMotionData(cursor: BufferCursor): CarMotionData {
  const startPosition = cursor.position;

  const data: CarMotionData = {
    worldPosition: {
      x: cursor.readFloatLE(),
      y: cursor.readFloatLE(),
      z: cursor.readFloatLE(),
    },
    worldVelocity: {
      x: cursor.readFloatLE(),
      y: cursor.readFloatLE(),
      z: cursor.readFloatLE(),
    },
    worldForwardDir: {
      x: cursor.readInt16LE() / NORMALIZED_INT16_SCALE,
      y: cursor.readInt16LE() / NORMALIZED_INT16_SCALE,
      z: cursor.readInt16LE() / NORMALIZED_INT16_SCALE,
    },
    worldRightDir: {
      x: cursor.readInt16LE() / NORMALIZED_INT16_SCALE,
      y: cursor.readInt16LE() / NORMALIZED_INT16_SCALE,
      z: cursor.readInt16LE() / NORMALIZED_INT16_SCALE,
    },
    gForceLateral: cursor.readFloatLE(),
    gForceLongitudinal: cursor.readFloatLE(),
    gForceVertical: cursor.readFloatLE(),
    yaw: cursor.readFloatLE(),
    pitch: cursor.readFloatLE(),
    roll: cursor.readFloatLE(),
  };

  assertBytesRead(cursor.position - startPosition, MOTION_CAR_SIZE, "CarMotionData");

  return data;
}

export function parseMotionPacket(buffer: Buffer, header: PacketHeader): PacketMotionData {
  // o header já foi parseado pelo dispatcher a partir do offset 0;
  // aqui continuamos a leitura logo depois dele.
  const cursor = new BufferCursor(buffer, HEADER_SIZE);

  const carMotionData = cursor.readArray(NUM_CARS, () => parseCarMotionData(cursor));

  assertBytesRead(cursor.position, MOTION_PACKET_SIZE, "PacketMotionData");

  return { header, carMotionData };
}
