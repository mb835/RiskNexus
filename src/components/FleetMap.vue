<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

import type { RiskAssessment, RiskLevel } from "../types/risk";
import { getVehicleType, getVehicleTypeCzech } from "../utils/vehicleType";
import { getVehicleIcon } from "../utils/mapIcons";
import { serviceStatusLabel } from "../services/maintenanceService";

/* -------------------------
   PROPS
-------------------------- */

interface Props {
  assessments: RiskAssessment[];
  focusCoordinates?: { latitude: number; longitude: number } | null;
  weatherRiskEnabled?: boolean;
  drawerOpen?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  weatherRiskEnabled: false,
  drawerOpen: false,
});

const emit = defineEmits<{
  (e: "open-detail", vehicleId: string): void;
}>();

/* -------------------------
   STATE
-------------------------- */

const mapContainer = ref<HTMLElement | null>(null);
const mapInstance  = ref<L.Map | null>(null);
const clusterGroup = ref<L.MarkerClusterGroup | null>(null);
const mapFocus     = ref<"europe" | "czech">("europe");
const isMapDestroyed = ref(false);
const isOpeningDetail = ref(false);

function handleOpenDetail(vehicleId: string, button: HTMLButtonElement) {
  if (isOpeningDetail.value) return;
  isOpeningDetail.value = true;
  button.classList.add("opacity-70", "cursor-wait");
  setTimeout(() => {
    emit("open-detail", vehicleId);
    isOpeningDetail.value = false;
    button.classList.remove("opacity-70", "cursor-wait");
  }, 180);
}
let focusTimeout: ReturnType<typeof setTimeout> | null = null;

/* -------------------------
   RISK LABEL
-------------------------- */

function getRiskLabel(level: RiskLevel): string {
  switch (level) {
    case "ok":
      return "V pořádku";
    case "warning":
      return "Varování";
    case "critical":
      return "Kritické";
  }
}

function getWeatherName(w: { weatherId: number; weatherMain?: string }): string {
  const id = w.weatherId;
  if (id >= 200 && id <= 299) return "Bouřka";
  if (id >= 300 && id <= 599) return "Déšť";
  if (id >= 600 && id <= 699) return "Sníh";
  if (id >= 700 && id <= 799) return "Mlha";
  const main = String(w.weatherMain ?? "").toLowerCase();
  if (main === "clear") return "Jasno";
  if (main === "clouds") return "Oblačno";
  return "Neznámé podmínky";
}

function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case "ok":
      return "#22c55e";
    case "warning":
      return "#f59e0b";
    case "critical":
      return "#ef4444";
  }
}

/* -------------------------
   MAP INIT
-------------------------- */

