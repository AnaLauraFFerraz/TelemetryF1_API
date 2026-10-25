import { TelemetrySample, Corner, BrakingInsight, LapCornerBehaviour } from "./types";
import { BRAKE_THRESHOLD, lapBehaviourInStretch } from "./cornerBehaviour";
import { round2 } from "./numberUtils";

// Freio ainda ativo com o volante virado além disso conta como trail
// braking (freada liberada gradualmente já dentro da curva).
const TRAIL_BRAKING_STEER_THRESHOLD = 0.15;

export function analyzeBraking(
  corner: Corner,
  primarySamples: TelemetrySample[],
  comparisonSamples: TelemetrySample[]
): BrakingInsight {
  const { brakingStartDistance: from, exitDistance: to } = corner;
  const primary = lapBehaviourInStretch(primarySamples, from, to);
  const comparison = lapBehaviourInStretch(comparisonSamples, from, to);

  const primaryStart = primary?.brakingStartIndex ?? null;
  const comparisonStart = comparison?.brakingStartIndex ?? null;

  return {
    brakingPointDiffM:
      primaryStart !== null && comparisonStart !== null
        ? round2(primarySamples[primaryStart].lapDistance - comparisonSamples[comparisonStart].lapDistance)
        : null,
    peakBrakeDiff: primary && comparison ? round2(primary.brakingPeak - comparison.brakingPeak) : null,
    trailBrakingPrimary: primary ? hasTrailBraking(primarySamples, primary) : false,
    trailBrakingComparison: comparison ? hasTrailBraking(comparisonSamples, comparison) : false,
    brakedPrimary: primary ? primaryStart !== null : null,
    brakedComparison: comparison ? comparisonStart !== null : null,
  };
}

function hasTrailBraking(samples: TelemetrySample[], behaviour: LapCornerBehaviour): boolean {
  if (behaviour.brakingStartIndex === null) return false;
  for (let i = behaviour.brakingStartIndex; i <= behaviour.slowestIndex; i++) {
    if (samples[i].brake > BRAKE_THRESHOLD && Math.abs(samples[i].steer) > TRAIL_BRAKING_STEER_THRESHOLD) return true;
  }
  return false;
}
