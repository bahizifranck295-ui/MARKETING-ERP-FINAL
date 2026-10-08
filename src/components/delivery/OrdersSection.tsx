import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardList, FileText, Loader2, MapPin, Package, PackageOpen, Phone, Truck } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtMoney, fmtNum } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/components/stock/ui";
import { SectionTitle, selectCls } from "@/components/delivery/deliveryUi";

// Parcours simplifié : Commande → En préparation → En livraison → Livrée
export const STAGES = [
  { key: "order", label: "Commande client", statuses: ["pending_approval", "validated"], icon: ClipboardList, tone: "blue", hint: "Le client a passé commande" },
  { key: "prep", label: "En préparation", statuses: ["prepared"], icon: PackageOpen, tone: "orange", hint: "Préparation au dépôt" },
  { key: "ship", label: "En livraison", statuses: ["shipped"], icon: Truck, tone: "violet", hint: "En route vers le client" },
  { key: "done", label: "Livrée / Confirmée", statuses: ["delivered"], icon: CheckCircle2, tone: "emerald", hint: "Réception confirmée" },
] as const;

const TONES: Record<string, { head: string; pill: string; btn: string; border: string }> = {
  blue: { head: "from-blue-50 to-white text-blue-800", pill: "bg-blue-100 text-blue-800", btn: "bg-blue-600 hover:bg-blue-700", border: "border-blue-200" },
  orange: { head: "from-orange-50 to-white text-orange-800", pill: "bg-orange-100 text-orange-800", btn: "bg-orange-500 hover:bg-orange-600", border: "border-orange-200" },
  violet: { head: "from-violet-50 to-white text-violet-800", pill: "bg-violet-100 text-violet-800", btn: "bg-violet-600 hover:bg-violet-700", border: "border-violet-200" },
  emerald: { head: "from-emerald-50 to-white text-emerald-800", pill: "bg-emerald-100 text-emerald-800", btn: "bg-emerald-600 hover:bg-emerald-700", border: "border-emerald-200" },
};

const isToday = (s?: string) => !!s && new Date(s).toDateString() === new Date().toDateString();

type Props = { onChanged: () => void; onInvoice: (o: any) => void; onShowHistory: () => void };

