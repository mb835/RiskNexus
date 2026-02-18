/**
 * actionIntelligenceService.ts
 *
 * Derives operational urgency from a RiskAssessment.
 * Pure function — no side effects, no external state.
 *
 * Three levels:
 *   immediate → vehicle needs intervention right now
 *   soon      → elevated risk, should be addressed today
 *   monitor   → low risk, keep an eye on it
 */

import type { RiskAssessment } from "../types/risk";

export type ActionLevel = "immediate" | "soon" | "monitor";

export interface ActionIntelligence {
  level: ActionLevel;
  /** Czech label ready for display */
  label: string;
  /** Tailwind classes for the badge */
  badgeClass: string;
  /** Dot colour class for compact indicators */
  dotClass: string;
}

const ACTIONS: Record<ActionLevel, Omit<ActionIntelligence, "level">> = {
  immediate: {
    label: "Okamžitě řešit",
    badgeClass:
      "bg-red-700/40 text-red-400 border border-red-600",
    dotClass: "bg-red-500",
  },
  soon: {
    label: "Vyžaduje pozornost",
    badgeClass:
      "bg-yellow-700/40 text-yellow-400 border border-yellow-600",
    dotClass: "bg-yellow-400",
  },
  monitor: {
    label: "Monitorovat",
    badgeClass:
      "bg-slate-700/40 text-slate-400 border border-slate-600",
    dotClass: "bg-slate-500",
  },
};

function build(level: ActionLevel): ActionIntelligence {
  return { level, ...ACTIONS[level] };
}

/**
 * Determine the operational urgency of a vehicle based on its risk profile.
 *
 * Rules (evaluated top-down, first match wins):
 * 1. immediate — riskScore ≥ 6 AND (noUpdateCritical with ≥360 min OR speedExtreme)
 * 2. soon      — riskScore ≥ 3
 * 3. monitor   — everything else
 */
export function getActionIntelligence(
  assessment: RiskAssessment
): ActionIntelligence {
  const { riskScore, reasons } = assessment;

  const hasCriticalOffline = reasons.some(
    (r) => r.type === "noUpdateCritical" && r.value >= 360
  );
  const hasSpeedExtreme = reasons.some((r) => r.type === "speedExtreme");

  if (riskScore >= 6 && (hasCriticalOffline || hasSpeedExtreme)) {
    return build("immediate");
  }

  if (riskScore >= 3) {
    return build("soon");
  }

  return build("monitor");
}
