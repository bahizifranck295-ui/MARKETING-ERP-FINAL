import { useState } from "react";
import { Image as ImageIcon } from "lucide-react";

/* Éléments visuels communs aux écrans du module Stock */

export function GlassCard({ title, icon: Icon, children, right }: any) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_10px_30px_-18px_rgba(15,61,104,0.35)] backdrop-blur">
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
              {Icon && (
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-cyan-50 to-blue-100 text-[#0F3D68]">
                  <Icon className="h-4 w-4" />
                </span>
              )}
              {title}
            </h3>
          )}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function KpiTile({ icon: Icon, glow, label, value, hint, active, onClick, className = "", valueClassName = "text-lg" }: any) {
  const clickable = typeof onClick === "function";
  const Tag: any = clickable ? "button" : "div";
  return (
    <Tag
      {...(clickable ? { type: "button", onClick, "aria-pressed": !!active } : {})}
      className={`${className} group relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-2xl border bg-white/90 p-3.5 text-left shadow-[0_10px_30px_-18px_rgba(15,61,104,0.35)] transition-all ${
        active ? "border-cyan-400 ring-2 ring-cyan-300/50" : "border-slate-200/80"
      } ${clickable ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-16px_rgba(15,61,104,0.45)]" : ""}`}
    >
      <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${glow} text-white shadow-[0_8px_20px_-8px_rgba(15,61,104,0.7)]`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <span className={`${valueClassName} break-words font-black leading-tight tracking-tight text-slate-900 tabular-nums`}>{value}</span>
      <span className={`truncate text-[11px] ${active ? "font-semibold text-cyan-700" : "text-slate-500"}`}>{hint}</span>
    </Tag>
  );
}

// Statut d'un produit : la rupture fait partie du « Stock faible »
export function stockStatus(quantity: number, threshold: number) {
  return quantity <= threshold
    ? { key: "low" as const, label: "Stock faible", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500", bar: "bg-amber-500" }
    : { key: "ok" as const, label: "Normal", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", bar: "bg-gradient-to-r from-cyan-400 to-emerald-500" };
}

export function StatusPill({ status }: { status: { label: string; cls: string; dot: string } }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
      {status.label}
    </span>
  );
}

export function ActivePill({ active }: { active: boolean }) {
  return (
    <StatusPill
      status={
        active
          ? { label: "Actif", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" }
          : { label: "Inactif", cls: "bg-slate-100 text-slate-500 border-slate-200", dot: "bg-slate-400" }
      }
    />
  );
}

export const fieldCls =
  "mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/25";

export function fmtDateTime(s?: string) {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return s;
  }
}

// Photo du produit, avec une icône neutre si elle est absente ou ne charge pas
export function ProductPhoto({ src, className = "h-9 w-9" }: { src?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`${className} shrink-0 rounded-lg border border-slate-200 object-cover`} />;
  }
  return (
    <span className={`${className} grid shrink-0 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400`}>
      <ImageIcon className="h-4 w-4 opacity-50" />
    </span>
  );
}
