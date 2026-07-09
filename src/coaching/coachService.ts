import Anthropic, { RateLimitError, APIConnectionError, APIError } from "@anthropic-ai/sdk";
import { env } from "../config/env";
import { LapInsights } from "../analysis/types";
import { TrackBenchmark } from "../persistence/lapRepository";
import { COACH_SYSTEM_PROMPT } from "./coachPrompt";
import { buildCoachUserMessage } from "./coachUserMessage";

const MODEL = "claude-opus-4-8";
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
 * recebe amostras brutas de telemetria, só os fatos já extraídos. System
 * prompt é estático e marcado com cache_control pra aproveitar prompt
 * caching da Anthropic entre chamadas (o conteúdo variável vai todo na
 * mensagem do usuário).
 */
export async function generateCoaching(
  insights: LapInsights,
  benchmark?: TrackBenchmark | null
): Promise<{ text: string; model: string }> {
  if (!isCoachingConfigured()) {
    throw new CoachingUnavailableError("ANTHROPIC_API_KEY não configurada");
  }

  let response;
  try {
    response = await getClient().messages.create({
      model: MODEL,
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
          content: buildCoachUserMessage(insights, benchmark),
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

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new CoachingApiError("Resposta do Claude não trouxe um bloco de texto.");
  }

  return { text: textBlock.text, model: MODEL };
}
