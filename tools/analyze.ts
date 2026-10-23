import { listCarTelemetrySamplesForLap } from "../src/persistence/carTelemetrySampleRepository";
import { listMotionSamplesForLap } from "../src/persistence/motionSampleRepository";
import { getLapForSession } from "../src/persistence/lapRepository";
import { buildInsights } from "../src/analysis/buildInsights";
import { buildCoachUserMessage } from "../src/coaching/coachUserMessage";
import { toComparedLap } from "../src/coaching/coachReading";
import { formatAnalyzeOutput } from "../src/coaching/analyzeOutput";
import { PROMPT_VERSION } from "../src/coaching/promptVersion";

/**
 * Imprime o JSON de insights (Fase 1 do Coach IA), a mensagem exata que o
 * coach receberia e a versão do prompt, pra uma sessão real do banco, sem
 * chamar nenhuma IA - serve pra validar visualmente a detecção de
 * curvas/frenagem/traçado contra os gráficos da Tela 2 e pra ler o que o
 * coach recebe antes de gastar uma chamada.
 *
 * Uso: npm run analyze -- <sessionId> <lapA> <lapB>
 * lapA = volta principal (analisada), lapB = volta de comparação.
 */
const [sessionIdArg, lapAArg, lapBArg] = process.argv.slice(2);

if (!sessionIdArg || !lapAArg || !lapBArg) {
  console.error("Uso: npm run analyze -- <sessionId> <lapA> <lapB>");
  process.exit(1);
}

const sessionId = Number(sessionIdArg);
const lapA = Number(lapAArg);
const lapB = Number(lapBArg);

if (!Number.isInteger(sessionId) || !Number.isInteger(lapA) || !Number.isInteger(lapB)) {
  console.error("sessionId, lapA e lapB devem ser inteiros");
  process.exit(1);
}

const primaryTelemetry = listCarTelemetrySamplesForLap(sessionId, lapA);
const comparisonTelemetry = listCarTelemetrySamplesForLap(sessionId, lapB);
const primaryMotion = listMotionSamplesForLap(sessionId, lapA);
const comparisonMotion = listMotionSamplesForLap(sessionId, lapB);

if (primaryTelemetry.length === 0 || comparisonTelemetry.length === 0) {
  console.error(
    `[analyze] uma das voltas não tem amostras de telemetria (volta ${lapA}: ${primaryTelemetry.length}, volta ${lapB}: ${comparisonTelemetry.length})`
  );
  process.exit(1);
}

const insights = buildInsights({ primaryTelemetry, comparisonTelemetry, primaryMotion, comparisonMotion });
const primary = toComparedLap(lapA, getLapForSession(sessionId, lapA));
const comparison = toComparedLap(lapB, getLapForSession(sessionId, lapB));
const message = buildCoachUserMessage(insights, primary, comparison);

console.log(formatAnalyzeOutput(insights, message, PROMPT_VERSION));
