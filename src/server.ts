import { env } from "./config/env";
import { startUdpListener } from "./network/udpListener";
import { startWsBroadcaster } from "./network/wsBroadcaster";
import { dispatchPacket } from "./telemetry/dispatcher";
import { packetName } from "./telemetry/packetIds";
import { buildWsMessage } from "./ws/messageFormat";
import { PacketMotionData } from "./telemetry/motion/types";
import { PacketLapData } from "./telemetry/lapData/types";
import { PacketCarTelemetryData } from "./telemetry/carTelemetry/types";

const { broadcast } = startWsBroadcaster(env.wsPort);

startUdpListener(env.udpPort, (buffer) => {
  const result = dispatchPacket(buffer);
  if (!result) return; // tipo de pacote ainda não suportado (ver telemetry/dispatcher.ts)

  const { header, packetId, data } = result;

  if (packetId === 0) {
    const motion = data as PacketMotionData;
    const player = motion.carMotionData[header.playerCarIndex];
    console.log(
      `[${packetName(packetId)}] frame=${header.frameIdentifier} ` +
        `pos=(${player.worldPosition.x.toFixed(1)}, ${player.worldPosition.y.toFixed(1)}, ${player.worldPosition.z.toFixed(1)}) ` +
        `gForce lat=${player.gForceLateral.toFixed(2)} lon=${player.gForceLongitudinal.toFixed(2)} vert=${player.gForceVertical.toFixed(2)}`
    );
    broadcast(buildWsMessage(header, packetId, motion.carMotionData));
  }

  if (packetId === 2) {
    const lapData = data as PacketLapData;
    const player = lapData.lapData[header.playerCarIndex];
    console.log(
      `[${packetName(packetId)}] frame=${header.frameIdentifier} ` +
        `lap=${player.currentLapNum} sector=${player.sector} pos=${player.carPosition} ` +
        `currentLapTimeMS=${player.currentLapTimeInMS} lastLapTimeMS=${player.lastLapTimeInMS}`
    );
    broadcast(buildWsMessage(header, packetId, lapData.lapData));
  }

  if (packetId === 6) {
    const carTelemetry = data as PacketCarTelemetryData;
    const player = carTelemetry.carTelemetryData[header.playerCarIndex];
    console.log(
      `[${packetName(packetId)}] frame=${header.frameIdentifier} ` +
        `speed=${player.speed}km/h throttle=${player.throttle.toFixed(2)} brake=${player.brake.toFixed(2)} ` +
        `gear=${player.gear} rpm=${player.engineRPM} ` +
        `tyresPressure RL=${player.tyresPressure.rearLeft.toFixed(1)} FR=${player.tyresPressure.frontRight.toFixed(1)}`
    );
    broadcast(buildWsMessage(header, packetId, carTelemetry.carTelemetryData));
  }
});
