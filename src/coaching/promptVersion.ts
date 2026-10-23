import { createHash } from "node:crypto";
import { CornerInsight, LapInsights } from "../analysis/types";
import { COACH_SYSTEM_PROMPT } from "./coachPrompt";
import { buildCoachUserMessage } from "./coachUserMessage";
import type { ComparedLap } from "./coachReading";

export interface ReferenceInput {
  insights: LapInsights;
  primary: ComparedLap;
  comparison: ComparedLap;
}

function corner(
  apexDistance: number,
  deltaLossS: number,
  braking: CornerInsight["braking"],
  throttleOnDiffM: number | null
): CornerInsight {
  return {
    corner: { index: 0, apexDistance, apexSpeed: 120, brakingStartDistance: apexDistance - 60, exitDistance: apexDistance + 60, severity: "medium" },
    deltaLossS,
    braking,
    throttle: { throttleOnDiffM, coastingTimePrimaryS: 0.2, coastingTimeComparisonS: 0.1, throttleOscillationPrimary: 1, throttleOscillationComparison: 1 },
    lineDeviation: null,
  };
}

// Cada mensagem mostra no máximo 3 oportunidades, então os ramos de frase se
// espalham por três entradas; o teste exige que todo modelo de PHRASE_TEMPLATES
// apareça em alguma delas.
export const REFERENCE_INPUTS: readonly ReferenceInput[] = [
  {
    primary: { lapNumber: 8, lapTimeMs: 73372, isValid: true },
    comparison: { lapNumber: 6, lapTimeMs: 74306, isValid: false },
    insights: {
      totalDeltaS: 0.6,
      corners: [
        corner(334, 0.3, { brakingPointDiffM: -20, peakBrakeDiff: 0.2, trailBrakingPrimary: true, trailBrakingComparison: false }, -5),
        corner(812, 0.2, { brakingPointDiffM: 10, peakBrakeDiff: -0.1, trailBrakingPrimary: false, trailBrakingComparison: true }, 8),
        corner(1500, 0.1, { brakingPointDiffM: 0, peakBrakeDiff: 0, trailBrakingPrimary: true, trailBrakingComparison: true }, 0),
        corner(9999, -0.05, { brakingPointDiffM: 3, peakBrakeDiff: 0.1, trailBrakingPrimary: false, trailBrakingComparison: false }, 2),
      ],
      tyreWindowExcursions: [],
    },
  },
  {
    primary: { lapNumber: 7, lapTimeMs: 74144, isValid: true },
    comparison: { lapNumber: 8, lapTimeMs: 73372, isValid: true },
    insights: {
      totalDeltaS: 0.7,
      corners: [corner(2121, 0.15, { brakingPointDiffM: null, peakBrakeDiff: null, trailBrakingPrimary: false, trailBrakingComparison: false }, null)],
      tyreWindowExcursions: [],
    },
  },
  {
    primary: { lapNumber: 3, lapTimeMs: null, isValid: null },
    comparison: { lapNumber: 4, lapTimeMs: null, isValid: null },
    insights: {
      totalDeltaS: -0.1,
      corners: [corner(500, -0.1, { brakingPointDiffM: 1, peakBrakeDiff: 0.1, trailBrakingPrimary: true, trailBrakingComparison: true }, 1)],
      tyreWindowExcursions: [],
    },
  },
];

const SEPARATOR = "\n\u0000\n";

function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function computePromptVersion(systemPrompt: string, buildMessage: typeof buildCoachUserMessage): string {
  const parts = [systemPrompt, ...REFERENCE_INPUTS.map((r) => buildMessage(r.insights, r.primary, r.comparison))];
  return createHash("sha256").update(parts.map(normalizeLineBreaks).join(SEPARATOR)).digest("hex").slice(0, 16);
}

export const PROMPT_VERSION = computePromptVersion(COACH_SYSTEM_PROMPT, buildCoachUserMessage);
