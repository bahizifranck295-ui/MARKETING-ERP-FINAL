import React, { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Package,
  Search,
  Plus,
  Sliders,
  Image as ImageIcon,
  Upload,
  X,
  Edit,
  Loader2,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  FolderTree,
  History,
  LayoutDashboard,
  MapPin,
  PieChart,
  Shapes,
  TrendingUp,
  Warehouse as WarehouseIcon,
  Truck,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { EmptyState, fmtMoney, fmtNum } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  BarsBySite,
  CATEGORY_COLORS,
  Donut,
  EVOLUTION_DAYS,
  Evolution,
  OTHER_COLOR,
  categoryOf,
  computeEvolution,
  costOf,
  stockOf,
  thresholdOf,
} from "@/components/stock/stockCharts";
import { GlassCard, KpiTile, ProductPhoto, StatusPill, stockStatus } from "@/components/stock/ui";
import { CategoriesPanel, CategoryPicker } from "@/components/stock/categories";
import SitesDepotsPanel from "@/components/stock/SitesDepotsPanel";
import NewProductDialog from "@/components/stock/NewProductDialog";
import { MovementsPanel, TransfersPanel } from "@/components/stock/StockHistoryPanels";

const ALL = "all";
const PAGE_SIZE = 8;
const LIVE_REFRESH_S = 15; // tableau de bord en temps réel

// Sous-modules du Stock
type Tab = "dashboard" | "products" | "categories" | "sites" | "transfers" | "movements";
const TABS: Array<{ id: Tab; label: string; icon: any }> = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { id: "products", label: "Produits", icon: Package },
  { id: "categories", label: "Catégories", icon: Shapes },
  { id: "sites", label: "Sites & Dépôts", icon: MapPin },
  { id: "transfers", label: "Transferts", icon: ArrowRightLeft },
  { id: "movements", label: "Mouvements", icon: History },
];

// La rupture fait partie du « Stock faible »
type StatusFilter = "all" | "ok" | "low";
const STATUS_FILTERS: Array<{ id: StatusFilter; label: string; dot?: string }> = [
  { id: "all", label: "Tous" },
  { id: "ok", label: "Normal", dot: "bg-emerald-500" },
  { id: "low", label: "Stock faible", dot: "bg-amber-500" },
];
const statusKey = (p: any) => stockStatus(stockOf(p), thresholdOf(p)).key;

