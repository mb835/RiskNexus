/**
 * reportExportService.ts
 *
 * Client-side PDF export using jsPDF.
 * No backend dependency — runs entirely in the browser.
 * Language: Czech.
 */

import jsPDF from "jspdf";
import type { AssessmentWithDelta, RiskLevel } from "../types/risk";

/* -------------------------
   HELPERS
-------------------------- */

function riskLevelLabel(level: RiskLevel): string {
  switch (level) {
    case "critical": return "Kritické";
    case "warning":  return "Varování";
    case "ok":       return "V pořádku";
  }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("cs-CZ");
  } catch {
    return iso;
  }
}

function nowLabel(): string {
  return new Date().toLocaleString("cs-CZ");
}

/* -------------------------
   COLOUR HELPERS (RGB tuples)
-------------------------- */

type RGB = [number, number, number];

const COLOURS = {
  header:   [15, 23, 42] as RGB,   // slate-950
  accent:   [59, 130, 246] as RGB, // blue-500
  critical: [220, 38, 38] as RGB,  // red-600
  warning:  [234, 179, 8] as RGB,  // yellow-500
  ok:       [34, 197, 94] as RGB,  // green-500
  text:     [30, 41, 59] as RGB,   // slate-800
  muted:    [100, 116, 139] as RGB,// slate-500
  bg:       [248, 250, 252] as RGB,// slate-50
  white:    [255, 255, 255] as RGB,
};

function levelColour(level: RiskLevel): RGB {
  switch (level) {
    case "critical": return COLOURS.critical;
    case "warning":  return COLOURS.warning;
    case "ok":       return COLOURS.ok;
  }
}

/* -------------------------
   LAYOUT CONSTANTS
-------------------------- */

const MARGIN = 16;
const PAGE_W = 210; // A4 mm
const COL_W = PAGE_W - MARGIN * 2;

/* -------------------------
   EXPORT FUNCTION
-------------------------- */

/**
 * Generate and download a PDF report for the current fleet risk state.
 *
 * @param assessments - full list of assessments to summarise
 */
