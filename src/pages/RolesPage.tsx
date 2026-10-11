import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, History, KeyRound, Loader2, Lock, Plus, RotateCcw, Save, Search, ShieldCheck, Users } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, fmtDate } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PermissionTree, { type CatalogTree } from "@/components/permissions/PermissionTree";
import { scanInterface } from "@/components/permissions/uiInventory";

/*
 * Rôles & Permissions :
 *  - Par utilisateur : droits effectifs = modèle du rôle + exceptions (ajoutées / retirées), périmètre
 *    (sites et départements), historique des changements ;
 *  - Modèles par rôle : permissions de chaque rôle, création, désactivation ;
 *  - Contrôle : fonctionnalités non intégrées au module Permissions, actions stratégiques non protégées.
 * Tout est enregistré côté serveur et appliqué immédiatement (sans reconnexion).
 */

type Tab = "users" | "roles" | "coverage";

const initials = (n: string) =>
  (n || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function RolesPage() {
  const { has, hasAny, user: me, permissions: myPerms } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = [
    { id: "users" as Tab, label: "Par utilisateur", icon: Users, ok: hasAny(["users.permissions", "users.scope"]) },
    { id: "roles" as Tab, label: "Modèles par rôle", icon: ShieldCheck, ok: has("roles.read") },
    { id: "coverage" as Tab, label: "Contrôle des permissions", icon: AlertTriangle, ok: hasAny(["audit.alerts", "users.permissions", "roles.manage"]) },
  ].filter((t) => t.ok);
  const [tab, setTab] = useState<Tab>(params.get("user") && tabs.some((t) => t.id === "users") ? "users" : tabs[0]?.id || "roles");
  const [tree, setTree] = useState<CatalogTree>([]);
  const [resources, setResources] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [c, r, u] = await Promise.all([
        api.get("/roles/catalog"),
        api.get("/roles"),
        hasAny(["users.read", "users.permissions"]) ? api.get("/users") : Promise.resolve({ data: [] }),
      ]);
      setTree(c.data?.tree || []);
      setResources(c.data?.scope_resources || {});
      setRoles(Array.isArray(r.data) ? r.data : []);
      setUsers(Array.isArray(u.data) ? u.data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur de chargement des permissions"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const mine = useMemo(() => new Set(me?.role_code === "super_admin" ? tree.flatMap((m) => m.pages.flatMap((p) => p.actions.map((a) => a.code))) : myPerms), [tree, myPerms, me]);

  return (
    <div className="space-y-4">
      <PageHeader title="Rôles & Permissions" subtitle="Droits par utilisateur, modèles par rôle, périmètre des données et contrôle de sécurité" />

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xs" aria-label="Sections des permissions">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${tab === t.id ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </nav>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : tab === "users" ? (
        <UserPermissions
          tree={tree}
          resources={resources}
          users={users}
          roles={roles}
          mine={mine}
          selectedId={params.get("user") || ""}
          onSelect={(id) => setParams(id ? { user: id } : {}, { replace: true })}
        />
      ) : tab === "roles" ? (
        <RoleTemplates tree={tree} roles={roles} users={users} mine={mine} onChanged={load} />
      ) : (
        <Coverage tree={tree} />
      )}
    </div>
  );
}

