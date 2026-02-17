import type { Vehicle } from "../types/vehicle";
import type { RiskAssessment } from "../types/risk";

export function calculateRisk(vehicle: Vehicle): RiskAssessment {
  let riskScore = 0;
  const reasons: string[] = [];

  // ---- Speed evaluation ----
  if (vehicle.speed > 110) {
    riskScore += 3;
    reasons.push(`Speed exceeds 110 km/h (${vehicle.speed} km/h)`);
  } else if (vehicle.speed > 90) {
    riskScore += 1;
    reasons.push(`Speed exceeds 90 km/h (${vehicle.speed} km/h)`);
  }

  // ---- Last update validation ----
  const lastUpdateTime = new Date(vehicle.lastUpdate).getTime();

  if (Number.isNaN(lastUpdateTime)) {
    riskScore += 2;
    reasons.push("Invalid last update timestamp");
  } else {
    const now = Date.now();
    const diffMs = now - lastUpdateTime;
    const minutesSinceUpdate = diffMs / (1000 * 60);

    if (minutesSinceUpdate > 5) {
      riskScore += 2;
      reasons.push(
        `No update for ${Math.floor(minutesSinceUpdate)} minutes`
      );
    }
  }

  // ---- Risk level mapping ----
  let riskLevel: "ok" | "warning" | "critical";

  if (riskScore >= 5) {
    riskLevel = "critical";
  } else if (riskScore >= 3) {
    riskLevel = "warning";
  } else {
    riskLevel = "ok";
  }

  return {
    vehicleId: vehicle.id,
    riskScore,
    riskLevel,
    reasons,
    calculatedAt: new Date().toISOString(),
  };
}
