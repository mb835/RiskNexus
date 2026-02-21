<script setup lang="ts">
import { ref, onMounted, computed, nextTick } from "vue";
import RiskTrendChart from "./components/RiskTrendChart.vue";
import RiskPredictionCard from "./components/RiskPredictionCard.vue";
import PriorityQueueCard from "./components/PriorityQueueCard.vue";
import FleetMap from "./components/FleetMap.vue";
import VehicleDetailDrawer from "./components/VehicleDetailDrawer.vue";
import { fetchGroups, fetchVehiclesByGroup } from "./api/fleetApi";
import { fetchEcoEvents } from "./services/ecoEventsService";
import { calculateRisk } from "./services/riskEngine";
import { calculateServiceStatus } from "./services/serviceEngine";
import type { WeatherData } from "./services/weatherRiskEngine";
import type { Vehicle } from "./types/vehicle";
import type {
  RiskAssessment,
  AssessmentWithService,
  RiskReason,
  RiskLevel,
  ServiceInfo,
} from "./types/risk";
import type { EcoEvent } from "./types/ecoEvent";

/* -------------------------
   STATE
-------------------------- */

const loading = ref(true);

interface BaseDataItem {
  vehicle: Vehicle;
  ecoEvents: EcoEvent[];
  weatherData: WeatherData | undefined;
  serviceInfo: ServiceInfo;
}

const baseData = ref<BaseDataItem[]>([]);
const currentView = ref<"dashboard" | "map">("dashboard");
const activeFilter = ref<"all" | RiskLevel>("all");
const weatherRiskEnabled = ref(false);

/* Coordinates to zoom to on the map. Passed down to FleetMap. */
const focusCoordinates = ref<{ latitude: number; longitude: number } | null>(null);

/* DRAWER STATE */
const selectedVehicle = ref<AssessmentWithService | null>(null);
const drawerOpen = ref(false);
const riskTableRef = ref<HTMLElement | null>(null);

function openDrawer(assessment: AssessmentWithService) {
  selectedVehicle.value = assessment;
  drawerOpen.value = true;
}

function handleOpenVehicleDetail(vehicleId: string) {
  const found = riskAssessments.value.find(
    (v) => v.vehicleId === vehicleId
  );

  if (!found) return;

  selectedVehicle.value = found;
  drawerOpen.value = true;
}

