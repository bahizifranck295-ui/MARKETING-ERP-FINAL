import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { IS_COMMERCIAL } from "@/app/edition";

/*
 * Retour au module précédent : trace des pages visitées dans la session (hors connexion), tenue par
 * useNavTrail() dans la mise en page. Sans page précédente, retour au tableau de bord.
 */
const navTrail: string[] = [];
export function useNavTrail() {
  const loc = useLocation();
  React.useEffect(() => {
    if (loc.pathname === "/login") return;
    if (navTrail[navTrail.length - 1] !== loc.pathname + loc.search) navTrail.push(loc.pathname + loc.search);
    if (navTrail.length > 50) navTrail.splice(0, navTrail.length - 50);
  }, [loc.pathname, loc.search]);
}
export function previousPage(): string | null {
  return navTrail.length > 1 ? navTrail[navTrail.length - 2] : null;
}
export function BackButton({ fallback = "/dashboard", onlyIfHistory = false }: { fallback?: string; onlyIfHistory?: boolean }) {
  const navigate = useNavigate();
  useLocation(); // re-rendu à chaque navigation
  const prev = previousPage();
  if (onlyIfHistory && !prev) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (prev) {
          navTrail.pop(); // page actuelle
          navTrail.pop(); // la page précédente sera de nouveau inscrite à l'arrivée
          navigate(prev);
        } else navigate(fallback);
      }}
      aria-label="Retour au module précédent"
      title="Retour au module précédent"
      data-back-button
      className="hdr-btn h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
    >
      <ArrowLeft className="h-4 w-4" />
    </button>
  );
}

export function PageHeader({
  title,
  subtitle,
  back = "/dashboard",
  right,
}: {
  title: string;
  subtitle?: string;
  back?: string | null;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {back && <BackButton fallback={back} />}
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 truncate">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/*
 * Carte indicateur (KPI) du design system : surface + fine bande verticale.
 * blue = indicateur principal (violet en clair / bleu électrique en sombre), slate = secondaire (cyan),
 * green / red = statut (succès / alerte) : le sens des couleurs de statut est conservé dans les deux thèmes.
 */
export function KpiCard({ label, value, sub, tone = "blue" }: { label: string; value: string; sub?: string; tone?: "blue" | "green" | "red" | "slate" }) {
  const band = { blue: "var(--accent-primary)", slate: "var(--accent-secondary)", green: "var(--color-emerald-500)", red: "var(--color-red-500)" }[tone];
  return (
    <div className="kpi-card rounded-2xl p-4 pl-5" data-band={tone === "blue" ? "brand" : tone} style={{ ["--kpi-band" as any]: band }}>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 tracking-tight tabular-nums ${tone === "red" ? "text-red-600" : "text-slate-900"}`}>{value}</div>
      {sub && <div className="text-xs mt-0.5 text-slate-500">{sub}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon?: any;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white border border-dashed border-slate-200 py-12 px-6 text-center">
      {Icon && (
        <div className="mx-auto h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div className="text-sm font-medium text-slate-800">{title}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "slate",
  onClick,
  className = "",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "blue" | "green" | "amber" | "red" | "slate";
  onClick?: () => void;
  className?: string;
}) {
  const tones = {
    blue: "bg-brand text-white",
    green: "bg-emerald-600 text-white",
    amber: "bg-amber-500 text-white",
    red: "bg-red-600 text-white",
    slate: "bg-white text-slate-900 border border-slate-200 shadow-xs",
  };
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-4 ${tones[tone]} ${
        onClick ? "cursor-pointer select-none transition-all active:scale-[0.98]" : ""
      } ${className}`}
    >
      <div
        className={`text-[11px] uppercase tracking-wider font-semibold ${
          tone === "slate" ? "text-slate-500" : "text-white/70"
        }`}
      >
        {label}
      </div>
      <div className="text-xl font-bold tracking-tight mt-1">{value}</div>
      {sub && (
        <div
          className={`text-xs mt-0.5 ${
            tone === "slate" ? "text-slate-500" : "text-white/80"
          }`}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

export function fmtMoney(n: any, currency = "USD") {
  if (n === null || n === undefined || isNaN(Number(n))) return "0.00 $";
  if (currency === "CDF" || currency === "FC") {
    return `${Math.round(Number(n)).toLocaleString("fr-FR")} FC`;
  }
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(Number(n));
  } catch {
    return `${Number(n).toFixed(2)} $`;
  }
}

export function fmtNum(n: any, digits = 0) {
  if (n === null || n === undefined || isNaN(Number(n))) return "0";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(
    Number(n)
  );
}

export function fmtDate(s: any, withTime = true) {
  if (!s) return "-";
  try {
    const opts: Intl.DateTimeFormatOptions = withTime
      ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short", year: "numeric" };
    return new Date(s).toLocaleString("fr-FR", opts);
  } catch {
    return String(s);
  }
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { fr: string; tone: "slate" | "blue" | "green" | "amber" | "red" }> = {
    draft: { fr: "Brouillon", tone: "slate" },
    pending: { fr: "En attente", tone: "amber" },
    pending_approval: { fr: "En attente", tone: "amber" },
    validated: { fr: "Validée", tone: "blue" },
    prepared: { fr: "Préparée", tone: "blue" },
    shipped: { fr: "Expédiée", tone: "blue" },
    delivered: { fr: "Livrée", tone: "green" },
    cancelled: { fr: "Annulée", tone: "red" },
    rejected: { fr: "Rejetée", tone: "red" },
    paid: { fr: "Payée", tone: "green" },
    partial: { fr: "Partielle", tone: "amber" },
    unpaid: { fr: "Impayée", tone: "red" },
    open: { fr: "Ouvert", tone: "amber" },
    closed: { fr: "Clôturé", tone: "slate" },
  };
  // Gestion commerciale : les étapes logistiques (préparée, expédiée, livrée) relèvent du projet
  // Stock & Livraison ; côté commercial, la commande est simplement « Validée »
  const shown = IS_COMMERCIAL && (status === "prepared" || status === "shipped" || status === "delivered") ? "validated" : status;
  const m = map[shown] || { fr: status, tone: "slate" };
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-brand/10 text-brand",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border border-amber-100",
    red: "bg-red-50 text-red-700 border border-red-100",
  };
  return (
    <span
      className={`inline-flex items-center text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full ${
        tones[m.tone]
      }`}
    >
      {m.fr}
    </span>
  );
}
