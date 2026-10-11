import React, { useEffect, useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  Users,
  Search,
  Plus,
  Phone,
  MapPin,
  CreditCard,
  Edit2,
  FileText,
  Loader2,
  AlertTriangle,
  Upload,
  Camera,
  X,
  Building,
  ArrowUpDown,
  RotateCcw,
  ExternalLink,
  RefreshCw,
  Trash2,
  FileDown,
  Maximize2,
  Layers,
  Download,
  ChevronDown,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, EmptyState, fmtMoney } from "@/components/erp-ui";
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
import CompteClientView from "@/components/CompteClientView";
import { openDocumentInNativeViewer, closeTab, openPendingTab } from "@/lib/documentViewer";
import { getProductColor } from "@/lib/productColors";
import {
  generateClientsSummaryPdf,
  OFFICIAL_DEPARTMENTS,
  normalizeDepartment,
} from "@/lib/exportClientsPdf";

export default function ClientsPage() {
  const { has } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  // Sites du module Stock › Sites (liste déroulante du formulaire client)
  const [stockSites, setStockSites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<string>("all");

  // Search & Filter & Sort state
  const [search, setSearch] = useState("");
  const [selectedProductFilter, setSelectedProductFilter] = useState("all");
  const [selectedSiteFilter, setSelectedSiteFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "product" | "site" | "solde" | "date">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // View / Edit Modals
  const [viewingClientId, setViewingClientId] = useState<string | null>(null);
  const [clientViewRefreshKey, setClientViewRefreshKey] = useState(0);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State for client creation/edit
  const [formPhoto, setFormPhoto] = useState<string>("");
  const [formDocUrl, setFormDocUrl] = useState<string>("");
  const [formDocName, setFormDocName] = useState<string>("");
  const [formDocType, setFormDocType] = useState<string>("Accord de crédit");
  const [formDocSize, setFormDocSize] = useState<string>("");
  const [docLoading, setDocLoading] = useState<boolean>(false);
  const [isDocDragOver, setIsDocDragOver] = useState<boolean>(false);
  const [formProductId, setFormProductId] = useState<string>("");
  const [formProductName, setFormProductName] = useState<string>("");
  const [formMarketerName, setFormMarketerName] = useState<string>("Patrick K.");
  const [formBusinessUnit, setFormBusinessUnit] = useState<string>("Boissons");

  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const loadClientsAndProducts = async () => {
    setLoading(true);
    try {
      const [resClients, resProducts] = await Promise.all([
        api.get("/clients"),
        api.get("/integration/catalog").catch(() => ({ data: [] })),
      ]);
      setClients(Array.isArray(resClients.data) ? resClients.data : []);
      setProducts(Array.isArray(resProducts.data) ? resProducts.data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur chargement clients"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClientsAndProducts();
    api
      .get("/integration/sites")
      .then(({ data }) => setStockSites((Array.isArray(data) ? data : []).filter((x: any) => x.is_active !== false).map((x: any) => x.name).filter(Boolean)))
      .catch(() => setStockSites([]));
  }, []);

  const fetchEnrichedClientsForExport = async () => {
    const res = await api.get("/clients");
    const clientList = Array.isArray(res.data) ? res.data : clients;
    const enrichedClients = await Promise.all(
      clientList.map(async (c: any) => {
        try {
          const acctRes = await api.get(`/clients/${c.id}/account`);
          const acct = acctRes.data;
          const solde =
            acct?.solde_actuel !== undefined
              ? acct.solde_actuel
              : acct?.client?.solde_actuel ?? (c.solde_actuel ?? c.balance ?? 0);
          return {
            ...c,
            solde_actuel: solde,
          };
        } catch {
          return c;
        }
      })
    );
    return enrichedClients;
  };

  const handleExecuteExport = async (department: string | "all") => {
    // L'onglet du visualiseur PDF est ouvert pendant le clic (sinon Chrome le bloque)
    const tab = openPendingTab("Liste des clients");
    setExportingPdf(true);
    setExportTarget(department);
    try {
      const enrichedClients = await fetchEnrichedClientsForExport();
      if (!(await generateClientsSummaryPdf(enrichedClients, { department, tab }))) closeTab(tab);
      setIsExportModalOpen(false);
    } catch (err) {
      closeTab(tab);
      toast.error(extractErrorMessage(err, "Erreur lors de la génération du PDF"));
    } finally {
      setExportingPdf(false);
      setExportTarget("all");
    }
  };

  const handleExportAllDepartmentsSeparately = async () => {
    // Un onglet du visualiseur par département, ouverts pendant le clic
    const tabs = new Map<string, Window | null>();
    for (const dept of OFFICIAL_DEPARTMENTS)
      if (clients.some((c) => normalizeDepartment(c.department || c.business_unit) === dept)) tabs.set(dept, openPendingTab(`Clients · ${dept}`));
    setExportingPdf(true);
    setExportTarget("all_separately");
    try {
      const enrichedClients = await fetchEnrichedClientsForExport();
      let exportedCount = 0;
      let generated = 0;
      for (const dept of OFFICIAL_DEPARTMENTS) {
        const count = enrichedClients.filter(
          (c) => normalizeDepartment(c.department || c.business_unit) === dept
        ).length;
        if (count > 0) {
          generated++;
          const tab = tabs.get(dept) ?? null;
          tabs.delete(dept);
          if (await generateClientsSummaryPdf(enrichedClients, { department: dept, tab })) exportedCount++;
          else closeTab(tab);
        }
      }
      tabs.forEach((t) => closeTab(t));
      if (exportedCount) toast.success(`${exportedCount} / ${generated} documents départements ouverts dans le visualiseur`);
      else toast.error("Aucun document n'a pu être ouvert");
      setIsExportModalOpen(false);
    } catch (err) {
      tabs.forEach((t) => closeTab(t));
      toast.error(extractErrorMessage(err, "Erreur lors de l'exportation séparée"));
    } finally {
      setExportingPdf(false);
      setExportTarget("all");
    }
  };

  const getDepartmentClientCount = (dept: string) => {
    return clients.filter(
      (c) => normalizeDepartment(c.department || c.business_unit) === dept
    ).length;
  };

  const openCreateModal = () => {
    setEditingClient(null);
    setFormPhoto("");
    setFormDocUrl("");
    setFormDocName("");
    setFormDocType("Accord de crédit");
    setFormDocSize("");
    setFormProductId(products[0]?.id || "");
    setFormProductName(products[0]?.name || "");
    setFormMarketerName("Patrick K.");
    setFormBusinessUnit("Boissons");
    setIsNewModalOpen(true);
  };

  const openEditModal = (cl: any) => {
    setEditingClient(cl);
    setFormPhoto(cl.photo_url || "");
    setFormDocUrl(cl.document_url || "");
    setFormDocName(cl.document_name || "");
    setFormDocType(cl.document_type || "Accord de crédit");
    setFormDocSize(cl.document_size || "");
    setFormProductId(cl.product_id || "");
    setFormProductName(cl.product_name || "");
    setFormMarketerName(cl.marketer_name || "Patrick K.");
    setFormBusinessUnit(cl.business_unit || cl.department || "Boissons");
    setIsNewModalOpen(true);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFormPhoto(reader.result as string);
      toast.success("Photo de profil prête");
    };
    reader.readAsDataURL(file);
  };

  const processDocFile = (file: File) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Le document sélectionné est trop lourd (max 50 Mo).");
      return;
    }
    setDocLoading(true);
    const sizeFormatted =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(2)} Mo`
        : `${Math.round(file.size / 1024)} Ko`;
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const detectedType = isPdf
      ? "Document PDF"
      : file.type.startsWith("image/")
      ? "Scan Image"
      : "Document Officiel";
    const reader = new FileReader();
    reader.onload = () => {
      setFormDocUrl(reader.result as string);
      setFormDocName(file.name);
      setFormDocType(detectedType);
      setFormDocSize(sizeFormatted);
      setDocLoading(false);
      toast.success(`Fichier ${isPdf ? "PDF " : ""} "${file.name}" (${sizeFormatted}) prêt !`);
    };
    reader.onerror = () => {
      toast.error("Erreur de lecture du document");
      setDocLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processDocFile(file);
    }
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const form = e.target as any;
    const payload = {
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      secondary_phone: form.elements.secondary_phone?.value.trim() || "",
      address: form.elements.address?.value.trim() || "",
      city: form.elements.city?.value.trim() || "Goma, RDC",
      credit_limit: Number(form.elements.credit_limit.value) || 0,
      type: form.elements.type?.value || "Grossiste",
      photo_url: formPhoto,
      document_url: formDocUrl,
      document_name: formDocName,
      document_type: formDocType,
      document_size: formDocSize,
      product_id: formProductId,
      product_name: formProductName,
      business_unit: formBusinessUnit || form.elements.business_unit?.value || "Boissons",
      department: formBusinessUnit || form.elements.business_unit?.value || "Boissons",
      marketer_name: formMarketerName || form.elements.marketer_name?.value || "Patrick K.",
      document_uploaded_at: formDocUrl ? new Date().toISOString() : undefined,
    };
    try {
      if (editingClient) {
        await api.put(`/clients/${editingClient.id}`, payload, { timeout: 300000 });
        toast.success("Client mis à jour avec succès");
        setClientViewRefreshKey((k) => k + 1);
      } else {
        await api.post("/clients", payload, { timeout: 300000 });
        toast.success("Nouveau client créé avec succès");
      }
      setIsNewModalOpen(false);
      setEditingClient(null);
      loadClientsAndProducts();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec de l'enregistrement"));
    } finally {
      setSaving(false);
    }
  };

  const availableProductNames = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => {
      if (c.product_name) set.add(c.product_name);
    });
    products.forEach((p) => {
      if (p.name) set.add(p.name);
    });
    return Array.from(set).sort();
  }, [clients, products]);

  const availableSites = useMemo(() => {
    const set = new Set<string>();
    clients.forEach((c) => {
      if (c.city) set.add(c.city);
    });
    return Array.from(set).sort();
  }, [clients]);

  const filteredAndSortedClients = useMemo(() => {
    let list = [...clients];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.code?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.secondary_phone?.toLowerCase().includes(q) ||
          c.city?.toLowerCase().includes(q) ||
          c.product_name?.toLowerCase().includes(q) ||
          c.business_unit?.toLowerCase().includes(q) ||
          c.marketer_name?.toLowerCase().includes(q)
      );
    }
    if (selectedProductFilter !== "all") {
      list = list.filter(
        (c) => c.product_name?.toLowerCase() === selectedProductFilter.toLowerCase()
      );
    }
    if (selectedSiteFilter !== "all") {
      list = list.filter(
        (c) => c.city?.toLowerCase() === selectedSiteFilter.toLowerCase()
      );
    }
    list.sort((a, b) => {
      let comparison = 0;
      if (sortBy === "product") {
        const pA = a.product_name || "";
        const pB = b.product_name || "";
        comparison = pA.localeCompare(pB);
      } else if (sortBy === "site") {
        const sA = a.city || "";
        const sB = b.city || "";
        comparison = sA.localeCompare(sB);
      } else if (sortBy === "name") {
        const nA = a.name || "";
        const nB = b.name || "";
        comparison = nA.localeCompare(nB);
      } else if (sortBy === "solde") {
        const soldeA = a.solde_actuel ?? a.current_balance ?? a.balance ?? 0;
        const soldeB = b.solde_actuel ?? b.current_balance ?? b.balance ?? 0;
        comparison = soldeA - soldeB;
      } else if (sortBy === "date") {
        const dA = new Date(a.created_at || 0).getTime();
        const dB = new Date(b.created_at || 0).getTime();
        comparison = dB - dA;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return list;
  }, [clients, search, selectedProductFilter, selectedSiteFilter, sortBy, sortDirection]);

  const hasActiveFilters =
    search.trim() !== "" ||
    selectedProductFilter !== "all" ||
    selectedSiteFilter !== "all" ||
    sortBy !== "name" ||
    sortDirection !== "asc";

  const resetFilters = () => {
    setSearch("");
    setSelectedProductFilter("all");
    setSelectedSiteFilter("all");
    setSortBy("name");
    setSortDirection("asc");
  };

  const renderClientFormModal = () =>
    isNewModalOpen && (
      <Dialog open onOpenChange={() => !saving && setIsNewModalOpen(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {editingClient ? "Modifier la fiche Client" : "Créer un Nouveau Client"}
            </DialogTitle>
            <p className="text-xs text-slate-500">
              Rattachement à une Business Unit, coordonnées et validation de crédit.
            </p>
          </DialogHeader>
          <form onSubmit={handleSaveClient} className="space-y-3.5 pt-2 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-4">
              <div className="relative shrink-0">
                {formPhoto ? (
                  <img
                    src={formPhoto}
                    alt="Aperçu profil"
                    className="h-16 w-16 rounded-xl object-cover border-2 border-brand shadow-xs"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-slate-200 text-slate-500 flex flex-col items-center justify-center border border-slate-300">
                    <Camera className="h-6 w-6 text-slate-400" />
                    <span className="text-[9px] mt-0.5">Aucune</span>
                  </div>
                )}
                {formPhoto && (
                  <button
                    type="button"
                    onClick={() => setFormPhoto("")}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-xs"
                    title="Supprimer la photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs font-bold text-slate-800 block">
                  Photo de profil du client
                </Label>
                <p className="text-[11px] text-slate-500">
                  Sera affichée clairement à côté du nom du client dans la liste.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => photoInputRef.current?.click()}
                    className="h-7 text-xs rounded-lg border-slate-300"
                  >
                    <Upload className="h-3 w-3 mr-1" /> Choisir une photo
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-800">
                Nom complet ou raison sociale *
              </Label>
              <Input
                name="name"
                defaultValue={editingClient?.name}
                required
                placeholder="Ex: Établissement Patrick & Frères"
                className="mt-1 h-9 rounded-lg text-xs"
              />
            </div>

            <div className="p-3 bg-sky-50/50 rounded-xl border border-sky-200 space-y-1.5">
              <Label className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5 text-sky-700" />
                Business Unit / Département *
              </Label>
              <select
                name="business_unit"
                value={formBusinessUnit}
                onChange={(e) => setFormBusinessUnit(e.target.value)}
                required
                className="w-full h-9 rounded-lg border border-sky-300 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-sky-500"
              >
                <option value="Boissons">Boissons</option>
                <option value="Lait & produits laitiers">Lait & produits laitiers</option>
                <option value="Produits alimentaires">Produits alimentaires</option>
                <option value="Hôtellerie">Hôtellerie</option>
                <option value="Grande distribution">Grande distribution</option>
                <option value="Restauration">Restauration</option>
                <option value="Autres">Autres</option>
              </select>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-800">
                Marketeur responsable *
              </Label>
              <select
                name="marketer_name"
                value={formMarketerName}
                onChange={(e) => setFormMarketerName(e.target.value)}
                className="w-full mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800"
              >
                <option value="Patrick K.">Patrick K.</option>
                <option value="Sarah M.">Sarah M.</option>
                <option value="David B.">David B.</option>
                <option value="Aline N.">Aline N.</option>
                <option value="Nathalie Mukendi">Nathalie Mukendi</option>
                <option value="Jean Kasongo">Jean Kasongo</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">
                Produit principal (Optionnel)
              </Label>
              <select
                value={formProductName}
                onChange={(e) => {
                  const chosenName = e.target.value;
                  setFormProductName(chosenName);
                  const found = products.find((p) => p.name === chosenName);
                  if (found) setFormProductId(found.id);
                }}
                className="w-full h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
              >
                <option value="">-- Aucun produit spécifique --</option>
                {availableProductNames.map((pName) => (
                  <option key={pName} value={pName}>
                    {pName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold text-slate-800">
                  Téléphone principal *
                </Label>
                <Input
                  name="phone"
                  required
                  defaultValue={editingClient?.phone}
                  placeholder="+243 971 000 000"
                  className="mt-1 h-9 rounded-lg text-xs font-medium"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-800">
                  Téléphone secondaire
                </Label>
                <Input
                  name="secondary_phone"
                  defaultValue={editingClient?.secondary_phone}
                  placeholder="+243 812 000 000"
                  className="mt-1 h-9 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold text-slate-800">
                  Site géographique / Ville *
                </Label>
                {(() => {
                  // Liste des sites existants ; la valeur d'un ancien client hors liste est conservée telle quelle
                  const current = editingClient?.city || "";
                  const match = stockSites.find((x) => x.toLowerCase() === current.toLowerCase());
                  const options = current && !stockSites.some((x) => x.toLowerCase() === current.toLowerCase()) && !match ? [current, ...stockSites] : stockSites;
                  return (
                    <select
                      key={`${editingClient?.id || "new"}-${stockSites.length}`}
                      name="city"
                      required
                      defaultValue={match || current || stockSites[0] || ""}
                      data-no-translate
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium"
                    >
                      {!options.length && <option value="">Aucun site configuré</option>}
                      {options.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-800">
                  Type de client
                </Label>
                <select
                  name="type"
                  defaultValue={editingClient?.type || "Grossiste"}
                  className="w-full mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                >
                  <option value="Grossiste">Grossiste</option>
                  <option value="Demi-grossiste">Demi-grossiste</option>
                  <option value="Supermarché">Supermarché</option>
                  <option value="Détaillant">Détaillant</option>
                  <option value="Professionnel">Professionnel</option>
                  <option value="Hôtellerie">Hôtellerie</option>
                  <option value="Restaurant">Restaurant</option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-800">Adresse physique *</Label>
              <Input
                name="address"
                defaultValue={editingClient?.address}
                placeholder="Quartier, Avenue, N° de parcelle..."
                className="mt-1 h-9 rounded-lg text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-800">
                Crédit autorisé (USD) *
              </Label>
              <Input
                name="credit_limit"
                type="number"
                step="50"
                defaultValue={editingClient?.credit_limit ?? 2500}
                className="mt-1 h-9 rounded-lg text-xs font-bold text-slate-900 font-mono"
              />
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-brand" />
                  Document client officiel (Contrat, Accord de crédit, RCCM)
                </Label>
                {formDocUrl && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Document prêt
                  </span>
                )}
              </div>

              <input
                ref={docInputRef}
                type="file"
                accept="application/pdf,.pdf,image/*,.doc,.docx"
                onChange={handleDocUpload}
                className="hidden"
              />

              {formDocUrl ? (
                <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`h-9 w-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          formDocName?.toLowerCase().endsWith(".pdf") || formDocType?.includes("PDF")
                            ? "bg-red-50 text-red-600 border border-red-200"
                            : "bg-sky-50 text-sky-600 border border-sky-200"
                        }`}
                      >
                        {formDocName?.toLowerCase().endsWith(".pdf") || formDocType?.includes("PDF")
                          ? "PDF"
                          : "DOC"}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-slate-900 truncate" title={formDocName}>
                          {formDocName || "Document_Client.pdf"}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span>{formDocType || "Document"}</span>
                          {formDocSize && <span>• {formDocSize}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          openDocumentInNativeViewer(formDocUrl, formDocName || "Document_Client.pdf", editingClient?.id);
                        }}
                        className="h-8 text-xs rounded-xl bg-brand hover:bg-brand-strong text-white font-semibold px-3 shadow-xs"
                        title="Affichage en grand dans le visualiseur de la machine"
                      >
                        <Maximize2 className="h-3.5 w-3.5 mr-1.5" />
                        Affichage machine
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => docInputRef.current?.click()}
                        className="h-8 text-xs rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 px-2.5"
                        title="Remplacer le document"
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Remplacer
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormDocUrl("");
                          setFormDocName("");
                          setFormDocSize("");
                        }}
                        className="h-8 w-8 rounded-xl text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors"
                        title="Supprimer le document"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDocDragOver(true);
                  }}
                  onDragLeave={() => setIsDocDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDocDragOver(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) processDocFile(file);
                  }}
                  onClick={() => docInputRef.current?.click()}
                  className={`p-4 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all ${
                    isDocDragOver
                      ? "border-brand bg-sky-50/70"
                      : "border-slate-300 hover:border-brand hover:bg-slate-100/50"
                  }`}
                >
                  {docLoading ? (
                    <div className="flex flex-col items-center justify-center py-2 space-y-2">
                      <Loader2 className="h-5 w-5 animate-spin text-brand" />
                      <span className="text-xs font-semibold text-slate-700">
                        Traitement et encodage du document...
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center space-y-1.5 py-1">
                      <div className="h-9 w-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100 shadow-2xs">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="text-xs font-bold text-slate-800">
                        Cliquez pour sélectionner ou glissez un fichier <span className="text-red-600 font-black">PDF</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Accepte les documents PDF (.pdf), contrats scannés (PNG, JPG) jusqu'à 25 Mo
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNewModalOpen(false)}
                className="rounded-xl text-xs"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-brand hover:bg-brand-strong text-white rounded-xl text-xs font-semibold shadow-xs"
              >
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingClient ? "Enregistrer les modifications" : "Créer le client"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );

  if (viewingClientId) {
    return (
      <>
        <CompteClientView
          key={clientViewRefreshKey}
          clientId={viewingClientId}
          onBack={() => {
            setViewingClientId(null);
            loadClientsAndProducts();
          }}
          onEditClient={(cl) => {
            const clientToEdit = cl || clients.find((c) => c.id === viewingClientId);
            if (clientToEdit) {
              openEditModal(clientToEdit);
            }
          }}
        />
        {renderClientFormModal()}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gestion CRM & Clients"
        subtitle="Portefeuille clients rattachés par Business Unit, plafonds de crédit et conformité documentaire"
        right={
          <div className="flex items-center gap-2">
            {has("crm.export") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsExportModalOpen(true)}
              disabled={loading}
              className="rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-xs font-semibold"
              title="Exporter la liste des clients par département"
            >
              <FileDown className="h-4 w-4 mr-1.5 text-brand" />
              <span>Exporter PDF</span>
              <ChevronDown className="h-3.5 w-3.5 ml-1 text-slate-400" />
            </Button>
            )}
            {has("crm.create") && (
              <Button
                size="sm"
                onClick={openCreateModal}
                className="rounded-xl bg-brand hover:bg-brand-strong text-white shadow-sm font-semibold"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Ajouter un nouveau client
              </Button>
            )}
          </div>
        }
      />

      {has("crm.filter") && (
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="relative md:col-span-4">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Rechercher nom, code, tél, ville, produit..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl bg-slate-50 border-slate-200 text-xs focus:bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="md:col-span-3">
            <div className="relative flex items-center">
              <Building className="h-3.5 w-3.5 absolute left-3 text-slate-400 pointer-events-none" />
              <select
                value={selectedProductFilter}
                onChange={(e) => setSelectedProductFilter(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium focus:bg-white cursor-pointer"
              >
                <option value="all">Tous les Produits / Business Units</option>
                {availableProductNames.map((prodName) => (
                  <option key={prodName} value={prodName}>
                    {prodName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="md:col-span-3">
            <div className="relative flex items-center">
              <MapPin className="h-3.5 w-3.5 absolute left-3 text-slate-400 pointer-events-none" />
              <select
                value={selectedSiteFilter}
                onChange={(e) => setSelectedSiteFilter(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium focus:bg-white cursor-pointer"
              >
                <option value="all">Tous les Sites Géographiques</option>
                {availableSites.map((site) => (
                  <option key={site} value={site}>
                    {site}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="md:col-span-2 flex items-center gap-1.5">
            <div className="relative flex-1">
              <ArrowUpDown className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full h-10 pl-8 pr-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium focus:bg-white cursor-pointer"
              >
                <option value="product">Trier : Produit</option>
                <option value="site">Trier : Site Géo</option>
                <option value="name">Trier : Nom Client</option>
                <option value="solde">Trier : Solde</option>
                <option value="date">Trier : Récents</option>
              </select>
            </div>
            <button
              onClick={() => setSortDirection(sortDirection === "asc" ? "desc" : "asc")}
              className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold transition-colors"
            >
              {sortDirection === "asc" ? "A-Z" : "Z-A"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-500">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-700">
              {filteredAndSortedClients.length} client{filteredAndSortedClients.length > 1 ? "s" : ""} trouvé{filteredAndSortedClients.length > 1 ? "s" : ""}
            </span>
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-7 text-[11px] text-slate-500 hover:text-slate-800"
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Réinitialiser les filtres
            </Button>
          )}
        </div>
      </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-9 w-9 animate-spin text-slate-400" />
        </div>
      ) : filteredAndSortedClients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun client ne correspond aux critères"
          subtitle="Modifiez vos filtres de recherche ou créez un nouveau client."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedClients.map((client) => {
            const prodColor = getProductColor(client.product_name);
            const hasDoc = Boolean(client.document_url);
            const solde = client.solde_actuel ?? client.current_balance ?? client.balance ?? 0;
            const isAdvance = solde > 0;
            const isCredit = solde < 0;

            return (
              <div
                key={client.id}
                style={{
                  borderColor: prodColor.cardBorderHex,
                  borderWidth: "2px",
                }}
                className="rounded-2xl bg-white p-4 shadow-xs flex flex-col justify-between hover:shadow-md transition-all relative overflow-hidden"
              >
                <div
                  className="absolute top-0 left-0 right-0 h-1.5"
                  style={{ backgroundColor: prodColor.cardBorderHex }}
                />
                <div className="space-y-3.5 pt-1">
                  <div className="flex items-start gap-3.5">
                    {client.photo_url ? (
                      <img
                        src={client.photo_url}
                        alt={client.name}
                        className="h-20 w-20 rounded-2xl object-cover border-2 shadow-xs shrink-0"
                        style={{ borderColor: prodColor.cardBorderHex }}
                        onError={(e) => {
                          (e.target as any).style.display = "none";
                        }}
                      />
                    ) : (
                      <div
                        className="h-20 w-20 rounded-2xl font-black text-xl flex items-center justify-center shrink-0 border-2 shadow-xs"
                        style={{
                          backgroundColor: prodColor.badgeBg,
                          color: prodColor.badgeText,
                          borderColor: prodColor.badgeBorder,
                        }}
                      >
                        {client.name?.substring(0, 2).toUpperCase() || "CL"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/80">
                          {client.code}
                        </span>
                        {client.is_active === false && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200">
                            Inactif
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-slate-900 text-base leading-snug line-clamp-2" title={client.name}>
                        {client.name}
                      </h3>
                      {client.city && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate">{client.city}</span>
                          {client.address && (
                            <span className="text-slate-400 truncate">({client.address})</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                        <Users className="h-3 w-3 text-slate-400" />
                        <span>Catégorie : <strong>{client.type || "Grossiste"}</strong></span>
                      </span>
                      {(client.business_unit || client.product_name) ? (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border shadow-2xs"
                          style={{
                            backgroundColor: prodColor.badgeBg,
                            color: prodColor.badgeText,
                            borderColor: prodColor.badgeBorder,
                          }}
                        >
                          <Building className="h-3 w-3" />
                          <span>{client.business_unit || client.product_name}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 border border-slate-200">
                          Non rattaché
                        </span>
                      )}
                    </div>

                    {(client.phone || client.secondary_phone) && (
                      <div className="space-y-1 text-xs text-slate-600 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                        {client.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-brand shrink-0" />
                            <span className="font-semibold text-slate-800 font-mono text-[11px]">{client.phone}</span>
                            <span className="text-[10px] text-slate-400 font-normal">(Principal)</span>
                          </div>
                        )}
                        {client.secondary_phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0 opacity-70" />
                            <span className="text-slate-700 font-mono text-[11px]">{client.secondary_phone}</span>
                            <span className="text-[10px] text-slate-400 font-normal">(Secondaire)</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                        Solde Actuel
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`text-sm font-black font-mono ${
                            isAdvance
                              ? "text-emerald-600"
                              : isCredit
                              ? "text-red-600"
                              : "text-slate-600"
                          }`}
                        >
                          {isAdvance
                            ? `+${fmtMoney(solde)}`
                            : isCredit
                            ? `-${fmtMoney(Math.abs(solde))}`
                            : "0.00 $"}
                        </span>
                        {isAdvance ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                            Avance
                          </span>
                        ) : isCredit ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 uppercase">
                            En crédit
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                            Soldé
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                        Plafond
                      </div>
                      <div className="text-xs font-mono font-bold text-slate-800 mt-0.5">
                        {fmtMoney(client.credit_limit || 0)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (hasDoc) {
                          openDocumentInNativeViewer(client.document_url, client.document_name, client.id);
                        } else {
                          openEditModal(client);
                        }
                      }}
                      hidden={!hasDoc && !has("crm.documents")}
                      className={`h-8 rounded-xl text-xs px-2.5 flex-1 font-semibold transition-colors ${
                        hasDoc
                          ? "border-sky-200 text-brand bg-sky-50/70 hover:bg-sky-100"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1 text-brand shrink-0" />
                      <span>{hasDoc ? "Vérifier Doc" : "Ajouter Doc"}</span>
                    </Button>
                    {has("crm.account") && (
                    <Button
                      size="sm"
                      onClick={() => setViewingClientId(client.id)}
                      className="h-8 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs px-3 font-semibold shadow-xs flex-1"
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" />
                      Visualiser
                    </Button>
                    )}
                    {has("crm.update") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditModal(client)}
                        className="h-8 rounded-xl border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs px-2 font-medium shrink-0"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {renderClientFormModal()}

      {/* EXPORT PDF MODAL MENU */}
      {isExportModalOpen && (
        <Dialog open onOpenChange={() => !exportingPdf && setIsExportModalOpen(false)}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
            <DialogHeader className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-brand shrink-0">
                  <FileDown className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-slate-900">
                    Exportation PDF • Liste des Clients par Département
                  </DialogTitle>
                  <p className="text-xs text-slate-500">
                    Choisissez d'exporter l'ensemble des départements dans un document unique ou sélectionnez un département spécifique.
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              <div className="p-4 rounded-xl border-2 border-brand/20 bg-sky-50/40 hover:bg-sky-50/70 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-brand" />
                      <h4 className="font-bold text-sm text-slate-900">
                        Tous les départements (Document complet unifié)
                      </h4>
                    </div>
                    <p className="text-xs text-slate-600">
                      Génère le document officiel complet avec les 7 départements et le tableau récapitulatif général ({clients.length} clients).
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleExecuteExport("all")}
                    disabled={exportingPdf}
                    className="rounded-xl bg-brand hover:bg-brand-strong text-white font-semibold shrink-0 shadow-xs h-9 px-3.5"
                  >
                    {exportingPdf && exportTarget === "all" ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4 mr-1.5" />
                    )}
                    Exporter tout (PDF unique)
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200"></div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Ou département par département
                </span>
                <div className="flex-1 h-px bg-slate-200"></div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 px-1 font-medium">
                  <span>Liste officielle des départements (conforme à l'annexe) :</span>
                  <button
                    type="button"
                    onClick={handleExportAllDepartmentsSeparately}
                    disabled={exportingPdf}
                    className="text-xs text-brand hover:underline font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {exportingPdf && exportTarget === "all_separately" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Tout exporter séparément (7 PDF)
                  </button>
                </div>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                  {OFFICIAL_DEPARTMENTS.map((dept) => {
                    const count = getDepartmentClientCount(dept);
                    const isCurrentExporting = exportingPdf && exportTarget === dept;
                    return (
                      <div
                        key={dept}
                        className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 font-bold text-xs text-brand">
                            <Building className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-slate-900 truncate">
                              {dept}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {count} {count > 1 ? "clients" : "client"} enregistré{count > 1 ? "s" : ""}
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExecuteExport(dept)}
                          disabled={exportingPdf || count === 0}
                          className="rounded-xl border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold h-8 px-3 shrink-0"
                        >
                          {isCurrentExporting ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin text-brand" />
                          ) : (
                            <FileDown className="h-3.5 w-3.5 mr-1.5 text-brand" />
                          )}
                          Exporter ({count})
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-slate-100 mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExportModalOpen(false)}
                disabled={exportingPdf}
                className="rounded-xl text-slate-500 hover:text-slate-800 text-xs"
              >
                Fermer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
