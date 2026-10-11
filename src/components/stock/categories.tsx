import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, Loader2, Package, Pencil, Plus, Shapes, Trash2, X } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtMoney, fmtNum } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/stock/ui";
import { IS_COMMERCIAL } from "@/app/edition";

// Formulaire produit chargé à la demande (il importe lui-même CategoryPicker depuis ce fichier)
const ProductFormDialog = React.lazy(() => import("@/components/stock/NewProductDialog"));

// Gestion commerciale : catégories via l'intégration (sans données de stock) ; Stock & Livraison : module Stock
const CATEGORIES_API = IS_COMMERCIAL ? "/integration/categories" : "/stock/categories";

/* Catégories de produits : liste, création, suppression confirmée */
function useCategories() {
  const [categories, setCategories] = useState<Array<{ name: string; product_count: number }>>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await api.get(CATEGORIES_API);
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
    const { data } = await api.post(CATEGORIES_API, { name });
    await load();
    toast.success(`Catégorie « ${data.name} » créée`);
    return data.name as string;
  };

  const remove = async (name: string) => {
    await api.delete(`${CATEGORIES_API}/${encodeURIComponent(name)}`);
    await load();
    toast.success(`Catégorie « ${name} » supprimée`);
  };

  return { categories, loading, create, remove, reload: load };
}

function ProductThumb({ src }: { src?: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="h-12 w-12 shrink-0 rounded-lg object-cover" />;
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400">
      <Package className="h-5 w-5" />
    </span>
  );
}

