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

const SERVICE_INTERVAL_KM = 10_000;
const ODOMETER_MIN_KM     = 10_000;
const ODOMETER_RANGE_KM   = 170_000; // results in 10 000 – 180 000

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
 * - odometer      — stable mock between 10 000 and 180 000 km
 * - remainingKm   — stable mock between 0 and 9 999 km
 * - nextServiceAt — odometer + remainingKm
 * - serviceStatus — derived from remainingKm thresholds
 */
export function getServiceInfo(vehicleId: string): ServiceInfo {
  const h = hashVehicleId(vehicleId);

  // Use low bits for odometer, shifted bits for remaining (independent)
  const odometer    = ODOMETER_MIN_KM + (h % (ODOMETER_RANGE_KM + 1));
  const remainingKm = (h >>> 4) % SERVICE_INTERVAL_KM;
  const nextServiceAt = odometer + remainingKm;

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
 * Represents how much of the service interval has been consumed.
 * Full bar (100%) = needs service now.
 */
export function serviceProgressPercent(remainingKm: number): number {
  const consumed = SERVICE_INTERVAL_KM - remainingKm;
  return Math.min(100, Math.max(0, Math.round((consumed / SERVICE_INTERVAL_KM) * 100)));
}