/* ---------------- Par utilisateur ---------------- */
function UserPermissions({ tree, resources, users, roles, mine, selectedId, onSelect }: { tree: CatalogTree; resources: Record<string, string>; users: any[]; roles: any[]; mine: Set<string>; selectedId: string; onSelect: (id: string) => void }) {
  const { has, user: me } = useAuth();
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [value, setValue] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<any>(null);
  // Le périmètre n'est envoyé que s'il a été modifié (une modification de permissions ne le touche pas)
  const [scopeDirty, setScopeDirty] = useState(false);
  const [sites, setSites] = useState<any[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/integration/sites").then(({ data }) => setSites(Array.isArray(data) ? data : [])).catch(() => setSites([]));
    api.get("/integration/categories").then(({ data }) => setCats((Array.isArray(data) ? data : []).map((c: any) => c.name))).catch(() => setCats([]));
  }, []);

  const loadDetail = async (id: string) => {
    if (!id) return setDetail(null);
    setBusy(true);
    try {
      const { data } = await api.get(`/users/${id}/permissions`);
      setDetail(data);
      const role = new Set<string>(data.role?.permissions || []);
      (data.grants || []).forEach((c: string) => role.add(c));
      (data.denies || []).forEach((c: string) => role.delete(c));
      setValue(role);
      setScope({ ...data.raw_scope });
      setScopeDirty(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Impossible de charger les permissions"));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId]);

  const list = users.filter((u) => {
    const s = q.trim().toLowerCase();
    return !s || [u.full_name, u.email, u.role_code, u.phone].some((x) => String(x || "").toLowerCase().includes(s));
  });
  const roleName = (code: string) => roles.find((r) => r.code === code)?.name || code;

  const rolePerms = new Set<string>(detail?.role?.permissions || []);
  const grants = [...value].filter((c) => !rolePerms.has(c));
  const denies = [...rolePerms].filter((c) => !value.has(c));
  const isProtected = !!detail?.protected && me?.role_code !== "super_admin";
  const isSelf = detail?.user?.id === me?.id && me?.role_code !== "super_admin";
  const canPerms = has("users.permissions") && !isProtected && !isSelf;
  const canScope = has("users.scope") && !isProtected && !isSelf;

  const save = async () => {
    setSaving(true);
    try {
      const body: any = {};
      if (canPerms) Object.assign(body, { grants, denies });
      if (canScope && scope && scopeDirty) body.scope = scope;
      const { data } = await api.put(`/users/${detail.user.id}/permissions`, body);
      toast.success(`Permissions enregistrées : ${data.effective.length} droit(s) effectif(s), appliqués immédiatement`);
      loadDetail(detail.user.id);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Enregistrement impossible"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs lg:max-h-[78vh] lg:overflow-y-auto">
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un utilisateur…" aria-label="Rechercher un utilisateur" className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs" />
        </div>
        <ul className="space-y-1" data-perm-users>
          {list.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onSelect(u.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${selectedId === u.id ? "bg-brand text-white" : "hover:bg-slate-50"}`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold ${selectedId === u.id ? "bg-white/20" : "bg-brand/10 text-brand"}`}>{initials(u.full_name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold" data-no-translate>{u.full_name}</span>
                  <span className={`block truncate text-[10px] ${selectedId === u.id ? "text-white/70" : "text-slate-500"}`}>{roleName(u.role_code)}</span>
                </span>
                {!u.is_active && <span className="rounded bg-red-50 px-1.5 text-[9px] font-bold text-red-600">Inactif</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="min-w-0 space-y-4">
        {!selectedId ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">
            <KeyRound className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            Sélectionnez un utilisateur pour configurer ses permissions et son périmètre.
          </div>
        ) : busy || !detail ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-sm font-bold text-white">{initials(detail.user.full_name)}</span>
                <div>
                  <div className="text-sm font-bold text-slate-900" data-no-translate>{detail.user.full_name}</div>
                  <div className="text-[11px] text-slate-500">
                    Rôle : <strong>{detail.role?.name || detail.user.role_code}</strong> · {detail.effective.length} droit(s) effectif(s)
                    {grants.length + denies.length > 0 && ` · ${grants.length} ajouté(s), ${denies.length} retiré(s)`}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {canPerms && (grants.length > 0 || denies.length > 0) && (
                  <Button size="sm" variant="outline" onClick={() => setValue(new Set(rolePerms))} className="h-9 rounded-xl text-xs">
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Revenir au modèle du rôle
                  </Button>
                )}
                {(canPerms || canScope) && (
                  <Button size="sm" onClick={save} disabled={saving} className="h-9 rounded-xl bg-brand text-xs text-white hover:bg-brand-strong" data-save-perms>
                    {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Enregistrer
                  </Button>
                )}
              </div>
            </div>

            {(isProtected || isSelf) && (
              <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <Lock className="h-4 w-4" /> {isSelf ? "Vous ne pouvez pas modifier vos propres permissions." : "Compte super administrateur protégé : seul un super administrateur peut le modifier."}
              </p>
            )}
            {detail.protected && me?.role_code === "super_admin" && (
              <p className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                <ShieldCheck className="h-4 w-4" /> Le super administrateur conserve toujours l'ensemble des droits ; son périmètre reste transversal.
              </p>
            )}

            {scope && has("users.scope") && (
              <ScopeEditor resources={resources} scope={scope} onChange={(next) => { setScope(next); setScopeDirty(true); }} sites={sites} categories={cats} disabled={!canScope} />
            )}

            {has("users.permissions") && (
              <PermissionTree
                tree={tree}
                value={detail.protected ? new Set(detail.effective) : value}
                onChange={setValue}
                readOnly={!canPerms || detail.protected}
                lockedCodes={new Set(tree.flatMap((m) => m.pages.flatMap((p) => p.actions.map((a) => a.code))).filter((c) => !mine.has(c)))}
                marker={(c) => (rolePerms.has(c) ? (value.has(c) ? "role" : "deny") : value.has(c) ? "grant" : null)}
              />
            )}

            {detail.history?.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                  <History className="h-4 w-4" /> Historique des changements
                </h3>
                <ul className="divide-y divide-slate-100 text-xs">
                  {detail.history.map((h: any) => (
                    <li key={h.id} className="py-2">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-slate-800">{h.summary}</span>
                        <span className="shrink-0 text-slate-400">{fmtDate(h.at)}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">par {h.actor_name || "—"}</div>
                      {h.changes?.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                          {h.changes.slice(0, 6).map((c: any, i: number) => (
                            <li key={i}>
                              <span className="font-mono text-slate-500">{c.field}</span> : <span className="text-red-600 line-through">{c.old}</span> → <span className="text-emerald-700">{c.new}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ScopeEditor({ scope, onChange, sites, categories, disabled, resources = {} }: { scope: any; onChange: (s: any) => void; sites: any[]; categories: string[]; disabled?: boolean; resources?: Record<string, string> }) {
  const toggle = (key: "site_ids" | "categories", v: string) => {
    const cur: string[] = scope[key] || [];
    onChange({ ...scope, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  const Block = ({ title, allKey, listKey, items, allLabel }: any) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700">{title}</span>
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
          <input type="checkbox" disabled={disabled} checked={!!scope[allKey]} onChange={(e) => onChange({ ...scope, [allKey]: e.target.checked })} className="h-3.5 w-3.5 accent-brand" />
          {allLabel}
        </label>
      </div>
      {!scope[allKey] && (
        <div className="flex flex-wrap gap-1.5" data-no-translate>
          {items.map((it: any) => {
            const on = (scope[listKey] || []).includes(it.value);
            return (
              <button
                key={it.value}
                type="button"
                disabled={disabled}
                onClick={() => toggle(listKey, it.value)}
                aria-pressed={on}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${on ? "border-brand bg-brand/10 text-brand" : "border-slate-200 bg-white text-slate-600"}`}
              >
                {it.label}
              </button>
            );
          })}
          {!items.length && <span className="text-[11px] text-slate-400">Aucun élément configuré</span>}
        </div>
      )}
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs md:grid-cols-2" data-scope-editor>
      <Block title="Sites" allKey="all_sites" listKey="site_ids" allLabel="Tous les sites (transversal)" items={sites.map((s) => ({ value: s.id, label: s.name }))} />
      <Block title="Départements (catégories de produits)" allKey="all_categories" listKey="categories" allLabel="Tous les départements" items={categories.map((c) => ({ value: c, label: c }))} />
      {Object.keys(resources).length > 0 && (
        <div className="space-y-2 md:col-span-2" data-transversal-resources>
          <span className="text-xs font-bold text-slate-700">Accès transversal à certaines ressources seulement</span>
          <p className="text-[11px] text-slate-500">Pour ces ressources, l'utilisateur voit les données de tous les sites et de tous les départements (ex. le CRM gère les clients de plusieurs départements). Ses actions restent limitées par ses permissions.</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(resources).map(([k, label]) => {
              const on = (scope.transversal_resources || []).includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  disabled={disabled}
                  aria-pressed={on}
                  data-resource={k}
                  onClick={() => onChange({ ...scope, transversal_resources: on ? scope.transversal_resources.filter((x: string) => x !== k) : [...(scope.transversal_resources || []), k] })}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${on ? "border-brand bg-brand/10 text-brand" : "border-slate-200 bg-white text-slate-600"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-500 md:col-span-2">
        Le périmètre limite les données visibles et utilisables (produits, commandes, clients, caisse, indicateurs). Il s'ajoute aux permissions : aucune permission ne l'élargit.
      </p>
    </div>
  );
}

/* ---------------- Modèles par rôle ---------------- */
function RoleTemplates({ tree, roles, users, mine, onChanged }: { tree: CatalogTree; roles: any[]; users: any[]; mine: Set<string>; onChanged: () => void }) {
  const { has } = useAuth();
  const [code, setCode] = useState(roles.find((r) => r.code !== "super_admin")?.code || roles[0]?.code || "");
  const role = roles.find((r) => r.code === code);
  const [value, setValue] = useState<Set<string>>(new Set(role?.permissions || []));
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => setValue(new Set(role?.permissions || [])), [code, roles]);
  const editable = has("roles.manage") && role && role.code !== "super_admin";
  const count = (c: string) => users.filter((u) => u.role_code === c && u.is_active).length;

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/roles/${role.code}`, { permissions: [...value] });
      toast.success(`Modèle « ${role.name} » enregistré : appliqué à ses ${count(role.code)} utilisateur(s)`);
      onChanged();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Enregistrement impossible"));
    } finally {
      setSaving(false);
    }
  };
  const setStatus = async (active: boolean) => {
    try {
      await api.put(`/roles/${role.code}/status`, { is_active: active });
      toast.success(`Rôle « ${role.name} » ${active ? "réactivé" : "désactivé"}`);
      onChanged();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Action impossible"));
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
        {has("roles.manage") && (
          <Button size="sm" onClick={() => setCreating(true)} className="h-9 w-full rounded-xl bg-brand text-xs text-white hover:bg-brand-strong">
            <Plus className="mr-1.5 h-4 w-4" /> Nouveau rôle
          </Button>
        )}
        <ul className="space-y-1" data-role-list>
          {roles.map((r) => (
            <li key={r.code}>
              <button type="button" onClick={() => setCode(r.code)} className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left ${code === r.code ? "bg-brand text-white" : "hover:bg-slate-50"}`}>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold">{r.name}</span>
                  <span className={`block text-[10px] ${code === r.code ? "text-white/70" : "text-slate-500"}`}>
                    {count(r.code)} utilisateur(s) · {r.permissions?.length || 0} droit(s)
                  </span>
                </span>
                {r.is_active === false && <span className="rounded bg-red-50 px-1.5 text-[9px] font-bold text-red-600">Désactivé</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {role && (
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div>
              <div className="text-sm font-bold text-slate-900">{role.name}</div>
              <div className="text-[11px] text-slate-500">{role.description || "Modèle de permissions appliqué à tous les utilisateurs de ce rôle (hors exceptions individuelles)."}</div>
            </div>
            <div className="flex gap-2">
              {has("roles.delete") && role.code !== "super_admin" && (
                <Button size="sm" variant="outline" onClick={() => setStatus(role.is_active === false)} className="h-9 rounded-xl text-xs">
                  {role.is_active === false ? "Réactiver" : "Désactiver"}
                </Button>
              )}
              {editable && (
                <Button size="sm" onClick={save} disabled={saving} className="h-9 rounded-xl bg-brand text-xs text-white hover:bg-brand-strong" data-save-role>
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Enregistrer le modèle
                </Button>
              )}
            </div>
          </div>
          {role.code === "super_admin" && (
            <p className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              <Lock className="h-4 w-4" /> Rôle protégé : le super administrateur possède toujours tous les droits.
            </p>
          )}
          <PermissionTree
            tree={tree}
            value={value}
            onChange={setValue}
            readOnly={!editable}
            lockedCodes={new Set(tree.flatMap((m) => m.pages.flatMap((p) => p.actions.map((a) => a.code))).filter((c) => !mine.has(c)))}
          />
        </section>
      )}
      {creating && <NewRoleDialog roles={roles} onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); onChanged(); setCode(c); }} />}
    </div>
  );
}

function NewRoleDialog({ roles, onClose, onCreated }: { roles: any[]; onClose: () => void; onCreated: (code: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [from, setFrom] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const perms = roles.find((r) => r.code === from)?.permissions || [];
      const { data } = await api.post("/roles", { name, description, permissions: from === "super_admin" ? [] : perms });
      toast.success(`Rôle « ${data.name} » créé`);
      onCreated(data.code);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Création impossible"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Nouveau rôle (catégorie d'utilisateurs)</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 text-xs">
          <label className="block font-semibold">
            Nom *
            <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2" />
          </label>
          <label className="block font-semibold">
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2" />
          </label>
          <label className="block font-semibold">
            Partir du modèle
            <select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2">
              <option value="">Aucune permission (à cocher ensuite)</option>
              {roles.filter((r) => r.code !== "super_admin").map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving || !name.trim()} className="bg-brand text-white">
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Contrôle de couverture ---------------- */
function Coverage({ tree }: { tree: CatalogTree }) {
  const [cov, setCov] = useState<any>(null);
  const [ui, setUi] = useState<{ files: number; usage: Record<string, string[]> } | null>(null);
  useEffect(() => {
    api.get("/audit/coverage").then(({ data }) => setCov(data)).catch((e) => toast.error(extractErrorMessage(e, "Contrôle indisponible")));
    scanInterface().then(setUi).catch(() => setUi({ files: 0, usage: {} }));
  }, []);
  const catalog = useMemo(() => new Map(tree.flatMap((m) => m.pages.flatMap((p) => p.actions.map((a) => [a.code, a] as const)))), [tree]);
  if (!cov)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  // Inventaire automatique de l'interface comparé au catalogue et aux contrôles du serveur
  const uiCodes = Object.keys(ui?.usage || {});
  const unknownUi = uiCodes.filter((c) => !catalog.has(c));
  const enforced = new Set<string>(cov.enforced || []);
  const unused = [...catalog.keys()].filter((c) => !enforced.has(c) && !uiCodes.includes(c) && !(cov.no_feature || []).includes(c));
  const ok = !cov.unmapped.length && !cov.sensitive_unprotected.length && !unknownUi.length;
  return (
    <div className="space-y-3" data-coverage>
      <div className={`flex items-center gap-3 rounded-2xl border p-4 ${ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
        {ok ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <AlertTriangle className="h-6 w-6 text-red-600" />}
        <div className="text-xs">
          <div className="text-sm font-bold text-slate-900">
            {cov.routes_mapped}/{cov.routes_total} fonctionnalités serveur intégrées au module Permissions
          </div>
          <div className="text-slate-600">
            {ok
              ? "Toutes les actions de l'API sont contrôlées par une permission configurable. Une nouvelle route non déclarée est refusée par défaut et signalée."
              : "Des fonctionnalités ne sont pas encore intégrées : elles sont refusées à tous sauf au super administrateur, et signalées ci-dessous."}
          </div>
        </div>
      </div>
      {ui && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs" data-ui-inventory>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-600">Inventaire automatique de l'interface</h3>
          <p className="text-xs text-slate-600">
            {uiCodes.length} droit(s) contrôlé(s) par les écrans, dans {new Set(Object.values(ui.usage).flat()).size} fichier(s) analysé(s) sur {ui.files} ;{" "}
            {catalog.size} droit(s) au catalogue, {enforced.size} vérifié(s) par le serveur.
          </p>
        </div>
      )}
      {unknownUi.length > 0 && (
        <List
          title="Boutons ou écrans protégés par un droit absent du catalogue (invisibles pour tous sauf le super administrateur)"
          items={unknownUi.map((c) => `${c} — ${ui!.usage[c].join(", ")}`)}
          tone="red"
        />
      )}
      {unused.length > 0 && <List title="Droits du catalogue contrôlés ni par l'interface ni par le serveur" items={unused} tone="slate" />}
      {cov.unmapped.length > 0 && (
        <List title="Fonctionnalités non intégrées (refusées par défaut)" items={cov.unmapped.map((r: any) => `${r.method} ${r.path}`)} tone="red" />
      )}
      {cov.sensitive_unprotected.length > 0 && (
        <List title="Actions stratégiques sans contrôle serveur" items={cov.sensitive_unprotected.map((p: any) => `${p.label} (${p.code})`)} tone="red" />
      )}
      <List title="Actions exécutées dans le navigateur (exports, filtres) : contrôlées par l'interface, données protégées par le serveur" items={cov.ui_only} tone="slate" />
      <List title="Permissions héritées de l'ancien catalogue, sans fonctionnalité correspondante (n'accordent rien)" items={cov.no_feature} tone="slate" />
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: "red" | "slate" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <h3 className={`mb-2 text-xs font-bold uppercase tracking-wider ${tone === "red" ? "text-red-700" : "text-slate-600"}`}>{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {items.map((x) => (
          <span key={x} className={`rounded-md px-2 py-0.5 font-mono text-[10px] ${tone === "red" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>
            {x}
          </span>
        ))}
        {!items.length && <span className="text-[11px] text-slate-400">Aucun</span>}
      </div>
    </div>
  );
}
