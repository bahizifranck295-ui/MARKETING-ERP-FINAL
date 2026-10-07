import React, { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Calculator,
  Search,
  RefreshCw,
  FileSpreadsheet,
  Loader2,
  FileText,
  Printer,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, StatCard, fmtMoney } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MovementDetailPanel from "@/components/accounting/MovementDetailPanel";
import { printDocument } from "@/lib/print";
import { openDocumentInNativeViewer } from "@/lib/documentViewer";
import {
  generateCashReceiptPdf,
  CashReceiptData,
} from "@/lib/generateCashReceiptPdf";

export default function AccountingPage() {
  const { has } = useAuth();
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedMovement, setSelectedMovement] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleViewBordereau = async (m: any) => {
    if (!m) return;
    if (m.document_url) {
      await openDocumentInNativeViewer(
        m.document_url,
        m.document_name || `Bordereau_${m.reference}.pdf`,
        m.operation_id || m.reference,
        "cash_operation"
      );
      return;
    }
    try {
      const opRef = m.operation_id || m.reference;
      const { data } = await api.get(`/cash/operations/${opRef}/document`);
      if (data?.document_url) {
        await openDocumentInNativeViewer(
          data.document_url,
          data.document_name || `Bordereau_${m.reference}.pdf`,
          opRef,
          "cash_operation"
        );
        return;
      }
    } catch {}
    try {
      const amountVal = Math.abs(Number(m.amount)) || 0;
      const isOut =
        m.source?.toLowerCase().includes("sortie") ||
        m.reference?.startsWith("DEC-");
      const receiptData: CashReceiptData = {
        operationReference: m.source_doc || m.reference,
        operationType: isOut ? "out" : "in",
        category: m.title || "Mouvement de Caisse",
        amount: amountVal,
        currency: "USD",
        amountUSD: amountVal,
        amountCDF: Math.round(amountVal * 2500),
        exchangeRate: 2500,
        date: m.date || new Date(),
        agentName: m.user_name || "Caissier",
        department: "Maize Mill",
        reason: m.title || m.source,
        billetage: m.billetage || {
          usd: { "100": Math.floor(amountVal / 100) },
          total_usd: amountVal,
          total_cdf: 0,
          exchange_rate: 2500,
        },
      };
      const { dataUrl, fileName } = await generateCashReceiptPdf(receiptData);
      await openDocumentInNativeViewer(dataUrl, fileName);
    } catch {
      toast.error("Impossible de visualiser le bordereau");
    }
  };

  const loadMovements = async () => {
    setLoading(true);
    try {
      const res = await api.get("/accounting/movements");
      setMovements(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur chargement écritures"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMovements();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post("/accounting/sync");
      toast.success("Synchronisation comptable effectuée avec succès");
      loadMovements();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur lors de la synchronisation"));
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleRecord = async (id: string) => {
    setTogglingId(id);
    try {
      const res = await api.post(`/accounting/movements/${id}/toggle-record`);
      toast.success(
        res.data?.is_recorded
          ? "Marqué comme enregistré en comptabilité"
          : "Statut réinitialisé à non-enregistré"
      );
      setMovements((prev) =>
        prev.map((m) => (m.id === id ? { ...m, is_recorded: res.data?.is_recorded } : m))
      );
      if (selectedMovement?.id === id) {
        setSelectedMovement((prev: any) => ({ ...prev, is_recorded: res.data?.is_recorded }));
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec de l'opération"));
    } finally {
      setTogglingId(null);
    }
  };

  const handleExportCSV = () => {
    if (movements.length === 0) return;
    const lines = [
      ["PREMIDIS SARL - JOURNAL GÉNÉRAL COMPTABLE"],
      ["Date d'exportation", new Date().toLocaleString("fr-FR")],
      [""],
      ["Date", "Référence", "Module", "Libellé", "Compte Débit", "Compte Crédit", "Montant ($)", "Statut"],
      ...movements.map((m) => [
        m.date,
        m.reference,
        m.module,
        `"${m.title}"`,
        `"${m.debit_account || "411100 - Clients"}"`,
        `"${m.credit_account || "701100 - Ventes"}"`,
        m.amount,
        m.is_recorded ? "Enregistré" : "En attente",
      ]),
    ];
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + lines.map((e) => e.join(";")).join("\n");
    const encoded = encodeURI(csvContent);
    const link = document.createElement("a");
    link.href = encoded;
    link.download = `Journal_Comptable_PREMIDIS_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Journal comptable exporté avec succès en format CSV");
  };

  const handlePrintJournal = () => {
    const todayStr = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    const rows = filteredMovements
      .map(
        (m) => `
        <tr>
          <td>${m.date}</td>
          <td><strong>${m.reference}</strong></td>
          <td>${m.title}</td>
          <td>${m.debit_account || "411100"}</td>
          <td>${m.credit_account || "701100"}</td>
          <td style="text-align:right; font-weight:bold;">$ ${Number(m.amount).toFixed(2)}</td>
          <td style="text-align:center;">${m.is_recorded ? "Validé" : "En attente"}</td>
        </tr>
      `
      )
      .join("");
    const fullHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
        <div style="border-bottom: 2px solid #0f3d68; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="color: #0f3d68; margin: 0; font-size: 22px; font-weight: 800;">PREMIDIS SARL</h1>
            <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">
              Direction Administrative et Financière • Plan Comptable OHADA
            </p>
          </div>
          <div style="text-align: right; font-size: 11px;">
            <p style="margin: 0; font-weight: bold; color: #0f3d68;">Grand Livre & Journal Général</p>
            <p style="margin: 2px 0 0 0; color: #64748b;">Date d'édition : ${todayStr}</p>
          </div>
        </div>
        <table border="1" cellpadding="6" style="width:100%; border-collapse:collapse; font-size:11px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th>Date</th>
              <th>Référence</th>
              <th>Libellé de l'écriture</th>
              <th>Cpt Débit</th>
              <th>Cpt Crédit</th>
              <th style="text-align:right;">Montant (USD)</th>
              <th style="text-align:center;">Statut</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
    printDocument({ title: "Journal Comptable PREMIDIS", html: fullHtml });
  };

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const matchMod = moduleFilter === "all" || m.module === moduleFilter;
      const matchSt =
        statusFilter === "all" ||
        (statusFilter === "recorded" ? m.is_recorded : !m.is_recorded);
      const q = search.trim().toLowerCase();
      const matchQ =
        !q ||
        m.reference?.toLowerCase().includes(q) ||
        m.title?.toLowerCase().includes(q) ||
        m.source?.toLowerCase().includes(q);
      return matchMod && matchSt && matchQ;
    });
  }, [movements, moduleFilter, statusFilter, search]);

  const stats = useMemo(() => {
    let totalRecorded = 0;
    let totalPending = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    movements.forEach((m) => {
      if (m.is_recorded) totalRecorded++;
      else totalPending++;
      if (m.amount > 0) totalDebit += m.amount;
      else totalCredit += Math.abs(m.amount);
    });
    return { totalRecorded, totalPending, totalDebit, totalCredit };
  }, [movements]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Journal & Écritures Comptables"
        subtitle="Traçabilité des opérations, réconciliation et synchronisation financière"
        right={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCSV}
              className="rounded-xl border-slate-200 text-xs text-slate-700 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-4 w-4 mr-1 text-emerald-600" /> Export CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrintJournal}
              className="rounded-xl border-slate-200 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4 mr-1 text-[#0F3D68]" /> Imprimer Journal
            </Button>
            <Button
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="rounded-xl bg-[#0F3D68] hover:bg-[#0B2F52] text-white text-xs"
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
              Synchroniser
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Total Écritures"
          value={String(movements.length)}
          sub={`${stats.totalRecorded} enregistrées`}
          tone="blue"
        />
        <StatCard
          label="À réconcilier"
          value={String(stats.totalPending)}
          sub="En attente de validation"
          tone={stats.totalPending > 0 ? "amber" : "slate"}
        />
        <StatCard
          label="Flux Entrants (Débit)"
          value={fmtMoney(stats.totalDebit)}
          sub="Total des recettes"
          tone="green"
        />
        <StatCard
          label="Flux Sortants (Crédit)"
          value={fmtMoney(stats.totalCredit)}
          sub="Total des charges / sorties"
          tone="slate"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Rechercher par référence, libellé..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-white border-slate-200 text-xs"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs font-medium"
          >
            <option value="all">Tous les modules</option>
            <option value="cash">Caisse</option>
            <option value="orders">Ventes / Commandes</option>
            <option value="stock">Stock</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs font-medium"
          >
            <option value="all">Tous les statuts</option>
            <option value="recorded">Enregistrés</option>
            <option value="pending">Non enregistrés</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="p-3">Réf / Date</th>
                    <th className="p-3">Libellé</th>
                    <th className="p-3 text-right">Montant</th>
                    <th className="p-3 text-center">Statut</th>
                    <th className="p-3 text-center">Pièce / Bordereau</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMovements.map((m) => {
                    const isSelected = selectedMovement?.id === m.id;
                    const isCashDoc =
                      m.module === "cash" ||
                      m.document_url ||
                      m.source?.toLowerCase().includes("caisse") ||
                      m.reference?.startsWith("ENC-") ||
                      m.reference?.startsWith("VERS-") ||
                      m.reference?.startsWith("APP-") ||
                      m.reference?.startsWith("DEC-");
                    return (
                      <tr
                        key={m.id}
                        onClick={() => setSelectedMovement(m)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? "bg-blue-50/80" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="p-3">
                          <span className="font-mono font-bold text-slate-700 block">
                            {m.reference}
                          </span>
                          <span className="text-[10px] text-slate-400">{m.date}</span>
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-slate-900">{m.title}</div>
                          <div className="text-[10px] text-slate-500">{m.source}</div>
                        </td>
                        <td className="p-3 text-right font-black">
                          <span
                            className={m.amount >= 0 ? "text-emerald-600" : "text-slate-800"}
                          >
                            {fmtMoney(m.amount)}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              m.is_recorded
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {m.is_recorded ? "Enregistré" : "En attente"}
                          </span>
                        </td>
                        <td
                          className="p-3 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isCashDoc ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewBordereau(m)}
                              className={`h-7 px-2 text-[10px] font-semibold ${
                                m.source?.toLowerCase().includes("sortie") ||
                                m.source?.toLowerCase().includes("décaissement") ||
                                m.reference?.startsWith("DEC-") ||
                                Number(m.amount) < 0
                                  ? "text-rose-700 border-rose-300 hover:bg-rose-50"
                                  : "text-[#0F3D68] border-[#0F3D68]/30 hover:bg-[#0F3D68]/10"
                              }`}
                              title={
                                m.source?.toLowerCase().includes("sortie") ||
                                m.source?.toLowerCase().includes("décaissement") ||
                                m.reference?.startsWith("DEC-") ||
                                Number(m.amount) < 0
                                  ? "Visualiser le bordereau de sortie dans le navigateur"
                                  : "Visualiser le bordereau officiel dans le navigateur"
                              }
                            >
                              <FileText
                                className={`h-3 w-3 mr-1 ${
                                  m.source?.toLowerCase().includes("sortie") ||
                                  m.source?.toLowerCase().includes("décaissement") ||
                                  m.reference?.startsWith("DEC-") ||
                                  Number(m.amount) < 0
                                    ? "text-rose-600"
                                    : "text-[#0F3D68]"
                                }`}
                              />
                              {m.source?.toLowerCase().includes("sortie") ||
                              m.source?.toLowerCase().includes("décaissement") ||
                              m.reference?.startsWith("DEC-") ||
                              Number(m.amount) < 0
                                ? "Visualiser le bordereau de sortie"
                                : "Visualiser le bordereau"}
                            </Button>
                          ) : (
                            <span className="text-slate-300 text-[11px]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-1">
            <MovementDetailPanel
              movement={selectedMovement}
              onClose={() => setSelectedMovement(null)}
              onToggleRecord={handleToggleRecord}
              isToggling={togglingId === selectedMovement?.id}
            />
          </div>
        </div>
      )}
    </div>
  );
}
