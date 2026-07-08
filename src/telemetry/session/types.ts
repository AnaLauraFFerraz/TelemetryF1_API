import { PacketHeader } from "../header/types";

export interface PacketSessionData {
  header: PacketHeader;
  // -1 = desconhecido; ver apêndice de tracks da spec do F1 24 (ex: 0=Melbourne,
  // 1=Paul Ricard, ..., valores fixos por circuito, não mudam entre jogos).
  trackId: number;
  // 0=unknown,1=P1,2=P2,3=P3,4=Short P,5=Q1,6=Q2,7=Q3,8=Short Q,9=OSQ,
  // 10=R,11=R2,12=R3,13=Time Trial.
  sessionType: number;
}
