import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ShoppingCart,
  Users,
  Package,
  Wallet,
  Truck,
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
import { fmtMoney } from "@/components/erp-ui";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
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
    blue: "bg-[#0F3D68] text-white",
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border border-amber-100",
  };
  const Wrapper = enabled ? Link : ("div" as any);
  const props = enabled ? { to } : {};
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
        <ArrowRight className="h-4 w-4 text-slate-300 absolute top-4 right-4 group-hover:text-[#0F3D68] transition-colors" />
      )}
    </Wrapper>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone = "blue",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "blue" | "green" | "red" | "slate";
}) {
  const tones = {
    blue: "bg-[#0F3D68] text-white",
    green: "bg-emerald-600 text-white",
    red: "bg-red-600 text-white",
    slate: "bg-white text-slate-900 border border-slate-200 shadow-xs",
  };
  return (
    <div className={`rounded-2xl p-4 ${tones[tone]}`}>
      <div
        className={`text-[11px] uppercase tracking-wider font-semibold ${
          tone === "slate" ? "text-slate-500" : "text-white/70"
        }`}
      >
        {label}
      </div>
      <div className="text-2xl font-bold mt-1 tracking-tight">{value}</div>
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

export default function DashboardPage() {
  const { user, role, has } = useAuth();
  const [k, setK] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let ok = true;
    Promise.all([
      api
        .get("/dashboard")
        .then((r) => r.data)
        .catch((e) => {
          toast.error(extractErrorMessage(e, "KPI indisponibles"));
          return null;
        }),
      api
        .get("/notifications", { params: { unread_only: true, limit: 50 } })
        .then((r) => r.data.length)
        .catch(() => 0),
    ]).then(([d, n]) => {
      if (!ok) return;
      setK(d);
      setUnread(n);
      setLoading(false);
    });
    return () => {
      ok = false;
    };
  }, []);

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0F3D68] to-[#0B2F52] text-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="text-white/80 text-sm">Bienvenue,</div>
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSwitcher variant="dark" />
            <Link
              to="/notifications"
              title="Notifications"
              className="relative h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 ring-1 ring-white/25 flex items-center justify-center text-white"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          </div>
        </div>
        <div className="text-2xl font-bold tracking-tight mt-0.5" data-no-translate>{user?.full_name}</div>
        <div className="text-white/70 text-xs mt-1 capitalize">{today}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 text-white text-[11px] font-medium px-2.5 py-1">
            <ShieldCheck className="h-3 w-3" /> {role?.name || user?.role_code}
          </span>
          {user?.department && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 text-white/90 text-[11px] px-2.5 py-1 capitalize">
              {user.department}
            </span>
          )}
        </div>
      </div>

      {/* Real KPI */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : k ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              label="Ventes aujourd'hui"
              value={fmtMoney(k.sales?.total)}
              sub={`${k.sales?.count} transaction(s)`}
              tone="blue"
            />
            <KpiCard
              label="Encaissé"
              value={fmtMoney(k.sales?.paid)}
              sub={`Bénéfice est. ${fmtMoney(k.profit_estimate)}`}
              tone="green"
            />
            <KpiCard
              label="Créances"
              value={fmtMoney(k.debts?.total)}
              sub={`${k.debts?.clients} client(s)`}
              tone={k.debts?.total > 0 ? "red" : "slate"}
            />
            <KpiCard
              label="Stock (coût)"
              value={fmtMoney(k.stock?.value)}
              sub={`${k.stock?.low_stock || 0} en alerte / ${k.stock?.products}`}
              tone="slate"
            />
          </div>

          {k.stock?.low_stock > 0 && (
            <Link
              to="/stock"
              className="block rounded-2xl bg-amber-50 border border-amber-200 p-4 hover:bg-amber-100 transition-colors shadow-xs"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-amber-900">
                    ⚠ {k.stock.low_stock} produit(s) en alerte stock
                  </div>
                  <div className="text-xs text-amber-700 mt-0.5">
                    Cliquez pour vérifier l'inventaire
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-amber-700" />
              </div>
            </Link>
          )}
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
              className="text-[11px] text-[#0F3D68] font-semibold hover:underline"
            >
              {unread} notification(s)
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
            icon={Package}
            title="Stock"
            subtitle="Produits & dépôts"
            to="/stock"
            tone="slate"
            enabled={has("stock.read")}
          />
          <Tile
            icon={Truck}
            title="Livraison"
            subtitle="Chargement & tournées"
            to="/delivery"
            tone="slate"
            enabled={has("delivery.read")}
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
            subtitle="Ventes, caisse, stock"
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
