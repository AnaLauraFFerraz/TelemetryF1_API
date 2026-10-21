export type ReplaySpeed = "1x" | "2x" | "max";

export interface ReplayOptions {
  speed: ReplaySpeed;
  loop: boolean;
}

// Uma linha decodificada de um .jsonl gravado por tools/recorder.ts -
// timestampMs é o offset desde o início da gravação, data é o pacote UDP
// cru. Só tools/replayer.ts e src/demo/recording.ts lidam com base64/JSON;
// daqui pra baixo é só isso.
export interface RecordedPacket {
  timestampMs: number;
  data: Buffer;
}
