/**
 * weatherRiskEngine.ts
 *
 * Deterministic weather-based risk scoring.
 * Fully independent from riskEngine.ts — consumes normalised WeatherData
 * from the /api/weather endpoint and returns a risk bump + human-readable reasons.
 *
 * Scoring rules (capped at 4):
 *   Precipitation  0        → +0
 *                  (0, 2]   → +1
 *                  (2, 10]  → +2
 *                  > 10     → +3
 *   Wind speed     < 8 m/s  → +0
 *                  8–15 m/s → +1
 *                  > 15 m/s → +2
 *   Temperature    < 0 °C   → +1
 *                  > 35 °C  → +1
 *   Weather ID     200–299  → +2  (Thunderstorm)
 *                  600–699  → +2  (Snow)
 */

/* -------------------------
   PUBLIC TYPES
-------------------------- */

export interface WeatherData {
  temperature:  number;
  windSpeed:    number;
  weatherMain:  string;
  weatherId:    number;
  precipitation: number;
}

/* -------------------------
   PUBLIC API
-------------------------- */

export function calculateWeatherRisk(weather: WeatherData): {
  weatherRiskBump: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];
  
  // Precipitation
  
  if (weather.precipitation > 10) {
    score += 3;
    reasons.push("Heavy precipitation");
  } else if (weather.precipitation > 2) {
    score += 2;
    reasons.push("Moderate precipitation");
  } else if (weather.precipitation > 0) {
    score += 1;
    reasons.push("Light precipitation");
  }

  // Wind speed
  if (weather.windSpeed > 15) {
    score += 2;
    reasons.push("Strong wind");
  } else if (weather.windSpeed >= 8) {
    score += 1;
    reasons.push("Elevated wind speed");
  }

  // Temperature
  if (weather.temperature < 0) {
    score += 1;
    reasons.push("Sub-zero temperature");
  } else if (weather.temperature > 35) {
    score += 1;
    reasons.push("Extreme heat");
  }

  // Weather condition ID
  if (weather.weatherId >= 200 && weather.weatherId <= 299) {
    score += 2;
    reasons.push("Thunderstorm");
  } else if (weather.weatherId >= 600 && weather.weatherId <= 699) {
    score += 2;
    reasons.push("Snow conditions");
  }

  return {
    weatherRiskBump: Math.min(4, score),
    reasons,
  };
}
