import React, { useState } from "react";
import { toast } from "sonner";
import { Image as ImageIcon, Loader2, Package, Upload, X } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CategoryPicker } from "@/components/stock/categories";
import { IS_COMMERCIAL } from "@/app/edition";

/**
 * Formulaire « Nouveau produit » (module Stock), partagé avec la Boutique :
 * même photo, mêmes champs et même catégorie (liste déroulante avec création / suppression).
 */
export default function NewProductDialog({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const [saving, setSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [imageUrlInput, setImageUrlInput] = useState<string>("");

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("L'image ne doit pas dépasser 4 Mo");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
      setImageUrlInput("");
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const form = e.target as any;
    const sellPrice = Number(form.elements.sell_price.value) || 0;
    const priceFC = form.elements.price_fc?.value ? Number(form.elements.price_fc.value) : Math.round(sellPrice * 2500);
    const payload = {
      name: form.elements.name.value.trim(),
      // Le code produit est généré automatiquement par le serveur
      size: form.elements.size.value.trim(),
      category: form.elements.category.value.trim(),
      unit: form.elements.unit.value.trim() || "Carton",
      sell_price: sellPrice,
      price_fc: priceFC,
      cost_price: Number(form.elements.cost_price.value) || 0,
      // Gestion commerciale : le stock initial et le seuil se saisissent dans le projet Stock & Livraison
      stock: IS_COMMERCIAL ? 0 : Number(form.elements.stock.value) || 0,
      alert_threshold: IS_COMMERCIAL ? undefined : Number(form.elements.alert_threshold.value) || 10,
      badge: form.elements.badge?.value?.trim() || undefined,
      image_url: imagePreview || imageUrlInput.trim() || undefined,
    };
    try {
      await api.post("/products", payload);
      toast.success("Produit ajouté avec succès");
      onCreated?.();
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec de l'ajout"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Package className="w-5 h-5 text-brand" />
            Nouveau Produit
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-3.5 pt-2 text-xs">
          <div className="px-2.5 py-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
              <span>Photo du Produit</span>
              <span className="text-[11px] font-normal text-slate-500">{IS_COMMERCIAL ? "Visible dans la Boutique" : "Visible dans la Boutique & Stock"}</span>
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
                <label className="flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-300 hover:border-brand hover:text-brand rounded-xl cursor-pointer text-xs font-semibold text-slate-700 transition-colors shadow-2xs">
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
              <Label htmlFor="new_product_size" className="text-xs font-semibold">Taille du produit</Label>
              <Input id="new_product_size" name="size" list="product-size-suggestions" placeholder="33 cl, 1 L, 5 L…" className="mt-1 h-9 rounded-lg" />
              <datalist id="product-size-suggestions">
                {["25 cl", "33 cl", "50 cl", "65 cl", "75 cl", "1 L", "1,5 L", "2 L", "5 L", "25 kg"].map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
            <div>
              <Label className="text-xs font-semibold">Catégorie</Label>
              <CategoryPicker name="category" />
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
          <div className={`grid gap-2 ${IS_COMMERCIAL ? "grid-cols-1" : "grid-cols-3"}`}>
            <div>
              <Label className="text-xs font-semibold">Unité</Label>
              <Input name="unit" defaultValue="Bouteille" className="mt-1 h-9 rounded-lg" />
            </div>
            {!IS_COMMERCIAL && (
            <>
            <div>
              <Label className="text-xs font-semibold">Stock Initial</Label>
              <Input name="stock" type="number" defaultValue="100" className="mt-1 h-9 rounded-lg" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Seuil d'Alerte</Label>
              <Input name="alert_threshold" type="number" defaultValue="15" className="mt-1 h-9 rounded-lg" />
            </div>
            </>
            )}
          </div>
          <DialogFooter className="gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving} className="bg-brand hover:bg-brand-strong text-white">
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Enregistrer Produit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
