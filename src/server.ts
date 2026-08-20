import { env } from "./config/env";
import { startUdpListener } from "./network/udpListener";
import { startWsBroadcaster } from "./network/wsBroadcaster";
import { startHttpServer } from "./http/httpServer";
import { dispatchPacket } from "./telemetry/dispatcher";
import { packetName } from "./telemetry/packetIds";
import { NUM_CARS } from "./telemetry/shared/constants";
import { buildWsMessage } from "./ws/messageFormat";
import { PacketMotionData } from "./telemetry/motion/types";
import { PacketLapData } from "./telemetry/lapData/types";
import { PacketCarTelemetryData } from "./telemetry/carTelemetry/types";
import { persistTelemetry } from "./persistence/persistTelemetry";
import { closeDb } from "./persistence/db";

const { broadcast } = startWsBroadcaster(env.wsPort);
startHttpServer(env.httpPort);

// Loga no máximo 1x/segundo por tipo de pacote - a até 60Hz, logar todo
// pacote satura o console (I/O síncrono) numa sessão real do jogo.
const LOG_INTERVAL_MS = 1000;
const lastLoggedAt: Partial<Record<number, number>> = {};

function shouldLog(packetId: number): boolean {
  const now = Date.now();
  const last = lastLoggedAt[packetId] ?? 0;
  if (now - last < LOG_INTERVAL_MS) return false;
  lastLoggedAt[packetId] = now;
  return true;
}

function handlePacket(buffer: Buffer): void {
  const result = dispatchPacket(buffer);
  if (!result) return; // tipo de pacote ainda não suportado (ver telemetry/dispatcher.ts)

  const { header, packetId, data } = result;

  if (header.playerCarIndex < 0 || header.playerCarIndex >= NUM_CARS) {
    throw new Error(`playerCarIndex fora do intervalo (0-${NUM_CARS - 1}): ${header.playerCarIndex}`);
  }

  if (packetId === 0) {
    const motion = data as PacketMotionData;
    const player = motion.carMotionData[header.playerCarIndex];
    if (shouldLog(packetId)) {
      console.log(
        `[${packetName(packetId)}] frame=${header.frameIdentifier} ` +
          `pos=(${player.worldPosition.x.toFixed(1)}, ${player.worldPosition.y.toFixed(1)}, ${player.worldPosition.z.toFixed(1)}) ` +
          `gForce lat=${player.gForceLateral.toFixed(2)} lon=${player.gForceLongitudinal.toFixed(2)} vert=${player.gForceVertical.toFixed(2)}`
      );
    }
    persistTelemetry(header, packetId, motion);
    broadcast(buildWsMessage(header, packetId, motion.carMotionData));
  }

  if (packetId === 1) {
    // Pacote de sessão só alimenta a persistência (trackId) - não é
    // transmitido via WS: o frontend não consome dados de sessão ao vivo
    // (ws.ts só tipa motion/lapData/carTelemetry).
    persistTelemetry(header, packetId, data);
  }

  if (packetId === 2) {
    const lapData = data as PacketLapData;
    const player = lapData.lapData[header.playerCarIndex];
    if (shouldLog(packetId)) {
      console.log(
        `[${packetName(packetId)}] frame=${header.frameIdentifier} ` +
          `lap=${player.currentLapNum} sector=${player.sector} pos=${player.carPosition} ` +
          `currentLapTimeMS=${player.currentLapTimeInMS} lastLapTimeMS=${player.lastLapTimeInMS}`
      );
    }
    persistTelemetry(header, packetId, lapData);
    broadcast(buildWsMessage(header, packetId, lapData.lapData));
  }

  if (packetId === 6) {
    const carTelemetry = data as PacketCarTelemetryData;
    const player = carTelemetry.carTelemetryData[header.playerCarIndex];
    if (shouldLog(packetId)) {
      console.log(
        `[${packetName(packetId)}] frame=${header.frameIdentifier} ` +
          `speed=${player.speed}km/h throttle=${player.throttle.toFixed(2)} brake=${player.brake.toFixed(2)} ` +
          `gear=${player.gear} rpm=${player.engineRPM} ` +
          `tyresPressure RL=${player.tyresPressure.rearLeft.toFixed(1)} FR=${player.tyresPressure.frontRight.toFixed(1)}`
      );
    }
    persistTelemetry(header, packetId, carTelemetry);
    broadcast(buildWsMessage(header, packetId, carTelemetry.carTelemetryData));
  }
}

startUdpListener(env.udpPort, (buffer) => {
  // Um pacote malformado (formato errado, truncado, de outra aplicação
  // mandando pro mesmo IP/porta) não pode derrubar o processo inteiro -
  // descarta e segue escutando os próximos.
  try {
    handlePacket(buffer);
  } catch (err) {
    console.error("[server] pacote UDP descartado:", err instanceof Error ? err.message : err);
  }
});

function shutdown(): void {
  closeDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