export default function OrdersSection({ onChanged, onInvoice, onShowHistory }: Props) {
  const { has } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [vehicleFor, setVehicleFor] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const [o, v] = await Promise.all([api.get("/delivery/orders"), api.get("/delivery/vehicles")]);
      setOrders(Array.isArray(o.data) ? o.data : []);
      setVehicles((v.data || []).filter((x: any) => x.is_active !== false));
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur de chargement des commandes"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const run = async (id: string, fn: () => Promise<any>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
      await load();
      onChanged();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Action impossible"));
    } finally {
      setBusy(null);
    }
  };

  const approve = (o: any) => run(o.id, () => api.post(`/orders/${o.id}/approve`), `Commande ${o.code} approuvée`);
  const advance = (o: any, label: string) =>
    run(o.id, () => api.post(`/delivery/orders/${o.id}/advance`, { vehicle_id: vehicleFor[o.id] }), `${o.code} : ${label}`);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const byStage = (stage: (typeof STAGES)[number]) =>
    orders
      .filter((o) => (stage.statuses as readonly string[]).includes(o.status))
      .filter((o) => stage.key !== "done" || isToday(o.delivered_at))
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

  return (
    <section className="space-y-4">
      <SectionTitle n={2} tone="bg-blue-600" title="Livraison sur commande" subtitle="Le client commande, nous préparons, livrons et confirmons. Une commande livrée passe dans l'historique." />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
        {STAGES.map((stage) => {
          const t = TONES[stage.tone];
          const Icon = stage.icon;
          const list = byStage(stage);
          return (
            <div key={stage.key} className={`flex min-w-0 flex-col rounded-2xl border ${t.border} bg-white shadow-[0_10px_30px_-18px_rgba(15,61,104,0.35)]`}>
              <div className={`flex items-center justify-between gap-2 rounded-t-2xl bg-gradient-to-b ${t.head} px-3 py-2.5`}>
                <span className="flex items-center gap-2 text-sm font-black">
                  <Icon className="h-4 w-4" /> {stage.label}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${t.pill}`}>
                  {list.length}
                  {stage.key === "done" ? " aujourd'hui" : ""}
                </span>
              </div>
              <p className="px-3 pt-1.5 text-[11px] text-slate-500">{stage.hint}</p>
              <div className="flex max-h-[620px] flex-col gap-2 overflow-y-auto p-3">
                {list.map((o) => (
                  <article key={o.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xs transition-shadow hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] font-bold text-slate-700">{o.code}</div>
                        <div className="truncate text-sm font-bold text-slate-900">{o.client_name}</div>
                      </div>
                      <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600">{o.department}</span>
                    </div>
                    <ul className="mt-2 space-y-0.5 text-slate-600">
                      {(o.items || []).slice(0, 3).map((i: any, k: number) => (
                        <li key={k} className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1 truncate">
                            <Package className="h-3 w-3 shrink-0 text-slate-400" /> {i.product_name}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums">× {fmtNum(i.quantity)}</span>
                        </li>
                      ))}
                      {(o.items || []).length > 3 && <li className="text-[10px] text-slate-400">+ {(o.items || []).length - 3} autre(s) produit(s)</li>}
                    </ul>
                    <div className="mt-2 space-y-0.5 text-[10px] text-slate-500">
                      {o.delivery_address && (
                        <div className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" /> {o.delivery_address}</div>
                      )}
                      {o.client_phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {o.client_phone}</div>}
                      {o.delivery?.driver_name && (
                        <div className="flex items-center gap-1"><Truck className="h-3 w-3" /> {o.delivery.driver_name} · {o.delivery.vehicle_plate}</div>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                      <span className="font-black tabular-nums text-slate-900">{fmtMoney(o.total)}</span>
                      <span className="text-[10px] text-slate-400">{fmtDateTime(o.delivered_at || o.updated_at || o.created_at)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {o.status === "pending_approval" &&
                        (has("orders.approve") ? (
                          <Button size="sm" disabled={busy === o.id} onClick={() => approve(o)} className={`h-7 flex-1 rounded-lg text-[11px] text-white ${TONES.blue.btn}`}>
                            Approuver
                          </Button>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">En attente d'approbation</span>
                        ))}
                      {o.status === "validated" && has("delivery.create") && (
                        <Button size="sm" disabled={busy === o.id} onClick={() => advance(o, "en préparation")} className={`h-7 flex-1 rounded-lg text-[11px] text-white ${TONES.orange.btn}`}>
                          Préparer
                        </Button>
                      )}
                      {o.status === "prepared" && has("delivery.dispatch") && (
                        <div className="flex w-full gap-1.5">
                          <select
                            aria-label="Chauffeur / camion"
                            value={vehicleFor[o.id] || ""}
                            onChange={(e) => setVehicleFor({ ...vehicleFor, [o.id]: e.target.value })}
                            className={`${selectCls} mt-0 h-7 flex-1 rounded-lg text-[11px]`}
                          >
                            <option value="">Chauffeur (facultatif)</option>
                            {vehicles.map((v) => (
                              <option key={v.id} value={v.id}>{v.driver_name} · {v.plate}</option>
                            ))}
                          </select>
                          <Button size="sm" disabled={busy === o.id} onClick={() => advance(o, "en livraison")} className={`h-7 rounded-lg text-[11px] text-white ${TONES.violet.btn}`}>
                            Expédier
                          </Button>
                        </div>
                      )}
                      {o.status === "shipped" && has("delivery.confirm") && (
                        <Button size="sm" disabled={busy === o.id} onClick={() => advance(o, "livraison confirmée")} className={`h-7 flex-1 rounded-lg text-[11px] text-white ${TONES.emerald.btn}`}>
                          Confirmer la livraison
                        </Button>
                      )}
                      {o.status === "delivered" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Livrée
                        </span>
                      )}
                      <Button size="sm" variant="outline" onClick={() => onInvoice(o)} className="h-7 rounded-lg px-2 text-[11px]" title="Voir la facture">
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </article>
                ))}
                {!list.length && <p className="py-6 text-center text-[11px] text-slate-400">Aucune commande à cette étape.</p>}
              </div>
              {stage.key === "done" && (
                <button type="button" onClick={onShowHistory} className="m-3 mt-0 rounded-xl border border-emerald-200 py-2 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50">
                  Voir l'historique des livraisons
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
