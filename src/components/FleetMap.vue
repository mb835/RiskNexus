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
const mapInstance = ref<L.Map | null>(null);
let markerLayer: L.MarkerClusterGroup | null = null;

const mapFocus = ref<"europe" | "czech">("europe");

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

/* -------------------------
   MAP INIT
-------------------------- */

function initMap() {
  if (!mapContainer.value) return;

  mapInstance.value = L.map(mapContainer.value, {
    center: [50.0755, 14.4378],
    zoom: 6,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(mapInstance.value);

  markerLayer = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 60,
    disableClusteringAtZoom: 12,
  });

  mapInstance.value.addLayer(markerLayer);

  renderMarkers();
}

/* -------------------------
   RENDER MARKERS
-------------------------- */

function renderMarkers() {
  if (!mapInstance.value || !markerLayer) return;

  markerLayer.clearLayers();

  const valid = props.assessments.filter((a) => {
    const lat = parseFloat(a.position.latitude);
    const lng = parseFloat(a.position.longitude);
    return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
  });

  if (valid.length === 0) {
    mapInstance.value.setView([50, 14], 5, { animate: false });
    return;
  }

  const bounds = L.latLngBounds([]);

  valid.forEach((assessment) => {
    const lat = parseFloat(assessment.position.latitude);
    const lng = parseFloat(assessment.position.longitude);

    const latLng = L.latLng(lat, lng);
    bounds.extend(latLng);

    const vehicleType = getVehicleType(assessment.vehicleName);
    const vehicleTypeCzech = getVehicleTypeCzech(assessment.vehicleName);
    const icon = getVehicleIcon(vehicleType, assessment.riskLevel);

    const marker = L.marker(latLng, { icon });

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
          <strong>Riziko:</strong> ${getRiskLabel(
            assessment.riskLevel
          )}
        </div>
      </div>
    `;

    marker.bindPopup(popupContent);
    markerLayer!.addLayer(marker);
  });

  applyViewport(bounds, valid.length);
}

/* -------------------------
   VIEWPORT
-------------------------- */

function applyViewport(bounds: L.LatLngBounds, count: number) {
  if (!mapInstance.value) return;

  if (mapFocus.value === "czech") {
    mapInstance.value.setView([49.8, 15.5], 7, { animate: false });
    return;
  }

  if (count === 1) {
    mapInstance.value.setView(bounds.getCenter(), 9, { animate: false });
  } else {
    mapInstance.value.fitBounds(bounds, {
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

    setTimeout(() => {
      if (!mapInstance.value) return;
      mapInstance.value.invalidateSize();
      mapInstance.value.setView([latitude, longitude], 15, {
        animate: true,
      });
    }, 200);
  }
});

onUnmounted(() => {
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
  <div
    v-if="props.assessments.length === 0"
    class="w-full rounded-xl bg-slate-900 flex items-center justify-center"
    style="height: 600px;"
  >
    <p class="text-slate-400">Žádná aktivní vozidla</p>
  </div>

  <div v-else class="space-y-4">
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
      class="w-full rounded-xl overflow-hidden"
      style="height: 600px;"
    ></div>
  </div>
</template>
