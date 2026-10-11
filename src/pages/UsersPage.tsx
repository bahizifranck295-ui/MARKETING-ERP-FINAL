import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  UserPlus,
  Edit2,
  Loader2,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function UsersPage() {
  const { has } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userModal, setUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [sites, setSites] = useState<any[]>([]);
  // Départements = catégories de produits du module Stock › Catégories
  const [categories, setCategories] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState(true);
  const [userCategories, setUserCategories] = useState<string[]>([]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const [uRes, rRes, sRes] = await Promise.all([
        api.get("/users"),
        api.get("/roles"),
        api.get("/integration/sites").catch(() => ({ data: [] })),
      ]);
      api
        .get("/integration/categories")
        .then(({ data }) => setCategories((Array.isArray(data) ? data : []).map((c: any) => c.name).filter(Boolean)))
        .catch(() => setCategories([]));
      setUsers(Array.isArray(uRes.data) ? uRes.data : []);
      setRoles(Array.isArray(rRes.data) ? rRes.data : []);
      setSites(Array.isArray(sRes.data) ? sRes.data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur chargement utilisateurs"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // À l'ouverture du formulaire : reprendre l'accès aux catégories de l'utilisateur modifié
  useEffect(() => {
    if (!userModal) return;
    const cats: string[] = Array.isArray(editingUser?.categories) ? editingUser.categories : [];
    const legacy = categories.filter((c) => c.toLowerCase() === String(editingUser?.department || "").toLowerCase());
    const picked = cats.length ? cats : legacy;
    setAllCategories(editingUser ? editingUser.all_categories === true || !picked.length : true);
    setUserCategories(picked);
  }, [userModal, editingUser, categories]);

  const departmentLabel = (u: any) =>
    u.all_categories ? "Toutes les catégories" : Array.isArray(u.categories) && u.categories.length ? u.categories.join(", ") : u.department || "-";

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allCategories && !userCategories.length) {
      toast.error("Choisissez au moins une catégorie, ou donnez l'accès à toutes les catégories");
      return;
    }
    setSaving(true);
    const form = e.target as any;
    const payload: any = {
      full_name: form.elements.full_name.value.trim(),
      email: form.elements.email.value.trim(),
      role_code: form.elements.role_code.value,
      phone: form.elements.phone.value.trim(),
      all_categories: allCategories,
      categories: allCategories ? [] : userCategories,
      site_id: form.elements.site_id?.value || "",
      is_active: form.elements.is_active.checked,
    };
    if (form.elements.password?.value) {
      payload.password = form.elements.password.value;
    }
    try {
      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, payload);
        toast.success("Utilisateur mis à jour avec succès");
      } else {
        await api.post("/users", payload);
        toast.success("Nouvel utilisateur créé");
      }
      setUserModal(false);
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec de l'enregistrement"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gestion des Utilisateurs"
        subtitle="Comptes d'accès, affectations de rôles et départements"
        right={
          has("users.write") && (
            <Button
              size="sm"
              onClick={() => {
                setEditingUser(null);
                setUserModal(true);
              }}
              className="rounded-xl bg-[#0F3D68] hover:bg-[#0B2F52] text-white"
            >
              <UserPlus className="h-4 w-4 mr-1.5" /> Nouvel Utilisateur
            </Button>
          )
        }
      />
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="p-3.5">Nom & Prénom</th>
                  <th className="p-3.5">Email</th>
                  <th className="p-3.5">Rôle</th>
                  <th className="p-3.5">Département</th>
                  <th className="p-3.5">Site d'affectation</th>
                  <th className="p-3.5 text-center">Statut</th>
                  {has("users.write") && <th className="p-3.5 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 font-bold text-slate-900">{u.full_name}</td>
                    <td className="p-3.5 text-slate-600 font-mono">{u.email}</td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0F3D68]/10 text-[#0F3D68]">
                        {roles.find((r) => r.code === u.role_code)?.name || u.role_code}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-600" data-no-translate={!u.all_categories || undefined}>
                      {departmentLabel(u)}
                    </td>
                    <td className="p-3.5 text-slate-600">{sites.find((x) => x.id === u.site_id)?.name || "-"}</td>
                    <td className="p-3.5 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.is_active
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {u.is_active ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    {has("users.write") && (
                      <td className="p-3.5 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingUser(u);
                            setUserModal(true);
                          }}
                          className="h-7 w-7 p-0 rounded-lg text-slate-500 hover:text-slate-900"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* USER MODAL */}
      {userModal && (
        <Dialog open onOpenChange={() => setUserModal(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">
                {editingUser ? "Modifier l'utilisateur" : "Nouvel Utilisateur"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSaveUser} className="space-y-3 pt-2 text-xs">
              <div>
                <Label className="text-xs font-semibold">Nom complet *</Label>
                <Input
                  name="full_name"
                  defaultValue={editingUser?.full_name}
                  required
                  className="mt-1 h-9 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Email *</Label>
                  <Input
                    name="email"
                    type="email"
                    defaultValue={editingUser?.email}
                    required
                    className="mt-1 h-9 rounded-lg"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Téléphone</Label>
                  <Input
                    name="phone"
                    defaultValue={editingUser?.phone}
                    className="mt-1 h-9 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold">
                  {editingUser ? "Nouveau Mot de Passe (optionnel)" : "Mot de Passe *"}
                </Label>
                <Input
                  name="password"
                  type="password"
                  required={!editingUser}
                  placeholder={editingUser ? "Laisser vide pour ne pas changer" : "••••••••"}
                  className="mt-1 h-9 rounded-lg"
                />
              </div>
              <div>
                <div>
                  <Label className="text-xs font-semibold">Rôle</Label>
                  <select
                    name="role_code"
                    defaultValue={editingUser?.role_code || "commercial"}
                    className="w-full mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                  >
                    {roles.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2" data-dept-section>
                <Label className="text-xs font-semibold">Département (catégories de produits)</Label>
                <div role="group" aria-label="Accès aux catégories" className="grid grid-cols-2 gap-2">
                  {([
                    [true, "Accès à toutes les catégories"],
                    [false, "Rattaché à des catégories"],
                  ] as const).map(([v, l]) => (
                    <button
                      key={String(v)}
                      type="button"
                      aria-pressed={allCategories === v}
                      onClick={() => setAllCategories(v)}
                      className={`h-9 rounded-lg border px-2 text-xs font-bold transition ${
                        allCategories === v ? "border-[#0F3D68] bg-[#0F3D68] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {allCategories ? (
                  <p className="text-[10px] text-slate-500">L'utilisateur gère les informations de tous les départements.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5" data-no-translate>
                      {categories.map((c) => {
                        const on = userCategories.includes(c);
                        return (
                          <label
                            key={c}
                            className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                              on ? "border-[#0F3D68] bg-[#0F3D68]/10 text-[#0F3D68]" : "border-slate-200 bg-white text-slate-600"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => setUserCategories((cur) => (on ? cur.filter((x) => x !== c) : [...cur, c]))}
                              className="h-3.5 w-3.5 rounded border-slate-300"
                            />
                            {c}
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-500">Cochez une ou plusieurs catégories gérées par cet utilisateur.</p>
                  </>
                )}
              </div>
              <div>
                <Label className="text-xs font-semibold">Site d'affectation</Label>
                <select
                  name="site_id"
                  defaultValue={editingUser?.site_id || ""}
                  className="w-full mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"
                >
                  <option value="">Site principal (par défaut)</option>
                  {sites.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-slate-500">
                  Une caissière gère les entrées et sorties de caisse de son site d'affectation.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  name="is_active"
                  defaultChecked={editingUser ? editingUser.is_active : true}
                  className="h-4 w-4 rounded border-slate-300 text-[#0F3D68]"
                />
                <label htmlFor="is_active" className="text-xs font-medium text-slate-700">
                  Compte actif et autorisé à se connecter
                </label>
              </div>
              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setUserModal(false)}>
                  Annuler
                </Button>
                <Button type="submit" disabled={saving} className="bg-[#0F3D68] text-white">
                  Enregistrer
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
