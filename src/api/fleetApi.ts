const BASE_URL = "/gps-api/api/v1";
const USERNAME = "api_gpsdozor";
const PASSWORD = "yakmwlARdn";

function getAuthHeaders(): HeadersInit {
  const credentials = btoa(`${USERNAME}:${PASSWORD}`);

  return {
    Authorization: `Basic ${credentials}`,
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `API Error ${response.status}: ${response.statusText} - ${text}`
    );
  }

  return response.json() as Promise<T>;
}

export async function fetchGroups(): Promise<any> {
  const response = await fetch(`${BASE_URL}/groups`, {
    headers: getAuthHeaders(),
  });

  return handleResponse(response);
}

export async function fetchVehiclesByGroup(
  groupCode: string
): Promise<any> {
  const response = await fetch(
    `${BASE_URL}/vehicles/group/${groupCode}`,
    {
      headers: getAuthHeaders(),
    }
  );

  return handleResponse(response);
}
