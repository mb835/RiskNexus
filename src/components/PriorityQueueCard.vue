<script setup lang="ts">
import { computed } from "vue";
import type { AssessmentWithService, RiskLevel } from "../types/risk";

const props = defineProps<{
  assessments: AssessmentWithService[];
}>();

const emit = defineEmits<{
  (e: "resolve", assessment: AssessmentWithService): void;
}>();

function getMinutesWithoutCommunication(a: AssessmentWithService): number {
  let max = 0;
  for (const r of a.reasons) {
    if (r.type === "noUpdate" || r.type === "noUpdateCritical") {
      const val = Number(r.value);
      if (!Number.isNaN(val) && val > max) max = val;
    }
  }
  return max;
}

function isPredictedToWorsen(a: AssessmentWithService): boolean {
  return (
    a.riskLevel === "critical" ||
    a.reasons.some((r) => r.type === "noUpdateCritical")
  );
}

function computePriorityScore(a: AssessmentWithService): number {
  const minutes = getMinutesWithoutCommunication(a);
  const predictedToWorsen = isPredictedToWorsen(a);
  return (
    a.riskScore * 2 +
    minutes / 60 +
    (predictedToWorsen ? 3 : 0)
  );
}

interface QueueItem {
  assessment: AssessmentWithService;
  position: number;
  priorityScore: number;
  minutesWithoutCommunication: number;
  predictedToWorsen: boolean;
}

const topFive = computed<QueueItem[]>(() => {
  const items: QueueItem[] = props.assessments.map((a) => ({
    assessment: a,
    position: 0,
    priorityScore: computePriorityScore(a),
    minutesWithoutCommunication: getMinutesWithoutCommunication(a),
    predictedToWorsen: isPredictedToWorsen(a),
  }));
  items.sort((a, b) => b.priorityScore - a.priorityScore);
  return items.slice(0, 5).map((item, i) => ({ ...item, position: i + 1 }));
});

function getBorderClassByRisk(level: RiskLevel): string {
  switch (level) {
    case "critical":
      return "border-l-red-500/70";
    case "warning":
      return "border-l-amber-500/70";
    default:
      return "border-l-emerald-500/50";
  }
}

function formatPriorityScore(score: number): string {
  return score.toFixed(1);
}

function getRiskBadgeClass(level: RiskLevel): string {
  switch (level) {
    case "critical":
      return "bg-red-500/15 text-red-400";
    case "warning":
      return "bg-amber-500/15 text-amber-400";
    default:
      return "bg-slate-600/40 text-slate-400";
  }
}

function handleResolve(item: QueueItem) {
  emit("resolve", item.assessment);
}
</script>

<template>
  <div class="rounded-xl border border-slate-700/50 bg-slate-900 p-6">
    <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
      Prioritní fronta (TOP 5)
    </h3>

    <div v-if="topFive.length === 0" class="text-sm text-slate-500 py-4">
      Žádná vozidla k zobrazení.
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="item in topFive"
        :key="item.assessment.vehicleId"
        class="flex items-center gap-3 py-4 px-4 rounded-lg border-l-4 transition-all duration-200 cursor-pointer hover:bg-slate-800/50 hover:shadow-md"
        :class="getBorderClassByRisk(item.assessment.riskLevel)"
        @click="handleResolve(item)"
      >
        <span class="text-[11px] font-medium text-slate-600 w-5 shrink-0 text-left">
          #{{ item.position }}
        </span>
        <div class="min-w-0 flex-1">
          <span
            v-if="item.position === 1"
            class="inline-block text-[10px] font-medium uppercase tracking-wider text-red-400/90 bg-red-500/15 rounded-full px-2 py-0.5 mb-2"
          >
            Nejvyšší priorita
          </span>
          <p class="font-medium text-slate-100 truncate">
            {{ item.assessment.vehicleName }}
          </p>
          <p class="text-[11px] text-slate-500 mt-0.5">
            Prioritní skóre: {{ formatPriorityScore(item.priorityScore) }}
          </p>
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <span
              class="inline-flex px-2 py-0.5 rounded text-xs font-semibold"
              :class="getRiskBadgeClass(item.assessment.riskLevel)"
            >
              {{ item.assessment.riskScore }}
            </span>
            <span
              v-if="item.minutesWithoutCommunication > 0"
              class="text-xs text-slate-500"
            >
              Bez komunikace {{ item.minutesWithoutCommunication }} min
            </span>
            <span
              v-if="item.predictedToWorsen"
              class="text-xs text-amber-400"
            >
              Predikce: zhoršení
            </span>
          </div>
        </div>
        <button
          type="button"
          class="shrink-0 w-24 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200"
          :class="item.position === 1
            ? 'bg-red-600 hover:bg-red-500 text-white'
            : 'border border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500'"
          @click.stop="handleResolve(item)"
        >
          {{ item.position === 1 ? 'Řešit ihned' : 'Řešit' }}
        </button>
      </div>
    </div>
  </div>
</template>
