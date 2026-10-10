import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Database,
  LineChart,
  PieChart,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { fmtMoney } from "@/components/erp-ui";
import { api } from "@/lib/api";
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
} from "@/components/stock/stockCharts";

/*
 * Tableau de bord « État des Stocks » du module Rapports.
 * Lecture seule : il lit les produits (photo comprise via image_url), les dépôts
 * et les commandes, sans jamais modifier un produit ni sa photo.
 */

type Props = {
  products: any[];
  orders: any[];
  search: string;
  /** Site choisi dans l'en-tête des Rapports ("all" = tous) */
  siteKey?: string;
};

// Ordre fixe des couleurs de catégories (validé daltonisme, voir legend)
const ALL = "all";

function Card({ title, icon: Icon, children, className = "" }: any) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-xs min-w-0 ${className}`}>
      {title && (
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
          <Icon className="h-4 w-4 text-[#0F3D68]" />
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

function Kpi({ icon: Icon, tone, label, value, hint }: any) {
  return (
    <div className="flex min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-slate-500">{label}</div>
        <div className="text-xl font-black tracking-tight text-slate-900 tabular-nums">{value}</div>
        <div className="truncate text-[11px] text-slate-500">{hint}</div>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: any) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-slate-600">
      <span className="shrink-0">{label}</span>
      <span className="relative min-w-0">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full min-w-[140px] appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/30"
        >
          {options.map((o: any) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      </span>
    </label>
  );
}

/* ---------- Graphiques (SVG, sans dépendance) ---------- */

/* ---------- Tableau de bord ---------- */

export default function StockReportDashboard({ products, orders, search, siteKey }: Props) {
  // Structure réelle du stock : sites, dépôts et quantités par dépôt
  const [sites, setSites] = useState<any[]>([]);
  const [depots, setDepots] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  useEffect(() => {
    Promise.all([api.get("/stock/sites"), api.get("/stock/depots"), api.get("/stock/levels")])
      .then(([s, d, l]) => {
        setSites(Array.isArray(s.data) ? s.data : []);
        setDepots(Array.isArray(d.data) ? d.data : []);
        setLevels(Array.isArray(l.data) ? l.data : []);
      })
      .catch(() => {
        setSites([]);
        setDepots([]);
        setLevels([]);
      });
  }, [products]);
  const [site, setSite] = useState(siteKey && siteKey !== ALL ? siteKey : ALL);
  const [depot, setDepot] = useState(ALL);
  // Le filtre « Site » de l'en-tête des Rapports s'applique aussi à l'état des stocks
  useEffect(() => {
    if (siteKey === undefined) return;
    setSite(siteKey || ALL);
    setDepot(ALL);
  }, [siteKey]);
  const [category, setCategory] = useState(ALL);

  const siteName = (id?: string) => sites.find((x) => x.id === id)?.name || "Sans site";
  const allSites = useMemo(() => sites.map((x) => ({ value: x.id, label: x.name })), [sites]);
  const allDepots = useMemo(
    () => depots.filter((w) => site === ALL || w.site_id === site).map((w) => ({ value: w.id, label: w.name })),
    [depots, site]
  );
  const isGlobal = site === ALL && depot === ALL;
  // Dépôts concernés par les filtres Site / Dépôt
  const scopeDepots = useMemo(
    () => depots.filter((w) => (site === ALL || w.site_id === site) && (depot === ALL || w.id === depot)),
    [depots, site, depot]
  );
  // Lignes (produit, dépôt, quantité) dans le périmètre
  const entries = useMemo(() => {
    const ids = new Set(scopeDepots.map((w) => w.id));
    const byId = new Map(products.map((p) => [p.id, p]));
    return levels
      .filter((l) => ids.has(l.warehouse_id) && byId.has(l.product_id))
      .map((l) => ({ p: byId.get(l.product_id), w: scopeDepots.find((w) => w.id === l.warehouse_id), qty: Number(l.quantity) || 0 }));
  }, [levels, scopeDepots, products]);
  // Produits du périmètre, avec la quantité du site / dépôt choisi (vue globale : stock total, camions compris)
  const scopedProducts = useMemo(() => {
    if (isGlobal || !depots.length) return products;
    const qty = new Map<string, number>();
    entries.forEach((e) => qty.set(e.p.id, (qty.get(e.p.id) || 0) + e.qty));
    return products.filter((p) => qty.has(p.id)).map((p) => ({ ...p, stock: qty.get(p.id) || 0 }));
  }, [products, entries, isGlobal, depots.length]);
  const allCategories = useMemo(() => Array.from(new Set(products.map(categoryOf))).sort(), [products]);

  // Couleur fixée par catégorie (ne change pas quand on filtre)
  const colorByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    products.forEach((p) => totals.set(categoryOf(p), (totals.get(categoryOf(p)) || 0) + stockOf(p) * costOf(p)));
    const ranked = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map(([c]) => c);
    const m = new Map<string, string>();
    ranked.forEach((c, i) => m.set(c, CATEGORY_COLORS[i] || OTHER_COLOR));
    return m;
  }, [products]);

  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedProducts.filter(
      (p) => !q || p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || categoryOf(p).toLowerCase().includes(q)
    );
  }, [scopedProducts, search]);

  const inCategory = useMemo(() => scoped.filter((p) => category === ALL || categoryOf(p) === category), [scoped, category]);

  const totalValue = inCategory.reduce((s, p) => s + stockOf(p) * costOf(p), 0);
  // Sites et dépôts qui détiennent du stock des produits affichés
  const inCatIds = useMemo(() => new Set(inCategory.map((p) => p.id)), [inCategory]);
  const heldEntries = useMemo(() => entries.filter((e) => inCatIds.has(e.p.id) && e.qty > 0), [entries, inCatIds]);
  const depotCount = new Set(heldEntries.map((e) => e.w.id)).size;

  const bySite = useMemo(() => {
    const m = new Map<string, { value: number; depots: Set<string> }>();
    heldEntries.forEach((e) => {
      const k = e.w.site_name || siteName(e.w.site_id);
      const x = m.get(k) || { value: 0, depots: new Set<string>() };
      x.value += e.qty * costOf(e.p);
      x.depots.add(e.w.id);
      m.set(k, x);
    });
    const rows = Array.from(m.entries())
      .map(([site, x]) => ({ site, value: x.value, depots: x.depots.size }))
      .sort((a, b) => b.value - a.value);
    // Vue globale : le stock embarqué dans les camions fait partie du total
    if (isGlobal) {
      const embarked = inCategory.reduce((s, p) => s + stockOf(p) * costOf(p), 0) - rows.reduce((s, r) => s + r.value, 0);
      if (embarked > 0.5) rows.push({ site: "Stock embarqué (camions)", value: embarked, depots: 0 });
    }
    return rows;
  }, [heldEntries, sites, isGlobal, inCategory]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    scoped.forEach((p) => m.set(categoryOf(p), (m.get(categoryOf(p)) || 0) + stockOf(p) * costOf(p)));
    return Array.from(m.entries())
      .map(([label, value]) => ({ label, value, color: colorByCategory.get(label) || OTHER_COLOR }))
      .sort((a, b) => b.value - a.value);
  }, [scoped, colorByCategory]);
  const donutTotal = byCategory.reduce((s, c) => s + c.value, 0);

  const evolution = useMemo(() => computeEvolution(inCategory, orders, totalValue), [inCategory, orders, totalValue]);

  const reset = (fn: (v: string) => void) => (v: string) => fn(v);

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
        <Select
          label="Site"
          value={site}
          onChange={(v: string) => {
            setSite(v);
            setDepot(ALL);
          }}
          options={[{ value: ALL, label: "Tous les sites" }, ...allSites]}
        />
        <Select
          label="Dépôt"
          value={depot}
          onChange={reset(setDepot)}
          options={[{ value: ALL, label: "Tous les dépôts" }, ...allDepots]}
        />
        <Select
          label="Catégorie"
          value={category}
          onChange={reset(setCategory)}
          options={[{ value: ALL, label: "Toutes les catégories" }, ...allCategories.map((c) => ({ value: c, label: c }))]}
        />
      </div>

      {/* Indicateurs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Kpi icon={WarehouseIcon} tone="bg-teal-600" label="Dépôts" value={depotCount} hint="Dépôts au total" />
        <Kpi icon={Database} tone="bg-[#0F3D68]" label="Valeur totale du stock" value={fmtMoney(totalValue)} hint="Au prix de revient" />
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Valeur du stock par site" icon={Database}>
          <BarsBySite rows={bySite} />
        </Card>
        <Card title="Répartition du stock par catégorie" icon={PieChart}>
          <Donut slices={byCategory} total={donutTotal} />
        </Card>
        <Card title={`Évolution du stock (valeur, ${EVOLUTION_DAYS} jours)`} icon={LineChart}>
          <Evolution points={evolution} />
          <p className="mt-2 text-[11px] text-slate-500">Reconstituée à partir des commandes validées.</p>
        </Card>
      </div>

    </div>
  );
}
