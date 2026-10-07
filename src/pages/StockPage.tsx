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
  BarChart3,
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  FolderTree,
  MapPin,
  PieChart,
  Shapes,
  TrendingUp,
  Warehouse as WarehouseIcon,
  XCircle,
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
  statusOf,
  stockOf,
  thresholdOf,
} from "@/components/stock/stockCharts";

const ALL = "all";
const PAGE_SIZE = 8;

type StatusFilter = "all" | "ok" | "low" | "out";
const STATUS_FILTERS: Array<{ id: StatusFilter; label: string; dot?: string }> = [
  { id: "all", label: "Tous" },
  { id: "ok", label: "Normal", dot: "bg-emerald-500" },
  { id: "low", label: "Stock faible", dot: "bg-amber-500" },
  { id: "out", label: "Rupture", dot: "bg-red-500" },
];

function GlassCard({ title, icon: Icon, children }: any) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_10px_30px_-18px_rgba(15,61,104,0.35)] backdrop-blur">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-cyan-50 to-blue-100 text-[#0F3D68]">
          <Icon className="h-4 w-4" />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function KpiTile({ icon: Icon, glow, label, value, hint, active, onClick }: any) {
  const clickable = typeof onClick === "function";
  const Tag: any = clickable ? "button" : "div";
  return (
    <Tag
      {...(clickable ? { type: "button", onClick, "aria-pressed": !!active } : {})}
      className={`group relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-2xl border bg-white/90 p-3.5 text-left shadow-[0_10px_30px_-18px_rgba(15,61,104,0.35)] transition-all ${
        active ? "border-cyan-400 ring-2 ring-cyan-300/50" : "border-slate-200/80"
      } ${clickable ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-16px_rgba(15,61,104,0.45)]" : ""}`}
    >
      <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${glow} text-white shadow-[0_8px_20px_-8px_rgba(15,61,104,0.7)]`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <span className="break-words text-lg font-black leading-tight tracking-tight text-slate-900 tabular-nums">{value}</span>
      <span className={`truncate text-[11px] ${active ? "font-semibold text-cyan-700" : "text-slate-500"}`}>{hint}</span>
    </Tag>
  );
}

function HeroSelect({ value, onChange, options }: any) {
  return (
    <span className="relative min-w-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full min-w-[150px] appearance-none rounded-xl border border-white/15 bg-white/10 pl-3 pr-8 text-sm font-medium text-white backdrop-blur focus:border-cyan-300/60 focus:outline-none focus:ring-2 focus:ring-cyan-300/30 [&>option]:text-slate-900"
      >
        {options.map((o: any) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-100/70" />
    </span>
  );
}

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

  // Filtres de l'écran Stock
  const [orders, setOrders] = useState<any[]>([]);
  const [site, setSite] = useState(ALL);
  const [depot, setDepot] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  // Image upload states
  const [imagePreview, setImagePreview] = useState<string>("");
  const [imageUrlInput, setImageUrlInput] = useState<string>("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodRes, whRes] = await Promise.all([
        api.get("/products"),
        api.get("/warehouses"),
      ]);
      setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
      setWarehouses(Array.isArray(whRes.data) ? whRes.data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur de chargement"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Commandes : uniquement pour la courbe d'évolution (facultatif)
    api
      .get("/orders")
      .then(({ data }) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]));
  }, []);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q));
      return matchQ;
    });
  }, [products, search]);

  const whById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const siteOf = (p: any) => ((whById.get(p.warehouse_id)?.city || "").split(",")[0] || "").trim() || "Non affecté";
  const depotOf = (p: any) => whById.get(p.warehouse_id)?.name || "Non affecté";

  const allSites = useMemo(() => Array.from(new Set(products.map(siteOf))).sort(), [products, whById]);
  const allDepots = useMemo(
    () => Array.from(new Set(products.filter((p) => site === ALL || siteOf(p) === site).map(depotOf))).sort(),
    [products, whById, site]
  );
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

  // Site + dépôt + recherche (base de l'arbre des catégories)
  const inSite = useMemo(
    () => filteredProducts.filter((p) => (site === ALL || siteOf(p) === site) && (depot === ALL || depotOf(p) === depot)),
    [filteredProducts, site, depot, whById]
  );
  const scoped = useMemo(() => inSite.filter((p) => category === ALL || categoryOf(p) === category), [inSite, category]);

  const totalValue = scoped.reduce((s, p) => s + stockOf(p) * costOf(p), 0);
  const totalUnits = scoped.reduce((s, p) => s + stockOf(p), 0);
  const lowCount = scoped.filter((p) => statusOf(p).key === "low").length;
  const outCount = scoped.filter((p) => statusOf(p).key === "out").length;
  const siteCount = new Set(scoped.map(siteOf)).size;
  const depotCount = new Set(scoped.map(depotOf)).size;
  const catCount = new Set(scoped.map(categoryOf)).size;
  const statusCounts: Record<StatusFilter, number> = {
    all: scoped.length,
    ok: scoped.length - lowCount - outCount,
    low: lowCount,
    out: outCount,
  };

  const bySite = useMemo(() => {
    const m = new Map<string, { value: number; depots: Set<string> }>();
    scoped.forEach((p) => {
      const e = m.get(siteOf(p)) || { value: 0, depots: new Set<string>() };
      e.value += stockOf(p) * costOf(p);
      e.depots.add(depotOf(p));
      m.set(siteOf(p), e);
    });
    return Array.from(m.entries())
      .map(([site, e]) => ({ site, value: e.value, depots: e.depots.size }))
      .sort((a, b) => b.value - a.value);
  }, [scoped, whById]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    scoped.forEach((p) => m.set(categoryOf(p), (m.get(categoryOf(p)) || 0) + stockOf(p) * costOf(p)));
    return Array.from(m.entries())
      .map(([label, value]) => ({ label, value, color: colorByCategory.get(label) || OTHER_COLOR }))
      .sort((a, b) => b.value - a.value);
  }, [scoped, colorByCategory]);

  const evolution = useMemo(() => computeEvolution(scoped, orders, totalValue), [scoped, orders, totalValue]);

  const categoryTree = useMemo(() => {
    const m = new Map<string, any[]>();
    inSite.forEach((p) => m.set(categoryOf(p), [...(m.get(categoryOf(p)) || []), p]));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [inSite]);

  const rows = useMemo(
    () =>
      scoped
        .filter((p) => statusFilter === "all" || statusOf(p).key === statusFilter)
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [scoped, statusFilter]
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const visible = rows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const toggleStatus = (key: StatusFilter) => {
    setStatusFilter((cur) => (cur === key ? "all" : key));
    setPage(1);
  };
  const clearFilters = () => {
    setSearch("");
    setSite(ALL);
    setDepot(ALL);
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

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
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
      image_url: imagePreview || imageUrlInput.trim() || undefined,
    };

    try {
      await api.post("/products", payload);
      toast.success("Produit ajouté avec succès");
      setNewProductModal(false);
      setImagePreview("");
      setImageUrlInput("");
      loadData();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec de l'ajout"));
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
      {/* En-tête */}
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
            <p className="text-sm text-blue-100/80">Vue d'ensemble de votre stock sur tous les sites et dépôts</p>
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
        <div className="relative mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-cyan-100" />
            <input
              placeholder="Rechercher un produit, un code, une catégorie…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-xl border border-white/15 bg-white/10 pl-9 pr-3 text-sm text-white placeholder:text-blue-100/60 backdrop-blur focus:border-cyan-300/60 focus:outline-none focus:ring-2 focus:ring-cyan-300/30"
            />
          </div>
          <HeroSelect
            value={site}
            onChange={(v: string) => {
              setSite(v);
              setDepot(ALL);
              setPage(1);
            }}
            options={[{ value: ALL, label: "Tous les sites" }, ...allSites.map((s) => ({ value: s, label: s }))]}
          />
          <HeroSelect
            value={depot}
            onChange={(v: string) => {
              setDepot(v);
              setPage(1);
            }}
            options={[{ value: ALL, label: "Tous les dépôts" }, ...allDepots.map((d) => ({ value: d, label: d }))]}
          />
          <HeroSelect
            value={category}
            onChange={(v: string) => {
              setCategory(v);
              setPage(1);
            }}
            options={[{ value: ALL, label: "Toutes les catégories" }, ...allCategories.map((c) => ({ value: c, label: c }))]}
          />
        </div>
      </section>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : products.length === 0 ? (
        <EmptyState icon={Package} title="Aucun produit en stock" subtitle="Ajoutez votre premier article avec « Nouveau produit »." />
      ) : (
        <>
          {/* Indicateurs */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <KpiTile icon={Boxes} glow="from-blue-500 to-indigo-600" label="Total produits" value={fmtNum(scoped.length)} hint={`${fmtNum(totalUnits)} unités`} />
            <KpiTile icon={Shapes} glow="from-violet-500 to-fuchsia-600" label="Catégories" value={fmtNum(catCount)} hint="Différentes catégories" />
            <KpiTile icon={MapPin} glow="from-emerald-500 to-teal-600" label="Sites" value={fmtNum(siteCount)} hint="Sites actifs" />
            <KpiTile icon={WarehouseIcon} glow="from-cyan-500 to-sky-600" label="Dépôts" value={fmtNum(depotCount)} hint="Dépôts au total" />
            <KpiTile icon={Database} glow="from-[#0F3D68] to-[#1D6FB8]" label="Valeur du stock" value={fmtMoney(totalValue)} hint="Au prix d'achat" />
            <KpiTile
              icon={AlertTriangle}
              glow="from-amber-400 to-orange-500"
              label="Stock faible"
              value={fmtNum(lowCount)}
              hint={statusFilter === "low" ? "Filtre actif · retirer" : "Voir les produits"}
              active={statusFilter === "low"}
              onClick={() => toggleStatus("low")}
            />
            <KpiTile
              icon={XCircle}
              glow="from-rose-500 to-red-600"
              label="Ruptures"
              value={fmtNum(outCount)}
              hint={statusFilter === "out" ? "Filtre actif · retirer" : "Voir les produits"}
              active={statusFilter === "out"}
              onClick={() => toggleStatus("out")}
            />
          </div>

          {/* Graphiques */}
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

          {/* Catégories + produits */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
            <GlassCard title="Catégories de produits" icon={FolderTree}>
              <ul className="space-y-0.5 text-xs">
                <li>
                  <TreeButton active={category === ALL} onClick={() => { setCategory(ALL); setPage(1); }}>
                    <FolderTree className="h-3.5 w-3.5" />
                    <span className="flex-1">Toutes</span>
                    <span className="tabular-nums text-slate-500">({inSite.length})</span>
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
                          <li key={p.id} className="truncate py-0.5 text-[11px] text-slate-500">{p.name}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </GlassCard>

            <GlassCard title="Produits en stock" icon={Package}>
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
                      <th className="px-2.5 py-3 font-semibold">Stock</th>
                      <th className="px-2.5 py-3 text-right font-semibold">Valeur</th>
                      <th className="px-2.5 py-3 text-center font-semibold">Statut</th>
                      {has("stock.write") && <th className="px-2.5 py-3 text-center font-semibold">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map((prod) => {
                      const stock = stockOf(prod);
                      const threshold = thresholdOf(prod);
                      const st = statusOf(prod);
                      const gauge = Math.min(100, threshold > 0 ? (stock / (threshold * 4)) * 100 : stock > 0 ? 100 : 0);
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
                                <div className="truncate font-semibold text-slate-900">{prod.name}</div>
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
                          </td>
                          <td className="px-2.5 py-3 text-right font-semibold tabular-nums text-slate-800">{fmtMoney(stock * (prod.cost_price || 0))}</td>
                          <td className="px-2.5 py-3 text-center">
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                              {st.label === "Faible" ? "Stock faible" : st.label}
                            </span>
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

          {/* Stock par site */}
          <GlassCard title="Stock par site" icon={MapPin}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {bySite.map((s) => {
                const pct = totalValue > 0 ? Math.round((s.value / totalValue) * 100) : 0;
                return (
                  <button
                    key={s.site}
                    type="button"
                    onClick={() => { setSite(site === s.site ? ALL : s.site); setDepot(ALL); setPage(1); }}
                    className={`rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${site === s.site ? "border-cyan-400 bg-cyan-50/50" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[#0F3D68]" />
                      <span className="font-bold text-slate-900">{s.site}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{s.depots} dépôt(s)</div>
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
            </div>
          </GlassCard>
        </>
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

      {/* NEW PRODUCT MODAL */}
      {newProductModal && (
        <Dialog open onOpenChange={() => setNewProductModal(false)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Package className="w-5 h-5 text-[#0F3D68]" />
                Nouveau Produit
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateProduct} className="space-y-3.5 pt-2 text-xs">
              <div className="px-2.5 py-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Photo du Produit</span>
                  <span className="text-[11px] font-normal text-slate-500">Visible dans la Boutique & Stock</span>
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
                      <span>Téléverser depuis l'ordinateur</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Ou coller une URL d'image web (https://...)"
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
                <Input name="name" required placeholder="Ex: Jus Naturel Mangue 1L" className="mt-1 h-9 rounded-lg" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Code / SKU *</Label>
                  <Input name="code" required placeholder="PRD-JUS-MNG" className="mt-1 h-9 rounded-lg font-mono" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Catégorie</Label>
                  <Input name="category" placeholder="Jus & Boissons" className="mt-1 h-9 rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Badge (Optionnel)</Label>
                  <Input name="badge" placeholder="Nouveau, Populaire..." className="mt-1 h-9 rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Prix Vente ($) *</Label>
                  <Input name="sell_price" type="number" step="0.01" required defaultValue="1.50" className="mt-1 h-9 rounded-lg font-bold" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Prix Vente (FC)</Label>
                  <Input name="price_fc" type="number" placeholder="Ex: 3750" className="mt-1 h-9 rounded-lg font-mono" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Prix Achat ($)</Label>
                  <Input name="cost_price" type="number" step="0.01" defaultValue="1.00" className="mt-1 h-9 rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Unité</Label>
                  <Input name="unit" defaultValue="Bouteille" className="mt-1 h-9 rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Stock Initial</Label>
                  <Input name="stock" type="number" defaultValue="100" className="mt-1 h-9 rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Seuil d'Alerte</Label>
                  <Input name="alert_threshold" type="number" defaultValue="15" className="mt-1 h-9 rounded-lg" />
                </div>
              </div>
              <DialogFooter className="gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setNewProductModal(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving} className="bg-[#0F3D68] hover:bg-[#0B2F52] text-white">
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                  Enregistrer Produit
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

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
