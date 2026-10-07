import React, { useEffect, useMemo, useState } from "react";
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
  XCircle,
} from "lucide-react";
import { fmtMoney } from "@/components/erp-ui";
import { api } from "@/lib/api";

/*
 * Tableau de bord « État des Stocks » du module Rapports.
 * Lecture seule : il lit les produits (photo comprise via image_url), les dépôts
 * et les commandes, sans jamais modifier un produit ni sa photo.
 */

type Props = {
  products: any[];
  orders: any[];
  search: string;
};

// Ordre fixe des couleurs de catégories (validé daltonisme, voir legend)
const CATEGORY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];
const OTHER_COLOR = "#94a3b8";
const BAR_COLOR = "#2a78d6";
const PAGE_SIZE = 7;
const EVOLUTION_DAYS = 30;

const ALL = "all";

const stockOf = (p: any) => Number(p.stock ?? p.current_stock ?? 0) || 0;
const costOf = (p: any) => Number(p.cost_price) || 0;
const thresholdOf = (p: any) => Number(p.low_stock_threshold ?? p.alert_threshold ?? 0) || 0;
const categoryOf = (p: any) => (p.category && String(p.category).trim()) || "Sans catégorie";

function compactMoney(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M$`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k$`;
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} $`;
}

// Échelle à 4 graduations rondes (1, 2, 2,5 ou 5 × 10^n)
function niceScale(v: number) {
  const raw = Math.max(v, 1) / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 2.5, 5, 10].find((s) => s * pow >= raw) || 10) * pow;
  return { max: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

function statusOf(p: any) {
  const s = stockOf(p);
  if (s <= 0) return { label: "Rupture", cls: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" };
  if (s <= thresholdOf(p)) return { label: "Faible", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" };
  return { label: "Normal", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" };
}

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

function BarsBySite({ rows }: { rows: Array<{ site: string; value: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 420, H = 210, L = 52, R = 8, T = 22, B = 28;
  const { max, ticks } = niceScale(Math.max(0, ...rows.map((r) => r.value)));
  const plotW = W - L - R, plotH = H - T - B;
  const slot = plotW / Math.max(rows.length, 1);
  const barW = Math.min(64, slot * 0.6);
  const y = (v: number) => T + plotH - (v / max) * plotH;

  if (!rows.length) return <p className="py-10 text-center text-xs text-slate-500">Aucun produit pour ces filtres.</p>;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Valeur du stock par site">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#64748b">
              {compactMoney(t)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = L + slot * i + slot / 2;
          const top = y(r.value);
          const h = Math.max(T + plotH - top, r.value > 0 ? 2 : 0);
          const rad = Math.min(4, h / 2);
          return (
            <g key={r.site} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={cx - slot / 2} y={T} width={slot} height={plotH} fill="transparent" />
              <path
                d={`M${cx - barW / 2},${T + plotH} V${top + rad} Q${cx - barW / 2},${top} ${cx - barW / 2 + rad},${top} H${cx + barW / 2 - rad} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + rad} V${T + plotH} Z`}
                fill={BAR_COLOR}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
              <text x={cx} y={top - 6} textAnchor="middle" fontSize={10} fontWeight={700} fill="#0f172a">
                {fmtMoney(r.value)}
              </text>
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={11} fill="#334155">
                {r.site}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Donut({ slices, total }: { slices: Array<{ label: string; value: number; color: string }>; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const R = 70, r = 46, C = 90;
  let angle = -Math.PI / 2;
  const gap = slices.length > 1 ? 0.02 : 0;
  const arcs = slices.map((s) => {
    const span = total > 0 ? (s.value / total) * Math.PI * 2 : 0;
    const a0 = angle + gap / 2;
    const a1 = angle + span - gap / 2;
    angle += span;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
    const d =
      span >= Math.PI * 2 - 0.001
        ? `M${C - R},${C} a${R},${R} 0 1,0 ${R * 2},0 a${R},${R} 0 1,0 ${-R * 2},0 M${C - r},${C} a${r},${r} 0 1,1 ${r * 2},0 a${r},${r} 0 1,1 ${-r * 2},0`
        : `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z`;
    return { ...s, d, span };
  });
  const active = hover !== null ? arcs[hover] : null;

  if (!total) return <p className="py-10 text-center text-xs text-slate-500">Aucune valeur de stock pour ces filtres.</p>;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0" role="img" aria-label="Répartition du stock par catégorie">
        {arcs.map((a, i) =>
          a.span > 0 ? (
            <path
              key={a.label}
              d={a.d}
              fill={a.color}
              fillRule="evenodd"
              opacity={hover === null || hover === i ? 1 : 0.4}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ) : null
        )}
        <text x={C} y={C - 2} textAnchor="middle" fontSize={14} fontWeight={800} fill="#0f172a">
          {active ? `${Math.round((active.value / total) * 100)} %` : compactMoney(total)}
        </text>
        <text x={C} y={C + 14} textAnchor="middle" fontSize={9} fill="#64748b">
          {active ? active.label : "Valeur totale"}
        </text>
      </svg>
      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {arcs.map((a, i) => (
          <li
            key={a.label}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2 rounded-md px-1 text-xs ${hover === i ? "bg-slate-50" : ""}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
            <span className="min-w-0 flex-1 truncate text-slate-700" title={fmtMoney(a.value)}>
              {a.label}
            </span>
            <span className="shrink-0 whitespace-nowrap text-right font-semibold tabular-nums text-slate-800">
              {Math.round((a.value / total) * 100)} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Evolution({ points }: { points: Array<{ date: Date; value: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 420, H = 210, L = 52, R = 14, T = 16, B = 28;
  const plotW = W - L - R, plotH = H - T - B;
  const { max, ticks } = niceScale(Math.max(0, ...points.map((p) => p.value)));
  const x = (i: number) => L + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${T + plotH} L${x(0)},${T + plotH} Z`;
  const labelEvery = Math.max(1, Math.round(points.length / 5));
  const last = points.length - 1;
  const hp = hover !== null ? points[hover] : null;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - L) / plotW) * (points.length - 1));
    setHover(Math.max(0, Math.min(last, i)));
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Évolution de la valeur du stock">
        <defs>
          <linearGradient id="stock-evo-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={BAR_COLOR} stopOpacity={0.22} />
            <stop offset="100%" stopColor={BAR_COLOR} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#64748b">
              {compactMoney(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === last ? (
            <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill="#64748b">
              {p.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
            </text>
          ) : null
        )}
        <path d={area} fill="url(#stock-evo-fill)" />
        <path d={line} fill="none" stroke={BAR_COLOR} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={x(last)} cy={y(points[last]?.value || 0)} r={4.5} fill={BAR_COLOR} stroke="#fff" strokeWidth={2} />
        {hp && (
          <g pointerEvents="none">
            <line x1={x(hover!)} x2={x(hover!)} y1={T} y2={T + plotH} stroke="#94a3b8" strokeDasharray="3 3" />
            <circle cx={x(hover!)} cy={y(hp.value)} r={4} fill={BAR_COLOR} stroke="#fff" strokeWidth={2} />
          </g>
        )}
        <rect x={L} y={T} width={plotW} height={plotH} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      <div className="absolute right-2 top-0 rounded-lg bg-[#0F3D68] px-2 py-1 text-[11px] font-bold text-white tabular-nums">
        {hp
          ? `${hp.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} · ${fmtMoney(hp.value)}`
          : `Aujourd'hui · ${fmtMoney(points[last]?.value || 0)}`}
      </div>
    </div>
  );
}

