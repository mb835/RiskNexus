export type RiskLevel = "ok" | "warning" | "critical";

/* -------------------------
   SERVICE / MAINTENANCE
-------------------------- */

export type ServiceStatus = "ok" | "warning" | "critical";

export interface ServiceInfo {
  /** Current odometer reading in km (from GPS Dozor API field Odometer) */
  odometer: number;
  /** Km reading at which next service is due */
  nextServiceAt: number;
  /** Km reading at which the previous service occurred */
  lastServiceAt?: number;
  /** Remaining km until service (nextServiceAt - odometer) */
  remainingKm: number;
  serviceStatus: ServiceStatus;
  /** Percentage of the current service interval consumed (0–100) */
  progressPercent: number;
}

/**
 * Local extension of RiskAssessment with maintenance data.
 * Computed client-side — do NOT persist or send to backend.
 */
export type AssessmentWithService = RiskAssessment & { serviceInfo: ServiceInfo };

export type RiskReasonType =
  | "speedExtreme"
  | "speedHigh"
  | "speedAboveLimit"
  | "speedSlightlyElevated"
  | "noUpdate"
  | "noUpdateCritical"
  | "ecoEvent";

export interface RiskReason {
  type: RiskReasonType;
  value: number;
  /**
   * Optional count (used for aggregated eco events)
   * Example: 3 eco events in last 24h
   */
  count?: number;
}

export interface RiskAssessment {
  vehicleId: string;
  vehicleName: string;
  spz: string;
  speed: number;
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: RiskReason[];
  calculatedAt: string;
  position: {
    latitude: string;
    longitude: string;
  };
}
