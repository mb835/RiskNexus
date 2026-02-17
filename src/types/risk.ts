export type RiskLevel = "ok" | "warning" | "critical";

/* -------------------------
   STRUKTUROVANÉ DŮVODY
-------------------------- */

export type RiskReasonType =
  | "speedExtreme"
  | "speedHigh"
  | "speedAboveLimit"
  | "speedSlightlyElevated"
  | "noUpdate";

export interface RiskReason {
  type: RiskReasonType;
  value: number;
}

/* -------------------------
   HLAVNÍ MODEL
-------------------------- */

export interface RiskAssessment {
  vehicleId: string;
  vehicleName: string;
  spz: string;
  speed: number;
  riskScore: number;
  riskLevel: RiskLevel;
  reasons: RiskReason[];
  calculatedAt: string;
}
