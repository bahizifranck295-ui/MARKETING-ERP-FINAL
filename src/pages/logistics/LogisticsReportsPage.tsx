import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Download, Loader2, Package, Truck } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { fmtDate, fmtMoney, fmtNum, PageHeader, StatusBadge } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { saveFile } from "@/lib/documentViewer";
import StockReportDashboard from "@/components/reports/StockReportDashboard";
import StockStateReport from "@/components/reports/StockStateReport";

/*
 * Rapports du projet « Stock & Livraison » : état des stocks, livraisons et stock embarqué.
 * Les ventes nécessaires aux courbes de stock viennent de l'intégration /integration/sales
 * (lignes vendues sans montants) ; aucun rapport commercial (caisse, crédits, CA) ici.
 */

type Tab = "stock" | "deliveries" | "embarked";
const TABS: Array<{ id: Tab; label: string; icon: any }> = [
  { id: "stock", label: "État des stocks", icon: Package },
  { id: "deliveries", label: "Livraisons", icon: ClipboardList },
  { id: "embarked", label: "Stock embarqué", icon: Truck },
];

const PERIODS = [
  { id: "day", label: "Aujourd'hui" },
  { id: "week", label: "7 jours" },
  { id: "month", label: "Ce mois" },
  { id: "year", label: "Cette année" },
];

function inPeriod(dateStr: string | undefined, period: string) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  if (period === "day") return d.toDateString() === now.toDateString();
  if (period === "week") return now.getTime() - d.getTime() <= 7 * 86400000;
  if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  return d.getFullYear() === now.getFullYear();
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-xs ${tone}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-black tabular-nums tracking-tight">{value}</div>
    </div>
  );
}

