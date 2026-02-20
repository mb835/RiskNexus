<script setup lang="ts">
import { onMounted, ref, watch, computed, nextTick } from "vue";
import {
  Chart,
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { UI_LABELS } from "../constants/uiLabels";

Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

const props = defineProps<{
  critical: number;
  warning: number;
  ok: number;
}>();

const total = computed(
  () => props.critical + props.warning + props.ok
);

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chartInstance: Chart | null = null;

/* -------------------------
   CENTER TEXT PLUGIN
-------------------------- */

const centerTextPlugin = {
  id: "centerText",
  beforeDraw(chart: any) {
    const { ctx } = chart;
    const { width, height } = chart;

    ctx.save();

    const centerX = width / 2;
    const centerY = height / 2;

    ctx.font = "600 48px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#f1f5f9";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(total.value.toString(), centerX, centerY - 8);

    ctx.font = "500 12px Inter, system-ui, sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(
      UI_LABELS.chart.totalLabel,
      centerX,
      centerY + 26
    );

    ctx.restore();
  },
};

/* -------------------------
   RENDER
-------------------------- */

function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

function renderChart() {
  if (!canvasRef.value) return;

  destroyChart();

  chartInstance = new Chart(canvasRef.value, {
    type: "doughnut",
    plugins: [centerTextPlugin],
    data: {
      labels: [
        UI_LABELS.chart.legend.critical,
        UI_LABELS.chart.legend.warning,
        UI_LABELS.chart.legend.ok,
      ],
      datasets: [
        {
          data: [
            props.critical,
            props.warning,
            props.ok,
          ],
          backgroundColor: [
            "rgba(239, 68, 68, 0.85)",
            "rgba(234, 179, 8, 0.85)",
            "rgba(34, 197, 94, 0.85)",
          ],
          borderWidth: 0,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "72%",
      animation: {
        duration: 600,
      },
      plugins: {
        legend: {
          position: "bottom",
          onClick: () => {
            /* 🔥 zakážeme přepínání legendy */
            return;
          },
          labels: {
            color: "#94a3b8",
            padding: 20,
            font: {
              size: 12,
            },
          },
        },
        tooltip: {
          backgroundColor: "#0f172a",
          borderColor: "rgba(71, 85, 105, 0.5)",
          borderWidth: 1,
          titleColor: "#f8fafc",
          bodyColor: "#cbd5e1",
        },
      },
    },
  });
}

onMounted(() => {
  nextTick(renderChart);
});

watch(
  () => [props.critical, props.warning, props.ok],
  () => {
    nextTick(renderChart);
  }
);
</script>

<template>
  <div class="rounded-xl border border-slate-700/50 bg-slate-900 p-6">
    <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
      {{ UI_LABELS.chart.title }}
    </h2>

    <div class="h-72 relative">
      <canvas ref="canvasRef"></canvas>
    </div>
  </div>
</template>
