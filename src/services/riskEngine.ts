import type { Vehicle } from "../types/vehicle";
import type {
  RiskAssessment,
  RiskLevel,
  RiskReason,
} from "../types/risk";

export function calculateRisk(
  vehicle: Vehicle
): RiskAssessment {
  let riskScore = 0;
  const reasons: RiskReason[] = [];

  /* -----------------------
     SPEED RISK
  ------------------------ */

  if (vehicle.Speed > 130) {
    riskScore += 4;
    reasons.push({
      type: "speedExtreme",
      value: vehicle.Speed,
    });
  } else if (vehicle.Speed > 110) {
    riskScore += 3;
    reasons.push({
      type: "speedHigh",
      value: vehicle.Speed,
    });
  } else if (vehicle.Speed > 95) {
    riskScore += 2;
    reasons.push({
      type: "speedAboveLimit",
      value: vehicle.Speed,
    });
  } else if (vehicle.Speed > 85) {
    riskScore += 1;
    reasons.push({
      type: "speedSlightlyElevated",
      value: vehicle.Speed,
    });
  }

  /* -----------------------
     UPDATE DELAY RISK
  ------------------------ */

  const lastUpdateTime = new Date(
    vehicle.LastPositionTimestamp
  ).getTime();

  const now = Date.now();
  const minutesSinceUpdate =
    (now - lastUpdateTime) / (1000 * 60);

  const minutes = Math.floor(minutesSinceUpdate);

  if (minutesSinceUpdate > 180) {
    riskScore += 3;
    reasons.push({
      type: "noUpdate",
      value: minutes,
    });
  } else if (minutesSinceUpdate > 60) {
    riskScore += 2;
    reasons.push({
      type: "noUpdate",
      value: minutes,
    });
  } else if (minutesSinceUpdate > 15) {
    riskScore += 1;
    reasons.push({
      type: "noUpdate",
      value: minutes,
    });
  }

  /* -----------------------
     FINAL RISK LEVEL
  ------------------------ */

  let riskLevel: RiskLevel;

  if (riskScore >= 6) {
    riskLevel = "critical";
  } else if (riskScore >= 3) {
    riskLevel = "warning";
  } else {
    riskLevel = "ok";
  }

  return {
    vehicleId: vehicle.Code,
    vehicleName: vehicle.Name,
    spz: vehicle.SPZ ?? "",
    speed: vehicle.Speed,
    riskScore,
    riskLevel,
    reasons,
    calculatedAt: new Date().toISOString(),
  };
}
