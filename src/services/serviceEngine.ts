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

export const SERVICE_INTERVAL = 15_000; // km between scheduled services

export interface ServiceCalculation {
  nextServiceAt: number;
  remainingKm: number;
  serviceStatus: ServiceStatus;
}

/**
 * Derive service status from a live odometer reading.
 *
 * nextServiceAt — the next multiple of SERVICE_INTERVAL at or above odometer
 * remainingKm   — km until that service point
 * serviceStatus — urgency level based on remainingKm
 */
export function calculateServiceStatus(odometer: number): ServiceCalculation {
  const nextServiceAt =
    Math.ceil(odometer / SERVICE_INTERVAL) * SERVICE_INTERVAL;

  const remainingKm = nextServiceAt - odometer;

  const serviceStatus: ServiceStatus =
    remainingKm <= 1000 ? "critical" :
    remainingKm <= 3000 ? "warning"  :
    "ok";

  return { nextServiceAt, remainingKm, serviceStatus };
}

/**
 * Progress bar percentage for the current service interval.
 * 0% = just serviced, 100% = service due now.
 */
export function serviceProgressPercent(odometer: number): number {
  return Math.min(100, Math.round(((odometer % SERVICE_INTERVAL) / SERVICE_INTERVAL) * 100));
}
