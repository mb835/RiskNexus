import L from "leaflet";
import type { RiskLevel } from "../types/risk";
import type { VehicleType } from "./vehicleType";

/* -------------------------
   RISK COLOR
-------------------------- */

function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case "ok":
      return "#22c55e"; // green
    case "warning":
      return "#eab308"; // yellow
    case "critical":
      return "#ef4444"; // red
    default:
      return "#22c55e";
  }
}

/* -------------------------
   PULSE STYLE (CRITICAL ONLY)
-------------------------- */

const pulseStyle = `
@keyframes pulse {
  0% { filter: drop-shadow(0 0 4px currentColor); }
  50% { filter: drop-shadow(0 0 14px currentColor); }
  100% { filter: drop-shadow(0 0 4px currentColor); }
}
`;

/* -------------------------
   ICON CREATION (EMOJI)
-------------------------- */

function createIcon(
  vehicleType: VehicleType,
  riskLevel: RiskLevel
): L.DivIcon {

  const color = getRiskColor(riskLevel);
  const pulse = riskLevel === "critical";

  let emoji: string;
  let size: number;

  switch (vehicleType) {
    case "car":
      emoji = "🚗";
      size = 40;
      break;

    case "van":
      emoji = "🚐";
      size = 40;
      break;

    case "truck":
      emoji = "🚛";
      size = 44;
      break;

    default:
      emoji = "🚗";
      size = 40;
  }

  // Critical markers are rendered larger so they stand out at a glance
  if (riskLevel === "critical") size += 10;

  return L.divIcon({
    className: "vehicle-emoji-icon",
    html: `
      <style>${pulse ? pulseStyle : ""}</style>
      <div style="
        font-size: 32px;
        line-height: 32px;
        text-align: center;
        color: ${color};
        ${pulse ? "animation:pulse 1.2s infinite;" : ""}
        font-family: 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif;
      ">
        ${emoji}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 6],
    popupAnchor: [0, -size + 8],
  });
}

/* -------------------------
   ICON CACHE
-------------------------- */

const iconCache = new Map<string, L.DivIcon>();

export function getVehicleIcon(
  vehicleType: VehicleType,
  riskLevel: RiskLevel
): L.DivIcon {

  const key = `${vehicleType}-${riskLevel}`;

  if (!iconCache.has(key)) {
    iconCache.set(key, createIcon(vehicleType, riskLevel));
  }

  return iconCache.get(key)!;
}
