import { jsPDF } from "jspdf";
import { toast } from "sonner";

export interface AccountTransactionItem {
  id: string;
  type: "order" | "payment" | string;
  title: string;
  code: string;
  date: string;
  amount: number;
  delta_sign?: string;
  nouveau_solde?: number;
  payment_method?: string;
  items?: Array<{ product_name?: string; quantity?: number; unit_price?: number }>;
  notes?: string;
}

export interface ClientAccountExportOptions {
  client: {
    id: string;
    code: string;
    name: string;
    phone?: string;
    secondary_phone?: string;
    address?: string;
    city?: string;
    credit_limit?: number;
    business_unit?: string;
    product_name?: string;
    marketer_name?: string;
    type?: string;
  };
  transactions: AccountTransactionItem[];
  soldeActuel: number;
  totalCommandes: number;
  totalPaiements: number;
  dateStart?: string;
  dateEnd?: string;
  txTypeFilter?: string;
}

// Convert SVG logo to PNG Data URL for reliable jsPDF rendering
async function getLogoPngDataUrl(): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 240;
          canvas.height = 192;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, 240, 192);
            ctx.drawImage(img, 0, 0, 240, 192);
            resolve(canvas.toDataURL("image/png"));
            return;
          }
        } catch (e) {
          console.warn("Canvas conversion error:", e);
        }
        resolve(null);
      };
      img.onerror = () => resolve(null);
      img.src = "/assets/premidis-logo.svg";
    } catch {
      resolve(null);
    }
  });
}

function formatSoldeText(val: number | undefined): { text: string; color: [number, number, number] } {
  const n = Math.round(Number(val) || 0);
  if (n < 0) {
    return {
      text: `- ${Math.abs(n).toLocaleString("de-DE")}$`,
      color: [220, 38, 38], // Rouge
    };
  }
  if (n > 0) {
    return {
      text: `+ ${n.toLocaleString("de-DE")}$`,
      color: [22, 163, 74], // Vert
    };
  }
  return {
    text: `0$`,
    color: [100, 116, 139], // Gris
  };
}