/* ---------- Tableau de bord ---------- */

export default function StockReportDashboard({ products, orders, search }: Props) {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  useEffect(() => {
    api
      .get("/warehouses")
      .then(({ data }) => setWarehouses(Array.isArray(data) ? data : []))
      .catch(() => setWarehouses([]));
  }, []);
  const [site, setSite] = useState(ALL);
  const [depot, setDepot] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [tableSearch, setTableSearch] = useState("");
  const [catSearch, setCatSearch] = useState("");
  const [page, setPage] = useState(1);

  const whById = useMemo(() => {
    const m = new Map<string, any>();
    warehouses.forEach((w) => m.set(w.id, w));
    return m;
  }, [warehouses]);

  const siteOf = (p: any) => {
    const w = whById.get(p.warehouse_id);
    return ((w?.city || "").split(",")[0] || "").trim() || "Non affecté";
  };
  const depotOf = (p: any) => whById.get(p.warehouse_id)?.name || "Non affecté";

  const allSites = useMemo(() => Array.from(new Set(products.map(siteOf))).sort(), [products, whById]);
  const allDepots = useMemo(
    () => Array.from(new Set(products.filter((p) => site === ALL || siteOf(p) === site).map(depotOf))).sort(),
    [products, whById, site]
  );
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
    return products.filter(
      (p) =>
        (site === ALL || siteOf(p) === site) &&
        (depot === ALL || depotOf(p) === depot) &&
        (!q || p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || categoryOf(p).toLowerCase().includes(q))
    );
  }, [products, site, depot, search, whById]);

  const inCategory = useMemo(() => scoped.filter((p) => category === ALL || categoryOf(p) === category), [scoped, category]);

  const totalValue = inCategory.reduce((s, p) => s + stockOf(p) * costOf(p), 0);
  const totalUnits = inCategory.reduce((s, p) => s + stockOf(p), 0);
  const lowCount = inCategory.filter((p) => stockOf(p) > 0 && stockOf(p) <= thresholdOf(p)).length;
  const outCount = inCategory.filter((p) => stockOf(p) <= 0).length;
  const siteCount = new Set(inCategory.map(siteOf)).size;
  const depotCount = new Set(inCategory.map(depotOf)).size;
  const catCount = new Set(inCategory.map(categoryOf)).size;

  const bySite = useMemo(() => {
    const m = new Map<string, { value: number; depots: Set<string> }>();
    inCategory.forEach((p) => {
      const k = siteOf(p);
      const e = m.get(k) || { value: 0, depots: new Set<string>() };
      e.value += stockOf(p) * costOf(p);
      e.depots.add(depotOf(p));
      m.set(k, e);
    });
    return Array.from(m.entries())
      .map(([site, e]) => ({ site, value: e.value, depots: e.depots.size }))
      .sort((a, b) => b.value - a.value);
  }, [inCategory, whById]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    scoped.forEach((p) => m.set(categoryOf(p), (m.get(categoryOf(p)) || 0) + stockOf(p) * costOf(p)));
    return Array.from(m.entries())
      .map(([label, value]) => ({ label, value, color: colorByCategory.get(label) || OTHER_COLOR }))
      .sort((a, b) => b.value - a.value);
  }, [scoped, colorByCategory]);
  const donutTotal = byCategory.reduce((s, c) => s + c.value, 0);

  // Valeur reconstituée : le stock est déduit à l'approbation d'une commande,
  // donc avant cette date la valeur comptait ces quantités en plus.
  const evolution = useMemo(() => {
    const ids = new Set(inCategory.map((p) => p.id));
    const cost = new Map(inCategory.map((p) => [p.id, costOf(p)]));
    const deductions = orders
      .filter((o) => ["validated", "shipped", "delivered"].includes(o.status))
      .map((o) => ({
        at: new Date(o.approved_at || o.created_at).getTime(),
        value: (o.items || []).reduce(
          (s: number, it: any) => s + (ids.has(it.product_id) ? (Number(it.quantity) || 0) * (cost.get(it.product_id) || 0) : 0),
          0
        ),
      }));
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return Array.from({ length: EVOLUTION_DAYS }, (_, k) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (EVOLUTION_DAYS - 1 - k));
      const after = deductions.filter((x) => x.at > d.getTime()).reduce((s, x) => s + x.value, 0);
      return { date: d, value: totalValue + after };
    });
  }, [inCategory, orders, totalValue]);

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
          options={[{ value: ALL, label: "Tous les sites" }, ...allSites.map((s) => ({ value: s, label: s }))]}
        />
        <Select
          label="Dépôt"
          value={depot}
          onChange={reset(setDepot)}
          options={[{ value: ALL, label: "Tous les dépôts" }, ...allDepots.map((d) => ({ value: d, label: d }))]}
        />
        <Select
          label="Catégorie"
          value={category}
          onChange={reset(setCategory)}
          options={[{ value: ALL, label: "Toutes les catégories" }, ...allCategories.map((c) => ({ value: c, label: c }))]}
        />
      </div>

      {/* Indicateurs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <Kpi icon={Boxes} tone="bg-blue-600" label="Total produits" value={inCategory.length.toLocaleString("fr-FR")} hint={`${totalUnits.toLocaleString("fr-FR")} unités en stock`} />
        <Kpi icon={Shapes} tone="bg-violet-600" label="Catégories" value={catCount} hint="Catégories différentes" />
        <Kpi icon={MapPin} tone="bg-emerald-600" label="Sites" value={siteCount} hint="Sites actifs" />
        <Kpi icon={WarehouseIcon} tone="bg-teal-600" label="Dépôts" value={depotCount} hint="Dépôts au total" />
        <Kpi icon={Database} tone="bg-[#0F3D68]" label="Valeur totale du stock" value={fmtMoney(totalValue)} hint="Au prix de revient" />
        <Kpi icon={AlertTriangle} tone="bg-amber-500" label="Stock faible" value={lowCount} hint="Sous le seuil minimum" />
        <Kpi icon={XCircle} tone="bg-red-600" label="Ruptures" value={outCount} hint="Stock à zéro" />
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

      {/* Stock par site */}
      <Card title="Stock par site" icon={MapPin}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {bySite.map((s) => {
            const pct = totalValue > 0 ? Math.round((s.value / totalValue) * 100) : 0;
            return (
              <div key={s.site} className="rounded-xl border border-slate-200 p-3">
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
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: BAR_COLOR }} />
                  </div>
                  <span className="w-9 text-right text-[11px] font-semibold tabular-nums text-slate-700">{pct} %</span>
                </div>
              </div>
            );
          })}
          {!bySite.length && <p className="text-xs text-slate-500">Aucun site pour ces filtres.</p>}
        </div>
      </Card>
    </div>
  );
}
