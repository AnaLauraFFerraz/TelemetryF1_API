import { BufferCursor } from "../shared/BufferCursor";
import { HEADER_SIZE, assertBytesRead } from "../shared/constants";
import { PacketHeader } from "./types";

export function parseHeader(buffer: Buffer): PacketHeader {
  const cursor = new BufferCursor(buffer);

  const header: PacketHeader = {
    packetFormat: cursor.readUInt16LE(),
    gameYear: cursor.readUInt8(),
    gameMajorVersion: cursor.readUInt8(),
    gameMinorVersion: cursor.readUInt8(),
    packetVersion: cursor.readUInt8(),
    packetId: cursor.readUInt8(),
    sessionUID: cursor.readBigUInt64LE(),
    sessionTime: cursor.readFloatLE(),
    frameIdentifier: cursor.readUInt32LE(),
    overallFrameIdentifier: cursor.readUInt32LE(),
    playerCarIndex: cursor.readUInt8(),
    secondaryPlayerCarIndex: cursor.readUInt8(),
  };

  assertBytesRead(cursor.position, HEADER_SIZE, "PacketHeader");

  return header;
}
