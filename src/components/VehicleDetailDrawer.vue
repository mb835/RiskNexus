<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import type { AssessmentWithService, RiskLevel } from "../types/risk";
import { formatKm, serviceStatusLabel } from "../services/maintenanceService";
import { serviceProgressPercent } from "../services/serviceEngine";
import { fetchFuelSnapshots } from "../services/fuelService";
import { evaluateFuelRisk } from "../services/fuelIntelligence";
import type { FuelRiskResult } from "../services/fuelIntelligence";

/* -------------------------
   PROPS & EMITS
-------------------------- */

interface Props {
  assessment: AssessmentWithService | null;
  open: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  "focus-map": [coords: { latitude: number; longitude: number }];
}>();

/* -------------------------
   ESC KEY
-------------------------- */

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.open) emit("close");
}

onMounted(() => window.addEventListener("keydown", handleKeydown));
onUnmounted(() => window.removeEventListener("keydown", handleKeydown));

/* -------------------------
   COMPUTED
-------------------------- */

const svc = computed(() => props.assessment?.serviceInfo ?? null);

const progressPercent = computed(() =>
  svc.value ? serviceProgressPercent(svc.value.odometer) : 0
);

const progressBarClass = computed(() => {
  if (!svc.value) return "bg-slate-600";
  switch (svc.value.serviceStatus) {
    case "critical": return "bg-red-500";
    case "warning":  return "bg-yellow-400";
    case "ok":       return "bg-green-500";
  }
});

/* -------------------------
   RISK HELPERS
-------------------------- */

function riskBadgeClass(level: RiskLevel): string {
  switch (level) {
    case "ok":       return "bg-green-700/40 text-green-400 border border-green-700";
    case "warning":  return "bg-yellow-700/40 text-yellow-400 border border-yellow-700";
    case "critical": return "bg-red-700/40 text-red-400 border border-red-600";
  }
}

function formatRiskLevel(level: RiskLevel): string {
  switch (level) {
    case "ok":       return "V pořádku";
    case "warning":  return "Varování";
    case "critical": return "Kritické";
  }
}

/* -------------------------
   FUEL MONITORING
   Fetched lazily when the drawer opens.
   Cached per vehicleId to avoid re-fetching while same vehicle is shown.
-------------------------- */

// Module-level caches — survive reactive re-renders, cleared on page reload
const fuelCache          = new Map<string, FuelRiskResult>();
const fuelTimestampCache = new Map<string, string | null>();

const fuelResult        = ref<FuelRiskResult | null>(null);
const fuelLastTimestamp = ref<string | null>(null);
const fuelLoading       = ref(false);
const fuelError         = ref(false);

/**
 * Returns the ISO timestamp of the most recent snapshot that carries
 * a fuel reading, or null when no usable snapshot exists.
 */
function extractLastTimestamp(snapshots: ReturnType<typeof Array.prototype.slice>): string | null {
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const s = snapshots[i];
    if (s.fuelVolume !== undefined || s.fuelConsumedTotal !== undefined) {
      return s.timestamp ?? null;
    }
  }
  return snapshots[snapshots.length - 1]?.timestamp ?? null;
}

/**
 * Returns a Czech relative-time string for the "Poslední kontrola" line.
 * Returns null when the timestamp is absent or unparseable.
 */
