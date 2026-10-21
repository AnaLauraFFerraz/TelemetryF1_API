export type RunMode = "local" | "demo";

// Um valor digitado errado (ex.: "yes") não pode cair em silêncio no modo
// local: quem pediu o modo demo veria o servidor subir nas portas do .env.
export function parseRunMode(raw: string | undefined): RunMode {
  if (raw === undefined || raw === "") return "local";
  if (raw === "true") return "demo";
  throw new Error(`Variável de ambiente DEMO_MODE="${raw}" inválida: use "true" para o modo demo, ou deixe vazia para o modo local.`);
}
