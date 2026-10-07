import { jsPDF } from "jspdf";
import { toast } from "sonner";

export interface ClientPdfItem {
  id?: string;
  order_num?: number;
  name: string;
  phone?: string;
  secondary_phone?: string;
  address?: string;
  city?: string;
  business_unit?: string;
  department?: string;
  marketer_name?: string;
  credit_limit?: number;
  solde_actuel?: number;
  balance?: number;
}

export const OFFICIAL_DEPARTMENTS = [
  "BOISSONS",
  "LAIT & PRODUITS LAITIERS",
  "PRODUITS ALIMENTAIRES",
  "HÔTELLERIE",
  "GRANDE DISTRIBUTION",
  "RESTAURATION",
  "AUTRES",
] as const;

export type OfficialDepartment = (typeof OFFICIAL_DEPARTMENTS)[number];

export function normalizeDepartment(dept?: string | null): OfficialDepartment {
  if (!dept) return "AUTRES";
  const s = dept.trim().toLowerCase();
  if (s.includes("boisson")) return "BOISSONS";
  if (s.includes("lait") || s.includes("laitier")) return "LAIT & PRODUITS LAITIERS";
  if (s.includes("alimentaire")) return "PRODUITS ALIMENTAIRES";
  if (s.includes("hôtellerie") || s.includes("hotellerie") || s.includes("hotel")) return "HÔTELLERIE";
  if (s.includes("grande distribution") || s.includes("supermarché") || s.includes("distribution")) return "GRANDE DISTRIBUTION";
  if (s.includes("restauration") || s.includes("restaurant")) return "RESTAURATION";
  return "AUTRES";
}

// Format credit limit: e.g. "5.000$" or "0$" (conforme au document annexe)
function formatCredit(val: number | undefined): string {
  const n = Math.round(Number(val) || 0);
  return `${n.toLocaleString("de-DE")}$`;
}

// Format current balance with color code:
// Negative = Red "- 3.447$" (client en crédit)
// Positive = Green "+ 4.750$" (client en avance)
// Zero = Slate "0$" (solde nul)
function formatSolde(val: number | undefined): { text: string; color: [number, number, number] } {
  const n = Math.round(Number(val) || 0);
  if (n < 0) {
    return {
      text: `- ${Math.abs(n).toLocaleString("de-DE")}$`,
      color: [220, 38, 38], // Rouge #DC2626
    };
  }
  if (n > 0) {
    return {
      text: `+ ${n.toLocaleString("de-DE")}$`,
      color: [22, 163, 74], // Vert #16A34A
    };
  }
  return {
    text: `0$`,
    color: [100, 116, 139], // Gris slate #64748B
  };
}

// Safe helper to obtain a clean rasterized PNG from SVG for jsPDF
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

export interface ExportPdfOptions {
  department?: string | "all";
}

