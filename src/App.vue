<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import RiskChart from "./components/RiskChart.vue";
import RiskTrendChart from "./components/RiskTrendChart.vue";
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

function openDrawer(assessment: AssessmentWithService) {
  selectedVehicle.value = assessment;
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
    return {
      ...assessment,
      serviceInfo: item.serviceInfo,
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

const weatherImpactedCount = computed(() =>
  riskAssessments.value.filter((r) =>
    weatherRiskEnabled.value &&
    r.reasons.some(
      (reason) => reason.type === "weather" && Number(reason.value) > 0
    )
  ).length
);

const serviceNearCount = computed(() =>
  riskAssessments.value.filter(
    (r) => r.serviceInfo.serviceStatus === "warning" || r.serviceInfo.serviceStatus === "critical"
  ).length
);

const noUpdate6hCount = computed(() =>
  riskAssessments.value.filter((r) =>
    r.reasons.some(
      (reason) => reason.type === "noUpdateCritical" && Number(reason.value) >= 360
    )
  ).length
);

const highestRiskVehicle = computed(() => {
  const p = priorityVehicles.value;
  return p.length > 0 ? p[0] : null;
});

const serviceNearWarningCount = computed(() =>
  riskAssessments.value.filter((r) => r.serviceInfo.serviceStatus === "warning").length
);

const ecoEventCount = computed(() =>
  riskAssessments.value.reduce((sum, r) => {
    const eco = r.reasons.find((x) => x.type === "ecoEvent");
    return sum + (eco?.count ?? (eco ? 1 : 0));
  }, 0)
);

const actionRecommendation = computed(() => {
  if (noUpdate6hCount.value > 0) {
    return "Doporučení: Zkontrolujte vozidla bez komunikace.";
  }
  if (criticalCount.value > 0) {
    return "Doporučení: Zkontrolujte kritická vozidla.";
  }
  return "Doporučení: Provoz je stabilní.";
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

const timeSinceLastCriticalUpdate = computed(() => {
  const critical = riskAssessments.value.filter((r) => r.riskLevel === "critical");
  if (critical.length === 0) return null;
  const latest = critical.reduce((acc, r) => {
    const t = new Date(r.calculatedAt).getTime();
    return t > acc ? t : acc;
  }, 0);
  const mins = Math.floor((Date.now() - latest) / 60000);
  if (mins < 1) return "méně než minutu";
  if (mins < 60) return `před ${mins} minutami`;
  const h = Math.floor(mins / 60);
  return `před ${h} hodinami`;
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

const systemInsight = computed(() => {
  const { speedTotal, noUpdateTotal, ecoTotal, weatherTotal } = riskFactorTotals.value;
  if (criticalCount.value === 0) {
    return "Provoz je stabilní bez kritických stavů.";
  }
  const parts: string[] = [];
  if (noUpdateTotal > ecoTotal && noUpdateTotal > speedTotal && noUpdateTotal > 0) {
    parts.push("Hlavní riziko systému je ztráta komunikace vozidel.");
  }
  if (weatherTotal > 0 && weatherRiskEnabled.value) {
    parts.push("Počasí aktuálně zvyšuje provozní riziko.");
  }
  return parts.length > 0 ? parts.join(" ") : "Provoz vyžaduje pozornost.";
});

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

function getReasonMeta(reason: RiskReason): {
  text: string;
  icon: string;
  colorClass: string;
} {
  const text = formatReason(reason) ?? "";
  let icon = "•";
  let colorClass = "text-slate-300";

  switch (reason.type) {
    case "noUpdate":
      icon = "⏱";
      break;
    case "noUpdateCritical":
      icon = "⏱";
      colorClass = "text-red-400";
      break;
    case "speedExtreme":
      icon = "🚗";
      colorClass = "text-red-400";
      break;
    case "speedHigh":
    case "speedAboveLimit":
      icon = "🚗";
      colorClass = "text-orange-400";
      break;
    case "speedSlightlyElevated":
      icon = "🚗";
      colorClass = "text-yellow-400";
      break;
    case "ecoEvent":
      icon = "⚠";
      colorClass = "text-purple-400";
      break;
    case "weather":
      icon = "🌧";
      colorClass = "text-blue-400";
      break;
  }

  return { text, icon, colorClass };
}

function getReasonClass(reason: RiskReason): string {
  if (reason.type === "weather") {
    return weatherRiskEnabled.value
      ? "text-blue-400"
      : "text-slate-500 opacity-70";
  }
  if (reason.type === "noUpdateCritical") {
    return "text-red-400";
  }
  if (reason.type === "ecoEvent") {
    return "text-yellow-400";
  }
  return "";
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
        <h1 class="text-2xl font-bold text-slate-100">
          Přehled provozních rizik vozového parku
        </h1>
        <p class="text-slate-500 text-sm mt-1">
          Aktuální stav rizik v reálném čase
        </p>
      </div>

      <div class="flex items-center gap-6">
        <div
          v-if="!loading"
          class="flex items-center gap-2"
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
          <span
            class="text-xs text-slate-500"
            :class="weatherRiskEnabled ? 'text-blue-400' : ''"
          >
            ☁ Počasí
          </span>
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
    <div v-else-if="currentView === 'dashboard'" class="space-y-10">

      <!-- 1) EXECUTIVE ALERT PANEL -->
      <div
        class="rounded-xl border border-slate-700/50 p-6 transition cursor-pointer"
        :class="priorityVehicles.length > 0
          ? 'bg-gradient-to-r from-red-900/30 to-transparent border-l-4 border-l-red-500'
          : 'bg-slate-900'"
        @click="priorityVehicles.length > 0 && toggleFilter('critical')"
      >
        <div class="flex items-center justify-between gap-6">
          <div class="min-w-0 flex items-start gap-3">
            <span v-if="priorityVehicles.length > 0" class="text-2xl shrink-0">🚨</span>
            <div>
              <h2 class="text-base font-semibold text-slate-100">
                {{ priorityVehicles.length > 0 ? 'Vyžaduje okamžitou pozornost' : 'Přehled rizik' }}
              </h2>
              <p v-if="priorityVehicles.length === 0" class="text-slate-500 text-sm mt-1">
                Žádná kritická vozidla.
              </p>
              <template v-else>
                <p class="text-slate-200 font-medium mt-1">
                  {{ criticalCount }} {{ criticalCount === 1 ? 'kritické vozidlo' : 'kritická vozidla' }} vyžadují zásah
                </p>
                <p class="text-slate-400 text-sm mt-0.5">
                  Nejvyšší riziko: {{ highestRiskVehicle?.vehicleName ?? '' }} ({{ highestRiskVehicle?.riskScore ?? 0 }} bodů)
                </p>
                <p v-if="timeSinceLastCriticalUpdate" class="text-slate-500 text-xs mt-0.5">
                  Poslední změna: {{ timeSinceLastCriticalUpdate }}
                </p>
                <p
                  v-if="weatherRiskEnabled && weatherImpactedCount > 0"
                  class="text-blue-400/90 text-xs mt-1"
                >
                  Počasí ovlivňuje {{ weatherImpactedCount }} {{ weatherImpactedCount === 1 ? 'vozidlo' : 'vozidel' }}
                </p>
              </template>
            </div>
          </div>
          <button
            v-if="priorityVehicles.length > 0"
            class="shrink-0 px-4 py-2 rounded-lg border border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-medium transition"
            @click.stop="toggleFilter('critical')"
          >
            Filtrovat kritická
          </button>
        </div>
      </div>

      <!-- 2) KPI ROW (compact enterprise metrics) -->
      <div class="grid grid-cols-4 gap-4">
        <div
          class="rounded-xl border border-slate-700/50 bg-slate-900 px-5 py-4 cursor-pointer transition hover:border-slate-600/50"
          :class="activeFilter === 'all' ? 'border-slate-500/50' : ''"
          @click="toggleFilter('all')"
        >
          <p class="text-2xl font-bold text-slate-100">{{ totalVehicles }}</p>
          <div class="flex items-center gap-2 mt-1">
            <span class="w-2 h-2 rounded-full bg-slate-400" />
            <p class="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Celkem vozidel</p>
          </div>
        </div>
        <div
          class="rounded-xl border border-slate-700/50 bg-slate-900 px-5 py-4 cursor-pointer transition hover:border-slate-600/50"
          :class="activeFilter === 'critical' ? 'border-red-500/50' : ''"
          @click="toggleFilter('critical')"
        >
          <p class="text-2xl font-bold text-red-400">{{ criticalCount }}</p>
          <div class="flex items-center gap-2 mt-1">
            <span class="w-2 h-2 rounded-full bg-red-400" />
            <p class="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Kritické</p>
          </div>
        </div>
        <div
          class="rounded-xl border border-slate-700/50 bg-slate-900 px-5 py-4 cursor-pointer transition hover:border-slate-600/50"
          :class="activeFilter === 'warning' ? 'border-amber-500/50' : ''"
          @click="toggleFilter('warning')"
        >
          <p class="text-2xl font-bold text-amber-400">{{ warningCount }}</p>
          <div class="flex items-center gap-2 mt-1">
            <span class="w-2 h-2 rounded-full bg-amber-400" />
            <p class="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Varování</p>
          </div>
        </div>
        <div
          class="rounded-xl border border-slate-700/50 bg-slate-900 px-5 py-4 cursor-pointer transition hover:border-slate-600/50"
          :class="activeFilter === 'ok' ? 'border-emerald-500/50' : ''"
          @click="toggleFilter('ok')"
        >
          <p class="text-2xl font-bold text-emerald-400">{{ okCount }}</p>
          <div class="flex items-center gap-2 mt-1">
            <span class="w-2 h-2 rounded-full bg-emerald-400" />
            <p class="text-[10px] uppercase tracking-wider text-slate-500 font-medium">V pořádku</p>
          </div>
        </div>
      </div>

      <!-- 3) MAIN CONTENT GRID: 70% left / 30% right -->
      <div class="grid grid-cols-1 lg:grid-cols-10 gap-6">
        <!-- LEFT: Chart + Table (70%) -->
        <div class="lg:col-span-7 space-y-6">
          <!-- Risk Distribution Card -->
          <RiskChart
              :critical="criticalCount"
              :warning="warningCount"
              :ok="okCount"
            />

          <!-- Risk Table -->
          <div class="rounded-xl border border-slate-700/50 bg-slate-900 overflow-hidden">
            <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider px-6 pt-6 pb-4">
              Riziková vozidla
            </h3>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-t border-slate-700/50">
                    <th class="w-1" />
                    <th class="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vozidlo</th>
                    <th class="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Risk score</th>
                    <th class="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rychlost</th>
                    <th class="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rizikové faktory</th>
                    <th class="text-right py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="assessment in filteredAssessments"
                    :key="assessment.vehicleId"
                    class="border-t border-slate-800/50 hover:bg-slate-800/30 transition cursor-pointer"
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
                    <td class="py-4 px-4">
                      <p class="font-medium text-slate-100">
                        {{ assessment.vehicleName }}
                        <span
                          v-if="assessment.serviceInfo.serviceStatus !== 'ok'"
                          class="ml-1 text-xs text-amber-400"
                          :class="{ 'text-red-400': assessment.serviceInfo.serviceStatus === 'critical' }"
                          :title="assessment.serviceInfo.serviceStatus === 'critical' ? 'Servis nutný' : 'Brzy servis'"
                        >🛠</span>
                      </p>
                      <p class="text-xs text-slate-500 mt-0.5">{{ assessment.spz }}</p>
                    </td>
                    <td class="py-4 px-4">
                      <span
                        class="inline-flex px-3 py-1.5 rounded-lg text-base font-bold"
                        :class="{
                          'bg-emerald-500/15 text-emerald-400': assessment.riskLevel === 'ok',
                          'bg-amber-500/15 text-amber-400': assessment.riskLevel === 'warning',
                          'bg-red-500/15 text-red-400': assessment.riskLevel === 'critical',
                        }"
                      >
                        {{ assessment.riskScore }}
                      </span>
                    </td>
                    <td class="py-4 px-4 text-slate-300">
                      {{ assessment.speed }} km/h
                    </td>
                    <td class="py-4 px-4">
                      <div class="flex flex-wrap gap-1.5">
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
                    <td class="py-4 px-4 text-right">
                      <button
                        class="text-xs text-blue-400 hover:text-blue-300 font-medium"
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

        <!-- RIGHT: Context + Action + Trend (30%) -->
        <div class="lg:col-span-3 space-y-6">
          <!-- Akční přehled (dnes) -->
          <div class="rounded-xl border border-slate-700/50 bg-slate-900 p-6">
            <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Akční přehled (dnes)
            </h3>
            <div class="space-y-2">
              <div
                v-if="noUpdate6hCount > 0"
                class="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-800/50 transition"
              >
                <span class="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                <span class="text-sm text-slate-300">
                  <strong class="text-slate-100">{{ noUpdate6hCount }}</strong>
                  {{ noUpdate6hCount === 1 ? 'vozidlo' : 'vozidel' }} bez komunikace &gt; 6h
                </span>
              </div>
              <div
                v-if="serviceNearWarningCount > 0"
                class="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-800/50 transition"
              >
                <span class="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span class="text-sm text-slate-300">
                  <strong class="text-slate-100">{{ serviceNearWarningCount }}</strong>
                  {{ serviceNearWarningCount === 1 ? 'vozidlo' : 'vozidel' }} blízko servisnímu limitu
                </span>
              </div>
              <div
                v-if="ecoEventCount > 0"
                class="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-800/50 transition"
              >
                <span class="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
                <span class="text-sm text-slate-300">
                  <strong class="text-slate-100">{{ ecoEventCount }}</strong>
                  {{ ecoEventCount === 1 ? 'ECO událost' : 'ECO událostí' }}
                </span>
              </div>
              <div
                v-if="weatherRiskEnabled && weatherImpactedCount > 0"
                class="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-800/50 transition"
              >
                <span class="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <span class="text-sm text-slate-300">
                  <strong class="text-slate-100">{{ weatherImpactedCount }}</strong>
                  {{ weatherImpactedCount === 1 ? 'vozidlo' : 'vozidel' }} ovlivněno počasím
                </span>
              </div>
            </div>
            <div class="mt-4 pt-4 border-t border-slate-700/50 bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
              <p class="text-sm text-slate-300 mb-3">
                {{ actionRecommendation }}
              </p>
              <button
                class="w-full py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 text-xs font-medium transition"
                @click="toggleFilter('critical')"
              >
                Zobrazit kritická vozidla
              </button>
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

          <!-- Rozpad rizika podle faktorů -->
          <div class="rounded-xl border border-slate-700/50 bg-slate-900 p-6">
            <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Rozpad rizika podle faktorů
            </h3>
            <div class="space-y-3">
              <div
                v-for="row in [
                  { key: 'speedTotal', label: 'Rychlost', color: 'bg-amber-500', value: riskFactorTotals.speedTotal },
                  { key: 'noUpdateTotal', label: 'Bez komunikace', color: 'bg-red-500', value: riskFactorTotals.noUpdateTotal },
                  { key: 'ecoTotal', label: 'ECO události', color: 'bg-purple-500', value: riskFactorTotals.ecoTotal },
                  { key: 'weatherTotal', label: 'Počasí', color: 'bg-blue-500', value: riskFactorTotals.weatherTotal },
                ]"
                :key="row.key"
                class="flex items-center gap-3"
              >
                <span class="text-xs text-slate-400 w-24 shrink-0">{{ row.label }}</span>
                <span class="text-xs font-medium text-slate-300 w-6">{{ row.value }}</span>
                <div class="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="row.color"
                    :style="{ width: `${Math.min(100, (row.value / Math.max(1, riskFactorMax)) * 100)}%` }"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Systémový pohled -->
          <div class="rounded-lg border border-slate-700 bg-slate-800 p-4">
            <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Systémový pohled
            </h3>
            <p class="text-sm text-slate-300">
              {{ systemInsight }}
            </p>
          </div>

          <!-- Kontextové faktory -->
          <div class="rounded-xl border border-slate-700/50 bg-slate-900 p-6 sticky top-6">
            <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Kontextové faktory
            </h3>
            <div class="divide-y divide-slate-700/50">
              <div
                v-if="weatherRiskEnabled"
                class="flex items-center gap-3 py-3 first:pt-0"
              >
                <span class="text-base">🌧</span>
                <span class="text-sm text-slate-300">
                  {{ weatherImpactedCount > 0
                    ? `${weatherImpactedCount} ${weatherImpactedCount === 1 ? 'vozidlo ovlivněno' : 'vozidel ovlivněno'} počasím`
                    : 'Žádná vozidla ovlivněna počasím'
                  }}
                </span>
              </div>
              <div
                v-if="serviceNearCount > 0"
                class="flex items-center gap-3 py-3"
              >
                <span class="text-base">🛠</span>
                <span class="text-sm text-slate-300">
                  {{ serviceNearCount }} {{ serviceNearCount === 1 ? 'vozidlo blízko' : 'vozidel blízko' }} servisu
                </span>
              </div>
              <div
                v-if="noUpdate6hCount > 0"
                class="flex items-center gap-3 py-3"
              >
                <span class="text-base">📡</span>
                <span class="text-sm text-slate-300">
                  {{ noUpdate6hCount }} {{ noUpdate6hCount === 1 ? 'vozidlo' : 'vozidel' }} bez komunikace 6h+
                </span>
              </div>
              <div
                v-if="!weatherRiskEnabled && serviceNearCount === 0 && noUpdate6hCount === 0"
                class="py-3"
              >
                <p class="text-sm text-slate-500">Žádné kontextové faktory</p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- MAPA -->
    <div v-else class="space-y-6">

      <!-- WEATHER RISK TOGGLE -->
      <div class="flex items-center gap-3 mb-4">
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

      <FleetMap
        :assessments="filteredAssessments"
        :focus-coordinates="focusCoordinates"
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
