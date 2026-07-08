import { listCarTelemetrySamplesForLap } from "../src/persistence/carTelemetrySampleRepository";
import { listMotionSamplesForLap } from "../src/persistence/motionSampleRepository";
import { buildInsights } from "../src/analysis/buildInsights";

/**
 * Imprime o JSON de insights (Fase 1 do Coach IA) pra uma sessão real do
 * banco, sem chamar nenhuma IA - serve pra validar visualmente a detecção
 * de curvas/frenagem/traçado contra os gráficos da Tela 2 antes de avançar
 * pra Fase 2.
 *
 * Uso: npm run analyze -- <sessionId> <lapA> <lapB>
 * lapA = volta principal (analisada), lapB = volta de comparação/benchmark.
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

console.log(JSON.stringify(insights, null, 2));
