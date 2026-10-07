import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Printer,
  Download,
  X,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  AlertTriangle,
  Maximize2,
  Minimize2,
} from "lucide-react";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fmtMoney, fmtDate } from "@/components/erp-ui";
import { api } from "@/lib/api";
import PremidisLogo from "./PremidisLogo";

export interface InvoiceItem {
  product_id?: string;
  product_code?: string;
  product_name: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  unit_price_fc?: number;
  discount?: number;
  line_total?: number;
  line_total_fc?: number;
}

export interface InvoiceData {
  id?: string;
  code: string;
  client_id?: string;
  client_name: string;
  client_phone?: string;
  delivery_address?: string;
  marketer_name?: string;
  created_at: string;
  payment_method?: string;
  payment_status?: string;
  cash_deposit_status?: string;
  status?: string;
  currency?: string;
  subtotal?: number;
  subtotal_fc?: number;
  discount?: number;
  total: number;
  total_fc?: number;
  notes?: string;
  items?: InvoiceItem[];
  credit_check?: {
    is_exceeded?: boolean;
    exceeded_amount?: number;
    credit_limit?: number;
    current_balance?: number;
    available_credit?: number;
    projected_balance?: number;
    credit_remaining_after?: number;
  };
  has_credit_alert?: boolean;
}

interface InvoiceModalProps {
  order: InvoiceData | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function InvoiceModal({ order: initialOrder, isOpen, onClose }: InvoiceModalProps) {
  const [fetchedDetails, setFetchedDetails] = useState<Partial<InvoiceData> | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [forceCompact, setForceCompact] = useState<boolean | null>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);

  // Dérivation directe de la commande active
  const order =
    fetchedDetails && initialOrder && fetchedDetails.id === initialOrder.id
      ? { ...initialOrder, ...fetchedDetails }
      : initialOrder;

  useEffect(() => {
    setForceCompact(null);
    if (!isOpen || !initialOrder?.id) {
      setFetchedDetails(null);
      return;
    }
    // Charger les détails de commande si items manquants
    if (!initialOrder.items || initialOrder.items.length === 0) {
      setLoading(true);
      api
        .get(`/orders/${initialOrder.id}`)
        .then((res) => {
          if (res.data) {
            setFetchedDetails(res.data);
          }
        })
        .catch(() => {
          // Conserver l'état initial
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, initialOrder?.id]);

  if (!isOpen || !order) return null;

  // Calculs financiers
  const totalUSD = Number(order.total) || 0;
  const totalFC =
    order.total_fc !== undefined && order.total_fc !== null
      ? Number(order.total_fc)
      : Math.round(totalUSD * 2500);
  const subtotalUSD = Number(order.subtotal) || totalUSD;
  const discountUSD = Number(order.discount) || 0;

  const paymentMethodLabel =
    order.payment_method === "cash"
      ? "Espèces / Cash"
      : order.payment_method === "credit"
      ? "Vente à Crédit"
      : order.payment_method === "bank"
      ? "Virement Bancaire"
      : order.payment_method || "Comptant";

  const isPaid = order.payment_status === "paid" || order.status === "delivered";

  // EXPORTATION PDF CONFORME À 100% SANS MODIFICATION
  const handleExportPdf = async () => {
    if (!invoiceRef.current) {
      toast.error("Document non disponible pour l'export.");
      return;
    }
    setExportingPdf(true);
    try {
      const element = invoiceRef.current;
      
      // Capture haute résolution
      const canvas = await html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = (canvas.height * contentWidth) / canvas.width;
      const yPos = contentHeight < (pageHeight - margin * 2) ? margin : margin;

      pdf.addImage(imgData, "PNG", margin, yPos, contentWidth, Math.min(contentHeight, pageHeight - margin * 2), undefined, "FAST");
      
      const fileName = `Facture_${order.code || "PREMIDIS"}.pdf`;
      pdf.save(fileName);
      toast.success(`Facture exportée avec succès : ${fileName}`);
    } catch (err) {
      console.error("Erreur génération PDF:", err);
      toast.error("Impossible de générer le PDF. Veuillez réessayer.");
    } finally {
      setExportingPdf(false);
    }
  };

  // IMPRESSION HAUTE DÉFINITION CONFORME SANS BLOCAGE IFRAME
  const handlePrint = async () => {
    if (!invoiceRef.current) {
      window.print();
      return;
    }
    setPrinting(true);
    try {
      const element = invoiceRef.current;
      const canvas = await html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");

      const printWin = window.open("", "_blank", "width=900,height=1000");
      if (printWin) {
        printWin.document.open();
        printWin.document.write(`
          <!DOCTYPE html>
          <html lang="fr">
            <head>
              <meta charset="utf-8">
              <title>Facture_${order.code || "PREMIDIS"}</title>
              <style>
                @page {
                  size: A4 portrait;
                  margin: 6mm;
                }
                body {
                  margin: 0;
                  padding: 0;
                  display: flex;
                  justify-content: center;
                  background-color: #ffffff;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                img {
                  width: 100%;
                  max-width: 198mm;
                  height: auto;
                  display: block;
                }
              </style>
            </head>
            <body>
              <img src="${imgData}" onload="setTimeout(() => { window.focus(); window.print(); window.close(); }, 300);" />
            </body>
          </html>
        `);
        printWin.document.close();
      } else {
        const iframe = document.createElement("iframe");
        iframe.style.position = "fixed";
        iframe.style.right = "0";
        iframe.style.bottom = "0";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.style.border = "0";
        document.body.appendChild(iframe);

        const frameDoc = iframe.contentWindow?.document;
        if (frameDoc) {
          frameDoc.open();
          frameDoc.write(`
            <!DOCTYPE html>
            <html>
              <head>
                <title>Facture_${order.code}</title>
                <style>
                  @page { size: A4 portrait; margin: 8mm; }
                  body { margin: 0; padding: 0; }
                  img { width: 100%; max-width: 195mm; height: auto; }
                </style>
              </head>
              <body>
                <img src="${imgData}" onload="setTimeout(() => { window.focus(); window.print(); }, 250);" />
              </body>
            </html>
          `);
          frameDoc.close();
          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
            } catch (e) {
              window.print();
            } finally {
              setTimeout(() => {
                if (document.body.contains(iframe)) document.body.removeChild(iframe);
              }, 6000);
            }
          }, 350);
        } else {
          window.print();
        }
      }
    } catch (err) {
      console.warn("Fallback impression directe:", err);
      window.print();
    } finally {
      setPrinting(false);
    }
  };

