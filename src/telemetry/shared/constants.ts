// Tamanhos em bytes, conferidos campo a campo contra a spec oficial do F1 24
// (Data Output from F1 24 Game v27.2x). Usados para validar que cada parser
// consumiu exatamente os bytes esperados - ver `assertBytesRead` em cada parser.

export const NUM_CARS = 22;

export const HEADER_SIZE = 29;

export const MOTION_CAR_SIZE = 60;
export const MOTION_PACKET_SIZE = HEADER_SIZE + MOTION_CAR_SIZE * NUM_CARS; // 1349

export const LAP_DATA_CAR_SIZE = 57;
// + 2 bytes: m_timeTrialPBCarIdx, m_timeTrialRivalCarIdx
export const LAP_DATA_PACKET_SIZE = HEADER_SIZE + LAP_DATA_CAR_SIZE * NUM_CARS + 2; // 1285

export const CAR_TELEMETRY_CAR_SIZE = 60;
// + 3 bytes: m_mfdPanelIndex, m_mfdPanelIndexSecondaryPlayer, m_suggestedGear
export const CAR_TELEMETRY_PACKET_SIZE = HEADER_SIZE + CAR_TELEMETRY_CAR_SIZE * NUM_CARS + 3; // 1352

/**
 * Lança um erro se o cursor não terminou exatamente onde deveria.
 * Sem isso, um offset errado corrompe os campos seguintes em silêncio -
 * o Buffer não reclama, só devolve lixo.
 */
export function assertBytesRead(actual: number, expected: number, structName: string): void {
  if (actual !== expected) {
    throw new Error(
      `${structName}: esperava ler ${expected} bytes, mas o cursor terminou em ${actual}. ` +
        `Confira a ordem/tamanho dos campos no parser.`
    );
  }
}
