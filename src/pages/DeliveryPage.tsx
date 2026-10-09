import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, CheckCircle2, ClipboardList, History, Loader2, PackageCheck, Plus, Settings2, Truck, Warehouse } from "lucide-react";
import { api } from "@/lib/api";
import { fmtNum } from "@/components/erp-ui";
import InvoiceModal, { InvoiceData } from "@/components/InvoiceModal";
import EmbarkedSection from "@/components/delivery/EmbarkedSection";
import OrdersSection from "@/components/delivery/OrdersSection";
import { DeliveryConfigSection, DeliveryHistorySection } from "@/components/delivery/HistoryConfigSections";

/*
 * Module Livraison : une seule page, deux modes de distribution.
 * Stock embarqué · Commandes / Livraisons · Historique · Configuration
 */

type Section = "embarked" | "orders" | "history" | "config";
const SECTIONS: Array<{ id: Section; label: string; icon: any }> = [
  { id: "embarked", label: "Stock embarqué", icon: Truck },
  { id: "orders", label: "Commandes / Livraisons", icon: ClipboardList },
  { id: "history", label: "Historique", icon: History },
  { id: "config", label: "Configuration des départements", icon: Settings2 },
];

function StatCard({ icon: Icon, tone, title, subtitle, value, unit, onClick }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-[0_10px_30px_-18px_rgba(15,61,104,0.35)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-16px_rgba(15,61,104,0.45)]"
    >
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-white shadow-[0_8px_20px_-8px_rgba(15,61,104,0.7)] ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900">{title}</div>
          <div className="text-[11px] text-slate-500">{subtitle}</div>
        </div>
      </div>
      <div className="mt-1">
        <span className="text-3xl font-black tracking-tight text-slate-900 tabular-nums">{value}</span>
        <span className="ml-1.5 text-xs text-slate-500">{unit}</span>
      </div>
      <Icon aria-hidden className="pointer-events-none absolute -bottom-3 -right-2 h-20 w-20 text-slate-100 transition-colors group-hover:text-slate-200" />
    </button>
  );
}

export default function DeliveryPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("embarked");
  const [overview, setOverview] = useState<any>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<InvoiceData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const formAnchor = useRef<HTMLDivElement>(null);

  const loadOverview = () =>
    api
      .get("/delivery/overview")
      .then(({ data }) => setOverview(data))
      .catch(() => setOverview((o: any) => o || { can_see_all: false }));

  useEffect(() => {
    loadOverview();
  }, [refreshKey]);

  const changed = () => setRefreshKey((k) => k + 1);
  const openInvoice = (o: any) =>
    setInvoiceOrder({
      id: o.id,
      code: o.code,
      client_name: o.client_name,
      client_phone: o.client_phone,
      delivery_address: o.delivery_address,
      created_at: o.created_at,
      total: o.total || 0,
      items: o.items || [],
    } as InvoiceData);

  const goLoad = () => {
    setSection("embarked");
    setTimeout(() => formAnchor.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0F3D68] text-white shadow-[0_10px_24px_-10px_rgba(15,61,104,0.9)]">
            <Truck className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#0F3D68]">Module Livraison</h1>
            <p className="text-sm text-slate-500">Deux modes de distribution, une seule gestion.</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs">
          <CalendarDays className="h-4 w-4 text-[#0F3D68]" />
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </span>
      </header>

      {/* Indicateurs + actions rapides */}
      {!overview ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard icon={Truck} tone="bg-emerald-600" title="Stock embarqué" subtitle="Dans les camions des marketeurs" value={fmtNum(overview.embarked_units || 0)} unit="unités" onClick={() => setSection("embarked")} />
          <StatCard icon={ClipboardList} tone="bg-blue-600" title="Commandes en cours" subtitle="Approuvées, à préparer ou à livrer" value={fmtNum(overview.orders_in_progress || 0)} unit="commandes" onClick={() => setSection("orders")} />
          <StatCard icon={CheckCircle2} tone="bg-emerald-500" title="Livraisons du jour" subtitle={`Terminées · ${fmtNum(overview.shipping_now || 0)} en cours`} value={fmtNum(overview.delivered_today || 0)} unit="livrées" onClick={() => setSection("history")} />
          <StatCard icon={Warehouse} tone="bg-violet-600" title="Stock dépôt (global)" subtitle="Unités disponibles dans les dépôts" value={fmtNum(overview.depot_units || 0)} unit="unités" onClick={() => navigate("/stock")} />
          <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_-18px_rgba(15,61,104,0.35)] sm:col-span-2 xl:col-span-1">
            <div className="text-sm font-bold text-slate-900">Actions rapides</div>
            {overview.can_see_all && (
              <button type="button" onClick={goLoad} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800">
                <PackageCheck className="h-4 w-4" /> Déstocker vers stock embarqué
              </button>
            )}
            <button type="button" onClick={() => navigate("/boutique")} className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Nouvelle commande client
            </button>
            <button type="button" onClick={() => setSection("history")} className="flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700">
              <History className="h-4 w-4" /> Voir l'historique des livraisons
            </button>
          </div>
        </div>
      )}

      {/* Sous-sections du module */}
      <nav aria-label="Sections du module Livraison" className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xs">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                active ? "bg-[#0F3D68] text-white shadow-[0_0_14px_-4px_rgba(15,61,104,0.8)]" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" /> {s.label}
            </button>
          );
        })}
      </nav>

      {overview &&
        (section === "embarked" ? (
          <EmbarkedSection canManage={!!overview.can_see_all} onChanged={changed} formAnchor={formAnchor} onInvoice={openInvoice} />
        ) : section === "orders" ? (
          <OrdersSection onChanged={changed} onInvoice={openInvoice} onShowHistory={() => setSection("history")} />
        ) : section === "history" ? (
          <DeliveryHistorySection onInvoice={openInvoice} />
        ) : (
          <DeliveryConfigSection canManage={!!overview.can_see_all} onChanged={changed} />
        ))}

      {/* FACTURE UNIFIÉE */}
      <InvoiceModal isOpen={Boolean(invoiceOrder)} order={invoiceOrder} onClose={() => setInvoiceOrder(null)} />
    </div>
  );
}
