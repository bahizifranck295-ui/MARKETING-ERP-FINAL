import { jsPDF } from "jspdf";
import { presentDocument } from "@/lib/documentViewer";
import { drawLogo, loadLogoDataUrl } from "@/app/brand";

/*
 * Export PDF d'un tableau de rapport avec l'en-tête officiel PREMIDIS
 * (même présentation que la facture et le rapport des créances).
 * Les colonnes et les lignes sont celles affichées dans le logiciel.
 */

const INK: [number, number, number] = [33, 26, 92]; // #211A5C
const SLATE: [number, number, number] = [100, 116, 139];

const txt = (v: unknown) => String(v ?? "").replace(/[  ]/g, " ");

async function loadLogo(): Promise<string | null> {
  // Logo officiel PREMIDIS (fichier unique, sans modification) : voir src/app/brand.ts
  return loadLogoDataUrl();
}

export type TableColumn = {
  label: string;
  /** Largeur relative de la colonne */
  weight?: number;
  right?: boolean;
  bold?: boolean;
  /** Couleur du texte d'une cellule (selon la ligne) */
  color?: (row: string[], index: number) => [number, number, number] | undefined;
};

export async function exportTablePdf({
  title,
  fileName,
  columns,
  rows,
  editedBy,
  filtersLabel,
  countLabel,
  totals = [],
  emptyLabel = "Aucune donnée pour ce filtre.",
  tab = null,
}: {
  title: string;
  fileName: string;
  columns: TableColumn[];
  rows: string[][];
  editedBy: string;
  filtersLabel: string;
  countLabel: string;
  totals?: { label: string; value: string }[];
  emptyLabel?: string;
  tab?: Window | null;
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const logo = await loadLogo();
  const now = new Date();

  const sumW = columns.reduce((s, c) => s + (c.weight || 1), 0);
  const widths = columns.map((c) => ((c.weight || 1) / sumW) * (W - 2 * M));

  let y = 0;
  const header = (first: boolean) => {
    if (logo) drawLogo(doc, logo, M, 9, 17, 13.6);
    const x0 = logo ? M + 20 : M;
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("PREMIDIS SARL", x0, 14);
    doc.setFontSize(6.5);
    doc.setTextColor(...SLATE);
    doc.text("PRODUCTION & DISTRIBUTION AGROALIMENTAIRE & INDUSTRIELLE", x0, 18);
    doc.setFont("helvetica", "normal");
    doc.text("Siège Social : Route Aéroport, Bujovu, Goma, Nord-Kivu, RDC", x0, 21.5);
    doc.text("Tél : +243 971 002 001 • Email : contact@premidis.cd", x0, 24.5);
    doc.text("RCCM : CD/GOM/RCCM/21-B-0042 • ID. NAT : 01-83-N48201W", x0, 27.5);

    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(title, W - M, 14, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text(`Date d'édition : ${txt(now.toLocaleString("fr-FR"))}`, W - M, 19.5, { align: "right" });

    doc.setDrawColor(...INK);
    doc.setLineWidth(0.6);
    doc.line(M, 31, W - M, 31);
    y = 35;

    if (first) {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.roundedRect(M, y, W - 2 * M, 11, 1.5, 1.5, "FD");
      doc.setFontSize(8);
      doc.setTextColor(...SLATE);
      doc.text("Édité par :", M + 3, y + 4.5);
      doc.text("Filtre :", M + 3, y + 8.8);
      doc.text(`${countLabel} :`, W / 2 + 40, y + 4.5);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(txt(editedBy), M + 20, y + 4.5);
      doc.text(String(rows.length), W - M - 3, y + 4.5, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.text(txt(filtersLabel), M + 20, y + 8.8);
      y += 15;
    }

    doc.setFillColor(...INK);
    doc.rect(M, y, W - 2 * M, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    let x = M;
    columns.forEach((c, k) => {
      doc.text(c.label, c.right ? x + widths[k] - 1.5 : x + 1.5, y + 4.7, { align: c.right ? "right" : "left" });
      x += widths[k];
    });
    y += 7;
  };

  header(true);
  doc.setFontSize(8);
  rows.forEach((r, i) => {
    const wrapped = r.map((v, k) => doc.splitTextToSize(txt(v), widths[k] - 3) as string[]);
    const h = Math.max(1, ...wrapped.map((w) => w.length)) * 3.5 + 3;
    if (y + h > H - 16) {
      doc.addPage();
      header(false);
      doc.setFontSize(8);
    }
    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(M, y, W - 2 * M, h, "F");
    }
    let x = M;
    wrapped.forEach((lines, k) => {
      const c = columns[k];
      doc.setFont("helvetica", c.bold ? "bold" : "normal");
      doc.setTextColor(...(c.color?.(r, i) || ([15, 23, 42] as [number, number, number])));
      lines.forEach((ln, j) => doc.text(ln, c.right ? x + widths[k] - 1.5 : x + 1.5, y + 4.2 + j * 3.5, { align: c.right ? "right" : "left" }));
      x += widths[k];
    });
    y += h;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.15);
    doc.line(M, y, W - M, y);
  });
  if (!rows.length) {
    doc.setTextColor(...SLATE);
    doc.text(emptyLabel, M + 2, y + 6);
    y += 10;
  }

  // Totaux (comme le bloc « Total Net » des factures)
  if (totals.length) {
    const boxH = 6 + totals.length * 5;
    if (y + boxH + 6 > H - 14) {
      doc.addPage();
      header(false);
    }
    y += 4;
    const bw = 95;
    const bx = W - M - bw;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.4);
    doc.roundedRect(bx, y, bw, boxH, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    totals.forEach((t, k) => {
      doc.text(t.label, bx + 3, y + 6.3 + k * 5);
      doc.text(txt(t.value), bx + bw - 3, y + 6.3 + k * 5, { align: "right" });
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(M, H - 10, W - M, H - 10);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text("Rapport certifié ERP Cloud • Plateforme de Gestion Commerciale PREMIDIS SARL • RDC", W / 2, H - 6, { align: "center" });
    doc.text(`Page ${i} / ${pages}`, W - M, H - 6, { align: "right" });
  }

  doc.setProperties({ title });
  return presentDocument(doc.output("blob"), fileName, tab);
}
