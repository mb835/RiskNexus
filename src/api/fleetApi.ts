const BASE_URL = "/gps-api";
const USERNAME = "api_gpsdozor";
const PASSWORD = "yakmwlARdn";

function getAuthHeaders(): HeadersInit {
  const credentials = btoa(`${USERNAME}:${PASSWORD}`);
  return {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };
}

export async function fetchGroups(): Promise<any> {
  const response = await fetch(`${BASE_URL}/groups`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch groups: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchVehiclesByGroup(groupCode: string): Promise<any> {
  const response = await fetch(`${BASE_URL}/groups/${groupCode}/vehicles`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch vehicles for group ${groupCode}: ${response.statusText}`
    );
  }

  return response.json();
}

export async function fetchVehicle(vehicleCode: string): Promise<any> {
  const response = await fetch(`${BASE_URL}/vehicles/${vehicleCode}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch vehicle ${vehicleCode}: ${response.statusText}`
    );
  }

  return response.json();
}
