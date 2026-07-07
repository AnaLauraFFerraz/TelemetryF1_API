import { BufferCursor } from "./BufferCursor";
import { WheelData } from "./types";

// Lê 4 valores consecutivos do buffer na ordem RL, RR, FL, FR do protocolo.
export function readWheelData<T>(cursor: BufferCursor, readFn: () => T): WheelData<T> {
  return {
    rearLeft: readFn(),
    rearRight: readFn(),
    frontLeft: readFn(),
    frontRight: readFn(),
  };
}