  const isCreditAlert = Boolean(
    order?.has_credit_alert ||
    (order?.credit_check?.is_exceeded && order?.payment_method === "credit")
  );

  const isCompact = forceCompact !== null ? forceCompact : isCreditAlert;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Conteneur global de la facture : 100% visible sans barre de défilement */}
      <div
        className={`relative w-full flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-300 overflow-hidden text-slate-900 transition-all duration-300 ${
          isCompact ? "max-w-2xl max-h-[96vh]" : "max-w-4xl max-h-[96vh]"
        }`}
      >
        {/* BARRE D'ACTIONS SUPÉRIEURE (Masquée à l'impression) */}
        <div className="print:hidden bg-[#1B1446] text-white px-3 sm:px-4 py-2 flex items-center justify-between border-b border-indigo-950 shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="font-bold text-xs uppercase tracking-wider text-slate-200 truncate">
              PREMIDIS • Facture N° {order.code}
            </span>
            {isCreditAlert && (
              <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/30 text-red-200 border border-red-400/40 shrink-0">
                <AlertTriangle className="h-2.5 w-2.5 text-red-300" />
                Dépassement Crédit (Mode Compact)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* BOUTON BASCULE VUE COMPACTE VERTICALE */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setForceCompact(!isCompact)}
              className="h-8 rounded-xl border-indigo-700 bg-indigo-900/60 text-white hover:bg-indigo-800 font-semibold text-xs px-2.5 gap-1.5 cursor-pointer"
              title={isCompact ? "Passer en vue normale" : "Optimiser en vue compacte verticale (sans scroll)"}
            >
              {isCompact ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isCompact ? "Vue Normale" : "Vue Compacte"}</span>
            </Button>

            {/* BOUTON 1 : IMPRIMER */}
            <Button
              size="sm"
              onClick={handlePrint}
              disabled={printing || exportingPdf}
              className="h-8 rounded-xl bg-white text-[#211A5C] hover:bg-slate-100 font-bold text-xs px-2.5 sm:px-3 shadow-xs gap-1.5 cursor-pointer disabled:opacity-50"
              title="Lancer l'impression conforme"
            >
              {printing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#211A5C]" />
              ) : (
                <Printer className="h-3.5 w-3.5 text-[#211A5C]" />
              )}
              <span className="hidden sm:inline">{printing ? "Impression..." : "Imprimer"}</span>
            </Button>

            {/* BOUTON 2 : EXPORTER PDF */}
            <Button
              size="sm"
              onClick={handleExportPdf}
              disabled={exportingPdf || printing}
              variant="outline"
              className="h-8 rounded-xl border-indigo-700 bg-indigo-900/60 text-white hover:bg-indigo-800 font-bold text-xs px-2.5 sm:px-3 gap-1.5 cursor-pointer disabled:opacity-50"
              title="Télécharger une copie PDF conforme de la facture"
            >
              {exportingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
              ) : (
                <Download className="h-3.5 w-3.5 text-white" />
              )}
              <span className="hidden sm:inline">{exportingPdf ? "PDF..." : "PDF"}</span>
            </Button>

            {/* BOUTON 3 : FERMER */}
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-slate-300 hover:text-white flex items-center justify-center transition-colors ml-1 cursor-pointer"
              title="Fermer la facture"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* DOCUMENT DE FACTURE PROPREMENT DIT (Format vertical condensé zéro scrollbar) */}
        <div
          ref={invoiceRef}
          className={`flex-1 flex flex-col justify-between overflow-hidden bg-white text-slate-900 select-text ${
            isCompact
              ? "p-3 sm:p-4 text-[10.5px] leading-tight space-y-2"
              : "p-5 sm:p-6 text-xs leading-normal space-y-3"
          }`}
        >
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-[#211A5C]" />
              <span className="text-xs">Chargement des données de la facture...</span>
            </div>
          ) : (
            <div className={`flex-1 flex flex-col justify-between ${isCompact ? "gap-2" : "gap-3"}`}>
              {/* EN-TÊTE DE LA FACTURE - PREMIDIS SARL */}
              <div
                className={`border-b-2 border-[#211A5C] flex flex-col sm:flex-row sm:items-start justify-between ${
                  isCompact ? "pb-2 gap-2" : "pb-3 gap-3"
                }`}
              >
                {/* IDENTITÉ SOCIÉTÉ & LOGO OFFICIEL PREMIDIS */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <img
                      src="/assets/premidis-logo.svg"
                      alt="Logo PREMIDIS SARL"
                      className={`w-auto object-contain rounded-sm ${
                        isCompact ? "h-8 max-w-[65px]" : "h-11 max-w-[80px]"
                      }`}
                    />
                    <div>
                      <h1
                        className={`font-black tracking-tight text-[#211A5C] leading-none ${
                          isCompact ? "text-sm sm:text-base" : "text-base sm:text-xl"
                        }`}
                      >
                        PREMIDIS SARL
                      </h1>
                      <span
                        className={`text-slate-500 font-bold uppercase tracking-wider block mt-0.5 ${
                          isCompact ? "text-[8.5px]" : "text-[10px]"
                        }`}
                      >
                        Production & Distribution Agroalimentaire & Industrielle
                      </span>
                    </div>
                  </div>

                  <div
                    className={`text-slate-500 leading-tight space-y-0.5 ${
                      isCompact ? "text-[8.5px] pt-0" : "text-[10px] pt-0.5"
                    }`}
                  >
                    <p>Siège Social : Route Aéroport, Bujovu, Goma, Nord-Kivu, RDC</p>
                    <p>
                      Tél : <span className="font-semibold text-slate-700">+243 971 002 001</span> • Email :{" "}
                      <span className="font-semibold text-slate-700">contact@premidis.cd</span>
                    </p>
                    <p className={`font-mono text-slate-400 ${isCompact ? "text-[8px]" : "text-[9px]"}`}>
                      RCCM : CD/GOM/RCCM/21-B-0042 • ID. NAT : 01-83-N48201W
                    </p>
                  </div>
                </div>

                {/* TITRE & NUMÉRO DE FACTURE */}
                <div className="sm:text-right bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded-xl border sm:border-0 border-slate-200">
                  <div
                    className={`inline-block bg-[#211A5C] text-white rounded-lg font-black tracking-wider uppercase ${
                      isCompact ? "text-[10px] px-2 py-0.5 mb-0.5" : "text-xs px-3 py-1 mb-1"
                    }`}
                  >
                    FACTURE DE VENTE
                  </div>
                  <div
                    className={`font-black font-mono text-slate-900 ${
                      isCompact ? "text-xs sm:text-sm" : "text-sm sm:text-base"
                    }`}
                  >
                    N° {order.code}
                  </div>
                  <div className={`text-slate-600 font-medium ${isCompact ? "text-[10px]" : "text-[11px]"}`}>
                    Date : <strong className="text-slate-900">{fmtDate(order.created_at)}</strong>
                  </div>
                  <div className="mt-1 flex sm:justify-end items-center gap-1.5 flex-wrap">
                    <span
                      className={`font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isCompact ? "text-[9px]" : "text-[10px]"
                      } ${
                        isPaid
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : order.payment_method === "credit"
                          ? "bg-blue-100 text-blue-800 border border-blue-300"
                          : "bg-amber-100 text-amber-800 border border-amber-300"
                      }`}
                    >
                      {isPaid ? "Payée / Validée" : order.payment_method === "credit" ? "À Terme (Crédit)" : "En Attente"}
                    </span>
                    {/* BADGE SPÉCIFIQUE EN CAS D'ALERTE DE DÉPASSEMENT DE CRÉDIT */}
                    {isCreditAlert && (
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider bg-red-100 text-red-800 border border-red-300 inline-flex items-center gap-1 shadow-2xs">
                        <AlertTriangle className="h-2.5 w-2.5 text-red-600" />
                        Dépassement Crédit (+{fmtMoney(order.credit_check?.exceeded_amount || 0, "USD")})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* BLOC INFOS DEUX COLONNES (CLIENT & DÉTAILS COMMERCIAUX) */}
              <div className={`grid grid-cols-1 sm:grid-cols-2 ${isCompact ? "gap-2 text-[10px]" : "gap-2.5 text-xs"}`}>
                {/* VOLET CLIENT */}
                <div className={`bg-slate-50/90 border border-slate-200 ${isCompact ? "rounded-lg p-2" : "rounded-xl p-2.5"}`}>
                  <div className="text-[9px] uppercase font-bold tracking-wider text-slate-400 mb-0.5 flex items-center justify-between">
                    <span>Facturé à :</span>
                    <span className="font-mono text-slate-500 font-semibold">
                      {order.client_id ? "Client Agréé" : "Vente Comptoir"}
                    </span>
                  </div>
                  <div className={`font-black text-slate-900 ${isCompact ? "text-xs" : "text-sm"}`}>
                    {order.client_name}
                  </div>
                  <div className={`text-slate-600 space-y-0.5 mt-0.5 ${isCompact ? "text-[10px]" : "text-[11px]"}`}>
                    {order.client_phone && (
                      <p>
                        Téléphone : <span className="font-semibold text-slate-800">{order.client_phone}</span>
                      </p>
                    )}
                    <p>
                      Adresse :{" "}
                      <span className="text-slate-800 font-medium">
                        {order.delivery_address || "Goma, Nord-Kivu, RDC"}
                      </span>
                    </p>
                  </div>
                </div>

                {/* VOLET TRANSACTION */}
                <div className={`bg-slate-50/90 border border-slate-200 ${isCompact ? "rounded-lg p-2" : "rounded-xl p-2.5"}`}>
                  <div className="text-[9px] uppercase font-bold tracking-wider text-slate-400 mb-0.5">
                    Modalités Commerciales :
                  </div>
                  <div className={`grid grid-cols-2 gap-1 ${isCompact ? "text-[10px]" : "text-[11px]"}`}>
                    <div>
                      <span className="text-slate-500 block text-[9px]">Commercial / Vendeur :</span>
                      <span className="font-bold text-slate-800 truncate block">
                        {order.marketer_name || "Direction Commerciale"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">Moyen de Paiement :</span>
                      <span className="font-bold text-[#211A5C] uppercase block">
                        {paymentMethodLabel}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">Dépôt d'Expédition :</span>
                      <span className="font-medium text-slate-800 block">Dépôt Central PREMIDIS</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">Devise Appliquée :</span>
                      <span className="font-bold text-slate-800 block">
                        {order.currency || "USD"} (Taux : 2 500 FC)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* TABLEAU DES ARTICLES (Compact, lisible, sans débordement, sans scroll) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className={`w-full text-left ${isCompact ? "text-[10px]" : "text-xs"}`}>
                  <thead className={`bg-[#211A5C]/5 border-b border-slate-200 text-[#211A5C] font-bold uppercase tracking-wider ${
                    isCompact ? "text-[9.5px]" : "text-[11px]"
                  }`}>
                    <tr>
                      <th className={`w-8 text-center ${isCompact ? "py-1 px-2" : "py-1.5 px-3"}`}>#</th>
                      <th className={isCompact ? "py-1 px-2" : "py-1.5 px-3"}>Désignation Produit</th>
                      <th className={`text-center w-14 ${isCompact ? "py-1 px-2" : "py-1.5 px-2.5"}`}>Unité</th>
                      <th className={`text-center w-14 ${isCompact ? "py-1 px-2" : "py-1.5 px-2.5"}`}>Qté</th>
                      <th className={`text-right ${isCompact ? "py-1 px-2" : "py-1.5 px-3"}`}>Prix Unitaire</th>
                      <th className={`text-right ${isCompact ? "py-1 px-2" : "py-1.5 px-3"}`}>Total</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y divide-slate-100 ${isCompact ? "text-[10px]" : "text-[11px]"}`}>
                    {order.items && order.items.length > 0 ? (
                      order.items.map((it, idx) => {
                        const unitPriceUSD = Number(it.unit_price) || 0;
                        const lineTotalUSD =
                          it.line_total !== undefined
                            ? Number(it.line_total)
                            : unitPriceUSD * (Number(it.quantity) || 1);
                        const lineTotalFC =
                          it.line_total_fc !== undefined
                            ? Number(it.line_total_fc)
                            : it.unit_price_fc
                            ? Number(it.unit_price_fc) * (Number(it.quantity) || 1)
                            : Math.round(lineTotalUSD * 2500);

                        return (
                          <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                            <td className={`text-center text-slate-400 font-mono ${
                              isCompact ? "py-1 px-2 text-[9px]" : "py-1.5 px-3 text-[10px]"
                            }`}>
                              {idx + 1}
                            </td>
                            <td className={`font-semibold text-slate-800 ${isCompact ? "py-1 px-2" : "py-1.5 px-3"}`}>
                              {it.product_name}
                              {it.product_code && (
                                <span className={`text-slate-400 font-mono ml-1.5 ${isCompact ? "text-[8px]" : "text-[9px]"}`}>
                                  ({it.product_code})
                                </span>
                              )}
                            </td>
                            <td className={`text-center text-slate-500 font-medium ${isCompact ? "py-1 px-2" : "py-1.5 px-2.5"}`}>
                              {it.unit || "Unité"}
                            </td>
                            <td className={`text-center font-bold text-slate-900 ${isCompact ? "py-1 px-2" : "py-1.5 px-2.5"}`}>
                              {it.quantity}
                            </td>
                            <td className={`text-right font-mono text-slate-700 ${isCompact ? "py-1 px-2" : "py-1.5 px-3"}`}>
                              {it.unit_price_fc
                                ? `${Number(it.unit_price_fc).toLocaleString("fr-FR")} FC`
                                : fmtMoney(unitPriceUSD, "USD")}
                            </td>
                            <td className={`text-right font-bold text-slate-900 font-mono ${isCompact ? "py-1 px-2" : "py-1.5 px-3"}`}>
                              {it.unit_price_fc
                                ? `${lineTotalFC.toLocaleString("fr-FR")} FC`
                                : fmtMoney(lineTotalUSD, "USD")}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-3 text-center text-slate-400 text-xs">
                          Aucun article détaillé renseigné pour cette commande.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* BAS DE FACTURE : MENTIONS LÉGALES + RÉCAPITULATIF FINANCIER */}
              <div className={`grid grid-cols-1 sm:grid-cols-12 ${isCompact ? "gap-2 pt-0.5" : "gap-3 pt-1"}`}>
                {/* MENTIONS LÉGALES (7 colonnes) */}
                <div className={`sm:col-span-7 flex flex-col justify-between text-slate-500 ${isCompact ? "text-[9px] space-y-1" : "text-[10px] space-y-2"}`}>
                  <div className={`bg-slate-50 rounded-xl border border-slate-200 h-full flex flex-col justify-center ${
                    isCompact ? "p-2 space-y-1" : "p-2.5 space-y-1.5"
                  }`}>
                    <p className="font-semibold text-slate-700">
                      Montant en lettres :{" "}
                      <span className="font-normal italic">
                        {fmtMoney(totalUSD, "USD")} ({totalFC.toLocaleString("fr-FR")} Francs Congolais)
                      </span>
                    </p>
                    {order.notes && (
                      <p>
                        <strong className="text-slate-700">Notes :</strong> {order.notes}
                      </p>
                    )}
                    <p className={isCompact ? "text-[9px] text-slate-500" : "text-[10px] text-slate-500"}>
                      Règlement : <strong className="text-slate-700">{paymentMethodLabel}</strong> • Devise : <strong className="text-slate-700">{order.currency || "USD"}</strong>
                    </p>
                    <p className={`text-slate-400 ${isCompact ? "text-[8px]" : "text-[9px]"}`}>
                      Les marchandises vendues ne sont ni reprises ni échangées après validation et livraison conforme.
                    </p>
                  </div>
                </div>

                {/* TOTALISATION FINANCIÈRE (5 colonnes) */}
                <div className={`sm:col-span-5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between ${
                  isCompact ? "p-2 space-y-1 text-[10.5px]" : "p-3 space-y-1.5 text-xs"
                }`}>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-slate-600">
                      <span>Total Brut :</span>
                      <span className="font-mono">{fmtMoney(subtotalUSD, "USD")}</span>
                    </div>
                    {discountUSD > 0 && (
                      <div className="flex justify-between text-emerald-700 font-semibold">
                        <span>Remise :</span>
                        <span className="font-mono">-{fmtMoney(discountUSD, "USD")}</span>
                      </div>
                    )}
                  </div>

                  {/* TOTAL NET À PAYER */}
                  <div className={`border-t-2 border-[#211A5C] ${isCompact ? "pt-1 mt-0.5" : "pt-2 mt-1"}`}>
                    <div className="flex justify-between items-baseline">
                      <span className="font-extrabold text-xs text-slate-900 uppercase">Total Net :</span>
                      <span className={`font-black text-[#211A5C] font-mono ${
                        isCompact ? "text-sm sm:text-base" : "text-base sm:text-lg"
                      }`}>
                        {fmtMoney(totalUSD, "USD")}
                      </span>
                    </div>
                    <div className={`flex justify-between items-baseline mt-0.5 text-slate-600 ${
                      isCompact ? "text-[10px]" : "text-[11px]"
                    }`}>
                      <span className="font-medium">Contre-valeur :</span>
                      <span className="font-black text-slate-900 font-mono">
                        {totalFC.toLocaleString("fr-FR")} FC
                      </span>
                    </div>
                  </div>

                  {/* STATUT RÈGLEMENT */}
                  <div className={`border-t border-slate-200 flex items-center justify-between ${
                    isCompact ? "pt-0.5 text-[9px]" : "pt-1 text-[10px]"
                  }`}>
                    <span className="text-slate-500">Statut Financier :</span>
                    <span
                      className={`font-bold flex items-center gap-1 ${
                        isPaid ? "text-emerald-700" : "text-amber-800"
                      }`}
                    >
                      {isPaid ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" /> Encaissé / Soldé
                        </>
                      ) : (
                        <>
                          <Clock className="h-3 w-3" /> En Attente de Règlement
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* PIED DE PAGE INSTITUTIONNEL */}
              <div className={`border-t border-slate-200 text-center text-slate-400 ${
                isCompact ? "pt-1 text-[8px]" : "pt-1.5 text-[9px]"
              }`}>
                Facture certifiée ERP Cloud • Plateforme de Gestion Commerciale PREMIDIS SARL • RDC
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