export default function LogisticsReportsPage() {
  const [tab, setTab] = useState<Tab>("stock");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<any[]>([]);
  const [embarked, setEmbarked] = useState<any>(null);
  const [stockFilters, setStockFilters] = useState<{ site: string; depot: string; category: string } | null>(null);
  const [period, setPeriod] = useState("month");

  useEffect(() => {
    Promise.all([
      api.get("/products"),
      api.get("/integration/sales").catch(() => ({ data: [] })),
      api.get("/delivery/orders").catch(() => ({ data: [] })),
      api.get("/stock/embarked-summary").catch(() => ({ data: null })),
    ])
      .then(([p, s, o, e]) => {
        setProducts(Array.isArray(p.data) ? p.data : []);
        setSales(Array.isArray(s.data) ? s.data : []);
        setDeliveryOrders(Array.isArray(o.data) ? o.data : []);
        setEmbarked(e.data);
      })
      .catch((err) => toast.error(extractErrorMessage(err, "Erreur de chargement des rapports")))
      .finally(() => setLoading(false));
  }, []);

  const delivered = useMemo(
    () =>
      deliveryOrders
        .filter((o) => o.status === "delivered" && inPeriod(o.delivered_at || o.updated_at, period))
        .sort((a, b) => String(b.delivered_at || b.updated_at).localeCompare(String(a.delivered_at || a.updated_at))),
    [deliveryOrders, period]
  );
  const count = (st: string) => deliveryOrders.filter((o) => o.status === st).length;

  const byVehicle = useMemo(() => {
    const m = new Map<string, { plate: string; driver: string; n: number }>();
    delivered.forEach((o) => {
      const plate = o.delivery?.vehicle_plate || "Sans camion";
      const k = plate;
      const row = m.get(k) || { plate, driver: o.delivery?.driver_name || "—", n: 0 };
      row.n += 1;
      m.set(k, row);
    });
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [delivered]);

  const exportDeliveries = () => {
    const head = ["Commande", "Client", "Site", "Camion", "Chauffeur", "Livrée le"];
    const rows = delivered.map((o) => [
      o.code,
      o.client_name || "",
      o.site_name || "",
      o.delivery?.vehicle_plate || "",
      o.delivery?.driver_name || "",
      new Date(o.delivered_at || o.updated_at).toLocaleString("fr-FR"),
    ]);
    const csv = "﻿" + [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    saveFile(new Blob([csv], { type: "text/csv" }), `Livraisons_${period}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const trucks = embarked?.stocks || [];
  const totals = embarked?.totals;

  return (
    <div className="space-y-5 pb-16" data-logistics-reports>
      <PageHeader title="Rapports Stock & Livraison" subtitle="État des stocks, livraisons effectuées et stock embarqué" />

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                tab === t.id ? "bg-[#0F3D68] text-white shadow-xs" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : tab === "stock" ? (
        <div className="space-y-4">
          <StockStateReport siteKey="all" historyFilter={stockFilters} />
          <StockReportDashboard products={products} orders={sales} search="" siteKey="all" onFiltersChange={setStockFilters} />
        </div>
      ) : tab === "deliveries" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="À préparer" value={fmtNum(count("validated"))} tone="border-amber-200 bg-amber-50 text-amber-800" />
            <Kpi label="En préparation" value={fmtNum(count("prepared"))} tone="border-blue-200 bg-blue-50 text-blue-800" />
            <Kpi label="En route" value={fmtNum(count("shipped"))} tone="border-cyan-200 bg-cyan-50 text-cyan-800" />
            <Kpi label="Livrées (période)" value={fmtNum(delivered.length)} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5 overflow-x-auto text-xs">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`px-3 py-2 rounded-xl font-medium border whitespace-nowrap ${
                    period === p.id ? "bg-[#0F3D68] text-white border-[#0F3D68]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={exportDeliveries} disabled={!delivered.length} className="rounded-xl bg-[#0F3D68] hover:bg-[#0B2F52] text-white text-xs">
              <Download className="h-4 w-4 mr-1.5" /> Exporter (CSV)
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">Livraisons effectuées</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="p-3">Commande</th>
                      <th className="p-3">Client</th>
                      <th className="p-3">Site</th>
                      <th className="p-3">Camion · chauffeur</th>
                      <th className="p-3">Livrée le</th>
                      <th className="p-3">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100" data-no-translate>
                    {delivered.map((o) => (
                      <tr key={o.id}>
                        <td className="p-3 font-mono font-bold text-slate-900">{o.code}</td>
                        <td className="p-3">{o.client_name || "—"}</td>
                        <td className="p-3">{o.site_name || "—"}</td>
                        <td className="p-3">{[o.delivery?.vehicle_plate, o.delivery?.driver_name].filter(Boolean).join(" · ") || "—"}</td>
                        <td className="p-3">{fmtDate(o.delivered_at || o.updated_at)}</td>
                        <td className="p-3">
                          <StatusBadge status={o.status} />
                        </td>
                      </tr>
                    ))}
                    {!delivered.length && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">
                          Aucune livraison sur la période.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="mb-3 text-sm font-bold text-slate-900">Livraisons par camion</div>
              {byVehicle.length ? (
                <ul className="space-y-2" data-no-translate>
                  {byVehicle.map((v) => (
                    <li key={v.plate} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">
                        <span className="font-bold text-slate-900">{v.plate}</span> <span className="text-slate-500">· {v.driver}</span>
                      </span>
                      <span className="font-bold tabular-nums text-[#0F3D68]">{fmtNum(v.n)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-xs text-slate-500">Aucune donnée.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {totals && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Unités en dépôts" value={fmtNum(totals.depots)} tone="border-slate-200 bg-white text-slate-900" />
              <Kpi label="Unités embarquées" value={fmtNum(totals.embarked)} tone="border-blue-200 bg-blue-50 text-blue-800" />
              <Kpi label="Stock total" value={fmtNum(totals.total)} tone="border-slate-200 bg-white text-slate-900" />
              <Kpi
                label="Rapprochement"
                value={totals.balanced ? "Équilibré" : "Écart"}
                tone={totals.balanced ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}
              />
            </div>
          )}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">Marchandise dans les camions</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="p-3">Marketeur</th>
                    <th className="p-3">Camion · chauffeur</th>
                    <th className="p-3">Produits</th>
                    <th className="p-3 text-right">Unités</th>
                    <th className="p-3 text-right">Valeur (coût)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100" data-no-translate>
                  {trucks.map((t: any) => (
                    <tr key={t.id}>
                      <td className="p-3 font-bold text-slate-900">{t.marketer_name}</td>
                      <td className="p-3">{[t.vehicle_plate, t.driver_name].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="p-3 text-slate-600">{(t.items || []).map((i: any) => `${i.name} (${fmtNum(i.quantity)})`).join(", ")}</td>
                      <td className="p-3 text-right font-semibold tabular-nums">{fmtNum(t.units)}</td>
                      <td className="p-3 text-right font-semibold tabular-nums">{fmtMoney(t.value)}</td>
                    </tr>
                  ))}
                  {!trucks.length && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        Aucun stock embarqué.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
