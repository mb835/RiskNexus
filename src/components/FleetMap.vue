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

/* -------------------------
   PROPS
-------------------------- */

interface Props {
  assessments: RiskAssessment[];
  focusCoordinates?: { latitude: number; longitude: number } | null;
}

const props = defineProps<Props>();

/* -------------------------
   STATE
-------------------------- */

const mapContainer = ref<HTMLElement | null>(null);
const mapInstance  = ref<L.Map | null>(null);
const clusterGroup = ref<L.MarkerClusterGroup | null>(null);
const mapFocus     = ref<"europe" | "czech">("europe");
const isMapDestroyed = ref(false);
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
    const icon = getVehicleIcon(vehicleType, assessment.riskLevel);

    const weatherReason = assessment.reasons.find((r) => r.type === "weather");
    const weatherContribution =
      weatherReason && Number(weatherReason.value) > 0
        ? Number(weatherReason.value)
        : 0;

    const marker = L.marker([lat, lng], { icon });

    const riskScoreLine =
      weatherContribution > 0
        ? `<strong>Risk Score:</strong> ${assessment.riskScore} <span style="color:#38bdf8;font-size:10px;">(+${weatherContribution} počasí)</span>`
        : `<strong>Risk Score:</strong> ${assessment.riskScore}`;

    const popupContent = `
      <div style="font-family: system-ui; min-width: 220px;">
        <div style="font-weight:600;margin-bottom:6px;">
          ${assessment.vehicleName}
        </div>
        <div style="font-size:12px;color:#64748b;margin-bottom:6px;">
          ${assessment.spz || "Bez SPZ"}
        </div>
        <div style="font-size:12px;">
          <strong>Typ:</strong> ${
            vehicleTypeCzech.charAt(0).toUpperCase() +
            vehicleTypeCzech.slice(1)
          }
        </div>
        <div style="font-size:12px;">
          <strong>Rychlost:</strong> ${assessment.speed} km/h
        </div>
        <div style="font-size:12px;">
          ${riskScoreLine}
        </div>
        <div style="font-size:12px;color:${getRiskColor(assessment.riskLevel)};">
          <strong>Riziko:</strong> ${getRiskLabel(
            assessment.riskLevel
          )}
        </div>
      </div>
    `;

    if (map) {
      marker.bindPopup(popupContent);
    }
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

watch(mapFocus, () => {
  renderMarkers();
});

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
      style="height: 600px;"
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
