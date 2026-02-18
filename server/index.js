import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = 3001;

/* ---------------------------
   MIDDLEWARE
---------------------------- */

app.use(cors());

/* ---------------------------
   ENV VALIDATION
---------------------------- */

const BASE_URL = process.env.GPS_API_BASE;
const USERNAME = process.env.GPS_API_USER;
const PASSWORD = process.env.GPS_API_PASSWORD;

if (!BASE_URL || !USERNAME || !PASSWORD) {
  console.error("❌ Missing GPS API environment variables.");
  console.error("Required:");
  console.error("GPS_API_BASE");
  console.error("GPS_API_USER");
  console.error("GPS_API_PASSWORD");
  process.exit(1);
}

/* ---------------------------
   AUTH HEADER
---------------------------- */

function getAuthHeaders() {
  const credentials = Buffer.from(
    `${USERNAME}:${PASSWORD}`
  ).toString("base64");

  return {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  };
}

/* ---------------------------
   PROXY HANDLER
---------------------------- */

async function proxyRequest(res, url) {
  try {
    const response = await fetch(url, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: "Upstream API error",
        status: response.status,
        message: text,
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({
      error: "Proxy error",
      message: "Failed to communicate with GPS API",
    });
  }
}

/* ---------------------------
   ROUTES
---------------------------- */

app.get("/api/groups", async (_, res) => {
  await proxyRequest(res, `${BASE_URL}/groups`);
});

app.get("/api/vehicles/:groupCode", async (req, res) => {
  const { groupCode } = req.params;

  await proxyRequest(
    res,
    `${BASE_URL}/vehicles/group/${groupCode}`
  );
});

app.get("/api/vehicle/:vehicleCode/eco", async (req, res) => {
  const { vehicleCode } = req.params;

  const to = new Date();
  const from = new Date(
    to.getTime() - 24 * 60 * 60 * 1000
  );

  const format = (date) =>
    date.toISOString().slice(0, 16);

  const fromStr = format(from);
  const toStr = format(to);

  await proxyRequest(
    res,
    `${BASE_URL}/vehicle/${vehicleCode}/eco-driving-events?from=${fromStr}&to=${toStr}`
  );
});

/* ---------------------------
   FUEL / SENSOR ROUTE
---------------------------- */

app.get("/api/vehicle/:vehicleCode/sensors/:sensorNames", async (req, res) => {
  const { vehicleCode, sensorNames } = req.params;
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: "Missing required query params: from, to" });
  }

  await proxyRequest(
    res,
    `${BASE_URL}/vehicle/${vehicleCode}/sensors/${sensorNames}?from=${from}&to=${to}`
  );
});

/* ---------------------------
   START SERVER
---------------------------- */

app.listen(PORT, () => {
  console.log(
    `🚀 Proxy server running on http://localhost:${PORT}`
  );
});
