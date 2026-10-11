import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Minus, PackageX, type LucideIcon } from "lucide-react";
import { fmtMoney } from "@/components/erp-ui";
import { compactMoney, niceScale } from "@/lib/chartScale";

/*
 * Tableau de bord (Gestion commerciale) : cartes du jour comparées à la veille, ventes des N derniers
 * jours, produits en rupture et répartition des ventes par catégorie. Toutes les valeurs viennent de
 * GET /dashboard (données réelles, limitées au périmètre de l'utilisateur).
 */

export type Kpi = { today: number; yesterday: number };
export type DashRange = "day" | "week" | "month" | "year";
/** Période des indicateurs du tableau de bord : libellé du sélecteur, complément des cartes, comparaison */
export const DASH_RANGES: Array<{ id: DashRange; label: string; of: string; vs: string }> = [
  { id: "day", label: "Aujourd'hui", of: "du jour", vs: "hier" },
  { id: "week", label: "Cette semaine", of: "de la semaine", vs: "semaine précédente" },
  { id: "month", label: "Ce mois", of: "du mois", vs: "mois précédent" },
  { id: "year", label: "Cette année", of: "de l'année", vs: "année précédente" },
];

export type Overview = {
  cash_balance: { current_usd: number; cash_usd: number; cash_cdf: number; open_count: number };
  pending_deposits: { total_usd: number; orders_count: number; marketers_count: number };
  revenue: Kpi;
  net_profit: Kpi;
  receipts: Kpi;
  sales_count: Kpi;
  clients: Kpi;
  days: number;
  series: Array<{ date: string; total: number; count: number }>;
  period_total: number;
  by_category: Array<{ category: string; total: number }>;
  out_of_stock: Array<{ id: string; name: string; category: string; image_url?: string }>;
};