export async function generateClientAccountPdf(
  options: ClientAccountExportOptions
): Promise<void> {
  const {
    client,
    transactions,
    soldeActuel,
    totalCommandes,
    totalPaiements,
    dateStart,
    dateEnd,
    txTypeFilter,
  } = options;

  if (!client) {
    toast.error("Données du client manquantes pour l'export PDF");
    return;
  }

  const logoDataUrl = await getLogoPngDataUrl();

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 269mm
  const footerY = 200;

  // 8 Exact Columns for transaction report:
  const columns = [
    { key: "num", label: "N°", width: 12, align: "center" as const },
    { key: "date", label: "DATE & HEURE", width: 34, align: "left" as const },
    { key: "type", label: "TYPE", width: 32, align: "left" as const },
    { key: "code", label: "RÉFÉRENCE", width: 28, align: "left" as const },
    { key: "title", label: "LIBELLÉ / DÉSIGNATION", width: 68, align: "left" as const },
    { key: "method", label: "MODE / CANAL", width: 27, align: "left" as const },
    { key: "amount", label: "MOUVEMENT", width: 34, align: "right" as const },
    { key: "solde", label: "SOLDE RÉSULTANT", width: 34, align: "right" as const },
  ];

  function drawPageHeader(isFirstPage = false) {
    if (!isFirstPage) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(33, 26, 92);
      doc.text(
        `PREMIDIS SARL • RELEVÉ DE COMPTE CLIENT : ${client.name.toUpperCase()} (${client.code}) - SUITE`,
        margin,
        12
      );
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, 14, pageWidth - margin, 14);
      return;
    }

    // 1. Logo area
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "PNG", margin, 10, 24, 19.2);
      } catch {
        drawFallbackLogo();
      }
    } else {
      drawFallbackLogo();
    }

    function drawFallbackLogo() {
      doc.setFillColor(33, 26, 92);
      doc.roundedRect(margin, 10, 24, 18, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text("PREMIDIS", margin + 12, 18, { align: "center" });
      doc.setFontSize(6);
      doc.setTextColor(56, 189, 248);
      doc.text("S.A.R.L", margin + 12, 23, { align: "center" });
    }

    // 2. Company Info (Left side, next to logo) - Format officiel identique
    const companyX = margin + 28;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(33, 26, 92); // #211A5C
    doc.text("PREMIDIS SARL", companyX, 15);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(2, 132, 199); // #0284C7
    doc.text("PRODUCTION & DISTRIBUTION AGROALIMENTAIRE & INDUSTRIELLE", companyX, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139); // #64748B
    doc.text("Siège Social : Route Aéroport, Bujovu, Goma, Nord-Kivu, RDC", companyX, 25);
    doc.text("Tél. : +243 972 001 002 • Email : contact@premidis.cd", companyX, 29);

    // 3. Document Title & Details (Right aligned)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(33, 26, 92);
    doc.text("RELEVÉ DE COMPTE CLIENT", pageWidth - margin, 15, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    const todayFormatted = new Date().toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    doc.text(`Date : ${todayFormatted}`, pageWidth - margin, 21, { align: "right" });

    // Active filters summary
    let filterDescription = "Toutes les transactions";
    if (txTypeFilter === "order") filterDescription = "Commandes uniquement (-)";
    if (txTypeFilter === "payment") filterDescription = "Paiements / Dépôts uniquement (+)";

    let periodDescription = "";
    if (dateStart && dateEnd) {
      periodDescription = ` • Du ${new Date(dateStart).toLocaleDateString("fr-FR")} au ${new Date(dateEnd).toLocaleDateString("fr-FR")}`;
    } else if (dateStart) {
      periodDescription = ` • Depuis le ${new Date(dateStart).toLocaleDateString("fr-FR")}`;
    } else if (dateEnd) {
      periodDescription = ` • Jusqu'au ${new Date(dateEnd).toLocaleDateString("fr-FR")}`;
    }
    doc.text(
      `Filtre : ${filterDescription}${periodDescription}`,
      pageWidth - margin,
      26,
      { align: "right" }
    );

    // 4. Dark Horizontal Bar across page
    doc.setFillColor(33, 26, 92); // #211A5C
    doc.rect(margin, 34, contentWidth, 2.2, "F");
  }

  function drawClientSummaryBox(y: number): number {
    const boxHeight = 22;
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.setDrawColor(203, 213, 225); // Slate-300
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, "FD");

    // Client main info
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${client.name} (${client.code})`, margin + 4, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const cat = client.type || "Grossiste";
    const bu = client.business_unit || client.product_name || "Boissons";
    const phone = client.phone || client.secondary_phone || "-";
    const marketer = client.marketer_name || "Patrick K.";
    doc.text(
      `Catégorie : ${cat} • Département : ${bu} • Tél : ${phone}   • Marketeur : ${marketer}`,
      margin + 4,
      y + 11.5
    );

    const addr = client.address || client.city || "Goma, RDC";
    doc.text(`Adresse : ${addr}`, margin + 4, y + 17);

    // Financial indicators (Right columns)
    const colRight1 = margin + contentWidth - 110;
    const colRight2 = margin + contentWidth - 55;

    // Plafond & Commandes
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("PLAFOND DE CRÉDIT", colRight1, y + 5.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${Math.round(client.credit_limit || 0).toLocaleString("de-DE")}$`, colRight1, y + 10.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("TOTAL COMMANDES", colRight1, y + 15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(147, 51, 234); // Purple
    doc.text(`-${Math.round(totalCommandes).toLocaleString("de-DE")}$`, colRight1, y + 19.5);

    // Paiements & Solde Actuel
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("TOTAL ENCAISSÉ", colRight2, y + 5.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(22, 163, 74); // Green
    doc.text(`+${Math.round(totalPaiements).toLocaleString("de-DE")}$`, colRight2, y + 10.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("SOLDE ACTUEL EN COURS", colRight2, y + 15);

    const soldeInfo = formatSoldeText(soldeActuel);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(soldeInfo.color[0], soldeInfo.color[1], soldeInfo.color[2]);
    const soldeStatusLabel = soldeActuel > 0 ? " (Avance)" : soldeActuel < 0 ? " (Dette)" : " (Soldé)";
    doc.text(`${soldeInfo.text}${soldeStatusLabel}`, colRight2, y + 20);

    return y + boxHeight + 4;
  }

  function drawTableHeader(y: number): number {
    const rowHeight = 7.5;
    doc.setFillColor(235, 243, 250); // Pale blue #EBF3FA
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.rect(margin, y, contentWidth, rowHeight, "FD");

    let currentX = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(30, 58, 138); // Dark blue

    for (const col of columns) {
      if (col.align === "center") {
        doc.text(col.label, currentX + col.width / 2, y + 4.8, { align: "center" });
      } else if (col.align === "right") {
        doc.text(col.label, currentX + col.width - 2, y + 4.8, { align: "right" });
      } else {
        doc.text(col.label, currentX + 2, y + 4.8, { align: "left" });
      }
      currentX += col.width;
      if (currentX < margin + contentWidth - 0.1) {
        doc.line(currentX, y, currentX, y + rowHeight);
      }
    }
    return y + rowHeight;
  }

  function drawTableRow(
    y: number,
    tx: AccountTransactionItem,
    index: number
  ): number {
    const rowHeight = 7.2;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, contentWidth, rowHeight, "FD");

    let currentX = margin;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);

    // 1. N°
    doc.text(String(index), currentX + columns[0].width / 2, y + 4.9, { align: "center" });
    currentX += columns[0].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // 2. Date & Heure
    const txDate = new Date(tx.date);
    const dateFormatted =
      txDate.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }) +
      " " +
      txDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    doc.text(dateFormatted, currentX + 2, y + 4.9);
    currentX += columns[1].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // 3. Type
    const isOrder = tx.type === "order";
    doc.setFont("helvetica", "bold");
    if (isOrder) {
      doc.setTextColor(147, 51, 234);
      doc.text("COMMANDE (-)", currentX + 2, y + 4.9);
    } else {
      doc.setTextColor(22, 163, 74);
      doc.text("PAIEMENT (+)", currentX + 2, y + 4.9);
    }
    currentX += columns[2].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // 4. Code / Référence
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(tx.code || "-", currentX + 2, y + 4.9);
    currentX += columns[3].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // 5. Libellé / Désignation
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    const titleText = tx.title || (isOrder ? "Commande de marchandises" : "Paiement / Dépôt");
    const titleFit = doc.splitTextToSize(titleText, columns[4].width - 4);
    doc.text(titleFit[0] || "-", currentX + 2, y + 4.9);
    currentX += columns[4].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // 6. Mode / Canal
    doc.setTextColor(71, 85, 105);
    const methodStr = (tx.payment_method || "CASH").toUpperCase();
    doc.text(methodStr, currentX + 2, y + 4.9);
    currentX += columns[5].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // 7. Mouvement ($)
    doc.setFont("helvetica", "bold");
    const mvtSign = isOrder ? "-" : "+";
    const mvtVal = `${mvtSign} ${Math.round(tx.amount || 0).toLocaleString("de-DE")}$`;
    if (isOrder) {
      doc.setTextColor(220, 38, 38); // Rouge
    } else {
      doc.setTextColor(22, 163, 74); // Vert
    }
    doc.text(mvtVal, currentX + columns[6].width - 2.5, y + 4.9, { align: "right" });
    currentX += columns[6].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // 8. Solde Résultant ($)
    const soldeInfo = formatSoldeText(tx.nouveau_solde);
    doc.setTextColor(soldeInfo.color[0], soldeInfo.color[1], soldeInfo.color[2]);
    doc.text(soldeInfo.text, currentX + columns[7].width - 2.5, y + 4.9, { align: "right" });

    return y + rowHeight;
  }

  // Draw Page 1 header & summary box
  drawPageHeader(true);
  let currentY = drawClientSummaryBox(38);

  // Table header
  currentY = drawTableHeader(currentY);

  let rowCounter = 1;
  for (const tx of transactions) {
    if (currentY + 7.2 > footerY - 10) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text("Suite des transactions sur la page suivante ›", pageWidth - margin, footerY - 4, { align: "right" });
      doc.addPage();
      currentY = 18;
      drawPageHeader(false);
      currentY = drawTableHeader(currentY);
    }
    currentY = drawTableRow(currentY, tx, rowCounter++);
  }

  // TOTALS & AUDIT SUMMARY BAR
  if (currentY + 20 > footerY - 5) {
    doc.addPage();
    currentY = 18;
    drawPageHeader(false);
  }

  currentY += 4;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.rect(margin, currentY, contentWidth, 7.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(33, 26, 92);
  doc.text(
    `TOTAL OPÉRATIONS AFFICHÉES : ${transactions.length} transaction(s)`,
    margin + 4,
    currentY + 5
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text("Légende :", margin + 105, currentY + 5);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(220, 38, 38);
  doc.text("- Rouge = Débit / Dette", margin + 120, currentY + 5);
  doc.setTextColor(22, 163, 74);
  doc.text("+ Vert = Crédit / Avance", margin + 175, currentY + 5);
  doc.setTextColor(100, 116, 139);
  doc.text("0 Gris = Solde nul", margin + 230, currentY + 5);

  // Apply footers to ALL pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY - 2, pageWidth - margin, footerY - 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      "PREMIDIS SARL • Document de référence • Données réelles CRM (Miroir d'audit)",
      margin,
      footerY + 2
    );
    doc.text(`Page ${p} / ${totalPages}`, pageWidth - margin, footerY + 2, { align: "right" });
  }

  // Save the generated PDF
  const filename = `PREMIDIS_Releve_Compte_${client.code || "CLIENT"}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  toast.success(`Exportation PDF réussie : ${filename}`);
}
