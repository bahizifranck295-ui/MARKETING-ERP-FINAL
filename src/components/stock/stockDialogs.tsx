import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, ArrowRightLeft, Building2, Loader2, MapPin, PackagePlus } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fieldCls } from "@/components/stock/ui";

function StatusField({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <Label className="text-xs font-semibold">Statut</Label>
      <div className="mt-1 flex gap-2">
        {[
          { v: true, label: "Actif" },
          { v: false, label: "Inactif" },
        ].map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={value === o.v}
            className={`h-9 flex-1 rounded-lg border text-xs font-semibold transition-colors ${
              value === o.v ? "border-[#0F3D68] bg-[#0F3D68] text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Nouveau site ---------- */
export function SiteFormDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (site: any) => void }) {
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(true);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = e.currentTarget.elements as any;
    setSaving(true);
    try {
      const { data } = await api.post("/stock/sites", {
        name: f.site_name.value,
        code: f.site_code.value,
        location: f.site_location.value,
        description: f.site_description.value,
        is_active: active,
      });
      toast.success(`Site ${data.name} créé`);
      onSaved(data);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Impossible de créer le site"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-5 w-5 text-[#0F3D68]" /> Nouveau site
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-1 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="site_name" className="text-xs font-semibold">Nom du site *</Label>
              <input id="site_name" name="site_name" required placeholder="Goma" className={fieldCls} />
            </div>
            <div>
              <Label htmlFor="site_code" className="text-xs font-semibold">Code du site *</Label>
              <input id="site_code" name="site_code" required placeholder="SITE-GOM" className={`${fieldCls} font-mono uppercase`} />
            </div>
          </div>
          <div>
            <Label htmlFor="site_location" className="text-xs font-semibold">Adresse / localisation</Label>
            <input id="site_location" name="site_location" placeholder="Goma, Nord-Kivu" className={fieldCls} />
          </div>
          <div>
            <Label htmlFor="site_description" className="text-xs font-semibold">Description</Label>
            <textarea id="site_description" name="site_description" rows={2} className={`${fieldCls} h-auto py-2`} />
          </div>
          <StatusField value={active} onChange={setActive} />
          <DialogFooter className="gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving} className="bg-[#0F3D68] text-white hover:bg-[#0B2F52]">
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Créer le site
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Nouveau dépôt (site parent imposé) ---------- */
export function DepotFormDialog({ site, onClose, onSaved }: { site: any; onClose: () => void; onSaved: (depot: any) => void }) {
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(true);
  // Responsables possibles : utilisateurs ayant le rôle « Gestionnaire de stock »
  const [managers, setManagers] = useState<{ role: { name: string }; users: any[] } | null>(null);
  useEffect(() => {
    api
      .get("/stock/depot-managers")
      .then(({ data }) => setManagers(data))
      .catch(() => setManagers({ role: { name: "Gestionnaire de stock" }, users: [] }));
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = e.currentTarget.elements as any;
    setSaving(true);
    try {
      const { data } = await api.post("/stock/depots", {
        site_id: site.id,
        name: f.depot_name.value,
        code: f.depot_code.value,
        manager_user_id: f.depot_manager.value || undefined,
        location: f.depot_location.value,
        description: f.depot_description.value,
        is_active: active,
      });
      toast.success(`Dépôt ${data.name} créé sur le site ${site.name}`);
      onSaved(data);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Impossible de créer le dépôt"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-5 w-5 text-[#0F3D68]" /> Nouveau dépôt
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-1 text-xs">
          <div className="flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50/60 px-3 py-2">
            <MapPin className="h-4 w-4 text-[#0F3D68]" />
            <span className="text-slate-600">Site parent :</span>
            <strong className="text-slate-900">{site.name}</strong>
            <span className="font-mono text-[10px] text-slate-500">{site.code}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="depot_name" className="text-xs font-semibold">Nom du dépôt *</Label>
              <input id="depot_name" name="depot_name" required placeholder="Dépôt Principal" className={fieldCls} />
            </div>
            <div>
              <Label htmlFor="depot_code" className="text-xs font-semibold">Code du dépôt *</Label>
              <input id="depot_code" name="depot_code" required placeholder="DEP-GOM-01" className={`${fieldCls} font-mono uppercase`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="depot_manager" className="text-xs font-semibold">Responsable</Label>
              <select id="depot_manager" name="depot_manager" defaultValue="" className={fieldCls} disabled={!managers}>
                <option value="">{managers ? (managers.users.length ? "Choisir un responsable…" : "Aucun utilisateur disponible") : "Chargement…"}</option>
                {managers?.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
              {managers && (
                <p className="mt-1 text-[10px] text-slate-500">
                  {managers.users.length
                    ? `Utilisateurs ayant le rôle « ${managers.role.name} ».`
                    : `Créez d'abord un utilisateur avec le rôle « ${managers.role.name} » dans Utilisateurs.`}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="depot_location" className="text-xs font-semibold">Localisation</Label>
              <input id="depot_location" name="depot_location" placeholder="Quartier, avenue…" className={fieldCls} />
            </div>
          </div>
          <div>
            <Label htmlFor="depot_description" className="text-xs font-semibold">Description</Label>
            <textarea id="depot_description" name="depot_description" rows={2} className={`${fieldCls} h-auto py-2`} />
          </div>
          <StatusField value={active} onChange={setActive} />
          <DialogFooter className="gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving} className="bg-[#0F3D68] text-white hover:bg-[#0B2F52]">
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Créer le dépôt
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Ajouter un produit à un dépôt ---------- */
export function AddProductToDepotDialog({ depot, onClose, onSaved }: { depot: any; onClose: () => void; onSaved: () => void }) {
  const [products, setProducts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/products").then(({ data }) => setProducts(Array.isArray(data) ? data : [])).catch(() => setProducts([]));
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = e.currentTarget.elements as any;
    setSaving(true);
    try {
      await api.post(`/stock/depots/${depot.id}/products`, {
        product_id: f.add_product.value,
        quantity: Number(f.add_quantity.value) || 0,
        location_ref: f.add_location.value,
      });
      toast.success("Produit enregistré dans le dépôt");
      onSaved();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Impossible d'ajouter le produit"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <PackagePlus className="h-5 w-5 text-[#0F3D68]" /> Ajouter un produit
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-1 text-xs">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 px-3 py-2 text-slate-700">
            Dépôt : <strong className="text-slate-900">{depot.label || depot.name}</strong>
          </div>
          <div>
            <Label htmlFor="add_product" className="text-xs font-semibold">Produit *</Label>
            <select id="add_product" name="add_product" required className={fieldCls} defaultValue="">
              <option value="" disabled>Choisir un produit…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.size ? ` · ${p.size}` : ""} ({p.code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="add_quantity" className="text-xs font-semibold">Quantité initiale</Label>
              <input id="add_quantity" name="add_quantity" type="number" min={0} step="1" defaultValue={0} className={`${fieldCls} font-bold`} />
            </div>
            <div>
              <Label htmlFor="add_location" className="text-xs font-semibold">Emplacement (facultatif)</Label>
              <input id="add_location" name="add_location" placeholder="Rayon A3" className={fieldCls} />
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            La quantité initiale entre en stock dans ce dépôt et s'ajoute au stock global du produit.
          </p>
          <DialogFooter className="gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving} className="bg-[#0F3D68] text-white hover:bg-[#0B2F52]">
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Ajouter au dépôt
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Transférer du stock (même site ou entre sites) ---------- */
export function TransferDialog({
  presetFromId,
  presetProductId,
  onClose,
  onSaved,
}: {
  presetFromId?: string;
  presetProductId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [products, setProducts] = useState<any[]>([]);
  const [depots, setDepots] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [productId, setProductId] = useState(presetProductId || "");
  const [fromId, setFromId] = useState(presetFromId || "");
  const [toId, setToId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/products").then(({ data }) => setProducts(Array.isArray(data) ? data : [])).catch(() => {});
    api.get("/stock/depots").then(({ data }) => setDepots(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!productId) return setLevels([]);
    api
      .get("/stock/levels", { params: { product_id: productId } })
      .then(({ data }) => setLevels(Array.isArray(data) ? data : []))
      .catch(() => setLevels([]));
  }, [productId]);

  const qtyIn = (wid: string) => levels.find((l) => l.warehouse_id === wid)?.quantity || 0;
  const available = fromId ? qtyIn(fromId) : 0;
  const amount = Number(qty) || 0;
  const tooMuch = amount > available;
  const sources = useMemo(() => depots.filter((d) => qtyIn(d.id) > 0 || d.id === fromId), [depots, levels, fromId]);
  const from = depots.find((d) => d.id === fromId);
  const to = depots.find((d) => d.id === toId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/stock/transfers", {
        product_id: productId,
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        quantity: amount,
        note,
      });
      toast.success(`Transfert ${data.code} effectué : ${data.quantity} × ${data.product_name}`);
      onSaved();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Transfert impossible"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowRightLeft className="h-5 w-5 text-[#0F3D68]" /> Transférer du stock
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-1 text-xs">
          <div>
            <Label htmlFor="trf_product" className="text-xs font-semibold">Produit *</Label>
            <select
              id="trf_product"
              required
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                if (!presetFromId) setFromId("");
              }}
              className={fieldCls}
            >
              <option value="" disabled>Choisir un produit…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.size ? ` · ${p.size}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
            <div className="min-w-0">
              <Label htmlFor="trf_from" className="text-xs font-semibold">Dépôt source *</Label>
              <select id="trf_from" required value={fromId} onChange={(e) => setFromId(e.target.value)} className={fieldCls} disabled={!productId}>
                <option value="" disabled>{productId ? "Choisir…" : "Choisir d'abord un produit"}</option>
                {sources.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label} ({qtyIn(d.id)})
                  </option>
                ))}
              </select>
            </div>
            <ArrowRight className="mb-2.5 h-4 w-4 text-slate-400" />
            <div className="min-w-0">
              <Label htmlFor="trf_to" className="text-xs font-semibold">Dépôt destination *</Label>
              <select id="trf_to" required value={toId} onChange={(e) => setToId(e.target.value)} className={fieldCls}>
                <option value="" disabled>Choisir…</option>
                {depots
                  .filter((d) => d.id !== fromId && d.is_active !== false)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="trf_qty" className="text-xs font-semibold">Quantité *</Label>
              <input
                id="trf_qty"
                type="number"
                min={1}
                step="1"
                required
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className={`${fieldCls} font-bold ${tooMuch ? "border-red-300 ring-2 ring-red-200" : ""}`}
              />
              {fromId && (
                <p className={`mt-1 text-[11px] ${tooMuch ? "font-semibold text-red-600" : "text-slate-500"}`}>
                  {tooMuch ? `Quantité insuffisante : ${available} disponible(s)` : `${available} disponible(s) dans la source`}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="trf_note" className="text-xs font-semibold">Motif (facultatif)</Label>
              <input id="trf_note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Réassort, regroupement…" className={fieldCls} />
            </div>
          </div>
          {from && to && amount > 0 && !tooMuch && (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 px-3 py-2 text-slate-700">
              {from.label} : {available} → <strong>{available - amount}</strong> · {to.label} : {qtyIn(to.id)} →{" "}
              <strong>{qtyIn(to.id) + amount}</strong>
              {from.site_id !== to.site_id && <span className="ml-1 font-semibold text-[#0F3D68]">(transfert entre sites)</span>}
            </div>
          )}
          <DialogFooter className="gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving || tooMuch || !amount} className="bg-[#0F3D68] text-white hover:bg-[#0B2F52]">
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Valider le transfert
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Ajuster la quantité d'un produit dans un dépôt ---------- */
export function AdjustInDepotDialog({ depot, product, onClose, onSaved }: { depot: any; product: any; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("reception");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const current = Number(product.quantity) || 0;
  const amount = Math.abs(Number(qty) || 0);
  const next = mode === "in" ? current + amount : current - amount;
  const tooMuch = next < 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/stock/depots/${depot.id}/adjust`, {
        product_id: product.id,
        quantity: mode === "in" ? amount : -amount,
        reason,
        note,
      });
      toast.success(`${product.name} : ${current} → ${next} dans ${depot.name}`);
      onSaved();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Ajustement impossible"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Ajuster : {product.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-1 text-xs">
          <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 px-3 py-2 text-slate-700">
            {depot.label || depot.name} · en stock : <strong className="text-slate-900">{current}</strong>
          </div>
          <div className="flex gap-2">
            {[
              { v: "in" as const, label: "Ajouter (+)" },
              { v: "out" as const, label: "Retirer (−)" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => {
                  setMode(o.v);
                  setReason(o.v === "in" ? "reception" : "damage");
                }}
                aria-pressed={mode === o.v}
                className={`h-9 flex-1 rounded-lg border text-xs font-semibold ${
                  mode === o.v ? "border-[#0F3D68] bg-[#0F3D68] text-white" : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="adj_qty" className="text-xs font-semibold">Quantité *</Label>
            <input
              id="adj_qty"
              type="number"
              min={1}
              step="1"
              required
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={`${fieldCls} font-bold ${tooMuch ? "border-red-300 ring-2 ring-red-200" : ""}`}
            />
            <p className={`mt-1 text-[11px] ${tooMuch ? "font-semibold text-red-600" : "text-slate-500"}`}>
              {tooMuch ? `Quantité insuffisante : ${current} en stock` : amount ? `Nouveau stock dans ce dépôt : ${next}` : "Saisissez la quantité"}
            </p>
          </div>
          <div>
            <Label htmlFor="adj_reason" className="text-xs font-semibold">Motif</Label>
            <select id="adj_reason" value={reason} onChange={(e) => setReason(e.target.value)} className={fieldCls}>
              <option value="reception">Réception fournisseur</option>
              <option value="inventory_correction">Correction d'inventaire</option>
              <option value="damage">Perte / Avarie</option>
              <option value="return">Retour client</option>
            </select>
          </div>
          <div>
            <Label htmlFor="adj_note" className="text-xs font-semibold">Note (facultatif)</Label>
            <input id="adj_note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="N° de bon, remarque…" className={fieldCls} />
          </div>
          <DialogFooter className="gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving || tooMuch || !amount} className="bg-[#0F3D68] text-white hover:bg-[#0B2F52]">
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Valider
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
