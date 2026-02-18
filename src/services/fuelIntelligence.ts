/**
 * fuelIntelligence.ts
 *
 * Deterministic anomaly detection over a FuelSnapshot time series.
 * Pure function — no side effects, no API calls.
 *
 * Rules (evaluated in priority order, first match wins):
 *   1. Sudden drop while stationary  → severity "high"
 *   2. Abnormal consumption vs speed → severity "medium"
 *   3. No anomaly detected           → severity "none"
 */

import type { FuelSnapshot } from "./fuelService";

/* -------------------------
   THRESHOLDS
-------------------------- */

/** Minimum fuel drop (L) between two readings to be considered suspicious */
const DROP_THRESHOLD_L = 5;

/** Max speed (km/h) at which a vehicle is considered stationary */
const STATIONARY_SPEED_KMH = 3;

/** Consumption rate (L/h) above which we flag abnormal consumption */
const ABNORMAL_RATE_LPH = 10;

/** Speed (km/h) below which high consumption is anomalous */
const LOW_SPEED_THRESHOLD_KMH = 10;

/* -------------------------
   PUBLIC TYPES
-------------------------- */

export type FuelSeverity = "none" | "low" | "medium" | "high";

export interface FuelRiskResult {
  suspiciousDrop: boolean;
  dropAmount?: number;
  description?: string;
  severity: FuelSeverity;
}

/* -------------------------
   DETECTION HELPERS
-------------------------- */

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Rule 1 — Sudden fuel drop while the vehicle is stationary.
 * Iterates consecutive pairs; returns on first match.
 */
function detectSuddenDrop(snapshots: FuelSnapshot[]): FuelRiskResult | null {
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];

    if (
      prev.fuelVolume !== undefined &&
      curr.fuelVolume !== undefined &&
      curr.speed !== undefined
    ) {
      const drop = prev.fuelVolume - curr.fuelVolume;

      if (drop > DROP_THRESHOLD_L && curr.speed <= STATIONARY_SPEED_KMH) {
        const amount = round1(drop);
        return {
          suspiciousDrop: true,
          dropAmount: amount,
          description: `Podezřelý úbytek paliva – ${amount} L při stojícím vozidle`,
          severity: "high",
        };
      }
    }
  }
  return null;
}

/**
 * Rule 2 — Abnormal total consumption rate inconsistent with speed.
 * Compares first and last FuelConsumedTotal readings.
 * Assumes approximately one entry per minute.
 */
function detectAbnormalConsumption(snapshots: FuelSnapshot[]): FuelRiskResult | null {
  const first = snapshots[0];
  const last  = snapshots[snapshots.length - 1];

  if (
    first.fuelConsumedTotal !== undefined &&
    last.fuelConsumedTotal  !== undefined &&
    last.speed              !== undefined
  ) {
    const totalConsumed  = last.fuelConsumedTotal - first.fuelConsumedTotal;
    const durationHours  = snapshots.length / 60;
    const consumptionRate = durationHours > 0 ? totalConsumed / durationHours : 0;

    if (consumptionRate > ABNORMAL_RATE_LPH && last.speed < LOW_SPEED_THRESHOLD_KMH) {
      return {
        suspiciousDrop: false,
        description: `Abnormální spotřeba paliva – ${round1(consumptionRate)} L/h při nízké rychlosti`,
        severity: "medium",
      };
    }
  }
  return null;
}

/* -------------------------
   PUBLIC API
-------------------------- */

/**
 * Evaluate a sorted chronological snapshot series for fuel anomalies.
 * Requires at least 2 data points; returns "none" severity otherwise.
 */
export function evaluateFuelRisk(snapshots: FuelSnapshot[]): FuelRiskResult {
  if (snapshots.length < 2) {
    return { suspiciousDrop: false, severity: "none" };
  }

  return (
    detectSuddenDrop(snapshots) ??
    detectAbnormalConsumption(snapshots) ??
    { suspiciousDrop: false, severity: "none" }
  );
}
