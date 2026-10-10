import React, { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Plus,
  Search,
  Upload,
  FileText,
  Eye,
  Trash2,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Check,
  X,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { fmtMoney } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { openDocumentInNativeViewer } from "@/lib/documentViewer";

interface OutflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  exchangeRate: number;
  userName: string;
  department: string;
  onSuccess: (opData: any, docUrl: string, docName: string) => void;
}

export default function OutflowModal({
  isOpen,
  onClose,
  exchangeRate,
  userName,
  department,
  onSuccess,
}: OutflowModalProps) {
  const [expenseCategories, setExpenseCategories] = useState<string[]>([
    "Dépense d'exploitation",
    "Achat fournitures",
    "Carburant & Transport",
    "Avance sur salaire",
    "Versement Banque",
    "Frais de mission & Déplacement",
    "Maintenance & Réparations",
    "Loyer & Charges locatives",
    "Communication & Télécoms",
    "Autre sortie",
  ]);
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  const [appUsers, setAppUsers] = useState<any[]>([]);
  const [authorizerSearch, setAuthorizerSearch] = useState("");
  const [isAuthorizerDropdownOpen, setIsAuthorizerDropdownOpen] = useState(false);

  const [docUrl, setDocUrl] = useState("");
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("");
  const [docSize, setDocSize] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    category: "Dépense d'exploitation",
    amount: "",
    currency: "USD",
    exchange_rate: exchangeRate || 2500,
    beneficiary: "",
    authorized_by: "",
    reason: "",
  });

  useEffect(() => {
    if (isOpen) {
      api.get("/cash/expense-categories")
        .then((res) => {
          if (Array.isArray(res.data) && res.data.length > 0) setExpenseCategories(res.data);
        })
        .catch(() => {});
      api.get("/users")
        .then((res) => {
          if (Array.isArray(res.data)) setAppUsers(res.data);
        })
        .catch(() => {});
      api.get("/cash/rates")
        .then((res) => {
          if (res.data?.outflow_rate) {
            setForm((prev) => ({ ...prev, exchange_rate: res.data.outflow_rate }));
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const filteredAuthorizers = useMemo(() => {
    if (!authorizerSearch.trim()) return appUsers;
    const q = authorizerSearch.trim().toLowerCase();
    return appUsers.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.role_code?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
    );
  }, [appUsers, authorizerSearch]);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCatName.trim();
    if (!clean) return;
    if (expenseCategories.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      toast.error("Cette catégorie de dépense existe déjà.");
      return;
    }
    setSavingCat(true);
    try {
      await api.post("/cash/expense-categories", { name: clean });
      setExpenseCategories((prev) => [...prev, clean]);
      setForm((prev) => ({ ...prev, category: clean }));
      toast.success(`Catégorie « ${clean} » ajoutée !`);
      setNewCatName("");
      setShowNewCatModal(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur lors de la création de la catégorie"));
    } finally {
      setSavingCat(false);
    }
  };

  const processFile = (file: File) => {
    if (!file) return;
    const allowed = [".pdf", ".jpg", ".jpeg", ".png"];
    const extMatch = allowed.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!extMatch && !file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast.error("Format non supporté. Veuillez importer un PDF, JPG, JPEG ou PNG.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Fichier trop lourd (maximum 25 Mo).");
      return;
    }
    setDocLoading(true);
    const sizeStr = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(2)} Mo`
      : `${Math.round(file.size / 1024)} Ko`;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const reader = new FileReader();
    reader.onload = () => {
      setDocUrl(reader.result as string);
      setDocName(file.name);
      setDocType(isPdf ? "Document PDF" : "Scan Image");
      setDocSize(sizeStr);
      setDocLoading(false);
      toast.success(`Pièce justificative « ${file.name} » prête !`);
    };
    reader.onerror = () => {
      toast.error("Erreur de lecture du document");
      setDocLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(form.amount);
    if (!form.amount || isNaN(numAmount) || numAmount <= 0) {
      toast.error("Le montant de la sortie doit être strictement supérieur à zéro.");
      return;
    }
    if (!form.beneficiary.trim()) {
      toast.error("Veuillez indiquer le nom du bénéficiaire.");
      return;
    }
    if (!form.authorized_by.trim()) {
      toast.error("Veuillez sélectionner l'utilisateur ayant autorisé la sortie.");
      return;
    }
    if (!form.reason.trim()) {
      toast.error("Veuillez renseigner le motif explicatif de la sortie.");
      return;
    }
    if (!docUrl) {
      toast.error("La pièce justificative de la sortie est obligatoire.");
      return;
    }

    setSubmitting(true);
    try {
      const ref = `DEC-${Date.now().toString().slice(-6)}`;
      const fileName = docName || `Bordereau_Sortie_${ref}.pdf`;
      const res = await api.post("/cash/operations", {
        type: "out",
        category: form.category,
        amount: numAmount,
        currency: form.currency,
        exchange_rate: form.exchange_rate,
        beneficiary: form.beneficiary.trim(),
        authorized_by: form.authorized_by.trim(),
        reason: form.reason.trim(),
        reference: ref,
        document_url: docUrl,
        document_name: fileName,
      });

      toast.success(`Sortie de ${fmtMoney(numAmount, form.currency as any)} enregistrée avec succès !`);
      onSuccess(res.data, docUrl, fileName);
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur lors de l'enregistrement de la sortie"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5 text-rose-600" />
                <span>Enregistrer une Sortie de Caisse</span>
              </div>
              <span className="text-[11px] font-mono text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded font-bold">
                Taux de sortie : 1$ = {form.exchange_rate} FC
              </span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-1 text-xs">
            {/* A. Catégorie de Dépense */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-semibold text-slate-700">
                  Catégorie de Dépense <span className="text-rose-500">*</span>
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowNewCatModal(true)}
                  className="h-6 px-2 text-[11px] font-bold text-blue-700 border-blue-200 bg-blue-50/70 hover:bg-blue-100 rounded-md gap-1"
                >
                  <Plus className="h-3 w-3" /> + Créer une catégorie
                </Button>
              </div>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-xs focus:border-[#0F3D68] focus:outline-none"
              >
                {expenseCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* B. Montant et Devise */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Montant de la sortie <span className="text-rose-500">*</span>
                </Label>
                <div className="relative mt-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="text-xs font-bold text-slate-900 pr-12 h-9"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {form.currency}
                  </span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-700">
                    Devise <span className="text-rose-500">*</span>
                  </Label>
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                    Taux de sortie : 1$ = {form.exchange_rate.toLocaleString("fr-FR")} FC
                  </span>
                </div>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="mt-1 w-full h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-xs focus:border-[#0F3D68] focus:outline-none"
                >
                  <option value="USD">USD ($ - Dollar américain)</option>
                  <option value="CDF">CDF (FC - Franc congolais)</option>
                </select>
              </div>
            </div>

            {/* Dynamic conversion indicator */}
            {parseFloat(form.amount) > 0 && (
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">
                  Équivalence au taux du jour (1$ = {form.exchange_rate} FC) :
                </span>
                <span className="font-bold text-slate-800">
                  {form.currency === "USD"
                    ? `${(Math.round(parseFloat(form.amount) * form.exchange_rate)).toLocaleString("fr-FR")} FC`
                    : fmtMoney(parseFloat(form.amount) / form.exchange_rate, "USD")}
                </span>
              </div>
            )}

            {/* C. Bénéficiaire */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Nom du Bénéficiaire <span className="text-rose-500">*</span>
              </Label>
              <Input
                placeholder="Personne, agent, fournisseur recevant les fonds"
                value={form.beneficiary}
                onChange={(e) => setForm({ ...form, beneficiary: e.target.value })}
                required
                className="mt-1 text-xs"
              />
            </div>

            {/* D. Autorisé par (avec recherche dynamique) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#0F3D68]" />
                  Autorisé par <span className="text-rose-500">*</span>
                </Label>
                {form.authorized_by && (
                  <button
                    type="button"
                    onClick={() => {
                      setForm({ ...form, authorized_by: "" });
                      setIsAuthorizerDropdownOpen(true);
                    }}
                    className="text-[11px] text-blue-600 hover:underline font-semibold"
                  >
                    Changer l'utilisateur
                  </button>
                )}
              </div>

              {form.authorized_by ? (
                <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-[#0F3D68] text-white flex items-center justify-center font-bold text-xs shrink-0">
                      {form.authorized_by.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900">{form.authorized_by}</div>
                      <div className="text-[10px] text-blue-800 font-medium">Validateur autorisé</div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm({ ...form, authorized_by: "" });
                      setIsAuthorizerDropdownOpen(true);
                    }}
                    className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700 hover:bg-blue-100 rounded-lg"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Rechercher par nom, rôle (Directeur, Admin, Chef de département...)"
                      value={authorizerSearch}
                      onChange={(e) => {
                        setAuthorizerSearch(e.target.value);
                        setIsAuthorizerDropdownOpen(true);
                      }}
                      onFocus={() => setIsAuthorizerDropdownOpen(true)}
                      className="pl-8 text-xs h-9 bg-white"
                    />
                  </div>
                  {isAuthorizerDropdownOpen && (
                    <div className="absolute z-50 left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 divide-y divide-slate-100">
                      {filteredAuthorizers.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-400">
                          Aucun utilisateur correspondant trouvé
                        </div>
                      ) : (
                        filteredAuthorizers.map((u: any) => (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              setForm({ ...form, authorized_by: u.full_name });
                              setIsAuthorizerDropdownOpen(false);
                              setAuthorizerSearch("");
                            }}
                            className="w-full text-left p-2 hover:bg-blue-50/70 rounded-lg flex items-center justify-between transition-colors text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-slate-100 text-[#0F3D68] flex items-center justify-center font-bold text-[10px] shrink-0">
                                {u.full_name?.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <span className="font-bold text-slate-800 block">{u.full_name}</span>
                                <span className="text-[10px] text-slate-500">
                                  {u.role_code || "Agent"} {u.department ? `• ${u.department}` : ""}
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                              Sélectionner
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* E. Motif de la Sortie */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Motif de la sortie <span className="text-rose-500">*</span>
              </Label>
              <Textarea
                placeholder="Raison détaillée du décaissement (ex: Achat consommables de bureau, carburant...)"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                required
                className="mt-1 text-xs min-h-[55px]"
              />
            </div>

            {/* F. Upload Pièce Justificative */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-rose-600" />
                  Pièce justificative de la sortie <span className="text-rose-500">*</span>
                </Label>
                {docUrl && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Fichier prêt
                  </span>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf,image/png,image/jpeg,image/jpg,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) processFile(f);
                  e.target.value = "";
                }}
                className="hidden"
              />

              {docLoading ? (
                <div className="p-6 bg-white rounded-xl border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
                  <span>Chargement et encodage du document...</span>
                </div>
              ) : docUrl ? (
                <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {docUrl.startsWith("data:image/") ? (
                        <img
                          src={docUrl}
                          alt="Aperçu pièce"
                          className="h-12 w-12 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-red-50 text-red-600 border border-red-200 flex flex-col items-center justify-center font-bold text-xs shrink-0">
                          <FileText className="h-5 w-5" />
                          <span className="text-[9px]">PDF</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate" title={docName}>
                          {docName || "Piece_Justificative.pdf"}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2">
                          <span className="font-medium text-slate-600">{docType || "Document"}</span>
                          {docSize && <span>• {docSize}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => openDocumentInNativeViewer(docUrl, docName)}
                        className="h-7 text-xs rounded-lg bg-[#0F3D68] hover:bg-[#0B2F52] text-white font-semibold px-2.5 gap-1"
                        title="Ouvrir dans le visualiseur"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Aperçu</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-7 text-xs rounded-lg border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        Remplacer
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDocUrl("");
                          setDocName("");
                          setDocSize("");
                          setDocType("");
                        }}
                        className="h-7 w-7 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-rose-400 bg-white hover:bg-rose-50/30 flex flex-col items-center justify-center text-center gap-1.5 transition-all group"
                  >
                    <div className="h-8 w-8 rounded-full bg-slate-100 group-hover:bg-rose-100 text-slate-500 group-hover:text-rose-600 flex items-center justify-center transition-colors">
                      <Upload className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 group-hover:text-rose-700">
                      Importer un fichier
                    </span>
                    <span className="text-[10px] text-slate-400">PDF, JPG, JPEG, PNG (max 25 Mo)</span>
                  </button>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={submitting || !docUrl}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enregistrement de la Sortie...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Confirmer la Sortie
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL CRÉATION NOUVELLE CATÉGORIE */}
      <Dialog open={showNewCatModal} onOpenChange={setShowNewCatModal}>
        <DialogContent className="max-w-md bg-white rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="h-5 w-5 text-[#0F3D68]" />
              Créer une Catégorie de Dépense
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateCategory} className="space-y-4 py-2 text-xs">
            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Nom de la nouvelle catégorie <span className="text-rose-500">*</span>
              </Label>
              <Input
                placeholder="Ex: Frais de douane & transit, Maintenance..."
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                autoFocus
                required
                className="mt-1 text-xs"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Cette catégorie sera enregistrée dans la base et sélectionnée sans effacer votre saisie en cours.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNewCatName("");
                  setShowNewCatModal(false);
                }}
                disabled={savingCat}
                className="text-xs"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={savingCat || !newCatName.trim()}
                className="bg-[#0F3D68] hover:bg-[#0B2F52] text-white text-xs font-bold"
              >
                {savingCat ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                    Enregistrer la catégorie
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
