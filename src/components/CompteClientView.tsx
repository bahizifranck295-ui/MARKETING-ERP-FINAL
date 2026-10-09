import React, { useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  DollarSign,
  FileSpreadsheet,
  FileText,
  FileDown,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  Printer,
  RefreshCw,
  Search,
  Sliders,
  TrendingDown,
  TrendingUp,
  X,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Edit2,
  Camera,
  FileCheck,
  Building,
  ExternalLink,
  AlertTriangle,
  Upload,
  Maximize2,
  ShieldCheck,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtMoney, fmtNum } from "@/components/erp-ui";
import InvoiceModal from "@/components/InvoiceModal";
import { openDocumentInNativeViewer, closeTab, openPendingTab } from "@/lib/documentViewer";
import { getProductColor } from "@/lib/productColors";
import { generateClientAccountPdf } from "@/lib/exportClientAccountPdf";
import {
  generateCashReceiptPdf,
  CashReceiptData,
} from "@/lib/generateCashReceiptPdf";

export default function CompteClientView({
  clientId,
  onBack,
  onEditClient,
}: {
  clientId: string;
  onBack: () => void;
  onEditClient: (client: any) => void;
}) {
  const { user } = useAuth();
  const [accountData, setAccountData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("transactions");
  const [txSearch, setTxSearch] = useState("");
  const [txTypeFilter, setTxTypeFilter] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [prodSearch, setProdSearch] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [creditLimitModalOpen, setCreditLimitModalOpen] = useState(false);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [printReleveOpen, setPrintReleveOpen] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState<any>(null);

  const loadAccount = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/clients/${clientId}/account`);
      setAccountData(data);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDirectDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !client) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Le document est trop lourd (max 50 Mo)");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        await api.post(`/clients/${client.id}/document`, {
          document_url: base64,
          document_name: file.name,
          document_type: file.type.includes("pdf") ? "Document PDF" : "Document Officiel",
          document_size: `${(file.size / 1024).toFixed(1)} Ko`,
        });
        toast.success("Document enregistré avec succès");
        await loadAccount();
      } catch (err) {
        toast.error(extractErrorMessage(err, "Erreur lors de l'enregistrement du document"));
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (clientId) {
      loadAccount();
    }
  }, [clientId]);

  const client = accountData?.client;
  const soldeActuel = accountData?.solde_actuel ?? 0;
  const creditLimit = accountData?.credit_limit ?? 0;
  const creditDisponible = accountData?.credit_disponible ?? 0;
  const totalCommandes = accountData?.total_commandes ?? 0;
  const totalPaiements = accountData?.total_paiements ?? 0;
  const rawTransactions = accountData?.transactions || [];
  const rawProducts = accountData?.ventes_par_produit || [];

  const filteredTransactions = useMemo(() => {
    let list = [...rawTransactions];
    if (txSearch.trim()) {
      const q = txSearch.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.code?.toLowerCase().includes(q) ||
          t.title?.toLowerCase().includes(q) ||
          t.notes?.toLowerCase().includes(q) ||
          t.payment_method?.toLowerCase().includes(q) ||
          t.items?.some((i: any) => i.product_name?.toLowerCase().includes(q))
      );
    }
    if (txTypeFilter === "order") {
      list = list.filter((t) => t.type === "order");
    } else if (txTypeFilter === "payment") {
      list = list.filter((t) => t.type === "payment");
    }
    if (dateStart) {
      const startMs = new Date(dateStart).getTime();
      list = list.filter((t) => new Date(t.date).getTime() >= startMs);
    }
    if (dateEnd) {
      const endMs = new Date(dateEnd + "T23:59:59").getTime();
      list = list.filter((t) => new Date(t.date).getTime() <= endMs);
    }
    if (sortOrder === "desc") {
      list.reverse();
    }
    return list;
  }, [rawTransactions, txSearch, txTypeFilter, dateStart, dateEnd, sortOrder]);

  const filteredProducts = useMemo(() => {
    let list = [...rawProducts];
    if (prodSearch.trim()) {
      const q = prodSearch.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.product_name?.toLowerCase().includes(q) ||
          p.product_code?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rawProducts, prodSearch]);

  const handleReverseTx = async (tx: any) => {
    const isOrder = tx.type === "order";
    const promptMsg = isOrder
      ? `Êtes-vous sûr de vouloir annuler la commande ${tx.code} ?`
      : `Êtes-vous sûr d'annuler le paiement ${tx.code} (${fmtMoney(tx.amount)}) ?`;
    if (!window.confirm(promptMsg)) return;
    try {
      const { data } = await api.post(
        `/clients/${clientId}/transactions/${tx.id}/reverse`
      );
      setAccountData(data);
      toast.success(
        isOrder ? "Commande annulée" : "Paiement contre-passé avec succès"
      );
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  const handleViewPaymentReceipt = async (tx: any) => {
    if (tx.document_url) {
      await openDocumentInNativeViewer(
        tx.document_url,
        tx.document_name || `Bordereau_${tx.code}.pdf`,
        tx.operation_id || tx.id,
        "cash_operation"
      );
      return;
    }
    try {
      const opId = tx.operation_id || tx.id;
      const { data } = await api.get(`/cash/operations/${opId}/document`);
      if (data?.document_url) {
        await openDocumentInNativeViewer(
          data.document_url,
          data.document_name || `Bordereau_${tx.code}.pdf`,
          opId,
          "cash_operation"
        );
        return;
      }
    } catch {
      // Continue to fallback
    }
    try {
      const amountNum = Number(tx.amount) || 0;
      const rate = Number(tx.exchange_rate) || 2500;
      const currency = (tx.currency as "USD" | "CDF") || "USD";
      const amountUSD = tx.amount_usd || (currency === "USD" ? amountNum : Math.round((amountNum / rate) * 100) / 100);
      const amountCDF = tx.amount_cdf || (currency === "CDF" ? amountNum : Math.round(amountNum * rate));
      const receiptData: CashReceiptData = {
        operationReference: tx.code || `ENC-${tx.id?.slice(0, 6)}`,
        operationType: "in",
        category: tx.category || "RÈGLEMENT DIRECT CLIENT",
        amount: amountNum,
        currency,
        amountUSD,
        amountCDF,
        exchangeRate: rate,
        date: tx.date || new Date(),
        agentName: tx.created_by || user?.full_name || "Caissier",
        department: tx.department || client?.department || "Maize Mill",
        clientName: client?.name,
        clientCode: client?.code,
        reason: tx.notes || `Règlement direct de créance pour ${client?.name}`,
        billetage: tx.billetage || {
          usd: { "100": Math.floor(amountUSD / 100) },
          total_usd: amountUSD,
          total_cdf: amountCDF,
          exchange_rate: rate,
        },
      };
      const { dataUrl, fileName } = await generateCashReceiptPdf(receiptData);
      await openDocumentInNativeViewer(dataUrl, fileName);
    } catch (err) {
      toast.error("Impossible de visualiser le bordereau");
    }
  };

  const handleExportPdf = async () => {
    if (!client) return;
    if (filteredTransactions.length === 0) {
      toast.error("Aucune transaction à exporter avec les filtres sélectionnés");
      return;
    }
    const tab = openPendingTab(`Relevé ${client.name || ""}`);
    setExportingPdf(true);
    try {
      const ok = await generateClientAccountPdf({
        tab,
        client,
        transactions: filteredTransactions,
        soldeActuel,
        totalCommandes,
        totalPaiements,
        dateStart,
        dateEnd,
        txTypeFilter,
      });
      if (!ok) closeTab(tab);
    } catch (err) {
      closeTab(tab);
      toast.error(extractErrorMessage(err, "Erreur lors de la génération du PDF"));
    } finally {
      setExportingPdf(false);
    }
  };

  if (loading && !accountData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#0F3D68]" />
        <p className="text-sm text-slate-500 font-medium">Chargement du compte client...</p>
      </div>
    );
  }

  if (!accountData) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-2" />
        <h3 className="text-lg font-semibold text-slate-800">Compte introuvable</h3>
        <p className="text-sm text-slate-500 mt-1">Impossible de charger les données du client.</p>
        <Button onClick={onBack} className="mt-4 bg-[#0F3D68]">
          <ArrowLeft className="h-4 w-4 mr-1" /> Retour
        </Button>
      </div>
    );
  }

  const isAdvance = soldeActuel > 0;
  const isCredit = soldeActuel < 0;

  return (
    <div className="space-y-6 pb-12">
      {/* 1. TOP BREADCRUMB */}
      <div className="flex items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 font-medium"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Retour à la liste
          </Button>
          <div className="h-4 w-px bg-slate-200 mx-1" />
          <span className="text-sm font-bold text-slate-900">
            Compte Client : {client?.name}
          </span>
        </div>
      </div>

      {/* 2. CLIENT PROFILE HEADER */}
      {(() => {
        const prodStyle = getProductColor(client?.product_name);
        const hasDoc = Boolean(client?.document_url);
        return (
          <div
            className="bg-white rounded-2xl border p-5 md:p-6 shadow-xs relative overflow-hidden"
            style={{ borderColor: prodStyle.cardBorderHex, borderWidth: "2px" }}
          >
            <div
              className="absolute top-0 left-0 right-0 h-1.5"
              style={{ backgroundColor: prodStyle.cardBorderHex }}
            />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pt-1">
              <div className="flex items-start md:items-center gap-4">
                <div className="relative group shrink-0">
                  <div
                    className="h-20 w-20 rounded-2xl bg-gradient-to-br from-[#0F3D68] to-[#1E62A0] text-white flex items-center justify-center font-bold text-2xl shadow-md overflow-hidden border-2"
                    style={{ borderColor: prodStyle.cardBorderHex }}
                  >
                    {client?.photo_url ? (
                      <img
                        src={client.photo_url}
                        alt={client.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (client?.name || "CL")
                        .split(" ")
                        .map((s: string) => s[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                    )}
                  </div>
                  <button
                    onClick={() => setPhotoModalOpen(true)}
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-600 hover:text-[#0F3D68] transition-colors"
                    title="Changer la photo"
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                      {client?.name}
                    </h2>
                    <Badge
                      variant="outline"
                      className="bg-slate-50 border-slate-200 text-slate-700 font-mono text-xs px-2 py-0.5"
                    >
                      {client?.code}
                    </Badge>
                    <Badge className="bg-[#0F3D68]/10 text-[#0F3D68] border-0 text-xs px-2 py-0.5 font-medium">
                      {client?.type || "Client"}
                    </Badge>
                    {client?.product_name ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border shadow-2xs"
                        style={{
                          backgroundColor: prodStyle.badgeBg,
                          color: prodStyle.badgeText,
                          borderColor: prodStyle.badgeBorder,
                        }}
                      >
                        <Building className="h-3 w-3" />
                        {client.product_name}
                      </span>
                    ) : (
                      <Badge variant="outline" className="text-xs text-slate-400">
                        Produit : Non rattaché
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    {client?.phone && (
                      <a
                        href={`tel:${client.phone}`}
                        className="flex items-center gap-1 hover:text-[#0F3D68] transition-colors font-medium text-slate-700"
                      >
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        <span>{client.phone}</span>
                        <span className="text-[10px] text-slate-400">(Principal)</span>
                      </a>
                    )}
                    {client?.secondary_phone && (
                      <a
                        href={`tel:${client.secondary_phone}`}
                        className="flex items-center gap-1 hover:text-[#0F3D68] transition-colors font-medium text-slate-700"
                      >
                        <Phone className="h-3.5 w-3.5 text-slate-400 opacity-70" />
                        <span>{client.secondary_phone}</span>
                        <span className="text-[10px] text-slate-400">(Secondaire)</span>
                      </a>
                    )}
                    {(client?.address || client?.city) && (
                      <div className="flex items-center gap-1 text-slate-500">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" />
                        {[client?.address, client?.city].filter(Boolean).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
                {hasDoc ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openDocumentInNativeViewer(
                        client?.document_url,
                        client?.document_name,
                        client?.id
                      )
                    }
                    className="rounded-xl border border-sky-300 text-[#0F3D68] bg-sky-50/70 hover:bg-sky-100 text-xs font-bold shadow-xs"
                    title="Consulter le document en plein écran dans le visualiseur natif"
                  >
                    <Maximize2 className="h-4 w-4 mr-1.5 text-[#0F3D68]" />
                    Visualiser Doc
                  </Button>
                ) : (
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer shadow-xs">
                    <Upload className="h-3.5 w-3.5 text-slate-500" />
                    <span>Uploader Document PDF</span>
                    <input
                      type="file"
                      accept="application/pdf,.pdf,image/*"
                      onChange={handleDirectDocUpload}
                      className="hidden"
                    />
                  </label>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreditLimitModalOpen(true)}
                  className="rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 text-xs"
                >
                  <Sliders className="h-4 w-4 mr-1.5 text-slate-500" />
                  Ajuster Plafond
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEditClient && client && onEditClient(client)}
                  className="rounded-xl border-[#0F3D68]/30 hover:bg-sky-50 text-[#0F3D68] text-xs font-bold shadow-xs cursor-pointer"
                  title="Modifier les informations du client"
                >
                  <Edit2 className="h-4 w-4 mr-1.5 text-[#0F3D68]" />
                  Modifier Client
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 3. FOUR KEY FINANCIAL SUMMARY METRICS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Plafond de Crédit
            </span>
            <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {fmtMoney(creditLimit)}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>Disponible :</span>
            <span className="font-semibold text-emerald-600">
              {fmtMoney(creditDisponible)}
            </span>
          </div>
        </div>

        <div
          className={`rounded-2xl p-5 shadow-xs relative overflow-hidden transition-all ${
            isAdvance
              ? "bg-gradient-to-br from-emerald-50 to-teal-50/50 border-2 border-emerald-300"
              : isCredit
              ? "bg-gradient-to-br from-red-50 to-rose-50/50 border-2 border-red-300"
              : "bg-white border border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-bold uppercase tracking-wider ${
                isAdvance
                  ? "text-emerald-700"
                  : isCredit
                  ? "text-red-700"
                  : "text-slate-500"
              }`}
            >
              Solde Actuel
            </span>
            <div
              className={`h-8 w-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                isAdvance
                  ? "bg-emerald-200/70 text-emerald-800"
                  : isCredit
                  ? "bg-red-200/70 text-red-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {isAdvance ? (
                <TrendingUp className="h-4 w-4" />
              ) : isCredit ? (
                <TrendingDown className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
            </div>
          </div>
          <div
            className={`text-3xl font-black mt-2 tracking-tight font-mono ${
              isAdvance
                ? "text-emerald-600"
                : isCredit
                ? "text-red-600"
                : "text-slate-900"
            }`}
          >
            {isAdvance
              ? `+${fmtMoney(soldeActuel)}`
              : isCredit
              ? `-${fmtMoney(Math.abs(soldeActuel))}`
              : "0.00 $"}
          </div>
          <div className="mt-2">
            {isAdvance ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                EN AVANCE (DISPONIBLE POUR COMMANDER)
              </span>
            ) : isCredit ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
                EN CRÉDIT (DETTE CLIENT À PAYER)
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                SOLDÉ (AUCUNE DETTE NI AVANCE)
              </span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Commandes
            </span>
            <div className="h-8 w-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {fmtMoney(totalCommandes)}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <Badge className="bg-purple-100 text-purple-800 border-0 text-[10px] font-semibold px-2 py-0.5">
              TOUT PRODUIT
            </Badge>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Paiements
            </span>
            <div className="h-8 w-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-2">
            {fmtMoney(totalPaiements)}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px] font-semibold px-2 py-0.5">
              ENCAISSÉ
            </Badge>
          </div>
        </div>
      </div>

      {/* 4. MAIN TABS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 pt-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("transactions")}
              className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === "transactions"
                  ? "border-[#0F3D68] text-[#0F3D68]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <FileText className="h-4 w-4" />
              Historique des Transactions ({rawTransactions.length})
            </button>
            <button
              onClick={() => setActiveTab("products")}
              className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === "products"
                  ? "border-[#0F3D68] text-[#0F3D68]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Package className="h-4 w-4" />
              Vente par Produit ({rawProducts.length})
            </button>
          </div>
        </div>

        {/* TAB 1: TRANSACTIONS */}
        {activeTab === "transactions" && (
          <div className="p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Rechercher par référence, note, montant..."
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-lg bg-white border-slate-200"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                  <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-[11px] text-slate-500 font-medium">Du</span>
                  <input
                    type="date"
                    value={dateStart}
                    onChange={(e) => setDateStart(e.target.value)}
                    className="text-xs text-slate-700 bg-transparent border-0 focus:outline-none p-0 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                  <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-[11px] text-slate-500 font-medium">Au</span>
                  <input
                    type="date"
                    value={dateEnd}
                    onChange={(e) => setDateEnd(e.target.value)}
                    className="text-xs text-slate-700 bg-transparent border-0 focus:outline-none p-0 cursor-pointer"
                  />
                </div>
                <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200 text-xs">
                  <button
                    onClick={() => setTxTypeFilter("all")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      txTypeFilter === "all"
                        ? "bg-[#0F3D68] text-white"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Tous
                  </button>
                  <button
                    onClick={() => setTxTypeFilter("order")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      txTypeFilter === "order"
                        ? "bg-purple-600 text-white"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Commandes (-)
                  </button>
                  <button
                    onClick={() => setTxTypeFilter("payment")}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                      txTypeFilter === "payment"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Paiements (+)
                  </button>
                </div>
                {(dateStart || dateEnd || txTypeFilter !== "all" || txSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateStart("");
                      setDateEnd("");
                      setTxTypeFilter("all");
                      setTxSearch("");
                    }}
                    className="h-8 px-2 rounded-lg bg-slate-200/80 hover:bg-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                    <span>Effacer</span>
                  </button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
                  className="h-8 text-xs rounded-lg border-slate-200 bg-white hover:bg-slate-50"
                >
                  {sortOrder === "asc" ? "Chronologique" : "Plus récents"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  className="h-8 text-xs rounded-lg border-[#0F3D68]/30 bg-sky-50/60 hover:bg-sky-100 text-[#0F3D68] font-bold shadow-2xs"
                >
                  {exportingPdf ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5 mr-1 text-[#0F3D68]" />
                  )}
                  <span>Export PDF ({filteredTransactions.length})</span>
                </Button>
              </div>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <FileText className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                <p className="font-medium text-sm">Aucune transaction trouvée.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="px-4 py-3">Date & Heure</th>
                      <th className="px-4 py-3">Type & Intitulé</th>
                      <th className="px-4 py-3">Référence</th>
                      <th className="px-4 py-3 text-right">Mouvement</th>
                      <th className="px-4 py-3 text-right">Nouveau Solde</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTransactions.map((tx: any) => {
                      const isOrder = tx.type === "order";
                      const txDate = new Date(tx.date);
                      const formattedDate =
                        txDate.toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        }) +
                        " " +
                        txDate.toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                      const isRunningAdvance = (tx.nouveau_solde || 0) > 0;
                      const isRunningCredit = (tx.nouveau_solde || 0) < 0;

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap text-xs">
                            {formattedDate}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {isOrder ? (
                                <Badge className="bg-purple-100 text-purple-800 border-0 text-[11px] font-bold px-2 py-0.5">
                                  COMMANDE (TOUT PRODUIT)
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[11px] font-bold px-2 py-0.5">
                                  {tx.title || "PAIEMENT / DÉPÔT"}
                                </Badge>
                              )}
                              {tx.status === "cancelled" && (
                                <Badge className="bg-red-100 text-red-700 border-0 text-[10px]">
                                  Annulé
                                </Badge>
                              )}
                            </div>
                            {tx.notes && (
                              <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs">
                                {tx.notes}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-600">
                            {tx.code}
                          </td>
                          <td className="px-4 py-3 text-right font-black whitespace-nowrap font-mono">
                            {isOrder ? (
                              <span className="text-purple-700">-{fmtMoney(tx.amount)}</span>
                            ) : (
                              <span className="text-emerald-600">+{fmtMoney(tx.amount)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-extrabold whitespace-nowrap font-mono">
                            {isRunningCredit ? (
                              <div className="flex flex-col items-end">
                                <span className="text-red-600 font-black">
                                  -{fmtMoney(Math.abs(tx.nouveau_solde))}
                                </span>
                                <span className="text-[9px] font-bold text-red-500 uppercase">
                                  En crédit
                                </span>
                              </div>
                            ) : isRunningAdvance ? (
                              <div className="flex flex-col items-end">
                                <span className="text-emerald-600 font-black">
                                  +{fmtMoney(tx.nouveau_solde)}
                                </span>
                                <span className="text-[9px] font-bold text-emerald-600 uppercase">
                                  En avance
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-600">0.00 $</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {isOrder && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setInvoiceOrder(tx)}
                                  className="h-7 px-2 text-[11px] rounded-lg border-slate-200 text-slate-700 hover:text-[#0F3D68] hover:bg-slate-50 font-semibold"
                                  title="Voir la facture officielle"
                                >
                                  <FileText className="h-3 w-3 mr-1 text-[#0F3D68]" /> Facture
                                </Button>
                              )}
                              {!isOrder && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewPaymentReceipt(tx)}
                                  className="h-7 px-2.5 text-[11px] rounded-lg border-[#0F3D68]/30 text-[#0F3D68] bg-[#0F3D68]/5 hover:bg-[#0F3D68]/15 font-semibold"
                                  title="Visualiser le bordereau officiel de paiement dans le navigateur"
                                >
                                  <FileText className="h-3.5 w-3.5 mr-1 text-[#0F3D68]" />
                                  Visualiser le bordereau
                                </Button>
                              )}
                              {tx.status !== "cancelled" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleReverseTx(tx)}
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                                  title="Annuler / Contre-passer"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: VENTES PAR PRODUIT */}
        {activeTab === "products" && (
          <div className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Rechercher un produit acheté..."
                  value={prodSearch}
                  onChange={(e) => setProdSearch(e.target.value)}
                  className="pl-9 h-9 text-xs rounded-lg bg-white border-slate-200"
                />
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Package className="h-8 w-8 mx-auto text-slate-300 mb-2" />
                <p className="font-medium text-sm">Aucune vente enregistrée pour ce client.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="px-4 py-3">Produit</th>
                      <th className="px-4 py-3">Unité</th>
                      <th className="px-4 py-3 text-right">Quantité Achetée</th>
                      <th className="px-4 py-3 text-right">Montant Total ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map((p: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-900">{p.product_name}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{p.unit}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">
                          {fmtNum(p.quantity)}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-slate-900">
                          {fmtMoney(p.total_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: AJUSTER PLAFOND */}
      {creditLimitModalOpen && (
        <Dialog open onOpenChange={() => setCreditLimitModalOpen(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Sliders className="h-4 w-4 text-[#0F3D68]" />
                Ajuster le Plafond de Crédit
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as any;
                const newLim = Number(form.elements.limit.value);
                try {
                  const { data } = await api.post(`/clients/${client.id}/adjust-credit-limit`, {
                    credit_limit: newLim,
                  });
                  setAccountData(data);
                  setCreditLimitModalOpen(false);
                  toast.success("Plafond de crédit mis à jour");
                } catch (err) {
                  toast.error(extractErrorMessage(err));
                }
              }}
              className="space-y-4 pt-2"
            >
              <div>
                <Label className="text-xs font-semibold">Nouveau Plafond (USD)</Label>
                <Input
                  name="limit"
                  type="number"
                  step="50"
                  defaultValue={creditLimit}
                  required
                  className="mt-1 text-lg font-bold"
                />
              </div>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreditLimitModalOpen(false)}
                >
                  Annuler
                </Button>
                <Button type="submit" className="bg-[#0F3D68] text-white">
                  Mettre à jour
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL: PHOTO CLIENT */}
      {photoModalOpen && (
        <Dialog open onOpenChange={() => setPhotoModalOpen(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Camera className="h-4 w-4 text-[#0F3D68]" />
                Photo du Client
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as any;
                const photoUrl = form.elements.photo_url.value.trim();
                try {
                  await api.post(`/clients/${client.id}/photo`, { photo_url: photoUrl });
                  toast.success("Photo mise à jour avec succès");
                  setPhotoModalOpen(false);
                  loadAccount();
                } catch (err) {
                  toast.error(extractErrorMessage(err));
                }
              }}
              className="space-y-4 pt-2"
            >
              <div>
                <Label className="text-xs font-semibold">URL de la photo</Label>
                <Input
                  name="photo_url"
                  type="url"
                  defaultValue={client?.photo_url || ""}
                  placeholder="https://images.unsplash.com/..."
                  className="mt-1 text-xs"
                />
              </div>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPhotoModalOpen(false)}
                >
                  Annuler
                </Button>
                <Button type="submit" className="bg-[#0F3D68] text-white">
                  Enregistrer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL: IMPRESSION DU RELEVÉ */}
      {printReleveOpen && (
        <Dialog open onOpenChange={() => setPrintReleveOpen(false)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Relevé de Compte Client</span>
                <Button
                  size="sm"
                  onClick={() => window.print()}
                  className="bg-[#0F3D68] text-white"
                >
                  <Printer className="h-4 w-4 mr-1.5" /> Imprimer
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="p-6 bg-white space-y-6 text-slate-900 border border-slate-200 rounded-xl">
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <img
                    src="/assets/premidis-logo.svg"
                    alt="Logo PREMIDIS SARL"
                    className="h-10 w-auto object-contain"
                  />
                  <div>
                    <h1 className="text-xl font-black text-[#211A5C]">PREMIDIS SARL</h1>
                    <p className="text-xs text-slate-500">Distribution & Commerce Général</p>
                  </div>
                </div>
                <div className="text-right">
                  <h2 className="text-lg font-bold text-slate-800">RELEVÉ DE COMPTE</h2>
                  <p className="text-xs text-slate-500">Date : {new Date().toLocaleDateString("fr-FR")}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl text-xs">
                <div>
                  <p className="text-slate-400 font-semibold">Client :</p>
                  <p className="text-base font-bold text-slate-900">{client?.name}</p>
                  <p className="text-slate-600 font-mono">Code : {client?.code}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-400 font-semibold">Solde Actuel :</p>
                  <p className="text-xl font-bold text-[#0F3D68]">{fmtMoney(soldeActuel)}</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPrintReleveOpen(false)}>
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* FACTURE UNIFIÉE UTILISABLE */}
      <InvoiceModal
        isOpen={Boolean(invoiceOrder)}
        order={invoiceOrder}
        onClose={() => setInvoiceOrder(null)}
      />
    </div>
  );
}
