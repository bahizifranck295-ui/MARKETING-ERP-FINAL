import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ShoppingCart,
  ShoppingBag,
  TrendingUp,
  Banknote,
  Users,
  Wallet,
  Calculator,
  BarChart3,
  ShieldCheck,
  Target,
  HandCoins,
  ArrowRight,
  Loader2,
  Store,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtMoney, KpiCard } from "@/components/erp-ui";
import { OutOfStockPanel, SalesDonut, SalesLineChart, StatCard, type Overview } from "@/components/dashboard/DashboardOverview";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Bell } from "lucide-react";

function Tile({
  icon: Icon,
  title,
  subtitle,
  to,
  tone = "blue",
  enabled = true,
  badge,
}: {
  icon: any;
  title: string;
  subtitle: string;
  to: string;
  tone?: "blue" | "slate" | "green" | "amber";
  enabled?: boolean;
  badge?: string | number | null;
}) {
  const tones = {
    blue: "bg-brand text-white",
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border border-amber-100",
  };
  // Module non autorisé : la tuile n'existe pas (rien à griser ni à deviner)
  if (!enabled) return null;
  const Wrapper = Link;
  const props = { to };
  return (
    <Wrapper
      {...props}
      className={`group relative rounded-2xl bg-white border border-slate-200 p-4 flex flex-col gap-3 transition-all hover:shadow-md hover:border-slate-300 ${
        enabled ? "" : "opacity-45 pointer-events-none"
      }`}
    >
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-semibold text-slate-900 text-[15px] leading-tight">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
      </div>
      {badge && (
        <span className="absolute top-3 right-3 h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
          {badge}
        </span>
      )}
      {enabled && !badge && (
        <ArrowRight className="h-4 w-4 text-slate-300 absolute top-4 right-4 group-hover:text-brand transition-colors" />
      )}
    </Wrapper>
  );
}


export default function DashboardPage() {
  const { user, role, has } = useAuth();
  const [k, setK] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [days, setDays] = useState(7);

  useEffect(() => {
    let ok = true;
    // Indicateurs : uniquement avec la permission « Voir les indicateurs »
    (has("dashboard.read") ? api.get("/dashboard", { params: { days } }) : Promise.resolve({ data: null }))
      .then((r) => ok && setK(r.data))
      .catch((e) => toast.error(extractErrorMessage(e, "KPI indisponibles")))
      .finally(() => ok && setLoading(false));
    return () => {
      ok = false;
    };
  }, [days]);

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
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tableau de bord</h1>
          <p className="text-xs capitalize text-slate-500">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <Link
            to="/notifications"
            title="Notifications"
            className="relative grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
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
            <StatCard label="Chiffre d'affaires du jour" value={fmtMoney(o.revenue.today)} k={o.revenue} icon={Wallet} tone="blue" />
            <StatCard label="Bénéfice estimé" value={fmtMoney(o.profit.today)} k={o.profit} icon={TrendingUp} tone="green" />
            <StatCard label="Recettes" value={fmtMoney(o.receipts.today)} k={o.receipts} icon={Banknote} tone="teal" />
            <StatCard label="Nombre de ventes" value={o.sales_count.today.toLocaleString("fr-FR")} k={o.sales_count} icon={ShoppingBag} tone="orange" />
            <StatCard label="Nombre de clients" value={o.clients.today.toLocaleString("fr-FR")} k={o.clients} icon={Users} tone="violet" />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SalesLineChart data={o.series} days={o.days} onDays={setDays} />
            <OutOfStockPanel items={o.out_of_stock} />
            <SalesDonut byCategory={o.by_category} total={o.period_total} days={o.days} />
          </div>
          {/* Suivi : indicateurs du tableau de bord précédent, conservés */}
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-3" data-dash-follow>
            <KpiCard
              label="Créances"
              value={fmtMoney(k.debts?.total)}
              sub={`${k.debts?.clients} client(s)`}
              tone={k.debts?.total > 0 ? "red" : "slate"}
            />
            <KpiCard
              label="À approuver"
              value={String(k.orders?.pending_approval ?? 0)}
              sub={`${k.objectives?.active ?? 0} objectif(s) en cours`}
              tone="slate"
            />
            <KpiCard label="Sorties de caisse" value={fmtMoney(k.cash?.today_out)} sub="Aujourd'hui" tone="slate" />
          </div>
        </>
      ) : null}

      {/* Modules */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Modules Opérationnels
          </h2>
          {unread > 0 && (
            <Link
              to="/notifications"
              className="text-[11px] text-brand font-semibold hover:underline"
            >
              {unread} notification(s)
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile
            icon={Store}
            title="Boutique"
            subtitle="Revendeurs & terrain"
            to="/boutique"
            tone="blue"
            enabled={has("boutique.read")}
          />
          <Tile
            icon={ShoppingCart}
            title="Commandes"
            subtitle="Prise & validation"
            to="/orders"
            tone="slate"
            enabled={has("orders.read")}
          />
          <Tile
            icon={Users}
            title="CRM Clients"
            subtitle="Comptes & coordonnées"
            to="/clients"
            enabled={has("crm.read")}
          />
          <Tile
            icon={Wallet}
            title="Caisse"
            subtitle="Encaissements & sessions"
            to="/cash"
            tone="green"
            enabled={has("cash.read")}
          />
          <Tile
            icon={HandCoins}
            title="Crédits"
            subtitle="Créances clients"
            to="/credits"
            tone="amber"
            enabled={has("credits.read")}
          />
          <Tile
            icon={Calculator}
            title="Comptabilité"
            subtitle="Écritures & synchronisation"
            to="/accounting"
            tone="slate"
            enabled={has("accounting.read")}
          />
          <Tile
            icon={BarChart3}
            title="Rapports"
            subtitle="Ventes, caisse, crédits"
            to="/reports"
            tone="slate"
            enabled={has("reports.read")}
          />
          <Tile
            icon={Target}
            title="Objectifs"
            subtitle="Commerciaux temps réel"
            to="/objectives"
            tone="slate"
            enabled={has("objectives.read")}
          />
        </div>
      </div>

      {/* Admin */}
      {(has("users.read") || has("roles.read") || has("audit.read")) && (
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Administration Système
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {has("users.read") && (
              <Tile
                icon={Users}
                title="Utilisateurs"
                subtitle="Créer, modifier, désactiver"
                to="/admin/users"
                tone="blue"
              />
            )}
            {has("roles.read") && (
              <Tile
                icon={ShieldCheck}
                title="Rôles & permissions"
                subtitle="Matrice complète"
                to="/admin/roles"
                tone="slate"
              />
            )}
            {has("audit.read") && (
              <Tile
                icon={BarChart3}
                title="Journal d'audit"
                subtitle="Traçabilité complète"
                to="/admin/audit"
                tone="slate"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
