import Anthropic, { RateLimitError, APIConnectionError, APIError } from "@anthropic-ai/sdk";
import { env } from "../config/env";
import { LapInsights } from "../analysis/types";
import { ComparedLap } from "./coachReading";
import { COACH_SYSTEM_PROMPT } from "./coachPrompt";
import { buildCoachUserMessage } from "./coachUserMessage";
import { COACH_MODEL } from "./coachModel";

const MAX_TOKENS = 2048;

export class CoachingUnavailableError extends Error {}
export class CoachingRateLimitedError extends Error {}
export class CoachingApiError extends Error {}

// Client construído sob demanda (não no import do módulo) - env.anthropicApiKey
// pode não existir no boot do processo, e isCoachingConfigured() já cobriu
// esse caso antes de generateCoaching ser chamada.
let client: Anthropic | undefined;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.anthropicApiKey });
  }
  return client;
}

export function isCoachingConfigured(): boolean {
  return Boolean(env.anthropicApiKey);
}

/**
 * Gera a análise de coaching a partir do JSON de insights (Fase 1) - nunca
 * recebe amostras brutas de telemetria, só os fatos já extraídos. O system
 * prompt é estático e marcado com cache_control, acima do tamanho mínimo
 * cacheável do modelo (1.024 tokens) - o log de usage abaixo mostra
 * cache_write/cache_read. O cache em lap_analyses evita a chamada inteira
 * pra um par já analisado.
 */
export async function generateCoaching(
  insights: LapInsights,
  primary: ComparedLap,
  comparison: ComparedLap
): Promise<{ text: string; model: string }> {
  if (!isCoachingConfigured()) {
    throw new CoachingUnavailableError("ANTHROPIC_API_KEY não configurada");
  }

  let response;
  try {
    response = await getClient().messages.create({
      model: COACH_MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: COACH_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: buildCoachUserMessage(insights, primary, comparison),
        },
      ],
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      throw new CoachingRateLimitedError("Limite de requisições da API da Anthropic atingido, tente novamente em instantes.");
    }
    if (err instanceof APIConnectionError) {
      throw new CoachingApiError("Não foi possível conectar à API da Anthropic.");
    }
    if (err instanceof APIError) {
      throw new CoachingApiError(`Erro da API da Anthropic (${err.status ?? "?"}): ${err.message}`);
    }
    throw err;
  }

  const { usage } = response;
  console.log(
    `[coachService] usage model=${COACH_MODEL} input=${usage.input_tokens} output=${usage.output_tokens} ` +
      `cache_write=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0}`
  );

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new CoachingApiError("Resposta do Claude não trouxe um bloco de texto.");
  }

  return { text: textBlock.text, model: COACH_MODEL };
}
