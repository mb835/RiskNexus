/**
 * maintenanceService.ts
 *
 * Deterministic oil-change / service interval tracking.
 *
 * Odometer and remaining-km values are mocked per vehicleId using a
 * stable integer hash, so values are consistent across page refreshes
 * and do not rely on any external API.
 *
 * All business logic lives here — components only consume ServiceInfo.
 */

import type { ServiceInfo, ServiceStatus } from "../types/risk";

/* -------------------------
   CONSTANTS
-------------------------- */

const ODOMETER_MIN_KM  = 10_000;
const ODOMETER_RANGE_KM = 170_000; // results in 10 000 – 180 000

/* -------------------------
   DETERMINISTIC HASH
   Produces a stable 32-bit integer from any string.
-------------------------- */

function hashVehicleId(id: string): number {
  let h = 0;
  for (const char of id) {
    h = (Math.imul(31, h) + char.charCodeAt(0)) | 0;
  }
  return Math.abs(h);
}

/* -------------------------
   PUBLIC API
-------------------------- */

/**
 * Returns a deterministic ServiceInfo object for a given vehicleId.
 *
 * - serviceInterval    — per-vehicle interval between 8 000 and 15 000 km
 * - odometer           — stable mock between 10 000 and 180 000 km
 * - kmSinceLastService — position within the current interval (independent seed)
 * - remainingKm        — serviceInterval − kmSinceLastService
 * - nextServiceAt      — lastServiceAt + serviceInterval
 * - serviceStatus      — derived from remainingKm thresholds
 *
 * All values are fully deterministic per vehicleId.
 * Two separate hash seeds ensure odometer and progress are independent.
 */
export function getServiceInfo(vehicleId: string): ServiceInfo {
  const baseHash     = hashVehicleId(vehicleId);
  const progressHash = hashVehicleId(vehicleId + "_progress");
  const odometerHash = hashVehicleId(vehicleId + "_odo");

  const serviceInterval    = 8_000 + (baseHash % 7_000);          // 8 000 – 14 999 km
  const kmSinceLastService = progressHash % serviceInterval;       // 0 – (serviceInterval − 1)
  const remainingKm        = serviceInterval - kmSinceLastService;

  const odometer      = ODOMETER_MIN_KM + (odometerHash % (ODOMETER_RANGE_KM + 1));
  const lastServiceAt = odometer - kmSinceLastService;
  const nextServiceAt = lastServiceAt + serviceInterval;

  const serviceStatus: ServiceStatus =
    remainingKm <= 500  ? "critical" :
    remainingKm <= 2000 ? "warning"  :
    "ok";

  return { odometer, nextServiceAt, remainingKm, serviceStatus };
}
/* -------------------------
   DISPLAY HELPERS
   Used by components — keeps formatting logic out of templates.
-------------------------- */

export function formatKm(km: number): string {
  return km.toLocaleString("cs-CZ") + " km";
}

export function serviceStatusLabel(status: ServiceStatus): string {
  switch (status) {
    case "ok":       return "V pořádku";
    case "warning":  return "Brzy servis";
    case "critical": return "Servis nutný";
  }
}

/**
 * Progress bar fill percentage (0–100).
 * Represents how much of the vehicle's service interval has been consumed.
 * Full bar (100%) = needs service now.
 *
 * remainingKm is passed directly so the caller does not need to recompute it.
 * The interval is back-derived as: nextServiceMileage − (currentMileage − remainingKm).
 */
export function serviceProgressPercent(
  currentMileage: number,
  nextServiceMileage: number,
  remainingKm: number,
): number {
  const interval = nextServiceMileage - (currentMileage - remainingKm);

  if (interval <= 0) return 0;

  const used = interval - remainingKm;
  return Math.min(100, Math.max(0, Math.round((used / interval) * 100)));
}
