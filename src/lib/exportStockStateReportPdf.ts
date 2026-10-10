import { jsPDF } from "jspdf";

/*
 * PDF du rapport « Sales & Stock Report » (modèle papier PREMIDIS SARL) :
 * en-tête (site, date / période, catégorie, dépôt), tableau de l'état de stock,
 * détail par dépôt, notes (dommages et cadeaux), ventes à crédit, préparé par.
 * Les en-têtes de tableau sont répétés à chaque page ; pages numérotées.
 */

const INK: [number, number, number] = [33, 26, 92];
const SLATE: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [148, 163, 184];

const txt = (v: unknown) => String(v ?? "").replace(/[  ]/g, " ");
export const fmtQty = (n: number) => (n ? Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ") : "");
const fmtQtyZero = (n: number) => Math.round(n || 0).toLocaleString("fr-FR").replace(/[  ]/g, " ");
export const fmtAmount = (n: number, cur = "USD") =>
  `${Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, " ")} ${cur === "CDF" ? "FC" : "$"}`;
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("fr-FR");

export const STOCK_COLUMNS = [
  { key: "product", label: "Particulars", sub: "Produit" },
  { key: "opening", label: "Opening Stock", sub: "Stock initial" },
  { key: "received", label: "Received Stock", sub: "Stock reçu" },
  { key: "sent", label: "Sent to Other Depot", sub: "Transferts sortants" },
  { key: "cash", label: "Cash Sales", sub: "Ventes comptant" },
  { key: "credit", label: "Credit Sales", sub: "Ventes à crédit" },
  { key: "damage", label: "Damages & Gifts", sub: "Dommages et cadeaux" },
  { key: "closing", label: "Closing Stock", sub: "Stock final" },
] as const;

export const CREDIT_COLUMNS = ["S. No.", "Client Name", "Particulars", "Qty", "Price", "Amount", "Comments"];

export const mainTitle = (report: any) =>
  report.all_sites
    ? "Vue d'ensemble — Tous les sites (synthèse de tous les dépôts)"
    : report.warehouse_id === "all"
    ? `État de stock — ${report.site_name} (synthèse des dépôts du site)`
    : `État de stock — ${report.warehouse_name}`;
export const neutralNote = (report: any) =>
  report.all_sites
    ? "Vue d'ensemble : les transferts entre dépôts de l'entreprise ne sont comptés ni en sortie ni en entrée."
    : "Synthèse du site : les transferts entre dépôts du même site ne sont comptés ni en sortie ni en entrée.";
export const sectionTitleOf = (s: any) => (s.kind === "site" ? `Site : ${s.warehouse_name}` : `Dépôt : ${s.warehouse_name}`);

export function reportTitle(category: string) {
  return `${category} Sales & Stock Report`;
}

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

export async function buildStockStateReportPdf(report: any, opts: { periodLabel: string; preparedBy: string; generatedAt?: string }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 10;
  const IW = W - 2 * M;
  const logo = await loadLogo();
  let y = 0;

  // ---------- En-tête du document (page 1) ----------
  const header = () => {
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.4);
    doc.rect(M, 8, IW, 26);
    if (logo) doc.addImage(logo, "PNG", M + 2, 10, 15, 12);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`PREMIDIS SARL  ·  ${reportTitle(report.category)}`, W / 2, 15, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text("Rapport des ventes et de l'état de stock", W / 2, 19.5, { align: "center" });
    // Ligne Branch / Date / Catégorie / Dépôt (comme le modèle papier)
    const cells = [
      ["Branch / Site", report.site_name],
      ["Date", opts.periodLabel],
      ["Catégorie", report.category],
      ["Dépôt", report.warehouse_name],
    ];
    const cw = IW / cells.length;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(M, 23, W - M, 23);
    cells.forEach(([k, v], i) => {
      const x = M + i * cw;
      if (i) doc.line(x, 23, x, 34);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...SLATE);
      doc.text(k, x + 2, 27);
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(doc.splitTextToSize(txt(v), cw - 4)[0] || "", x + 2, 32);
    });
    y = 38;
  };

  const ensure = (h: number, redraw?: () => void) => {
    if (y + h > H - 14) {
      doc.addPage();
      y = 12;
      redraw?.();
    }
  };

  const sectionTitle = (t: string) => {
    ensure(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(t, M, y + 4);
    y += 6.5;
  };

  // ---------- Tableau d'état de stock (8 colonnes) ----------
  const widths = [50, 19, 19, 21, 19, 19, 21, 22];
  const scale = IW / widths.reduce((a, b) => a + b, 0);
  const cw = widths.map((w) => w * scale);
  const stockHead = () => {
    doc.setFillColor(...INK);
    doc.rect(M, y, IW, 11, "F");
    doc.setTextColor(255, 255, 255);
    let x = M;
    STOCK_COLUMNS.forEach((c, i) => {
      const center = i > 0;
      const tx = center ? x + cw[i] / 2 : x + 1.5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.6);
      const lines = (doc.splitTextToSize(c.label, cw[i] - 2) as string[]).slice(0, 2);
      lines.forEach((ln, j) => doc.text(ln, tx, y + (lines.length === 1 ? 4.6 : 3.4) + j * 2.6, { align: center ? "center" : "left" }));
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.4);
      doc.text(c.sub, tx, y + 9.4, { align: center ? "center" : "left" });
      x += cw[i];
    });
    y += 11;
  };
  const stockTable = (rows: any[], totals: any) => {
    ensure(18);
    stockHead();
    const line = (r: any, bold = false, fill?: [number, number, number]) => {
      const name = doc.splitTextToSize(txt(r.product + (r.unit ? ` (${r.unit})` : "")), cw[0] - 3) as string[];
      const h = Math.max(1, name.length) * 3.4 + 2.6;
      ensure(h, stockHead);
      if (fill) {
        doc.setFillColor(...fill);
        doc.rect(M, y, IW, h, "F");
      }
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      name.forEach((ln, j) => doc.text(ln, M + 1.5, y + 3.8 + j * 3.4));
      let x = M + cw[0];
      ["opening", "received", "sent", "cash", "credit", "damage", "closing"].forEach((k, i) => {
        const v = Number(r[k]) || 0;
        const s = k === "opening" || k === "closing" ? fmtQtyZero(v) : fmtQty(v);
        if (k === "closing") doc.setFont("helvetica", "bold");
        doc.text(s, x + cw[i + 1] - 1.8, y + 3.8, { align: "right" });
        x += cw[i + 1];
      });
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.15);
      doc.rect(M, y, IW, h);
      let gx = M;
      cw.slice(0, -1).forEach((w) => {
        gx += w;
        doc.line(gx, y, gx, y + h);
      });
      y += h;
    };
    rows.forEach((r) => line(r));
    if (!rows.length) {
      ensure(8, stockHead);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(...SLATE);
      doc.text("Aucun produit de cette catégorie dans ce périmètre.", M + 2, y + 4.5);
      doc.rect(M, y, IW, 7);
      y += 7;
    } else line({ product: "TOTAL", ...totals }, true, [241, 245, 249]);
    y += 4;
  };

  header();
  sectionTitle(mainTitle(report));
  stockTable(report.main.rows, report.main.totals);
  if (report.main.intra_site_neutral) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.8);
    doc.setTextColor(...SLATE);
    doc.text(neutralNote(report), M, y - 1.5);
    y += 2;
  }

  // ---------- Détail par dépôt ----------
  if (report.warehouse_id === "all") {
    report.sections.forEach((s: any) => {
      sectionTitle(sectionTitleOf(s));
      stockTable(s.rows, s.totals);
    });
  }

  // ---------- Notes : justification des dommages et cadeaux ----------
  sectionTitle("Notes / Justification des dommages et cadeaux");
  const nW = [20, 46, 14, 34, 28, 48].map((w) => (w * IW) / 190);
  const nHead = () => {
    doc.setFillColor(...INK);
    doc.rect(M, y, IW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    let x = M;
    ["Date", "Produit", "Qté", "Dépôt", "Motif", "Commentaire"].forEach((h, i) => {
      doc.text(h, i === 2 ? x + nW[i] - 1.5 : x + 1.5, y + 4.1, { align: i === 2 ? "right" : "left" });
      x += nW[i];
    });
    y += 6;
  };
  if (!report.notes.length) {
    ensure(8);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text("Aucune opération enregistrée.", M + 2, y + 4);
    y += 8;
  } else {
    ensure(14);
    nHead();
    report.notes.forEach((n: any) => {
      const cells = [fmtDay(n.date), n.product, fmtQty(n.quantity), n.depot, n.motif, n.comment || "-"];
      const wrapped = cells.map((c, i) => doc.splitTextToSize(txt(c), nW[i] - 3) as string[]);
      const h = Math.max(...wrapped.map((w) => w.length)) * 3.3 + 2.4;
      ensure(h, nHead);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.3);
      doc.setTextColor(15, 23, 42);
      let x = M;
      wrapped.forEach((lines, i) => {
        lines.forEach((ln, j) => doc.text(ln, i === 2 ? x + nW[i] - 1.5 : x + 1.5, y + 3.6 + j * 3.3, { align: i === 2 ? "right" : "left" }));
        x += nW[i];
      });
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.15);
      doc.line(M, y + h, W - M, y + h);
      y += h;
    });
    y += 4;
  }

  // ---------- Credit Sales ----------
  sectionTitle("Credit Sales — Ventes à crédit");
  const cW = [11, 40, 42, 14, 20, 24, 39].map((w) => (w * IW) / 190);
  const right = [false, false, false, true, true, true, false];
  const cHead = () => {
    doc.setFillColor(...INK);
    doc.rect(M, y, IW, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    let x = M;
    CREDIT_COLUMNS.forEach((h, i) => {
      doc.text(h, right[i] ? x + cW[i] - 1.5 : x + 1.5, y + 4.1, { align: right[i] ? "right" : "left" });
      x += cW[i];
    });
    y += 6;
  };
  ensure(14);
  cHead();
  const totalsByCur: Record<string, number> = {};
  report.credit.forEach((c: any, k: number) => {
    totalsByCur[c.currency] = (totalsByCur[c.currency] || 0) + (Number(c.amount) || 0);
    const cells = [String(k + 1), c.client, c.product, fmtQty(c.qty), fmtAmount(c.price, c.currency), fmtAmount(c.amount, c.currency), c.comment || ""];
    const wrapped = cells.map((v, i) => doc.splitTextToSize(txt(v), cW[i] - 3) as string[]);
    const h = Math.max(...wrapped.map((w) => w.length)) * 3.3 + 2.4;
    ensure(h, cHead);
    doc.setFontSize(7.3);
    doc.setTextColor(15, 23, 42);
    let x = M;
    wrapped.forEach((lines, i) => {
      doc.setFont("helvetica", i === 1 || i === 5 ? "bold" : "normal");
      lines.forEach((ln, j) => doc.text(ln, right[i] ? x + cW[i] - 1.5 : x + 1.5, y + 3.6 + j * 3.3, { align: right[i] ? "right" : "left" }));
      x += cW[i];
    });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.15);
    doc.rect(M, y, IW, h);
    y += h;
  });
  if (!report.credit.length) {
    ensure(7, cHead);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text("Aucune vente à crédit sur la période.", M + 2, y + 4.5);
    doc.setDrawColor(...LINE);
    doc.rect(M, y, IW, 7);
    y += 7;
  } else {
    Object.entries(totalsByCur).forEach(([cur, amt]) => {
      ensure(6, cHead);
      doc.setFillColor(241, 245, 249);
      doc.rect(M, y, IW, 6, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...INK);
      doc.text(`TOTAL CRÉDIT (${cur === "CDF" ? "FC" : cur})`, M + 1.5, y + 4.1);
      const ax = M + cW.slice(0, 6).reduce((a, b) => a + b, 0);
      doc.text(fmtAmount(amt, cur), ax - 1.5, y + 4.1, { align: "right" });
      y += 6;
    });
  }
  y += 6;

  // ---------- Préparé par ----------
  ensure(14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Prepared by : ${txt(opts.preparedBy)}`, M, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...SLATE);
  doc.text(`Généré le ${new Date(opts.generatedAt || report.computed_at).toLocaleString("fr-FR")} à partir des enregistrements de l'ERP`, M, y + 9);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(148, 163, 184);
    doc.text(`PREMIDIS SARL · ${reportTitle(report.category)} · ${txt(report.site_name)} · ${txt(opts.periodLabel)}`, M, H - 6);
    doc.text(`Page ${i} / ${pages}`, W - M, H - 6, { align: "right" });
  }
  doc.setProperties({ title: `${reportTitle(report.category)} — ${report.site_name}` });
  return doc.output("blob") as Blob;
}

export function stockStateFileName(report: any, periodKey: string) {
  const clean = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `Etat_Stock_${clean(report.category)}_${clean(report.site_name)}_${clean(periodKey)}.pdf`;
}
