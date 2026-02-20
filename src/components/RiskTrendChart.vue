<script setup lang="ts">
import { onMounted, ref, watch, nextTick } from "vue";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
} from "chart.js";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler
);

interface TrendPoint {
  day: number;
  critical: number;
  warning: number;
}

const props = defineProps<{
  data: TrendPoint[];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chartInstance: Chart | null = null;

const dayLabels = ["P-6", "P-5", "P-4", "P-3", "P-2", "Včera", "Dnes"];

function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

function renderChart() {
  if (!canvasRef.value || !props.data.length) return;

  destroyChart();

  chartInstance = new Chart(canvasRef.value, {
    type: "line",
    data: {
      labels: dayLabels,
      datasets: [
        {
          label: "Kritické",
          data: props.data.map((d) => d.critical),
          borderColor: "rgba(239, 68, 68, 0.9)",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          fill: true,
          tension: 0.3,
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
        {
          label: "Varování",
          data: props.data.map((d) => d.warning),
          borderColor: "rgba(234, 179, 8, 0.9)",
          backgroundColor: "rgba(234, 179, 8, 0.1)",
          fill: true,
          tension: 0.3,
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          grid: { color: "rgba(71, 85, 105, 0.3)" },
          ticks: {
            color: "#64748b",
            maxRotation: 0,
            font: { size: 10 },
          },
        },
        y: {
          min: 0,
          grid: { color: "rgba(71, 85, 105, 0.3)" },
          ticks: {
            color: "#64748b",
            font: { size: 10 },
          },
        },
      },
    },
  });
}

onMounted(() => nextTick(renderChart));
watch(() => props.data, () => nextTick(renderChart), { deep: true });
</script>

<template>
  <div class="h-40 relative">
    <canvas ref="canvasRef" />
  </div>
</template>
