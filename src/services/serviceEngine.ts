/**
 * serviceEngine.ts
 *
 * Calculates oil-change / service status from the real odometer value
 * returned by the GPS Dozor API (field: Odometer).
 *
 * Intentionally kept separate from riskEngine.ts — service scheduling
 * is an independent concern from operational risk scoring.
 */

import type { ServiceStatus } from "../types/risk";

export interface ServiceCalculation {
  nextServiceAt: number;
  /** Km at which the previous service milestone falls. */
  lastServiceAt: number;
  remainingKm: number;
  serviceStatus: ServiceStatus;
  /** Percentage of the current service interval consumed (0–100). */
  progressPercent: number;
}

/**
 * Derive service status from a live odometer reading.
 *
 * serviceInterval — per-vehicle interval (10 000–20 000 km) seeded from the odometer,
 *                   giving each vehicle a different interval without extra parameters.
 * lastServiceAt   — most recent service milestone below the current odometer
 * nextServiceAt   — lastServiceAt + serviceInterval
 * remainingKm     — km until that service point
 * serviceStatus   — urgency level based on remainingKm
 */
export function calculateServiceStatus(odometer: number): ServiceCalculation {
  const intervalSeed    = Math.abs(Math.floor(odometer));
  const serviceInterval = 10_000 + (intervalSeed % 10_000); // 10 000 – 19 999 km

  const lastServiceAt = odometer - (odometer % serviceInterval);
  const nextServiceAt = lastServiceAt + serviceInterval;
  const remainingKm   = nextServiceAt - odometer;

  const serviceStatus: ServiceStatus =
    remainingKm <= 1000 ? "critical" :
    remainingKm <= 3000 ? "warning"  :
    "ok";

  const interval = nextServiceAt - lastServiceAt;
  const used     = odometer - lastServiceAt;
  const progressPercent = interval > 0
    ? Math.min(100, Math.max(0, Math.round((used / interval) * 100)))
    : 0;

  return { nextServiceAt, lastServiceAt, remainingKm, serviceStatus, progressPercent };
}
