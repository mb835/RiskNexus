<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import RiskChart from "./components/RiskChart.vue";
import FleetMap from "./components/FleetMap.vue";
import { fetchGroups, fetchVehiclesByGroup } from "./api/fleetApi";
import { fetchEcoEvents } from "./services/ecoEventsService";
import { calculateRisk } from "./services/riskEngine";
import type { Vehicle } from "./types/vehicle";
import type {
  RiskAssessment,
  RiskReason,
  RiskLevel,
} from "./types/risk";

/* -------------------------
   STATE
-------------------------- */

const loading = ref(true);
const riskAssessments = ref<RiskAssessment[]>([]);
const currentView = ref<"dashboard" | "map">("dashboard");
const activeFilter = ref<"all" | RiskLevel>("all");

/* Coordinates to zoom to on the map. Passed down to FleetMap. */
const focusCoordinates = ref<{ latitude: number; longitude: number } | null>(null);

/* -------------------------
   NAČTENÍ DAT
-------------------------- */

async function loadData() {
  try {
    const groups = await fetchGroups();
    if (!groups.length) return;

    const groupCode = groups[0].Code;

    const vehicles: Vehicle[] =
      await fetchVehiclesByGroup(groupCode);

    const assessments = await Promise.all(
      vehicles.map(async (vehicle) => {
        const ecoEvents = await fetchEcoEvents(vehicle.Code);
        return calculateRisk(vehicle, ecoEvents);
      })
    );

    riskAssessments.value = assessments;
  } catch (error) {
    console.error("Načítání dat selhalo:", error);
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

/* -------------------------
   FILTROVANÁ + SEŘAZENÁ DATA
-------------------------- */

const filteredAssessments = computed(() => {
  const base =
    activeFilter.value === "all"
      ? riskAssessments.value
      : riskAssessments.value.filter(
          (r) => r.riskLevel === activeFilter.value
        );

  // 🔥 ŘAZENÍ: nejvyšší riskScore nahoře
  return [...base].sort((a, b) => {
    if (b.riskScore !== a.riskScore) {
      return b.riskScore - a.riskScore;
    }

    // sekundární řazení podle rychlosti
    return b.speed - a.speed;
  });
});

/* -------------------------
   KPI (RAW DATA)
-------------------------- */

const totalVehicles = computed(
  () => riskAssessments.value.length
);

const criticalCount = computed(
  () =>
    riskAssessments.value.filter(
      (r) => r.riskLevel === "critical"
    ).length
);

const warningCount = computed(
  () =>
    riskAssessments.value.filter(
      (r) => r.riskLevel === "warning"
    ).length
);

const okCount = computed(
  () =>
    riskAssessments.value.filter(
      (r) => r.riskLevel === "ok"
    ).length
);

/* -------------------------
   OPERATIONAL PRIORITY
-------------------------- */

const priorityVehicles = computed(() => {
  const critical = riskAssessments.value.filter(
    (r) =>
      r.riskLevel === "critical" ||
      r.reasons.some((reason) => reason.type === "noUpdateCritical")
  );

  return critical
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 3);
});

/* -------------------------
   FORMATOVÁNÍ
-------------------------- */

function formatRiskLevel(level: RiskLevel): string {
  switch (level) {
    case "ok":
      return "V pořádku";
    case "warning":
      return "Varování";
    case "critical":
      return "Kritické";
    default:
      return "";
  }
}

function formatReason(reason: RiskReason): string {
  switch (reason.type) {
    case "speedExtreme":
      return `Extrémní rychlost (${reason.value} km/h)`;
    case "speedHigh":
      return `Vysoká rychlost (${reason.value} km/h)`;
    case "speedAboveLimit":
      return `Rychlost nad limitem (${reason.value} km/h)`;
    case "speedSlightlyElevated":
      return `Mírně zvýšená rychlost (${reason.value} km/h)`;
    case "noUpdate":
      return `Bez aktualizace ${reason.value} minut`;
    case "noUpdateCritical":
      return `DLOUHÁ neaktivita – ${reason.value} minut`;
    case "ecoEvent":
      return `Eco událost (závažnost ${reason.value})`;
    default:
      return "";
  }
}

/* -------------------------
   KLIK NA KPI
-------------------------- */

function toggleFilter(level: "all" | RiskLevel) {
  activeFilter.value =
    activeFilter.value === level ? "all" : level;
}

/* -------------------------
   MAP FOCUS
-------------------------- */

function handleFocusVehicle(coords: { latitude: number; longitude: number }) {
  focusCoordinates.value = coords;
  currentView.value = "map";
}

function focusVehicleOnMap(assessment: RiskAssessment) {
  const lat = parseFloat(assessment.position.latitude);
  const lng = parseFloat(assessment.position.longitude);
  if (!isNaN(lat) && !isNaN(lng)) {
    handleFocusVehicle({ latitude: lat, longitude: lng });
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-200 px-10 py-8">

    <!-- HLAVIČKA -->
    <div class="flex justify-between items-start mb-8">
      <div>
        <h1 class="text-3xl font-bold">
          Přehled provozních rizik vozového parku
        </h1>
        <p class="text-slate-400 text-sm mt-1">
          Aktuální stav rizik v reálném čase
        </p>
        <p class="text-slate-500 text-xs mt-2">
          Systém automaticky zvýrazňuje vozidla s vysokým provozním rizikem.
        </p>
      </div>

      <div
        class="flex bg-slate-800 rounded-lg overflow-hidden border border-slate-700"
      >
        <button
          class="px-4 py-2 text-sm transition"
          :class="currentView === 'dashboard' ? 'bg-slate-700' : ''"
          @click="currentView = 'dashboard'"
        >
          Přehled
        </button>
        <button
          class="px-4 py-2 text-sm transition"
          :class="currentView === 'map' ? 'bg-slate-700' : ''"
          @click="currentView = 'map'"
        >
          Mapa
        </button>
      </div>
    </div>

    <!-- LOADING -->
    <div v-if="loading" class="text-center py-20">
      Načítání dat...
    </div>

    <!-- DASHBOARD -->
    <div v-else-if="currentView === 'dashboard'">

      <!-- OPERATIONAL PRIORITY PANEL -->
      <div class="bg-slate-900 rounded-xl border border-slate-800 p-6 mb-8">
        <h2 class="text-lg font-semibold mb-4">
          Vyžaduje okamžitou pozornost
        </h2>

        <div v-if="priorityVehicles.length === 0" class="text-slate-500 text-sm">
          Žádná vozidla momentálně nevyžadují zásah.
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="vehicle in priorityVehicles"
            :key="vehicle.vehicleId"
            class="bg-slate-800/50 p-4 rounded-lg border border-slate-700 hover:border-red-500/50 transition"
          >
            <div class="flex justify-between items-start">
              <div class="flex-1">
                <div class="font-medium text-slate-200 mb-1">
                  {{ vehicle.vehicleName }}
                </div>
                <div class="text-xs text-slate-400 mb-2">
                  {{ vehicle.spz }}
                </div>
                <div class="text-sm text-slate-300">
                  {{ formatReason(vehicle.reasons[0]) }}
                </div>
              </div>

              <div class="flex flex-col items-end gap-2 ml-4">
                <div
                  class="text-xl font-bold text-red-400"
                >
                  {{ vehicle.riskScore }}
                </div>
                <div
                  v-if="vehicle.reasons.some(r => r.type === 'noUpdateCritical' && r.value > 360)"
                  class="bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded"
                >
                  Bez komunikace 6h+
                </div>
                <button
                  class="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition"
                  @click.stop="focusVehicleOnMap(vehicle)"
                >
                  📍 Na mapě
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- KPI -->
      <div class="grid grid-cols-4 gap-6 mb-10">

        <div
          class="bg-slate-900 p-6 rounded-xl border cursor-pointer transition"
          :class="activeFilter === 'all'
            ? 'border-blue-500'
            : 'border-slate-800'"
          @click="toggleFilter('all')"
        >
          <p class="text-xs text-slate-400 uppercase">
            Celkem vozidel
          </p>
          <p class="text-3xl font-bold mt-2">
            {{ totalVehicles }}
          </p>
        </div>

        <div
          class="bg-red-900/20 p-6 rounded-xl border cursor-pointer transition"
          :class="activeFilter === 'critical'
            ? 'border-red-500'
            : 'border-red-700'"
          @click="toggleFilter('critical')"
        >
          <p class="text-xs text-red-400 uppercase">
            Kritické
          </p>
          <p class="text-3xl font-bold mt-2 text-red-400">
            {{ criticalCount }}
          </p>
        </div>

        <div
          class="bg-yellow-900/20 p-6 rounded-xl border cursor-pointer transition"
          :class="activeFilter === 'warning'
            ? 'border-yellow-400'
            : 'border-yellow-700'"
          @click="toggleFilter('warning')"
        >
          <p class="text-xs text-yellow-400 uppercase">
            Varování
          </p>
          <p class="text-3xl font-bold mt-2 text-yellow-400">
            {{ warningCount }}
          </p>
        </div>

        <div
          class="bg-green-900/20 p-6 rounded-xl border cursor-pointer transition"
          :class="activeFilter === 'ok'
            ? 'border-green-400'
            : 'border-green-700'"
          @click="toggleFilter('ok')"
        >
          <p class="text-xs text-green-400 uppercase">
            V pořádku
          </p>
          <p class="text-3xl font-bold mt-2 text-green-400">
            {{ okCount }}
          </p>
        </div>

      </div>

      <!-- GRAF -->
      <RiskChart
        :critical="criticalCount"
        :warning="warningCount"
        :ok="okCount"
      />

      <!-- TABULKA -->
      <div class="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden mt-8">
        <table class="w-full text-sm">
          <thead class="bg-slate-800 text-slate-400 uppercase text-xs">
            <tr>
              <th class="p-4 text-left">Vozidlo</th>
              <th class="p-4 text-left">Rychlost</th>
              <th class="p-4 text-left">Úroveň rizika</th>
              <th class="p-4 text-left">Důvody</th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="assessment in filteredAssessments"
              :key="assessment.vehicleId"
              class="border-t border-slate-800 hover:bg-slate-800/50 transition"
            >
              <td class="p-4">
                <div class="font-medium">
                  {{ assessment.vehicleName }}
                </div>
                <div class="text-xs text-slate-500">
                  {{ assessment.spz }}
                </div>
              </td>

              <td class="p-4">
                {{ assessment.speed }} km/h
              </td>

              <td class="p-4">
                <span
                  class="px-3 py-1 rounded-full text-xs font-medium"
                  :class="{
                    'bg-green-700/30 text-green-400':
                      assessment.riskLevel === 'ok',
                    'bg-yellow-700/30 text-yellow-400':
                      assessment.riskLevel === 'warning',
                    'bg-red-700/30 text-red-400':
                      assessment.riskLevel === 'critical',
                  }"
                >
                  {{ formatRiskLevel(assessment.riskLevel) }}
                </span>
              </td>

              <td class="p-4 text-slate-300">
                <ul
                  v-if="assessment.reasons.length"
                  class="space-y-1 list-disc list-inside"
                >
                  <li
                    v-for="reason in assessment.reasons"
                    :key="reason.type + reason.value"
                  >
                    {{ formatReason(reason) }}
                  </li>
                </ul>

                <div
                  v-else
                  class="text-slate-500 text-xs"
                >
                  Bez rizikových událostí
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>

    <!-- MAPA -->
    <div v-else>
      <FleetMap
        :assessments="riskAssessments"
        :focus-coordinates="focusCoordinates"
      />
    </div>

  </div>
</template>
