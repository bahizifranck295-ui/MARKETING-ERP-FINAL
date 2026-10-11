import { useMemo, useState } from "react";
import { BarChart3, Layers, LineChart, MapPin, PieChart, ShoppingCart, Tag, TrendingDown, TrendingUp, Trophy, Wallet, Package } from "lucide-react";
import { fmtMoney } from "@/components/erp-ui";
import { compactMoney, niceScale } from "@/lib/chartScale";

/*
 * Vue d'ensemble du module Rapports (sous la barre de recherche).
 * Lecture seule : graphiques calculés à partir des commandes, des opérations de caisse et des produits réels.
 */

type Kpi = { sales: number; gross: number; expenses: number; net: number };
type Props = {
  /** Commandes filtrées (site, unité, recherche) toutes dates confondues */
  orders: any[];
  /** Commandes de la période choisie en haut de page */
  periodOrders: any[];
  /** Opérations de caisse filtrées (site, recherche) toutes dates confondues */
  cashOps: any[];
  products: any[];
  siteOfOrder: (o: any) => string;
  kpiCur: Kpi;
  kpiPrev: Kpi;
  prevLabel: string;
};

const RANGES = [
  { id: "7j", days: 7, step: 1 },
  { id: "30j", days: 30, step: 1 },
  { id: "3m", days: 91, step: 7 },
  { id: "6m", days: 182, step: 7 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const BLUE = "#2563eb";
const GREEN = "#16a34a";
const RED = "#ef4444";
const SITE_COLORS = ["#2563eb", "#14b8a6", "#f59e0b", "#8b5cf6", "#ec4899", "#0ea5e9"];
const OTHER = "#94a3b8";
const TOP_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#8b5cf6", "#14b8a6"];

const usdOf = (c: any) => Number(c.amount_usd || (c.currency === "USD" ? c.amount : c.amount / (c.exchange_rate || 2500))) || 0;
const fmtDay = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

// Tranches de dates (jours ou semaines) se terminant aujourd'hui
function buckets(range: RangeId) {
  const r = RANGES.find((x) => x.id === range)!;
  const n = Math.ceil(r.days / r.step);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return Array.from({ length: n }, (_, k) => {
    const to = new Date(end);
    to.setDate(end.getDate() - (n - 1 - k) * r.step);
    const from = new Date(to);
    from.setDate(to.getDate() - r.step + 1);
    from.setHours(0, 0, 0, 0);
    return { from: from.getTime(), to: to.getTime(), label: fmtDay(r.step === 1 ? to : from) };
  });
}

function Card({ title, sub, icon: Icon, right, children, className = "" }: any) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-xs ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="text-[11px] text-slate-500">{sub}</p>
          </div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function RangeTabs({ value, onChange }: { value: RangeId; onChange: (v: RangeId) => void }) {
  return (
    <div role="group" aria-label="Période du graphique" className="inline-flex rounded-xl border border-slate-200 p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          aria-pressed={value === r.id}
          onClick={() => onChange(r.id)}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${value === r.id ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          {r.id}
        </button>
      ))}
    </div>
  );
}

function Legend({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="mb-1 flex justify-end gap-4 text-[11px] text-slate-600">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

const W = 560, H = 230, L = 52, R = 10, T = 12, B = 26;
const plotW = W - L - R, plotH = H - T - B;

function Axes({ ticks, max, labels }: { ticks: number[]; max: number; labels: string[] }) {
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const slot = plotW / Math.max(labels.length, 1);
  const every = Math.max(1, Math.ceil(labels.length / 7));
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e2e8f0" />
          <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#64748b">
            {compactMoney(t)}
          </text>
        </g>
      ))}
      {labels.map((l, i) =>
        i % every === 0 || i === labels.length - 1 ? (
          <text key={i} x={L + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#64748b">
            {l}
          </text>
        ) : null
      )}
    </>
  );
}

