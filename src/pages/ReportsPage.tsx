import React, { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  ShoppingCart,
  Users,
  Loader2,
  FileSpreadsheet,
  Printer,
  Package,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Search,
  FileText,
  FileCheck,
  Lock,
  Coins,
  AlertCircle,
  Eye,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { PageHeader, fmtMoney, fmtDate } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { printDocument } from "@/lib/print";
import {
  generateCashClosingReceiptPdf,
  generateCashReceiptPdf,
  CashClosingReceiptData,
  CashReceiptData,
} from "@/lib/generateCashReceiptPdf";
import { openDocumentUrl, openDocumentInNativeViewer, saveFile, openPendingTab, closeTab } from "@/lib/documentViewer";
import { exportReceivablesPdf } from "@/lib/exportReceivablesPdf";
import { useAuth } from "@/contexts/AuthContext";
import StockReportDashboard from "@/components/reports/StockReportDashboard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function ReportsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  // Rapport des créances clients (une ligne par dette restante)
  const [receivables, setReceivables] = useState<any[]>([]);
  const [exportingReceivables, setExportingReceivables] = useState(false);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("month");
  const [activeTab, setActiveTab] = useState<
    "overview" | "sales" | "cash" | "credits" | "stock" | "documents"
  >("overview");
  const [selectedBU, setSelectedBU] = useState("all");
  const [search, setSearch] = useState("");

  const [orders, setOrders] = useState<any[]>([]);
  const [cashOps, setCashOps] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [cashSessions, setCashSessions] = useState<any[]>([]);
  const [activeCashSession, setActiveCashSession] = useState<any>(null);
  const [cashSubTab, setCashSubTab] = useState<"closings" | "operations">("closings");
  const [viewingBilletageSession, setViewingBilletageSession] = useState<any>(null);

  const loadAllReports = async () => {
    setLoading(true);
    try {
      const [repRes, ordRes, cashRes, crdRes, prdRes, sessRes, actSessRes] = await Promise.all([
        api.get("/reports/summary", { params: { period } }),
        api.get("/orders"),
        api.get("/cash/operations"),
        api.get("/credits"),
        api.get("/products"),
        api.get("/cash/sessions"),
        api.get("/cash/active-session"),
      ]);
      setData(repRes.data);
      setOrders(Array.isArray(ordRes.data) ? ordRes.data : []);
      setCashOps(Array.isArray(cashRes.data) ? cashRes.data : []);
      setCredits(Array.isArray(crdRes.data) ? crdRes.data : []);
      api
        .get("/credits/receivables")
        .then(({ data }) => setReceivables(Array.isArray(data) ? data : []))
        .catch(() => setReceivables([]));
      setProducts(Array.isArray(prdRes.data) ? prdRes.data : []);
      setCashSessions(Array.isArray(sessRes.data) ? sessRes.data : []);
      if (actSessRes.data?.session) {
        setActiveCashSession(actSessRes.data.session);
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur chargement des rapports"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllReports();
  }, [period]);

  const filteredOrders = useMemo(() => {
    let list = orders.filter((o) => o.status !== "cancelled");
    if (selectedBU !== "all") {
      list = list.filter(
        (o) =>
          o.business_unit_id === selectedBU ||
          o.items?.some((i: any) => i.product_name?.toLowerCase().includes(selectedBU.toLowerCase()))
      );
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.code?.toLowerCase().includes(q) ||
          o.client_name?.toLowerCase().includes(q) ||
          o.marketer_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, selectedBU, search]);

  const filteredCashOps = useMemo(() => {
    let list = [...cashOps];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (op) =>
          op.reference?.toLowerCase().includes(q) ||
          op.reason?.toLowerCase().includes(q) ||
          op.category?.toLowerCase().includes(q) ||
          op.created_by?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [cashOps, search]);

  const filteredCredits = useMemo(() => {
    let list = [...credits];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.client_name?.toLowerCase().includes(q) ||
          c.client_code?.toLowerCase().includes(q) ||
          c.marketer_name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [credits, search]);

  const filteredReceivables = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return receivables;
    return receivables.filter((r) => [r.client_name, r.marketer_name, r.client_phone].some((x) => x && String(x).toLowerCase().includes(q)));
  }, [receivables, search]);
  const receivablesTotal = filteredReceivables.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const handleExportReceivables = async () => {
    // L'onglet du visualiseur PDF est ouvert pendant le clic (sinon Chrome le bloque)
    const tab = openPendingTab("Rapport des créances clients");
    setExportingReceivables(true);
    try {
      const ok = await exportReceivablesPdf({
        rows: filteredReceivables,
        editedBy: user?.full_name || "Utilisateur",
        filtersLabel: search.trim() ? `Recherche « ${search.trim()} »` : "Tous les clients débiteurs",
        tab,
      });
      if (!ok) closeTab(tab);
    } catch (err) {
      closeTab(tab);
      toast.error(extractErrorMessage(err, "Export PDF impossible"));
    } finally {
      setExportingReceivables(false);
    }
  };

  const filteredProducts = useMemo(() => {
    let list = [...products];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.code?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, search]);

  const totalSales = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  }, [filteredOrders]);

  const totalPaidSales = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.amount_paid || 0), 0);
  }, [filteredOrders]);

  const totalCreditSales = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.outstanding || 0), 0);
  }, [filteredOrders]);

  const totalCashInUSD = useMemo(() => {
    return cashOps
      .filter((c) => c.type === "in")
      .reduce((s, c) => s + (c.amount_usd || (c.currency === "USD" ? c.amount : c.amount / (c.exchange_rate || 2500))), 0);
  }, [cashOps]);

  const totalCashInCDF = useMemo(() => {
    return cashOps
      .filter((c) => c.type === "in")
      .reduce((s, c) => s + (c.amount_cdf || (c.currency === "CDF" ? c.amount : c.amount * (c.exchange_rate || 2500))), 0);
  }, [cashOps]);

  const totalCashOutUSD = useMemo(() => {
    return cashOps
      .filter((c) => c.type === "out")
      .reduce((s, c) => s + (c.amount_usd || (c.currency === "USD" ? c.amount : c.amount / (c.exchange_rate || 2500))), 0);
  }, [cashOps]);

  const totalCashOutCDF = useMemo(() => {
    return cashOps
      .filter((c) => c.type === "out")
      .reduce((s, c) => s + (c.amount_cdf || (c.currency === "CDF" ? c.amount : c.amount * (c.exchange_rate || 2500))), 0);
  }, [cashOps]);

  const initUSD = activeCashSession?.initial_balance_usd !== undefined ? activeCashSession.initial_balance_usd : (activeCashSession?.initial_balance || 0);
  const initCDF = activeCashSession?.initial_balance_cdf || 0;
  const currentCashUSD = Math.round((initUSD + totalCashInUSD - totalCashOutUSD) * 100) / 100;
  const currentCashCDF = Math.round(initCDF + totalCashInCDF - totalCashOutCDF);
  const netCash = currentCashUSD;

  const totalDebts = useMemo(() => {
    return credits
      .filter((c) => c.status !== "paid")
      .reduce((sum, c) => sum + (c.remaining !== undefined ? c.remaining : c.amount || 0), 0);
  }, [credits]);

  const totalStockValue = useMemo(() => {
    return products.reduce((sum, p) => sum + (p.stock || 0) * (p.cost_price || 0), 0);
  }, [products]);

  const lowStockCount = useMemo(() => {
    return products.filter((p) => (p.stock || 0) <= (p.low_stock_threshold || 15)).length;
  }, [products]);

  const handleViewCashOperationSlip = async (op: any) => {
    if (op.document_url) {
      openDocumentInNativeViewer(
        op.document_url,
        op.document_name || (op.type === "out" ? `Bordereau_Sortie_${op.reference}.pdf` : `Bordereau_${op.reference || "CSH"}.pdf`),
        op.id,
        "cash_operation"
      );
      return;
    }
    try {
      const opId = op.id || op.reference;
      const { data } = await api.get(`/cash/operations/${opId}/document`);
      if (data?.document_url) {
        openDocumentInNativeViewer(
          data.document_url,
          data.document_name || (op.type === "out" ? `Bordereau_Sortie_${op.reference}.pdf` : `Bordereau_${op.reference || "CSH"}.pdf`),
          opId,
          "cash_operation"
        );
        return;
      }
    } catch {
      // Continue to fallback
    }

    if (op.type === "out") {
      toast.info("Cette ancienne sortie de caisse ne possède aucune pièce justificative importée.");
      return;
    }

    try {
      const amountVal = Number(op.amount) || 0;
      const rate = Number(op.exchange_rate) || 2500;
      const currency = (op.currency as "USD" | "CDF") || "USD";
      const amountUSD = op.amount_usd || (currency === "USD" ? amountVal : Math.round((amountVal / rate) * 100) / 100);
      const amountCDF = op.amount_cdf || (currency === "CDF" ? amountVal : Math.round(amountVal * rate));

      const receiptData: CashReceiptData = {
        operationReference: op.reference || "CSH",
        operationType: op.type || "in",
        category: op.category || (op.type === "in" ? "ENTRÉE DE CAISSE" : "SORTIE DE CAISSE"),
        amount: amountVal,
        currency,
        amountUSD,
        amountCDF,
        exchangeRate: rate,
        date: op.created_at || new Date(),
        agentName: op.created_by || "Caissier",
        department: op.department || "Maize Mill",
        clientName: op.client_name,
        marketerName: op.marketer_name,
        reason: op.reason,
        billetage: op.billetage,
      };

      const { dataUrl, fileName } = await generateCashReceiptPdf(receiptData);
      openDocumentUrl({
        url: dataUrl,
        fileName,
        fileType: "application/pdf",
      });
    } catch (err) {
      toast.error("Impossible d'ouvrir le bordereau");
    }
  };

  const exportCSV = () => {
    if (!data) return;
    const lines = [
      ["PREMIDIS SARL - RAPPORT GÉNÉRAL"],
      ["Date d'exportation", new Date().toLocaleString("fr-FR")],
      ["Période", period],
      [""],
      ["VENTES"],
      ["Chiffre d'Affaires Total ($)", totalSales],
      ["Ventes Payées au Comptant ($)", totalPaidSales],
      ["Ventes à Crédit ($)", totalCreditSales],
      ["Total Commandes", filteredOrders.length],
      [""],
      ["CAISSE"],
      ["Total Entrées ($)", totalCashInUSD],
      ["Total Sorties ($)", totalCashOutUSD],
      ["Solde Net Caisse ($)", netCash],
      [""],
      ["CRÉANCES"],
      ["Total Créances Clients ($)", totalDebts],
      ["Clients Débiteurs", credits.filter((c) => (c.remaining || c.amount) > 0).length],
      [""],
      ["STOCK"],
      ["Valeur Totale du Stock ($)", totalStockValue],
      ["Articles en Alerte", lowStockCount],
    ];

    const csv = "\uFEFF" + lines.map((e) => e.join(";")).join("\n");
    // Téléchargement réel ; la notification vient de saveFile, après réussite
    saveFile(new Blob([csv], { type: "text/csv" }), `Rapport_PREMIDIS_${period}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handlePrintReport = (docType: string) => {
    const todayStr = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    let docTitle = `PREMIDIS SARL - ${docType}`;
    let tableHtml = "";

    if (docType === "Livre des Ventes Journalier") {
      tableHtml = `
        <table border="1" cellpadding="6" style="width:100%; border-collapse:collapse; font-size:11px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th>Réf Commande</th>
              <th>Client</th>
              <th>Marketeur</th>
              <th>Paiement</th>
              <th style="text-align:right;">Montant Total</th>
              <th style="text-align:right;">Payé</th>
              <th style="text-align:right;">Reste</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            ${filteredOrders
              .slice(0, 30)
              .map(
                (o) => `
              <tr>
                <td><strong>${o.code}</strong></td>
                <td>${o.client_name}</td>
                <td>${o.marketer_name || "N/A"}</td>
                <td>${o.payment_method === "cash" ? "Comptant" : "Crédit"}</td>
                <td style="text-align:right;"><strong>$ ${Number(o.total || 0).toFixed(2)}</strong></td>
                <td style="text-align:right; color:#16a34a;">$ ${Number(o.amount_paid || 0).toFixed(2)}</td>
                <td style="text-align:right; color:#dc2626;">$ ${Number(o.outstanding || 0).toFixed(2)}</td>
                <td>${o.status}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else if (docType === "Livre de Caisse & Billetage") {
      tableHtml = `
        <table border="1" cellpadding="6" style="width:100%; border-collapse:collapse; font-size:11px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th>Date / Heure</th>
              <th>Réf</th>
              <th>Type</th>
              <th>Motif / Libellé</th>
              <th>Bénéficiaire / Client</th>
              <th style="text-align:right;">Montant (USD)</th>
              <th>Caissier</th>
            </tr>
          </thead>
          <tbody>
            ${cashOps
              .slice(0, 30)
              .map(
                (op) => `
              <tr>
                <td>${new Date(op.created_at).toLocaleString("fr-FR")}</td>
                <td><strong>${op.reference || "CSH"}</strong></td>
                <td style="color:${op.type === "in" ? "#16a34a" : "#dc2626"}; font-weight:bold;">
                  ${op.type === "in" ? "ENTRÉE" : "SORTIE"}
                </td>
                <td>${op.reason || op.category}</td>
                <td>${op.client_name || "-"}</td>
                <td style="text-align:right; font-weight:bold;">$ ${Number(op.amount || 0).toFixed(2)}</td>
                <td>${op.created_by || "Caisse Principale"}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else {
      tableHtml = `
        <table border="1" cellpadding="6" style="width:100%; border-collapse:collapse; font-size:11px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th>Client</th>
              <th>Code</th>
              <th>Marketeur Responsable</th>
              <th>Date de Dette</th>
              <th style="text-align:right;">Montant Initial</th>
              <th style="text-align:right;">Déjà Payé</th>
              <th style="text-align:right;">Solde Restant</th>
            </tr>
          </thead>
          <tbody>
            ${credits
              .map(
                (c) => `
              <tr>
                <td><strong>${c.client_name}</strong></td>
                <td>${c.client_code || "CLI"}</td>
                <td>${c.marketer_name || "Direction Commerciale"}</td>
                <td>${c.created_at ? new Date(c.created_at).toLocaleDateString("fr-FR") : "-"}</td>
                <td style="text-align:right;">$ ${Number(c.initial_amount || c.amount || 0).toFixed(2)}</td>
                <td style="text-align:right; color:#16a34a;">$ ${Number(c.paid || 0).toFixed(2)}</td>
                <td style="text-align:right; color:#dc2626; font-weight:bold;">$ ${Number(
                  c.remaining !== undefined ? c.remaining : c.amount || 0
                ).toFixed(2)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    const fullHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
        <div style="border-bottom: 2px solid #0f3d68; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="color: #0f3d68; margin: 0; font-size: 22px; font-weight: 800;">PREMIDIS SARL</h1>
            <p style="margin: 4px 0 0 0; font-size: 11px; color: #64748b;">
              Distribution Agroalimentaire & Boissons • République Démocratique du Congo<br/>
              Siège Social : Goma, Nord-Kivu • Dépôts : Goma, Bukavu, Kindu, Kisangani
            </p>
          </div>
          <div style="text-align: right; font-size: 11px;">
            <p style="margin: 0; font-weight: bold; color: #0f3d68;">Document Officiel de Gestion</p>
            <p style="margin: 2px 0 0 0; color: #64748b;">Date d'édition : ${todayStr}</p>
          </div>
        </div>
        <div style="margin-bottom: 16px;">
          <h2 style="font-size: 16px; margin: 0 0 4px 0; color: #0f3d68;">${docTitle}</h2>
          <p style="font-size: 11px; color: #64748b; margin: 0;">Période sélectionnée : ${period} • Généré automatiquement par le système central ERP</p>
        </div>
        ${tableHtml}
      </div>
    `;
    printDocument({ title: docTitle, html: fullHtml });
    toast.success(`Génération de la fiche : ${docType}`);
  };

  return (
    <div className="space-y-5 pb-16">
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-[#0F3D68] text-white flex items-center justify-center font-black text-base shadow-sm">
            P
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-[#0F3D68] tracking-widest uppercase">
                PREMIDIS SARL
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
                ERP Central
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">
              Rapports & Statistiques Financières
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
          >
            <option value="day">Aujourd'hui</option>
            <option value="week">Cette Semaine</option>
            <option value="month">Ce Mois</option>
            <option value="year">Cette Année</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={exportCSV}
            className="rounded-xl border-slate-200 text-xs text-slate-700 hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-4 w-4 mr-1 text-emerald-600" /> Export CSV
          </Button>
          <Button
            size="sm"
            onClick={() => handlePrintReport("Livre des Ventes Journalier")}
            className="rounded-xl bg-[#0F3D68] hover:bg-[#0B2F52] text-white text-xs"
          >
            <Printer className="h-4 w-4 mr-1.5" /> Imprimer Fiche
          </Button>
        </div>
      </div>

      {/* 4 MAIN METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <ShoppingCart className="h-4 w-4 text-emerald-600" /> VENTES
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {filteredOrders.length} Cmds
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-700 tracking-tight">
              {fmtMoney(totalSales)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">Chiffre d'affaires total</div>
          </div>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/80 to-white p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-blue-800 flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-blue-600" /> CAISSE DISPONIBLE
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              USD & CDF
            </span>
          </div>
          <div>
            <div className="text-xl font-black text-blue-700 tracking-tight">
              {fmtMoney(currentCashUSD, "USD")}
            </div>
            <div className="text-sm font-bold text-slate-800 mt-0.5">
              {fmtMoney(currentCashCDF, "CDF")}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
              <Users className="h-4 w-4 text-amber-600" /> CRÉANCES
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-amber-700 tracking-tight">
              {fmtMoney(totalDebts)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">Total créances clients dues</div>
          </div>
        </div>

        <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50/80 to-white p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-purple-800 flex items-center gap-1.5">
              <Package className="h-4 w-4 text-purple-600" /> STOCK
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-purple-700 tracking-tight">
              {fmtMoney(totalStockValue)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">Valeur marchande du stock</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
        {[
          { id: "overview", label: "Vue d'ensemble", icon: BarChart3 },
          { id: "sales", label: "Rapport des Ventes", icon: ShoppingCart },
          { id: "cash", label: "Livre de Caisse", icon: Wallet },
          { id: "credits", label: "Créances & Marketeurs", icon: Users },
          { id: "stock", label: "État des Stocks", icon: Package },
          { id: "documents", label: "Fiches & Documents Officiels", icon: FileCheck },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                isActive
                  ? "bg-[#0F3D68] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Rechercher dans les données du rapport..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-white border-slate-200 text-xs"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : activeTab === "cash" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCashSubTab("closings")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  cashSubTab === "closings"
                    ? "bg-[#0F3D68] text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Lock className="h-3.5 w-3.5" /> Clôtures & Billetages ({cashSessions.length})
              </button>
              <button
                onClick={() => setCashSubTab("operations")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  cashSubTab === "operations"
                    ? "bg-[#0F3D68] text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Wallet className="h-3.5 w-3.5" /> Journal des Mouvements ({filteredCashOps.length})
              </button>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Solde Actuel : <strong className="text-emerald-700">{fmtMoney(currentCashUSD, "USD")}</strong> | <strong className="text-blue-700">{fmtMoney(currentCashCDF, "CDF")}</strong>
            </div>
          </div>

          {cashSubTab === "closings" ? (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="p-3.5">Session / Horodatage</th>
                      <th className="p-3.5">Caissier & Département</th>
                      <th className="p-3.5 text-right">Solde Attendu</th>
                      <th className="p-3.5 text-right">Billetage Réel</th>
                      <th className="p-3.5 text-center">Écart</th>
                      <th className="p-3.5">Motif</th>
                      <th className="p-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cashSessions.map((sess) => (
                      <tr key={sess.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5">
                          <span className="font-mono font-bold text-slate-900 block">
                            CLOT-{sess.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {fmtDate(sess.opened_at, true)}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-800">{sess.closed_by || sess.opened_by_name}</div>
                          <div className="text-[10px] text-slate-500">{sess.department || "Maize Mill"}</div>
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="font-bold text-slate-900">
                            {fmtMoney(sess.theoretical_balance_usd || sess.actual_balance_usd || 0, "USD")}
                          </div>
                        </td>
                        <td className="p-3.5 text-right font-bold text-emerald-700">
                          {fmtMoney(sess.actual_balance_usd || 0, "USD")}
                        </td>
                        <td className="p-3.5 text-center">
                          <span className="text-emerald-700 font-bold">Équilibrée</span>
                        </td>
                        <td className="p-3.5 text-slate-400">{sess.discrepancy_reason || "-"}</td>
                        <td className="p-3.5 text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setViewingBilletageSession(sess)}
                            className="h-7 px-2 text-[10px]"
                          >
                            <Eye className="h-3 w-3 mr-1 text-blue-600" /> Billetage
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="p-3.5">Date / Réf</th>
                      <th className="p-3.5">Type</th>
                      <th className="p-3.5">Motif / Libellé</th>
                      <th className="p-3.5 text-right">Montant USD</th>
                      <th className="p-3.5 text-right">Montant CDF</th>
                      <th className="p-3.5">Caissier</th>
                      <th className="p-3.5 text-center">Bordereau</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCashOps.map((op) => {
                      const isIn = op.type === "in";
                      return (
                        <tr key={op.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5">
                            <span className="font-mono font-bold text-slate-900 block">
                              {op.reference || "CSH"}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {fmtDate(op.created_at, true)}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isIn
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {isIn ? (
                                <>
                                  <ArrowDownLeft className="h-3 w-3 mr-1" /> Entrée
                                </>
                              ) : (
                                <>
                                  <ArrowUpRight className="h-3 w-3 mr-1" /> Sortie
                                </>
                              )}
                            </span>
                          </td>
                          <td className="p-3.5 font-semibold text-slate-800">
                            {op.reason || op.category}
                          </td>
                          <td className="p-3.5 text-right font-black text-sm">
                            <span className={isIn ? "text-emerald-600" : "text-red-600"}>
                              {isIn ? "+" : "-"} {fmtMoney(op.amount_usd || (op.currency === "USD" ? op.amount : op.amount / 2500), "USD")}
                            </span>
                          </td>
                          <td className="p-3.5 text-right text-slate-600">
                            {fmtMoney(op.amount_cdf || (op.currency === "CDF" ? op.amount : op.amount * 2500), "CDF")}
                          </td>
                          <td className="p-3.5 text-slate-500 font-medium">
                            {op.created_by || "Caisse Principale"}
                          </td>
                          <td className="p-3.5 text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewCashOperationSlip(op)}
                              className={`h-7 px-2.5 text-[10px] font-semibold ${
                                !isIn
                                  ? "text-rose-700 border-rose-300 hover:bg-rose-50"
                                  : "text-[#0F3D68] border-[#0F3D68]/30 hover:bg-[#0F3D68]/10"
                              }`}
                            >
                              <FileText
                                className={`h-3 w-3 mr-1 ${
                                  !isIn ? "text-rose-600" : "text-[#0F3D68]"
                                }`}
                              />
                              {!isIn
                                ? "Visualiser le bordereau de sortie"
                                : "Visualiser le bordereau"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === "stock" ? (
        <StockReportDashboard products={products} orders={orders} search={search} />
      ) : activeTab === "sales" ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="p-3.5">Réf Commande</th>
                  <th className="p-3.5">Client</th>
                  <th className="p-3.5">Marketeur</th>
                  <th className="p-3.5">Mode</th>
                  <th className="p-3.5 text-right">Montant Total</th>
                  <th className="p-3.5 text-right">Payé</th>
                  <th className="p-3.5 text-right">Reste</th>
                  <th className="p-3.5 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-slate-900">{o.code}</td>
                    <td className="p-3.5 font-bold text-slate-800">{o.client_name}</td>
                    <td className="p-3.5 text-purple-700 font-medium">{o.marketer_name || "N/A"}</td>
                    <td className="p-3.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          o.payment_method === "cash"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {o.payment_method === "cash" ? "Comptant" : "Crédit"}
                      </span>
                    </td>
                    <td className="p-3.5 text-right font-black">{fmtMoney(o.total)}</td>
                    <td className="p-3.5 text-right font-bold text-emerald-600">
                      {fmtMoney(o.amount_paid)}
                    </td>
                    <td className="p-3.5 text-right font-bold text-blue-700">
                      {fmtMoney(o.outstanding)}
                    </td>
                    <td className="p-3.5 text-center">
                      <span className="capitalize px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold">
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "credits" ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Rapport des créances clients</h3>
              <p className="text-[11px] text-slate-500">
                {filteredReceivables.length} client(s) débiteur(s) · total dû {fmtMoney(receivablesTotal)}
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleExportReceivables}
              disabled={exportingReceivables}
              className="rounded-xl bg-[#0F3D68] hover:bg-[#0B2F52] text-white text-xs"
            >
              {exportingReceivables ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
              Exporter en PDF
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="p-3.5">Date de la dette</th>
                  <th className="p-3.5">Nom du client</th>
                  <th className="p-3.5">Marketeur responsable</th>
                  <th className="p-3.5 text-right">Montant de la dette</th>
                  <th className="p-3.5">Téléphone du client</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReceivables.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 text-slate-700">{r.debt_date ? new Date(r.debt_date).toLocaleDateString("fr-FR") : "-"}</td>
                    <td className="p-3.5 font-bold text-slate-900">{r.client_name}</td>
                    <td className="p-3.5 text-purple-700 font-medium">{r.marketer_name}</td>
                    <td className="p-3.5 text-right font-bold text-red-600">{fmtMoney(r.amount)}</td>
                    <td className="p-3.5 font-mono text-slate-700">{r.client_phone || "Non renseigné"}</td>
                  </tr>
                ))}
                {!filteredReceivables.length && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">Aucune créance client en cours.</td>
                  </tr>
                )}
              </tbody>
              {filteredReceivables.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                    <td className="p-3.5" colSpan={3}>Total des créances</td>
                    <td className="p-3.5 text-right text-red-700">{fmtMoney(receivablesTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : null}

      {/* DIALOG: DETAIL DU BILLETAGE DE CLÔTURE */}
      {viewingBilletageSession && (
        <Dialog open={!!viewingBilletageSession} onOpenChange={() => setViewingBilletageSession(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Coins className="h-5 w-5 text-[#0F3D68]" />
                <span>Billetage de Clôture</span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex justify-between">
                  <span>Caissier :</span>
                  <strong>{viewingBilletageSession.closed_by || viewingBilletageSession.opened_by_name}</strong>
                </div>
                <div className="flex justify-between mt-1">
                  <span>Total USD :</span>
                  <strong className="text-emerald-700">{fmtMoney(viewingBilletageSession.actual_balance_usd || 0, "USD")}</strong>
                </div>
                <div className="flex justify-between mt-1">
                  <span>Total CDF :</span>
                  <strong className="text-blue-700">{fmtMoney(viewingBilletageSession.actual_balance_cdf || 0, "CDF")}</strong>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewingBilletageSession(null)}>
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
