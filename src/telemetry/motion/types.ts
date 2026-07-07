import { PacketHeader } from "../header/types";

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface CarMotionData {
  worldPosition: Vector3; // metros
  worldVelocity: Vector3; // m/s
  worldForwardDir: Vector3; // vetor unitário (já normalizado pelo parser)
  worldRightDir: Vector3; // vetor unitário (já normalizado pelo parser)
  gForceLateral: number;
  gForceLongitudinal: number;
  gForceVertical: number;
  yaw: number; // radianos
  pitch: number; // radianos
  roll: number; // radianos
}

export interface PacketMotionData {
  header: PacketHeader;
  carMotionData: CarMotionData[]; // 22 carros
}
