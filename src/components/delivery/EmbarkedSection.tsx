import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, History, Loader2, PackageCheck, RotateCcw, ShoppingBag, Sliders, Truck, User, Warehouse } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { fmtMoney, fmtNum } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassCard, ProductPhoto, fmtDateTime } from "@/components/stock/ui";
import { RingGauge, SectionTitle, TruckIllustration, TypePill, MOVE_TYPES, selectCls } from "@/components/delivery/deliveryUi";

type Props = { canManage: boolean; onChanged: () => void; formAnchor?: React.RefObject<HTMLDivElement | null> };

export default function EmbarkedSection({ canManage, onChanged, formAnchor }: Props) {
  const [depots, setDepots] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [marketers, setMarketers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [stocks, setStocks] = useState<any[]>([]);
  const [moves, setMoves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulaire de déstockage : Dépôt → Produit → Quantité → Marketeur → Chauffeur
  const [depotId, setDepotId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");
  const [marketerId, setMarketerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastLoad, setLastLoad] = useState<any>(null);

  const [selected, setSelected] = useState<string>("");
  const [action, setAction] = useState<null | { kind: "return" | "adjust"; stock: any }>(null);
  const [filters, setFilters] = useState({ marketer: "all", vehicle: "all", product: "all", type: "all", date: "" });

  const load = async () => {
    try {
      const calls = [api.get("/delivery/embarked"), api.get("/delivery/embarked/movements")];
      if (canManage) calls.push(api.get("/stock/depots"), api.get("/products"), api.get("/stock/levels"), api.get("/delivery/marketers"), api.get("/delivery/vehicles"));
      const [s, m, d, p, l, mk, v] = await Promise.all(calls);
      const list = Array.isArray(s.data) ? s.data : [];
      setStocks(list);
      setMoves(Array.isArray(m.data) ? m.data : []);
      if (canManage) {
        setDepots((d!.data || []).filter((x: any) => x.is_active !== false));
        setProducts(p!.data || []);
        setLevels(l!.data || []);
        setMarketers(mk!.data || []);
        setVehicles((v!.data || []).filter((x: any) => x.is_active !== false));
      }
      setSelected((cur) => (cur && list.some((x: any) => x.id === cur) ? cur : list[0]?.id || ""));
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur de chargement du stock embarqué"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [canManage]);

  const available = (pid: string) => levels.find((l) => l.product_id === pid && l.warehouse_id === depotId)?.quantity || 0;
  const depotProducts = useMemo(() => products.filter((p) => available(p.id) > 0), [products, levels, depotId]);
  const product = products.find((p) => p.id === productId);
  const depot = depots.find((d) => d.id === depotId);
  const amount = Number(qty) || 0;
  const tooMuch = !!productId && amount > available(productId);

  const submitLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/delivery/embarked/load", { warehouse_id: depotId, product_id: productId, quantity: amount, marketer_id: marketerId, vehicle_id: vehicleId });
      setLastLoad({ code: data.code, qty: amount, product: product?.name, depot: depot?.label, marketer: data.embarked.marketer_name, plate: data.embarked.vehicle?.plate });
      toast.success(`Déstockage ${data.code} validé`);
      setQty("");
      setSelected(data.embarked.id);
      await load();
      onChanged();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Déstockage impossible"));
    } finally {
      setSaving(false);
    }
  };

  const stock = stocks.find((s) => s.id === selected);
  const sales = moves.filter((m) => m.type === "sale" && m.embarked_id === selected).slice(0, 8);
  const filteredMoves = moves.filter(
    (m) =>
      (filters.marketer === "all" || m.marketer_id === filters.marketer) &&
      (filters.vehicle === "all" || m.vehicle_plate === filters.vehicle) &&
      (filters.product === "all" || m.product_id === filters.product) &&
      (filters.type === "all" || m.type === filters.type) &&
      (!filters.date || (m.at || "").slice(0, 10) === filters.date)
  );
  const uniq = (arr: any[], key: string, label: string) =>
    Array.from(new Map(arr.filter((x) => x[key]).map((x) => [x[key], x[label]])).entries()).sort((a, b) => String(a[1]).localeCompare(String(b[1]), "fr"));

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        {/* Déstockage */}
        {canManage ? (
          <section ref={formAnchor} className="min-w-0 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 to-white p-4 shadow-[0_10px_30px_-18px_rgba(15,61,104,0.35)]">
            <SectionTitle n={1} title="Déstockage vers stock embarqué" subtitle="Retirez une quantité d'un dépôt et affectez-la au stock embarqué d'un marketeur." />
            <form onSubmit={submitLoad} className="mt-4 grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
              <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                <legend className="px-1 text-[11px] font-bold text-slate-700">1. Produit et quantité</legend>
                <Label htmlFor="ld_depot" className="text-[11px] font-semibold">Dépôt source</Label>
                <select id="ld_depot" required value={depotId} onChange={(e) => { setDepotId(e.target.value); setProductId(""); }} className={selectCls}>
                  <option value="" disabled>Choisir un dépôt…</option>
                  {depots.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
                <Label htmlFor="ld_product" className="text-[11px] font-semibold">Produit</Label>
                <select id="ld_product" required value={productId} disabled={!depotId} onChange={(e) => setProductId(e.target.value)} className={selectCls}>
                  <option value="" disabled>{depotId ? (depotProducts.length ? "Choisir un produit…" : "Aucun produit en stock") : "Choisir d'abord un dépôt"}</option>
                  {depotProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.size ? ` · ${p.size}` : ""} ({available(p.id)} dispo.)
                    </option>
                  ))}
                </select>
                <Label htmlFor="ld_qty" className="text-[11px] font-semibold">Quantité à déstocker</Label>
                <input id="ld_qty" type="number" min={1} step="1" required value={qty} onChange={(e) => setQty(e.target.value)} className={`${selectCls} font-bold ${tooMuch ? "border-red-300 ring-2 ring-red-200" : ""}`} />
                {productId && (
                  <p className={`text-[11px] ${tooMuch ? "font-semibold text-red-600" : "text-slate-500"}`}>
                    {tooMuch ? `Quantité insuffisante : ${available(productId)} dans le dépôt` : `${available(productId)} disponible(s) dans le dépôt`}
                  </p>
                )}
              </fieldset>
              <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                <legend className="px-1 text-[11px] font-bold text-slate-700">2. Marketeur et chauffeur</legend>
                <Label htmlFor="ld_marketer" className="text-[11px] font-semibold">Marketeur</Label>
                <select id="ld_marketer" required value={marketerId} onChange={(e) => setMarketerId(e.target.value)} className={selectCls}>
                  <option value="" disabled>Choisir un marketeur…</option>
                  {marketers.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
                <Label htmlFor="ld_vehicle" className="text-[11px] font-semibold">Chauffeur / camion</Label>
                <select id="ld_vehicle" required value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={selectCls}>
                  <option value="" disabled>{vehicles.length ? "Choisir un chauffeur…" : "Aucun camion : ajoutez-en dans Configuration"}</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.driver_name} · {v.plate}{v.capacity ? ` (${fmtNum(v.load)}/${fmtNum(v.capacity)})` : ""}
                    </option>
                  ))}
                </select>
                <Button type="submit" disabled={saving || tooMuch || !amount} className="mt-2 w-full rounded-xl bg-emerald-700 text-white hover:bg-emerald-800">
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />} Valider le déstockage
                </Button>
              </fieldset>
            </form>
            {lastLoad && (
              <div role="status" className="mt-3 rounded-xl border border-emerald-200 bg-white p-3 text-xs">
                <div className="flex items-center gap-2 font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Déstockage réussi · {lastLoad.code}
                </div>
                <p className="mt-1 text-slate-600">
                  {fmtNum(lastLoad.qty)} unités de {lastLoad.product} ont été retirées de {lastLoad.depot} et ajoutées au stock embarqué de {lastLoad.marketer}.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                    <Warehouse className="h-3.5 w-3.5 text-[#0F3D68]" /> Dépôt <strong className="text-red-600">− {fmtNum(lastLoad.qty)}</strong>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1">
                    <Truck className="h-3.5 w-3.5 text-emerald-700" /> Stock embarqué <strong className="text-emerald-700">+ {fmtNum(lastLoad.qty)}</strong>
                  </span>
                </div>
              </div>
            )}
          </section>
        ) : (
          <GlassCard title="Mon stock embarqué" icon={Truck}>
            <p className="text-xs text-slate-500">Votre stock embarqué est chargé par un responsable depuis le dépôt. Vos ventes sont retirées de ce stock.</p>
          </GlassCard>
        )}

        {/* Stock embarqué du marketeur */}
        <GlassCard
          title="Stock embarqué du marketeur"
          icon={Truck}
          right={
            stocks.length > 1 && (
              <select aria-label="Marketeur" value={selected} onChange={(e) => setSelected(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold">
                {stocks.map((s) => (
                  <option key={s.id} value={s.id}>{s.marketer_name}</option>
                ))}
              </select>
            )
          }
        >
          {!stock ? (
            <p className="py-8 text-center text-xs text-slate-500">Aucun stock embarqué pour l'instant. Utilisez le déstockage pour charger un camion.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <TruckIllustration fill={stock.fill} plate={stock.vehicle?.plate} className="h-20 w-auto shrink-0" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-slate-900">{stock.marketer_name}</div>
                  <div className="text-[11px] text-slate-500">Marketeur</div>
                  {stock.vehicle ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="rounded-md bg-[#0F3D68] px-2 py-0.5 text-[10px] font-bold text-white">{stock.vehicle.type || "Camion"} : {stock.vehicle.plate}</span>
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        <User className="h-3 w-3" /> {stock.vehicle.driver_name}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1 text-[10px] text-slate-400">Aucun camion affecté</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                <RingGauge pct={stock.fill} size={64} />
                <dl className="grid flex-1 grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-[10px] text-slate-500">Stock actuel</dt>
                    <dd className="font-black tabular-nums text-emerald-700">{fmtNum(stock.total_quantity)} unités</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-slate-500">Capacité camion</dt>
                    <dd className="font-bold tabular-nums text-slate-900">{stock.capacity ? `${fmtNum(stock.capacity)} unités` : "Non définie"}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[10px] text-slate-500">Valeur embarquée</dt>
                    <dd className="font-bold tabular-nums text-slate-900">{fmtMoney(stock.total_value)}</dd>
                  </div>
                </dl>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {stock.items.map((it: any) => (
                  <div key={it.product_id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
                    <ProductPhoto src={it.image_url} className="h-8 w-8" />
                    <div className="min-w-0">
                      <div className="truncate text-[11px] font-semibold text-slate-800">{it.name}{it.size ? ` · ${it.size}` : ""}</div>
                      <div className="text-xs font-black tabular-nums text-slate-900">{fmtNum(it.quantity)}</div>
                    </div>
                  </div>
                ))}
                {!stock.items.length && <p className="col-span-full text-center text-[11px] text-slate-500">Camion vide.</p>}
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={!stock.items.length} onClick={() => setAction({ kind: "return", stock })} className="h-8 flex-1 rounded-lg text-[11px]">
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Retour au dépôt
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAction({ kind: "adjust", stock })} className="h-8 flex-1 rounded-lg text-[11px]">
                    <Sliders className="mr-1 h-3.5 w-3.5" /> Ajuster
                  </Button>
                </div>
              )}
            </div>
          )}
        </GlassCard>

        {/* Historique des ventes */}
        <GlassCard title={`Historique des ventes${stock ? ` (${stock.marketer_name})` : ""}`} icon={ShoppingBag}>
          <ul className="divide-y divide-slate-100 text-xs">
            {sales.map((m) => (
              <li key={m.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-slate-800">{m.product_name}</span>
                  <span className="shrink-0 font-black tabular-nums text-slate-900">{fmtNum(-m.quantity)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                  <span className="truncate">{m.client_name} · {fmtDateTime(m.at)}</span>
                  <span className="shrink-0">reste {fmtNum(m.balance_after)}</span>
                </div>
              </li>
            ))}
            {!sales.length && <li className="py-8 text-center text-slate-500">Aucune vente depuis ce stock embarqué.</li>}
          </ul>
        </GlassCard>
      </div>

      {/* Historique complet du stock embarqué */}
      <GlassCard title={`Historique du stock embarqué (${filteredMoves.length})`} icon={History}>
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          {canManage && (
            <label className="text-[11px] font-semibold text-slate-600">
              Marketeur
              <select value={filters.marketer} onChange={(e) => setFilters({ ...filters, marketer: e.target.value })} className={selectCls}>
                <option value="all">Tous</option>
                {uniq(moves, "marketer_id", "marketer_name").map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          )}
          <label className="text-[11px] font-semibold text-slate-600">
            Camion
            <select value={filters.vehicle} onChange={(e) => setFilters({ ...filters, vehicle: e.target.value })} className={selectCls}>
              <option value="all">Tous</option>
              {uniq(moves, "vehicle_plate", "vehicle_plate").map(([id]) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Produit
            <select value={filters.product} onChange={(e) => setFilters({ ...filters, product: e.target.value })} className={selectCls}>
              <option value="all">Tous</option>
              {uniq(moves, "product_id", "product_name").map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Mouvement
            <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className={selectCls}>
              <option value="all">Tous</option>
              {Object.entries(MOVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            Date
            <input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} className={selectCls} />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2.5 py-3 font-semibold">Date</th>
                <th className="px-2.5 py-3 font-semibold">Marketeur</th>
                <th className="px-2.5 py-3 font-semibold">Chauffeur / camion</th>
                <th className="px-2.5 py-3 font-semibold">Produit</th>
                <th className="px-2.5 py-3 font-semibold">Mouvement</th>
                <th className="px-2.5 py-3 text-right font-semibold">Quantité</th>
                <th className="px-2.5 py-3 text-right font-semibold">Reste</th>
                <th className="px-2.5 py-3 font-semibold">Détail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMoves.slice(0, 200).map((m) => (
                <tr key={m.id} className="hover:bg-cyan-50/40">
                  <td className="whitespace-nowrap px-2.5 py-2.5 text-slate-600">{fmtDateTime(m.at)}</td>
                  <td className="px-2.5 py-2.5 font-semibold text-slate-900">{m.marketer_name}</td>
                  <td className="px-2.5 py-2.5 text-slate-600">{m.driver_name ? `${m.driver_name} · ${m.vehicle_plate}` : "—"}</td>
                  <td className="px-2.5 py-2.5 text-slate-800">{m.product_name}{m.product_size ? ` · ${m.product_size}` : ""}</td>
                  <td className="px-2.5 py-2.5"><TypePill type={m.type} /></td>
                  <td className={`px-2.5 py-2.5 text-right font-bold tabular-nums ${m.quantity >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {m.quantity >= 0 ? "+" : ""}{fmtNum(m.quantity)}
                  </td>
                  <td className="px-2.5 py-2.5 text-right tabular-nums">{fmtNum(m.balance_after)}</td>
                  <td className="px-2.5 py-2.5 text-slate-500">
                    {m.client_name ? `${m.client_name} · ${m.order_code}` : m.warehouse_label || m.reason}
                  </td>
                </tr>
              ))}
              {!filteredMoves.length && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">Aucun mouvement pour ces filtres.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {action && (
        <EmbarkedActionDialog
          kind={action.kind}
          stock={action.stock}
          depots={depots}
          onClose={() => setAction(null)}
          onDone={async () => {
            setAction(null);
            await load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function EmbarkedActionDialog({ kind, stock, depots, onClose, onDone }: { kind: "return" | "adjust"; stock: any; depots: any[]; onClose: () => void; onDone: () => void }) {
  const [productId, setProductId] = useState(stock.items[0]?.product_id || "");
  const [depotId, setDepotId] = useState(depots[0]?.id || "");
  const [mode, setMode] = useState<"out" | "in">("out");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("Casse");
  const [saving, setSaving] = useState(false);
  const inTruck = stock.items.find((i: any) => i.product_id === productId)?.quantity || 0;
  const amount = Math.abs(Number(qty) || 0);
  const tooMuch = (kind === "return" || mode === "out") && amount > inTruck;
  const [products, setProducts] = useState<any[]>([]);
  useEffect(() => {
    if (kind === "adjust") api.get("/products").then(({ data }) => setProducts(data || [])).catch(() => {});
  }, [kind]);
  const options = kind === "adjust" && mode === "in" ? products.map((p) => ({ product_id: p.id, name: p.name, quantity: inTruckOf(stock, p.id) })) : stock.items;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (kind === "return") await api.post(`/delivery/embarked/${stock.id}/return`, { product_id: productId, quantity: amount, warehouse_id: depotId });
      else await api.post(`/delivery/embarked/${stock.id}/adjust`, { product_id: productId, quantity: mode === "in" ? amount : -amount, reason });
      toast.success(kind === "return" ? "Retour au dépôt enregistré" : "Ajustement enregistré");
      onDone();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Opération impossible"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{kind === "return" ? "Retour au dépôt" : "Ajuster le stock embarqué"} · {stock.marketer_name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-1 text-xs">
          {kind === "adjust" && (
            <div className="flex gap-2">
              {[{ v: "out" as const, l: "Retirer (−)" }, { v: "in" as const, l: "Ajouter (+)" }].map((o) => (
                <button key={o.v} type="button" aria-pressed={mode === o.v} onClick={() => setMode(o.v)} className={`h-9 flex-1 rounded-lg border text-xs font-semibold ${mode === o.v ? "border-[#0F3D68] bg-[#0F3D68] text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                  {o.l}
                </button>
              ))}
            </div>
          )}
          <div>
            <Label htmlFor="ea_product" className="text-xs font-semibold">Produit</Label>
            <select id="ea_product" required value={productId} onChange={(e) => setProductId(e.target.value)} className={selectCls}>
              <option value="" disabled>Choisir…</option>
              {options.map((i: any) => (
                <option key={i.product_id} value={i.product_id}>{i.name} ({fmtNum(i.quantity)} dans le camion)</option>
              ))}
            </select>
          </div>
          {kind === "return" && (
            <div>
              <Label htmlFor="ea_depot" className="text-xs font-semibold">Dépôt de retour</Label>
              <select id="ea_depot" required value={depotId} onChange={(e) => setDepotId(e.target.value)} className={selectCls}>
                {depots.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <Label htmlFor="ea_qty" className="text-xs font-semibold">Quantité</Label>
            <input id="ea_qty" type="number" min={1} step="1" required value={qty} onChange={(e) => setQty(e.target.value)} className={`${selectCls} font-bold ${tooMuch ? "border-red-300 ring-2 ring-red-200" : ""}`} />
            {tooMuch && <p className="mt-1 text-[11px] font-semibold text-red-600">Quantité insuffisante : {inTruck} dans le camion</p>}
          </div>
          {kind === "adjust" && (
            <div>
              <Label htmlFor="ea_reason" className="text-xs font-semibold">Motif</Label>
              <select id="ea_reason" value={reason} onChange={(e) => setReason(e.target.value)} className={selectCls}>
                {["Casse", "Perte", "Correction d'inventaire", "Échantillon", "Autre"].map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
          )}
          <DialogFooter className="gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving || tooMuch || !amount || !productId} className="bg-[#0F3D68] text-white hover:bg-[#0B2F52]">
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Valider
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function inTruckOf(stock: any, productId: string) {
  return stock.items.find((i: any) => i.product_id === productId)?.quantity || 0;
}
