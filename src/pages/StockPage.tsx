import React, { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Package,
  Search,
  Plus,
  Sliders,
  Image as ImageIcon,
  Upload,
  X,
  Edit,
  Loader2,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, EmptyState, fmtMoney, fmtNum } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function StockPage() {
  const { has } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adjustingProduct, setAdjustingProduct] = useState<any>(null);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [newProductModal, setNewProductModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Image upload states
  const [imagePreview, setImagePreview] = useState<string>("");
  const [imageUrlInput, setImageUrlInput] = useState<string>("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodRes, whRes] = await Promise.all([
        api.get("/products"),
        api.get("/warehouses"),
      ]);
      setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
      setWarehouses(Array.isArray(whRes.data) ? whRes.data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur de chargement"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q));
      return matchQ;
    });
  }, [products, search]);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("L'image ne doit pas dépasser 4 Mo");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setImageUrlInput("");
    };
    reader.readAsDataURL(file);
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;
    setSaving(true);
    const form = e.target as any;
    const delta = Number(form.elements.delta.value);
    const reason = form.elements.reason.value;
    try {
      await api.post(`/products/${adjustingProduct.id}/adjust`, {
        quantity: delta,
        reason,
      });
      toast.success("Ajustement de stock enregistré");
      setAdjustingProduct(null);
      loadData();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec de l'ajustement"));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const form = e.target as any;
    const sellPrice = Number(form.elements.sell_price.value) || 0;
    const priceFC = form.elements.price_fc?.value
      ? Number(form.elements.price_fc.value)
      : Math.round(sellPrice * 2500);

    const payload = {
      name: form.elements.name.value.trim(),
      code: form.elements.code.value.trim(),
      category: form.elements.category.value.trim(),
      unit: form.elements.unit.value.trim() || "Carton",
      sell_price: sellPrice,
      price_fc: priceFC,
      cost_price: Number(form.elements.cost_price.value) || 0,
      stock: Number(form.elements.stock.value) || 0,
      alert_threshold: Number(form.elements.alert_threshold.value) || 10,
      badge: form.elements.badge?.value?.trim() || undefined,
      image_url: imagePreview || imageUrlInput.trim() || undefined,
    };

    try {
      await api.post("/products", payload);
      toast.success("Produit ajouté avec succès");
      setNewProductModal(false);
      setImagePreview("");
      setImageUrlInput("");
      loadData();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec de l'ajout"));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setSaving(true);
    const form = e.target as any;
    const sellPrice = Number(form.elements.sell_price.value) || 0;
    const priceFC = form.elements.price_fc?.value
      ? Number(form.elements.price_fc.value)
      : Math.round(sellPrice * 2500);

    const payload = {
      name: form.elements.name.value.trim(),
      code: form.elements.code.value.trim(),
      category: form.elements.category.value.trim(),
      unit: form.elements.unit.value.trim() || "Carton",
      sell_price: sellPrice,
      price_fc: priceFC,
      cost_price: Number(form.elements.cost_price.value) || 0,
      stock: Number(form.elements.stock.value) || 0,
      alert_threshold: Number(form.elements.alert_threshold.value) || 10,
      badge: form.elements.badge?.value?.trim() || undefined,
      image_url: imagePreview || imageUrlInput.trim() || editingProduct.image_url || undefined,
    };

    try {
      await api.put(`/products/${editingProduct.id}`, payload);
      toast.success("Produit et photo mis à jour !");
      setEditingProduct(null);
      setImagePreview("");
      setImageUrlInput("");
      loadData();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec de la modification"));
    } finally {
      setSaving(false);
    }
  };

  const openNewModal = () => {
    setImagePreview("");
    setImageUrlInput("");
    setNewProductModal(true);
  };

  const openEditModal = (prod: any) => {
    setImagePreview(prod.image_url || "");
    setImageUrlInput(prod.image_url || "");
    setEditingProduct(prod);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gestion des Stocks & Dépôts"
        subtitle="Inventaires, photos d'articles, alertes et valorisation"
        right={
          has("stock.write") && (
            <Button
              size="sm"
              onClick={openNewModal}
              className="rounded-xl bg-[#0F3D68] hover:bg-[#0B2F52] text-white shadow-xs"
            >
              <Plus className="h-4 w-4 mr-1.5" /> Nouveau Produit
            </Button>
          )
        }
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Rechercher par article, code, catégorie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-white border-slate-200 text-xs shadow-2xs"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Aucun produit en stock"
          subtitle="Ajoutez des articles ou réinitialisez la recherche."
        />
      ) : (
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="p-3.5 text-center w-14">Photo</th>
                  <th className="p-3.5">Code</th>
                  <th className="p-3.5">Désignation</th>
                  <th className="p-3.5">Catégorie</th>
                  <th className="p-3.5 text-right">Prix Achat</th>
                  <th className="p-3.5 text-right">Prix Vente</th>
                  <th className="p-3.5 text-right">Stock Actuel</th>
                  <th className="p-3.5 text-center">Statut</th>
                  {has("stock.write") && <th className="p-3.5 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((prod) => {
                  const stock = prod.stock ?? prod.current_stock ?? 0;
                  const threshold = prod.alert_threshold || 10;
                  const isLow = stock <= threshold;
                  const isOut = stock <= 0;

                  return (
                    <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-2 text-center">
                        {prod.image_url ? (
                          <img
                            src={prod.image_url}
                            alt={prod.name}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-lg object-cover mx-auto border border-slate-200 shadow-2xs"
                            onError={(e) => {
                              (e.target as any).src = "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=100&auto=format&fit=crop&q=60";
                            }}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
                            <ImageIcon className="w-5 h-5 opacity-40" />
                          </div>
                        )}
                      </td>
                      <td className="p-3.5 font-mono font-bold text-slate-600">{prod.code}</td>
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900">{prod.name}</div>
                        {prod.badge && (
                          <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {prod.badge}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-500">{prod.category || "Général"}</td>
                      <td className="p-3.5 text-right font-mono text-slate-600">
                        {fmtMoney(prod.cost_price || 0)}
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="font-mono font-bold text-slate-900">
                          {fmtMoney(prod.sell_price || 0)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {((prod.price_fc || Math.round(prod.sell_price * 2500))).toLocaleString()} FC
                        </div>
                      </td>
                      <td className="p-3.5 text-right font-extrabold text-slate-900 text-sm">
                        {fmtNum(stock)} <span className="text-slate-400 text-xs font-normal">{prod.unit || "u"}</span>
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isOut
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : isLow
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {isOut ? "Rupture" : isLow ? "Stock Faible" : "Normal"}
                        </span>
                      </td>
                      {has("stock.write") && (
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditModal(prod)}
                              title="Modifier produit & photo"
                              className="h-7 w-7 p-0 rounded-lg border-slate-200 text-slate-600 hover:text-slate-900"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAdjustingProduct(prod)}
                              className="h-7 text-[11px] rounded-lg border-slate-200"
                            >
                              <Sliders className="h-3 w-3 mr-1" /> Ajuster
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADJUST STOCK MODAL */}
      {adjustingProduct && (
        <Dialog open onOpenChange={() => setAdjustingProduct(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">
                Ajuster Stock : {adjustingProduct.name}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdjustStock} className="space-y-3 pt-2 text-xs">
              <div>
                <Label className="text-xs font-semibold">
                  Quantité à ajouter (+) ou retirer (-)
                </Label>
                <Input
                  name="delta"
                  type="number"
                  required
                  placeholder="Ex: +50 ou -10"
                  className="mt-1 h-9 rounded-lg font-bold"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Motif de l'ajustement</Label>
                <select
                  name="reason"
                  className="w-full mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                >
                  <option value="reception">Réception commande fournisseur</option>
                  <option value="inventory_correction">Correction d'inventaire</option>
                  <option value="damage">Perte / Avarie</option>
                  <option value="return">Retour client</option>
                </select>
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAdjustingProduct(null)}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-[#0F3D68] text-white hover:bg-[#0B2F52]"
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Valider
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* NEW PRODUCT MODAL */}
      {newProductModal && (
        <Dialog open onOpenChange={() => setNewProductModal(false)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Package className="w-5 h-5 text-[#0F3D68]" />
                Nouveau Produit
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateProduct} className="space-y-3.5 pt-2 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Photo du Produit</span>
                  <span className="text-[11px] font-normal text-slate-500">Visible dans la Boutique & Stock</span>
                </Label>
                <div className="flex items-center gap-3">
                  {imagePreview ? (
                    <div className="relative group w-20 h-20 rounded-xl overflow-hidden border-2 border-indigo-500 shrink-0 bg-white shadow-xs">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImagePreview("");
                          setImageUrlInput("");
                        }}
                        className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Supprimer la photo"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl border border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 shrink-0">
                      <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                      <span className="text-[9px]">Aucune image</span>
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <label className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-300 hover:border-[#0F3D68] hover:text-[#0F3D68] rounded-xl cursor-pointer text-xs font-semibold text-slate-700 transition-colors shadow-2xs">
                      <Upload className="w-4 h-4 text-slate-500" />
                      <span>Téléverser depuis l'ordinateur</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Ou coller une URL d'image web (https://...)"
                        value={imageUrlInput}
                        onChange={(e) => {
                          setImageUrlInput(e.target.value);
                          setImagePreview(e.target.value);
                        }}
                        className="h-8 text-xs bg-white rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold">Désignation du produit *</Label>
                <Input name="name" required placeholder="Ex: Jus Naturel Mangue 1L" className="mt-1 h-9 rounded-lg" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Code / SKU *</Label>
                  <Input name="code" required placeholder="PRD-JUS-MNG" className="mt-1 h-9 rounded-lg font-mono" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Catégorie</Label>
                  <Input name="category" placeholder="Jus & Boissons" className="mt-1 h-9 rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Badge (Optionnel)</Label>
                  <Input name="badge" placeholder="Nouveau, Populaire..." className="mt-1 h-9 rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Prix Vente ($) *</Label>
                  <Input name="sell_price" type="number" step="0.01" required defaultValue="1.50" className="mt-1 h-9 rounded-lg font-bold" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Prix Vente (FC)</Label>
                  <Input name="price_fc" type="number" placeholder="Ex: 3750" className="mt-1 h-9 rounded-lg font-mono" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Prix Achat ($)</Label>
                  <Input name="cost_price" type="number" step="0.01" defaultValue="1.00" className="mt-1 h-9 rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Unité</Label>
                  <Input name="unit" defaultValue="Bouteille" className="mt-1 h-9 rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Stock Initial</Label>
                  <Input name="stock" type="number" defaultValue="100" className="mt-1 h-9 rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Seuil d'Alerte</Label>
                  <Input name="alert_threshold" type="number" defaultValue="15" className="mt-1 h-9 rounded-lg" />
                </div>
              </div>
              <DialogFooter className="gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setNewProductModal(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving} className="bg-[#0F3D68] hover:bg-[#0B2F52] text-white">
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                  Enregistrer Produit
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* EDIT PRODUCT MODAL */}
      {editingProduct && (
        <Dialog open onOpenChange={() => setEditingProduct(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Edit className="w-5 h-5 text-[#0F3D68]" />
                Modifier Produit & Photo : {editingProduct.name}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateProduct} className="space-y-3.5 pt-2 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Photo du Produit</span>
                  <span className="text-[11px] font-normal text-slate-500">Mise à jour en direct</span>
                </Label>
                <div className="flex items-center gap-3">
                  {imagePreview ? (
                    <div className="relative group w-20 h-20 rounded-xl overflow-hidden border-2 border-indigo-500 shrink-0 bg-white shadow-xs">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImagePreview("");
                          setImageUrlInput("");
                        }}
                        className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Supprimer la photo"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl border border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 shrink-0">
                      <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                      <span className="text-[9px]">Aucune image</span>
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <label className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-300 hover:border-[#0F3D68] hover:text-[#0F3D68] rounded-xl cursor-pointer text-xs font-semibold text-slate-700 transition-colors shadow-2xs">
                      <Upload className="w-4 h-4 text-slate-500" />
                      <span>Remplacer l'image (ordinateur)</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Ou URL d'image (https://...)"
                        value={imageUrlInput}
                        onChange={(e) => {
                          setImageUrlInput(e.target.value);
                          setImagePreview(e.target.value);
                        }}
                        className="h-8 text-xs bg-white rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold">Désignation du produit *</Label>
                <Input name="name" required defaultValue={editingProduct.name} className="mt-1 h-9 rounded-lg" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Code / SKU *</Label>
                  <Input name="code" required defaultValue={editingProduct.code} className="mt-1 h-9 rounded-lg font-mono" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Catégorie</Label>
                  <Input name="category" defaultValue={editingProduct.category} className="mt-1 h-9 rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Badge</Label>
                  <Input name="badge" defaultValue={editingProduct.badge || ""} placeholder="Nouveau, Promo..." className="mt-1 h-9 rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Prix Vente ($)</Label>
                  <Input name="sell_price" type="number" step="0.01" defaultValue={editingProduct.sell_price} className="mt-1 h-9 rounded-lg font-bold" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Prix Vente (FC)</Label>
                  <Input name="price_fc" type="number" defaultValue={editingProduct.price_fc || Math.round(editingProduct.sell_price * 2500)} className="mt-1 h-9 rounded-lg font-mono" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Prix Achat ($)</Label>
                  <Input name="cost_price" type="number" step="0.01" defaultValue={editingProduct.cost_price} className="mt-1 h-9 rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Unité</Label>
                  <Input name="unit" defaultValue={editingProduct.unit} className="mt-1 h-9 rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Stock Actuel</Label>
                  <Input name="stock" type="number" defaultValue={editingProduct.stock ?? editingProduct.current_stock ?? 0} className="mt-1 h-9 rounded-lg" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Seuil d'Alerte</Label>
                  <Input name="alert_threshold" type="number" defaultValue={editingProduct.alert_threshold || 10} className="mt-1 h-9 rounded-lg" />
                </div>
              </div>
              <DialogFooter className="gap-2 pt-3 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setEditingProduct(null)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving} className="bg-[#0F3D68] hover:bg-[#0B2F52] text-white">
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                  Enregistrer Modifications
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
