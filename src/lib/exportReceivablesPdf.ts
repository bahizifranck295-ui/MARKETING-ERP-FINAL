import { jsPDF } from "jspdf";
import { presentDocument } from "@/lib/documentViewer";

/*
 * Rapport des créances clients (module Rapports) : en-tête officiel PREMIDIS,
 * mêmes lignes et mêmes cinq colonnes que le tableau affiché dans le logiciel.
 */

const INK: [number, number, number] = [33, 26, 92]; // #211A5C, couleur des documents officiels
const SLATE: [number, number, number] = [100, 116, 139];

const txt = (v: unknown) => String(v ?? "").replace(/[  ]/g, " ");
const money = (n: number) =>
  `${Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, " ")} $`;

async function loadLogo(): Promise<string | null> {
  try {
    const img = new Image();
    img.src = "/assets/premidis-logo.svg";
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 320;
    c.getContext("2d")!.drawImage(img, 0, 0, 400, 320);
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

export type ReceivableRow = {
  debt_date?: string;
  client_name: string;
  marketer_name: string;
  amount: number;
  client_phone?: string;
};

export async function exportReceivablesPdf({ rows, editedBy, filtersLabel, tab = null }: { rows: ReceivableRow[]; editedBy: string; filtersLabel: string; tab?: Window | null }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const logo = await loadLogo();
  const now = new Date();

  const cols = [
    { label: "Date de la dette", w: 28 },
    { label: "Nom du client", w: 52 },
    { label: "Marketeur responsable", w: 42 },
    { label: "Montant de la dette", w: 32, right: true },
    { label: "Téléphone du client", w: 0 },
  ];
  cols[cols.length - 1].w = W - 2 * M - cols.slice(0, -1).reduce((s, c) => s + c.w, 0);

  let y = 0;
  const header = (first: boolean) => {
    if (logo) doc.addImage(logo, "PNG", M, 9, 17, 13.6);
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
    doc.text("RAPPORT DES CRÉANCES CLIENTS", W - M, 14, { align: "right" });
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
      doc.text("Clients débiteurs :", W / 2 + 25, y + 4.5);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(txt(editedBy), M + 20, y + 4.5);
      doc.text(String(rows.length), W / 2 + 53, y + 4.5);
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
    cols.forEach((c) => {
      doc.text(c.label, c.right ? x + c.w - 1.5 : x + 1.5, y + 4.7, { align: c.right ? "right" : "left" });
      x += c.w;
    });
    y += 7;
  };

  header(true);
  doc.setFontSize(8);
  rows.forEach((r, i) => {
    const cells = [
      r.debt_date ? new Date(r.debt_date).toLocaleDateString("fr-FR") : "-",
      r.client_name || "-",
      r.marketer_name || "Non attribué",
      money(r.amount),
      r.client_phone || "Non renseigné",
    ];
    const wrapped = cells.map((v, k) => doc.splitTextToSize(txt(v), cols[k].w - 3) as string[]);
    const h = Math.max(...wrapped.map((w) => w.length)) * 3.5 + 3;
    if (y + h > H - 30) {
      doc.addPage();
      header(false);
    }
    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(M, y, W - 2 * M, h, "F");
    }
    let x = M;
    wrapped.forEach((lines, k) => {
      const c = cols[k];
      doc.setFont("helvetica", k === 1 || k === 3 ? "bold" : "normal");
      if (k === 3) doc.setTextColor(190, 18, 60);
      else doc.setTextColor(15, 23, 42);
      lines.forEach((ln, j) => doc.text(ln, c.right ? x + c.w - 1.5 : x + 1.5, y + 4.2 + j * 3.5, { align: c.right ? "right" : "left" }));
      x += c.w;
    });
    y += h;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.15);
    doc.line(M, y, W - M, y);
  });
  if (!rows.length) {
    doc.setTextColor(...SLATE);
    doc.text("Aucune créance pour ce filtre.", M + 2, y + 6);
    y += 10;
  }

  // Total (comme le bloc « Total Net » des factures)
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  if (y + 16 > H - 14) {
    doc.addPage();
    header(false);
  }
  y += 4;
  const bx = W - M - 75;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.roundedRect(bx, y, 75, 10, 1.5, 1.5, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text("TOTAL DES CRÉANCES :", bx + 3, y + 6.3);
  doc.text(money(total), bx + 72, y + 6.3, { align: "right" });

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

  const fileName = `Rapport_Creances_Clients_PREMIDIS_${now.toISOString().slice(0, 10)}.pdf`;
  doc.setProperties({ title: "Rapport des créances clients" });
  // Ouverture dans le visualiseur PDF de Chrome (télécharger / imprimer depuis le visualiseur)
  return presentDocument(doc.output("blob"), fileName, tab);
}