export async function generateClientsSummaryPdf(
  clients: ClientPdfItem[],
  options?: ExportPdfOptions
): Promise<void> {
  if (!clients || clients.length === 0) {
    toast.error("Aucun client à exporter");
    return;
  }

  const selectedDepartment = options?.department && options.department !== "all"
    ? normalizeDepartment(options.department)
    : "all";

  // Filter clients if specific department requested
  const filteredClients = selectedDepartment === "all"
    ? clients
    : clients.filter((c) => normalizeDepartment(c.department || c.business_unit) === selectedDepartment);

  if (filteredClients.length === 0) {
    toast.error(`Aucun client trouvé pour le département ${selectedDepartment}`);
    return;
  }

  // Pre-fetch logo as data URL for jsPDF compatibility
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

  // Exact 8 columns specified in reference document (annexe):
  // 1. N°
  // 2. NOM DU CLIENT
  // 3. NUMÉRO DE TÉLÉPHONE
  // 4. ADRESSE
  // 5. DÉPARTEMENT
  // 6. MARKETEUR
  // 7. CRÉDIT AUTORISÉ
  // 8. SOLDE ACTUEL
  const columns = [
    { key: "num", label: "N°", width: 12, align: "center" as const },
    { key: "name", label: "NOM DU CLIENT", width: 48, align: "left" as const },
    { key: "phone", label: "NUMÉRO DE\nTÉLÉPHONE", width: 36, align: "left" as const },
    { key: "address", label: "ADRESSE", width: 40, align: "left" as const },
    { key: "bu", label: "DÉPARTEMENT", width: 44, align: "left" as const },
    { key: "marketer", label: "MARKETEUR", width: 29, align: "left" as const },
    { key: "credit", label: "CRÉDIT AUTORISÉ", width: 30, align: "right" as const },
    { key: "solde", label: "SOLDE ACTUEL", width: 30, align: "right" as const },
  ];

  // Group clients by the official 7 departments in strict order
  const grouped = new Map<OfficialDepartment, ClientPdfItem[]>();
  for (const dept of OFFICIAL_DEPARTMENTS) {
    grouped.set(dept, []);
  }
  for (const c of filteredClients) {
    const d = normalizeDepartment(c.department || c.business_unit);
    grouped.get(d)!.push(c);
  }

  function drawPageHeader(isFirstPage = false) {
    if (!isFirstPage) {
      // Continuation header on page 2+
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(33, 26, 92);
      doc.text("PREMIDIS SARL • LISTE DES CLIENTS PAR DÉPARTEMENT (SUITE)", margin, 12);
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

    // 2. Company Info (Left side, next to logo)
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
    const mainTitle = selectedDepartment === "all"
      ? "LISTE DES CLIENTS PAR DÉPARTEMENT"
      : `LISTE DES CLIENTS - DÉPARTEMENT : ${selectedDepartment}`;
    doc.text(mainTitle, pageWidth - margin, 15, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    const todayFormatted = new Date().toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    doc.text(`Date : ${todayFormatted}`, pageWidth - margin, 21, { align: "right" });

    const subdetail = selectedDepartment === "all"
      ? "Termes de crédit : À terme (crédit) • Classement : par département"
      : `Département : ${selectedDepartment} • Termes de crédit : À terme (crédit)`;
    doc.text(subdetail, pageWidth - margin, 26, { align: "right" });

    // 4. Dark Horizontal Bar across page
    doc.setFillColor(33, 26, 92); // #211A5C
    doc.rect(margin, 34, contentWidth, 2.2, "F");
  }

  function drawTableHeader(y: number) {
    const rowHeight = 7.5;
    doc.setFillColor(235, 243, 250); // Bleu très pâle #EBF3FA
    doc.setDrawColor(203, 213, 225); // Slate-300
    doc.setLineWidth(0.25);
    doc.rect(margin, y, contentWidth, rowHeight, "FD");

    let currentX = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(30, 58, 138); // Dark blue #1E3A8A

    for (const col of columns) {
      if (col.align === "center") {
        doc.text(col.label, currentX + col.width / 2, y + 4.8, { align: "center" });
      } else if (col.align === "right") {
        doc.text(col.label, currentX + col.width - 2, y + 4.8, { align: "right" });
      } else {
        if (col.label.includes("\n")) {
          const parts = col.label.split("\n");
          doc.text(parts[0], currentX + 2, y + 3.2, { align: "left" });
          doc.text(parts[1], currentX + 2, y + 6.2, { align: "left" });
        } else {
          doc.text(col.label, currentX + 2, y + 4.8, { align: "left" });
        }
      }
      currentX += col.width;
      if (currentX < margin + contentWidth - 0.1) {
        doc.line(currentX, y, currentX, y + rowHeight);
      }
    }
    return y + rowHeight;
  }

  function drawTableRow(y: number, client: ClientPdfItem, rowIndex: number, currentDept: string) {
    const rowHeight = 7.2;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.setLineWidth(0.2);
    doc.rect(margin, y, contentWidth, rowHeight, "FD");

    let currentX = margin;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);

    // Col 1: N°
    const numStr = String(client.order_num ?? rowIndex);
    doc.text(numStr, currentX + columns[0].width / 2, y + 5, { align: "center" });
    currentX += columns[0].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // Col 2: Nom du client
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    const clientName = client.name || "-";
    const nameFit = doc.splitTextToSize(clientName, columns[1].width - 4);
    doc.text(nameFit[0] || "-", currentX + 2.5, y + 5);
    currentX += columns[1].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // Col 3: Numéro de téléphone
    doc.setTextColor(51, 65, 85);
    const phoneVal = client.phone || client.secondary_phone || "-";
    doc.text(phoneVal, currentX + 2.5, y + 5);
    currentX += columns[2].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // Col 4: Adresse
    const addr = client.address || client.city || "Goma, RDC";
    const addrFit = doc.splitTextToSize(addr, columns[3].width - 4);
    doc.text(addrFit[0] || "-", currentX + 2.5, y + 5);
    currentX += columns[3].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // Col 5: Département
    doc.text(currentDept, currentX + 2.5, y + 5);
    currentX += columns[4].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // Col 6: Marketeur
    doc.text(client.marketer_name || "Patrick K.", currentX + 2.5, y + 5);
    currentX += columns[5].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // Col 7: Crédit autorisé
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(formatCredit(client.credit_limit), currentX + columns[6].width - 2.5, y + 5, {
      align: "right",
    });
    currentX += columns[6].width;
    doc.line(currentX, y, currentX, y + rowHeight);

    // Col 8: Solde actuel
    const soldeVal = client.solde_actuel !== undefined ? client.solde_actuel : client.balance;
    const soldeInfo = formatSolde(soldeVal);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(soldeInfo.color[0], soldeInfo.color[1], soldeInfo.color[2]);
    doc.text(soldeInfo.text, currentX + columns[7].width - 2.5, y + 5, {
      align: "right",
    });

    return y + rowHeight;
  }

  // Draw Page 1 header
  drawPageHeader(true);
  let currentY = 41;
  let globalRowCounter = 1;

  // Active departments to render
  const deptsToRender = selectedDepartment === "all"
    ? OFFICIAL_DEPARTMENTS.filter((d) => (grouped.get(d) || []).length > 0)
    : [selectedDepartment];

  for (let gIdx = 0; gIdx < deptsToRender.length; gIdx++) {
    const dept = deptsToRender[gIdx];
    const deptClients = grouped.get(dept) || [];
    if (deptClients.length === 0) continue;

    // Check if section fits on page (title + table header + at least 1 row)
    const neededHeight = 6 + 7.5 + 7.2;
    if (currentY + neededHeight > footerY - 10) {
      if (selectedDepartment === "all") {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text("Suite des départements sur la page suivante ›", pageWidth - margin, footerY - 4, { align: "right" });
      }
      doc.addPage();
      currentY = 18;
      drawPageHeader(false);
    }

    // Section title exact format: "DÉPARTEMENT : BOISSONS"
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(33, 26, 92); // #211A5C
    doc.text(`DÉPARTEMENT : ${dept}`, margin, currentY);
    currentY += 4.5;

    // Table Header
    currentY = drawTableHeader(currentY);

    // Table Rows for this Department
    for (let rIdx = 0; rIdx < deptClients.length; rIdx++) {
      const cl = deptClients[rIdx];

      // Check if row fits
      if (currentY + 7.2 > footerY - 10) {
        if (selectedDepartment === "all") {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(7);
          doc.setTextColor(100, 116, 139);
          doc.text("Suite des départements sur la page suivante ›", pageWidth - margin, footerY - 4, { align: "right" });
        }
        doc.addPage();
        currentY = 18;
        drawPageHeader(false);
        currentY = drawTableHeader(currentY);
      }

      currentY = drawTableRow(currentY, cl, globalRowCounter++, dept);
    }

    currentY += 4.5; // Spacing before next department
  }

  // SUMMARY TABLE:
  // "RÉCAPITULATIF DU NOMBRE DE CLIENTS PAR DÉPARTEMENT"
  const summaryRows = OFFICIAL_DEPARTMENTS.map((d) => ({
    name: d,
    count: (grouped.get(d) || []).length,
  })).filter((r) => selectedDepartment === "all" || r.name === selectedDepartment);

  const totalClientsCount = summaryRows.reduce((acc, r) => acc + r.count, 0);

  const summaryTableHeight = 5 + 6.5 + (summaryRows.length + 1) * 5.8 + 10;
  if (currentY + summaryTableHeight > footerY - 6) {
    doc.addPage();
    currentY = 18;
    drawPageHeader(false);
  }

  // Summary Table Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(33, 26, 92);
  const summaryTitle = selectedDepartment === "all"
    ? "RÉCAPITULATIF DU NOMBRE DE CLIENTS PAR DÉPARTEMENT"
    : `RÉCAPITULATIF DU NOMBRE DE CLIENTS - ${selectedDepartment}`;
  doc.text(summaryTitle, margin, currentY);
  currentY += 4.5;

  const sumTableWidth = 190;
  const colDeptWidth = 145;
  const colCountWidth = 45;

  // Table header
  doc.setFillColor(235, 243, 250);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.rect(margin, currentY, sumTableWidth, 6, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(30, 58, 138);
  doc.text("DÉPARTEMENT", margin + colDeptWidth / 2, currentY + 4.2, { align: "center" });
  doc.text("NOMBRE DE CLIENTS", margin + colDeptWidth + colCountWidth / 2, currentY + 4.2, { align: "center" });
  doc.line(margin + colDeptWidth, currentY, margin + colDeptWidth, currentY + 6);
  currentY += 6;

  // Summary rows
  for (const row of summaryRows) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.rect(margin, currentY, sumTableWidth, 5.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(33, 26, 92);
    doc.text(row.name, margin + colDeptWidth / 2, currentY + 3.8, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    doc.text(String(row.count), margin + colDeptWidth + colCountWidth / 2, currentY + 3.8, { align: "center" });

    doc.line(margin + colDeptWidth, currentY, margin + colDeptWidth, currentY + 5.5);
    currentY += 5.5;
  }

  // TOTAL GÉNÉRAL row
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.rect(margin, currentY, sumTableWidth, 6, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(33, 26, 92);
  doc.text("TOTAL GÉNÉRAL", margin + colDeptWidth / 2, currentY + 4.2, { align: "center" });
  doc.text(String(totalClientsCount), margin + colDeptWidth + colCountWidth / 2, currentY + 4.2, { align: "center" });
  doc.line(margin + colDeptWidth, currentY, margin + colDeptWidth, currentY + 6);

  currentY += 9;

  // LEGEND BOX: Lecture du solde
  if (currentY + 8 > footerY - 5) {
    doc.addPage();
    currentY = 18;
    drawPageHeader(false);
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.rect(margin, currentY, contentWidth, 7, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text("Lecture du solde :", margin + 4, currentY + 4.8);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(220, 38, 38); // Red
  doc.text(" -  Rouge = client en crédit", margin + 42, currentY + 4.8);
  doc.setTextColor(22, 163, 74); // Green
  doc.text("+  Vert = client en avance", margin + 102, currentY + 4.8);
  doc.setTextColor(100, 116, 139); // Slate
  doc.text("0  Gris = solde nul", margin + 162, currentY + 4.8);

  // Apply footers to ALL pages with accurate total page count
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY - 2, pageWidth - margin, footerY - 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // #94A3B8
    doc.text("PREMIDIS SARL • Document de référence • Données réelles CRM", margin, footerY + 2);
    doc.text(`Page ${p} / ${totalPages}`, pageWidth - margin, footerY + 2, { align: "right" });
  }

  // Save the generated PDF
  const deptSuffix = selectedDepartment === "all"
    ? "par_departement"
    : `departement_${selectedDepartment.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  const filename = `PREMIDIS_Liste_clients_${deptSuffix}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  toast.success(`Exportation réussie : ${filename}`);
}
