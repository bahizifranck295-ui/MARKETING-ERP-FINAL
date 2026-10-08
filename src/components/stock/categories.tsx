import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Loader2, Plus, Shapes, Trash2, X } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtMoney, fmtNum } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/stock/ui";

/* Catégories de produits : liste, création, suppression confirmée */
function useCategories() {
  const [categories, setCategories] = useState<Array<{ name: string; product_count: number }>>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get("/stock/categories");
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur de chargement des catégories"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (name: string) => {
    const { data } = await api.post("/stock/categories", { name });
    await load();
    toast.success(`Catégorie « ${data.name} » créée`);
    return data.name as string;
  };

  const remove = async (name: string) => {
    await api.delete(`/stock/categories/${encodeURIComponent(name)}`);
    await load();
    toast.success(`Catégorie « ${name} » supprimée`);
  };

  return { categories, loading, create, remove, reload: load };
}

function ConfirmDelete({ name, onConfirm, onCancel, busy }: any) {
  return (
    <div role="alertdialog" aria-label={`Supprimer ${name}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-800">
      <span className="flex-1">Supprimer « {name} » ?</span>
      <button type="button" onClick={onConfirm} disabled={busy} className="rounded-md bg-red-600 px-2 py-0.5 font-bold text-white hover:bg-red-700 disabled:opacity-50">
        {busy ? "…" : "Supprimer"}
      </button>
      <button type="button" onClick={onCancel} className="rounded-md border border-red-200 bg-white px-2 py-0.5 font-semibold text-red-700">
        Annuler
      </button>
    </div>
  );
}

function CreateCategoryInline({ onCreate, onCancel }: { onCreate: (name: string) => Promise<void>; onCancel?: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await onCreate(value.trim());
      setValue("");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Impossible de créer la catégorie"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Entrée crée la catégorie sans envoyer le formulaire du produit
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") onCancel?.();
        }}
        placeholder="Nom de la nouvelle catégorie"
        aria-label="Nom de la nouvelle catégorie"
        className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/25"
      />
      <button type="button" onClick={submit} disabled={busy || !value.trim()} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#0F3D68] px-2.5 text-[11px] font-bold text-white disabled:opacity-50">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Créer
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} aria-label="Annuler" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Champ « Catégorie » du formulaire Nouveau produit : liste déroulante des
 * catégories existantes + « Créer une catégorie » + suppression confirmée.
 * La valeur est envoyée via un champ caché du même nom que l'ancien champ.
 */
export function CategoryPicker({ name, defaultValue = "" }: { name: string; defaultValue?: string }) {
  const { categories, create, remove } = useCategories();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const doRemove = async (c: string) => {
    setBusy(true);
    try {
      await remove(c);
      if (value === c) setValue("");
      setConfirm(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Suppression impossible"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-9 w-full items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-xs focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/25"
      >
        <span className={`truncate ${value ? "text-slate-900" : "text-slate-400"}`}>{value || "Choisir…"}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="relative z-10 mt-1 w-[min(320px,80vw)] space-y-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
          <ul role="listbox" aria-label="Catégories" className="max-h-48 space-y-0.5 overflow-y-auto">
            {categories.map((c) =>
              confirm === c.name ? (
                <li key={c.name}>
                  <ConfirmDelete name={c.name} busy={busy} onConfirm={() => doRemove(c.name)} onCancel={() => setConfirm(null)} />
                </li>
              ) : (
                <li key={c.name} className="flex items-center gap-1">
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === c.name}
                    onClick={() => {
                      setValue(c.name);
                      setOpen(false);
                    }}
                    className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs ${
                      value === c.name ? "bg-cyan-50 font-semibold text-[#0F3D68]" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {value === c.name ? <Check className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto text-[10px] text-slate-400">{c.product_count}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm(c.name)}
                    title={`Supprimer la catégorie ${c.name}`}
                    aria-label={`Supprimer la catégorie ${c.name}`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            )}
            {!categories.length && <li className="px-2 py-2 text-[11px] text-slate-500">Aucune catégorie pour l'instant.</li>}
          </ul>
          <div className="border-t border-slate-100 pt-1.5">
            {creating ? (
              <CreateCategoryInline
                onCancel={() => setCreating(false)}
                onCreate={async (n) => {
                  const created = await create(n);
                  setValue(created);
                  setCreating(false);
                  setOpen(false);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-bold text-[#0F3D68] hover:bg-cyan-50"
              >
                <Plus className="h-3.5 w-3.5" /> Créer une catégorie
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* Onglet « Catégories » du module Stock */
export function CategoriesPanel({ products, onChanged }: { products: any[]; onChanged?: () => void }) {
  const { has } = useAuth();
  const canEdit = has("stock.create") || has("stock.update") || has("stock.write");
  const { categories, loading, create, remove } = useCategories();
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valueByCat = useMemo(() => {
    const m = new Map<string, number>();
    products.forEach((p) => {
      const k = (p.category || "").trim().toLowerCase();
      m.set(k, (m.get(k) || 0) + (Number(p.stock) || 0) * (Number(p.cost_price) || 0));
    });
    return m;
  }, [products]);

  return (
    <GlassCard
      title={`Catégories (${categories.length})`}
      icon={Shapes}
      right={
        canEdit &&
        !creating && (
          <Button size="sm" onClick={() => setCreating(true)} className="h-8 rounded-xl bg-[#0F3D68] text-white hover:bg-[#0B2F52]">
            <Plus className="mr-1 h-4 w-4" /> Créer une catégorie
          </Button>
        )
      }
    >
      {creating && (
        <div className="mb-3 max-w-md">
          <CreateCategoryInline
            onCancel={() => setCreating(false)}
            onCreate={async (n) => {
              await create(n);
              setCreating(false);
              onChanged?.();
            }}
          />
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2.5 py-3 font-semibold">Catégorie</th>
                <th className="px-2.5 py-3 text-right font-semibold">Produits</th>
                <th className="px-2.5 py-3 text-right font-semibold">Valeur du stock</th>
                {canEdit && <th className="px-2.5 py-3 text-center font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <tr key={c.name} className="hover:bg-cyan-50/40">
                  <td className="px-2.5 py-3 font-semibold text-slate-900">{c.name}</td>
                  <td className="px-2.5 py-3 text-right tabular-nums">{fmtNum(c.product_count)}</td>
                  <td className="px-2.5 py-3 text-right font-semibold tabular-nums">{fmtMoney(valueByCat.get(c.name.toLowerCase()) || 0)}</td>
                  {canEdit && (
                    <td className="px-2.5 py-3 text-center">
                      {confirm === c.name ? (
                        <ConfirmDelete
                          name={c.name}
                          busy={busy}
                          onCancel={() => setConfirm(null)}
                          onConfirm={async () => {
                            setBusy(true);
                            try {
                              await remove(c.name);
                              setConfirm(null);
                              onChanged?.();
                            } catch (err) {
                              toast.error(extractErrorMessage(err, "Suppression impossible"));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirm(c.name)}
                          title={c.product_count ? "Utilisée par des produits : changez d'abord leur catégorie" : undefined}
                          className="h-8 rounded-lg text-[11px] text-red-600 hover:border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Supprimer
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {!categories.length && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    Aucune catégorie. Créez la première avec « Créer une catégorie ».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
