import { jsPDF } from "jspdf";

/* Exports des rapports du module Stock : PDF (tableau paginé) et CSV pour Excel */

export type ExportColumn = { label: string; width?: number; align?: "left" | "right" };
export type ExportTable = {
  title: string;
  subtitle?: string;
  fileBase: string;
  columns: ExportColumn[];
  rows: Array<Array<string | number>>;
  totals?: Array<string | number>;
};

const stamp = () => new Date().toISOString().slice(0, 10);

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const [head, body] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] || "application/octet-stream";
  const bin = atob(body || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  triggerDownload(new Blob([bytes], { type: mime }), fileName);
}

// CSV séparé par « ; » avec BOM : s'ouvre directement dans Excel en français
export function exportCsv(t: ExportTable) {
  const cell = (v: string | number) => {
    const s = typeof v === "number" ? String(v).replace(".", ",") : String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    [`PREMIDIS SARL - ${t.title}`],
    [`Exporté le ${new Date().toLocaleString("fr-FR")}`],
    ...(t.subtitle ? [[t.subtitle]] : []),
    [],
    t.columns.map((c) => c.label),
    ...t.rows,
    ...(t.totals ? [t.totals] : []),
  ];
  const csv = "﻿" + lines.map((l) => l.map(cell).join(";")).join("\r\n");
  const fileName = `${t.fileBase}_${stamp()}.csv`;
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), fileName);
  return fileName;
}

// Police PDF standard : on remplace les caractères qu'elle ne sait pas dessiner
const pdfText = (v: unknown) =>
  String(v ?? "")
    .replace(/[\u202f\u00a0]/g, " ")
    .replace(/→/g, "->")
    .replace(/←/g, "<-");

export function exportPdf(t: ExportTable) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const totalWeight = t.columns.reduce((s, c) => s + (c.width || 1), 0);
  const widths = t.columns.map((c) => ((c.width || 1) / totalWeight) * (W - 2 * M));
  let y = 0;

  const header = () => {
    doc.setFillColor(15, 61, 104);
    doc.rect(0, 0, W, 18, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("PREMIDIS SARL", M, 11.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(pdfText(`Exporté le ${new Date().toLocaleString("fr-FR")}`), W - M, 11.5, { align: "right" });
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(pdfText(t.title), M, 27);
    y = 31;
    if (t.subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(pdfText(t.subtitle), M, y + 1);
      y += 5;
    }
    // en-tête du tableau
    y += 2;
    doc.setFillColor(241, 245, 249);
    doc.rect(M, y, W - 2 * M, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    let x = M;
    t.columns.forEach((c, i) => {
      doc.text(pdfText(c.label), c.align === "right" ? x + widths[i] - 1.5 : x + 1.5, y + 4.7, { align: c.align === "right" ? "right" : "left" });
      x += widths[i];
    });
    y += 7;
  };

  const row = (cells: Array<string | number>, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    // Nombres au format français ; colonnes « ($) » avec 2 décimales
    const fmt = (v: string | number, i: number) =>
      typeof v !== "number"
        ? v
        : t.columns[i].label.includes("($)")
        ? v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : v.toLocaleString("fr-FR");
    const wrapped = cells.map((v, i) => doc.splitTextToSize(pdfText(fmt(v, i)), widths[i] - 3) as string[]);
    const h = Math.max(...wrapped.map((w) => w.length)) * 3.6 + 2.6;
    if (y + h > H - 14) {
      doc.addPage();
      header();
    }
    let x = M;
    wrapped.forEach((lines, i) => {
      const right = t.columns[i].align === "right";
      lines.forEach((ln, k) => doc.text(ln, right ? x + widths[i] - 1.5 : x + 1.5, y + 4 + k * 3.6, { align: right ? "right" : "left" }));
      x += widths[i];
    });
    y += h;
    doc.setDrawColor(226, 232, 240);
    doc.line(M, y, W - M, y);
  };

  header();
  t.rows.forEach((r) => row(r));
  if (!t.rows.length) row(["Aucune donnée", ...t.columns.slice(1).map(() => "")]);
  if (t.totals) row(t.totals, true);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${i} / ${pages}`, W - M, H - 6, { align: "right" });
  }
  const fileName = `${t.fileBase}_${stamp()}.pdf`;
  triggerDownload(doc.output("blob"), fileName);
  return fileName;
}
