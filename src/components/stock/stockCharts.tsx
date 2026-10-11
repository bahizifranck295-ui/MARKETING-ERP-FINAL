import React, { useState } from "react";
import { fmtMoney } from "@/components/erp-ui";
import { compactMoney, niceScale } from "@/lib/chartScale";

export { compactMoney, niceScale };

/*
 * Calculs et graphiques du stock partagés entre la page Stock et le rapport
 * « État des Stocks ». Lecture seule : rien ici ne modifie un produit.
 */

export const CATEGORY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];
export const OTHER_COLOR = "#94a3b8";
export const BAR_COLOR = "#2a78d6";
export const EVOLUTION_DAYS = 30;


export const stockOf = (p: any) => Number(p.stock ?? p.current_stock ?? 0) || 0;
export const costOf = (p: any) => Number(p.cost_price) || 0;
export const thresholdOf = (p: any) => Number(p.low_stock_threshold ?? p.alert_threshold ?? 0) || 0;
export const categoryOf = (p: any) => (p.category && String(p.category).trim()) || "Sans catégorie";

export function statusOf(p: any) {
  const s = stockOf(p);
  if (s <= 0) return { key: "out", label: "Rupture", cls: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500", bar: "bg-red-500" };
  if (s <= thresholdOf(p)) return { key: "low", label: "Faible", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", bar: "bg-amber-500" };
  return { key: "ok", label: "Normal", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", bar: "bg-gradient-to-r from-cyan-400 to-emerald-500" };
}

// Valeur du stock reconstituée jour par jour : le stock est déduit à
// l'approbation d'une commande, donc avant cette date la valeur comptait
// ces quantités en plus.
export function computeEvolution(products: any[], orders: any[], totalValue: number, days = EVOLUTION_DAYS) {
  const ids = new Set(products.map((p) => p.id));
  const cost = new Map(products.map((p) => [p.id, costOf(p)]));
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
  return Array.from({ length: days }, (_, k) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - k));
    const after = deductions.filter((x) => x.at > d.getTime()).reduce((s, x) => s + x.value, 0);
    return { date: d, value: totalValue + after };
  });
}

/* ---------- Graphiques (SVG, sans dépendance) ---------- */

export function BarsBySite({ rows }: { rows: Array<{ site: string; value: number }> }) {
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
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--color-slate-200)" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--color-slate-500)">
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
              <text x={cx} y={top - 6} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--color-slate-900)">
                {fmtMoney(r.value)}
              </text>
              <text x={cx} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--color-slate-700)">
                {r.site}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Donut({ slices, total }: { slices: Array<{ label: string; value: number; color: string }>; total: number }) {
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
        <text x={C} y={C - 2} textAnchor="middle" fontSize={14} fontWeight={800} fill="var(--color-slate-900)">
          {active ? `${Math.round((active.value / total) * 100)} %` : compactMoney(total)}
        </text>
        <text x={C} y={C + 14} textAnchor="middle" fontSize={9} fill="var(--color-slate-500)">
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

export function Evolution({ points }: { points: Array<{ date: Date; value: number }> }) {
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
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--color-slate-200)" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="var(--color-slate-500)">
              {compactMoney(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === last ? (
            <text key={i} x={x(i)} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--color-slate-500)">
              {p.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
            </text>
          ) : null
        )}
        <path d={area} fill="url(#stock-evo-fill)" />
        <path d={line} fill="none" stroke={BAR_COLOR} strokeWidth={2} strokeLinejoin="round" />
        <circle cx={x(last)} cy={y(points[last]?.value || 0)} r={4.5} fill={BAR_COLOR} stroke="var(--surface-primary)" strokeWidth={2} />
        {hp && (
          <g pointerEvents="none">
            <line x1={x(hover!)} x2={x(hover!)} y1={T} y2={T + plotH} stroke="var(--color-slate-400)" strokeDasharray="3 3" />
            <circle cx={x(hover!)} cy={y(hp.value)} r={4} fill={BAR_COLOR} stroke="var(--surface-primary)" strokeWidth={2} />
          </g>
        )}
        <rect x={L} y={T} width={plotW} height={plotH} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      <div className="absolute right-2 top-0 rounded-lg bg-brand px-2 py-1 text-[11px] font-bold text-white tabular-nums">
        {hp
          ? `${hp.date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} · ${fmtMoney(hp.value)}`
          : `Aujourd'hui · ${fmtMoney(points[last]?.value || 0)}`}
      </div>
    </div>
  );
}