function formatRelativeTime(isoTime: string | null): string | null {
  if (!isoTime) return null;
  const diffMs  = Date.now() - new Date(isoTime).getTime();
  if (isNaN(diffMs)) return null;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1)  return "právě teď";
  if (minutes < 60) return `před ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `před ${hours} h`;
}

async function loadFuelData(vehicleId: string): Promise<void> {
  if (fuelCache.has(vehicleId)) {
    fuelResult.value        = fuelCache.get(vehicleId)!;
    fuelLastTimestamp.value = fuelTimestampCache.get(vehicleId) ?? null;
    return;
  }

  fuelLoading.value = true;
  fuelError.value   = false;

  try {
    const snapshots         = await fetchFuelSnapshots(vehicleId);
    const result            = evaluateFuelRisk(snapshots);
    const timestamp         = extractLastTimestamp(snapshots);

    fuelCache.set(vehicleId, result);
    fuelTimestampCache.set(vehicleId, timestamp);

    fuelResult.value        = result;
    fuelLastTimestamp.value = timestamp;
  } catch {
    fuelError.value         = true;
    fuelResult.value        = null;
    fuelLastTimestamp.value = null;
  } finally {
    fuelLoading.value = false;
  }
}

// Fetch when the drawer opens or switches to a different vehicle
watch(
  () => [props.open, props.assessment?.vehicleId] as const,
  ([open, vehicleId]) => {
    if (open && vehicleId) {
      loadFuelData(vehicleId);
    } else if (!open) {
      // Reset visible state; caches are kept for quick re-open
      fuelResult.value        = null;
      fuelLastTimestamp.value = null;
      fuelError.value         = false;
      fuelLoading.value       = false;
    }
  }
);

/* -------------------------
   ACTIONS
-------------------------- */

function handleFocusMap() {
  if (!props.assessment) return;
  const lat = parseFloat(props.assessment.position.latitude);
  const lng = parseFloat(props.assessment.position.longitude);
  if (!isNaN(lat) && !isNaN(lng)) {
    emit("focus-map", { latitude: lat, longitude: lng });
    emit("close");
  }
}
</script>

<template>
  <Teleport to="body">

    <!-- Overlay -->
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        @click="emit('close')"
      />
    </Transition>

    <!-- Drawer panel -->
    <Transition name="drawer">
      <div
        v-if="open && assessment"
        class="fixed top-0 right-0 z-50 h-full w-[400px] bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col overflow-hidden"
      >

        <!-- HEADER -->
        <div class="flex items-start justify-between p-6 border-b border-slate-800">
          <div class="flex-1 min-w-0 pr-4">
            <h2 class="text-lg font-semibold text-slate-100 truncate">
              {{ assessment.vehicleName }}
            </h2>
            <p class="text-sm text-slate-400 mt-0.5">
              {{ assessment.spz || "Bez SPZ" }}
            </p>
          </div>

          <button
            class="text-slate-400 hover:text-slate-200 transition flex-shrink-0"
            @click="emit('close')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- RISK SUMMARY BAR -->
        <div class="flex items-center justify-between px-6 py-3 bg-slate-800/50 border-b border-slate-800">
          <span
            class="px-3 py-1 rounded-full text-xs font-semibold"
            :class="riskBadgeClass(assessment.riskLevel)"
          >
            {{ formatRiskLevel(assessment.riskLevel) }}
          </span>
          <div class="text-right">
            <span class="text-2xl font-bold text-slate-100">
              {{ assessment.riskScore }}
            </span>
            <div class="text-[10px] text-slate-500 uppercase">Risk Score</div>
          </div>
        </div>

        <!-- SCROLLABLE BODY -->
        <div class="flex-1 overflow-y-auto p-6 space-y-6">

          <!-- LIVE DATA -->
          <div>
            <h3 class="text-xs font-semibold text-slate-400 uppercase mb-3">
              Živá data
            </h3>
            <div class="space-y-0">
              <div class="flex justify-between items-center py-2 border-b border-slate-800">
                <span class="text-sm text-slate-400">Rychlost</span>
                <span class="text-sm font-medium text-slate-200">{{ assessment.speed }} km/h</span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-slate-800">
                <span class="text-sm text-slate-400">Souřadnice</span>
                <span class="text-xs font-mono text-slate-400">
                  {{ assessment.position.latitude }}, {{ assessment.position.longitude }}
                </span>
              </div>
            </div>
          </div>

          <!-- SERVICE & MAINTENANCE -->
          <div v-if="svc">
            <h3 class="text-xs font-semibold text-slate-400 uppercase mb-3">
              🛠 Servis &amp; údržba
            </h3>

            <div class="space-y-0">
              <div class="flex justify-between items-center py-2 border-b border-slate-800">
                <span class="text-sm text-slate-400">Aktuální nájezd</span>
                <span class="text-sm font-medium text-slate-200">{{ formatKm(svc.odometer) }}</span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-slate-800">
                <span class="text-sm text-slate-400">Další servis při</span>
                <span class="text-sm font-medium text-slate-200">{{ formatKm(svc.nextServiceAt) }}</span>
              </div>
              <div class="flex justify-between items-center py-2 border-b border-slate-800">
                <span class="text-sm text-slate-400">Zbývá</span>
                <span
                  class="text-sm font-semibold"
                  :class="{
                    'text-red-400':    svc.serviceStatus === 'critical',
                    'text-yellow-400': svc.serviceStatus === 'warning',
                    'text-green-400':  svc.serviceStatus === 'ok',
                  }"
                >
                  {{ formatKm(svc.remainingKm) }}
                </span>
              </div>
            </div>

            <!-- Progress bar -->
            <div class="mt-4">
              <div class="flex justify-between text-[11px] text-slate-500 mb-1.5">
                <span>Interval servisu</span>
                <span>{{ serviceStatusLabel(svc.serviceStatus) }}</span>
              </div>
              <div class="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="progressBarClass"
                  :style="{ width: progressPercent + '%' }"
                />
              </div>
              <div class="text-[10px] text-slate-600 mt-1 text-right">
                Využito {{ progressPercent }} % servisního intervalu
              </div>
            </div>
          </div>

          <!-- FUEL MONITORING -->
          <div>
            <h3 class="text-xs font-semibold text-slate-400 uppercase mb-3">
              ⛽ Palivo
            </h3>

            <!-- Loading -->
            <div
              v-if="fuelLoading"
              class="text-sm text-slate-500 animate-pulse"
            >
              Načítám data paliva…
            </div>

            <!-- Error -->
            <div
              v-else-if="fuelError"
              class="text-sm text-slate-500 italic"
            >
              Data paliva nejsou dostupná
            </div>

            <!-- No anomaly -->
            <div
              v-else-if="fuelResult && fuelResult.severity === 'none'"
            >
              <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-900/30 border border-green-700 text-green-400 text-xs font-semibold">
                <span class="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"></span>
                Palivo v normě
              </div>
              <p class="mt-2 text-[11px] text-slate-500">
                Poslední kontrola: {{ formatRelativeTime(fuelLastTimestamp) ?? "Čas kontroly není k dispozici" }}
              </p>
            </div>

            <!-- Medium severity -->
            <div
              v-else-if="fuelResult && fuelResult.severity === 'medium'"
              class="flex items-start gap-3 px-4 py-3 rounded-lg bg-yellow-900/30 border border-yellow-700"
            >
              <span class="text-yellow-400 text-base flex-shrink-0">⚠️</span>
              <div>
                <p class="text-xs font-semibold text-yellow-400 mb-0.5">
                  Zvýšená spotřeba paliva
                </p>
                <p class="text-xs text-yellow-300/80">
                  {{ fuelResult.description ?? "Spotřeba paliva neodpovídá aktuální rychlosti vozidla" }}
                </p>
                <p class="mt-1.5 text-[11px] text-yellow-500/60">
                  Poslední kontrola: {{ formatRelativeTime(fuelLastTimestamp) ?? "Čas kontroly není k dispozici" }}
                </p>
              </div>
            </div>

            <!-- High severity -->
            <div
              v-else-if="fuelResult && fuelResult.severity === 'high'"
              class="flex items-start gap-3 px-4 py-3 rounded-lg bg-red-900/30 border border-red-700"
            >
              <span class="text-red-400 text-base flex-shrink-0">🚨</span>
              <div>
                <p class="text-xs font-semibold text-red-400 mb-0.5">
                  Podezřelý úbytek paliva
                </p>
                <p class="text-xs text-red-300/80">
                  {{ fuelResult.description ?? "Náhlý pokles objemu paliva bez odpovídající jízdy" }}
                </p>
                <p class="mt-1.5 text-[11px] text-red-500/60">
                  Poslední kontrola: {{ formatRelativeTime(fuelLastTimestamp) ?? "Čas kontroly není k dispozici" }}
                </p>
              </div>
            </div>

          </div>

        </div>

        <!-- ACTIONS FOOTER -->
        <div class="p-6 border-t border-slate-800 flex gap-3">
          <button
            class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition"
            @click="handleFocusMap"
          >
            <span>📍</span>
            <span>Zobrazit na mapě</span>
          </button>
          <button
            class="px-4 py-2.5 rounded-lg border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-slate-200 text-sm transition"
            @click="emit('close')"
          >
            Zavřít
          </button>
        </div>

      </div>
    </Transition>

  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.25s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}
</style>
