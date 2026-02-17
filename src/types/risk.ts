export interface RiskAssessment {
  vehicleId: string;
  riskScore: number;
  riskLevel: "ok" | "warning" | "critical";
  reasons: string[];
  calculatedAt: string;
}
