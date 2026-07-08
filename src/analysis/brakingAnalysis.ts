import { TelemetrySample, Corner, BrakingInsight } from "./types";
import { findApexIndexNear, findBrakingStartIndex, peakInRange } from "./sampleSearch";
import { round2 } from "./numberUtils";

const CORNER_SEARCH_WINDOW_M = 80;
const BRAKE_THRESHOLD = 0.1;
// Freio ainda ativo com o volante virado além disso conta como trail
// braking (freada liberada gradualmente já dentro da curva).
const TRAIL_BRAKING_STEER_THRESHOLD = 0.15;

export function analyzeBraking(
  corner: Corner,
  primarySamples: TelemetrySample[],
  comparisonSamples: TelemetrySample[]
): BrakingInsight {
  const primaryApexIndex = findApexIndexNear(primarySamples, corner.apexDistance, CORNER_SEARCH_WINDOW_M);
  const comparisonApexIndex = findApexIndexNear(comparisonSamples, corner.apexDistance, CORNER_SEARCH_WINDOW_M);

  if (primaryApexIndex === null || comparisonApexIndex === null) {
    return { brakingPointDiffM: null, peakBrakeDiff: null, trailBrakingPrimary: false, trailBrakingComparison: false };
  }

  const primaryStart = primarySamples[findBrakingStartIndex(primarySamples, primaryApexIndex, BRAKE_THRESHOLD)];
  const comparisonStart = comparisonSamples[findBrakingStartIndex(comparisonSamples, comparisonApexIndex, BRAKE_THRESHOLD)];

  const primaryApexDistance = primarySamples[primaryApexIndex].lapDistance;
  const comparisonApexDistance = comparisonSamples[comparisonApexIndex].lapDistance;

  const primaryPeak = peakInRange(primarySamples, "brake", primaryStart.lapDistance, primaryApexDistance);
  const comparisonPeak = peakInRange(comparisonSamples, "brake", comparisonStart.lapDistance, comparisonApexDistance);

  return {
    brakingPointDiffM: round2(primaryStart.lapDistance - comparisonStart.lapDistance),
    peakBrakeDiff: round2(primaryPeak - comparisonPeak),
    trailBrakingPrimary: hasTrailBraking(primarySamples, primaryStart.lapDistance, primaryApexDistance),
    trailBrakingComparison: hasTrailBraking(comparisonSamples, comparisonStart.lapDistance, comparisonApexDistance),
  };
}

function hasTrailBraking(samples: TelemetrySample[], startDistance: number, apexDistance: number): boolean {
  return samples.some(
    (s) =>
      s.lapDistance >= startDistance &&
      s.lapDistance <= apexDistance &&
      s.brake > BRAKE_THRESHOLD &&
      Math.abs(s.steer) > TRAIL_BRAKING_STEER_THRESHOLD
  );
}