function initMap() {
  if (!mapContainer.value) return;

  mapInstance.value = L.map(mapContainer.value, {
    center: [50.0755, 14.4378],
    zoom: 6,
    maxZoom: 18,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(mapInstance.value);

  clusterGroup.value = L.markerClusterGroup({
    disableClusteringAtZoom: 10,
    spiderfyOnMaxZoom: true,
  });

  mapInstance.value.addLayer(clusterGroup.value);

  renderMarkers();
}

/* -------------------------
   RENDER MARKERS
-------------------------- */

function renderMarkers() {
  if (isMapDestroyed.value) return;

  const cluster = clusterGroup.value;
  const map = mapInstance.value;
  if (!map || !cluster) return;

  const mapWithLoaded = map as L.Map & { _loaded?: boolean };
  if (mapWithLoaded._loaded === false) return;

  cluster.clearLayers();

  const valid = props.assessments.filter((a) => {
    const lat = Number(a.position.latitude);
    const lng = Number(a.position.longitude);
    return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
  });

  if (valid.length === 0) {
    if (map && (map as L.Map & { _loaded?: boolean })._loaded !== false) {
      map.setView([50, 14], 5, { animate: false });
    }
    return;
  }

  const bounds = L.latLngBounds([]);

  valid.forEach((assessment) => {
    const lat = Number(assessment.position.latitude);
    const lng = Number(assessment.position.longitude);

    const latLng = L.latLng(lat, lng);
    bounds.extend(latLng);

    const vehicleType = getVehicleType(assessment.vehicleName);
    const vehicleTypeCzech = getVehicleTypeCzech(assessment.vehicleName);
    const weatherReason = assessment.reasons?.find((r) => r.type === "weather");
    const hasWeatherBadge =
      props.weatherRiskEnabled &&
      assessment.reasons.some(
        (r) => r.type === "weather" && Number(r.value) > 0
      );
    const weatherId = (assessment as { weatherData?: { weatherId?: number } }).weatherData?.weatherId;
    const icon = getVehicleIcon(
      vehicleType,
      assessment.riskLevel,
      assessment.serviceInfo?.serviceStatus,
      !!hasWeatherBadge,
      weatherId
    );

    const weatherContribution =
      weatherReason && Number(weatherReason.value) > 0
        ? Number(weatherReason.value)
        : 0;

    const marker = L.marker([lat, lng], { icon });

    const w = (assessment as { weatherData?: { temperature: number; windSpeed: number; precipitation: number; weatherId: number; weatherMain?: string } }).weatherData;
    const weatherLabel = w ? getWeatherName(w) : "";
    const svc = assessment.serviceInfo;
    const showServiceSection = svc && svc.serviceStatus !== "ok";
    const isServiceCritical = svc?.serviceStatus === "critical";

    const riskScoreLine =
      weatherContribution > 0
        ? `<strong>Risk Score:</strong> ${assessment.riskScore} <span style="color:#38bdf8;font-size:10px;">(+${weatherContribution} počasí)</span>`
        : `<strong>Risk Score:</strong> ${assessment.riskScore}`;

    const serviceSectionHtml = showServiceSection
      ? `
<hr style="margin:8px 0;border:0;border-top:1px solid #e2e8f0;" />
<div style="color:#ef4444;font-weight:600;font-size:12px;">
  🛠 ${serviceStatusLabel(svc.serviceStatus)}
</div>
${isServiceCritical ? `
<button data-vehicle-id="${assessment.vehicleId}" class="popup-detail-btn transition-all duration-200 active:scale-95 hover:brightness-110" style="margin-top:6px;background:#ef4444;color:white;border:none;padding:6px 10px;font-size:12px;border-radius:6px;cursor:pointer;">
  Otevřít detail vozidla
</button>
` : ""}
`
      : "";

    const weatherSectionHtml =
      weatherContribution > 0 && w
        ? `
<hr style="margin:8px 0;border:0;border-top:1px solid #e2e8f0;" />
<div style="font-size:12px;">
  <span style="color:#38bdf8;"><strong>Počasí:</strong> ${weatherLabel} (+${weatherContribution} bodů)</span>
</div>
<div style="font-size:12px;">Teplota: ${Math.round(w.temperature)} °C</div>
<div style="font-size:12px;">Vítr: ${Number(w.windSpeed).toFixed(1)} m/s</div>
<div style="font-size:12px;">Srážky: ${Number(w.precipitation).toFixed(1)} mm</div>
`
      : "";

    const fullPopupContent = `
<div style="font-family:system-ui;min-width:200px;max-width:220px;padding:12px;">
  <div style="font-weight:600;font-size:13px;margin-bottom:2px;">${assessment.vehicleName}</div>
  <div style="font-size:11px;color:#64748b;margin-bottom:6px;">${assessment.spz || "Bez SPZ"}</div>
  <div style="font-size:12px;"><strong>Typ:</strong> ${vehicleTypeCzech.charAt(0).toUpperCase() + vehicleTypeCzech.slice(1)}</div>
  <div style="font-size:12px;"><strong>Rychlost:</strong> ${assessment.speed} km/h</div>
  <div style="font-size:12px;">${riskScoreLine}</div>
  <div style="font-size:12px;color:${getRiskColor(assessment.riskLevel)};"><strong>Riziko:</strong> ${getRiskLabel(assessment.riskLevel)}</div>
  ${serviceSectionHtml}
  ${weatherSectionHtml}
  <button
    data-vehicle-id="${assessment.vehicleId}"
    class="popup-open-detail-btn"
    style="margin-top:10px;width:100%;background:#2563eb;color:white;border:none;padding:6px 10px;font-size:12px;border-radius:6px;cursor:pointer;"
  >
    Zobrazit detail
  </button>
</div>
`;

    marker.bindPopup(fullPopupContent);

    marker.on("popupopen", (e) => {
      const popupElement = e.popup.getElement();
      if (!popupElement) return;

      const buttons = popupElement.querySelectorAll<HTMLButtonElement>(
        "button[data-vehicle-id]"
      );

      buttons.forEach((button) => {
        const vehicleId = button.getAttribute("data-vehicle-id");
        if (!vehicleId) return;

        button.onclick = () => {
          handleOpenDetail(vehicleId, button);
        };
      });
    });

    cluster.addLayer(marker);
  });

  applyViewport(bounds, valid.length);
}

/* -------------------------
   VIEWPORT
-------------------------- */

function applyViewport(bounds: L.LatLngBounds, count: number) {
  const map = mapInstance.value;
  if (!map) return;

  const mapWithLoaded = map as L.Map & { _loaded?: boolean };
  if (mapWithLoaded._loaded === false) return;

  if (mapFocus.value === "czech") {
    map.setView([49.8, 15.5], 7, { animate: false });
    return;
  }

  if (count === 1) {
    map.setView(bounds.getCenter(), 9, { animate: false });
  } else {
    map.fitBounds(bounds, {
      padding: [50, 50],
      animate: false,
    });
  }
}

/* -------------------------
   LIFECYCLE
-------------------------- */

onMounted(() => {
  initMap();

  // Apply focus coordinates if provided at mount time.
  // Runs after initMap() so the default view is overridden, not the other way around.
  if (props.focusCoordinates && mapInstance.value) {
    const { latitude, longitude } = props.focusCoordinates;

    focusTimeout = setTimeout(() => {
      if (!mapInstance.value || isMapDestroyed.value) return;
      mapInstance.value.invalidateSize();
      mapInstance.value.setView([latitude, longitude], 15, {
        animate: false,
      });
      focusTimeout = null;
    }, 200);
  }
});

onUnmounted(() => {
  isMapDestroyed.value = true;
  if (focusTimeout) {
    clearTimeout(focusTimeout);
    focusTimeout = null;
  }
  mapInstance.value?.closePopup();
  clusterGroup.value?.clearLayers();

  if (clusterGroup.value && mapInstance.value) {
    mapInstance.value.removeLayer(clusterGroup.value);
    clusterGroup.value = null;
  }
  if (mapInstance.value) {
    mapInstance.value.remove();
    mapInstance.value = null;
  }
});

watch(
  () => props.assessments,
  () => renderMarkers(),
  { deep: true }
);

watch(
  () => props.weatherRiskEnabled,
  () => renderMarkers()
);

watch(mapFocus, () => {
  renderMarkers();
});

watch(
  () => props.drawerOpen,
  (isOpen) => {
    if (isOpen && mapInstance.value) {
      mapInstance.value.closePopup();
    }
  },
  { immediate: true }
);

</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-end">
      <div class="flex bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
        <button
          class="px-4 py-2 text-sm"
          :class="mapFocus === 'europe' ? 'bg-slate-700 text-white' : 'text-slate-400'"
          @click="mapFocus = 'europe'"
        >
          🌍 Celá Evropa
        </button>
        <button
          class="px-4 py-2 text-sm"
          :class="mapFocus === 'czech' ? 'bg-slate-700 text-white' : 'text-slate-400'"
          @click="mapFocus = 'czech'"
        >
          🇨🇿 Fokus ČR
        </button>
      </div>
    </div>

    <div
      ref="mapContainer"
      class="w-full rounded-xl overflow-hidden bg-slate-900 relative"
      style="height: 600px; z-index: 0;"
    >
      <div
        v-if="props.assessments.length === 0"
        class="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <p class="text-slate-400">Žádná aktivní vozidla</p>
      </div>
    </div>
  </div>
</template>
