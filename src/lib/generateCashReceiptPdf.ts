import { jsPDF } from "jspdf";

export interface CashReceiptBilletage {
  usd?: Record<string, number>;
  cdf?: Record<string, number>;
  total_usd?: number;
  total_cdf?: number;
  exchange_rate?: number;
}

export interface CashReceiptData {
  operationReference: string; // e.g. "ENC-2026-0042"
  operationType?: "in" | "out";
  category: string; // e.g. "VERSEMENT JOURNALIER MARKETEUR (COMPTE CLIENT)"
  amount: number;
  currency: "USD" | "CDF";
  amountUSD: number;
  amountCDF: number;
  exchangeRate: number;
  date: string | Date;
  agentName: string; // Cashier name
  department?: string; // Branch / Office / Department (e.g. "Maize Mill", "Boissons", "Produits Alimentaires")
  marketerName?: string;
  clientName?: string;
  clientCode?: string;
  orderCode?: string;
  reason?: string;
  billetage?: CashReceiptBilletage;
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
        } catch {
          // fallback
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

function formatDateSlash(d: string | Date): string {
  try {
    const dateObj = typeof d === "string" ? new Date(d) : d;
    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(d);
  }
}

/**
 * Generates the EXACT official PREMIDIS S.A.R.L • CASH INFLOW DETAILS • slip
 * identical to the company's authentic physical cash receipt:
 * - PREMIDIS S.A.R.L Header & Logo
 * - CASH INFLOW DETAILS
 * - Branch / Department (e.g. Maize Mill, Boissons, etc.)
 * - Date (DD/MM/YYYY)
 * - Two parallel Billetage tables:
 *    1) CDF Deposit details (20,000; 10,000; 5,000; 1,000; 500; 200; 100; 50) -> No's | Amount
 *    2) USD Deposit details ($100.00; $50.00; $20.00; $10.00; $5.00; $1.00) -> No's | Amount
 * - Total CDF, Exchange rate (Taux), Converted USD, Total USD, Total (USD + CDF)
 * - Cashier name & Client name
 * - Official PREMIDIS SARL GOMA CAISSE REÇU CASH Stamp
 */
export async function generateCashReceiptPdf(
  data: CashReceiptData
): Promise<{ doc: jsPDF; dataUrl: string; fileName: string }> {
  const logoDataUrl = await getLogoPngDataUrl();

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm

  // Colors
  const navy = [15, 61, 104] as const; // #0F3D68
  const headerBlue = [27, 54, 93] as const;
  const stampBlue = [29, 78, 216] as const;

  let curY = 16;

  // 1. TOP HEADER: LOGO + "PREMIDIS S.A.R.L"
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin + 2, curY - 2, 22, 17.6);
    } catch {
      drawFallbackLogo();
    }
  } else {
    drawFallbackLogo();
  }

  function drawFallbackLogo() {
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.roundedRect(margin + 2, curY, 20, 16, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("PREMIDIS", margin + 12, curY + 7, { align: "center" });
    doc.setFontSize(5.5);
    doc.setTextColor(56, 189, 248);
    doc.text("S.A.R.L", margin + 12, curY + 12, { align: "center" });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("PREMIDIS S.A.R.L", margin + 28, curY + 10);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("Production & Distribution Agroalimentaire & Industrielle • Goma, Nord-Kivu, RDC", margin + 28, curY + 15);

  curY += 22;

  // 2. MAIN TITLE BAR: "CASH INFLOW DETAILS" + BRANCH / DEPARTMENT + DATE
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.line(margin, curY, margin + contentWidth, curY);

  curY += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("CASH INFLOW DETAILS", margin + contentWidth / 2, curY, { align: "center" });

  curY += 4;
  doc.setLineWidth(0.4);
  doc.line(margin, curY, margin + contentWidth, curY);

  curY += 5;
  // Sub-header line: Branch / Office / Department & Date
  const deptName = data.department || "Maize Mill";
  const dateStr = formatDateSlash(data.date);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Branch / Department :", margin + 2, curY);
  doc.setFont("helvetica", "bold");
  doc.text(deptName, margin + 38, curY);

  doc.setFont("helvetica", "normal");
  doc.text("Date :", margin + contentWidth - 42, curY);
  doc.setFont("helvetica", "bold");
  doc.text(dateStr, margin + contentWidth - 28, curY);

  curY += 4;
  doc.setLineWidth(0.5);
  doc.line(margin, curY, margin + contentWidth, curY);

  curY += 3;

  // 3. PARALLEL BILLETAGE TABLES (CDF DEPOSIT DETAILS & USD DEPOSIT DETAILS)
  const colCdfW = 91;
  const colUsdW = 91;
  const headerH = 10;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);

  // Big Section Headers
  // Left top header
  doc.rect(margin, curY, colCdfW, headerH);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text("CDF Deposit details", margin + colCdfW / 2, curY + 4, { align: "center" });

  // Right top header
  doc.rect(margin + colCdfW, curY, colUsdW, headerH);
  doc.text("USD Deposit details", margin + colCdfW + colUsdW / 2, curY + 4, { align: "center" });

  // Sub-columns headers (CDF: Currency | No's | Amount)
  const cdfSubCols = [30, 25, 36];
  const usdSubCols = [30, 25, 36];

  doc.setFontSize(7.5);
  doc.text("Currency", margin + cdfSubCols[0] / 2, curY + 8.8, { align: "center" });
  doc.text("No's", margin + cdfSubCols[0] + cdfSubCols[1] / 2, curY + 8.8, { align: "center" });
  doc.text("Amount", margin + colCdfW - cdfSubCols[2] / 2, curY + 8.8, { align: "center" });

  doc.text("Currency", margin + colCdfW + usdSubCols[0] / 2, curY + 8.8, { align: "center" });
  doc.text("No's", margin + colCdfW + usdSubCols[0] + usdSubCols[1] / 2, curY + 8.8, { align: "center" });
  doc.text("Amount", margin + contentWidth - usdSubCols[2] / 2, curY + 8.8, { align: "center" });

  // Inner lines for sub headers
  doc.line(margin + cdfSubCols[0], curY + 5, margin + cdfSubCols[0], curY + headerH);
  doc.line(margin + cdfSubCols[0] + cdfSubCols[1], curY + 5, margin + cdfSubCols[0] + cdfSubCols[1], curY + headerH);
  doc.line(margin + colCdfW + usdSubCols[0], curY + 5, margin + colCdfW + usdSubCols[0], curY + headerH);
  doc.line(margin + colCdfW + usdSubCols[0] + usdSubCols[1], curY + 5, margin + colCdfW + usdSubCols[0] + usdSubCols[1], curY + headerH);

  curY += headerH;

  // Denominations lists from the document:
  const cdfRows = ["20,000", "10,000", "5,000", "1,000", "500", "200", "100", "50"];
  const cdfKeys = ["20000", "10000", "5000", "1000", "500", "200", "100", "50"];

  const usdRows = ["$ 100.00", "$ 50.00", "$ 20.00", "$ 10.00", "$ 5.00", "$ 1.00"];
  const usdKeys = ["100", "50", "20", "10", "5", "1"];

  const billetUSD = data.billetage?.usd || {};
  const billetCDF = data.billetage?.cdf || {};

  let sumCDF = 0;
  let sumUSD = 0;

  const totalRowsCount = 8;
  const rowHeight = 7.5;

  for (let i = 0; i < totalRowsCount; i++) {
    const rowY = curY + i * rowHeight;
    // Full row outer border & separators
    doc.rect(margin, rowY, colCdfW, rowHeight);
    doc.line(margin + cdfSubCols[0], rowY, margin + cdfSubCols[0], rowY + rowHeight);
    doc.line(margin + cdfSubCols[0] + cdfSubCols[1], rowY, margin + cdfSubCols[0] + cdfSubCols[1], rowY + rowHeight);

    doc.rect(margin + colCdfW, rowY, colUsdW, rowHeight);
    doc.line(margin + colCdfW + usdSubCols[0], rowY, margin + colCdfW + usdSubCols[0], rowY + rowHeight);
    doc.line(margin + colCdfW + usdSubCols[0] + usdSubCols[1], rowY, margin + colCdfW + usdSubCols[0] + usdSubCols[1], rowY + rowHeight);

    // Left (CDF)
    const cdfLabel = cdfRows[i] || "";
    const cdfKey = cdfKeys[i] || "";
    const cdfNum = Number(billetCDF[cdfKey]) || 0;
    const cdfVal = cdfNum * (Number(cdfKey) || 0);
    sumCDF += cdfVal;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(cdfLabel, margin + 4, rowY + 5.2);
    if (cdfNum > 0) {
      doc.setFont("helvetica", "bold");
      doc.text(String(cdfNum), margin + cdfSubCols[0] + cdfSubCols[1] / 2, rowY + 5.2, { align: "center" });
      doc.text(`${cdfVal.toLocaleString()} FC`, margin + colCdfW - 3, rowY + 5.2, { align: "right" });
    }

    // Right (USD)
    const usdLabel = usdRows[i] || "";
    const usdKey = usdKeys[i] || "";
    if (usdLabel) {
      const usdNum = Number(billetUSD[usdKey]) || 0;
      const usdVal = usdNum * (Number(usdKey) || 0);
      sumUSD += usdVal;

      doc.setFont("helvetica", "normal");
      doc.text(usdLabel, margin + colCdfW + 4, rowY + 5.2);
      if (usdNum > 0) {
        doc.setFont("helvetica", "bold");
        doc.text(String(usdNum), margin + colCdfW + usdSubCols[0] + usdSubCols[1] / 2, rowY + 5.2, { align: "center" });
        doc.text(`$ ${usdVal.toLocaleString()}`, margin + contentWidth - 3, rowY + 5.2, { align: "right" });
      }
    }
  }

  curY += totalRowsCount * rowHeight;

  // If billetage didn't specify USD or CDF breakdown but total amount exists:
  if (sumUSD === 0 && sumCDF === 0 && data.amount > 0) {
    if (data.currency === "CDF") {
      sumCDF = data.amount;
    } else {
      sumUSD = data.amount;
    }
  }

  // 4. BOTTOM TOTALS, STAMP, AND SIGNATURES
  const summaryBoxH = 46;
  doc.rect(margin, curY, contentWidth, summaryBoxH);

  // Divide into Left summary and Right totals / stamp
  const leftSummaryW = 100;
  const rightSummaryW = contentWidth - leftSummaryW;
  doc.line(margin + leftSummaryW, curY, margin + leftSummaryW, curY + summaryBoxH);

  // Left Column Details
  const rateVal = data.exchangeRate || 2500;
  const convertedUSDFromCDF = rateVal > 0 ? sumCDF / rateVal : 0;
  const grandTotalUSD = sumUSD + convertedUSDFromCDF;

  let sY = curY + 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("Total CDF = ", margin + 3, sY);
  doc.setFont("helvetica", "normal");
  doc.text(sumCDF > 0 ? `${sumCDF.toLocaleString()} FC` : ".......................................................", margin + 25, sY);

  sY += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Exchange rate (Taux) : ", margin + 3, sY);
  doc.setFont("helvetica", "normal");
  doc.text(`1 $ = ${rateVal.toLocaleString()} FC`, margin + 38, sY);

  sY += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Converted USD = ", margin + 3, sY);
  doc.setFont("helvetica", "normal");
  doc.text(convertedUSDFromCDF > 0 ? `$ ${convertedUSDFromCDF.toFixed(2)}` : ".......................................................", margin + 32, sY);

  sY += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Cashier name : ", margin + 3, sY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text(data.agentName || "Caissier Principal", margin + 28, sY);

  sY += 8;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Client name : ", margin + 3, sY);
  doc.setFont("helvetica", "bold");
  const clientDisplayName = data.clientName
    ? `${data.clientName} ${data.clientCode ? `(${data.clientCode})` : ""}`
    : data.marketerName || "Client Caisse";
  doc.text(clientDisplayName.slice(0, 36), margin + 25, sY);

  // Right Column Details
  const rX = margin + leftSummaryW + 4;
  let rY = curY + 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Total USD = ", rX, rY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text(`$ ${sumUSD.toFixed(2)}`, rX + 24, rY);

  rY += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("Total (USD + CDF) = ", rX, rY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text(`$ ${grandTotalUSD.toFixed(2)}`, rX + 38, rY);

  // OFFICIAL RECTANGULAR CAISSE STAMP (As seen in the document)
  rY += 6;
  const stampW = 54;
  const stampH = 20;
  const stampX = margin + leftSummaryW + (rightSummaryW - stampW) / 2;

  doc.setDrawColor(stampBlue[0], stampBlue[1], stampBlue[2]);
  doc.setLineWidth(0.6);
  doc.rect(stampX, rY, stampW, stampH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(stampBlue[0], stampBlue[1], stampBlue[2]);
  doc.text("PREMIDIS SARL", stampX + stampW / 2, rY + 4.5, { align: "center" });
  doc.setFontSize(6.5);
  doc.text("• GOMA •", stampX + stampW / 2, rY + 8.5, { align: "center" });
  doc.setFontSize(8);
  doc.text("CAISSE", stampX + stampW / 2, rY + 13, { align: "center" });
  doc.setFontSize(6);
  doc.text("REÇU CASH", stampX + stampW / 2, rY + 17, { align: "center" });

  curY += summaryBoxH + 4;

  // 5. COMPLEMENTARY METADATA & AUDIT BANNER
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, curY, contentWidth, 12, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text(`RÉFÉRENCE TRÉSORERIE : ${data.operationReference}`, margin + 3, curY + 4.8);
  if (data.orderCode) {
    doc.text(`COMMANDE ASSOCIÉE : ${data.orderCode}`, margin + 65, curY + 4.8);
  }
  if (data.marketerName) {
    doc.text(`MARKETEUR PERCEPTEUR : ${data.marketerName}`, margin + 120, curY + 4.8);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Nature : ${data.category} • Justificatif officiel généré et scellé automatiquement dans le système ERP PREMIDIS`,
    margin + 3,
    curY + 9.2
  );

  const dataUrl = doc.output("datauristring");
  const fileName = `Bordereau_Entree_${data.operationReference.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  return { doc, dataUrl, fileName };
}

export interface CashClosingReceiptData {
  sessionReference: string; // e.g. "CLOT-2026-0012"
  sessionId: string;
  openedAt: string | Date;
  closedAt: string | Date;
  agentName: string; // Cashier / Responsable
  department: string; // e.g. "Maize Mill", "Boissons"
  exchangeRate: number;
  initialBalanceUSD: number;
  initialBalanceCDF: number;
  totalInUSD: number;
  totalInCDF: number;
  totalOutUSD: number;
  totalOutCDF: number;
  theoreticalBalanceUSD: number;
  theoreticalBalanceCDF: number;
  actualBalanceUSD: number;
  actualBalanceCDF: number;
  differenceUSD: number;
  differenceCDF: number;
  discrepancyReason?: string;
  billetage: CashReceiptBilletage;
}

/**
 * Generates the official PREMIDIS S.A.R.L - RAPPORT & BORDEREAU DE CLÔTURE DE CAISSE
 * with closing billeting, theoretical balance comparison, discrepancy audit and signatures.
 */
export async function generateCashClosingReceiptPdf(
  data: CashClosingReceiptData
): Promise<{ doc: jsPDF; dataUrl: string; fileName: string }> {
  const logoDataUrl = await getLogoPngDataUrl();

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm

  const navy = [15, 61, 104] as const; // #0F3D68
  const headerBlue = [27, 54, 93] as const;
  const stampBlue = [29, 78, 216] as const;

  let curY = 16;

  // 1. TOP HEADER: LOGO + "PREMIDIS S.A.R.L"
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", margin + 2, curY - 2, 22, 17.6);
    } catch {
      drawFallbackLogo();
    }
  } else {
    drawFallbackLogo();
  }

  function drawFallbackLogo() {
    doc.setFillColor(navy[0], navy[1], navy[2]);
    doc.roundedRect(margin + 2, curY, 20, 16, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("PREMIDIS", margin + 12, curY + 7, { align: "center" });
    doc.setFontSize(5.5);
    doc.setTextColor(56, 189, 248);
    doc.text("S.A.R.L", margin + 12, curY + 12, { align: "center" });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("PREMIDIS S.A.R.L", margin + 28, curY + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("Direction Financière & Comptabilité • Service Caisse Centrale", margin + 28, curY + 14);

  curY += 20;

  // 2. MAIN TITLE BAR
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.line(margin, curY, margin + contentWidth, curY);

  curY += 5.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text("RAPPORT & BORDEREAU DE CLÔTURE DE CAISSE", margin + contentWidth / 2, curY, {
    align: "center",
  });

  curY += 3.5;
  doc.setLineWidth(0.4);
  doc.line(margin, curY, margin + contentWidth, curY);

  // 3. META INFO STRIP
  curY += 3;
  const colW = contentWidth / 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(70, 70, 70);

  doc.text(`Réf : ${data.sessionReference}`, margin, curY + 3);
  doc.text(`Département : ${data.department || "Maize Mill"}`, margin + colW, curY + 3);
  doc.text(`Taux : 1$ = ${data.exchangeRate} FC`, margin + colW * 2, curY + 3);
  doc.text(`Date : ${formatDateSlash(data.closedAt)}`, margin + colW * 3, curY + 3);

  curY += 6;
  doc.text(`Caissier(ère) : ${data.agentName}`, margin, curY + 3);
  doc.text(`Ouverte le : ${formatDateSlash(data.openedAt)}`, margin + colW, curY + 3);
  doc.text(`Clôturée le : ${formatDateSlash(data.closedAt)}`, margin + colW * 2, curY + 3);
  doc.text(`Statut : CLÔTURÉE CERTIFIÉE`, margin + colW * 3, curY + 3);

  curY += 7;
  doc.setLineWidth(0.3);
  doc.line(margin, curY, margin + contentWidth, curY);

  // 4. FINANCIAL RECONCILIATION SUMMARY BOX
  curY += 4;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, curY, contentWidth, 34, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text("RÉCAPITULATIF FINANCIER & VÉRIFICATION DES SOLDES", margin + 3, curY + 4.5);

  const reconY = curY + 7;
  const thColW = contentWidth / 6;

  // Header row
  doc.setFillColor(234, 240, 246);
  doc.rect(margin + 2, reconY, contentWidth - 4, 4.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(30, 41, 59);
  doc.text("Rubrique", margin + 4, reconY + 3.2);
  doc.text("Solde Initial", margin + thColW * 1.5, reconY + 3.2, { align: "right" });
  doc.text("+ Entrées", margin + thColW * 2.5, reconY + 3.2, { align: "right" });
  doc.text("- Sorties", margin + thColW * 3.5, reconY + 3.2, { align: "right" });
  doc.text("= Attendu", margin + thColW * 4.5, reconY + 3.2, { align: "right" });
  doc.text("Physique (Recompté)", margin + thColW * 5.8, reconY + 3.2, { align: "right" });

  // USD Row
  const rUsdY = reconY + 6.5;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Dollars (USD)", margin + 4, rUsdY + 3);
  doc.setFont("helvetica", "normal");
  doc.text(`$${data.initialBalanceUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, margin + thColW * 1.5, rUsdY + 3, { align: "right" });
  doc.text(`+$${data.totalInUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, margin + thColW * 2.5, rUsdY + 3, { align: "right" });
  doc.text(`-$${data.totalOutUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, margin + thColW * 3.5, rUsdY + 3, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text(`$${data.theoreticalBalanceUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, margin + thColW * 4.5, rUsdY + 3, { align: "right" });
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text(`$${data.actualBalanceUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, margin + thColW * 5.8, rUsdY + 3, { align: "right" });

  // CDF Row
  const rCdfY = rUsdY + 5.5;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Francs Congolais (CDF)", margin + 4, rCdfY + 3);
  doc.setFont("helvetica", "normal");
  doc.text(`${Math.round(data.initialBalanceCDF).toLocaleString()} FC`, margin + thColW * 1.5, rCdfY + 3, { align: "right" });
  doc.text(`+${Math.round(data.totalInCDF).toLocaleString()} FC`, margin + thColW * 2.5, rCdfY + 3, { align: "right" });
  doc.text(`-${Math.round(data.totalOutCDF).toLocaleString()} FC`, margin + thColW * 3.5, rCdfY + 3, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text(`${Math.round(data.theoreticalBalanceCDF).toLocaleString()} FC`, margin + thColW * 4.5, rCdfY + 3, { align: "right" });
  doc.setTextColor(navy[0], navy[1], navy[2]);
  doc.text(`${Math.round(data.actualBalanceCDF).toLocaleString()} FC`, margin + thColW * 5.8, rCdfY + 3, { align: "right" });

  // Écart Row
  const diffY = rCdfY + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  const diffUsdSign = data.differenceUSD > 0 ? "+" : "";
  const diffCdfSign = data.differenceCDF > 0 ? "+" : "";
  const hasDiff = Math.abs(data.differenceUSD) > 0.01 || Math.abs(data.differenceCDF) > 50;

  if (!hasDiff) {
    doc.setTextColor(22, 101, 52); // green-800
    doc.text("ÉCART : AUCUN ÉCART CONSTATÉ (Caisse parfaitement équilibrée)", margin + 4, diffY + 3);
  } else {
    doc.setTextColor(185, 28, 28); // red-700
    doc.text(
      `ÉCART CONSTATÉ : USD : ${diffUsdSign}$${data.differenceUSD.toFixed(2)} | CDF : ${diffCdfSign}${Math.round(data.differenceCDF).toLocaleString()} FC`,
      margin + 4,
      diffY + 3
    );
    if (data.discrepancyReason) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(`Motif de l'écart : ${data.discrepancyReason}`, margin + 4, diffY + 7);
    }
  }

  curY += 37;

  // 5. BILLETAGE PHYSIQUE DE CLÔTURE (TABLEAUX CDF ET USD EN PARALLÈLE)
  const halfW = (contentWidth - 6) / 2; // 88mm each
  const cdfX = margin;
  const usdX = margin + halfW + 6;

  // CDF TABLE HEADER
  doc.setFillColor(headerBlue[0], headerBlue[1], headerBlue[2]);
  doc.rect(cdfX, curY, halfW, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text("BILLETAGE CLÔTURE - CDF", cdfX + 2, curY + 3.8);

  // USD TABLE HEADER
  doc.rect(usdX, curY, halfW, 5.5, "F");
  doc.text("BILLETAGE CLÔTURE - USD", usdX + 2, curY + 3.8);

  curY += 5.5;

  // Column Subheaders
  const rowH = 4.2;
  const colValW = 28;

  drawSubheader(cdfX);
  drawSubheader(usdX);

  function drawSubheader(startX: number) {
    doc.setFillColor(241, 245, 249);
    doc.rect(startX, curY, halfW, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(51, 65, 85);
    doc.text("Coupures", startX + 2, curY + 2.8);
    doc.text("Nbre Billets", startX + colValW + 2, curY + 2.8);
    doc.text("Montant", startX + halfW - 2, curY + 2.8, { align: "right" });
  }

  curY += 4;
  const startRowsY = curY;

  // CDF Rows
  const cdfDenoms = [20000, 10000, 5000, 1000, 500, 200, 100, 50];
  const cdfBillet = data.billetage?.cdf || {};
  let cdfRunningY = startRowsY;

  for (let i = 0; i < cdfDenoms.length; i++) {
    const denom = cdfDenoms[i];
    const count = cdfBillet[String(denom)] || 0;
    const amount = count * denom;

    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(cdfX, cdfRunningY, halfW, rowH, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`${denom.toLocaleString()} FC`, cdfX + 2, cdfRunningY + 2.9);
    doc.text(count > 0 ? String(count) : "-", cdfX + colValW + 8, cdfRunningY + 2.9);
    doc.text(amount > 0 ? `${amount.toLocaleString()} FC` : "-", cdfX + halfW - 2, cdfRunningY + 2.9, { align: "right" });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.15);
    doc.line(cdfX, cdfRunningY + rowH, cdfX + halfW, cdfRunningY + rowH);
    cdfRunningY += rowH;
  }

  // USD Rows
  const usdDenoms = [100, 50, 20, 10, 5, 1];
  const usdBillet = data.billetage?.usd || {};
  let usdRunningY = startRowsY;

  for (let i = 0; i < usdDenoms.length; i++) {
    const denom = usdDenoms[i];
    const count = usdBillet[String(denom)] || 0;
    const amount = count * denom;

    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(usdX, usdRunningY, halfW, rowH, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`$${denom}.00`, usdX + 2, usdRunningY + 2.9);
    doc.text(count > 0 ? String(count) : "-", usdX + colValW + 8, usdRunningY + 2.9);
    doc.text(amount > 0 ? `$${amount.toLocaleString()}` : "-", usdX + halfW - 2, usdRunningY + 2.9, { align: "right" });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.15);
    doc.line(usdX, usdRunningY + rowH, usdX + halfW, usdRunningY + rowH);
    usdRunningY += rowH;
  }

  // Align rows bottom
  const maxTableY = Math.max(cdfRunningY, usdRunningY + (cdfDenoms.length - usdDenoms.length) * rowH);
  curY = maxTableY + 4;

  // 6. TOTALS & AUDIT SUMMARY BOX
  const summaryBoxH = 26;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.rect(margin, curY, contentWidth, summaryBoxH);

  const leftBoxW = contentWidth - 45;
  const leftX = margin + 3;
  let rY = curY + 4.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`TOTAL RECOMPTÉ CDF :`, leftX, rY);
  doc.text(`${Math.round(data.actualBalanceCDF).toLocaleString()} FC`, leftX + 50, rY);

  rY += 4.5;
  doc.text(`TOTAL RECOMPTÉ USD :`, leftX, rY);
  doc.text(`$${data.actualBalanceUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, leftX + 50, rY);

  rY += 4.5;
  const cdfInUSD = data.exchangeRate > 0 ? Math.round((data.actualBalanceCDF / data.exchangeRate) * 100) / 100 : 0;
  doc.text(`ÉQUIVALENT CDF EN USD (au taux de ${data.exchangeRate}) :`, leftX, rY);
  doc.text(`$${cdfInUSD.toFixed(2)}`, leftX + 70, rY);

  rY += 5;
  doc.setFontSize(8.5);
  doc.setTextColor(navy[0], navy[1], navy[2]);
  const totalCombinedUSD = Math.round((data.actualBalanceUSD + cdfInUSD) * 100) / 100;
  doc.text(`TOTAL VALEUR EN CAISSE (USD + CDF CONVERTI) :`, leftX, rY);
  doc.text(`$${totalCombinedUSD.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, leftX + 85, rY);

  // Official Stamp Box on the right
  const stampX = margin + leftBoxW + 2;
  const stampW = 38;
  const stampH = summaryBoxH - 4;

  doc.setDrawColor(stampBlue[0], stampBlue[1], stampBlue[2]);
  doc.setLineWidth(0.6);
  doc.rect(stampX, curY + 2, stampW, stampH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(stampBlue[0], stampBlue[1], stampBlue[2]);
  doc.text("PREMIDIS SARL", stampX + stampW / 2, curY + 6.5, { align: "center" });
  doc.setFontSize(6);
  doc.text("• GOMA •", stampX + stampW / 2, curY + 10, { align: "center" });
  doc.setFontSize(7.5);
  doc.text("CAISSE CENTRALE", stampX + stampW / 2, curY + 14.5, { align: "center" });
  doc.setFontSize(5.5);
  doc.text("CLÔTURE & CERTIFIÉ", stampX + stampW / 2, curY + 18.5, { align: "center" });

  curY += summaryBoxH + 6;

  // 7. SIGNATURES STRIP
  const sigW = contentWidth / 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.text("L'Agent Caissier", margin + 10, curY);
  doc.text("Le Contrôleur de Gestion", margin + sigW + 10, curY);
  doc.text("La Direction Financière", margin + sigW * 2 + 10, curY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(data.agentName, margin + 10, curY + 4);
  doc.text("Visa & Conformité", margin + sigW + 10, curY + 4);
  doc.text("Approbation Trésorerie", margin + sigW * 2 + 10, curY + 4);

  curY += 16;
  doc.setDrawColor(148, 163, 184);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin + 5, curY, margin + sigW - 10, curY);
  doc.line(margin + sigW + 5, curY, margin + sigW * 2 - 10, curY);
  doc.line(margin + sigW * 2 + 5, curY, margin + contentWidth - 5, curY);
  doc.setLineDashPattern([], 0);

  const dataUrl = doc.output("datauristring");
  const fileName = `Bordereau_Cloture_${data.sessionReference.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
  return { doc, dataUrl, fileName };
}
