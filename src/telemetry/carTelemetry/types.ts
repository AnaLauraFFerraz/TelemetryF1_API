import { PacketHeader } from "../header/types";
import { WheelData } from "../shared/types";

export interface CarTelemetryData {
  speed: number; // km/h
  throttle: number; // 0.0 a 1.0
  steer: number; // -1.0 (esquerda) a 1.0 (direita)
  brake: number; // 0.0 a 1.0
  clutch: number; // 0 a 100
  gear: number; // 1-8, N=0, R=-1
  engineRPM: number;
  drs: number; // 0=off, 1=on
  revLightsPercent: number;
  revLightsBitValue: number;
  brakesTemperature: WheelData<number>; // celsius
  tyresSurfaceTemperature: WheelData<number>; // celsius
  tyresInnerTemperature: WheelData<number>; // celsius
  engineTemperature: number; // celsius
  tyresPressure: WheelData<number>; // PSI
  surfaceType: WheelData<number>;
}

export interface PacketCarTelemetryData {
  header: PacketHeader;
  carTelemetryData: CarTelemetryData[]; // 22 carros
  mfdPanelIndex: number; // 255 = MFD fechado
  mfdPanelIndexSecondaryPlayer: number;
  suggestedGear: number; // 0 = nenhuma marcha sugerida
}
