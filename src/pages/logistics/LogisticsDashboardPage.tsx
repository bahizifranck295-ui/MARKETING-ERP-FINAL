import React, { useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/erp-ui";
import { MULTI_SITE } from "@/app/edition";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, BarChart3, Bell, ClipboardList, Loader2, Package, ShieldCheck, Truck, Warehouse } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtMoney, fmtNum, KpiCard, StatusBadge } from "@/components/erp-ui";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { APP_INFO } from "@/app/edition";

/*
 * Tableau de bord du projet « Stock & Livraison » : uniquement des données logistiques
 * (stock des dépôts, stock embarqué, commandes à préparer / livrer). Aucun chiffre de caisse,
 * de crédit ou de comptabilité : ces données appartiennent à la Gestion commerciale.
 */

const stockOf = (p: any) => Number(p.stock ?? p.current_stock ?? 0) || 0;
const thresholdOf = (p: any) => Number(p.low_stock_threshold ?? 0) || 0;


function Tile({ icon: Icon, title, subtitle, to, enabled = true, badge }: any) {
  // Module non autorisé : la tuile n'existe pas
  if (!enabled) return null;
  const Wrapper = enabled ? Link : ("div" as any);
  return (
    <Wrapper
      {...(enabled ? { to } : {})}
      className={`group relative rounded-2xl bg-white border border-slate-200 p-4 flex flex-col gap-3 transition-all hover:shadow-md hover:border-slate-300 ${
        enabled ? "" : "opacity-45 pointer-events-none"
      }`}
    >
      <div className="h-11 w-11 rounded-xl flex items-center justify-center bg-brand text-white">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-semibold text-slate-900 text-[15px] leading-tight">{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
      </div>
      {badge ? (
        <span className="absolute top-3 right-3 h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">{badge}</span>
      ) : (
        enabled && <ArrowRight className="h-4 w-4 text-slate-300 absolute top-4 right-4 group-hover:text-brand transition-colors" />
      )}
    </Wrapper>
  );
}