/* Bouton Disponible / Indisponible (Gestion commerciale) : un produit indisponible ne peut pas être commandé */
function AvailabilityToggle({ product, canEdit, onChanged }: { product: any; canEdit: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const available = product.available !== false;
  const toggle = async () => {
    setBusy(true);
    try {
      await api.put(`/integration/catalog/${product.id}/availability`, { available: !available });
      toast.success(`« ${product.name} » ${available ? "indisponible" : "disponible"} à la vente`);
      onChanged();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Modification impossible"));
    } finally {
      setBusy(false);
    }
  };
  // Sans la permission : simple indication de l'état (aucun bouton)
  if (!canEdit)
    return (
      <span
        data-availability={available ? "on" : "off"}
        className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold ${available ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${available ? "bg-emerald-500" : "bg-red-500"}`} />
        {available ? "Disponible" : "Indisponible"}
      </span>
    );
  return (
    <button
      type="button"
      data-availability={available ? "on" : "off"}
      onClick={toggle}
      disabled={!canEdit || busy}
      title={available ? "Rendre ce produit indisponible à la commande" : "Rendre ce produit disponible à la commande"}
      aria-pressed={available}
      className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold disabled:cursor-default disabled:opacity-70 ${
        available ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100" : "bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${available ? "bg-emerald-500" : "bg-red-500"}`} />
      {busy ? "…" : available ? "Disponible" : "Indisponible"}
    </button>
  );
}

/* Produits d'une catégorie (photo, code, stock ou prix) avec suppression confirmée de chaque produit */
function CategoryProducts({ items, canEdit, canAvailability, onDeleted }: { items: any[]; canEdit: boolean; canAvailability: boolean; onDeleted: () => void }) {
  const { has } = useAuth();
  // Correction des informations d'un produit : rouvre le formulaire de création, pré-rempli
  const canUpdate = has("products.update");
  const [editing, setEditing] = useState<any>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!items.length) return <p className="px-1 py-2 text-[11px] text-slate-500">Aucun produit dans cette catégorie : elle peut être supprimée.</p>;
  return (
    <>
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Produits de la catégorie">
      {items.map((p) => {
        const qty = Number(p.stock ?? p.current_stock ?? 0) || 0;
        return (
          <li key={p.id} data-cat-product className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
            <div className="flex items-center gap-2.5">
              <ProductThumb src={p.image_url} />
              <div className="min-w-0 flex-1" data-no-translate>
                <div className="truncate text-xs font-bold text-slate-900" title={p.name}>
                  {p.name}
                </div>
                <div className="text-[10px] text-slate-500">{p.code}</div>
                <div className="text-[11px] font-semibold tabular-nums text-slate-700">
                  {IS_COMMERCIAL ? (
                    <>
                      {fmtMoney(Number(p.sell_price) || 0)} / {p.unit || "unité"}
                    </>
                  ) : (
                    <>
                      {fmtNum(qty)} {p.unit || ""} · {fmtMoney(qty * (Number(p.cost_price) || 0))}
                    </>
                  )}
                </div>
              </div>

              {canEdit && confirm !== p.id && (
                <button
                  type="button"
                  onClick={() => setConfirm(p.id)}
                  title={`Supprimer le produit ${p.name}`}
                  aria-label={`Supprimer le produit ${p.name}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            {IS_COMMERCIAL && (
              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                {canUpdate ? (
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    data-edit-product={p.id}
                    title={`Modifier les informations du produit ${p.name}`}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-slate-800 hover:border-brand hover:text-brand"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Modifier
                  </button>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-500">Vente</span>
                )}
                <AvailabilityToggle product={p} canEdit={canAvailability} onChanged={onDeleted} />
              </div>
            )}
            {confirm === p.id && (
              <ConfirmDelete
                name={p.name}
                busy={busy}
                onCancel={() => setConfirm(null)}
                onConfirm={async () => {
                  setBusy(true);
                  try {
                    await api.delete(`/products/${p.id}`);
                    toast.success(`Produit « ${p.name} » supprimé`);
                    setConfirm(null);
                    onDeleted();
                  } catch (err) {
                    toast.error(extractErrorMessage(err, "Suppression impossible"));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
          </li>
        );
      })}
    </ul>
    {editing && (
      <React.Suspense fallback={null}>
        <ProductFormDialog product={editing} onClose={() => setEditing(null)} onCreated={onDeleted} />
      </React.Suspense>
    )}
    </>
  );
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
        className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand/25"
      />
      <button type="button" onClick={submit} disabled={busy || !value.trim()} className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand px-2.5 text-[11px] font-bold text-white disabled:opacity-50">
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
        className="flex h-9 w-full items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-xs focus:outline-none focus:ring-2 focus:ring-brand/25"
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
                      value === c.name ? "bg-cyan-50 font-semibold text-brand" : "text-slate-700 hover:bg-slate-50"
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
                className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-bold text-brand hover:bg-cyan-50"
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

/* Onglet « Catégories » du module Stock (et Boutique › Catégories en Gestion commerciale) */
export function CategoriesPanel({ products, onChanged }: { products: any[]; onChanged?: () => void }) {
  const { has } = useAuth();
  // Permissions distinctes : catégories, suppression de produit, disponibilité à la vente
  const canEdit = has("categories.manage");
  const canDeleteProduct = has("products.delete");
  const canAvailability = has("products.availability");
  const { categories, loading, create, remove, reload } = useCategories();
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Catégorie dépliée : affiche ses produits avec leur photo
  const [openCat, setOpenCat] = useState<string | null>(null);
  const productsOf = (name: string) =>
    products.filter((p) => p.is_active !== false && (p.category || "").trim().toLowerCase() === name.trim().toLowerCase());

  // Stock & Livraison : valeur du stock par catégorie ; Gestion commerciale : produits disponibles à la vente
  const valueByCat = useMemo(() => {
    const m = new Map<string, number>();
    products.forEach((p) => {
      const k = (p.category || "").trim().toLowerCase();
      const v = IS_COMMERCIAL ? (p.is_active !== false && p.available !== false ? 1 : 0) : (Number(p.stock) || 0) * (Number(p.cost_price) || 0);
      m.set(k, (m.get(k) || 0) + v);
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
          <Button size="sm" onClick={() => setCreating(true)} className="h-8 rounded-xl bg-brand text-white hover:bg-brand-strong">
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
                <th className="px-2.5 py-3 text-right font-semibold">{IS_COMMERCIAL ? "Disponibles" : "Valeur du stock"}</th>
                {canEdit && <th className="px-2.5 py-3 text-center font-semibold">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {categories.map((c) => (
                <React.Fragment key={c.name}>
                <tr className={`cursor-pointer hover:bg-cyan-50/40 ${openCat === c.name ? "bg-cyan-50/40" : ""}`} onClick={() => setOpenCat((o) => (o === c.name ? null : c.name))} aria-expanded={openCat === c.name}>
                  <td className="px-2.5 py-3 font-semibold text-slate-900">
                    <span className="inline-flex items-center gap-1.5">
                      <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition-transform ${openCat === c.name ? "rotate-90" : ""}`} />
                      <span data-no-translate>{c.name}</span>
                    </span>
                  </td>
                  <td className="px-2.5 py-3 text-right tabular-nums">{fmtNum(c.product_count)}</td>
                  <td className="px-2.5 py-3 text-right font-semibold tabular-nums">{IS_COMMERCIAL ? fmtNum(valueByCat.get(c.name.toLowerCase()) || 0) : fmtMoney(valueByCat.get(c.name.toLowerCase()) || 0)}</td>
                  {canEdit && (
                    <td className="px-2.5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
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
                          disabled={c.product_count > 0}
                          onClick={() => setConfirm(c.name)}
                          title={c.product_count ? `Supprimez d'abord les ${c.product_count} produit(s) de cette catégorie` : undefined}
                          className="h-8 rounded-lg text-[11px] text-red-600 hover:border-red-200 hover:bg-red-50"
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Supprimer
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
                {openCat === c.name && (
                  <tr data-cat-open>
                    <td colSpan={canEdit ? 4 : 3} className="bg-slate-50/70 px-2.5 py-3">
                      {canEdit && c.product_count > 0 && (
                        <p className="mb-2 text-[11px] text-amber-700">
                          Pour supprimer cette catégorie, supprimez d'abord ses {c.product_count} produit(s).{IS_COMMERCIAL ? "" : " Un produit qui a encore du stock doit d'abord être vidé (ajustement ou transfert)."}
                        </p>
                      )}
                      <CategoryProducts
                        items={productsOf(c.name)}
                        canEdit={canDeleteProduct}
                        canAvailability={canAvailability}
                        onDeleted={() => {
                          reload();
                          onChanged?.();
                        }}
                      />
                    </td>
                  </tr>
                )}
                </React.Fragment>
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
