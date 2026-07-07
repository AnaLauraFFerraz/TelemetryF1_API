import { PacketHeader } from "../header/types";

export interface LapData {
  lastLapTimeInMS: number;
  currentLapTimeInMS: number;
  sector1TimeMSPart: number;
  sector1TimeMinutesPart: number;
  sector2TimeMSPart: number;
  sector2TimeMinutesPart: number;
  deltaToCarInFrontMSPart: number;
  deltaToCarInFrontMinutesPart: number;
  deltaToRaceLeaderMSPart: number;
  deltaToRaceLeaderMinutesPart: number;
  lapDistance: number; // metros, pode ser negativo antes de cruzar a linha
  totalDistance: number; // metros, pode ser negativo
  safetyCarDelta: number;
  carPosition: number;
  currentLapNum: number;
  pitStatus: number; // 0=none, 1=pitting, 2=in pit area
  numPitStops: number;
  sector: number; // 0=setor1, 1=setor2, 2=setor3
  currentLapInvalid: number; // 0=válida, 1=inválida
  penalties: number;
  totalWarnings: number;
  cornerCuttingWarnings: number;
  numUnservedDriveThroughPens: number;
  numUnservedStopGoPens: number;
  gridPosition: number;
  driverStatus: number; // 0=garagem,1=volta lançada,2=in lap,3=out lap,4=na pista
  resultStatus: number; // 0=inválido,1=inativo,2=ativo,3=terminou,4=abandonou,5=desclassificado,6=não classificado,7=retirado
  pitLaneTimerActive: number;
  pitLaneTimeInLaneInMS: number;
  pitStopTimerInMS: number;
  pitStopShouldServePen: number;
  speedTrapFastestSpeed: number; // km/h
  speedTrapFastestLap: number; // 255 = não definido
}

export interface PacketLapData {
  header: PacketHeader;
  lapData: LapData[]; // 22 carros
  timeTrialPBCarIdx: number; // 255 se inválido
  timeTrialRivalCarIdx: number; // 255 se inválido
}
