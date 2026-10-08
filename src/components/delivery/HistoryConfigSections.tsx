import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, FileText, Loader2, Plus, Search, Settings2, Trash2, Truck } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { fmtMoney, fmtNum } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/stock/ui";
import { SectionTitle, selectCls } from "@/components/delivery/deliveryUi";

const dayKey = (s: string) => new Date(s).toISOString().slice(0, 10);
const dayLabel = (k: string) => {
  const d = new Date(`${k}T12:00:00`);
  const today = new Date().toISOString().slice(0, 10);
  const label = d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  return k === today ? `Aujourd'hui · ${label}` : label;
};

/* ---------- Historique des livraisons (par jour) ---------- */
export function DeliveryHistorySection({ onInvoice }: { onInvoice: (o: any) => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    api
      .get("/delivery/orders")
      .then(({ data }) => setOrders((data || []).filter((o: any) => o.status === "delivered")))
      .catch((err) => toast.error(extractErrorMessage(err, "Erreur de chargement de l'historique")))
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    const rows = orders
      .map((o) => ({ ...o, _day: dayKey(o.delivered_at || o.updated_at || o.created_at) }))
      .filter((o) => (!from || o._day >= from) && (!to || o._day <= to))
      .filter((o) => !s || [o.code, o.client_name, o.delivery?.code, o.delivery?.driver_name, ...(o.items || []).map((i: any) => i.product_name)].some((x) => x && String(x).toLowerCase().includes(s)))
      .sort((a, b) => String(b.delivered_at || b.updated_at).localeCompare(String(a.delivered_at || a.updated_at)));
    const m = new Map<string, any[]>();
    rows.forEach((r) => m.set(r._day, [...(m.get(r._day) || []), r]));
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [orders, from, to, q]);

  const total = groups.reduce((s, [, rows]) => s + rows.length, 0);

  return (
    <section className="space-y-4">
      <SectionTitle n={3} tone="bg-violet-600" title="Historique des livraisons" subtitle="Les commandes livrées et confirmées, classées par jour." />
      <GlassCard
        title={`${fmtNum(total)} livraison(s)`}
        icon={CalendarDays}
        right={
          <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
            <label className="text-[11px] font-semibold text-slate-600">
              Du
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls} />
            </label>
            <label className="text-[11px] font-semibold text-slate-600">
              Au
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectCls} />
            </label>
            <label className="text-[11px] font-semibold text-slate-600">
              Recherche
              <span className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 mt-0.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client, produit, n°…" className={`${selectCls} pl-8`} />
              </span>
            </label>
            {(from || to || q) && (
              <Button size="sm" variant="outline" onClick={() => { setFrom(""); setTo(""); setQ(""); }} className="h-9 rounded-xl text-[11px]">
                Effacer
              </Button>
            )}
          </div>
        }
      >
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : !groups.length ? (
          <p className="py-10 text-center text-xs text-slate-500">Aucune livraison pour ces filtres.</p>
        ) : (
          <div className="space-y-4">
            {groups.map(([day, rows]) => (
              <div key={day}>
                <h4 className="mb-1.5 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-bold capitalize text-slate-700">
                  <span>{dayLabel(day)}</span>
                  <span className="text-[11px] font-semibold normal-case text-slate-500">
                    {rows.length} livraison(s) · {fmtMoney(rows.reduce((s: number, r: any) => s + (Number(r.total) || 0), 0))}
                  </span>
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="px-2.5 py-2 font-semibold">Heure</th>
                        <th className="px-2.5 py-2 font-semibold">N° livraison</th>
                        <th className="px-2.5 py-2 font-semibold">Client</th>
                        <th className="px-2.5 py-2 font-semibold">Produit(s)</th>
                        <th className="px-2.5 py-2 font-semibold">Chauffeur</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Montant</th>
                        <th className="px-2.5 py-2 text-center font-semibold">Statut</th>
                        <th className="px-2.5 py-2 text-center font-semibold">Facture</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((o: any) => (
                        <tr key={o.id} className="hover:bg-cyan-50/40">
                          <td className="whitespace-nowrap px-2.5 py-2 text-slate-600">
                            {new Date(o.delivered_at || o.updated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-2.5 py-2 font-mono font-semibold text-slate-700">{o.delivery?.code || o.code}</td>
                          <td className="px-2.5 py-2 font-semibold text-slate-900">{o.client_name}</td>
                          <td className="px-2.5 py-2 text-slate-600">{(o.items || []).map((i: any) => `${i.product_name} (${i.quantity})`).join(", ")}</td>
                          <td className="px-2.5 py-2 text-slate-600">{o.delivery?.driver_name || "—"}</td>
                          <td className="px-2.5 py-2 text-right font-semibold tabular-nums">{fmtMoney(o.total)}</td>
                          <td className="px-2.5 py-2 text-center">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" /> Livrée
                            </span>
                          </td>
                          <td className="px-2.5 py-2 text-center">
                            <Button size="sm" variant="outline" onClick={() => onInvoice(o)} className="h-7 rounded-lg px-2" aria-label={`Facture ${o.code}`}>
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </section>
  );
}

/* ---------- Configuration : départements + camions & chauffeurs ---------- */
export function DeliveryConfigSection({ canManage, onChanged }: { canManage: boolean; onChanged: () => void }) {
  const [depts, setDepts] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = async () => {
    try {
      const [d, v] = await Promise.all([api.get("/delivery/departments"), api.get("/delivery/vehicles")]);
      setDepts(d.data || []);
      setVehicles(v.data || []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur de chargement de la configuration"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const setMode = async (name: string, mode: string) => {
    setBusy(name);
    try {
      await api.put(`/delivery/departments/${encodeURIComponent(name)}`, { mode });
      toast.success(`${name} : ${mode === "embarked" ? "stock embarqué" : "sur commande"}`);
      await load();
      onChanged();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Modification impossible"));
    } finally {
      setBusy(null);
    }
  };

  const addVehicle = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = form.elements as any;
    try {
      await api.post("/delivery/vehicles", {
        plate: f.veh_plate.value,
        driver_name: f.veh_driver.value,
        driver_phone: f.veh_phone.value,
        type: f.veh_type.value,
        capacity: f.veh_capacity.value,
      });
      toast.success("Camion ajouté");
      form.reset();
      load();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Ajout impossible"));
    }
  };

  const removeVehicle = async (v: any) => {
    try {
      await api.delete(`/delivery/vehicles/${v.id}`);
      toast.success(`Camion ${v.plate} supprimé`);
      setConfirmDel(null);
      load();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Suppression impossible"));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <SectionTitle n={4} tone="bg-slate-700" title="Configuration" subtitle="Mode de distribution de chaque département, camions et chauffeurs." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GlassCard title="Configuration des départements" icon={Settings2}>
          <p className="mb-3 text-[11px] text-slate-500">
            Départements définis dans le CRM. En « Stock embarqué », les ventes du marketeur sont retirées de son camion ; en « Sur commande », elles suivent le parcours de livraison.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-2.5 py-2 font-semibold">N°</th>
                  <th className="px-2.5 py-2 font-semibold">Département</th>
                  <th className="px-2.5 py-2 text-right font-semibold">Clients</th>
                  <th className="px-2.5 py-2 font-semibold">Mode de distribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {depts.map((d, i) => (
                  <tr key={d.name}>
                    <td className="px-2.5 py-2 tabular-nums text-slate-500">{String(i + 1).padStart(2, "0")}</td>
                    <td className="px-2.5 py-2 font-semibold text-slate-900">{d.name}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums">{fmtNum(d.clients)}</td>
                    <td className="px-2.5 py-2">
                      <div className="inline-flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label={`Mode ${d.name}`}>
                        {[
                          { v: "embarked", l: "Stock embarqué", on: "bg-emerald-600 text-white" },
                          { v: "on_order", l: "Sur commande", on: "bg-orange-500 text-white" },
                        ].map((o) => (
                          <button
                            key={o.v}
                            type="button"
                            disabled={!canManage || busy === d.name}
                            aria-pressed={d.mode === o.v}
                            onClick={() => d.mode !== o.v && setMode(d.name, o.v)}
                            className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${d.mode === o.v ? o.on : "text-slate-500 hover:bg-slate-50"} disabled:cursor-default`}
                          >
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard title={`Camions & chauffeurs (${vehicles.length})`} icon={Truck}>
          {canManage && (
            <form onSubmit={addVehicle} className="mb-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
              <input name="veh_plate" required placeholder="Plaque *" aria-label="Plaque" className={`${selectCls} mt-0 font-mono uppercase`} />
              <input name="veh_driver" required placeholder="Chauffeur *" aria-label="Chauffeur" className={`${selectCls} mt-0`} />
              <input name="veh_phone" placeholder="Téléphone" aria-label="Téléphone" className={`${selectCls} mt-0`} />
              <select name="veh_type" aria-label="Type" defaultValue="Camionnette" className={`${selectCls} mt-0`}>
                {["Camionnette", "Camion", "Moto", "Tricycle"].map((t) => <option key={t}>{t}</option>)}
              </select>
              <div className="col-span-2 flex gap-2 md:col-span-1">
                <input name="veh_capacity" type="number" min={1} placeholder="Capacité" aria-label="Capacité (unités)" className={`${selectCls} mt-0`} />
                <Button type="submit" size="sm" className="h-9 rounded-xl bg-[#0F3D68] px-2.5 text-white" aria-label="Ajouter le camion">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-2.5 py-2 font-semibold">Camion</th>
                  <th className="px-2.5 py-2 font-semibold">Chauffeur</th>
                  <th className="px-2.5 py-2 font-semibold">Affecté à</th>
                  <th className="px-2.5 py-2 text-right font-semibold">Chargement</th>
                  {canManage && <th className="px-2.5 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td className="px-2.5 py-2">
                      <div className="font-mono font-bold text-slate-900">{v.plate}</div>
                      <div className="text-[10px] text-slate-500">{v.type}</div>
                    </td>
                    <td className="px-2.5 py-2">
                      <div className="font-semibold text-slate-800">{v.driver_name}</div>
                      {v.driver_phone && <div className="text-[10px] text-slate-500">{v.driver_phone}</div>}
                    </td>
                    <td className="px-2.5 py-2 text-slate-600">{v.assigned_to || "—"}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums">
                      {fmtNum(v.load)}{v.capacity ? ` / ${fmtNum(v.capacity)}` : ""}
                    </td>
                    {canManage && (
                      <td className="px-2.5 py-2 text-right">
                        {confirmDel === v.id ? (
                          <span role="alertdialog" className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800">
                            Supprimer ?
                            <button type="button" onClick={() => removeVehicle(v)} className="rounded bg-red-600 px-1.5 font-bold text-white">Oui</button>
                            <button type="button" onClick={() => setConfirmDel(null)} className="rounded border border-red-200 bg-white px-1.5">Non</button>
                          </span>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setConfirmDel(v.id)} aria-label={`Supprimer ${v.plate}`} className="h-7 w-7 rounded-lg p-0 text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {!vehicles.length && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">Aucun camion. Ajoutez la plaque, le chauffeur et la capacité.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>
    </section>
  );
}
