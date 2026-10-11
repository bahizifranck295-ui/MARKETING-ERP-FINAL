/* Éléments visuels du module Livraison */

export function SectionTitle({ n, title, subtitle, tone = "bg-emerald-600" }: { n: number; title: string; subtitle: string; tone?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-base font-black text-white shadow-[0_8px_18px_-8px_rgba(15,61,104,0.8)] ${tone}`}>{n}</span>
      <div className="min-w-0">
        <h2 className="text-lg font-black tracking-tight text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

// Jauge circulaire de remplissage (camion)
export function RingGauge({ pct, size = 76 }: { pct: number | null; size?: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct ?? 0));
  const color = v >= 90 ? "#dc2626" : v >= 70 ? "#f59e0b" : "#10b981";
  return (
    <svg viewBox="0 0 76 76" width={size} height={size} role="img" aria-label={pct === null ? "Capacité non définie" : `Rempli à ${v} %`}>
      <circle cx="38" cy="38" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      {pct !== null && (
        <circle cx="38" cy="38" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 38 38)" />
      )}
      <text x="38" y="42" textAnchor="middle" fontSize="14" fontWeight="800" fill="#0f172a">
        {pct === null ? "—" : `${v}%`}
      </text>
    </svg>
  );
}

// Illustration d'un camion dont la caisse se remplit selon le chargement
export function TruckIllustration({ fill, plate, className = "h-24 w-auto" }: { fill: number | null; plate?: string; className?: string }) {
  const v = Math.max(0, Math.min(100, fill ?? 0));
  const boxH = 54;
  const level = (v / 100) * (boxH - 6);
  return (
    <svg viewBox="0 0 200 100" className={className} role="img" aria-label={`Camion${plate ? ` ${plate}` : ""}${fill !== null ? `, chargé à ${v} %` : ""}`}>
      <defs>
        <linearGradient id="trk-body" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="trk-load" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="92" rx="88" ry="5" fill="#0f172a" opacity="0.08" />
      {/* caisse */}
      <rect x="8" y="16" width="120" height={boxH + 6} rx="6" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
      <rect x="11" y={16 + 3 + (boxH - level)} width="114" height={level} rx="3" fill="url(#trk-load)" opacity="0.85" />
      {[40, 72, 104].map((x) => (
        <line key={x} x1={x} x2={x} y1="19" y2={16 + boxH + 3} stroke="#e2e8f0" strokeWidth="1.5" />
      ))}
      {/* cabine */}
      <path d="M132 34 h34 l20 22 v24 h-54 z" fill="url(#trk-body)" />
      <path d="M140 40 h22 l13 15 h-35 z" fill="#dbeafe" />
      <rect x="132" y="74" width="60" height="6" rx="2" fill="#1e3a8a" />
      {plate && (
        <g>
          <rect x="160" y="62" width="30" height="9" rx="2" fill="#fef9c3" stroke="#a16207" strokeWidth="0.8" />
          <text x="175" y="69" textAnchor="middle" fontSize="6" fontWeight="700" fill="#713f12">
            {plate.slice(0, 9)}
          </text>
        </g>
      )}
      {/* roues */}
      {[34, 104, 166].map((x) => (
        <g key={x}>
          <circle cx={x} cy="82" r="10" fill="#1e293b" />
          <circle cx={x} cy="82" r="4" fill="#94a3b8" />
        </g>
      ))}
    </svg>
  );
}

export const MOVE_TYPES: Record<string, { label: string; cls: string }> = {
  load: { label: "Chargement", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  sale: { label: "Vente", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  return: { label: "Retour dépôt", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  adjust: { label: "Ajustement", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

export function TypePill({ type }: { type: string }) {
  const t = MOVE_TYPES[type] || { label: type, cls: "bg-slate-50 text-slate-600 border-slate-200" };
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${t.cls}`}>{t.label}</span>;
}

export const selectCls =
  "mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:bg-slate-50 disabled:text-slate-400";
