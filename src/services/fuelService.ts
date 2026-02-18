/**
 * fuelService.ts
 *
 * Fetches fuel and speed sensor data from the GPS Dozor API
 * via the local proxy server.
 *
 * Time window: last 60 minutes, computed at call time.
 * No mock data — real sensor readings only.
 */

const SENSOR_NAMES = "FuelActualVolume,FuelConsumedTotal,Speed";
const WINDOW_MINUTES = 60;

/* -------------------------
   PUBLIC TYPES
-------------------------- */

export interface FuelSnapshot {
  timestamp: string;
  fuelVolume?: number;
  fuelConsumedTotal?: number;
  speed?: number;
}

/* -------------------------
   INTERNAL — real GPS Dozor API shape
   Response is an array of per-sensor items:
   [{ Name: "FuelActualVolume", data: [{ t: "ISO", v: 45.2 }, ...] }, ...]
-------------------------- */

interface RawDataPoint {
  t?: string;
  v?: number;
}

interface RawSensorItem {
  Name?: string;
  name?: string;
  data?: RawDataPoint[];
  Data?: RawDataPoint[];
}

/* -------------------------
   HELPERS
-------------------------- */

function formatDate(date: Date): string {
  // Format expected by GPS Dozor: YYYY-MM-DDTHH:mm
  return date.toISOString().slice(0, 16);
}

function buildTimeWindow(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - WINDOW_MINUTES * 60 * 1000);
  return { from: formatDate(from), to: formatDate(to) };
}

function getSensorData(items: RawSensorItem[], sensorName: string): RawDataPoint[] {
  const item = items.find(
    (i) => (i.Name ?? i.name ?? "").toLowerCase() === sensorName.toLowerCase()
  );
  return item?.data ?? item?.Data ?? [];
}

/**
 * Merges per-sensor data arrays into a unified timeline.
 * Each unique timestamp becomes one FuelSnapshot entry.
 */
function mergeIntoSnapshots(items: RawSensorItem[]): FuelSnapshot[] {
  const map = new Map<string, FuelSnapshot>();

  const setOrMerge = (t: string, patch: Partial<FuelSnapshot>) => {
    map.set(t, { timestamp: t, ...map.get(t), ...patch });
  };

  for (const p of getSensorData(items, "FuelActualVolume")) {
    if (p.t) setOrMerge(p.t, { fuelVolume: p.v });
  }
  for (const p of getSensorData(items, "FuelConsumedTotal")) {
    if (p.t) setOrMerge(p.t, { fuelConsumedTotal: p.v });
  }
  for (const p of getSensorData(items, "Speed")) {
    if (p.t) setOrMerge(p.t, { speed: p.v });
  }

  return Array.from(map.values()).sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );
}

/* -------------------------
   PUBLIC API
-------------------------- */

/**
 * Fetch the last 60 minutes of fuel + speed sensor snapshots
 * for a single vehicle. Returns a chronologically sorted array.
 *
 * Throws on network / API errors — callers should handle gracefully.
 */
export async function fetchFuelSnapshots(
  vehicleCode: string
): Promise<FuelSnapshot[]> {
  const { from, to } = buildTimeWindow();

  const params = new URLSearchParams({ from, to });
  const url = `/api/vehicle/${vehicleCode}/sensors/${SENSOR_NAMES}?${params}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Fuel sensor API error ${response.status}: ${response.statusText}`);
  }

  const raw: unknown = await response.json();

  if (!Array.isArray(raw)) return [];

  return mergeIntoSnapshots(raw as RawSensorItem[]);
}