function Tip({ lines }: { lines: string[] | null }) {
  if (!lines) return null;
  return (
    <div className="pointer-events-none absolute left-14 top-0 rounded-lg bg-[#0F3D68] px-2 py-1 text-[11px] font-semibold text-white tabular-nums">
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

// Ventes (barres) et bénéfices (courbe) par tranche
function SalesProfitChart({ rows }: { rows: Array<{ label: string; sales: number; profit: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const { max, ticks } = niceScale(Math.max(0, ...rows.map((r) => Math.max(r.sales, r.profit))));
  const slot = plotW / Math.max(rows.length, 1);
  const barW = Math.max(2, Math.min(22, slot * 0.55));
  const y = (v: number) => T + plotH - (Math.max(v, 0) / max) * plotH;
  const cx = (i: number) => L + slot * i + slot / 2;
  const line = rows.map((r, i) => `${i ? "L" : "M"}${cx(i)},${y(r.profit)}`).join(" ");
  const area = rows.length ? `${line} L${cx(rows.length - 1)},${T + plotH} L${cx(0)},${T + plotH} Z` : "";
  const h = hover !== null ? rows[hover] : null;
  return (
    <div className="relative">
      <Tip lines={h ? [h.label, `Ventes : ${fmtMoney(h.sales)}`, `Bénéfices : ${fmtMoney(h.profit)}`] : null} />
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Évolution des ventes et bénéfices">
        <defs>
          <linearGradient id="ov-profit-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity={0.18} />
            <stop offset="100%" stopColor={GREEN} stopOpacity={0.01} />
          </linearGradient>
        </defs>
        <Axes ticks={ticks} max={max} labels={rows.map((r) => r.label)} />
        {rows.map((r, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={cx(i) - slot / 2} y={T} width={slot} height={plotH} fill="transparent" />
            <rect x={cx(i) - barW / 2} y={y(r.sales)} width={barW} height={T + plotH - y(r.sales)} rx={Math.min(3, barW / 3)} fill={BLUE} opacity={hover === null || hover === i ? 1 : 0.55} />
          </g>
        ))}
        {area && <path d={area} fill="url(#ov-profit-fill)" pointerEvents="none" />}
        <path d={line} fill="none" stroke={GREEN} strokeWidth={2} strokeLinejoin="round" pointerEvents="none" />
        {rows.map((r, i) => (
          <circle key={i} cx={cx(i)} cy={y(r.profit)} r={rows.length > 40 ? 0 : 3} fill="#fff" stroke={GREEN} strokeWidth={2} pointerEvents="none" />
        ))}
      </svg>
    </div>
  );
}

// Entrées (vert) et sorties (rouge) de caisse par tranche
function CashChart({ rows }: { rows: Array<{ label: string; inn: number; out: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const { max, ticks } = niceScale(Math.max(0, ...rows.map((r) => Math.max(r.inn, r.out))));
  const slot = plotW / Math.max(rows.length, 1);
  const barW = Math.max(1.5, Math.min(14, slot * 0.32));
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const h = hover !== null ? rows[hover] : null;
  return (
    <div className="relative">
      <Tip lines={h ? [h.label, `Entrées : ${fmtMoney(h.inn)}`, `Sorties : ${fmtMoney(h.out)}`] : null} />
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Entrées et sorties de caisse">
        <Axes ticks={ticks} max={max} labels={rows.map((r) => r.label)} />
        {rows.map((r, i) => {
          const c = L + slot * i + slot / 2;
          const o = hover === null || hover === i ? 1 : 0.55;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={c - slot / 2} y={T} width={slot} height={plotH} fill="transparent" />
              <rect x={c - barW - 1} y={y(r.inn)} width={barW} height={T + plotH - y(r.inn)} rx={Math.min(2, barW / 3)} fill={GREEN} opacity={o} />
              <rect x={c + 1} y={y(r.out)} width={barW} height={T + plotH - y(r.out)} rx={Math.min(2, barW / 3)} fill={RED} opacity={o} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SitesDonut({ slices, total }: { slices: Array<{ label: string; value: number; color: string }>; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!total) return <p className="py-10 text-center text-xs text-slate-500">Aucune vente sur la période.</p>;
  const Ro = 74, Ri = 48, C = 90;
  let angle = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const span = (s.value / total) * Math.PI * 2;
    const a0 = angle, a1 = angle + span;
    angle = a1;
    const p = (rad: number, a: number) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
    const large = span > Math.PI ? 1 : 0;
    const d =
      span >= Math.PI * 2 - 0.001
        ? `M${C - Ro},${C} a${Ro},${Ro} 0 1,0 ${Ro * 2},0 a${Ro},${Ro} 0 1,0 ${-Ro * 2},0 M${C - Ri},${C} a${Ri},${Ri} 0 1,1 ${Ri * 2},0 a${Ri},${Ri} 0 1,1 ${-Ri * 2},0`
        : `M${p(Ro, a0)} A${Ro},${Ro} 0 ${large} 1 ${p(Ro, a1)} L${p(Ri, a1)} A${Ri},${Ri} 0 ${large} 0 ${p(Ri, a0)} Z`;
    const mid = a0 + span / 2;
    return { ...s, d, span, lx: C + ((Ro + Ri) / 2) * Math.cos(mid), ly: C + ((Ro + Ri) / 2) * Math.sin(mid) };
  });
  const pct = (v: number) => `${Math.round((v / total) * 100)}%`;
  return (
    <div className="@container">
    <div className="flex flex-col items-center gap-4 @md:flex-row">
      <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0" role="img" aria-label="Répartition des ventes par site">
        {arcs.map((a, i) => (
          <path key={a.label} d={a.d} fill={a.color} fillRule="evenodd" stroke="#fff" strokeWidth={1.5} opacity={hover === null || hover === i ? 1 : 0.45} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
        {arcs.map((a) =>
          a.span > 0.45 ? (
            <text key={a.label + "p"} x={a.lx} y={a.ly + 3} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff" pointerEvents="none">
              {pct(a.value)}
            </text>
          ) : null
        )}
        <text x={C} y={C - 2} textAnchor="middle" fontSize={13} fontWeight={800} fill="#0f172a">
          {compactMoney(hover !== null ? arcs[hover].value : total)}
        </text>
        <text x={C} y={C + 13} textAnchor="middle" fontSize={8.5} fill="#64748b">
          {hover !== null ? arcs[hover].label : "Total des ventes"}
        </text>
      </svg>
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {arcs.map((a, i) => (
          <li key={a.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={`flex items-center gap-2 rounded-md px-1 text-xs ${hover === i ? "bg-slate-50" : ""}`}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
            <span className="min-w-0 flex-1 truncate text-slate-700" data-no-translate={a.label === "Autres" ? undefined : true}>
              {a.label}
            </span>
            <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-slate-800">{fmtMoney(a.value)}</span>
            <span className="w-9 shrink-0 text-right tabular-nums text-slate-500">{pct(a.value)}</span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}

function ProductThumb({ src }: { src?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img src={src} alt="" onError={() => setBroken(true)} className="h-7 w-7 shrink-0 rounded-md object-cover" loading="lazy" />;
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
      <Package className="h-4 w-4" />
    </span>
  );
}

function Delta({ cur, prev, goodUp = true, points = false }: { cur: number; prev: number; goodUp?: boolean; points?: boolean }) {
  const diff = points ? cur - prev : Math.abs(prev) > 0.004 ? ((cur - prev) / Math.abs(prev)) * 100 : null;
  if (diff === null || !isFinite(diff)) return <span className="text-[11px] font-semibold text-slate-400">—</span>;
  const up = diff >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${up === goodUp ? "text-emerald-700" : "text-red-600"}`}>
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {up ? "+" : "−"}
      {Math.abs(diff).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
      {points ? " pt" : "%"}
    </span>
  );
}

export default function OverviewDashboard({ orders, periodOrders, cashOps, products, siteOfOrder, kpiCur, kpiPrev, prevLabel }: Props) {
  const avgBasket = periodOrders.length ? periodOrders.reduce((t: number, o: any) => t + (Number(o.total) || 0), 0) / periodOrders.length : 0;
  const [salesRange, setSalesRange] = useState<RangeId>("30j");
  const [cashRange, setCashRange] = useState<RangeId>("30j");
  const cost = useMemo(() => new Map(products.map((p) => [p.id, Number(p.cost_price) || 0])), [products]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const profitOf = (o: any) => (o.items || []).reduce((t: number, it: any) => t + (Number(it.quantity) || 0) * ((Number(it.unit_price) || 0) - (cost.get(it.product_id) || 0)), 0);

  const salesRows = useMemo(() => {
    const bs = buckets(salesRange).map((b) => ({ ...b, sales: 0, profit: 0 }));
    for (const o of orders) {
      const t = new Date(o.approved_at || o.created_at).getTime();
      const b = bs.find((x) => t >= x.from && t <= x.to);
      if (!b) continue;
      b.sales += Number(o.total) || 0;
      b.profit += profitOf(o);
    }
    return bs;
  }, [orders, salesRange, cost]);

  const cashRows = useMemo(() => {
    const bs = buckets(cashRange).map((b) => ({ ...b, inn: 0, out: 0 }));
    for (const c of cashOps) {
      const t = new Date(c.created_at).getTime();
      const b = bs.find((x) => t >= x.from && t <= x.to);
      if (!b) continue;
      if (c.type === "in") b.inn += usdOf(c);
      else if (c.type === "out") b.out += usdOf(c);
    }
    return bs;
  }, [cashOps, cashRange]);

  const siteSlices = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of periodOrders) m.set(siteOfOrder(o), (m.get(siteOfOrder(o)) || 0) + (Number(o.total) || 0));
    const sorted = [...m.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const head = sorted.length > 5 ? sorted.slice(0, 4) : sorted;
    const rest = sorted.length > 5 ? sorted.slice(4).reduce((s, [, v]) => s + v, 0) : 0;
    const slices = head.map(([label, value], i) => ({ label, value, color: SITE_COLORS[i % SITE_COLORS.length] }));
    if (rest > 0) slices.push({ label: "Autres", value: rest, color: OTHER });
    return slices;
  }, [periodOrders, siteOfOrder]);
  const siteTotal = siteSlices.reduce((s, x) => s + x.value, 0);

  const top = useMemo(() => {
    const m = new Map<string, { name: string; id: string; profit: number }>();
    for (const o of periodOrders)
      for (const it of o.items || []) {
        const key = it.product_id || it.product_name;
        const e = m.get(key) || { name: it.product_name || productById.get(it.product_id)?.name || "Produit", id: it.product_id, profit: 0 };
        e.profit += (Number(it.quantity) || 0) * ((Number(it.unit_price) || 0) - (cost.get(it.product_id) || 0));
        m.set(key, e);
      }
    const all = [...m.values()];
    const total = all.reduce((s, x) => s + x.profit, 0);
    return { rows: all.sort((a, b) => b.profit - a.profit).slice(0, 5), total };
  }, [periodOrders, productById, cost]);
  const topMax = Math.max(0, ...top.rows.map((r) => r.profit));

  const margin = kpiCur.sales > 0 ? (kpiCur.net / kpiCur.sales) * 100 : 0;
  const prevMargin = kpiPrev.sales > 0 ? (kpiPrev.net / kpiPrev.sales) * 100 : null;
  const summary = [
    { label: "Chiffre d'affaires (ventes)", icon: BarChart3, bg: "bg-blue-600", v: kpiCur.sales, p: kpiPrev.sales, goodUp: true },
    { label: "Bénéfice brut", icon: Layers, bg: "bg-emerald-600", v: kpiCur.gross, p: kpiPrev.gross, goodUp: true },
    { label: "Dépenses de caisse", icon: Wallet, bg: "bg-purple-600", v: kpiCur.expenses, p: kpiPrev.expenses, goodUp: false },
    { label: "Bénéfice net réel", icon: TrendingUp, bg: "bg-emerald-600", v: kpiCur.net, p: kpiPrev.net, goodUp: true },
  ];

  return (
    <div className="space-y-4" data-overview>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Évolution des ventes et bénéfices" sub="Chiffre d'affaires et bénéfice sur la période" icon={LineChart} right={<RangeTabs value={salesRange} onChange={setSalesRange} />}>
          <Legend items={[["Ventes", BLUE], ["Bénéfices", GREEN]]} />
          <SalesProfitChart rows={salesRows} />
        </Card>
        <Card
          title="Livre de caisse"
          sub="Entrées et sorties d'argent"
          icon={Wallet}
          right={
            <select aria-label="Période du livre de caisse" value={cashRange} onChange={(e) => setCashRange(e.target.value as RangeId)} className="h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700">
              {RANGES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id}
                </option>
              ))}
            </select>
          }
        >
          <Legend items={[["Entrées", GREEN], ["Sorties", RED]]} />
          <CashChart rows={cashRows} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card title="Répartition des ventes par site" sub="Chiffre d'affaires par site" icon={MapPin}>
          <SitesDonut slices={siteSlices} total={siteTotal} />
        </Card>

        <Card title="Top 5 produits par bénéfices" sub="Produits les plus rentables" icon={Tag}>
          {top.rows.length ? (
            <table className="w-full table-fixed text-left text-xs">
              <colgroup>
                <col className="w-6" />
                <col />
                <col className="w-[88px]" />
                <col className="w-[86px]" />
              </colgroup>
              <thead>
                <tr className="text-[11px] text-slate-500">
                  <th className="pb-2 pr-2 font-semibold">#</th>
                  <th className="pb-2 pr-2 font-semibold">Produit</th>
                  <th className="pb-2 pr-2 text-right font-semibold">Bénéfice</th>
                  <th className="pb-2 text-right font-semibold">% du total</th>
                </tr>
              </thead>
              <tbody>
                {top.rows.map((r, i) => {
                  const share = top.total > 0 ? (r.profit / top.total) * 100 : 0;
                  return (
                    <tr key={r.id || r.name} className="border-t border-slate-100">
                      <td className="py-2 pr-2 font-bold text-slate-700">{i + 1}.</td>
                      <td className="py-2 pr-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <ProductThumb src={productById.get(r.id)?.image_url} />
                          <span className="min-w-0 truncate font-medium text-slate-800" title={r.name} data-no-translate>
                            {r.name}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-2 text-right font-semibold tabular-nums text-slate-800">{fmtMoney(r.profit)}</td>
                      <td className="py-2">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-2 w-10 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${topMax > 0 ? Math.max(0, (r.profit / topMax) * 100) : 0}%`, background: TOP_COLORS[i] }} />
                          </div>
                          <span className="w-9 text-right tabular-nums text-slate-600">{Math.round(share)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="py-10 text-center text-xs text-slate-500">Aucune vente sur la période.</p>
          )}
        </Card>

        <Card title="Résumé global" sub="Chiffres clés de la période" icon={PieChart} className="lg:col-span-2 xl:col-span-1">
          <ul className="space-y-2.5">
            {summary.map((s) => {
              const Icon = s.icon;
              return (
                <li key={s.label} className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${s.bg}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-slate-500">{s.label}</div>
                    <div className={`text-sm font-bold tabular-nums ${s.v < 0 ? "text-red-600" : "text-slate-900"}`}>{fmtMoney(s.v)}</div>
                  </div>
                  <Delta cur={s.v} prev={s.p} goodUp={s.goodUp} />
                </li>
              );
            })}
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white">
                <ShoppingCart className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-slate-500">Panier moyen ({periodOrders.length} commande{periodOrders.length > 1 ? "s" : ""})</div>
                <div className="text-sm font-bold tabular-nums text-slate-900">{fmtMoney(avgBasket)}</div>
              </div>
            </li>
          </ul>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <Trophy className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-slate-600">Taux de marge bénéficiaire (net)</div>
              <div className={`text-lg font-black tabular-nums ${margin < 0 ? "text-red-600" : "text-slate-900"}`}>
                {margin.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%
              </div>
            </div>
            <div className="text-right">
              {prevMargin === null ? <span className="text-[11px] font-semibold text-slate-400">—</span> : <Delta cur={margin} prev={prevMargin} points />}
              <div className="text-[10px] text-slate-500">{prevLabel}</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
