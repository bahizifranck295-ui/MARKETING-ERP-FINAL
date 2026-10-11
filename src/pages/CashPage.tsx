import React, { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Filter,
  FileText,
  Printer,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Lock,
  Unlock,
  Coins,
  DollarSign,
  UserCheck,
  Building,
  RefreshCw,
  Loader2,
  FileDown,
  FileCheck,
  Users,
  Calendar,
  Check,
  ChevronRight,
  TrendingUp,
  Receipt,
  X,
  Mail,
  Phone,
  MapPin,
  Warehouse as WarehouseIcon,
  Tags,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, EmptyState, fmtMoney, fmtNum, fmtDate } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { openDocumentInNativeViewer } from "@/lib/documentViewer";
import {
  generateCashReceiptPdf,
  generateCashClosingReceiptPdf,
  CashReceiptData,
  CashReceiptBilletage,
} from "@/lib/generateCashReceiptPdf";
import InflowModal from "@/components/cash/InflowModal";
import OutflowModal from "@/components/cash/OutflowModal";

interface CashSession {
  id: string;
  opened_by?: string;
  opened_by_name?: string;
  opened_at?: string;
  closed_at?: string;
  closed_by_name?: string;
  initial_balance?: number;
  initial_balance_usd?: number;
  initial_balance_cdf?: number;
  theoretical_balance_usd?: number;
  theoretical_balance_cdf?: number;
  actual_balance_usd?: number;
  actual_balance_cdf?: number;
  exchange_rate?: number;
  status: "open" | "closed";
  billetage?: any;
}

interface CashOperation {
  id: string;
  session_id: string;
  type: "in" | "out";
  category: string;
  amount: number;
  currency: "USD" | "CDF";
  amount_usd?: number;
  amount_cdf?: number;
  exchange_rate?: number;
  reason?: string;
  reference: string;
  client_id?: string;
  client_name?: string;
  marketer_name?: string;
  beneficiary?: string;
  authorized_by?: string;
  authorization_proof?: string;
  document_url?: string;
  document_name?: string;
  payment_method?: string;
  billetage?: CashReceiptBilletage;
  created_at: string;
  created_by?: string;
}

