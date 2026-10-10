import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Target,
  Users,
  Loader2,
  Plus,
  ArrowLeft,
  CheckCircle2,
  Clock,
  DollarSign,
  Gift,
  ChevronRight,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, EmptyState, StatCard, fmtMoney } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function ObjectivesPage() {
  const { has, user } = useAuth();
  const [objectives, setObjectives] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedObjective, setSelectedObjective] = useState<any>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [claimingUserId, setClaimingUserId] = useState<string | null>(null);

  const [availableUsers] = useState<any[]>([
    { id: "usr_nathalie_m", name: "Nathalie Mukendi", role: "marketeur", bu: "Farine de Maïs Extra", site: "Goma" },
    { id: "usr_patrick_k", name: "Patrick K.", role: "marketeur", bu: "Farine de Maïs Extra", site: "Goma" },
    { id: "usr_sarah_k", name: "Sarah Kalala", role: "marketeur", bu: "Whisky & Liqueurs", site: "Goma" },
    { id: "usr_jean_k", name: "Jean Kasongo", role: "commercial", bu: "Farine de Maïs Extra", site: "Bukavu" },
  ]);

  const [formBU, setFormBU] = useState("");
  // Business Units = catégories de produits du module Stock › Catégories
  const [categories, setCategories] = useState<string[]>([]);
  const [formSite, setFormSite] = useState("Goma");
  const [formLabel, setFormLabel] = useState("");
  const [formTargetQty, setFormTargetQty] = useState(4000);
  const [formUnit, setFormUnit] = useState("sacs");
  const [formBonusType, setFormBonusType] = useState<"money" | "nature">("money");
  const [formBonusAmount, setFormBonusAmount] = useState(50);
  const [formBonusQty, setFormBonusQty] = useState(2);
  const [formBonusUnit, setFormBonusUnit] = useState("USD");
  // Prime en nature : cartons d'un produit de la Business Unit (catégorie) choisie
  const [products, setProducts] = useState<any[]>([]);
  const [formBonusProductId, setFormBonusProductId] = useState("");
  const [selectedBeneficiaryIds, setSelectedBeneficiaryIds] = useState<string[]>([
    "usr_nathalie_m",
    "usr_patrick_k",
  ]);

  const loadObjectives = async () => {
    setLoading(true);
    try {
      const res = await api.get("/objectives");
      setObjectives(Array.isArray(res.data) ? res.data : []);
      if (selectedObjective) {
        const updated = res.data.find((o: any) => o.id === selectedObjective.id);
        if (updated) setSelectedObjective(updated);
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur chargement objectifs"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadObjectives();
    api
      .get("/stock/categories")
      .then(({ data }) => {
        const names = (Array.isArray(data) ? data : []).map((c: any) => c.name).filter(Boolean);
        setCategories(names);
        setFormBU((cur) => (cur && names.includes(cur) ? cur : names[0] || ""));
      })
      .catch(() => setCategories([]));
    api
      .get("/products")
      .then(({ data }) => setProducts(Array.isArray(data) ? data.filter((p: any) => p.is_active !== false) : []))
      .catch(() => setProducts([]));
  }, []);

  const buProducts = products.filter((p) => (p.category || "").trim().toLowerCase() === formBU.trim().toLowerCase());
  useEffect(() => {
    if (!buProducts.some((p) => p.id === formBonusProductId)) setFormBonusProductId(buProducts[0]?.id || "");
  }, [formBU, products]);
  const bonusProduct = buProducts.find((p) => p.id === formBonusProductId);

  const handleCreateObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formBonusType === "nature" && (!bonusProduct || !(formBonusQty > 0))) {
      toast.error("Choisissez le produit et le nombre de cartons de la prime en nature");
      return;
    }
    setSaving(true);
    try {
      const beneficiaries = availableUsers
        .filter((u) => selectedBeneficiaryIds.includes(u.id))
        .map((u) => ({
          user_id: u.id,
          user_name: u.name,
          role_code: u.role,
          bonus_type: formBonusType,
          bonus_amount: formBonusType === "money" ? formBonusAmount : 0,
          bonus_qty: formBonusType === "nature" ? formBonusQty : 0,
          bonus_unit: formBonusType === "money" ? "USD" : "cartons",
          bonus_product_id: formBonusType === "nature" ? bonusProduct?.id : undefined,
          bonus_product_name: formBonusType === "nature" ? bonusProduct?.name : undefined,
          status: "pending",
        }));

      const payload = {
        business_unit: formBU,
        site: formSite,
        label: formLabel || `Objectif ${formBU} - ${formTargetQty} ${formUnit}`,
        target_qty: formTargetQty,
        target_amount: formTargetQty * 20,
        unit: formUnit,
        bonus_type: formBonusType,
        bonus_amount: formBonusType === "money" ? formBonusAmount : 0,
        bonus_qty: formBonusType === "nature" ? formBonusQty : 0,
        bonus_unit: formBonusType === "money" ? "USD" : "cartons",
        bonus_product_id: formBonusType === "nature" ? bonusProduct?.id : undefined,
        bonus_product_name: formBonusType === "nature" ? bonusProduct?.name : undefined,
        period_start: new Date().toISOString(),
        period_end: new Date(Date.now() + 86400000 * 30).toISOString(),
        beneficiaries,
      };

      const res = await api.post("/objectives", payload);
      toast.success("Nouvel objectif commercial créé avec succès !");
      setIsCreateModalOpen(false);
      loadObjectives();
      setSelectedObjective(res.data);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec création objectif"));
    } finally {
      setSaving(false);
    }
  };

  const handleClaimBonus = async (objectiveId: string, beneficiary: any) => {
    setClaimingUserId(beneficiary.user_id);
    try {
      const res = await api.post(`/objectives/${objectiveId}/claim-bonus`, {
        beneficiary_id: beneficiary.user_id,
        payment_method: "cash",
      });
      toast.success(
        `Prime encaissée avec succès pour ${beneficiary.user_name} !`
      );
      if (res.data?.objective) {
        setSelectedObjective(res.data.objective);
      }
      loadObjectives();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec de l'encaissement de la prime"));
    } finally {
      setClaimingUserId(null);
    }
  };

  if (selectedObjective) {
    const obj = selectedObjective;
    const target = obj.target_qty || obj.target_amount || 1;
    const current = obj.actual_qty || obj.actual_amount || 0;
    const percent = Math.min(100, Math.round((current / target) * 100));
    const isReached = percent >= 100 || obj.status === "reached";
    const beneficiaries = obj.beneficiaries || [];
    const totalBeneficiaries = beneficiaries.length;
    const paidBeneficiaries = beneficiaries.filter((b: any) => b.status === "paid").length;
    // Prime en argent : montants USD ; prime en nature : nombre de cartons
    const primeOf = (b: any) =>
      obj.bonus_type === "money" ? b.bonus_amount || obj.bonus_amount || 0 : b.bonus_qty || obj.bonus_qty || 0;
    const totalPrimePrevue = beneficiaries.reduce((sum: number, b: any) => sum + primeOf(b), 0);
    const primePayee = beneficiaries
      .filter((b: any) => b.status === "paid")
      .reduce((sum: number, b: any) => sum + primeOf(b), 0);
    const primeRestante = totalPrimePrevue - primePayee;

    return (
      <div className="space-y-6 pb-12">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedObjective(null)}
              className="rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Retour aux Objectifs
            </Button>
            <div className="h-4 w-px bg-slate-200" />
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                {obj.business_unit} • {obj.site}
              </span>
              <h1 className="text-base font-bold text-slate-900">{obj.label}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                isReached
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : "bg-blue-100 text-blue-800 border border-blue-200"
              }`}
            >
              {isReached ? "Objectif Atteint" : `En Cours (${percent}%)`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Total Bénéficiaires"
            value={String(totalBeneficiaries)}
            sub={`${paidBeneficiaries} primes payées`}
            tone="blue"
          />
          <StatCard
            label="Prime Totale Prévue"
            value={obj.bonus_type === "money" ? fmtMoney(totalPrimePrevue) : `${totalPrimePrevue} ${obj.bonus_unit}`}
            sub={obj.bonus_type === "nature" && obj.bonus_product_name ? obj.bonus_product_name : undefined}
            tone="blue"
          />
          <StatCard
            label="Prime Déjà Encaissée"
            value={obj.bonus_type === "money" ? fmtMoney(primePayee) : `${primePayee} ${obj.bonus_unit}`}
            tone="green"
          />
          <StatCard
            label="Prime Restante"
            value={obj.bonus_type === "money" ? fmtMoney(primeRestante) : `${primeRestante} ${obj.bonus_unit}`}
            tone={primeRestante > 0 ? "amber" : "slate"}
          />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">
              Liste des Bénéficiaires ({beneficiaries.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="p-3.5">Bénéficiaire</th>
                  <th className="p-3.5">Rôle</th>
                  <th className="p-3.5 text-right">Prime Individuelle</th>
                  <th className="p-3.5 text-center">Statut</th>
                  <th className="p-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {beneficiaries.map((b: any) => {
                  const isPaid = b.status === "paid";
                  const isClaiming = claimingUserId === b.user_id;
                  return (
                    <tr key={b.user_id || b.name} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-bold text-slate-900">{b.user_name}</td>
                      <td className="p-3.5 text-slate-600 capitalize">{b.role_code || "Marketeur"}</td>
                      <td className="p-3.5 text-right font-black">
                        {b.bonus_type === "money"
                          ? fmtMoney(b.bonus_amount || obj.bonus_amount || 0)
                          : `${b.bonus_qty || obj.bonus_qty} ${b.bonus_unit || obj.bonus_unit}${(b.bonus_product_name || obj.bonus_product_name) ? ` · ${b.bonus_product_name || obj.bonus_product_name}` : ""}`}
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            isPaid
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : "bg-amber-100 text-amber-800 border border-amber-200"
                          }`}
                        >
                          {isPaid ? "Payée" : "En Attente"}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        {isPaid ? (
                          <span className="text-[11px] text-slate-400 font-medium">Encaissé</span>
                        ) : (
                          <Button
                            size="sm"
                            disabled={isClaiming}
                            onClick={() => handleClaimBonus(obj.id, b)}
                            className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 shadow-xs"
                          >
                            {isClaiming ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : (
                              <DollarSign className="h-3.5 w-3.5 mr-1" />
                            )}
                            Encaisser
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Objectifs Commerciaux & Primes"
        subtitle="Quotas par département (Business Unit), validation des seuils et encaissement des primes"
        right={
          <Button
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            className="rounded-xl bg-[#0F3D68] hover:bg-[#0B2F52] text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" /> Nouvel Objectif
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : objectives.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Aucun objectif configuré"
          subtitle="Créez votre premier objectif par Business Unit et Site."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {objectives.map((obj) => {
            const target = obj.target_qty || obj.target_amount || 1;
            const current = obj.actual_qty || obj.actual_amount || 0;
            const percent = Math.min(100, Math.round((current / target) * 100));
            const isReached = percent >= 100 || obj.status === "reached";
            const beneficiaries = obj.beneficiaries || [];

            return (
              <div
                key={obj.id}
                onClick={() => setSelectedObjective(obj)}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 hover:shadow-md transition-all cursor-pointer border-l-4 hover:border-l-[#0F3D68] flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-11 w-11 rounded-xl flex items-center justify-center font-bold ${
                          isReached
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-purple-50 text-purple-700"
                        }`}
                      >
                        <Target className="h-6 w-6" />
                      </div>
                      <div>
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          {obj.business_unit} • {obj.site}
                        </div>
                        <h3 className="font-bold text-slate-900 text-sm">{obj.label}</h3>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-black px-2.5 py-1 rounded-full ${
                        isReached
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-purple-100 text-purple-800"
                      }`}
                    >
                      {percent}%
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isReached ? "bg-emerald-500" : "bg-purple-600"
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">
                    Bénéficiaires : {beneficiaries.length} agent(s)
                  </span>
                  <span className="text-[#0F3D68] font-bold hover:underline flex items-center">
                    Voir détails & Bénéficiaires <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE MODAL */}
      {isCreateModalOpen && (
        <Dialog open onOpenChange={() => setIsCreateModalOpen(false)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Target className="h-5 w-5 text-[#0F3D68]" />
                Créer un Objectif Commercial & Primes
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateObjective} className="space-y-4 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Business Unit (Catégorie de produit) *</Label>
                  <select
                    value={formBU}
                    onChange={(e) => setFormBU(e.target.value)}
                    required
                    data-no-translate
                    className="w-full mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold"
                  >
                    {!categories.length && <option value="">Aucune catégorie</option>}
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Site / Ville *</Label>
                  <select
                    value={formSite}
                    onChange={(e) => setFormSite(e.target.value)}
                    className="w-full mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold"
                  >
                    <option value="Goma">Goma</option>
                    <option value="Bukavu">Bukavu</option>
                  </select>
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold">Intitulé de l'objectif</Label>
                <Input
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="Ex : Objectif Mensuel Maïs - 4 000 sacs"
                  className="mt-1 h-9 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Quantité Cible *</Label>
                  <Input
                    type="number"
                    value={formTargetQty}
                    onChange={(e) => setFormTargetQty(Number(e.target.value))}
                    required
                    className="mt-1 h-9 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Unité de mesure</Label>
                  <Input
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    placeholder="sacs, cartons, bouteilles..."
                    className="mt-1 h-9 rounded-lg"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3" data-bonus-section>
                <Label className="text-xs font-semibold">Prime des bénéficiaires *</Label>
                <div role="group" aria-label="Type de prime" className="grid grid-cols-2 gap-2">
                  {([
                    ["money", "Prime en argent (USD)"],
                    ["nature", "Prime en nature (cartons)"],
                  ] as const).map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={formBonusType === v}
                      onClick={() => setFormBonusType(v)}
                      className={`h-9 rounded-lg border text-xs font-bold transition ${
                        formBonusType === v ? "border-[#0F3D68] bg-[#0F3D68] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {formBonusType === "money" ? (
                  <div>
                    <Label className="text-xs font-semibold">Montant par bénéficiaire (USD) *</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={formBonusAmount}
                      onChange={(e) => setFormBonusAmount(Number(e.target.value))}
                      required
                      className="mt-1 h-9 rounded-lg font-bold"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Produit offert ({formBU || "Business Unit"}) *</Label>
                      <select
                        value={formBonusProductId}
                        onChange={(e) => setFormBonusProductId(e.target.value)}
                        required
                        data-no-translate
                        className="w-full mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold"
                      >
                        {!buProducts.length && <option value="">Aucun produit dans cette catégorie</option>}
                        {buProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Cartons par bénéficiaire *</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={formBonusQty}
                        onChange={(e) => setFormBonusQty(Number(e.target.value))}
                        required
                        className="mt-1 h-9 rounded-lg font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-[#0F3D68] hover:bg-[#0B2F52] text-white font-semibold"
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Créer l'Objectif
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
