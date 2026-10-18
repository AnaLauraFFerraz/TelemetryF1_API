export type ReplaySpeed = "1x" | "2x" | "max";

export interface ReplayOptions {
  speed: ReplaySpeed;
  loop: boolean;
}

// Uma linha decodificada de um .jsonl gravado por tools/recorder.ts -
// timestampMs é o offset desde o início da gravação, data é o pacote UDP
// cru. tools/replayer.ts é o único lugar que ainda lida com base64/JSON;
// daqui pra baixo é só isso.
export interface RecordedPacket {
  timestampMs: number;
  data: Buffer;
}
