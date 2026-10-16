import { PacketHeader } from "../header/types";

export interface PacketSessionData {
  header: PacketHeader;
  // -1 = desconhecido; ver apêndice de tracks da spec do F1 24 (ex: 0=Melbourne,
  // 1=Paul Ricard, ..., valores fixos por circuito, não mudam entre jogos).
  trackId: number;
  // Apêndice "Session type" da spec do F1 24: 0=unknown, 1-4=treinos, 5-9=classificação,
  // 10-14=sprint shootout, 15-17=corrida, 18=Time Trial.
  sessionType: number;
}