function handleFocusFromDrawer(coords: { latitude: number; longitude: number }) {
  focusCoordinates.value = coords;
  currentView.value = "map";
}

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

    const rawPairs = await Promise.all(
      vehicles.map(async (vehicle) => {
        try {
          const ecoEvents = await fetchEcoEvents(vehicle.Code);

          let vehicleWeatherData: WeatherData | undefined;
          const lat = vehicle.LastPosition?.Latitude;
          const lng = vehicle.LastPosition?.Longitude;

          if (
            lat != null &&
            lng != null &&
            String(lat).trim() !== "" &&
            String(lng).trim() !== ""
          ) {
            try {
              const res = await fetch(
                `/api/weather?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
              );
              if (res.ok) {
                vehicleWeatherData = (await res.json()) as WeatherData;
              }
            } catch {
              vehicleWeatherData = undefined;
            }
          }

          const odometer = vehicle.Odometer ?? 0;
          const serviceInfo: ServiceInfo = {
            odometer,
            ...calculateServiceStatus(odometer),
          };
          return {
            vehicle,
            ecoEvents,
            weatherData: vehicleWeatherData,
            serviceInfo,
          };
        } catch (err) {
          console.error("Vehicle risk pipeline error:", vehicle.Code, err);
          return null;
        }
      })
    );

    const valid = rawPairs.filter(
      (p): p is BaseDataItem => p !== null,
    );

    baseData.value = valid;
  } catch (error) {
    console.error("Načítání dat selhalo:", error);
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);

const riskAssessments = computed<AssessmentWithService[]>(() =>
  baseData.value.map((item) => {
    const assessment = calculateRisk(
      item.vehicle,
      item.ecoEvents,
      item.weatherData,
      weatherRiskEnabled.value
    );
    const w = item.weatherData;
    const weatherData =
      w != null
        ? {
            temperature: w.temperature,
            windSpeed: w.windSpeed,
            precipitation: w.precipitation,
            weatherId: w.weatherId,
            weatherMain: w.weatherMain,
          }
        : undefined;
    return {
      ...assessment,
      serviceInfo: item.serviceInfo,
      weatherData,
    };
  })
);

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

const highestRiskVehicle = computed(() => {
  const p = priorityVehicles.value;
  return p.length > 0 ? p[0] : null;
});

const mockTrendData = computed(() => {
  const crit = criticalCount.value;
  const warn = warningCount.value;
  const seed = (x: number, i: number) => ((x * 31 + i) % 5) - 2;
  return Array.from({ length: 7 }, (_, i) => ({
    day: i,
    critical: Math.max(0, crit + seed(crit || 1, i)),
    warning: Math.max(0, warn + seed(warn || 1, i + 10)),
  }));
});

const riskFactorTotals = computed(() => {
  let speedTotal = 0;
  let noUpdateTotal = 0;
  let ecoTotal = 0;
  let weatherTotal = 0;
  for (const a of riskAssessments.value) {
    for (const r of a.reasons) {
      if (r.type === "speedExtreme") speedTotal += 4;
      else if (r.type === "speedHigh") speedTotal += 3;
      else if (r.type === "speedAboveLimit") speedTotal += 2;
      else if (r.type === "speedSlightlyElevated") speedTotal += 1;
      else if (r.type === "noUpdateCritical") noUpdateTotal += 6;
      else if (r.type === "noUpdate") noUpdateTotal += 2;
      else if (r.type === "ecoEvent") ecoTotal += Number(r.value) || 0;
      else if (r.type === "weather" && Number(r.value) > 0) weatherTotal += Number(r.value);
    }
  }
  return { speedTotal, noUpdateTotal, ecoTotal, weatherTotal };
});

const riskFactorMax = computed(() => {
  const t = riskFactorTotals.value;
  return Math.max(1, t.speedTotal, t.noUpdateTotal, t.ecoTotal, t.weatherTotal);
});

const vehiclesWithoutCommunication = computed(() =>
  riskAssessments.value.filter((r) =>
    r.reasons.some(
      (reason) =>
        reason.type === "noUpdateCritical" ||
        (reason.type === "noUpdate" && Number(reason.value) >= 60)
    )
  ).length
);

const riskTrendIncreasing = computed(() => {
  const data = mockTrendData.value;
  if (data.length < 2) return false;
  const today = data[data.length - 1];
  const yesterday = data[data.length - 2];
  const todayTotal = (today?.critical ?? 0) + (today?.warning ?? 0);
  const yesterdayTotal = (yesterday?.critical ?? 0) + (yesterday?.warning ?? 0);
  return todayTotal > yesterdayTotal;
});

const systemInsight = computed(() => {
  const { speedTotal, noUpdateTotal } = riskFactorTotals.value;
  if (criticalCount.value === 0) {
    return "Provoz je stabilní bez kritických stavů.";
  }
  if (noUpdateTotal > speedTotal && noUpdateTotal > 0) {
    return "Hlavní zdroj rizika: ztráta komunikace vozidel.";
  }
  if (speedTotal > 0) {
    return "Hlavní zdroj rizika: překročení rychlosti.";
  }
  return "Provoz vyžaduje pozornost.";
});

const weatherContextLine = computed(() => {
  return "Počasí se vyhodnocuje individuálně podle lokace vozidel.";
});

const lastUpdateText = computed(() => {
  const all = riskAssessments.value;
  if (all.length === 0) return null;
  const latest = all.reduce((acc, r) => {
    const t = new Date(r.calculatedAt).getTime();
    return t > acc ? t : acc;
  }, 0);
  const mins = Math.floor((Date.now() - latest) / 60000);
  if (mins < 1) return "před 1 minutou";
  if (mins < 60) return `před ${mins} minutami`;
  const h = Math.floor(mins / 60);
  return `před ${h} hodinami`;
});

function getMainReason(assessment: AssessmentWithService): string | null {
  const r = assessment.reasons[0];
  return r ? formatReason(r) : null;
}

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

function formatReason(reason: RiskReason): string | null {
  switch (reason.type) {
    case "noUpdate":
      return `Bez komunikace – ${reason.value} minut`;

    case "noUpdateCritical":
      return `Dlouhá neaktivita – ${reason.value} minut`;

    case "speedAboveLimit":
      return `Rychlost nad limitem (${reason.value} km/h)`;

    case "speedHigh":
      return `Vysoká rychlost (${reason.value} km/h)`;

    case "speedExtreme":
      return `Extrémní rychlost (${reason.value} km/h)`;

    case "speedSlightlyElevated":
      return `Mírně zvýšená rychlost (${reason.value} km/h)`;

    case "ecoEvent":
      return `ECO událost (závažnost ${reason.value})`;

    case "weather":
      return typeof reason.value === "number" && reason.value > 0
        ? `🌧 Počasí: +${reason.value} bodů`
        : null;

    default:
      return `Neznámý důvod (${reason.type})`;
  }
}

function getPrimaryBadges(assessment: AssessmentWithService): { label: string; colorClass: string }[] {
  const badges: { label: string; colorClass: string }[] = [];
  for (const r of assessment.reasons) {
    if (r.type === "weather" && weatherRiskEnabled.value && Number(r.value) > 0) {
      badges.push({ label: `+${r.value} Počasí`, colorClass: "bg-blue-500/20 text-blue-300" });
    } else if (r.type === "noUpdateCritical") {
      badges.push({ label: `Bez komunikace ${r.value} min`, colorClass: "bg-red-500/20 text-red-300" });
    } else if (r.type === "ecoEvent") {
      badges.push({ label: `ECO událost (závažnost ${r.value})`, colorClass: "bg-purple-500/20 text-purple-300" });
    } else if (r.type === "noUpdate") {
      badges.push({ label: `Bez komunikace ${r.value} min`, colorClass: "bg-amber-500/20 text-amber-300" });
    } else if (r.type === "speedExtreme" || r.type === "speedHigh" || r.type === "speedAboveLimit") {
      badges.push({ label: `Rychlost ${r.value} km/h`, colorClass: "bg-orange-500/20 text-orange-300" });
    }
  }
  return badges.slice(0, 4);
}


/* -------------------------
   KLIK NA KPI
-------------------------- */

function toggleFilter(level: "all" | RiskLevel) {
  activeFilter.value =
    activeFilter.value === level ? "all" : level;
}

function scrollToRiskTable() {
  if (riskTableRef.value) {
    riskTableRef.value.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

function handlePredictionCtaClick() {
  const goingToAll = activeFilter.value === "critical";
  activeFilter.value = goingToAll ? "all" : "critical";
  currentView.value = "dashboard";
  nextTick(() => {
    setTimeout(() => scrollToRiskTable(), 100);
  });
}

function handleHeroFilterToggle() {
  if (activeFilter.value === "critical") {
    activeFilter.value = "all";
  } else {
    activeFilter.value = "critical";
  }
  nextTick(() => {
    scrollToRiskTable();
  });
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
  <div
    class="min-h-screen text-slate-200 font-sans antialiased bg-gradient-to-b from-[#0b1220] to-[#0f172a]"
  >
    <div class="px-10 py-8 max-w-[1600px] mx-auto">

    <!-- HEADER -->
    <div class="flex flex-wrap justify-between items-start gap-4 mb-8">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <span class="inline-flex items-center justify-center text-blue-500" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 40 40"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-7 w-7 shrink-0"
            >
              <circle cx="20" cy="20" r="15" />
              <circle cx="20" cy="20" r="4" fill="currentColor" />
              <g class="radar-sweep">
                <path d="M 20 5 A 15 15 0 0 0 5 20" stroke="currentColor" stroke-width="1.6" fill="none" opacity="0.55" />
                <line x1="20" y1="20" x2="20" y2="5" stroke="currentColor" stroke-width="1.6" opacity="0.9" />
              </g>
            </svg>
          </span>
          <span class="text-lg font-bold text-slate-300">RiskNexus</span>
        </div>
        <h1 class="text-2xl font-bold text-slate-100">
          Řízení operačních rizik vozidel
        </h1>
        <p class="text-slate-500 text-sm mt-1">
          Aktuální stav rizik v reálném čase
        </p>
      </div>

      <div class="flex items-center gap-6">
        <div
          v-if="!loading && currentView === 'dashboard'"
          class="relative flex items-center gap-2 min-w-[200px]"
        >
          <button
            type="button"
            role="switch"
            :aria-checked="weatherRiskEnabled"
            class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border border-slate-600 transition focus:outline-none"
            :class="weatherRiskEnabled ? 'bg-blue-600/80' : 'bg-slate-800'"
            @click="weatherRiskEnabled = !weatherRiskEnabled"
          >
            <span
              class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white transition duration-200"
              :class="weatherRiskEnabled ? 'translate-x-4' : 'translate-x-0.5'"
            />
          </button>
          <div class="flex items-center gap-1 relative group">
            <span
              class="text-xs text-slate-500"
              :class="weatherRiskEnabled ? 'text-blue-400' : ''"
            >
              ☁ Počasí
            </span>
            <div
              class="w-4 h-4 rounded-full bg-slate-700 text-slate-300 text-[10px] flex items-center justify-center cursor-pointer shrink-0"
            >
              ?
            </div>
            <div
              class="absolute left-0 top-full mt-2 hidden group-hover:block bg-slate-800 text-slate-300 text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap z-50 border border-slate-700"
            >
              Počasí se započítává do hodnocení rizika.
            </div>
          </div>
        </div>
        <div
          class="flex rounded-lg overflow-hidden border border-slate-700/50 bg-slate-900"
        >
        <button
          class="px-4 py-2 text-sm font-medium transition"
          :class="currentView === 'dashboard' ? 'bg-slate-700/80 text-white' : 'text-slate-400 hover:text-slate-200'"
          @click="currentView = 'dashboard'"
        >
          Přehled
        </button>
        <button
          class="px-4 py-2 text-sm font-medium transition"
          :class="currentView === 'map' ? 'bg-slate-700/80 text-white' : 'text-slate-400 hover:text-slate-200'"
          @click="currentView = 'map'"
        >
          Mapa
        </button>
        </div>
      </div>
    </div>

    <!-- FILTER BAR (map view only) -->
    <div v-if="!loading && currentView === 'map'" class="flex gap-2 mb-6">
      <button
        class="px-4 py-2 text-sm rounded-lg border transition"
        :class="activeFilter === 'all'
          ? 'bg-slate-700 border-slate-500 text-white'
          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'"
        @click="toggleFilter('all')"
      >
        Vše
      </button>
      <button
        class="px-4 py-2 text-sm rounded-lg border transition"
        :class="activeFilter === 'critical'
          ? 'bg-red-700/40 border-red-500 text-red-300'
          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'"
        @click="toggleFilter('critical')"
      >
        Kritické
      </button>
      <button
        class="px-4 py-2 text-sm rounded-lg border transition"
        :class="activeFilter === 'warning'
          ? 'bg-yellow-700/40 border-yellow-500 text-yellow-300'
          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'"
        @click="toggleFilter('warning')"
      >
        Varování
      </button>
      <button
        class="px-4 py-2 text-sm rounded-lg border transition"
        :class="activeFilter === 'ok'
          ? 'bg-green-700/40 border-green-500 text-green-300'
          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'"
        @click="toggleFilter('ok')"
      >
        V pořádku
      </button>
    </div>

    <!-- LOADING -->
    <div v-if="loading" class="text-center py-24 text-slate-500">
      Načítání dat...
    </div>

    <!-- DASHBOARD -->
    <div v-else-if="currentView === 'dashboard'" class="space-y-8">

      <!-- 1) HERO SECTION -->
      <div
        class="rounded-xl border border-slate-700/50 p-6 transition"
        :class="priorityVehicles.length > 0
          ? 'bg-gradient-to-r from-red-900/30 to-transparent border-l-4 border-l-red-500'
          : 'bg-slate-900'"
      >
        <div class="flex items-center justify-between gap-6">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-slate-100">
              <template v-if="priorityVehicles.length > 0">
                ⚠ {{ criticalCount }} {{ criticalCount === 1 ? 'kritické vozidlo' : 'kritická vozidla' }} vyžadují zásah
              </template>
              <template v-else>
                Přehled rizik
              </template>
            </h2>
            <p v-if="priorityVehicles.length === 0" class="text-slate-500 text-sm mt-1">
              Žádná kritická vozidla.
            </p>
            <template v-else>
              <p class="text-slate-400 text-sm mt-0.5">
                Nejvyšší riziko: {{ highestRiskVehicle?.vehicleName ?? '' }} ({{ highestRiskVehicle?.riskScore ?? 0 }} bodů)
              </p>
              <p v-if="lastUpdateText" class="text-slate-500 text-xs mt-1">
                Poslední aktualizace: {{ lastUpdateText }}
              </p>
            </template>
          </div>
          <div v-if="priorityVehicles.length > 0" class="flex items-center gap-2 shrink-0">
            <button
              class="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 active:scale-95"
              :class="activeFilter === 'critical'
                ? 'border border-slate-600 text-slate-400 hover:bg-slate-800'
                : 'bg-red-600 hover:bg-red-500 text-white'"
              @click="handleHeroFilterToggle"
            >
              {{ activeFilter === 'critical' ? 'Zobrazit všechna vozidla' : 'Zobrazit pouze kritická vozidla' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 2) KPI CARDS -->
      <div class="grid grid-cols-4 gap-6">
        <div
          class="rounded-xl border border-slate-800 bg-slate-900/80 px-5 py-4 cursor-pointer transition hover:border-slate-700"
          :class="activeFilter === 'all' ? 'ring-1 ring-slate-600' : ''"
          @click="toggleFilter('all')"
        >
          <p class="text-3xl font-bold text-slate-100">{{ totalVehicles }}</p>
          <p class="text-xs text-slate-500 mt-1">Vozidel</p>
        </div>
        <div
          class="rounded-xl border px-5 py-4 cursor-pointer transition duration-300"
          :class="[
            activeFilter === 'critical'
              ? 'ring-2 ring-red-500/60 border-red-900/50 shadow-[0_0_24px_rgba(239,68,68,0.15)]'
              : 'border-slate-800 bg-slate-900/80 hover:border-slate-700',
            activeFilter !== 'critical' && criticalCount > 0 && 'shadow-[0_0_20px_rgba(239,68,68,0.08)]',
          ]"
          @click="toggleFilter('critical')"
        >
          <p class="text-3xl font-bold text-red-400 flex items-center gap-2">
            {{ criticalCount }}
            <span v-if="criticalCount > 0" class="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          </p>
          <p class="text-xs text-slate-500 mt-1">Kritické</p>
        </div>
        <div
          class="rounded-xl border border-slate-800 bg-slate-900/80 px-5 py-4 cursor-pointer transition hover:border-slate-700"
          :class="activeFilter === 'warning' ? 'ring-1 ring-amber-500/30' : ''"
          @click="toggleFilter('warning')"
        >
          <p class="text-3xl font-bold text-amber-400">{{ warningCount }}</p>
          <p class="text-xs text-slate-500 mt-1">Varování</p>
        </div>
        <div
          class="rounded-xl border border-slate-800 bg-slate-900/80 px-5 py-4 cursor-pointer transition hover:border-slate-700"
          :class="activeFilter === 'ok' ? 'ring-1 ring-emerald-500/30' : ''"
          @click="toggleFilter('ok')"
        >
          <p class="text-3xl font-bold text-emerald-400">{{ okCount }}</p>
          <p class="text-xs text-slate-500 mt-1">OK</p>
        </div>
      </div>

      <!-- 3) MAIN CONTENT GRID -->
      <div class="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8 items-stretch">
        <!-- LEFT COLUMN -->
        <div class="flex flex-col gap-6 min-w-0 h-full">
          <!-- Top 3 nejrizikovější vozidla -->
          <div v-if="priorityVehicles.length > 0">
            <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Nejrizikovější vozidla (Top 3)
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div
                v-for="v in priorityVehicles"
                :key="v.vehicleId"
                class="rounded-xl border border-slate-700/50 bg-slate-900/80 p-6 cursor-pointer hover:bg-slate-800/50 transition flex items-center justify-between gap-3"
                @click="openDrawer(v)"
              >
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-slate-100 truncate">{{ v.vehicleName }}</p>
                  <p class="text-xs text-slate-500 mt-0.5">{{ v.riskScore }} bodů</p>
                  <p v-if="getMainReason(v)" class="text-xs text-slate-400 mt-1 truncate">
                    {{ getMainReason(v) }}
                  </p>
                </div>
                <span class="text-slate-500 shrink-0">→</span>
              </div>
            </div>
          </div>

          <!-- Risk Table -->
          <div
            id="vehicles-section"
            ref="riskTableRef"
            class="rounded-xl border border-slate-700/50 bg-slate-900 overflow-hidden"
          >
            <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider px-6 pt-6 pb-4">
              Riziková vozidla
            </h3>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-t border-slate-700/50">
                    <th class="w-1" />
                    <th class="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vozidlo</th>
                    <th class="text-center py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <span class="relative inline-flex items-center justify-center gap-1 group/risk">
                        Risk score
                        <span class="text-slate-400 cursor-help">ⓘ</span>
                        <span
                          class="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-10 px-3 py-2 w-64 rounded-lg bg-slate-800 border border-slate-700 text-left text-xs text-slate-300 shadow-lg opacity-0 pointer-events-none transition-opacity duration-150 group-hover/risk:opacity-100"
                        >
                          Risk score je agregované provozní skóre vypočítané z:
                          <span class="block mt-1.5">• rychlosti</span>
                          <span class="block">• ztráty komunikace</span>
                          <span class="block">• ECO událostí</span>
                          <span class="block">• počasí (pokud je aktivní)</span>
                          <span class="block mt-2 font-medium">Rozsahy:</span>
                          <span class="block">0–2 = OK</span>
                          <span class="block">3–5 = Varování</span>
                          <span class="block">6+ = Kritické</span>
                        </span>
                      </span>
                    </th>
                    <th class="text-left py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rychlost</th>
                    <th class="text-right py-3 px-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="assessment in filteredAssessments"
                    :key="assessment.vehicleId"
                    class="group border-t border-slate-800/50 hover:bg-slate-800/40 transition-all duration-200 cursor-pointer"
                    @click="openDrawer(assessment)"
                  >
                    <td
                      class="w-1 align-stretch"
                      :class="{
                        'bg-red-500': assessment.riskLevel === 'critical',
                        'bg-amber-400': assessment.riskLevel === 'warning',
                        'bg-emerald-500': assessment.riskLevel === 'ok',
                      }"
                    />
                    <td class="py-4 px-6">
                      <p class="font-medium text-slate-100 flex items-center gap-2">
                        <span class="truncate">{{ assessment.vehicleName }}</span>
                        <span
                          v-if="assessment.serviceInfo.serviceStatus !== 'ok'"
                          class="shrink-0 text-xs text-amber-400"
                          :class="{ 'text-red-400': assessment.serviceInfo.serviceStatus === 'critical' }"
                          :title="assessment.serviceInfo.serviceStatus === 'critical' ? 'Servis nutný' : 'Brzy servis'"
                        >🛠</span>
                      </p>
                      <p class="text-xs text-slate-500 mt-0.5">{{ assessment.spz }}</p>
                      <div class="flex flex-wrap gap-1.5 mt-2">
                        <span
                          v-for="(badge, i) in getPrimaryBadges(assessment)"
                          :key="i"
                          class="text-[11px] px-2 py-0.5 rounded text-slate-400 bg-slate-800/60"
                        >
                          {{ badge.label }}
                        </span>
                        <span
                          v-if="getPrimaryBadges(assessment).length === 0"
                          class="text-xs text-slate-500"
                        >
                          —
                        </span>
                      </div>
                    </td>
                    <td class="py-4 px-6">
                      <div class="flex items-center justify-center">
                        <span
                          class="inline-flex items-center justify-center min-w-[2.5rem] w-10 h-10 rounded-lg text-base font-bold transition-all duration-200"
                          :class="{
                            'bg-emerald-500/15 text-emerald-400 group-hover:scale-[1.03] group-hover:shadow-[0_0_16px_rgba(16,185,129,0.2)]': assessment.riskLevel === 'ok',
                            'bg-amber-500/15 text-amber-400 group-hover:scale-[1.03] group-hover:shadow-[0_0_16px_rgba(245,158,11,0.2)]': assessment.riskLevel === 'warning',
                            'bg-red-500/15 text-red-400 group-hover:scale-[1.03] group-hover:shadow-[0_0_16px_rgba(239,68,68,0.2)]': assessment.riskLevel === 'critical',
                          }"
                        >
                          {{ assessment.riskScore }}
                        </span>
                      </div>
                    </td>
                    <td class="py-4 px-6 text-slate-300">
                      {{ assessment.speed }} km/h
                    </td>
                    <td class="py-4 px-6 text-right">
                      <button
                        class="text-xs text-slate-500 hover:text-slate-400 transition-colors duration-200"
                        @click.stop="focusVehicleOnMap(assessment)"
                      >
                        Na mapě
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN -->
        <div class="flex flex-col gap-6 min-w-0 h-full">
          <div class="flex flex-col gap-6 flex-1">
            <!-- Predikce rizika (24h) -->
            <RiskPredictionCard
              :critical-count="criticalCount"
              :vehicles-without-communication="vehiclesWithoutCommunication"
              :risk-trend-increasing="riskTrendIncreasing"
              :critical-filter-active="activeFilter === 'critical'"
              @show-at-risk="handlePredictionCtaClick"
            />

            <!-- Prioritní fronta (Top 5) -->
            <PriorityQueueCard
              class="flex-1"
              :assessments="riskAssessments"
              @resolve="openDrawer"
            />

            <!-- Systémový pohled -->
            <div class="rounded-xl border border-slate-700/50 bg-slate-900 p-6">
              <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Systémový pohled
              </h3>
              <p class="text-sm text-slate-300 mb-4">
                {{ systemInsight }}
              </p>
              <div class="space-y-3">
                <div
                  v-for="row in [
                    { label: 'Rychlost', color: 'bg-amber-500', value: riskFactorTotals.speedTotal },
                    { label: 'Bez komunikace', color: 'bg-red-500', value: riskFactorTotals.noUpdateTotal },
                    { label: 'ECO události', color: 'bg-purple-500', value: riskFactorTotals.ecoTotal },
                    { label: 'Počasí', color: 'bg-blue-500', value: riskFactorTotals.weatherTotal },
                  ]"
                  :key="row.label"
                  class="flex items-center gap-3"
                >
                  <span class="text-xs text-slate-400 w-24 shrink-0">{{ row.label }}</span>
                  <span class="text-xs font-medium text-slate-300 w-5">{{ row.value }}</span>
                  <div class="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all duration-300"
                      :class="row.color"
                      :style="{ width: `${Math.min(100, (row.value / Math.max(1, riskFactorMax)) * 100)}%` }"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Trend rizika (posledních 7 dní) -->
            <div class="rounded-xl border border-slate-700/50 bg-slate-900 p-6">
              <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Trend rizika (posledních 7 dní)
              </h3>
              <RiskTrendChart :data="mockTrendData" />
              <p class="text-xs text-slate-500 mt-3">
                Trend pomáhá identifikovat zhoršující se provozní situaci.
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- MAPA -->
    <div v-else class="space-y-6">

      <!-- WEATHER RISK TOGGLE -->
      <div class="flex flex-col gap-1 mb-4">
        <div class="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            :aria-checked="weatherRiskEnabled"
            class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
            :class="weatherRiskEnabled ? 'bg-blue-600' : 'bg-slate-600'"
            @click="weatherRiskEnabled = !weatherRiskEnabled"
          >
            <span
              class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200"
              :class="weatherRiskEnabled ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>

          <span
            class="text-sm text-slate-300 cursor-pointer select-none"
            :title="'Přidá kontextový rizikový faktor podle aktuálního počasí v lokaci vozidla.'"
            @click="weatherRiskEnabled = !weatherRiskEnabled"
          >
            Zohlednit počasí v risk skóre
          </span>

          <span
            :class="weatherRiskEnabled ? 'weather-active' : 'weather-inactive'"
          >
            {{ weatherRiskEnabled ? 'Aktivní' : 'Neaktivní' }}
          </span>

          <span
            class="text-slate-500 cursor-help text-sm"
            title="Přidá kontextový rizikový faktor podle aktuálního počasí v lokaci vozidla."
          >ⓘ</span>
        </div>
      </div>

      <FleetMap
        :assessments="filteredAssessments"
        :focus-coordinates="focusCoordinates"
        :weather-risk-enabled="weatherRiskEnabled"
        :drawer-open="drawerOpen"
        @open-detail="handleOpenVehicleDetail"
      />
    </div>

    </div>
  </div>

  <!-- VEHICLE DETAIL DRAWER -->
  <VehicleDetailDrawer
    :assessment="selectedVehicle"
    :open="drawerOpen"
    :weather-risk-enabled="weatherRiskEnabled"
    @close="drawerOpen = false"
    @focus-map="handleFocusFromDrawer"
  />

</template>

<style scoped>
.radar-sweep {
  transform-origin: 20px 20px;
  animation: radarSweep 4.5s linear infinite;
}

@keyframes radarSweep {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.priority-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #ef4444;
  animation: dotPulse 2.5s ease-in-out infinite;
}

@keyframes dotPulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.9;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.6;
  }
}

.weather-active {
  color: #38bdf8;
  font-weight: 600;
  margin-left: 8px;
  transition: all 0.3s ease;
}
.weather-inactive {
  color: #64748b;
  margin-left: 8px;
  transition: all 0.3s ease;
}
</style>