export default function CashPage() {
  const { user } = useAuth();

  // Navigation tabs (sessions replaced with rates)
  const [activeTab, setActiveTab] = useState<"journal" | "marketers" | "closing" | "rates">("journal");

  // State data
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [allSessions, setAllSessions] = useState<CashSession[]>([]);
  const [operations, setOperations] = useState<CashOperation[]>([]);
  const [marketerDeposits, setMarketerDeposits] = useState<any[]>([]);
  const [depositHistoryPage, setDepositHistoryPage] = useState(1);
  const [marketerOrders, setMarketerOrders] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [marketersList, setMarketersList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exchangeRate, setExchangeRate] = useState<number>(2500);

  // Rates Configuration State
  const [ratesConfig, setRatesConfig] = useState<any>(null);
  const [generalRateInput, setGeneralRateInput] = useState<string>("2500");
  const [outflowRateInput, setOutflowRateInput] = useState<string>("2500");
  const [categoryRatesInput, setCategoryRatesInput] = useState<Record<string, string>>({});
  const [savingRates, setSavingRates] = useState<boolean>(false);

  // Caisses par site : une caissière rattachée à un site opère sa caisse ; la direction choisit la caisse
  // ou la vue générale de toutes les caisses
  const ALL_CASH = "all";
  const cashLocked = !!(user as any)?.site_id && !["super_admin", "dg"].includes(user?.role_code || "") && !(user as any)?.is_transversal;
  const [cashSites, setCashSites] = useState<Array<{ id: string; name: string }>>([]);
  const [cashSite, setCashSite] = useState<string>((user as any)?.site_id || "");
  const [overview, setOverview] = useState<any>(null);

  // Modals visibility
  const [isInflowOpen, setIsInflowOpen] = useState(false);
  const [isOutflowOpen, setIsOutflowOpen] = useState(false);
  const [isOpenSessionOpen, setIsOpenSessionOpen] = useState(false);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Selected operation detail modal
  const [selectedOperation, setSelectedOperation] = useState<CashOperation | null>(null);

  // Order Billetage Modal (for marketer deposit approval)
  const [selectedOrderForBilletage, setSelectedOrderForBilletage] = useState<any | null>(null);
  const [orderBilletUSD, setOrderBilletUSD] = useState<Record<string, number>>({
    "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "1": 0,
  });
  const [orderBilletCDF, setOrderBilletCDF] = useState<Record<string, number>>({
    "20000": 0, "10000": 0, "5000": 0, "1000": 0, "500": 0,
  });
  const [approvingOrder, setApprovingOrder] = useState(false);

  // Success Slip Modal
  const [slipModalData, setSlipModalData] = useState<{
    receiptData: CashReceiptData | null;
    url: string;
    title: string;
  } | null>(null);

  // Session Opening form
  const [openSessionForm, setOpenSessionForm] = useState({
    initial_usd: "0",
    initial_cdf: "0",
    exchange_rate: "2500",
  });
  const [submittingOpen, setSubmittingOpen] = useState(false);

  // Closing Physical Count state
  const [closingBilletUSD, setClosingBilletUSD] = useState<Record<string, number>>({
    "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "1": 0,
  });
  const [closingBilletCDF, setClosingBilletCDF] = useState<Record<string, number>>({
    "20000": 0, "10000": 0, "5000": 0, "1000": 0, "500": 0,
  });
  const [closingNotes, setClosingNotes] = useState("");
  const [submittingClose, setSubmittingClose] = useState(false);

  // Fetch full data
  const loadData = async () => {
    setLoading(true);
    if (cashSite === ALL_CASH) {
      try {
        const { data } = await api.get("/cash/overview");
        setOverview(data);
      } catch (err) {
        toast.error(extractErrorMessage(err, "Erreur de chargement des caisses"));
      } finally {
        setLoading(false);
      }
      return;
    }
    // Toutes les requêtes de cette page (et des fenêtres d'entrée / sortie) visent la caisse du site choisi
    if (cashSite) api.defaults.headers.common["X-Cash-Site"] = cashSite;
    try {
      const [sessionRes, opsRes, markRes, sessionsRes, clientsRes, usersRes, ratesRes] = await Promise.all([
        api.get("/cash/active-session"),
        api.get("/cash/operations"),
        api.get("/cash/marketer-deposits"),
        api.get("/cash/sessions"),
        api.get("/clients"),
        api.get("/users"),
        api.get("/cash/rates").catch(() => ({ data: null })),
      ]);

      if (sessionRes.data?.session) {
        setActiveSession(sessionRes.data.session);
        if (sessionRes.data.session.exchange_rate) {
          setExchangeRate(sessionRes.data.session.exchange_rate);
        }
      } else {
        setActiveSession(null);
      }

      if (ratesRes?.data) {
        setRatesConfig(ratesRes.data);
        setGeneralRateInput(String(ratesRes.data.general_rate || 2500));
        setOutflowRateInput(String(ratesRes.data.outflow_rate || ratesRes.data.general_rate || 2500));
        const catMap: Record<string, string> = {};
        if (ratesRes.data.category_rates) {
          Object.entries(ratesRes.data.category_rates).forEach(([k, v]) => {
            catMap[k] = String(v);
          });
        }
        setCategoryRatesInput(catMap);
        if (ratesRes.data.general_rate) {
          setExchangeRate(ratesRes.data.general_rate);
          setOpenSessionForm((prev) => ({ ...prev, exchange_rate: String(ratesRes.data.general_rate) }));
        }
      }

      const site = cashSite || sessionRes.data?.session?.site_id;
      setOperations((Array.isArray(opsRes.data) ? opsRes.data : []).filter((o: any) => !site || !o.site_id || o.site_id === site));
      setAllSessions((Array.isArray(sessionsRes.data) ? sessionsRes.data : []).filter((x: any) => !site || !x.site_id || x.site_id === site));

      if (markRes.data) {
        setMarketerDeposits(Array.isArray(markRes.data.marketers) ? markRes.data.marketers : []);
        setMarketerOrders(Array.isArray(markRes.data.orders) ? markRes.data.orders : []);
      }

      const clientList = Array.isArray(clientsRes.data) ? clientsRes.data : [];
      setClients(clientList);

      // Extract debts from clients with current_credit > 0 or negative balance
      const debtList = clientList
        .filter((c: any) => (c.current_credit && c.current_credit > 0) || (c.balance && c.balance < 0))
        .map((c: any) => ({
          id: `deb-${c.id}`,
          client_id: c.id,
          client_name: c.name,
          client_phone: c.phone,
          client_code: c.code,
          debt_amount_usd: c.current_credit || Math.abs(c.balance || 0),
          department: c.department || "Maize Mill",
        }));
      setDebts(debtList);

      const users = Array.isArray(usersRes.data) ? usersRes.data : [];
      const marketers = users.filter((u: any) => u.role_code === "marketer" || u.department === "Ventes");
      setMarketersList(marketers.length > 0 ? marketers : users);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur de chargement des données de caisse"));
    } finally {
      setLoading(false);
    }
  };

  // Liste des sites (caisses) ; par défaut la caisse du site de l'utilisateur, sinon le site principal
  useEffect(() => {
    api
      .get("/stock/sites")
      .then(({ data }) => {
        const list = (Array.isArray(data) ? data : []).filter((x: any) => x.is_active !== false).map((x: any) => ({ id: x.id, name: x.name }));
        setCashSites(list);
        setCashSite((cur) => (cur && (cur === ALL_CASH || list.some((x) => x.id === cur)) ? cur : list[0]?.id || ""));
      })
      .catch(() => setCashSites([]));
    return () => {
      delete api.defaults.headers.common["X-Cash-Site"];
    };
  }, []);

  useEffect(() => {
    loadData();
  }, [cashSite]);

  // Compute Live Metrics
  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayOps = operations.filter((o) => o.created_at?.startsWith(today));

    const totalInUSD = todayOps
      .filter((o) => o.type === "in")
      .reduce((sum, o) => sum + (o.amount_usd || (o.currency === "USD" ? o.amount : o.amount / (o.exchange_rate || exchangeRate))), 0);

    const totalOutUSD = todayOps
      .filter((o) => o.type === "out")
      .reduce((sum, o) => sum + (o.amount_usd || (o.currency === "USD" ? o.amount : o.amount / (o.exchange_rate || exchangeRate))), 0);

    const totalInCDF = todayOps
      .filter((o) => o.type === "in" && o.currency === "CDF")
      .reduce((sum, o) => sum + o.amount, 0);

    const totalOutCDF = todayOps
      .filter((o) => o.type === "out" && o.currency === "CDF")
      .reduce((sum, o) => sum + o.amount, 0);

    const balanceUSD = activeSession?.theoretical_balance_usd ?? (activeSession?.initial_balance_usd || 0) + totalInUSD - totalOutUSD;
    const balanceCDF = activeSession?.theoretical_balance_cdf ?? (activeSession?.initial_balance_cdf || 0) + totalInCDF - totalOutCDF;

    // Solde actuel en caisse : dollars et francs physiquement présents (fonds de départ + billetage ou devise
    // de chaque opération de la session), les francs étant convertis au taux du jour puis ajoutés aux dollars
    const sessionOps = activeSession?.id ? operations.filter((o) => o.session_id === activeSession.id) : todayOps;
    let cashUSD = Number(activeSession?.initial_balance_usd ?? activeSession?.initial_balance ?? 0) || 0;
    let cashCDF = Number(activeSession?.initial_balance_cdf || 0) || 0;
    for (const o of sessionOps) {
      const sign = o.type === "in" ? 1 : o.type === "out" ? -1 : 0;
      const b: any = (o as any).billetage;
      const hasBillet = b && (Number(b.total_usd) > 0 || Number(b.total_cdf) > 0);
      const usd = hasBillet ? Number(b.total_usd) || 0 : o.currency === "USD" ? Number(o.amount) || 0 : 0;
      const cdf = hasBillet ? Number(b.total_cdf) || 0 : o.currency === "CDF" ? Number(o.amount) || 0 : 0;
      cashUSD += sign * usd;
      cashCDF += sign * cdf;
    }
    const currentCashUSD = cashUSD + (exchangeRate > 0 ? cashCDF / exchangeRate : 0);

    return {
      totalInUSD,
      totalOutUSD,
      totalInCDF,
      totalOutCDF,
      balanceUSD: Math.round(balanceUSD * 100) / 100,
      balanceCDF: Math.round(balanceCDF),
      cashUSD: Math.round(cashUSD * 100) / 100,
      cashCDF: Math.round(cashCDF),
      currentCashUSD: Math.round(currentCashUSD * 100) / 100,
    };
  }, [operations, activeSession, exchangeRate]);

  // Unique categories for filtering
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    operations.forEach((op) => {
      if (op.category) set.add(op.category);
    });
    return Array.from(set);
  }, [operations]);

  // Filtered operations
  const filteredOperations = useMemo(() => {
    return operations.filter((op) => {
      if (typeFilter !== "all" && op.type !== typeFilter) return false;
      if (categoryFilter !== "all" && op.category !== categoryFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesRef = op.reference.toLowerCase().includes(q);
        const matchesReason = op.reason?.toLowerCase().includes(q) || false;
        const matchesBen = op.beneficiary?.toLowerCase().includes(q) || false;
        const matchesClient = op.client_name?.toLowerCase().includes(q) || false;
        const matchesAuth = op.authorized_by?.toLowerCase().includes(q) || false;
        const matchesCat = op.category?.toLowerCase().includes(q) || false;
        if (!matchesRef && !matchesReason && !matchesBen && !matchesClient && !matchesAuth && !matchesCat) {
          return false;
        }
      }
      return true;
    });
  }, [operations, typeFilter, categoryFilter, searchTerm]);

  // Order Billetage Calculations
  const orderBilletTotalUSD = useMemo(() => {
    return Object.entries(orderBilletUSD).reduce((acc, [denom, count]) => acc + Number(denom) * (Number(count) || 0), 0);
  }, [orderBilletUSD]);

  const orderBilletTotalCDF = useMemo(() => {
    return Object.entries(orderBilletCDF).reduce((acc, [denom, count]) => acc + Number(denom) * (Number(count) || 0), 0);
  }, [orderBilletCDF]);

  const orderBilletCalculatedTotalUSD = useMemo(() => {
    // Taux de la catégorie de la commande encaissée (Caisse › Taux)
    const fx = Number((selectedOrderForBilletage as any)?.fx_rate) || exchangeRate;
    const cdfUSD = orderBilletTotalCDF > 0 ? Math.round((orderBilletTotalCDF / fx) * 100) / 100 : 0;
    return Math.round((orderBilletTotalUSD + cdfUSD) * 100) / 100;
  }, [orderBilletTotalUSD, orderBilletTotalCDF, exchangeRate, selectedOrderForBilletage]);

  // Closing Physical Count Calculations
  const closingPhysicalUSD = useMemo(() => {
    return Object.entries(closingBilletUSD).reduce((acc, [d, c]) => acc + Number(d) * (Number(c) || 0), 0);
  }, [closingBilletUSD]);

  const closingPhysicalCDF = useMemo(() => {
    return Object.entries(closingBilletCDF).reduce((acc, [d, c]) => acc + Number(d) * (Number(c) || 0), 0);
  }, [closingBilletCDF]);

  const diffClosingUSD = useMemo(() => {
    return Math.round((closingPhysicalUSD - metrics.balanceUSD) * 100) / 100;
  }, [closingPhysicalUSD, metrics.balanceUSD]);

  const diffClosingCDF = useMemo(() => {
    return Math.round(closingPhysicalCDF - metrics.balanceCDF);
  }, [closingPhysicalCDF, metrics.balanceCDF]);

  // Rates Handlers
  const handleSaveRates = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const gRate = parseFloat(generalRateInput);
    const oRate = parseFloat(outflowRateInput);
    if (!gRate || isNaN(gRate) || gRate <= 0) {
      toast.error("Le taux général doit être supérieur à zéro");
      return;
    }
    if (!oRate || isNaN(oRate) || oRate <= 0) {
      toast.error("Le taux de sortie doit être supérieur à zéro");
      return;
    }

    const cleanCatRates: Record<string, number> = {};
    Object.entries(categoryRatesInput).forEach(([k, v]) => {
      const num = parseFloat(String(v));
      cleanCatRates[k] = num > 0 ? num : gRate;
    });

    setSavingRates(true);
    try {
      const res = await api.post("/cash/rates", {
        general_rate: gRate,
        outflow_rate: oRate,
        category_rates: cleanCatRates,
      });

      setRatesConfig(res.data);
      setExchangeRate(gRate);
      toast.success("Taux enregistrés avec succès ! Appliqués immédiatement à toutes les opérations futures.");
      loadData();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur lors de l'enregistrement des taux"));
    } finally {
      setSavingRates(false);
    }
  };

  // Open Cash Session handler
  const handleConfirmOpenSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingOpen(true);
    try {
      const res = await api.post("/cash/sessions/open", {
        initial_balance_usd: parseFloat(openSessionForm.initial_usd) || 0,
        initial_balance_cdf: parseFloat(openSessionForm.initial_cdf) || 0,
        exchange_rate: parseFloat(openSessionForm.exchange_rate) || 2500,
      });
      setActiveSession(res.data);
      setIsOpenSessionOpen(false);
      toast.success("Session de caisse ouverte avec succès");
      loadData();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Impossible d'ouvrir la session"));
    } finally {
      setSubmittingOpen(false);
    }
  };

  // Submit Session Closing with official PV generation
  const handleConfirmCloseSession = async () => {
    if (!activeSession) return;
    setSubmittingClose(true);
    try {
      const billetageData = {
        usd: closingBilletUSD,
        cdf: closingBilletCDF,
        total_usd: closingPhysicalUSD,
        total_cdf: closingPhysicalCDF,
        exchange_rate: exchangeRate,
      };

      const closingPayload = {
        session_id: activeSession.id,
        closed_by: user?.full_name || "Caissier",
        closed_at: new Date().toISOString(),
        theoretical_usd: metrics.balanceUSD,
        theoretical_cdf: metrics.balanceCDF,
        actual_usd: closingPhysicalUSD,
        actual_cdf: closingPhysicalCDF,
        diff_usd: diffClosingUSD,
        diff_cdf: diffClosingCDF,
        notes: closingNotes,
        billetage: billetageData,
      };

      await api.post(`/cash/sessions/${activeSession.id}/close`, {
        actual_balance_usd: closingPhysicalUSD,
        actual_balance_cdf: closingPhysicalCDF,
        notes: closingNotes,
        billetage: billetageData,
      });

      // Generate the official closing PDF report
      try {
        const { dataUrl, fileName } = await generateCashClosingReceiptPdf({
          sessionReference: `CLOT-${activeSession.id.slice(0, 6).toUpperCase()}`,
          sessionId: activeSession.id,
          openedAt: activeSession.opened_at || new Date(),
          closedAt: new Date(),
          agentName: user?.full_name || "Caissier",
          department: "Caisse Centrale Goma",
          exchangeRate: exchangeRate,
          initialBalanceUSD: activeSession.initial_balance_usd || 0,
          initialBalanceCDF: activeSession.initial_balance_cdf || 0,
          totalInUSD: metrics.totalInUSD,
          totalInCDF: metrics.totalInCDF,
          totalOutUSD: metrics.totalOutUSD,
          totalOutCDF: metrics.totalOutCDF,
          theoreticalBalanceUSD: metrics.balanceUSD,
          theoreticalBalanceCDF: metrics.balanceCDF,
          actualBalanceUSD: closingPhysicalUSD,
          actualBalanceCDF: closingPhysicalCDF,
          differenceUSD: diffClosingUSD,
          differenceCDF: diffClosingCDF,
          discrepancyReason: closingNotes || undefined,
          billetage: billetageData,
        });

        setSlipModalData({
          receiptData: null,
          url: dataUrl,
          title: `Procès-Verbal de Clôture de Caisse - ${fileName}`,
        });
      } catch (pdfErr) {
        console.warn("Could not generate closing PDF:", pdfErr);
      }

      toast.success("Caisse clôturée avec succès !");
      loadData();
      setActiveTab("journal");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur lors de la clôture"));
    } finally {
      setSubmittingClose(false);
    }
  };

  // Approve Marketer Order Cash Deposit
  const handleApproveOrderDeposit = async () => {
    if (!selectedOrderForBilletage) return;
    setApprovingOrder(true);
    try {
      const ord = selectedOrderForBilletage;
      // Taux de la catégorie de produits de la commande (Caisse › Taux)
      const orderFx = Number((ord as any).fx_rate) || exchangeRate;
      const orderDept = (ord as any).fx_category || "Maize Mill";
      const ref = `ENC-${Date.now().toString().slice(-6)}`;
      const billetData: CashReceiptBilletage = {
        usd: orderBilletUSD,
        cdf: orderBilletCDF,
        total_usd: orderBilletTotalUSD,
        total_cdf: orderBilletTotalCDF,
        exchange_rate: orderFx,
      };

      const receiptData: CashReceiptData = {
        operationReference: ref,
        operationType: "in",
        category: "VERSEMENT JOURNALIER MARKETEUR (COMPTE CLIENT)",
        amount: ord.total,
        currency: "USD",
        amountUSD: ord.total,
        amountCDF: Math.round(ord.total * orderFx),
        exchangeRate: orderFx,
        date: new Date(),
        agentName: user?.full_name || "Caissier",
        department: orderDept,
        marketerName: ord.marketer_name,
        clientName: ord.client_name,
        orderCode: ord.code,
        reason: `Versement espèces commande ${ord.code} pour ${ord.client_name} (Marketeur: ${ord.marketer_name || "Ventes"})`,
        billetage: billetData,
      };

      const { dataUrl, fileName } = await generateCashReceiptPdf(receiptData);

      await api.post("/cash/marketer-deposits/approve", {
        order_id: ord.id,
        amount: ord.total,
        currency: "USD",
        exchange_rate: orderFx,
        reference: ref,
        document_url: dataUrl,
        document_name: fileName,
        billetage: billetData,
      });

      toast.success(`Commande ${ord.code} encaissée avec succès !`);
      setSelectedOrderForBilletage(null);
      setSlipModalData({
        receiptData,
        url: dataUrl,
        title: `Bordereau Officiel de Versement : ${ord.code}`,
      });
      loadData();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur lors de l'encaissement de la commande"));
    } finally {
      setApprovingOrder(false);
    }
  };

  // View Justificatif document
  const handleViewDocument = async (op: CashOperation) => {
    if (!op.document_url) {
      toast.info("Aucune pièce justificative scannée attachée à cette opération");
      return;
    }
    await openDocumentInNativeViewer(
      op.document_url,
      op.document_name || `Justificatif_${op.reference}.pdf`,
      op.id,
      "cash_operation"
    );
  };

  // Print official receipt for an operation
  const handlePrintReceipt = async (op: CashOperation) => {
    try {
      toast.loading("Génération du bordereau...", { id: "cash-slip" });
      const amountUSD =
        op.amount_usd ||
        (op.currency === "USD" ? op.amount : Math.round((op.amount / (op.exchange_rate || exchangeRate)) * 100) / 100);
      const amountCDF =
        op.amount_cdf ||
        (op.currency === "CDF" ? op.amount : Math.round(op.amount * (op.exchange_rate || exchangeRate)));

      const receiptData: CashReceiptData = {
        operationReference: op.reference,
        operationType: op.type,
        category: op.category,
        amount: op.amount,
        currency: op.currency,
        amountUSD,
        amountCDF,
        exchangeRate: op.exchange_rate || exchangeRate,
        date: op.created_at,
        agentName: op.created_by || user?.full_name || "Caissier",
        department: "Direction Financière & Caisse Centrale",
        clientName: op.beneficiary || op.client_name,
        marketerName: op.marketer_name,
        reason: op.reason,
        billetage: op.billetage,
      };

      const result = await generateCashReceiptPdf(receiptData);
      toast.dismiss("cash-slip");

      // Visualiseur natif du navigateur (nouvel onglet), comme tous les documents de l'application
      await openDocumentInNativeViewer(result.dataUrl, result.fileName);
    } catch (err) {
      toast.dismiss("cash-slip");
      toast.error(extractErrorMessage(err, "Erreur génération reçu"));
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Gestion de Caisse"
        subtitle="Suivi des mouvements en espèces, encaissements clients, décaissements et clôtures journalières"
        right={
          <div className="flex flex-wrap items-center gap-2.5">
            {cashLocked ? (
              <Badge className="bg-slate-50 text-slate-700 border-slate-200 px-3 py-1 font-semibold" data-no-translate>
                Caisse : {cashSites.find((x) => x.id === cashSite)?.name || "Mon site"}
              </Badge>
            ) : (
              <select
                aria-label="Caisse"
                value={cashSite}
                onChange={(e) => setCashSite(e.target.value)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                <option value={ALL_CASH}>Toutes les caisses (vue générale)</option>
                {cashSites.map((x) => (
                  <option key={x.id} value={x.id} data-no-translate>
                    Caisse {x.name}
                  </option>
                ))}
              </select>
            )}
            {cashSite === ALL_CASH ? null : activeSession ? (
              <>
                <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 px-3 py-1 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Caisse Ouverte ({activeSession.opened_by_name || "En service"})
                </Badge>

                {/* 1. Bouton Enregistrer une entrée (Modal Inflow d'origine avec les 4 types d'encaissement) */}
                <Button
                  variant="outline"
                  onClick={() => setIsInflowOpen(true)}
                  className="border-emerald-600/40 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-medium"
                >
                  <ArrowDownLeft className="w-4 h-4 mr-1.5 text-emerald-600" />
                  Enregistrer une entrée
                </Button>

                {/* 2. Bouton Enregistrer une sortie (Modal Outflow avec formulaire complet, justificatif, recherche utilisateurs) */}
                <Button
                  onClick={() => setIsOutflowOpen(true)}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-medium shadow-xs"
                >
                  <ArrowUpRight className="w-4 h-4 mr-1.5" />
                  Enregistrer une sortie
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setActiveTab("closing")}
                  className="border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  <Lock className="w-4 h-4 mr-1.5 text-slate-500" />
                  Clôturer
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setIsOpenSessionOpen(true)}
                className="bg-[#0F3D68] hover:bg-[#0B2F52] text-white font-medium shadow-xs"
              >
                <Unlock className="w-4 h-4 mr-1.5" />
                Ouvrir la Caisse
              </Button>
            )}
          </div>
        }
      />

      {cashSite === ALL_CASH ? (
        <div className="space-y-4" data-cash-overview>
          {loading || !overview ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div data-cash-total className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Solde actuel de toutes les caisses (USD)</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{fmtMoney(overview.total.current_usd, "USD")}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {fmtMoney(overview.total.cash_usd, "USD")} + {fmtNum(overview.total.cash_cdf)} FC
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">Francs convertis au taux : 1$ = {fmtNum(overview.rate)} FC</p>
                </div>
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
                  <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Entrées des caisses ouvertes</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">+{fmtMoney(overview.total.in_usd, "USD")}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {overview.total.open_count} caisse(s) ouverte(s) sur {overview.sites.length}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
                  <p className="text-xs font-medium text-rose-600 uppercase tracking-wider">Sorties des caisses ouvertes</p>
                  <p className="text-2xl font-bold text-rose-600 mt-1">-{fmtMoney(overview.total.out_usd, "USD")}</p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-semibold">Caisse (site)</th>
                      <th className="px-4 py-3 font-semibold">Statut</th>
                      <th className="px-4 py-3 font-semibold">Caissière</th>
                      <th className="px-4 py-3 text-right font-semibold">Entrées</th>
                      <th className="px-4 py-3 text-right font-semibold">Sorties</th>
                      <th className="px-4 py-3 text-right font-semibold">Solde actuel (USD)</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overview.sites.map((r: any) => (
                      <tr key={r.site_id} data-cash-site-row>
                        <td className="px-4 py-3 font-semibold text-slate-900" data-no-translate>{r.site_name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.is_open ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${r.is_open ? "bg-emerald-500" : "bg-slate-400"}`} />
                            {r.is_open ? "Ouverte" : "Fermée"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600" data-no-translate>
                          {r.opened_by_name || r.cashiers?.join(", ") || "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-emerald-700">+{fmtMoney(r.in_usd, "USD")}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-rose-600">-{fmtMoney(r.out_usd, "USD")}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-bold tabular-nums text-slate-900">{fmtMoney(r.current_usd, "USD")}</div>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {fmtMoney(r.cash_usd, "USD")} + {fmtNum(r.cash_cdf)} FC
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => setCashSite(r.site_id)} className="h-8 text-xs">
                            Ouvrir cette caisse
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                      <td className="px-4 py-3" colSpan={3}>Total toutes caisses</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700">+{fmtMoney(overview.total.in_usd, "USD")}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600">-{fmtMoney(overview.total.out_usd, "USD")}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(overview.total.current_usd, "USD")}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
      <>
      {/* Synthesis Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Solde actuel en caisse : dollars + francs convertis au taux du jour */}
        <div data-current-cash className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Solde actuel en caisse (USD)</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              {fmtMoney(metrics.currentCashUSD, "USD")}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {fmtMoney(metrics.cashUSD, "USD")} + {fmtNum(metrics.cashCDF)} FC
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Francs convertis au taux : 1$ = {fmtNum(exchangeRate)} FC</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#0F3D68] dark:text-blue-400 flex items-center justify-center">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Entrées du jour */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Entrées du jour
            </p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              +{fmtMoney(metrics.totalInUSD, "USD")}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{fmtNum(metrics.totalInCDF)} CDF encaissés</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
            <ArrowDownLeft className="w-6 h-6" />
          </div>
        </div>

        {/* Sorties du jour */}
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400 uppercase tracking-wider">
              Sorties du jour
            </p>
            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
              -{fmtMoney(metrics.totalOutUSD, "USD")}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{fmtNum(metrics.totalOutCDF)} CDF décaissés</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center">
            <ArrowUpRight className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab("journal")}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "journal"
              ? "border-[#0F3D68] text-[#0F3D68] dark:text-blue-400 dark:border-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Receipt className="w-4 h-4" />
          Livre de Caisse (Journal des Opérations)
        </button>

        <button
          onClick={() => setActiveTab("marketers")}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "marketers"
              ? "border-[#0F3D68] text-[#0F3D68] dark:text-blue-400 dark:border-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Users className="w-4 h-4" />
          Versements Marketeurs
          {marketerOrders.filter((o) => (o.cash_deposit_status || "pending_deposit") === "pending_deposit").length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
              {marketerOrders.filter((o) => (o.cash_deposit_status || "pending_deposit") === "pending_deposit").length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("closing")}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "closing"
              ? "border-[#0F3D68] text-[#0F3D68] dark:text-blue-400 dark:border-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <Coins className="w-4 h-4" />
          Clôture Journalière & Billetage
        </button>

        <button
          onClick={() => setActiveTab("rates")}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "rates"
              ? "border-[#0F3D68] text-[#0F3D68] dark:text-blue-400 dark:border-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Taux
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: JOURNAL DES OPÉRATIONS (LIVRE DE CAISSE)                           */}
      {/* ========================================================================= */}
      {activeTab === "journal" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          {/* Filters Bar */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Rechercher référence, motif, bénéficiaire..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              {/* Type Filter */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setTypeFilter("all")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    typeFilter === "all"
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-2xs"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  Tous ({operations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter("in")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    typeFilter === "in"
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  Entrées
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter("out")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    typeFilter === "out"
                      ? "bg-rose-600 text-white shadow-2xs"
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  Sorties
                </button>
              </div>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-[#0F3D68]"
              >
                <option value="all">Toutes les catégories</option>
                {existingCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="h-9 text-xs gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-[#0F3D68]" />
              <p className="text-xs">Chargement des opérations de caisse...</p>
            </div>
          ) : filteredOperations.length === 0 ? (
            <div className="py-16">
              <EmptyState
                icon={Wallet}
                title="Aucune opération trouvée"
                subtitle="Aucun mouvement de caisse ne correspond aux critères sélectionnés."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Réf & Horodatage</th>
                    <th className="py-3 px-4">Type & Catégorie</th>
                    <th className="py-3 px-4">Tiers (Bénéficiaire / Client)</th>
                    <th className="py-3 px-4">Motif & Autorisation</th>
                    <th className="py-3 px-4 text-right">Montant</th>
                    <th className="py-3 px-4 text-center">Pièce Justificative</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredOperations.map((op) => {
                    const isOut = op.type === "out";
                    const hasDoc = Boolean(op.document_url);

                    return (
                      <tr
                        key={op.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Réf & Date */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {op.reference}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {new Date(op.created_at).toLocaleString("fr-FR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </td>

                        {/* Type & Catégorie */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 mb-1">
                            {isOut ? (
                              <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 text-[10px] px-2 py-0.2 font-bold flex items-center gap-1">
                                <ArrowUpRight className="w-3 h-3" />
                                Décaissement
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 text-[10px] px-2 py-0.2 font-bold flex items-center gap-1">
                                <ArrowDownLeft className="w-3 h-3" />
                                Encaissement
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {op.category}
                          </span>
                        </td>

                        {/* Tiers */}
                        <td className="py-3 px-4">
                          {isOut ? (
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {op.beneficiary || "Non précisé"}
                              </div>
                              <span className="text-[10px] text-slate-400">Bénéficiaire</span>
                            </div>
                          ) : (
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {op.client_name || op.marketer_name || "Client Caisse"}
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {op.marketer_name ? `Marketeur: ${op.marketer_name}` : "Versant"}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Motif & Autorisation */}
                        <td className="py-3 px-4 max-w-xs">
                          <p className="text-xs text-slate-700 dark:text-slate-300 truncate font-medium">
                            {op.reason || "—"}
                          </p>
                          {op.authorized_by && (
                            <div className="text-[11px] text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-0.5">
                              <UserCheck className="w-3 h-3" />
                              <span>Autorisé par : {op.authorized_by}</span>
                            </div>
                          )}
                        </td>

                        {/* Montant */}
                        <td className="py-3 px-4 text-right">
                          <div
                            className={`font-bold text-sm ${
                              isOut
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {isOut ? "-" : "+"}
                            {fmtMoney(op.amount, op.currency)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {op.currency === "USD"
                              ? `~${fmtNum(Math.round(op.amount * (op.exchange_rate || exchangeRate)))} FC`
                              : `~${fmtMoney(op.amount / (op.exchange_rate || exchangeRate), "USD")}`}
                          </div>
                        </td>

                        {/* Pièce Justificative */}
                        <td className="py-3 px-4 text-center">
                          {hasDoc ? (
                            <button
                              type="button"
                              onClick={() => handleViewDocument(op)}
                              title="Ouvrir le justificatif dans Google Chrome"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-50 text-[#0F3D68] border border-blue-200 hover:bg-blue-100 transition-colors"
                            >
                              <FileCheck className="w-3.5 h-3.5 text-blue-600" />
                              <span>Voir pièce</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Aucune</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedOperation(op)}
                              title="Consulter les détails"
                              className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePrintReceipt(op)}
                              title="Imprimer le reçu officiel"
                              className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
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

      {/* ========================================================================= */}
      {/* TAB 2: VERSEMENTS JOURNALIERS DES MARKETEURS                             */}
      {/* ========================================================================= */}
      {activeTab === "marketers" && (
        <div className="space-y-4">
          {/* Versements attendus : une carte par marketeur du site (informations de sa fiche utilisateur) */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3" data-deposits-total>
            <div className="text-xs text-amber-900">
              <span className="font-bold uppercase tracking-wider">Versement attendu de tous les marketeurs</span>
              <span className="ml-2 text-slate-600">
                {marketerDeposits.filter((m: any) => m.pending_orders_count > 0).length} marketeur(s) doivent verser
              </span>
            </div>
            <div className="text-right">
              <div className="text-xl font-black text-amber-800 tabular-nums">
                {fmtMoney(marketerDeposits.reduce((t: number, m: any) => t + (Number(m.pending_total_usd) || 0), 0), "USD")}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                {fmtNum(marketerDeposits.reduce((t: number, m: any) => t + (Number(m.pending_total_fc) || 0), 0))} FC
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Seuls les versements encore attendus : ce qui est déjà versé passe dans l'historique ci-dessous */}
            {marketerDeposits.filter((m: any) => m.pending_orders_count > 0).map((m: any) => (
              <div
                key={m.marketer_id || m.marketer_name}
                data-deposit-card
                className={`bg-white dark:bg-slate-900 rounded-xl border p-4 space-y-3 shadow-xs ${
                  m.pending_orders_count > 0 ? "border-amber-200" : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="h-11 w-11 shrink-0 rounded-full bg-[#0F3D68] text-white flex items-center justify-center font-bold text-sm">
                      {String(m.marketer_name || "?")
                        .split(" ")
                        .map((w: string) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="truncate font-bold text-sm text-slate-900" data-no-translate>{m.marketer_name}</h4>
                      <p className="text-[11px] text-slate-500">{m.role_name || "Agent Ventes / Marketeur"}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      m.pending_orders_count > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {m.pending_orders_count > 0 ? `${m.pending_orders_count} en attente` : "À jour"}
                  </span>
                </div>

                {/* Informations de la fiche utilisateur */}
                <dl className="grid grid-cols-1 gap-1.5 text-[11px]" data-no-translate>
                  {[
                    [Phone, m.phone || "—"],
                    [Mail, m.email || "—"],
                    [MapPin, m.site_name || "—"],
                    [WarehouseIcon, m.warehouse_name || "—"],
                    [Tags, m.departments || "—"],
                  ].map(([Icon, v]: any, i: number) => (
                    <div key={i} className="flex items-center gap-1.5 text-slate-600">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate" title={String(v)}>{v}</span>
                    </div>
                  ))}
                </dl>

                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Versement attendu</span>
                    <span className={`font-black text-base tabular-nums ${m.pending_total_usd > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                      {fmtMoney(m.pending_total_usd || 0, "USD")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Équivalent</span>
                    <span className="tabular-nums">{fmtNum(m.pending_total_fc || 0)} FC</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Dernier versement</span>
                    <span>{m.last_deposit_at ? fmtDate(m.last_deposit_at, true) : "—"}</span>
                  </div>
                </div>

                <Button
                  size="sm"
                  disabled={!m.pending_orders_count}
                  onClick={() => setIsInflowOpen(true)}
                  className="w-full h-8 text-xs bg-[#0F3D68] hover:bg-[#0B2F52] text-white font-medium"
                >
                  <Coins className="w-3.5 h-3.5 mr-1.5" />
                  Encaisser versement
                </Button>
              </div>
            ))}
            {!marketerDeposits.some((m: any) => m.pending_orders_count > 0) && (
              <div className="col-span-full rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                Aucun versement attendu : tous les marketeurs de ce site sont à jour.
              </div>
            )}
          </div>

          {/* Historique des versements déjà encaissés (l'encaissement se fait depuis les cartes ci-dessus) */}
          {(() => {
            const done = marketerOrders
              .filter((o) => (o.cash_deposit_status || "pending_deposit") !== "pending_deposit")
              .sort((x, y) => String(y.cash_deposited_at || y.updated_at || "").localeCompare(String(x.cash_deposited_at || x.updated_at || "")));
            const pages = Math.max(1, Math.ceil(done.length / 10));
            const page = Math.min(depositHistoryPage, pages);
            const rows = done.slice((page - 1) * 10, page * 10);
            return (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs" data-deposit-history>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Historique des versements encaissés</h3>
                  <span className="text-[11px] text-slate-500">
                    {done.length} versement(s) · {fmtMoney(done.reduce((t, o) => t + (Number(o.total) || 0), 0), "USD")}
                  </span>
                </div>
                {done.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">Aucun versement encaissé pour cette caisse.</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b text-slate-500 uppercase font-semibold">
                          <tr>
                            <th className="py-2.5 px-3">Code</th>
                            <th className="py-2.5 px-3">Client</th>
                            <th className="py-2.5 px-3">Marketeur</th>
                            <th className="py-2.5 px-3">Vente du</th>
                            <th className="py-2.5 px-3">Encaissé le</th>
                            <th className="py-2.5 px-3 text-right">Montant USD</th>
                            <th className="py-2.5 px-3 text-center">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rows.map((ord: any) => (
                            <tr key={ord.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-bold">{ord.code}</td>
                              <td className="py-2.5 px-3 font-medium" data-no-translate>{ord.client_name}</td>
                              <td className="py-2.5 px-3 text-slate-500" data-no-translate>{ord.marketer_name}</td>
                              <td className="py-2.5 px-3 text-slate-400">{fmtDate(ord.approved_at || ord.created_at)}</td>
                              <td className="py-2.5 px-3 text-slate-600">{ord.cash_deposited_at ? fmtDate(ord.cash_deposited_at, true) : "—"}</td>
                              <td className="py-2.5 px-3 text-right font-bold text-emerald-700">{fmtMoney(ord.total, "USD")}</td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                  <CheckCircle2 className="h-3 w-3" /> Encaissé
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {pages > 1 && (
                      <div className="mt-3 flex flex-wrap items-center justify-center gap-1" aria-label="Pages de l'historique">
                        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setDepositHistoryPage(n)}
                            aria-current={n === page ? "page" : undefined}
                            className={`h-7 min-w-7 rounded-lg px-2 text-xs font-bold ${n === page ? "bg-[#0F3D68] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CLÔTURE JOURNALIÈRE ET BILLETAGE PHYSIQUE                          */}
      {/* ========================================================================= */}
      {activeTab === "closing" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-5 h-5 text-rose-600" />
                Procédure de Clôture de Caisse & Comptage Physique (Billetage)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Renseignez le décompte physique exact des billets en caisse pour comparer avec le solde théorique.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Taux du jour</span>
              <p className="text-xs font-bold text-slate-800">1$ = {exchangeRate} FC</p>
            </div>
          </div>

          {/* Theoretical vs Physical Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-50 border">
              <span className="text-[11px] text-slate-500 font-medium">Solde Théorique USD</span>
              <p className="text-lg font-black text-slate-900 mt-1">{fmtMoney(metrics.balanceUSD, "USD")}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
              <span className="text-[11px] text-blue-700 font-medium">Comptage Physique USD</span>
              <p className="text-lg font-black text-blue-900 mt-1">{fmtMoney(closingPhysicalUSD, "USD")}</p>
              <span className={`text-[10px] font-bold ${diffClosingUSD === 0 ? "text-emerald-600" : "text-rose-600"}`}>
                Écart : {fmtMoney(diffClosingUSD, "USD")}
              </span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border">
              <span className="text-[11px] text-slate-500 font-medium">Solde Théorique CDF</span>
              <p className="text-lg font-black text-slate-900 mt-1">{fmtNum(metrics.balanceCDF)} FC</p>
            </div>
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <span className="text-[11px] text-amber-700 font-medium">Comptage Physique CDF</span>
              <p className="text-lg font-black text-amber-900 mt-1">{fmtNum(closingPhysicalCDF)} FC</p>
              <span className={`text-[10px] font-bold ${diffClosingCDF === 0 ? "text-emerald-600" : "text-rose-600"}`}>
                Écart : {fmtNum(diffClosingCDF)} FC
              </span>
            </div>
          </div>

          {/* Physical Cash Billeting Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
            {/* USD Billetage */}
            <div className="p-4 bg-slate-50 rounded-xl border space-y-3">
              <h4 className="font-bold text-xs text-emerald-800 flex items-center justify-between">
                <span>Coupures en Dollars ($ USD)</span>
                <span>Total : {fmtMoney(closingPhysicalUSD, "USD")}</span>
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {[100, 50, 20, 10, 5, 1].map((val) => (
                  <div key={val} className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block text-center">${val}</label>
                    <Input
                      type="number"
                      min="0"
                      value={closingBilletUSD[String(val)] || ""}
                      onChange={(e) =>
                        setClosingBilletUSD({
                          ...closingBilletUSD,
                          [String(val)]: Math.max(0, parseInt(e.target.value) || 0),
                        })
                      }
                      className="h-8 text-center text-xs"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* CDF Billetage */}
            <div className="p-4 bg-slate-50 rounded-xl border space-y-3">
              <h4 className="font-bold text-xs text-blue-800 flex items-center justify-between">
                <span>Coupures en Francs Congolais (CDF)</span>
                <span>Total : {fmtNum(closingPhysicalCDF)} FC</span>
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {[20000, 10000, 5000, 1000, 500].map((val) => (
                  <div key={val} className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-600 block text-center">{val} FC</label>
                    <Input
                      type="number"
                      min="0"
                      value={closingBilletCDF[String(val)] || ""}
                      onChange={(e) =>
                        setClosingBilletCDF({
                          ...closingBilletCDF,
                          [String(val)]: Math.max(0, parseInt(e.target.value) || 0),
                        })
                      }
                      className="h-8 text-center text-xs"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold">Observations & Remarques de Clôture</Label>
            <Input
              placeholder="Ex: Caisse équilibrée, absence d'écart, remise des clés au DAF..."
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveTab("journal")}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleConfirmCloseSession}
              disabled={submittingClose || !activeSession}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs gap-1.5"
            >
              {submittingClose ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Clôture en cours...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Valider la Clôture & Générer le PV Officiel
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: GESTION DES TAUX (REMPLACE HISTORIQUE DES SESSIONS)                */}
      {/* ========================================================================= */}
      {activeTab === "rates" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-6">
          {/* Header of Rates sub-module */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-[#0F3D68] dark:text-blue-400 flex items-center justify-center font-bold">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Configuration des Taux de Change & Devises (USD / CDF)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Définissez le taux général de conversion, le taux de sortie de caisse, et les taux d'entrée fixes pour chaque catégorie de produits (départements).
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {ratesConfig?.updated_at && (
                <span className="text-[11px] text-slate-400 font-medium hidden md:inline">
                  Mis à jour le {fmtDate(ratesConfig.updated_at)} {ratesConfig.updated_by ? `par ${ratesConfig.updated_by}` : ""}
                </span>
              )}
              <Button
                onClick={handleSaveRates}
                disabled={savingRates}
                className="bg-[#0F3D68] hover:bg-[#0B2F52] text-white font-bold text-xs gap-1.5 shadow-xs"
              >
                {savingRates ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Enregistrer les Taux
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Section 1: Taux de Sortie (le taux est géré par catégorie, section 2) */}
          <div className="grid grid-cols-1 gap-4">
            {/* 2. Taux de Sortie de Caisse */}
            <div className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="w-4 h-4 text-rose-600" />
                  <Label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Taux de Sortie de Caisse (Décaissements)
                  </Label>
                </div>
                <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 text-[10px] font-bold">
                  Sorties & Dépenses
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-400">1 $ =</span>
                <div className="relative flex-1">
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    value={outflowRateInput}
                    onChange={(e) => setOutflowRateInput(e.target.value)}
                    className="h-10 text-base font-black text-rose-700 dark:text-rose-400 pr-12 bg-white dark:bg-slate-800"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    CDF
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Appliqué automatiquement lors des sorties de caisse et dans le formulaire « Enregistrer une sortie ».
              </p>
            </div>
          </div>

          {/* Section 2: Taux d'Entrée par Catégorie de Produits / Départements */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-emerald-600" />
                  Taux d'Entrée Fixes par Catégorie de Produits & Départements
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chaque catégorie dispose de son taux fixe appliqué lors des encaissements et des ventes de la boutique.
                </p>
              </div>

            </div>

            {/* Grid of category entry rates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {(ratesConfig?.categories || [
                "Eau",
                "Jus",
                "Bière",
                "Boisson",
                "Whisky",
                "Vin",
                "Produits",
                "Maize Mill",
                "Boissons (Premidis)",
                "Produits Alimentaires",
                "Direction Générale",
              ]).map((catName: string) => {
                const currentVal = categoryRatesInput[catName] || generalRateInput || "2500";
                const isDifferent = currentVal !== generalRateInput;

                return (
                  <div
                    key={catName}
                    className={`p-3.5 rounded-xl border bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5 transition-all ${
                      isDifferent
                        ? "border-blue-300 dark:border-blue-700 ring-1 ring-blue-100 dark:ring-blue-900/30"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                        {catName}
                      </span>
                      {isDifferent ? (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                          Taux spécifique
                        </span>
                      ) : (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                          Taux par défaut
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">1 $ =</span>
                      <div className="relative flex-1">
                        <Input
                          type="number"
                          step="1"
                          min="1"
                          value={currentVal}
                          onChange={(e) => {
                            setCategoryRatesInput({
                              ...categoryRatesInput,
                              [catName]: e.target.value,
                            });
                          }}
                          className="h-8 text-xs font-bold text-slate-900 dark:text-slate-100 pr-10 bg-white dark:bg-slate-900"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                          FC
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 border-t border-slate-200/60 dark:border-slate-700/60">
                      <span>Exemple 10 $ :</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {Math.round(10 * (parseFloat(currentVal) || 2500)).toLocaleString("fr-FR")} FC
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Règles de Gestion et Audit */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
            <h5 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Règles d'application des taux dans l'ERP
            </h5>
            <ul className="space-y-1 text-slate-600 dark:text-slate-400 pl-6 list-disc text-[11px]">
              <li>
                <strong>Taux d'Entrée :</strong> chaque mouvement d'encaissement applique automatiquement le taux fixe lié à son département ou à la catégorie de produits concernée.
              </li>
              <li>
                <strong>Taux de Sortie :</strong> appliqué automatiquement lors des décaissements et dépenses de caisse pour une valorisation rigoureuse des sorties.
              </li>
              <li>
                <strong>Module Boutique :</strong> le taux de chaque catégorie est affiché sous les prix en USD et en CDF, et détermine le prix en francs congolais en temps réel.
              </li>
              <li>
                <strong>Intégrité comptable :</strong> la modification des taux ne s'applique qu'aux opérations futures et n'altère en aucun cas les écritures historiques déjà enregistrées.
              </li>
            </ul>
          </div>

          {/* Bottom Save Action Bar */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (ratesConfig) {
                  setGeneralRateInput(String(ratesConfig.general_rate || 2500));
                  setOutflowRateInput(String(ratesConfig.outflow_rate || ratesConfig.general_rate || 2500));
                  const catMap: Record<string, string> = {};
                  if (ratesConfig.category_rates) {
                    Object.entries(ratesConfig.category_rates).forEach(([k, v]) => {
                      catMap[k] = String(v);
                    });
                  }
                  setCategoryRatesInput(catMap);
                  toast.info("Valeurs réinitialisées aux données enregistrées");
                }
              }}
              disabled={savingRates}
              className="text-xs"
            >
              Rétablir les valeurs enregistrées
            </Button>
            <Button
              onClick={handleSaveRates}
              disabled={savingRates}
              className="bg-[#0F3D68] hover:bg-[#0B2F52] text-white font-bold text-xs gap-1.5"
            >
              {savingRates ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Enregistrement en cours...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Enregistrer et appliquer les Taux
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      </>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ENREGISTRER UNE ENTRÉE (COMPOSANT InflowModal D'ORIGINE DU ZIP)     */}
      {/* ========================================================================= */}
      <InflowModal
        isOpen={isInflowOpen}
        onClose={() => setIsInflowOpen(false)}
        marketers={marketersList}
        clients={clients}
        debts={debts}
        exchangeRate={exchangeRate}
        userName={user?.full_name || "Caissier"}
        onOpenBilletageForOrder={(ord) => {
          setSelectedOrderForBilletage(ord);
          setOrderBilletUSD({ "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "1": 0 });
          setOrderBilletCDF({ "20000": 0, "10000": 0, "5000": 0, "1000": 0, "500": 0 });
          setIsInflowOpen(false);
        }}
        onSuccessSlip={(receiptData, url, title) => {
          setSlipModalData({ receiptData, url, title });
        }}
        onRefresh={loadData}
      />

      {/* ========================================================================= */}
      {/* MODAL: ENREGISTRER UNE SORTIE (NOUVELLE FONCTIONNALITÉ CONSERVÉE DU PROMPT) */}
      {/* ========================================================================= */}
      <OutflowModal
        isOpen={isOutflowOpen}
        onClose={() => setIsOutflowOpen(false)}
        exchangeRate={exchangeRate}
        userName={user?.full_name || "Caissier"}
        department={user?.department || "Caisse Centrale"}
        onSuccess={(createdOp, docUrl, docName) => {
          loadData();
          // Optionally trigger official print voucher
          if (createdOp) {
            handlePrintReceipt(createdOp);
          }
        }}
      />

      {/* ========================================================================= */}
      {/* MODAL: BILLETAGE PHYSQIUE D'UNE COMMANDE MARKETEUR                        */}
      {/* ========================================================================= */}
      {selectedOrderForBilletage && (
        <Dialog open={Boolean(selectedOrderForBilletage)} onOpenChange={() => setSelectedOrderForBilletage(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center justify-between">
                <span>Encaissement Commande : {selectedOrderForBilletage.code}</span>
                <span className="text-sm font-bold text-emerald-600">
                  {fmtMoney(selectedOrderForBilletage.total, "USD")}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Client : <strong>{selectedOrderForBilletage.client_name}</strong> | Marketeur :{" "}
                <strong>{selectedOrderForBilletage.marketer_name || "Ventes"}</strong>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border text-xs">
                <div>
                  <span className="font-bold text-emerald-800 block mb-1">Coupures USD</span>
                  {[100, 50, 20, 10, 5, 1].map((val) => (
                    <div key={val} className="flex justify-between items-center py-0.5">
                      <span>${val}</span>
                      <Input
                        type="number"
                        min="0"
                        value={orderBilletUSD[String(val)] || ""}
                        onChange={(e) =>
                          setOrderBilletUSD({
                            ...orderBilletUSD,
                            [String(val)]: Math.max(0, parseInt(e.target.value) || 0),
                          })
                        }
                        className="h-6 w-16 text-center text-xs"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <span className="font-bold text-blue-800 block mb-1">Coupures CDF</span>
                  {[20000, 10000, 5000, 1000, 500].map((val) => (
                    <div key={val} className="flex justify-between items-center py-0.5">
                      <span>{val} FC</span>
                      <Input
                        type="number"
                        min="0"
                        value={orderBilletCDF[String(val)] || ""}
                        onChange={(e) =>
                          setOrderBilletCDF({
                            ...orderBilletCDF,
                            [String(val)]: Math.max(0, parseInt(e.target.value) || 0),
                          })
                        }
                        className="h-6 w-16 text-center text-xs"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center text-xs font-bold pt-1">
                <span>Total compté : {fmtMoney(orderBilletCalculatedTotalUSD, "USD")}</span>
                <span
                  className={
                    orderBilletCalculatedTotalUSD >= selectedOrderForBilletage.total
                      ? "text-emerald-600"
                      : "text-amber-600"
                  }
                >
                  {orderBilletCalculatedTotalUSD >= selectedOrderForBilletage.total
                    ? "Montant suffisant"
                    : `Manque : ${fmtMoney(selectedOrderForBilletage.total - orderBilletCalculatedTotalUSD, "USD")}`}
                </span>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setSelectedOrderForBilletage(null)} disabled={approvingOrder}>
                Annuler
              </Button>
              <Button
                onClick={handleApproveOrderDeposit}
                disabled={approvingOrder}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
              >
                {approvingOrder ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                    Validation...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Valider l'Encaissement & Bordereau
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* MODAL: APERÇU ET IMPRESSION DU BORDEREAU / REÇU                          */}
      {/* ========================================================================= */}
      {slipModalData && (
        <Dialog open={Boolean(slipModalData)} onOpenChange={() => setSlipModalData(null)}>
          <DialogContent className="max-w-md text-center p-6 space-y-4">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Opération Enregistrée avec Succès !
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-1">
                {slipModalData.title}
              </DialogDescription>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={() => openDocumentInNativeViewer(slipModalData.url, slipModalData.title)}
                className="bg-[#0F3D68] hover:bg-[#0B2F52] text-white font-bold text-xs gap-1.5"
              >
                <Eye className="w-4 h-4" />
                Ouvrir le Bordereau dans Google Chrome
              </Button>
              <p className="text-[11px] text-slate-500">Téléchargement et impression depuis le visualiseur PDF de Chrome.</p>
            </div>

            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setSlipModalData(null)} className="w-full text-xs">
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* MODAL: OUVERTURE DE SESSION DE CAISSE                                      */}
      {/* ========================================================================= */}
      <Dialog open={isOpenSessionOpen} onOpenChange={setIsOpenSessionOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleConfirmOpenSession} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Unlock className="w-4 h-4 text-[#0F3D68]" />
                Ouverture de Session Caisse
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <div>
                <Label className="text-xs font-semibold">Fond de caisse initial (USD)</Label>
                <Input
                  type="number"
                  step="any"
                  value={openSessionForm.initial_usd}
                  onChange={(e) => setOpenSessionForm({ ...openSessionForm, initial_usd: e.target.value })}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Fond de caisse initial (CDF)</Label>
                <Input
                  type="number"
                  step="any"
                  value={openSessionForm.initial_cdf}
                  onChange={(e) => setOpenSessionForm({ ...openSessionForm, initial_cdf: e.target.value })}
                  className="mt-1 h-9 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Taux de change de référence (CDF/USD)</Label>
                <Input
                  type="number"
                  value={openSessionForm.exchange_rate}
                  onChange={(e) => setOpenSessionForm({ ...openSessionForm, exchange_rate: e.target.value })}
                  className="mt-1 h-9 text-xs font-bold"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpenSessionOpen(false)} disabled={submittingOpen}>
                Annuler
              </Button>
              <Button type="submit" disabled={submittingOpen} className="bg-[#0F3D68] hover:bg-[#0B2F52] text-white font-semibold text-xs">
                {submittingOpen ? "Ouverture..." : "Confirmer l'Ouverture"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: DÉTAIL D'UNE OPÉRATION DE CAISSE                                   */}
      {/* ========================================================================= */}
      {selectedOperation && (
        <Dialog open={Boolean(selectedOperation)} onOpenChange={() => setSelectedOperation(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center justify-between">
                <span>Détail Opération {selectedOperation.reference}</span>
                {selectedOperation.type === "out" ? (
                  <Badge className="bg-rose-50 text-rose-700 border-rose-200">Sortie</Badge>
                ) : (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Entrée</Badge>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3.5 text-xs py-2">
              <div className="p-3 rounded-lg bg-slate-50 border flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-slate-500 uppercase">Montant Enregistré</p>
                  <p
                    className={`text-xl font-black ${
                      selectedOperation.type === "out" ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {fmtMoney(selectedOperation.amount, selectedOperation.currency)}
                  </p>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <p>Taux de change</p>
                  <p className="font-semibold text-slate-700">
                    1$ = {selectedOperation.exchange_rate || exchangeRate} FC
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 block">Catégorie</span>
                  <span className="font-semibold text-slate-800">{selectedOperation.category}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">
                    {selectedOperation.type === "out" ? "Bénéficiaire" : "Client / Versant"}
                  </span>
                  <span className="font-semibold text-slate-800">
                    {selectedOperation.beneficiary || selectedOperation.client_name || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Autorisé par</span>
                  <span className="font-semibold text-blue-600">
                    {selectedOperation.authorized_by || "Non spécifié"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Enregistré par</span>
                  <span className="font-semibold text-slate-800">
                    {selectedOperation.created_by || "Caissier"}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block">Motif</span>
                <p className="font-medium text-slate-800 mt-0.5 p-2 rounded bg-slate-50 border">
                  {selectedOperation.reason || "—"}
                </p>
              </div>

              {/* Pièce Justificative */}
              {selectedOperation.document_url && (
                <div className="p-3 rounded-lg border border-blue-200 bg-blue-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 truncate">
                    <FileCheck className="w-5 h-5 text-blue-600 shrink-0" />
                    <div className="truncate">
                      <p className="font-bold text-slate-900 truncate">
                        {selectedOperation.document_name || "Pièce justificative scannée"}
                      </p>
                      <p className="text-[10px] text-slate-500">Document attaché à l'opération</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleViewDocument(selectedOperation)}
                    className="bg-[#0F3D68] hover:bg-[#0B2F52] text-white text-xs gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Voir dans Chrome
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => handlePrintReceipt(selectedOperation)}
                className="gap-1.5 text-xs"
              >
                <Printer className="w-4 h-4 text-slate-500" />
                Imprimer le Reçu
              </Button>
              <Button variant="ghost" onClick={() => setSelectedOperation(null)} className="text-xs">
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
