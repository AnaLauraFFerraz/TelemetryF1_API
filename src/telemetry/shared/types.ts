/**
 * Todo array de 4 elementos do protocolo do F1 24 (pneus, freios etc.) segue
 * sempre a mesma ordem: Rear Left, Rear Right, Front Left, Front Right
 * (ver spec, FAQ "What is the order of the wheel arrays?"). Nomear os campos
 * em vez de deixar um array solto evita ter que lembrar "índice 2 = FL"
 * toda vez que o dado for consumido.
 */
export interface WheelData<T> {
  rearLeft: T;
  rearRight: T;
  frontLeft: T;
  frontRight: T;
}