export function exportFleetReport(assessments: AssessmentWithDelta[]): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  let y = MARGIN;

  /* ---------- HEADER BANNER ---------- */
  doc.setFillColor(...COLOURS.header);
  doc.rect(0, 0, PAGE_W, 36, "F");

  doc.setTextColor(...COLOURS.white);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Fleet Operational Risk Report", MARGIN, 16);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Vygenerováno: ${nowLabel()}`, MARGIN, 24);
  doc.text(`Celkem vozidel: ${assessments.length}`, MARGIN, 30);

  y = 44;

  /* ---------- SUMMARY KPI ROW ---------- */
  const critical = assessments.filter((a) => a.riskLevel === "critical").length;
  const warning  = assessments.filter((a) => a.riskLevel === "warning").length;
  const ok       = assessments.filter((a) => a.riskLevel === "ok").length;

  interface KpiBlock { label: string; value: number; colour: RGB }
  const kpis: KpiBlock[] = [
    { label: "Kritické",   value: critical, colour: COLOURS.critical },
    { label: "Varování",   value: warning,  colour: COLOURS.warning  },
    { label: "V pořádku",  value: ok,       colour: COLOURS.ok       },
  ];

  const kpiW = COL_W / 3;
  kpis.forEach((kpi, i) => {
    const x = MARGIN + i * kpiW;
    doc.setFillColor(...COLOURS.bg);
    doc.roundedRect(x, y, kpiW - 3, 22, 2, 2, "F");

    doc.setTextColor(...kpi.colour);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(String(kpi.value), x + 4, y + 13);

    doc.setTextColor(...COLOURS.muted);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(kpi.label, x + 4, y + 19);
  });

  y += 30;

  /* ---------- SECTION: TOP 5 HIGHEST RISK ---------- */
  doc.setTextColor(...COLOURS.text);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Top 5 vozidel s nejvyšším rizikem", MARGIN, y);

  y += 2;
  doc.setDrawColor(...COLOURS.accent);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, MARGIN + COL_W, y);
  y += 6;

  const top5 = [...assessments]
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5);

  /* Table header */
  const colX = [MARGIN, MARGIN + 60, MARGIN + 110, MARGIN + 140, MARGIN + 162];

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLOURS.muted);
  doc.text("VOZIDLO / SPZ",  colX[0], y);
  doc.text("ÚROVEŇ",         colX[1], y);
  doc.text("SKÓRE",          colX[2], y);
  doc.text("RYCHLOST",       colX[3], y);
  doc.text("VYPOČTENO",      colX[4], y);

  y += 2;
  doc.setDrawColor(...COLOURS.muted);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, MARGIN + COL_W, y);
  y += 4;

  /* Table rows */
  doc.setFont("helvetica", "normal");

  top5.forEach((a, idx) => {
    /* Alternating row background */
    if (idx % 2 === 0) {
      doc.setFillColor(...COLOURS.bg);
      doc.rect(MARGIN, y - 3.5, COL_W, 10, "F");
    }

    doc.setFontSize(8);
    doc.setTextColor(...COLOURS.text);
    doc.setFont("helvetica", "bold");
    doc.text(a.vehicleName, colX[0], y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...COLOURS.muted);
    doc.text(a.spz || "—", colX[0], y + 3.5);

    /* Risk level badge colour */
    doc.setTextColor(...levelColour(a.riskLevel));
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(riskLevelLabel(a.riskLevel), colX[1], y);

    doc.setTextColor(...COLOURS.text);
    doc.setFont("helvetica", "normal");
    doc.text(String(a.riskScore), colX[2], y);
    doc.text(`${a.speed} km/h`, colX[3], y);

    doc.setFontSize(6.5);
    doc.setTextColor(...COLOURS.muted);
    doc.text(formatTimestamp(a.calculatedAt), colX[4], y);

    y += 10;

    /* Page break guard */
    if (y > 270) {
      doc.addPage();
      y = MARGIN;
    }
  });

  /* ---------- SECTION: ALL VEHICLES ---------- */
  y += 6;

  if (y > 240) {
    doc.addPage();
    y = MARGIN;
  }

  doc.setTextColor(...COLOURS.text);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Přehled všech vozidel", MARGIN, y);

  y += 2;
  doc.setDrawColor(...COLOURS.accent);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, MARGIN + COL_W, y);
  y += 6;

  /* Header */
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLOURS.muted);
  doc.text("VOZIDLO",  colX[0], y);
  doc.text("ÚROVEŇ",  colX[1], y);
  doc.text("SKÓRE",   colX[2], y);

  y += 2;
  doc.setDrawColor(...COLOURS.muted);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, MARGIN + COL_W, y);
  y += 4;

  const sorted = [...assessments].sort((a, b) => b.riskScore - a.riskScore);

  sorted.forEach((a, idx) => {
    if (y > 270) {
      doc.addPage();
      y = MARGIN;
    }

    if (idx % 2 === 0) {
      doc.setFillColor(...COLOURS.bg);
      doc.rect(MARGIN, y - 3, COL_W, 7, "F");
    }

    doc.setFontSize(7.5);
    doc.setTextColor(...COLOURS.text);
    doc.setFont("helvetica", "normal");
    doc.text(a.vehicleName, colX[0], y);

    doc.setTextColor(...levelColour(a.riskLevel));
    doc.setFont("helvetica", "bold");
    doc.text(riskLevelLabel(a.riskLevel), colX[1], y);

    doc.setTextColor(...COLOURS.text);
    doc.setFont("helvetica", "normal");
    doc.text(String(a.riskScore), colX[2], y);

    y += 7;
  });

  /* ---------- FOOTER ---------- */
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(6.5);
    doc.setTextColor(...COLOURS.muted);
    doc.text(
      `Strana ${p} / ${pageCount}  |  Fleet Operational Risk Dashboard`,
      MARGIN,
      295
    );
  }

  /* ---------- SAVE ---------- */
  const filename = `fleet-risk-report-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
