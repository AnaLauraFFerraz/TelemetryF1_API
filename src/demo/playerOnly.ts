import { TelemetryWsMessage } from "../ws/messageFormat";

// No modo demo cada mensagem leva só o carro do jogador (17x menos bytes,
// research.md ponto 6). O formato do envelope não muda; playerCarIndex passa
// a ser 0 porque é o índice desse carro no array de um elemento.
export function toPlayerOnlyMessage<T>(message: TelemetryWsMessage<T>): TelemetryWsMessage<T> {
  return { ...message, data: [message.data[message.playerCarIndex]], playerCarIndex: 0 };
}