/* ---------------- Cartes statistiques ---------------- */
/** Carte cliquable vers son module source (si l'utilisateur y a accès), sinon simple bloc */
export function CardLink({ to, className = "", children, ...rest }: { to?: string | null; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  if (!to) return <div className={className} {...(rest as any)}>{children}</div>;
  return (
    <Link to={to} className={`${className} transition-transform hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`} data-dash-link={to} {...(rest as any)}>
      {children}
    </Link>
  );
}
const TONES = {
  blue: "linear-gradient(135deg, var(--accent-blue) 0%, #2563eb 100%)",
  green: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
  teal: "linear-gradient(135deg, #0891b2 0%, #0e7490 100%)",
  red: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
  orange: "linear-gradient(135deg, #f59e0b 0%, #ea7a0c 100%)",
  violet: "linear-gradient(135deg, var(--accent-violet) 0%, var(--accent-deep) 100%)",
} as const;

function Trend({ k, vs = "hier" }: { k: Kpi; vs?: string }) {
  const { today: t, yesterday: y } = k;
  if (!y) {
    return (
      <span className="inline-flex items-center gap-1">
        {t > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
        {t > 0 ? `Aucune valeur ${vs}` : `Stable vs ${vs}`}
      </span>
    );
  }
  const pct = ((t - y) / Math.abs(y)) * 100;
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(pct).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % vs {vs}
    </span>
  );
}

export function StatCard({ label, value, k, sub, icon: Icon, tone, to, vs }: { label: string; value: string; k?: Kpi; sub?: string; icon: LucideIcon; tone: keyof typeof TONES; to?: string | null; vs?: string }) {
  return (
    <CardLink to={to} className="relative block overflow-hidden rounded-2xl p-4 text-white shadow-md" style={{ backgroundImage: TONES[tone] }} data-dash-kpi={tone}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 pt-0.5 text-[12px] font-medium leading-tight text-white/85">{label}</div>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
      <div className="mt-1 whitespace-nowrap text-[clamp(18px,1.6vw,24px)] font-bold leading-tight tracking-tight tabular-nums" title={value}>
        {value}
      </div>
      <div className="mt-3 text-[11px] font-medium text-white/85">
        {k ? <Trend k={k} vs={vs} /> : sub}
      </div>
    </CardLink>
  );
}

/* ---------------- Cadre des panneaux ---------------- */
function Panel({ title, right, children, ...rest }: { title: string; right?: React.ReactNode; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-xs" {...rest}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/* ---------------- Ventes des N derniers jours (courbe) ---------------- */
const WEEKDAYS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export function SalesLineChart({ data, days, onDays }: { data: Overview["series"]; days: number; onDays: (d: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 190, padL = 44, padR = 10, padT = 10, padB = 24;
  const scale = niceScale(Math.max(...data.map((d) => d.total), 0));
  const W = Math.max(width, 240);
  const x = (i: number) => padL + (data.length > 1 ? (i * (W - padL - padR)) / (data.length - 1) : (W - padL - padR) / 2);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / scale.max);
  const pts = data.map((d, i) => [x(i), y(d.total)] as const);
  const path = pts.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join(" ");
  const area = pts.length ? `${path} L${pts[pts.length - 1][0]},${y(0)} L${pts[0][0]},${y(0)} Z` : "";
  const label = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return days <= 7 ? WEEKDAYS[d.getDay()] : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  };
  const every = days <= 7 ? 1 : days <= 14 ? 2 : 5;
  const h = hover !== null ? data[hover] : null;

  return (
    <Panel
      title={`Ventes des ${days} derniers jours`}
      data-dash-sales
      right={
        <select
          value={days}
          onChange={(e) => onDays(Number(e.target.value))}
          aria-label="Période"
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
        >
          {[7, 14, 30].map((d) => (
            <option key={d} value={d}>
              {d} jours
            </option>
          ))}
        </select>
      }
    >
      <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={W} height={H} role="img" aria-label={`Ventes des ${days} derniers jours`}>
            <defs>
              <linearGradient id="dashArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {scale.ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeDasharray={t ? "3 4" : undefined} />
                <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--chart-text)">
                  {compactMoney(t)}
                </text>
              </g>
            ))}
            <path d={area} fill="url(#dashArea)" />
            <path d={path} fill="none" stroke="var(--accent-blue)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {pts.map(([px, py], i) => (
              <g key={i}>
                <circle cx={px} cy={py} r={hover === i ? 5 : 3.5} fill="var(--surface-primary)" stroke="var(--accent-blue)" strokeWidth="2" />
                {i % every === 0 || i === data.length - 1 ? (
                  <text x={px} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--chart-text)">
                    {label(data[i].date)}
                  </text>
                ) : null}
                <rect x={px - (W - padL - padR) / Math.max(data.length - 1, 1) / 2} y={0} width={(W - padL - padR) / Math.max(data.length - 1, 1)} height={H - padB} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            ))}
          </svg>
        )}
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] shadow-md"
            style={{ left: pts[hover][0], top: Math.max(pts[hover][1] - 52, 0) }}
          >
            <div className="font-semibold text-slate-900">{new Date(h.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" })}</div>
            <div className="tabular-nums text-slate-600">
              {fmtMoney(h.total)} · {h.count} vente(s)
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ---------------- Produits en rupture de stock ---------------- */
export function OutOfStockPanel({ items }: { items: Overview["out_of_stock"] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 3);
  return (
    <Panel
      title="Produits en rupture de stock"
      data-dash-rupture
      right={
        items.length > 3 ? (
          <button type="button" onClick={() => setAll((v) => !v)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            {all ? "Réduire" : "Voir tout"}
          </button>
        ) : null
      }
    >
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center text-xs text-slate-500">
          <PackageX className="h-7 w-7 text-slate-300" />
          Aucun produit en rupture de stock.
        </div>
      ) : (
        <ul className={`divide-y divide-slate-100 ${all ? "max-h-[260px] overflow-y-auto pr-1" : ""}`}>
          {shown.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5" data-dash-rupture-item>
              <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {p.image_url ? <img src={p.image_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <PackageX className="h-4 w-4 text-slate-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-slate-900" data-no-translate>
                  {p.name}
                </div>
                <div className="truncate text-[11px] text-slate-500">
                  Catégorie : <span data-no-translate>{p.category || "Sans catégorie"}</span>
                </div>
              </div>
              <div className="shrink-0 text-[11px] text-slate-600">
                Stock : <span className="font-bold text-red-600">0</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------------- Répartition des ventes (anneau) ---------------- */
const PALETTE = ["var(--accent-blue)", "#16a34a", "#f59e0b", "var(--accent-violet)"];
const OTHER = "var(--icon-secondary)";

export function SalesDonut({ byCategory, total, days }: { byCategory: Overview["by_category"]; total: number; days: number }) {
  const slices = useMemo(() => {
    const sum = byCategory.reduce((t, c) => t + c.total, 0);
    if (sum <= 0) return [];
    const top = byCategory.slice(0, 3).map((c, i) => ({ label: c.category, value: c.total, color: PALETTE[i], own: true }));
    const rest = byCategory.slice(3).reduce((t, c) => t + c.total, 0);
    if (rest > 0) top.push({ label: "Autres", value: rest, color: OTHER, own: false });
    return top.map((s) => ({ ...s, pct: (s.value / sum) * 100 }));
  }, [byCategory]);
  const R = 62, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <Panel title="Répartition des ventes" data-dash-donut right={<span className="text-[11px] text-slate-500">{days} derniers jours</span>}>
      {slices.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8 text-xs text-slate-500">Aucune vente sur la période.</div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row sm:justify-center lg:flex-col xl:flex-row">
          <div className="relative h-[170px] w-[170px] shrink-0">
            <svg viewBox="0 0 170 170" className="h-full w-full -rotate-90" role="img" aria-label="Répartition des ventes par catégorie">
              <circle cx="85" cy="85" r={R} fill="none" stroke="var(--chart-grid)" strokeWidth="24" />
              {slices.map((s) => {
                const len = (s.pct / 100) * C;
                const el = <circle key={s.label} cx="85" cy="85" r={R} fill="none" stroke={s.color} strokeWidth="24" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />;
                acc += len;
                return el;
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <div className="text-[15px] font-bold leading-tight text-slate-900 tabular-nums">{compactMoney(total)}</div>
              <div className="text-[10px] text-slate-500">Total ventes</div>
            </div>
          </div>
          <ul className="w-full min-w-0 space-y-2 sm:w-auto">
            {slices.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-[12px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate text-slate-700" {...(s.own ? { "data-no-translate": true } : {})}>
                  {s.label}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">{Math.round(s.pct)} %</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
