import type { Vehicle } from "../types/vehicle";
import type {
  RiskAssessment,
  RiskLevel,
  RiskReason,
} from "../types/risk";
import type { EcoEvent } from "../types/ecoEvent";
import { calculateWeatherRisk } from "./weatherRiskEngine";
import type { WeatherData } from "./weatherRiskEngine";

export function calculateRisk(
  vehicle: Vehicle,
  ecoEvents?: EcoEvent[],
  weatherData?: WeatherData,
  weatherEnabled?: boolean,
): RiskAssessment {
  try {
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

  if (minutesSinceUpdate > 360) {
    riskScore += 6;
    reasons.push({
      type: "noUpdateCritical",
      value: minutes,
    });
  } else if (minutesSinceUpdate > 180) {
    riskScore += 4;
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
     ECO EVENT RISK (AGGREGATED)
  ------------------------ */

  if (ecoEvents && ecoEvents.length > 0) {
    const totalSeverity = ecoEvents.reduce(
      (sum, event) => sum + event.EventSeverity,
      0
    );

    riskScore += totalSeverity;

    reasons.push({
      type: "ecoEvent",
      value: totalSeverity,
      count: ecoEvents.length,
    });
  }

  /* -----------------------
     WEATHER RISK (optional)
  ------------------------ */

  if (weatherEnabled && weatherData) {
    const { weatherRiskBump, reasons: weatherReasons } =
      calculateWeatherRisk(weatherData);

    riskScore += weatherRiskBump;

    weatherReasons.forEach((reason) => {
      reasons.push({ type: "weather", value: reason });
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
    position: {
      latitude: vehicle.LastPosition?.Latitude ?? 0,
      longitude: vehicle.LastPosition?.Longitude ?? 0,
    },
  };
  } catch (error) {
    console.error("calculateRisk failed:", vehicle.Code, error);
    return {
      vehicleId: vehicle.Code,
      vehicleName: vehicle.Name,
      spz: vehicle.SPZ ?? "",
      speed: vehicle.Speed ?? 0,
      riskScore: 0,
      riskLevel: "ok",
      reasons: [],
      calculatedAt: new Date().toISOString(),
      position: {
        latitude: vehicle.LastPosition?.Latitude ?? "0",
        longitude: vehicle.LastPosition?.Longitude ?? "0",
      },
    };
  }
}
