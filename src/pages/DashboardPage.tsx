import React, { useEffect, useState } from "react";
import { BackButton } from "@/components/erp-ui";
import { MULTI_SITE } from "@/app/edition";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ShoppingBag, TrendingUp, HandCoins, Users, Wallet, Loader2 } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtMoney, KpiCard } from "@/components/erp-ui";
import { CardLink, DASH_RANGES, OutOfStockPanel, SalesDonut, SalesLineChart, StatCard, type DashRange, type Overview } from "@/components/dashboard/DashboardOverview";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Bell } from "lucide-react";

export default function DashboardPage() {
  const { user, role, has } = useAuth();
  const [k, setK] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [days, setDays] = useState(7);
  // Période des indicateurs (en-tête) : aujourd'hui, cette semaine, ce mois ou cette année
  const [range, setRange] = useState<DashRange>(() => {
    try {
      const v = sessionStorage.getItem("dash_range");
      return v === "week" || v === "month" || v === "year" ? v : "day";
    } catch {
      return "day";
    }
  });
  const R = DASH_RANGES.find((x) => x.id === range) || DASH_RANGES[0];

  useEffect(() => {
    let ok = true;
    // Indicateurs : uniquement avec la permission « Voir les indicateurs »
    (has("dashboard.read") ? api.get("/dashboard", { params: { days, range } }) : Promise.resolve({ data: null }))
      .then((r) => ok && setK(r.data))
      .catch((e) => toast.error(extractErrorMessage(e, "KPI indisponibles")))
      .finally(() => ok && setLoading(false));
    return () => {
      ok = false;
    };
  }, [days, range]);
  useEffect(() => {
    try {
      sessionStorage.setItem("dash_range", range);
    } catch {
      /* stockage indisponible : la période revient à « Aujourd'hui » au prochain chargement */
    }
  }, [range]);

  useEffect(() => {
    api
      .get("/notifications", { params: { unread_only: true, limit: 50 } })
      .then((r) => setUnread(r.data.length))
      .catch(() => setUnread(0));
  }, []);

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const initials = (user?.full_name || "")
    .split(" ")
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const o: Overview | undefined = k?.overview;

  return (
    <div className="space-y-5">
      {/* En-tête : titre, langue, thème, notifications et utilisateur */}
      <div className="flex flex-wrap items-center justify-between gap-3" data-dash-header>
        <div className="flex min-w-0 items-center gap-2">
          <BackButton onlyIfHistory />
          <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tableau de bord</h1>
          <p className="text-xs capitalize text-slate-500">{today}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {has("dashboard.read") && (
            <div role="group" aria-label="Période des indicateurs" className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1" data-dash-range>
              {DASH_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={range === r.id}
                  onClick={() => setRange(r.id)}
                  className={`h-8 rounded-lg px-3 text-xs font-bold transition-colors ${range === r.id ? "border-brand bg-brand text-white" : "text-slate-700 hover:text-slate-900"}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          <LanguageSwitcher />
          <ThemeToggle />
          <Link
            to="/notifications"
            title="Notifications"
            className="hdr-btn relative grid h-9 w-9 place-items-center rounded-full"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <Link to="/profile" className="ml-1 flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 hover:bg-slate-100" title={role?.name || user?.role_code}>
            {user?.photo_url ? (
              <img src={user.photo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-xs font-bold text-white">{initials}</span>
            )}
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-[11px] text-slate-500">Bonjour,</span>
              <span className="block max-w-[160px] truncate text-[13px] font-bold text-slate-900" data-no-translate>
                {user?.full_name}
              </span>
            </span>
          </Link>
        </div>
      </div>

      {/* Indicateurs réels */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : o ? (
        <>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard label={`Chiffre d'affaires ${R.of}`} value={fmtMoney(o.revenue.today)} k={o.revenue} vs={R.vs} icon={Wallet} tone="blue" to={has("orders.read") ? "/orders" : null} />
            <StatCard label={`Bénéfice net réel ${R.of}`} value={fmtMoney(o.net_profit.today)} k={o.net_profit} vs={R.vs} icon={TrendingUp} tone="green" to={has("reports.read") ? `/reports?period=${range}` : null} />
            <StatCard label="Créances" value={fmtMoney(k.debts?.total)} sub={`${k.debts?.clients ?? 0} client(s)`} icon={HandCoins} tone="red" to={has("credits.read") ? "/credits" : null} />
            <StatCard label={`Nombre de ventes ${R.of}`} value={o.sales_count.today.toLocaleString("fr-FR")} k={o.sales_count} vs={R.vs} icon={ShoppingBag} tone="orange" to={has("orders.read") ? "/orders" : null} />
            <StatCard label="Nombre de clients" value={o.clients.today.toLocaleString("fr-FR")} k={o.clients} icon={Users} tone="violet" to={has("crm.read") ? "/clients" : null} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SalesLineChart data={o.series} days={o.days} onDays={setDays} />
            <OutOfStockPanel items={o.out_of_stock} />
            <SalesDonut byCategory={o.by_category} total={o.period_total} days={o.days} />
          </div>
          {/* Suivi : solde de caisse, versements en attente, sorties de caisse */}
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3" data-dash-follow>
            <CardLink to={has("cash.read") ? "/cash" : null} className="block rounded-2xl">
              <KpiCard
                label="Solde actuel en caisse"
                value={fmtMoney(o.cash_balance.current_usd)}
                sub={`${fmtMoney(o.cash_balance.cash_usd)} · ${fmtMoney(o.cash_balance.cash_cdf, "CDF")}${MULTI_SITE ? ` · ${o.cash_balance.open_count} caisse(s) ouverte(s)` : ""}`}
                tone="green"
              />
            </CardLink>
            <CardLink to={has("cash.read") ? "/cash?tab=marketers" : null} className="block rounded-2xl">
              <KpiCard
                label="Versements en attente"
                value={fmtMoney(o.pending_deposits.total_usd)}
                sub={`${o.pending_deposits.orders_count} vente(s) au comptant pas encore versée(s) en caisse · ${o.pending_deposits.marketers_count} vendeur(s)`}
                tone={o.pending_deposits.total_usd > 0 ? "red" : "slate"}
              />
            </CardLink>
            <CardLink to={has("cash.read") ? "/cash" : null} className="block rounded-2xl">
              <KpiCard label="Sorties de caisse" value={fmtMoney(k.cash?.today_out)} sub="Aujourd'hui" tone="slate" />
            </CardLink>
          </div>
        </>
      ) : null}
    </div>
  );
}
