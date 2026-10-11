import React, { useEffect, useState, useMemo } from "react";
import { MULTI_SITE } from "@/app/edition";
import { toast } from "sonner";
import {
  BarChart3,
  ShoppingCart,
  Users,
  Loader2,
  FileSpreadsheet,
  Printer,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Search,
  FileText,
  Lock,
  Coins,
  AlertCircle,
  Eye,
  Layers,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { PageHeader, fmtMoney, fmtDate } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  generateCashClosingReceiptPdf,
  generateCashReceiptPdf,
  CashClosingReceiptData,
  CashReceiptData,
} from "@/lib/generateCashReceiptPdf";
import { openDocumentUrl, openDocumentInNativeViewer, saveFile, openPendingTab, closeTab, presentDocument } from "@/lib/documentViewer";
import { exportReceivablesPdf } from "@/lib/exportReceivablesPdf";
import { exportTablePdf } from "@/lib/exportTablePdf";
import { useAuth } from "@/contexts/AuthContext";
import SalesSheets from "@/components/reports/SalesSheets";
import OverviewDashboard from "@/components/reports/OverviewDashboard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { LOGO_ALT, LOGO_SRC } from "@/app/brand";

export default function ReportsPage() {
  const { user, has } = useAuth();
  // Données du Livre de caisse : uniquement avec la permission correspondante (sinon jamais chargées)
  const canCash = has("reports.cash") || has("cash.read");
  const none = Promise.resolve({ data: [] as any });
  const [data, setData] = useState<any>(null);
  // Rapport des créances clients (une ligne par dette restante)
  const [receivables, setReceivables] = useState<any[]>([]);
  const [exportingReceivables, setExportingReceivables] = useState(false);
  const [exportingCash, setExportingCash] = useState(false);
  // Journal des mouvements : tous, seulement les entrées ou seulement les sorties (affichage et export)
  const [cashFlow, setCashFlow] = useState<"all" | "in" | "out">("all");
  const [loading, setLoading] = useState(true);
  // Période initiale : ?period=day|week|month|year (lien « Bénéfice net réel » du tableau de bord), sinon le mois
  const [period, setPeriod] = useState(() => {
    const p = new URLSearchParams(window.location.search).get("period");
    return p && ["day", "week", "month", "year"].includes(p) ? p : "month";
  });
  const [activeTab, setActiveTab] = useState<
    "overview" | "sales" | "cash" | "credits"
  >("overview");
  const [selectedBU, setSelectedBU] = useState("all");
  // Filtre par site (ou tous les sites en commun)
  const [selectedSite, setSelectedSite] = useState("all");
  const [siteMap, setSiteMap] = useState<any>(null);
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
        canCash ? api.get("/cash/operations") : none,
        api.get("/credits"),
        api.get("/integration/catalog"),
        canCash ? api.get("/cash/sessions") : none,
        canCash ? api.get("/cash/active-session") : Promise.resolve({ data: null as any }),
      ]);
      setData(repRes.data);
      setOrders(Array.isArray(ordRes.data) ? ordRes.data : []);
      setCashOps(Array.isArray(cashRes.data) ? cashRes.data : []);
      setCredits(Array.isArray(crdRes.data) ? crdRes.data : []);
      api
        .get("/reports/site-map")
        .then(({ data }) => setSiteMap(data))
        .catch(() => setSiteMap(null));
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

  // Période choisie en haut de page (Aujourd'hui / Semaine / Mois / Année) : appliquée à tous les chiffres
  const inPeriod = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    if (period === "day") return d.toDateString() === now.toDateString();
    if (period === "week") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // lundi
      return d >= start && d <= now;
    }
    if (period === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    return d.getFullYear() === now.getFullYear();
  };
  // Période précédente de même nature (hier, semaine / mois / année précédents) pour les variations des indicateurs
  const inPrevPeriod = (dateStr?: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    let start: Date;
    let end: Date;
    if (period === "day") {
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      start = new Date(end);
      start.setDate(start.getDate() - 1);
    } else if (period === "week") {
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end.setDate(end.getDate() - ((end.getDay() + 6) % 7));
      start = new Date(end);
      start.setDate(start.getDate() - 7);
    } else if (period === "month") {
      end = new Date(now.getFullYear(), now.getMonth(), 1);
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    } else {
      end = new Date(now.getFullYear(), 0, 1);
      start = new Date(now.getFullYear() - 1, 0, 1);
    }
    return d >= start && d < end;
  };
  const prevPeriodLabel = ({ day: "vs hier", week: "vs semaine précédente", month: "vs mois précédent", year: "vs année précédente" } as Record<string, string>)[period] || "vs période précédente";
  const periodLabel = ({ day: "Aujourd'hui", week: "Cette semaine", month: "Ce mois", year: "Cette année" } as Record<string, string>)[period] || period;

  const inSite = (kind: "orders" | "cash" | "credits", id: string) =>
    selectedSite === "all" || !siteMap || siteMap[kind]?.[id] === selectedSite;
  const siteName = selectedSite === "all" ? "Tous les sites" : siteMap?.sites?.find((x: any) => x.id === selectedSite)?.name || "Site";

  const selectOrders = (inRange: (d?: string) => boolean) => {
    let list = orders.filter((o) => o.status !== "cancelled" && inRange(o.approved_at || o.created_at) && inSite("orders", o.id));
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
  };
  const filteredOrders = useMemo(() => selectOrders(inPeriod), [orders, selectedBU, search, period, selectedSite, siteMap]);
  const prevOrders = useMemo(() => selectOrders(inPrevPeriod), [orders, selectedBU, search, period, selectedSite, siteMap]);
  const anyDate = (d?: string) => !!d;
  const allTimeOrders = useMemo(() => selectOrders(anyDate), [orders, selectedBU, search, selectedSite, siteMap]);

  const selectCashOps = (inRange: (d?: string) => boolean) => {
    let list = cashOps.filter((op) => inRange(op.created_at) && inSite("cash", op.id));
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
  };
  const filteredCashOps = useMemo(() => selectCashOps(inPeriod), [cashOps, search, period, selectedSite, siteMap]);
  const prevCashOps = useMemo(() => selectCashOps(inPrevPeriod), [cashOps, search, period, selectedSite, siteMap]);
  const allTimeCashOps = useMemo(() => selectCashOps(anyDate), [cashOps, search, selectedSite, siteMap]);
  const siteNameOfOrder = (o: any) => {
    const id = siteMap?.orders?.[o.id] || siteMap?.main_site;
    return siteMap?.sites?.find((x: any) => x.id === id)?.name || "Site principal";
  };
  // Une clôture de caisse appartient au site d'affectation de la caissière
  const periodSessions = useMemo(
    () =>
      cashSessions.filter(
        (s) => inPeriod(s.closed_at || s.opened_at) && (selectedSite === "all" || !siteMap || (siteMap.sessions?.[s.id] ?? siteMap.main_site) === selectedSite)
      ),
    [cashSessions, period, selectedSite, siteMap]
  );
  const journalOps = useMemo(() => (cashFlow === "all" ? filteredCashOps : filteredCashOps.filter((op) => op.type === cashFlow)), [filteredCashOps, cashFlow]);
  const periodCashInUSD = filteredCashOps.filter((c) => c.type === "in").reduce((s, c) => s + (c.amount_usd || (c.currency === "USD" ? c.amount : c.amount / (c.exchange_rate || 2500))), 0);
  const periodCashOutUSD = filteredCashOps.filter((c) => c.type === "out").reduce((s, c) => s + (c.amount_usd || (c.currency === "USD" ? c.amount : c.amount / (c.exchange_rate || 2500))), 0);
  // Indicateurs de la vue d'ensemble : chiffre d'affaires, bénéfice brut (prix de vente − prix de revient),
  // dépenses de caisse (sorties) et bénéfice net réel (bénéfice brut − dépenses de caisse)
  const opUsd = (c: any) => c.amount_usd || (c.currency === "USD" ? c.amount : c.amount / (c.exchange_rate || 2500));
  const costById = useMemo(() => new Map(products.map((p) => [p.id, Number(p.cost_price) || 0])), [products]);
  const grossOf = (list: any[]) =>
    list.reduce(
      (s, o) => s + (o.items || []).reduce((t: number, it: any) => t + (Number(it.quantity) || 0) * ((Number(it.unit_price) || 0) - (costById.get(it.product_id) || 0)), 0),
      0
    );
  const kpiCur = useMemo(() => {
    const sales = filteredOrders.reduce((s, o) => s + (o.total || 0), 0);
    const gross = grossOf(filteredOrders);
    const expenses = filteredCashOps.filter((c) => c.type === "out").reduce((s, c) => s + opUsd(c), 0);
    return { sales, gross, expenses, net: gross - expenses };
  }, [filteredOrders, filteredCashOps, costById]);
  const kpiPrev = useMemo(() => {
    const sales = prevOrders.reduce((s, o) => s + (o.total || 0), 0);
    const gross = grossOf(prevOrders);
    const expenses = prevCashOps.filter((c) => c.type === "out").reduce((s, c) => s + opUsd(c), 0);
    return { sales, gross, expenses, net: gross - expenses };
  }, [prevOrders, prevCashOps, costById]);

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
    // Mêmes créances que le module Crédits : toutes les dettes en cours, rattachées au même site
    return receivables
      .filter((r) => selectedSite === "all" || r.site_id === selectedSite)
      .filter((r) => !q || [r.client_name, r.marketer_name, r.client_phone].some((x) => x && String(x).toLowerCase().includes(q)));
  }, [receivables, search, selectedSite]);
  const receivablesTotal = filteredReceivables.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const handleExportReceivables = async () => {
    // L'onglet du visualiseur PDF est ouvert pendant le clic (sinon Chrome le bloque)
    const tab = openPendingTab("Rapport des créances clients");
    setExportingReceivables(true);
    try {
      const ok = await exportReceivablesPdf({
        rows: filteredReceivables,
        editedBy: user?.full_name || "Utilisateur",
        filtersLabel: `${MULTI_SITE ? `${siteName} · ` : ""}créances en cours${search.trim() ? ` · recherche « ${search.trim()} »` : ""}`,
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

  const sessionSiteName = (sess: any) => {
    const id = sess.site_id || siteMap?.sessions?.[sess.id] || siteMap?.main_site;
    return sess.site_name || siteMap?.sites?.find((x: any) => x.id === id)?.name || "Site principal";
  };

  // Export PDF du sous-module affiché du Livre de Caisse (mêmes lignes et colonnes que le tableau)
  const handleExportCash = async () => {
    const closings = cashSubTab === "closings";
    const tab = openPendingTab(closings ? "Clôtures & Billetages" : cashFlow === "in" ? "Entrées de caisse" : cashFlow === "out" ? "Sorties de caisse" : "Journal des mouvements de caisse");
    setExportingCash(true);
    const RED: [number, number, number] = [190, 18, 60];
    const GREEN: [number, number, number] = [4, 120, 87];
    const filtersLabel = `${MULTI_SITE ? `${siteName} · ` : ""}${periodLabel}${search.trim() ? ` · recherche « ${search.trim()} »` : ""}`;
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      let ok: boolean;
      if (closings) {
        let expUsd = 0;
        let realUsd = 0;
        let realCdf = 0;
        const rows = periodSessions.map((sess) => {
          const expected = Number(sess.theoretical_balance_usd || sess.actual_balance_usd || 0);
          const real = Number(sess.actual_balance_usd || 0);
          const gap = real - expected;
          expUsd += expected;
          realUsd += real;
          realCdf += Number(sess.actual_balance_cdf || 0);
          return [
            fmtDate(sess.opened_at, true),
            sess.closed_at ? fmtDate(sess.closed_at, true) : "-",
            sess.closed_by || sess.opened_by_name || "-",
            ...(MULTI_SITE ? [sessionSiteName(sess)] : []),
            fmtMoney(expected, "USD"),
            fmtMoney(real, "USD"),
            fmtMoney(sess.actual_balance_cdf || 0, "CDF"),
            Math.abs(gap) < 0.005 ? "Équilibrée" : `${gap > 0 ? "+" : ""}${fmtMoney(gap, "USD")}`,
            sess.discrepancy_reason || "-",
          ];
        });
        ok = await exportTablePdf({
          title: "CLÔTURES & BILLETAGES DE CAISSE",
          fileName: `Clotures_Billetages_PREMIDIS_${stamp}.pdf`,
          columns: [
            { label: "Session", weight: 1.1, bold: true },
            { label: "Clôture", weight: 1.1 },
            { label: "Caissier", weight: 1.2, bold: true },
            ...(MULTI_SITE ? [{ label: "Site", weight: 1 }] : []),
            { label: "Solde attendu", weight: 1, right: true },
            { label: "Billetage réel USD", weight: 1.1, right: true, color: () => GREEN },
            { label: "Billetage réel CDF", weight: 1.2, right: true },
            { label: "Écart", weight: 0.9, color: (r) => (r[MULTI_SITE ? 7 : 6] === "Équilibrée" ? GREEN : RED) },
            { label: "Motif", weight: 1.5 },
          ],
          rows,
          editedBy: user?.full_name || "Utilisateur",
          filtersLabel,
          countLabel: "Clôtures",
          totals: [
            { label: "TOTAL SOLDE ATTENDU :", value: fmtMoney(expUsd, "USD") },
            { label: "TOTAL BILLETAGE RÉEL :", value: fmtMoney(realUsd, "USD") },
            { label: "TOTAL BILLETAGE RÉEL CDF :", value: fmtMoney(realCdf, "CDF") },
          ],
          emptyLabel: "Aucune clôture de caisse pour ce filtre.",
          tab,
        });
      } else {
        let inUsd = 0;
        let outUsd = 0;
        const rows = journalOps.map((op) => {
          const isIn = op.type === "in";
          const usd = Number(op.amount_usd || (op.currency === "USD" ? op.amount : op.amount / 2500)) || 0;
          const cdf = Number(op.amount_cdf || (op.currency === "CDF" ? op.amount : op.amount * 2500)) || 0;
          if (isIn) inUsd += usd;
          else outUsd += usd;
          return [
            op.reference || "CSH",
            fmtDate(op.created_at, true),
            isIn ? "Entrée" : "Sortie",
            op.reason || op.category || "-",
            `${isIn ? "+" : "-"} ${fmtMoney(usd, "USD")}`,
            fmtMoney(cdf, "CDF"),
            op.created_by || "Caisse Principale",
            isIn ? "Bordereau d'entrée" : "Bordereau de sortie",
          ];
        });
        ok = await exportTablePdf({
          title: cashFlow === "in" ? "JOURNAL DES ENTRÉES DE CAISSE" : cashFlow === "out" ? "JOURNAL DES SORTIES DE CAISSE" : "JOURNAL DES MOUVEMENTS DE CAISSE",
          fileName: `Journal_${cashFlow === "in" ? "Entrees" : cashFlow === "out" ? "Sorties" : "Mouvements"}_Caisse_PREMIDIS_${stamp}.pdf`,
          columns: [
            { label: "Réf", weight: 1.1, bold: true },
            { label: "Date", weight: 1.1 },
            { label: "Type", weight: 0.7, bold: true, color: (r) => (r[2] === "Entrée" ? GREEN : RED) },
            { label: "Motif / Libellé", weight: 2.2 },
            { label: "Montant USD", weight: 1.1, right: true, bold: true, color: (r) => (r[2] === "Entrée" ? GREEN : RED) },
            { label: "Montant CDF", weight: 1.3, right: true },
            { label: "Caissier", weight: 1.2 },
            { label: "Bordereau", weight: 1.1 },
          ],
          rows,
          editedBy: user?.full_name || "Utilisateur",
          filtersLabel,
          countLabel: cashFlow === "in" ? "Entrées" : cashFlow === "out" ? "Sorties" : "Mouvements",
          totals:
            cashFlow === "in"
              ? [{ label: "TOTAL ENTRÉES :", value: fmtMoney(inUsd, "USD") }]
              : cashFlow === "out"
              ? [{ label: "TOTAL SORTIES :", value: fmtMoney(outUsd, "USD") }]
              : [
                  { label: "TOTAL ENTRÉES :", value: fmtMoney(inUsd, "USD") },
                  { label: "TOTAL SORTIES :", value: fmtMoney(outUsd, "USD") },
                  { label: "SOLDE DE LA PÉRIODE :", value: fmtMoney(inUsd - outUsd, "USD") },
                ],
          emptyLabel: cashFlow === "in" ? "Aucune entrée de caisse pour ce filtre." : cashFlow === "out" ? "Aucune sortie de caisse pour ce filtre." : "Aucun mouvement de caisse pour ce filtre.",
          tab,
        });
      }
      if (!ok) closeTab(tab);
    } catch (err) {
      closeTab(tab);
      toast.error(extractErrorMessage(err, "Export PDF impossible"));
    } finally {
      setExportingCash(false);
    }
  };

  // Document de billetage (bordereau officiel de clôture) ouvert dans le visualiseur
  const openClosingDocument = async (sess: any) => {
    const tab = openPendingTab("Billetage de clôture");
    try {
      if (sess.closing_document_url) {
        closeTab(tab);
        await openDocumentInNativeViewer(sess.closing_document_url, sess.closing_document_name || "Billetage_Cloture.pdf");
        return;
      }
      const ops = cashOps.filter((o) => o.session_id === sess.id);
      const sum = (type: string, cur: "usd" | "cdf") =>
        ops
          .filter((o) => o.type === type)
          .reduce((s, o) => s + (cur === "usd" ? o.amount_usd ?? (o.currency === "USD" ? o.amount : o.amount / (o.exchange_rate || 2500)) : o.amount_cdf ?? (o.currency === "CDF" ? o.amount : 0)), 0);
      const rate = Number(sess.exchange_rate) || 2500;
      const initUsd = sess.initial_balance_usd ?? sess.initial_balance ?? 0;
      const initCdf = sess.initial_balance_cdf || 0;
      const inUsd = sum("in", "usd"), outUsd = sum("out", "usd"), inCdf = sum("in", "cdf"), outCdf = sum("out", "cdf");
      const theoUsd = sess.theoretical_balance_usd || initUsd + inUsd - outUsd;
      const theoCdf = sess.theoretical_balance_cdf || initCdf + inCdf - outCdf;
      const actUsd = Number(sess.actual_balance_usd) || 0;
      const actCdf = Number(sess.actual_balance_cdf) || 0;
      const { doc, fileName } = await generateCashClosingReceiptPdf({
        sessionReference: `CLOT-${String(sess.id).slice(0, 6).toUpperCase()}`,
        sessionId: sess.id,
        openedAt: sess.opened_at,
        closedAt: sess.closed_at || new Date(),
        agentName: sess.closed_by || sess.opened_by_name || "Caissier",
        department: sess.department || "Caisse Centrale Goma",
        exchangeRate: rate,
        initialBalanceUSD: initUsd,
        initialBalanceCDF: initCdf,
        totalInUSD: inUsd,
        totalInCDF: inCdf,
        totalOutUSD: outUsd,
        totalOutCDF: outCdf,
        theoreticalBalanceUSD: theoUsd,
        theoreticalBalanceCDF: theoCdf,
        actualBalanceUSD: actUsd,
        actualBalanceCDF: actCdf,
        differenceUSD: sess.difference_usd ?? actUsd - theoUsd,
        differenceCDF: sess.difference_cdf ?? actCdf - theoCdf,
        discrepancyReason: sess.discrepancy_reason || undefined,
        billetage: sess.closing_billetage || { usd: {}, cdf: {}, total_usd: actUsd, total_cdf: actCdf, exchange_rate: rate },
      });
      if (!(await presentDocument(doc.output("blob"), fileName, tab))) closeTab(tab);
    } catch (err) {
      closeTab(tab);
      toast.error(extractErrorMessage(err, "Impossible d'ouvrir le document de billetage"));
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
    ];

    const csv = "\uFEFF" + lines.map((e) => e.join(";")).join("\n");
    // Téléchargement réel ; la notification vient de saveFile, après réussite
    saveFile(new Blob([csv], { type: "text/csv" }), `Rapport_PREMIDIS_${period}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="space-y-5 pb-16">
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-[88px] rounded-xl logo-tile border border-slate-200 flex items-center justify-center p-1 shadow-sm" data-report-logo>
            <img src={LOGO_SRC} alt={LOGO_ALT} className="max-h-full max-w-full object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-brand tracking-widest uppercase">
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
          {MULTI_SITE && (
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            aria-label="Site"
            className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700"
          >
            <option value="all">Tous les sites</option>
            {(siteMap?.sites || []).map((x: any) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          )}
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
        </div>
      </div>

      {/* 4 MAIN METRIC CARDS : chiffre d'affaires, bénéfice brut, dépenses de caisse, bénéfice net réel (en-tête de la Vue d'ensemble) */}
      {activeTab === "overview" ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {([
          { key: "sales", label: "Chiffre d'affaires (ventes)", icon: ShoppingCart, tone: "emerald", badge: `${filteredOrders.length} Cmds`, sub: null, goodUp: true },
          { key: "gross", label: "Bénéfice brut", icon: Layers, tone: "blue", badge: null, sub: "Ventes − prix de revient", goodUp: true },
          { key: "expenses", label: "Dépenses de caisse", icon: Wallet, tone: "amber", badge: null, sub: "Sorties de caisse de la période", goodUp: false },
          { key: "net", label: "Bénéfice net réel", icon: TrendingUp, tone: "purple", badge: null, sub: "Bénéfice brut − dépenses de caisse", goodUp: true },
        ] as const).map((k) => {
          const Icon = k.icon;
          const cur = kpiCur[k.key];
          const prev = kpiPrev[k.key];
          const pct = Math.abs(prev) > 0.004 ? ((cur - prev) / Math.abs(prev)) * 100 : null;
          const up = pct !== null && pct >= 0;
          const good = pct === null ? null : up === k.goodUp;
          const tones = {
            emerald: ["border-emerald-200 from-emerald-50/80", "text-emerald-800", "text-emerald-600", "text-emerald-700", "bg-emerald-100 text-emerald-800"],
            blue: ["border-blue-200 from-blue-50/80", "text-blue-800", "text-blue-600", "text-blue-700", "bg-blue-100 text-blue-800"],
            amber: ["border-amber-200 from-amber-50/80", "text-amber-800", "text-amber-600", "text-amber-700", "bg-amber-100 text-amber-800"],
            purple: ["border-purple-200 from-purple-50/80", "text-purple-800", "text-purple-600", "text-purple-700", "bg-purple-100 text-purple-800"],
          }[k.tone];
          return (
            <div key={k.key} data-kpi={k.key} className={`rounded-2xl border bg-gradient-to-br to-white p-4 shadow-xs space-y-3 ${tones[0]}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${tones[1]}`}>
                  <Icon className={`h-4 w-4 ${tones[2]}`} /> {k.label}
                </span>
                {k.badge && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${tones[4]}`}>{k.badge}</span>}
              </div>
              <div>
                <div className={`text-2xl font-black tracking-tight ${cur < 0 ? "text-red-600" : tones[3]}`}>{fmtMoney(cur)}</div>
                {k.sub && <div className="text-[11px] text-slate-500 font-medium">{k.sub}</div>}
                <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                  {pct === null ? (
                    <span className="font-semibold text-slate-400">—</span>
                  ) : (
                    <span className={`inline-flex items-center gap-0.5 font-bold ${good ? "text-emerald-700" : "text-red-600"}`}>
                      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {up ? "+" : "−"}
                      {Math.abs(pct).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%
                    </span>
                  )}
                  <span>{prevPeriodLabel}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      ) : (
        /* En-tête des autres sous-modules : ventes, caisse disponible, créances, ventes payées */
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
            <div className="text-[11px] text-slate-500 font-medium">
              {periodLabel} : <span className="text-emerald-700 font-semibold">+{fmtMoney(periodCashInUSD)}</span> ·{" "}
              <span className="text-red-600 font-semibold">−{fmtMoney(periodCashOutUSD)}</span>
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
              {fmtMoney(receivablesTotal)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">Créances clients en cours (module Crédits)</div>
          </div>
        </div>

        <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50/80 to-white p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-purple-800 flex items-center gap-1.5">
              <Coins className="h-4 w-4 text-purple-600" /> VENTES PAYÉES
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
              {totalSales > 0 ? Math.round((totalPaidSales / totalSales) * 100) : 0}%
            </span>
          </div>
          <div>
            <div className="text-2xl font-black text-purple-700 tracking-tight">
              {fmtMoney(totalPaidSales)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">Payées au comptant · à crédit {fmtMoney(totalCreditSales)}</div>
          </div>
        </div>
      </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
        {[
          { id: "overview", label: "Vue d'ensemble", icon: BarChart3 },
          { id: "sales", label: "Rapport des Ventes", icon: ShoppingCart, perm: "reports.sales" },
          { id: "cash", label: "Livre de Caisse", icon: Wallet, perm: "reports.cash" },
          { id: "credits", label: "Créances & Marketeurs", icon: Users, perm: "reports.credits" },
        ].filter((t: any) => !t.perm || has(t.perm)).map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                isActive
                  ? "bg-brand text-white shadow-xs"
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
      ) : activeTab === "cash" && has("reports.cash") ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCashSubTab("closings")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  cashSubTab === "closings"
                    ? "bg-brand text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Lock className="h-3.5 w-3.5" /> Clôtures & Billetages ({periodSessions.length})
              </button>
              <button
                onClick={() => setCashSubTab("operations")}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  cashSubTab === "operations"
                    ? "bg-brand text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Wallet className="h-3.5 w-3.5" /> Journal des Mouvements ({filteredCashOps.length})
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {cashSubTab === "operations" && (
                <div role="group" aria-label="Entrées / sorties" className="inline-flex rounded-xl bg-slate-100 p-1">
                  {([
                    ["all", "Tous"],
                    ["in", "Entrées"],
                    ["out", "Sorties"],
                  ] as const).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCashFlow(v)}
                      aria-pressed={cashFlow === v}
                      className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                        cashFlow === v
                          ? v === "in"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : v === "out"
                            ? "bg-red-600 text-white shadow-xs"
                            : "bg-brand text-white shadow-xs"
                          : "text-slate-600 hover:bg-white"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
              <div className="text-xs text-slate-500 font-medium">
                Solde Actuel : <strong className="text-emerald-700">{fmtMoney(currentCashUSD, "USD")}</strong> | <strong className="text-blue-700">{fmtMoney(currentCashCDF, "CDF")}</strong>
              </div>
              {has("reports.export") && (
              <Button
                size="sm"
                onClick={handleExportCash}
                disabled={exportingCash}
                className="rounded-xl bg-brand hover:bg-brand-strong text-white text-xs"
              >
                {exportingCash ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
                Exporter en PDF
              </Button>
              )}
            </div>
          </div>

          {cashSubTab === "closings" ? (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="p-3.5">Session</th>
                      <th className="p-3.5">{MULTI_SITE ? "Caissier & Site" : "Caissier"}</th>
                      <th className="p-3.5 text-right">Solde Attendu</th>
                      <th className="p-3.5 text-right">Billetage Réel</th>
                      <th className="p-3.5 text-center">Écart</th>
                      <th className="p-3.5">Motif</th>
                      <th className="p-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {periodSessions.map((sess) => (
                      <tr key={sess.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5">
                          <span className="font-bold text-slate-900 block">{fmtDate(sess.opened_at, true)}</span>
                          {sess.closed_at && (
                            <span className="text-[10px] text-slate-400">Clôturée le {fmtDate(sess.closed_at, true)}</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-slate-800">{sess.closed_by || sess.opened_by_name}</div>
                          {MULTI_SITE && <div className="text-[10px] text-slate-500">{sessionSiteName(sess)}</div>}
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
                            onClick={() => openClosingDocument(sess)}
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
                    {journalOps.map((op) => {
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
                                  : "text-brand border-brand/30 hover:bg-brand/10"
                              }`}
                            >
                              <FileText
                                className={`h-3 w-3 mr-1 ${
                                  !isIn ? "text-rose-600" : "text-brand"
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
      ) : activeTab === "sales" && has("reports.sales") ? (
        <SalesSheets search={search} period={period} includeOrder={(o: any) => inSite("orders", o.id)} siteKey={selectedSite} siteLabel={siteName} />
      ) : activeTab === "credits" && has("reports.credits") ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Rapport des créances clients</h3>
              <p className="text-[11px] text-slate-500">
                {filteredReceivables.length} créance(s) · {new Set(filteredReceivables.map((r) => r.client_id || r.client_name)).size} client(s) débiteur(s) · total dû {fmtMoney(receivablesTotal)}
              </p>
            </div>
            {has("reports.export") && (
            <Button
              size="sm"
              onClick={handleExportReceivables}
              disabled={exportingReceivables}
              className="rounded-xl bg-brand hover:bg-brand-strong text-white text-xs"
            >
              {exportingReceivables ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
              Exporter en PDF
            </Button>
            )}
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
      ) : activeTab === "overview" ? (
        <OverviewDashboard
          orders={allTimeOrders}
          periodOrders={filteredOrders}
          cashOps={allTimeCashOps}
          products={products}
          siteOfOrder={siteNameOfOrder}
          kpiCur={kpiCur}
          kpiPrev={kpiPrev}
          prevLabel={prevPeriodLabel}
        />
      ) : null}

      {/* DIALOG: DETAIL DU BILLETAGE DE CLÔTURE */}
      {viewingBilletageSession && (
        <Dialog open={!!viewingBilletageSession} onOpenChange={() => setViewingBilletageSession(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Coins className="h-5 w-5 text-brand" />
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
