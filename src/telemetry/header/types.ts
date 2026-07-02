/**
 * Cabeçalho presente em todo pacote UDP do F1 24. É o "envelope" que diz
 * qual struct vem em seguida (m_packetId) e a qual sessão/frame ele pertence.
 */
export interface PacketHeader {
  packetFormat: number; // 2024
  gameYear: number; // últimos 2 dígitos, ex: 24
  gameMajorVersion: number;
  gameMinorVersion: number;
  packetVersion: number;
  packetId: number; // 0=Motion, 1=Session, 2=LapData, 3=Event, ... ver telemetry/packetIds.ts
  sessionUID: bigint; // uint64 - não cabe com precisão em number, por isso bigint
  sessionTime: number;
  frameIdentifier: number;
  overallFrameIdentifier: number; // não reseta em flashbacks
  playerCarIndex: number; // índice do carro do jogador no array de 22
  secondaryPlayerCarIndex: number; // 255 se não houver segundo jogador (splitscreen)
}