export default function LogisticsDashboardPage() {
  const { user, role, has } = useAuth();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [depots, setDepots] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [embarked, setEmbarked] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let ok = true;
    const safe = (p: Promise<any>, fallback: any) => p.then((r) => r.data).catch(() => fallback);
    // Seules les données autorisées sont demandées (mêmes permissions que le serveur) : pas de refus
    // inutile ni d'alerte de sécurité pour un compte sans accès au stock ou aux livraisons
    const can = (...codes: string[]) => codes.some((c) => has(c));
    const skip = (fallback: any) => Promise.resolve(fallback);
    Promise.all([
      can("stock.read", "delivery.read", "stock.reports", "logistics_reports.read")
        ? api.get("/products").then((r) => r.data).catch((e) => {
            toast.error(extractErrorMessage(e, "Stock indisponible"));
            return [];
          })
        : skip([]),
      can("stock.read", "warehouse.read", "delivery.read", "stock.reports") ? safe(api.get("/stock/depots"), []) : skip([]),
      can("delivery.read", "stock.read") ? safe(api.get("/delivery/overview"), null) : skip(null),
      can("stock.read", "delivery.read", "logistics_reports.read") ? safe(api.get("/stock/embarked-summary"), null) : skip(null),
      can("delivery.read", "logistics_reports.read") ? safe(api.get("/delivery/orders"), []) : skip([]),
      safe(api.get("/notifications", { params: { unread_only: true, limit: 50 } }), []),
    ]).then(([p, d, o, e, ord, n]) => {
      if (!ok) return;
      setProducts(Array.isArray(p) ? p : []);
      setDepots(Array.isArray(d) ? d : []);
      setOverview(o);
      setEmbarked(e);
      setOrders(Array.isArray(ord) ? ord : []);
      setUnread(Array.isArray(n) ? n.length : 0);
      setLoading(false);
    });
    return () => {
      ok = false;
    };
  }, []);

  const active = useMemo(() => products.filter((p) => p.is_active !== false), [products]);
  const stockValue = useMemo(() => active.reduce((t, p) => t + stockOf(p) * (Number(p.cost_price) || 0), 0), [active]);
  const lowStock = useMemo(() => active.filter((p) => stockOf(p) <= thresholdOf(p)).sort((a, b) => stockOf(a) - stockOf(b)), [active]);
  const toPrepare = useMemo(() => orders.filter((o) => o.status === "validated" || o.status === "prepared"), [orders]);
  const trucks = embarked?.stocks || [];

  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-5" data-logistics-dashboard>
      <div className="rounded-2xl hero-surface p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <BackButton onlyIfHistory />
            <div className="text-white/80 text-sm">Bienvenue,</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSwitcher variant="dark" />
            <ThemeToggle variant="hero" />
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
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 text-white/90 text-[11px] px-2.5 py-1">{APP_INFO.name}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Valeur du stock (coût)" value={fmtMoney(stockValue)} sub={`${fmtNum(active.length)} produit(s) · ${fmtNum(depots.length)} dépôt(s)`} tone="blue" />
            <KpiCard
              label="Stock en alerte"
              value={fmtNum(lowStock.length)}
              sub={`${fmtNum(lowStock.filter((p) => stockOf(p) <= 0).length)} en rupture`}
              tone={lowStock.length ? "red" : "slate"}
            />
            <KpiCard
              label="Unités en dépôts / camions"
              value={`${fmtNum(overview?.depot_units ?? embarked?.totals?.depots ?? 0)} / ${fmtNum(overview?.embarked_units ?? embarked?.totals?.embarked ?? 0)}`}
              sub={`${fmtNum(trucks.length)} camion(s) chargé(s)`}
              tone="slate"
            />
            <KpiCard
              label="Livrées aujourd'hui"
              value={fmtNum(overview?.delivered_today ?? 0)}
              sub={`${fmtNum(overview?.shipping_now ?? 0)} en route · ${fmtNum(toPrepare.length)} à préparer`}
              tone="green"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Produits en alerte stock
                </h2>
                <Link to="/stock" className="text-[11px] font-semibold text-brand hover:underline">
                  Voir le stock
                </Link>
              </div>
              {lowStock.length ? (
                <ul className="divide-y divide-slate-100" data-low-stock>
                  {lowStock.slice(0, 6).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                      <span className="min-w-0 truncate font-semibold text-slate-900" data-no-translate>
                        {p.name}
                      </span>
                      <span className={`shrink-0 font-bold tabular-nums ${stockOf(p) <= 0 ? "text-red-600" : "text-amber-600"}`}>
                        {fmtNum(stockOf(p))} / seuil {fmtNum(thresholdOf(p))} {p.unit || ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-xs text-slate-500">Aucun produit sous son seuil d'alerte.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <ClipboardList className="h-4 w-4 text-brand" /> Commandes à préparer / expédier
                </h2>
                <Link to="/delivery" className="text-[11px] font-semibold text-brand hover:underline">
                  Ouvrir la Livraison
                </Link>
              </div>
              {toPrepare.length ? (
                <ul className="divide-y divide-slate-100" data-to-prepare>
                  {toPrepare.slice(0, 6).map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                      <span className="min-w-0 truncate">
                        <span className="font-mono font-bold text-slate-900">{o.code}</span>{" "}
                        <span className="text-slate-500" data-no-translate>
                          · {o.client_name || "—"}
                          {MULTI_SITE && o.site_name ? ` · ${o.site_name}` : ""}
                        </span>
                      </span>
                      <StatusBadge status={o.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-xs text-slate-500">Aucune commande en attente de préparation.</p>
              )}
            </div>
          </div>
        </>
      )}

      <div>
        <h2 className="mb-3 px-1 text-xs font-bold text-slate-700 uppercase tracking-wider">Modules Stock & Livraison</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Tile icon={Package} title="Stock" subtitle="Produits, dépôts & transferts" to="/stock" enabled={has("stock.read")} badge={lowStock.length || null} />
          <Tile icon={Truck} title="Livraison" subtitle="Chargement & tournées" to="/delivery" enabled={has("delivery.read")} badge={toPrepare.length || null} />
          <Tile icon={BarChart3} title="Rapports" subtitle="État des stocks & livraisons" to="/reports" enabled={has("logistics_reports.read")} />
        </div>
      </div>

      {trucks.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <h2 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
            <Warehouse className="h-4 w-4 text-brand" /> Stock embarqué par camion
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {trucks.map((t: any) => (
              <div key={t.id} className="rounded-xl border border-slate-200 p-3 text-xs" data-no-translate>
                <div className="font-bold text-slate-900">{t.marketer_name}</div>
                <div className="text-slate-500">{[t.vehicle_plate, t.driver_name].filter(Boolean).join(" · ") || "Sans camion assigné"}</div>
                <div className="mt-1 font-semibold tabular-nums text-brand">
                  {fmtNum(t.units)} unité(s) · {fmtMoney(t.value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
