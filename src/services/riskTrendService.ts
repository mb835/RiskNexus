/**
 * riskTrendService.ts
 *
 * Deterministic 24h trend simulation for a RiskAssessment.
 * No external state, no API calls — pure function.
 *
 * Logic: simulate what the risk score likely was 24 hours ago
 * by analysing the current reasons and their magnitudes.
 */

import type { RiskAssessment } from "../types/risk";

export type TrendDirection = "up" | "down" | "stable";

export interface RiskTrend {
  /** Simulated delta between now and 24h ago (positive = risk grew) */
  delta: number;
  direction: TrendDirection;
  /** Czech label ready for display */
  label: string;
  emoji: string;
  colorClass: string;
}

/**
 * Simulate a plausible 24h-ago risk score, then return the trend.
 *
 * Rules:
 * - noUpdateCritical (>360 min offline) → vehicle was active 24h ago → score was lower
 * - noUpdate (15-360 min) → score was slightly lower or equal
 * - speedExtreme → transient event; 24h ago likely did not have it
 * - ecoEvent with multiple occurrences → events accumulate → score was lower
 * - ok vehicles with no reasons → stable
 */
export function computeRiskTrend(assessment: RiskAssessment): RiskTrend {
  const reasons = assessment.reasons;

  const criticalOffline = reasons.find((r) => r.type === "noUpdateCritical");
  const moderateOffline = reasons.find((r) => r.type === "noUpdate");
  const speedExtreme = reasons.find((r) => r.type === "speedExtreme");
  const ecoEvent = reasons.find((r) => r.type === "ecoEvent");

  let simulatedPrevScore = assessment.riskScore;

  // Long offline: vehicle was active 24h ago — prior score much lower
  if (criticalOffline) {
    // Only subtract if the vehicle wasn't already offline for more than 48h
    const offlineMins = criticalOffline.value;
    if (offlineMins < 1440) {
      simulatedPrevScore -= 4;
    }
    // 48h+ offline → already offline 24h ago → stable (no subtraction)
  } else if (moderateOffline) {
    simulatedPrevScore -= 1;
  }

  // Extreme speed is typically transient; 24h ago it likely wasn't happening
  if (speedExtreme) {
    simulatedPrevScore -= 2;
  }

  // Eco events accumulate; 24h ago there were fewer
  if (ecoEvent && ecoEvent.count !== undefined && ecoEvent.count > 2) {
    simulatedPrevScore -= 2;
  } else if (ecoEvent && ecoEvent.count !== undefined && ecoEvent.count >= 1) {
    simulatedPrevScore -= 1;
  }

  // If vehicle is already ok, no meaningful change
  if (assessment.riskScore === 0) {
    simulatedPrevScore = 0;
  }

  const delta = assessment.riskScore - Math.max(0, simulatedPrevScore);

  const direction: TrendDirection =
    delta > 0 ? "up" : delta < 0 ? "down" : "stable";

  const labelMap: Record<TrendDirection, string> = {
    up: "Riziko roste",
    down: "Riziko klesá",
    stable: "Stabilní",
  };

  const emojiMap: Record<TrendDirection, string> = {
    up: "🔺",
    down: "🔻",
    stable: "➖",
  };

  const colorClassMap: Record<TrendDirection, string> = {
    up: "text-red-400",
    down: "text-green-400",
    stable: "text-slate-400",
  };

  return {
    delta,
    direction,
    label: labelMap[direction],
    emoji: emojiMap[direction],
    colorClass: colorClassMap[direction],
  };
}
