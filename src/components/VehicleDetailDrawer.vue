<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import type { AssessmentWithService, RiskLevel } from "../types/risk";
import { formatKm, serviceStatusLabel } from "../services/maintenanceService";
import { serviceProgressPercent } from "../services/serviceEngine";

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
                {{ progressPercent }}% intervalu spotřebováno
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
