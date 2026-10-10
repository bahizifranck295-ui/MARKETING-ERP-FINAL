import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  FolderTree,
  LineChart,
  MapPin,
  MoreHorizontal,
  Package,
  PieChart,
  Search,
  Shapes,
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
  BAR_COLOR,
  categoryOf,
  computeEvolution,
  costOf,
  statusOf,
  stockOf,
  thresholdOf,
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
const PAGE_SIZE = 7;
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

function ProductThumb({ product }: { product: any }) {
  const [failed, setFailed] = useState(false);
  if (product.image_url && !failed) {
    return (
      <img
        src={product.image_url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
      />
    );
  }
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400">
      <Package className="h-4 w-4" />
    </span>
  );
}

/* ---------- Graphiques (SVG, sans dépendance) ---------- */

/* ---------- Tableau de bord ---------- */

export default function StockReportDashboard({ products, orders, search, siteKey }: Props) {
  const navigate = useNavigate();
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
  const [tableSearch, setTableSearch] = useState("");
  const [catSearch, setCatSearch] = useState("");
  const [page, setPage] = useState(1);

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

  // Quantités réservées : commandes en attente d'approbation (stock pas encore déduit)
  const reservedByProduct = useMemo(() => {
    const m = new Map<string, number>();
    orders
      .filter((o) => o.status === "pending_approval")
      .forEach((o) => (o.items || []).forEach((it: any) => m.set(it.product_id, (m.get(it.product_id) || 0) + (Number(it.quantity) || 0))));
    return m;
  }, [orders]);

  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedProducts.filter(
      (p) => !q || p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || categoryOf(p).toLowerCase().includes(q)
    );
  }, [scopedProducts, search]);

  const inCategory = useMemo(() => scoped.filter((p) => category === ALL || categoryOf(p) === category), [scoped, category]);

  const totalValue = inCategory.reduce((s, p) => s + stockOf(p) * costOf(p), 0);
  const totalUnits = inCategory.reduce((s, p) => s + stockOf(p), 0);
  // La rupture (stock à zéro) fait partie du « Stock faible »
  const lowCount = inCategory.filter((p) => stockOf(p) <= thresholdOf(p)).length;
  // Sites et dépôts qui détiennent du stock des produits affichés
  const inCatIds = useMemo(() => new Set(inCategory.map((p) => p.id)), [inCategory]);
  const heldEntries = useMemo(() => entries.filter((e) => inCatIds.has(e.p.id) && e.qty > 0), [entries, inCatIds]);
  const siteCount = new Set(heldEntries.map((e) => e.w.site_id)).size;
  const depotCount = new Set(heldEntries.map((e) => e.w.id)).size;
  const catCount = new Set(inCategory.map(categoryOf)).size;

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

  const tableRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return inCategory
      .filter((p) => !q || p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [inCategory, tableSearch]);
  const pages = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));
  const curPage = Math.min(page, pages);
  const visible = tableRows.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

  const categoryTree = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    const m = new Map<string, any[]>();
    scoped.forEach((p) => m.set(categoryOf(p), [...(m.get(categoryOf(p)) || []), p]));
    return Array.from(m.entries())
      .filter(([c]) => !q || c.toLowerCase().includes(q))
      .sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [scoped, catSearch]);

  const reset = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(1);
  };

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
            setPage(1);
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={Boxes} tone="bg-blue-600" label="Total produits" value={inCategory.length.toLocaleString("fr-FR")} hint={`${totalUnits.toLocaleString("fr-FR")} unités en stock`} />
        <Kpi icon={Shapes} tone="bg-violet-600" label="Catégories" value={catCount} hint="Catégories différentes" />
        <Kpi icon={MapPin} tone="bg-emerald-600" label="Sites" value={siteCount} hint="Sites actifs" />
        <Kpi icon={WarehouseIcon} tone="bg-teal-600" label="Dépôts" value={depotCount} hint="Dépôts au total" />
        <Kpi icon={Database} tone="bg-[#0F3D68]" label="Valeur totale du stock" value={fmtMoney(totalValue)} hint="Au prix de revient" />
        <Kpi icon={AlertTriangle} tone="bg-amber-500" label="Stock faible" value={lowCount} hint="Sous le seuil minimum" />
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

      {/* Catégories + tableau */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card title="Catégories de produits" icon={FolderTree}>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              placeholder="Rechercher une catégorie…"
              className="h-9 w-full rounded-xl border border-slate-200 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/30"
            />
          </div>
          <ul className="space-y-0.5 text-xs">
            <li>
              <button
                type="button"
                onClick={() => reset(setCategory)(ALL)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-semibold ${category === ALL ? "bg-blue-50 text-[#0F3D68]" : "text-slate-700 hover:bg-slate-50"}`}
              >
                <FolderTree className="h-3.5 w-3.5" /> Toutes ({scoped.length})
              </button>
            </li>
            {categoryTree.map(([c, items]) => (
              <li key={c}>
                <button
                  type="button"
                  onClick={() => reset(setCategory)(c)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${category === c ? "bg-blue-50 font-semibold text-[#0F3D68]" : "text-slate-700 hover:bg-slate-50"}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorByCategory.get(c) || OTHER_COLOR }} />
                  <span className="min-w-0 flex-1 truncate">{c}</span>
                  <span className="tabular-nums text-slate-500">({items.length})</span>
                </button>
                {category === c && (
                  <ul className="ml-6 border-l border-slate-200 py-1 pl-2">
                    {items.map((p: any) => (
                      <li key={p.id} className="truncate py-0.5 text-[11px] text-slate-500">
                        {p.name}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Stock par dépôt" icon={Boxes}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              {depot === ALL ? "Tous les dépôts" : depot}
              {category !== ALL ? ` · ${category}` : ""}
            </p>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Rechercher un produit…"
                className="h-9 w-full rounded-xl border border-slate-200 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/30"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <th className="p-3">Produit</th>
                  <th className="p-3">Catégorie</th>
                  <th className="p-3 text-right">Stock</th>
                  <th className="p-3 text-right">Réservé</th>
                  <th className="p-3 text-right">Disponible</th>
                  <th className="p-3 text-right">Seuil mini</th>
                  <th className="p-3 text-right">Valeur</th>
                  <th className="p-3 text-center">Statut</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((p) => {
                  const stock = stockOf(p);
                  const reserved = reservedByProduct.get(p.id) || 0;
                  const st = statusOf(p);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="p-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <ProductThumb product={p} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">{p.name}</div>
                            <div className="font-mono text-[10px] text-slate-500">{p.code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">{categoryOf(p)}</td>
                      <td className="p-3 text-right font-semibold tabular-nums">{stock.toLocaleString("fr-FR")}</td>
                      <td className="p-3 text-right tabular-nums text-slate-600">{reserved.toLocaleString("fr-FR")}</td>
                      <td className="p-3 text-right font-semibold tabular-nums">{Math.max(0, stock - reserved).toLocaleString("fr-FR")}</td>
                      <td className="p-3 text-right tabular-nums text-slate-600">{thresholdOf(p).toLocaleString("fr-FR")}</td>
                      <td className="p-3 text-right font-semibold tabular-nums">{fmtMoney(stock * costOf(p))}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          title="Ouvrir dans Stock & Dépôts"
                          onClick={() => navigate("/stock")}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!visible.length && (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500">
                      Aucun produit ne correspond à ces filtres.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Affichage de {visible.length} sur {tableRows.length} produit(s)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={curPage <= 1}
                onClick={() => setPage(curPage - 1)}
                className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 disabled:opacity-40"
                aria-label="Page précédente"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <button
                  type="button"
                  key={n}
                  onClick={() => setPage(n)}
                  className={`h-7 min-w-7 rounded-lg px-2 font-semibold ${n === curPage ? "bg-[#0F3D68] text-white" : "border border-slate-200 text-slate-700"}`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={curPage >= pages}
                onClick={() => setPage(curPage + 1)}
                className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 disabled:opacity-40"
                aria-label="Page suivante"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </Card>
      </div>

    </div>
  );
}