function TreeButton({ active, onClick, children }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
        active ? "bg-gradient-to-r from-cyan-50 to-blue-50 font-semibold text-[#0F3D68] ring-1 ring-cyan-200" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

export default function StockPage() {
  const { has } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adjustingProduct, setAdjustingProduct] = useState<any>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [newProductModal, setNewProductModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Navigation et filtres du module Stock
  const [tab, setTab] = useState<Tab>("dashboard");
  const [orders, setOrders] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  // Marchandise transférée dans les camions des marketeurs (module Livraison)
  const [embarkedSummary, setEmbarkedSummary] = useState<any>(null);
  const [category, setCategory] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  // Onglet Produits : tri par site et par dépôt (inventaire d'un site, d'un dépôt ou général)
  const [prodSite, setProdSite] = useState(ALL);
  const [prodDepot, setProdDepot] = useState(ALL);
  // Tableau de bord : filtres « Stock par dépôt » et ouverture directe d'un site
  const [dashSite, setDashSite] = useState(ALL);
  const [dashDepot, setDashDepot] = useState(ALL);
  const [dashCat, setDashCat] = useState(ALL);
  const [dashSearch, setDashSearch] = useState("");
  const [dashPage, setDashPage] = useState(1);
  const [sitesFocus, setSitesFocus] = useState<{ siteId?: string; depotId?: string; n: number }>({ n: 0 });
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Image upload states
  const [imagePreview, setImagePreview] = useState<string>("");
  const [imageUrlInput, setImageUrlInput] = useState<string>("");

  // Sites, dépôts (avec valeurs) et quantités par dépôt
  const loadStructure = async () => {
    try {
      const [s, d, l] = await Promise.all([api.get("/stock/sites"), api.get("/stock/depots"), api.get("/stock/levels")]);
      setSites(Array.isArray(s.data) ? s.data : []);
      setWarehouses(Array.isArray(d.data) ? d.data : []);
      setLevels(Array.isArray(l.data) ? l.data : []);
      setLastSync(new Date());
      api
        .get("/stock/embarked-summary")
        .then(({ data }) => setEmbarkedSummary(data))
        .catch(() => setEmbarkedSummary(null));
    } catch {
      // le reste de la page reste utilisable
    }
  };

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const prodRes = await api.get("/products");
      setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
      await loadStructure();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur de chargement"));
    } finally {
      if (!silent) setLoading(false);
    }
  };
  // Mise à jour en arrière-plan : garde ouverte la vue en cours (site, dépôt…)
  const refreshInBackground = () => loadData(true);

  // Temps réel : le tableau de bord se recharge seul tant qu'il est affiché
  useEffect(() => {
    if (tab !== "dashboard") return;
    const t = window.setInterval(() => {
      if (document.visibilityState !== "hidden") refreshInBackground();
    }, LIVE_REFRESH_S * 1000);
    return () => window.clearInterval(t);
  }, [tab]);

  const openSites = (siteId?: string, depotId?: string) => {
    setSitesFocus((f) => ({ siteId, depotId, n: f.n + 1 }));
    setTab("sites");
  };

  useEffect(() => {
    loadData();
    // Commandes : uniquement pour la courbe d'évolution (facultatif)
    api
      .get("/orders")
      .then(({ data }) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]));
  }, []);

  const prodScoped = prodSite !== ALL || prodDepot !== ALL;
  const prodQtyMap = useMemo(() => {
    const ids = new Set(
      warehouses.filter((w: any) => (prodSite === ALL || w.site_id === prodSite) && (prodDepot === ALL || w.id === prodDepot)).map((w: any) => w.id)
    );
    const m = new Map<string, { qty: number; depots: number }>();
    levels.forEach((l) => {
      if (!ids.has(l.warehouse_id)) return;
      const cur = m.get(l.product_id) || { qty: 0, depots: 0 };
      const q = Number(l.quantity) || 0;
      m.set(l.product_id, { qty: cur.qty + q, depots: cur.depots + (q > 0 ? 1 : 0) });
    });
    return m;
  }, [levels, warehouses, prodSite, prodDepot]);
  const prodQty = (p: any) => (prodScoped ? prodQtyMap.get(p.id)?.qty || 0 : stockOf(p));
  const prodStatusKey = (p: any) => stockStatus(prodQty(p), thresholdOf(p)).key;

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (prodScoped && prodQty(p) <= 0) return false;
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.size && String(p.size).toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q));
      return matchQ;
    });
  }, [products, search, prodScoped, prodQtyMap]);

  const allCategories = useMemo(() => Array.from(new Set(products.map(categoryOf))).sort(), [products]);

  // Couleur fixe par catégorie (ne change pas quand on filtre)
  const colorByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    products.forEach((p) => totals.set(categoryOf(p), (totals.get(categoryOf(p)) || 0) + stockOf(p) * costOf(p)));
    const m = new Map<string, string>();
    Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([c], i) => m.set(c, CATEGORY_COLORS[i] || OTHER_COLOR));
    return m;
  }, [products]);

  // Nombre de dépôts où chaque produit est présent
  const depotsByProduct = useMemo(() => {
    const m = new Map<string, number>();
    levels.forEach((l) => l.quantity > 0 && m.set(l.product_id, (m.get(l.product_id) || 0) + 1));
    return m;
  }, [levels]);

  /* ----- Périmètre du tableau de bord = filtres de « Stock par dépôt » -----
   * Tous les sites + tous les dépôts : toute l'entreprise (dépôts + camions).
   * Site ou dépôt choisi : uniquement les dépôts concernés (les camions n'en font pas partie).
   * Chaque quantité est comptée une seule fois (stock d'un dépôt OU d'un camion). */
  const isGlobalScope = dashSite === ALL && dashDepot === ALL;
  const embarkedByProduct = useMemo(() => {
    const m = new Map<string, number>();
    (embarkedSummary?.stocks || []).forEach((e: any) => e.items.forEach((i: any) => m.set(i.product_id, (m.get(i.product_id) || 0) + (Number(i.quantity) || 0))));
    return m;
  }, [embarkedSummary]);
  const scopeDepots = useMemo(
    () => warehouses.filter((w) => (dashSite === ALL || w.site_id === dashSite) && (dashDepot === ALL || w.id === dashDepot)),
    [warehouses, dashSite, dashDepot]
  );

  /* ----- Stock par dépôt (tableau de bord) ----- */
  const dashInScope = useMemo(() => {
    const ids = new Set(scopeDepots.map((w) => w.id));
    const agg = new Map<string, { qty: number; depotQty: number; depotIds: string[]; embarked: number }>();
    levels.forEach((l) => {
      if (!ids.has(l.warehouse_id)) return;
      const e = agg.get(l.product_id) || { qty: 0, depotQty: 0, depotIds: [], embarked: 0 };
      e.qty += Number(l.quantity) || 0;
      e.depotQty += Number(l.quantity) || 0;
      e.depotIds.push(l.warehouse_id);
      agg.set(l.product_id, e);
    });
    // Vue globale : tous les produits, avec la marchandise encore dans les camions
    if (isGlobalScope)
      products.forEach((p) => {
        const e = agg.get(p.id) || { qty: 0, depotQty: 0, depotIds: [], embarked: 0 };
        e.embarked = embarkedByProduct.get(p.id) || 0;
        e.qty += e.embarked;
        agg.set(p.id, e);
      });
    const q = dashSearch.trim().toLowerCase();
    return products
      .filter((p) => agg.has(p.id))
      .filter((p) => !q || [p.name, p.code, p.size, p.category].some((x) => x && String(x).toLowerCase().includes(q)))
      .map((p) => ({ p, ...agg.get(p.id)! }))
      .sort((a, b) => a.p.name.localeCompare(b.p.name, "fr"));
  }, [products, scopeDepots, levels, isGlobalScope, embarkedByProduct, dashSearch]);
  const dashCategoryTree = useMemo(() => {
    const m = new Map<string, any[]>();
    dashInScope.forEach((r) => m.set(categoryOf(r.p), [...(m.get(categoryOf(r.p)) || []), r]));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [dashInScope]);
  const dashRows = useMemo(() => dashInScope.filter((r) => dashCat === ALL || categoryOf(r.p) === dashCat), [dashInScope, dashCat]);
  const dashPages = Math.max(1, Math.ceil(dashRows.length / PAGE_SIZE));
  const dashCurPage = Math.min(dashPage, dashPages);
  const dashVisible = dashRows.slice((dashCurPage - 1) * PAGE_SIZE, dashCurPage * PAGE_SIZE);

  /* ----- Indicateurs et graphiques, recalculés sur le périmètre filtré ----- */
  const scopeProductIds = useMemo(() => new Set(dashRows.map((r) => r.p.id)), [dashRows]);
  const totalValue = dashRows.reduce((s, r) => s + r.qty * costOf(r.p), 0);
  const totalUnits = dashRows.reduce((s, r) => s + r.qty, 0);
  const lowCount = dashRows.filter((r) => stockStatus(r.qty, thresholdOf(r.p)).key === "low").length;
  const scopeCategoryCount = new Set(dashRows.map((r) => categoryOf(r.p))).size;
  const scopeSiteCount = isGlobalScope ? sites.length : new Set(scopeDepots.map((w) => w.site_id)).size;
  const scopeDepotCount = scopeDepots.length;
  const scopeLabel = dashDepot !== ALL
    ? `Dépôt ${scopeDepots[0]?.label || scopeDepots[0]?.name || ""}`
    : dashSite !== ALL
    ? `Site ${sites.find((x) => x.id === dashSite)?.name || ""}`
    : "Toute l'entreprise · dépôts + camions";
  const filterLabel = [dashCat !== ALL ? `catégorie ${dashCat}` : "", dashSearch.trim() ? `« ${dashSearch.trim()} »` : ""].filter(Boolean).join(" · ");

  // Valeur par site : quantités des dépôts du périmètre (+ camions en vue globale)
  const depotValue = useMemo(() => {
    const m = new Map<string, number>();
    const ids = new Set(scopeDepots.map((w) => w.id));
    const cost = new Map(products.map((p) => [p.id, costOf(p)]));
    levels.forEach((l) => {
      if (!ids.has(l.warehouse_id) || !scopeProductIds.has(l.product_id)) return;
      m.set(l.warehouse_id, (m.get(l.warehouse_id) || 0) + (Number(l.quantity) || 0) * (cost.get(l.product_id) || 0));
    });
    return m;
  }, [scopeDepots, levels, products, scopeProductIds]);
  const embarkedValue = isGlobalScope ? dashRows.reduce((s, r) => s + r.embarked * costOf(r.p), 0) : 0;
  const bySite = useMemo(() => {
    const m = new Map<string, number>();
    scopeDepots.forEach((w) => m.set(w.site_name || "Sans site", (m.get(w.site_name || "Sans site") || 0) + (depotValue.get(w.id) || 0)));
    const rows = Array.from(m.entries()).map(([site, value]) => ({ site, value }));
    if (embarkedValue > 0) rows.push({ site: "Camions (embarqué)", value: embarkedValue });
    return rows.sort((a, b) => b.value - a.value);
  }, [scopeDepots, depotValue, embarkedValue]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    dashRows.forEach((r) => m.set(categoryOf(r.p), (m.get(categoryOf(r.p)) || 0) + r.qty * costOf(r.p)));
    return Array.from(m.entries())
      .map(([label, value]) => ({ label, value, color: colorByCategory.get(label) || OTHER_COLOR }))
      .sort((a, b) => b.value - a.value);
  }, [dashRows, colorByCategory]);

  const evolution = useMemo(() => computeEvolution(dashRows.map((r) => r.p), orders, totalValue), [dashRows, orders, totalValue]);

  // Cartes « Stock par site » et « Stock embarqué » : même périmètre
  const scopeSites = useMemo(
    () =>
      sites
        .filter((x) => scopeDepots.some((w) => w.site_id === x.id))
        .map((x) => ({
          ...x,
          value: scopeDepots.filter((w) => w.site_id === x.id).reduce((sum, w) => sum + (depotValue.get(w.id) || 0), 0),
          depot_count: scopeDepots.filter((w) => w.site_id === x.id).length,
        })),
    [sites, scopeDepots, depotValue]
  );
  const sitesTotal = scopeSites.reduce((s, x) => s + (Number(x.value) || 0), 0);
  const scopeEmbarked = useMemo(() => {
    if (!embarkedSummary || !isGlobalScope) return null;
    const stocks = embarkedSummary.stocks
      .map((e: any) => {
        const items = e.items.filter((i: any) => scopeProductIds.has(i.product_id));
        const units = items.reduce((s: number, i: any) => s + i.quantity, 0);
        const value = items.reduce((s: number, i: any) => s + i.quantity * costOf(products.find((p) => p.id === i.product_id) || {}), 0);
        return { ...e, items, units, value };
      })
      .filter((e: any) => e.units > 0);
    const embarked = dashRows.reduce((s, r) => s + r.embarked, 0);
    const depots = dashRows.reduce((s, r) => s + r.qty - r.embarked, 0);
    const total = dashRows.reduce((s, r) => s + stockOf(r.p), 0);
    return { stocks, totals: { depots, embarked, total, balanced: depots + embarked === total } };
  }, [embarkedSummary, isGlobalScope, scopeProductIds, dashRows, products]);

  /* ----- Produits ----- */
  const scoped = useMemo(() => filteredProducts.filter((p) => category === ALL || categoryOf(p) === category), [filteredProducts, category]);
  const scopedLow = scoped.filter((p) => prodStatusKey(p) === "low").length;
  const statusCounts: Record<StatusFilter, number> = { all: scoped.length, ok: scoped.length - scopedLow, low: scopedLow };

  const categoryTree = useMemo(() => {
    const m = new Map<string, any[]>();
    filteredProducts.forEach((p) => m.set(categoryOf(p), [...(m.get(categoryOf(p)) || []), p]));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [filteredProducts]);

  const rows = useMemo(
    () => scoped.filter((p) => statusFilter === "all" || prodStatusKey(p) === statusFilter).sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [scoped, statusFilter, prodQtyMap, prodScoped]
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const visible = rows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const showLowStock = () => {
    setStatusFilter("low");
    setCategory(ALL);
    setSearch("");
    setPage(1);
    setTab("products");
  };
  const clearFilters = () => {
    setSearch("");
    setCategory(ALL);
    setStatusFilter("all");
    setPage(1);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("L'image ne doit pas dépasser 4 Mo");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setImageUrlInput("");
    };
    reader.readAsDataURL(file);
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;
    setSaving(true);
    const form = e.target as any;
    const delta = Number(form.elements.delta.value);
    const reason = form.elements.reason.value;
    try {
      await api.post(`/products/${adjustingProduct.id}/adjust`, {
        quantity: delta,
        reason,
      });
      toast.success("Ajustement de stock enregistré");
      setAdjustingProduct(null);
      loadData();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec de l'ajustement"));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setSaving(true);
    const form = e.target as any;
    const sellPrice = Number(form.elements.sell_price.value) || 0;
    const priceFC = form.elements.price_fc?.value
      ? Number(form.elements.price_fc.value)
      : Math.round(sellPrice * 2500);

    const payload = {
      name: form.elements.name.value.trim(),
      code: form.elements.code.value.trim(),
      category: form.elements.category.value.trim(),
      unit: form.elements.unit.value.trim() || "Carton",
      sell_price: sellPrice,
      price_fc: priceFC,
      cost_price: Number(form.elements.cost_price.value) || 0,
      stock: Number(form.elements.stock.value) || 0,
      alert_threshold: Number(form.elements.alert_threshold.value) || 10,
      badge: form.elements.badge?.value?.trim() || undefined,
      image_url: imagePreview || imageUrlInput.trim() || editingProduct.image_url || undefined,
    };

    try {
      await api.put(`/products/${editingProduct.id}`, payload);
      toast.success("Produit et photo mis à jour !");
      setEditingProduct(null);
      setImagePreview("");
      setImageUrlInput("");
      loadData();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec de la modification"));
    } finally {
      setSaving(false);
    }
  };

  const openNewModal = () => {
    setImagePreview("");
    setImageUrlInput("");
    setNewProductModal(true);
  };

  const openEditModal = (prod: any) => {
    setImagePreview(prod.image_url || "");
    setImageUrlInput(prod.image_url || "");
    setEditingProduct(prod);
  };

  return (
    <div className="space-y-4">
      {/* En-tête + navigation du module Stock */}
      <section className="relative overflow-clip rounded-3xl bg-gradient-to-br from-[#081A30] via-[#0F3D68] to-[#0C5A86] p-5 text-white shadow-[0_20px_50px_-25px_rgba(15,61,104,0.8)] sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-400/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_8px_2px_rgba(103,232,249,0.7)]" />
              Stock en direct
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Stock</h1>
            <p className="text-sm text-blue-100/80">Sites → Dépôts → Produits → Quantités → Transferts</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold backdrop-blur">
              <CalendarDays className="h-4 w-4 text-cyan-200" />
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </span>
            {has("stock.write") && (
              <Button
                size="sm"
                onClick={openNewModal}
                className="h-9 rounded-xl bg-cyan-400 px-4 font-bold text-[#06213D] shadow-[0_0_20px_-4px_rgba(34,211,238,0.9)] hover:bg-cyan-300"
              >
                <Plus className="mr-1.5 h-4 w-4" /> Nouveau produit
              </Button>
            )}
          </div>
        </div>
        <nav aria-label="Sous-modules du stock" className="relative -mx-1 mt-5 flex gap-1 overflow-x-auto px-1 pb-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => (t.id === "sites" ? openSites() : setTab(t.id))}
                aria-current={active ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                  active
                    ? "bg-white text-[#0F3D68] shadow-[0_0_18px_-4px_rgba(103,232,249,0.9)]"
                    : "text-blue-100/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </nav>
      </section>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : tab === "dashboard" ? (
        products.length === 0 ? (
          <EmptyState icon={Package} title="Aucun produit en stock" subtitle="Ajoutez votre premier article avec « Nouveau produit »." />
        ) : (
          <>
            {/* Tri du tableau de bord (site, dépôt, catégorie, recherche) : en haut de la page */}
            <div data-dash-filters className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-[11px] font-semibold text-slate-600">
                Site
                <select
                  value={dashSite}
                  onChange={(e) => { setDashSite(e.target.value); setDashDepot(ALL); setDashPage(1); }}
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/25"
                >
                  <option value={ALL}>Tous les sites</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-600">
                Dépôt
                <select
                  value={dashDepot}
                  onChange={(e) => { setDashDepot(e.target.value); setDashPage(1); }}
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/25"
                >
                  <option value={ALL}>Tous les dépôts</option>
                  {warehouses
                    .filter((w) => dashSite === ALL || w.site_id === dashSite)
                    .map((w) => (
                      <option key={w.id} value={w.id}>{dashSite === ALL ? w.label : w.name}</option>
                    ))}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-600">
                Catégorie
                <select
                  value={dashCat}
                  onChange={(e) => { setDashCat(e.target.value); setDashPage(1); }}
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/25"
                >
                  <option value={ALL}>Toutes les catégories</option>
                  {allCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-600">
                Recherche
                <span className="relative mt-1 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={dashSearch}
                    onChange={(e) => { setDashSearch(e.target.value); setDashPage(1); }}
                    placeholder="Rechercher un produit…"
                    className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/25"
                  />
                </span>
              </label>
            </div>
            {/* Indicateurs globaux (la rupture est comptée dans « Stock faible ») */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
              <KpiTile icon={Boxes} glow="from-blue-500 to-indigo-600" label="Total produits" value={fmtNum(dashRows.length)} hint={`${fmtNum(totalUnits)} unités`} />
              <KpiTile icon={Shapes} glow="from-violet-500 to-fuchsia-600" label="Catégories" value={fmtNum(scopeCategoryCount)} hint="Voir les catégories" onClick={() => setTab("categories")} />
              <KpiTile icon={MapPin} glow="from-emerald-500 to-teal-600" label="Sites" value={fmtNum(scopeSiteCount)} hint="Voir les sites" onClick={() => openSites(dashSite !== ALL ? dashSite : undefined)} />
              <KpiTile icon={WarehouseIcon} glow="from-cyan-500 to-sky-600" label="Dépôts" value={fmtNum(scopeDepotCount)} hint="Voir les dépôts" onClick={() => openSites(dashSite !== ALL ? dashSite : undefined, dashDepot !== ALL ? dashDepot : undefined)} />
              <KpiTile
                icon={Database}
                glow="from-[#0F3D68] to-[#1D6FB8]"
                label="Valeur totale du stock"
                value={fmtMoney(totalValue)}
                hint={isGlobalScope ? "Au prix d'achat · dépôts + camions" : "Au prix d'achat · périmètre filtré"}
                className="col-span-2"
                valueClassName="whitespace-nowrap text-[clamp(1.25rem,2.2vw,1.75rem)]"
              />
              <KpiTile icon={AlertTriangle} glow="from-amber-400 to-orange-500" label="Stock faible" value={fmtNum(lowCount)} hint="Voir les produits" onClick={showLowStock} className="col-span-2 xl:col-span-1" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]" aria-live="polite">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 font-semibold text-[#0F3D68]">
                <MapPin className="h-3 w-3" /> Périmètre : {scopeLabel}
                {filterLabel ? ` · ${filterLabel}` : ""}
              </span>
              {(!isGlobalScope || dashCat !== ALL || dashSearch.trim()) && (
                <button
                  type="button"
                  onClick={() => { setDashSite(ALL); setDashDepot(ALL); setDashCat(ALL); setDashSearch(""); setDashPage(1); }}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Vue globale
                </button>
              )}
              {!isGlobalScope && <span className="text-slate-500">Hors stock embarqué (les camions ne font partie d'aucun dépôt)</span>}
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Mise à jour automatique toutes les {LIVE_REFRESH_S} secondes
              {lastSync ? ` · dernière mise à jour à ${lastSync.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
            </p>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <GlassCard title="Valeur du stock par site" icon={BarChart3}>
                <BarsBySite rows={bySite} />
              </GlassCard>
              <GlassCard title="Répartition du stock par catégorie" icon={PieChart}>
                <Donut slices={byCategory} total={totalValue} />
              </GlassCard>
              <GlassCard title={`Évolution du stock (valeur, ${EVOLUTION_DAYS} j)`} icon={TrendingUp}>
                <Evolution points={evolution} />
                <p className="mt-2 text-[11px] text-slate-500">Reconstituée à partir des commandes validées.</p>
              </GlassCard>
            </div>

            {/* Catégories + stock par dépôt */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
              <GlassCard title="Catégories de produits" icon={FolderTree}>
                <ul className="space-y-0.5 text-xs">
                  <li>
                    <TreeButton active={dashCat === ALL} onClick={() => { setDashCat(ALL); setDashPage(1); }}>
                      <FolderTree className="h-3.5 w-3.5" />
                      <span className="flex-1">Toutes</span>
                      <span className="tabular-nums text-slate-500">({dashInScope.length})</span>
                    </TreeButton>
                  </li>
                  {dashCategoryTree.map(([c, items]) => (
                    <li key={c}>
                      <TreeButton active={dashCat === c} onClick={() => { setDashCat(dashCat === c ? ALL : c); setDashPage(1); }}>
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorByCategory.get(c) || OTHER_COLOR }} />
                        <span className="min-w-0 flex-1 truncate">{c}</span>
                        <span className="tabular-nums text-slate-500">({items.length})</span>
                      </TreeButton>
                      {dashCat === c && (
                        <ul className="ml-5 border-l border-cyan-200 py-1 pl-2">
                          {items.map((r: any) => (
                            <li key={r.p.id} className="truncate py-0.5 text-[11px] text-slate-500">
                              {r.p.name}
                              {r.p.size ? ` · ${r.p.size}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </GlassCard>

              <GlassCard title="Stock par dépôt" icon={Boxes}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="px-2.5 py-3 font-semibold">Produit</th>
                        <th className="px-2.5 py-3 font-semibold">Catégorie</th>
                        <th className="px-2.5 py-3 text-right font-semibold">Stock</th>
                        <th className="px-2.5 py-3 text-right font-semibold">Seuil mini</th>
                        <th className="px-2.5 py-3 text-right font-semibold">Valeur</th>
                        <th className="px-2.5 py-3 text-center font-semibold">Statut</th>
                        <th className="px-2.5 py-3 text-center font-semibold">Dépôt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dashVisible.map(({ p, depotQty: qty, depotIds }) => {
                        const single = depotIds.length === 1 ? warehouses.find((w) => w.id === depotIds[0]) : null;
                        return (
                          <tr key={p.id} className="hover:bg-cyan-50/40">
                            <td className="px-2.5 py-3">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <ProductPhoto src={p.image_url} />
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-slate-900">
                                    {p.name}
                                    {p.size && <span className="ml-1.5 rounded-md border border-cyan-200 bg-cyan-50 px-1.5 py-px text-[10px] font-bold text-cyan-800">{p.size}</span>}
                                  </div>
                                  <div className="font-mono text-[10px] text-slate-500">{p.code}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2.5 py-3">
                              <span className="inline-flex items-center gap-1.5 text-slate-600">
                                <span className="h-2 w-2 rounded-full" style={{ background: colorByCategory.get(categoryOf(p)) || OTHER_COLOR }} />
                                {p.category || "Général"}
                              </span>
                            </td>
                            <td className="px-2.5 py-3 text-right font-bold tabular-nums text-slate-900">
                              {fmtNum(qty)} <span className="text-[10px] font-normal text-slate-400">{p.unit}</span>
                            </td>
                            <td className="px-2.5 py-3 text-right tabular-nums text-slate-600">{fmtNum(thresholdOf(p))}</td>
                            <td className="px-2.5 py-3 text-right font-semibold tabular-nums">{fmtMoney(qty * costOf(p))}</td>
                            <td className="px-2.5 py-3 text-center">
                              <StatusPill status={stockStatus(qty, thresholdOf(p))} />
                            </td>
                            <td className="px-2.5 py-3 text-center">
                              {single ? (
                                <button
                                  type="button"
                                  onClick={() => openSites(single.site_id, single.id)}
                                  className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#0F3D68] hover:bg-cyan-50 hover:underline"
                                  title="Ouvrir ce dépôt"
                                >
                                  {single.name}
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-500">{depotIds.length ? `${depotIds.length} dépôts` : "—"}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!dashVisible.length && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-500">Aucun produit dans ce périmètre.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                  <span>
                    Affichage de {dashVisible.length} sur {dashRows.length} produit(s)
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={dashCurPage <= 1} onClick={() => setDashPage(dashCurPage - 1)} aria-label="Page précédente" className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white disabled:opacity-40">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    {Array.from({ length: dashPages }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setDashPage(n)}
                        className={`h-7 min-w-7 rounded-lg px-2 font-semibold ${n === dashCurPage ? "bg-[#0F3D68] text-white" : "border border-slate-200 bg-white text-slate-700"}`}
                      >
                        {n}
                      </button>
                    ))}
                    <button type="button" disabled={dashCurPage >= dashPages} onClick={() => setDashPage(dashCurPage + 1)} aria-label="Page suivante" className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white disabled:opacity-40">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* Stock par site : chaque nouveau site apparaît automatiquement */}
            <GlassCard
              title="Stock par site"
              icon={MapPin}
              right={
                <button type="button" onClick={() => openSites()} className="text-[11px] font-semibold text-[#0F3D68] hover:underline">
                  Voir tous les sites
                </button>
              }
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {scopeSites.map((s) => {
                  const pct = sitesTotal > 0 ? Math.round((s.value / sitesTotal) * 100) : 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openSites(s.id)}
                      title={`Ouvrir le site ${s.name}`}
                      className="rounded-2xl border border-slate-200 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-md"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <MapPin className="h-4 w-4 shrink-0 text-[#0F3D68]" />
                          <span className="truncate font-bold text-slate-900">{s.name}</span>
                        </span>
                        {s.is_active === false && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Inactif</span>}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {fmtNum(s.depot_count)} dépôt(s) · {fmtNum(s.product_count)} produit(s)
                      </div>
                      <div className="mt-1 text-xs text-slate-700">
                        Valeur : <strong className="tabular-nums">{fmtMoney(s.value)}</strong>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-[#1D6FB8]" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-9 text-right text-[11px] font-semibold tabular-nums text-slate-700">{pct} %</span>
                      </div>
                    </button>
                  );
                })}
                {!scopeSites.length && <p className="text-xs text-slate-500">{sites.length ? "Aucun site dans ce périmètre." : "Aucun site. Créez-en un dans « Sites & Dépôts »."}</p>}
              </div>
            </GlassCard>

            {/* Stock embarqué : marchandise sortie des dépôts vers les camions des marketeurs */}
            {scopeEmbarked && (
              <GlassCard title="Stock embarqué des marketeurs" icon={Truck}>
                <div
                  className={`mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-3 py-2 text-xs ${
                    scopeEmbarked.totals.balanced ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"
                  }`}
                >
                  <span>
                    Dépôts <strong className="tabular-nums">{fmtNum(scopeEmbarked.totals.depots)}</strong>
                  </span>
                  <span>
                    + Camions <strong className="tabular-nums">{fmtNum(scopeEmbarked.totals.embarked)}</strong>
                  </span>
                  <span>
                    = Stock total <strong className="tabular-nums">{fmtNum(scopeEmbarked.totals.total)}</strong> unités
                  </span>
                  <span className="font-semibold">{scopeEmbarked.totals.balanced ? "✓ Stocks synchronisés" : "⚠ Écart détecté"}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {scopeEmbarked.stocks.map((e: any) => (
                    <div key={e.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 shrink-0 text-[#0F3D68]" />
                        <span className="truncate font-bold text-slate-900">{e.marketer_name}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {e.vehicle_plate || "Sans camion"}
                        {e.driver_name ? ` · ${e.driver_name}` : ""}
                      </div>
                      <div className="mt-1 text-xs text-slate-700">
                        <strong className="tabular-nums">{fmtNum(e.units)}</strong> unités · {fmtMoney(e.value)}
                      </div>
                      <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-600">
                        {e.items.slice(0, 4).map((i: any) => (
                          <li key={i.product_id} className="flex justify-between gap-2">
                            <span className="truncate">{i.name}</span>
                            <span className="tabular-nums font-semibold">{fmtNum(i.quantity)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {!scopeEmbarked.stocks.length && <p className="text-xs text-slate-500">Aucune marchandise dans les camions.</p>}
                </div>
              </GlassCard>
            )}
          </>
        )
      ) : tab === "products" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
          <GlassCard title="Catégories de produits" icon={FolderTree}>
            <ul className="space-y-0.5 text-xs">
              <li>
                <TreeButton active={category === ALL} onClick={() => { setCategory(ALL); setPage(1); }}>
                  <FolderTree className="h-3.5 w-3.5" />
                  <span className="flex-1">Toutes</span>
                  <span className="tabular-nums text-slate-500">({filteredProducts.length})</span>
                </TreeButton>
              </li>
              {categoryTree.map(([c, items]) => (
                <li key={c}>
                  <TreeButton active={category === c} onClick={() => { setCategory(category === c ? ALL : c); setPage(1); }}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorByCategory.get(c) || OTHER_COLOR }} />
                    <span className="min-w-0 flex-1 truncate">{c}</span>
                    <span className="tabular-nums text-slate-500">({items.length})</span>
                  </TreeButton>
                  {category === c && (
                    <ul className="ml-5 border-l border-cyan-200 py-1 pl-2">
                      {items.map((p: any) => (
                        <li key={p.id} className="truncate py-0.5 text-[11px] text-slate-500">
                          {p.name}
                          {p.size ? ` · ${p.size}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard
            title="Produits en stock"
            icon={Package}
            right={
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  placeholder="Rechercher un produit, un code, une taille…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/25"
                />
              </div>
            }
          >
            <div className="mb-3 flex flex-wrap items-end gap-2" data-prod-scope>
              <label className="text-[11px] font-semibold text-slate-600">
                Site
                <select
                  value={prodSite}
                  onChange={(e) => { setProdSite(e.target.value); setProdDepot(ALL); setCategory(ALL); setPage(1); }}
                  className="mt-1 block h-9 min-w-[150px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/25"
                >
                  <option value={ALL}>Tous les sites</option>
                  {sites.map((x: any) => (
                    <option key={x.id} value={x.id} data-no-translate>{x.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-600">
                Dépôt
                <select
                  value={prodDepot}
                  onChange={(e) => { setProdDepot(e.target.value); setCategory(ALL); setPage(1); }}
                  className="mt-1 block h-9 min-w-[190px] rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/25"
                >
                  <option value={ALL}>Tous les dépôts</option>
                  {warehouses
                    .filter((w: any) => prodSite === ALL || w.site_id === prodSite)
                    .map((w: any) => (
                      <option key={w.id} value={w.id} data-no-translate>{prodSite === ALL ? w.label || w.name : w.name}</option>
                    ))}
                </select>
              </label>
              <span className="pb-2 text-[11px] text-slate-500">
                {prodScoped ? "Inventaire du site / dépôt choisi" : "Inventaire général (tous les sites)"}
              </span>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { setStatusFilter(f.id); setPage(1); }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold transition-all ${
                    statusFilter === f.id
                      ? "border-[#0F3D68] bg-[#0F3D68] text-white shadow-[0_0_14px_-4px_rgba(15,61,104,0.8)]"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {f.dot && <span className={`h-1.5 w-1.5 rounded-full ${f.dot}`} />}
                  {f.label}
                  <span className="tabular-nums opacity-70">{statusCounts[f.id]}</span>
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-2.5 py-3 font-semibold">Produit</th>
                    <th className="px-2.5 py-3 text-right font-semibold">Prix achat</th>
                    <th className="px-2.5 py-3 text-right font-semibold">Prix vente</th>
                    <th className="px-2.5 py-3 font-semibold">{prodScoped ? "Stock (site / dépôt)" : "Stock global"}</th>
                    <th className="px-2.5 py-3 text-right font-semibold">Valeur</th>
                    <th className="px-2.5 py-3 text-center font-semibold">Statut</th>
                    {has("stock.write") && <th className="px-2.5 py-3 text-center font-semibold">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((prod) => {
                    const stock = prodQty(prod);
                    const threshold = thresholdOf(prod);
                    const st = stockStatus(stock, threshold);
                    const gauge = Math.min(100, threshold > 0 ? (stock / (threshold * 4)) * 100 : stock > 0 ? 100 : 0);
                    const nbDepots = prodScoped ? prodQtyMap.get(prod.id)?.depots || 0 : depotsByProduct.get(prod.id) || 0;
                    return (
                      <tr key={prod.id} className="group transition-colors hover:bg-cyan-50/40">
                        <td className="px-2.5 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            {prod.image_url ? (
                              <img
                                src={prod.image_url}
                                alt={prod.name}
                                referrerPolicy="no-referrer"
                                className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 object-cover shadow-xs"
                                onError={(e) => {
                                  (e.target as any).src = "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=100&auto=format&fit=crop&q=60";
                                }}
                              />
                            ) : (
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                                <ImageIcon className="h-5 w-5 opacity-50" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-slate-900">
                                {prod.name}
                                {prod.size && (
                                  <span className="ml-1.5 rounded-md border border-cyan-200 bg-cyan-50 px-1.5 py-px text-[10px] font-bold text-cyan-800">{prod.size}</span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                <span className="font-mono text-[10px] text-slate-500">{prod.code}</span>
                                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorByCategory.get(categoryOf(prod)) || OTHER_COLOR }} />
                                  {prod.category || "Général"}
                                </span>
                                {prod.badge && (
                                  <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 text-[9px] font-bold text-indigo-700">{prod.badge}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2.5 py-3 text-right font-mono text-slate-600">{fmtMoney(prod.cost_price || 0)}</td>
                        <td className="px-2.5 py-3 text-right">
                          <div className="font-mono font-bold text-slate-900">{fmtMoney(prod.sell_price || 0)}</div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {(prod.price_fc || Math.round(prod.sell_price * 2500)).toLocaleString()} FC
                          </div>
                        </td>
                        <td className="px-2.5 py-3">
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm font-extrabold tabular-nums text-slate-900">{fmtNum(stock)}</span>
                            <span className="text-[10px] text-slate-400">{prod.unit || "u"}</span>
                          </div>
                          <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-slate-100" title={`Seuil d'alerte : ${fmtNum(threshold)}`}>
                            <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${gauge}%` }} />
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-500">{nbDepots} dépôt(s)</div>
                        </td>
                        <td className="px-2.5 py-3 text-right font-semibold tabular-nums text-slate-800">{fmtMoney(stock * (prod.cost_price || 0))}</td>
                        <td className="px-2.5 py-3 text-center">
                          <StatusPill status={st} />
                        </td>
                        {has("stock.write") && (
                          <td className="px-2.5 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditModal(prod)}
                                title="Modifier produit & photo"
                                className="h-8 w-8 rounded-lg border-slate-200 p-0 text-slate-600 hover:border-cyan-300 hover:text-[#0F3D68]"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setAdjustingProduct(prod)}
                                className="h-8 rounded-lg border-slate-200 text-[11px] hover:border-cyan-300 hover:text-[#0F3D68]"
                              >
                                <Sliders className="mr-1 h-3.5 w-3.5" /> Ajuster
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {!visible.length && (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-500">
                        Aucun produit ne correspond à ces filtres.{" "}
                        <button type="button" onClick={clearFilters} className="font-semibold text-[#0F3D68] underline">
                          Effacer les filtres
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>
                Affichage de {visible.length} sur {rows.length} produit(s)
              </span>
              <div className="flex items-center gap-1">
                <button type="button" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)} aria-label="Page précédente" className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white disabled:opacity-40">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`h-7 min-w-7 rounded-lg px-2 font-semibold ${n === curPage ? "bg-[#0F3D68] text-white shadow-[0_0_12px_-4px_rgba(15,61,104,0.9)]" : "border border-slate-200 bg-white text-slate-700"}`}
                  >
                    {n}
                  </button>
                ))}
                <button type="button" disabled={curPage >= pages} onClick={() => setPage(curPage + 1)} aria-label="Page suivante" className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white disabled:opacity-40">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </GlassCard>
        </div>
      ) : tab === "categories" ? (
        <CategoriesPanel products={products} onChanged={refreshInBackground} />
      ) : tab === "sites" ? (
        <SitesDepotsPanel
          key={sitesFocus.n}
          initialSiteId={sitesFocus.siteId}
          initialDepotId={sitesFocus.depotId}
          onStockChanged={refreshInBackground}
        />
      ) : tab === "transfers" ? (
        <TransfersPanel onStockChanged={refreshInBackground} />
      ) : (
        <MovementsPanel />
      )}

      {/* ADJUST STOCK MODAL */}
      {adjustingProduct && (
        <Dialog open onOpenChange={() => setAdjustingProduct(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">
                Ajuster Stock : {adjustingProduct.name}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdjustStock} className="space-y-3 pt-2 text-xs">
              <div>
                <Label className="text-xs font-semibold">
                  Quantité à ajouter (+) ou retirer (-)
                </Label>
                <Input
                  name="delta"
                  type="number"
                  required
                  placeholder="Ex: +50 ou -10"
                  className="mt-1 h-9 rounded-lg font-bold"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Motif de l'ajustement</Label>
                <select
                  name="reason"
                  className="w-full mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                >
                  <option value="reception">Réception commande fournisseur</option>
                  <option value="inventory_correction">Correction d'inventaire</option>
                  <option value="damage">Perte / Avarie</option>
                  <option value="gift">Cadeau / Don</option>
                  <option value="return">Retour client</option>
                </select>
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAdjustingProduct(null)}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-[#0F3D68] text-white hover:bg-[#0B2F52]"
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Valider
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* NEW PRODUCT MODAL (formulaire partagé avec la Boutique) */}
      {newProductModal && <NewProductDialog onClose={() => setNewProductModal(false)} onCreated={loadData} />}

      {/* EDIT PRODUCT MODAL */}
      {editingProduct && (
        <Dialog open onOpenChange={() => setEditingProduct(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Edit className="w-5 h-5 text-[#0F3D68]" />
                Modifier Produit & Photo : {editingProduct.name}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateProduct} className="space-y-3.5 pt-2 text-xs">
              <div className="px-2.5 py-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Photo du Produit</span>
                  <span className="text-[11px] font-normal text-slate-500">Mise à jour en direct</span>
                </Label>
                <div className="flex items-center gap-3">
                  {imagePreview ? (
                    <div className="relative group w-20 h-20 rounded-xl overflow-hidden border-2 border-indigo-500 shrink-0 bg-white shadow-xs">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImagePreview("");
                          setImageUrlInput("");
                        }}
                        className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Supprimer la photo"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl border border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 shrink-0">
                      <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                      <span className="text-[9px]">Aucune image</span>
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <label className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-300 hover:border-[#0F3D68] hover:text-[#0F3D68] rounded-xl cursor-pointer text-xs font-semibold text-slate-700 transition-colors shadow-2xs">
                      <Upload className="w-4 h-4 text-slate-500" />
                      <span>Remplacer l'image (ordinateur)</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Ou URL d'image (https://...)"
                        value={imageUrlInput}
                        onChange={(e) => {
                          setImageUrlInput(e.target.value);
                          setImagePreview(e.target.value);
                        }}
                        className="h-8 text-xs bg-white rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold">Désignation du produit *</Label>
                <Input name="name" required defaultValue={editingProduct.name} className="mt-1 h-9 rounded-lg" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Code / SKU *</Label>
                  <Input name="code" required defaultValue={editingProduct.code} className="mt-1 h-9 rounded-lg font-mono" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Catégorie</Label>
                  <Input name="category" defaultValue={editingProduct.category} className="mt-1 h-9 rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Badge</Label>
                  <Input name="badge" defaultValue={editingProduct.badge || ""} placeholder="Nouveau, Promo..." className="mt-1 h-9 rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Prix Vente ($)</Label>
                  <Input name="sell_price" type="number" step="0.01" defaultValue={editingProduct.sell_price} className="mt-1 h-9 rounded-lg font-bold" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Prix Vente (FC)</Label>
                  <Input name="price_fc" type="number" defaultValue={editingProduct.price_fc || Math.round(editingProduct.sell_price * 2500)} className="mt-1 h-9 rounded-lg font-mono" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Prix Achat ($)</Label>
                  <Input name="cost_price" type="number" step="0.01" defaultValue={editingProduct.cost_price} className="mt-1 h-9 rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Unité</Label>
                  <Input name="unit" defaultValue={editingProduct.unit} className="mt-1 h-9 rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Stock Actuel</Label>
                  <Input name="stock" type="number" defaultValue={editingProduct.stock ?? editingProduct.current_stock ?? 0} className="mt-1 h-9 rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Seuil d'Alerte</Label>
                  <Input name="alert_threshold" type="number" defaultValue={editingProduct.alert_threshold || 10} className="mt-1 h-9 rounded-lg" />
                </div>
              </div>
              <DialogFooter className="gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setEditingProduct(null)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving} className="bg-[#0F3D68] hover:bg-[#0B2F52] text-white">
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                  Enregistrer Modifications
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
