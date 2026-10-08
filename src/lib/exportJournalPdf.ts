import { jsPDF } from "jspdf";

/*
 * Export PDF du journal comptable, au format des factures PREMIDIS :
 * même en-tête (logo, identité, RCCM), mêmes couleurs, pied de page certifié.
 */

const INK: [number, number, number] = [33, 26, 92]; // #211A5C, couleur des factures
const SLATE: [number, number, number] = [100, 116, 139];

const txt = (v: unknown) =>
  String(v ?? "")
    .replace(/[  ]/g, " ")
    .replace(/→/g, "->")
    .replace(/\n/g, " · ");

const money = (n: number) =>
  `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, " ")} $`;

// Logo SVG converti en image pour le PDF
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

export type JournalPdfOptions = {
  movements: any[];
  editedBy: string;
  filtersLabel: string;
};

export async function exportJournalPdf({ movements, editedBy, filtersLabel }: JournalPdfOptions) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const logo = await loadLogo();
  const now = new Date();
  const number = `JRN-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

  const cols = [
    { label: "Date", w: 20 },
    { label: "Référence", w: 30 },
    { label: "Libellé de l'écriture", w: 72 },
    { label: "Compte débit", w: 38 },
    { label: "Compte crédit", w: 38 },
    { label: "Montant (USD)", w: 26, right: true },
    { label: "Statut", w: 20 },
    { label: "Utilisateur", w: 0 },
  ];
  cols[cols.length - 1].w = W - 2 * M - cols.slice(0, -1).reduce((s, c) => s + c.w, 0);

  let y = 0;
  const header = (first: boolean) => {
    // Identité société (comme sur la facture)
    if (logo) doc.addImage(logo, "PNG", M, 9, 17, 13.6);
    const x0 = logo ? M + 20 : M;
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("PREMIDIS SARL", x0, 14);
    doc.setFontSize(6.8);
    doc.setTextColor(...SLATE);
    doc.text("PRODUCTION & DISTRIBUTION AGROALIMENTAIRE & INDUSTRIELLE", x0, 18);
    doc.setFont("helvetica", "normal");
    doc.text("Siège Social : Route Aéroport, Bujovu, Goma, Nord-Kivu, RDC", x0, 21.5);
    doc.text("Tél : +243 971 002 001 • Email : contact@premidis.cd", x0, 24.5);
    doc.text("RCCM : CD/GOM/RCCM/21-B-0042 • ID. NAT : 01-83-N48201W", x0, 27.5);

    // Titre et numéro (à droite)
    doc.setFillColor(...INK);
    doc.roundedRect(W - M - 62, 9, 62, 7, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("JOURNAL COMPTABLE", W - M - 31, 13.8, { align: "center" });
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.text(`N° ${number}`, W - M, 21, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Date d'édition : ${txt(now.toLocaleString("fr-FR"))}`, W - M, 25.5, { align: "right" });

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
      doc.text("Filtres :", M + 3, y + 8.8);
      doc.text("Écritures :", W / 2 + 40, y + 4.5);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(txt(editedBy), M + 20, y + 4.5);
      doc.text(String(movements.length), W / 2 + 57, y + 4.5);
      doc.setFont("helvetica", "normal");
      doc.text(txt(filtersLabel), M + 20, y + 8.8);
      y += 15;
    }

    // En-tête du tableau
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

  const row = (cells: string[], opts: { zebra?: boolean; amount?: number } = {}) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const wrapped = cells.map((v, i) => doc.splitTextToSize(txt(v), cols[i].w - 3) as string[]);
    const h = Math.max(...wrapped.map((w) => w.length)) * 3.3 + 2.8;
    if (y + h > H - 32) {
      doc.addPage();
      header(false);
    }
    if (opts.zebra) {
      doc.setFillColor(248, 250, 252);
      doc.rect(M, y, W - 2 * M, h, "F");
    }
    let x = M;
    wrapped.forEach((lines, i) => {
      const c = cols[i];
      if (i === 5 && opts.amount !== undefined) doc.setTextColor(...(opts.amount >= 0 ? ([4, 120, 87] as [number, number, number]) : ([190, 18, 60] as [number, number, number])));
      else doc.setTextColor(15, 23, 42);
      if (i === 1 || i === 5) doc.setFont("helvetica", "bold");
      else doc.setFont("helvetica", "normal");
      lines.forEach((ln, k) => doc.text(ln, c.right ? x + c.w - 1.5 : x + 1.5, y + 4 + k * 3.3, { align: c.right ? "right" : "left" }));
      x += c.w;
    });
    y += h;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.15);
    doc.line(M, y, W - M, y);
  };

  header(true);
  movements.forEach((m, i) =>
    row(
      [
        m.date || "",
        m.reference || "",
        `${m.title || ""}${m.source ? ` (${m.source})` : ""}`,
        m.debit_account || "411100 - Clients",
        m.credit_account || "701100 - Ventes",
        money(Number(m.amount) || 0),
        m.is_recorded ? "Enregistré" : "En attente",
        m.user_name || m.created_by || "Non renseigné",
      ],
      { zebra: i % 2 === 1, amount: Number(m.amount) || 0 }
    )
  );
  if (!movements.length) row(["", "", "Aucune écriture pour ces filtres", "", "", "", "", ""]);

  // Récapitulatif (comme le bloc « Total Net » de la facture)
  const inflow = movements.filter((m) => Number(m.amount) >= 0).reduce((s, m) => s + Number(m.amount), 0);
  const outflow = movements.filter((m) => Number(m.amount) < 0).reduce((s, m) => s + Number(m.amount), 0);
  if (y + 26 > H - 14) {
    doc.addPage();
    header(false);
  }
  y += 4;
  const bx = W - M - 80;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(bx, y, 80, 22, 1.5, 1.5, "FD");
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...SLATE);
  doc.text("Total des entrées :", bx + 3, y + 5);
  doc.text("Total des sorties :", bx + 3, y + 10);
  doc.setTextColor(15, 23, 42);
  doc.text(money(inflow), bx + 77, y + 5, { align: "right" });
  doc.text(money(outflow), bx + 77, y + 10, { align: "right" });
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(bx + 3, y + 13, bx + 77, y + 13);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("SOLDE NET :", bx + 3, y + 18.5);
  doc.setTextColor(...INK);
  doc.text(money(inflow + outflow), bx + 77, y + 18.5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...SLATE);
  doc.text("Document généré depuis le journal des écritures comptables.", M, y + 5);
  doc.text("Chaque ligne indique l'utilisateur ayant effectué l'opération.", M, y + 9);

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(M, H - 10, W - M, H - 10);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("Journal certifié ERP Cloud • Plateforme de Gestion Commerciale PREMIDIS SARL • RDC", W / 2, H - 6, { align: "center" });
    doc.text(`Page ${i} / ${pages}`, W - M, H - 6, { align: "right" });
  }

  const fileName = `Journal_Comptable_PREMIDIS_${now.toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
  return fileName;
}
