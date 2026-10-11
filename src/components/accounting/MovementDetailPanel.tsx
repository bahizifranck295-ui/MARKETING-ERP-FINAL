import React, { useState } from "react";
import {
  Package,
  Wallet,
  Store,
  CheckCircle2,
  X,
  FileText,
  Printer,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { openDocumentInNativeViewer } from "@/lib/documentViewer";
import {
  generateCashReceiptPdf,
  CashReceiptData,
} from "@/lib/generateCashReceiptPdf";

export default function MovementDetailPanel({
  movement,
  onClose,
  onToggleRecord,
  canToggleRecord = true,
  isToggling = false,
}: {
  movement: any;
  onClose?: () => void;
  onToggleRecord: (id: string) => void;
  canToggleRecord?: boolean;
  isToggling?: boolean;
}) {
  const [showDocModal, setShowDocModal] = useState(false);

  const isCashMovement =
    movement?.module === "cash" ||
    movement?.source?.toLowerCase().includes("caisse") ||
    movement?.reference?.startsWith("ENC-") ||
    movement?.reference?.startsWith("VERS-") ||
    movement?.reference?.startsWith("APP-") ||
    movement?.reference?.startsWith("DEC-");

  const handleViewBordereau = async () => {
    if (!movement) return;

    // 1. Direct document_url
    if (movement.document_url) {
      await openDocumentInNativeViewer(
        movement.document_url,
        movement.document_name || `Bordereau_${movement.reference}.pdf`,
        movement.operation_id || movement.reference,
        "cash_operation"
      );
      return;
    }

    // 2. Fetch from API
    try {
      const opRef = movement.operation_id || movement.reference;
      const { data } = await api.get(`/cash/operations/${opRef}/document`);
      if (data?.document_url) {
        await openDocumentInNativeViewer(
          data.document_url,
          data.document_name || `Bordereau_${movement.reference}.pdf`,
          opRef,
          "cash_operation"
        );
        return;
      }
    } catch {
      // Fallback to generation
    }

    // 3. Fallback: generate with authentic PREMIDIS cash receipt template
    try {
      const amountVal = Math.abs(Number(movement.amount)) || 0;
      const isOut =
        movement.source?.toLowerCase().includes("sortie") ||
        movement.reference?.startsWith("DEC-");

      const receiptData: CashReceiptData = {
        operationReference: movement.source_doc || movement.reference,
        operationType: isOut ? "out" : "in",
        category: movement.title || "Mouvement de Caisse",
        amount: amountVal,
        currency: "USD",
        amountUSD: amountVal,
        amountCDF: Math.round(amountVal * 2500),
        exchangeRate: 2500,
        date: movement.date || new Date(),
        agentName: movement.user_name || "Caissier",
        department: "Maize Mill",
        reason: movement.title || movement.source,
        billetage: movement.billetage || {
          usd: { "100": Math.floor(amountVal / 100) },
          total_usd: amountVal,
          total_cdf: 0,
          exchange_rate: 2500,
        },
      };
      const { dataUrl, fileName } = await generateCashReceiptPdf(receiptData);
      await openDocumentInNativeViewer(dataUrl, fileName);
    } catch (err) {
      toast.error("Impossible de visualiser le bordereau");
    }
  };

  if (!movement) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 min-h-[300px]">
        <Package className="h-12 w-12 stroke-[1.5] text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-600">Sélectionnez un mouvement</p>
        <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
          Cliquez sur un mouvement dans la table pour afficher ses détails comptables complets.
        </p>
      </div>
    );
  }

  const isRecorded = movement.is_recorded;

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col h-full overflow-hidden">
        {/* PANEL HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                movement.module === "cash"
                  ? "bg-emerald-100 text-emerald-700"
                  : movement.module === "orders"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-blue-100 text-[#1E70BF]"
              }`}
            >
              {movement.module === "cash" ? (
                <Wallet className="h-5 w-5" />
              ) : movement.module === "orders" ? (
                <Store className="h-5 w-5" />
              ) : (
                <Package className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                {movement.title || movement.type_label}
              </h3>
              <p className="text-xs font-mono text-slate-500 mt-0.5 font-medium">
                {movement.reference}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                isRecorded
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-rose-50 text-rose-600 border border-rose-200"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isRecorded ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
              {isRecorded ? "Enregistré" : "Non enregistré"}
            </span>
            {onClose && (
              <button
                onClick={onClose}
                className="h-7 w-7 rounded-lg hover:bg-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
                title="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* PANEL BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-slate-700 text-xs sm:text-sm">
          {/* METADATA GRID */}
          <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50/70 rounded-xl border border-slate-100">
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Date / Heure</span>
              <span className="text-xs font-semibold text-slate-800 mt-0.5 block">
                {movement.date}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Dépôt</span>
              <span className="text-xs font-semibold text-slate-800 mt-0.5 block truncate">
                {movement.warehouse || "Dépôt central"}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Source</span>
              <span className="text-xs font-semibold text-slate-800 mt-0.5 block whitespace-pre-line">
                {movement.source}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 font-medium block">Opérateur</span>
              <span className="text-xs font-semibold text-slate-800 mt-0.5 block truncate">
                {movement.user_name || "Agent"}
              </span>
            </div>
          </div>

          {/* ARTICLES CONCERNÉS SECTION */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center justify-between">
              <span>Articles concernés</span>
            </h4>
            <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] text-slate-500 font-medium">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Article</th>
                    <th className="py-2 px-2 text-center font-semibold">Qté</th>
                    <th className="py-2 px-3 text-right font-semibold">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movement.items && movement.items.length > 0 ? (
                    movement.items.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-medium text-slate-800">{item.name}</td>
                        <td className="py-2.5 px-2 text-center text-slate-600 font-semibold">
                          {item.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {Number(item.amount).toFixed(2)} $
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {movement.product_name}
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-600 font-semibold">
                        {movement.quantity || 1}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        {Math.abs(movement.amount).toFixed(2)} $
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* PANEL FOOTER ACTION BUTTONS */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 space-y-2.5">
          {isCashMovement ? (
            <Button
              type="button"
              onClick={handleViewBordereau}
              className={`w-full h-10 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 ${
                movement.source?.toLowerCase().includes("sortie") ||
                movement.source?.toLowerCase().includes("décaissement") ||
                movement.reference?.startsWith("DEC-") ||
                Number(movement.amount) < 0
                  ? "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"
                  : "border-[#0F3D68]/30 bg-[#0F3D68]/10 text-[#0F3D68] hover:bg-[#0F3D68]/20"
              }`}
              title={
                movement.source?.toLowerCase().includes("sortie") ||
                movement.source?.toLowerCase().includes("décaissement") ||
                movement.reference?.startsWith("DEC-") ||
                Number(movement.amount) < 0
                  ? "Visualiser le bordereau de sortie dans le navigateur"
                  : "Visualiser le bordereau officiel de caisse dans le visualiseur du navigateur"
              }
            >
              <FileText
                className={`h-4 w-4 ${
                  movement.source?.toLowerCase().includes("sortie") ||
                  movement.source?.toLowerCase().includes("décaissement") ||
                  movement.reference?.startsWith("DEC-") ||
                  Number(movement.amount) < 0
                    ? "text-rose-600"
                    : "text-[#0F3D68]"
                }`}
              />
              <span>
                {movement.source?.toLowerCase().includes("sortie") ||
                movement.source?.toLowerCase().includes("décaissement") ||
                movement.reference?.startsWith("DEC-") ||
                Number(movement.amount) < 0
                  ? "Visualiser le bordereau de sortie"
                  : "Visualiser le bordereau"}
              </span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDocModal(true)}
              className="w-full h-10 rounded-xl text-xs font-semibold border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-2"
            >
              <FileText className="h-4 w-4 text-slate-500" />
              <span>Voir le document source</span>
            </Button>
          )}

          {canToggleRecord && (
          <Button
            type="button"
            onClick={() => onToggleRecord(movement.id)}
            disabled={isToggling}
            className={`w-full h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs ${
              isRecorded
                ? "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
                : "bg-[#1E70BF] hover:bg-[#165a9b] text-white"
            }`}
          >
            {isRecorded ? (
              <>
                <RotateCcw className="h-4 w-4" />
                <span>Marquer comme non enregistré</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>Marquer comme enregistré</span>
              </>
            )}
          </Button>
          )}
        </div>
      </div>

      {/* DOCUMENT SOURCE MODAL */}
      <Dialog open={showDocModal} onOpenChange={setShowDocModal}>
        <DialogContent className="max-w-md p-6 bg-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#1E70BF]" />
              Document Source
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Pièce justificative {movement.reference}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 p-4 border border-slate-200 rounded-xl bg-slate-50/40 space-y-4 text-xs">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <p className="text-sm font-black text-[#211A5C]">PREMIDIS SARL</p>
                <p className="text-[11px] text-slate-500">Service Comptabilité & Finance</p>
              </div>
              <div className="text-right">
                <span className="font-mono font-bold text-slate-900 block">
                  {movement.source_doc || movement.reference}
                </span>
                <span className="text-[11px] text-slate-500 block">{movement.date}</span>
              </div>
            </div>

            <div className="flex justify-between font-bold text-sm text-slate-900 pt-2 border-t border-slate-200">
              <span>Montant :</span>
              <span>{Math.abs(movement.amount).toFixed(2)} $</span>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              onClick={() => window.print()}
              className="flex-1 text-xs gap-1.5"
            >
              <Printer className="h-4 w-4" />
              Imprimer
            </Button>
            <Button
              onClick={() => setShowDocModal(false)}
              className="flex-1 bg-[#1E70BF] hover:bg-[#165a9b] text-white text-xs"
            >
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
