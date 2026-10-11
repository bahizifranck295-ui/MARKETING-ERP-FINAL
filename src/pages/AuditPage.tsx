import React, { useEffect, useMemo, useState } from "react";
import { MULTI_SITE } from "@/app/edition";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Briefcase,
  CheckCircle2,
  Clock,
  Fingerprint,
  KeyRound,
  Layers,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, fmtDate } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AuditTimeline, { ACTION_TYPES } from "@/components/audit/AuditTimeline";

/*
 * Journal d'audit : suivi des utilisateurs.
 *  - Indicateurs synchronisés avec la période choisie ;
 *  - Cartes des utilisateurs (profils réels) avec recherche et filtres ;
 *  - Cahier d'audit individuel (chronologie complète, détails, pagination) ;
 *  - Catégories d'utilisateurs = rôles de l'administration (même référentiel que les permissions) ;
 *  - Alertes de sécurité (accès refusés, fonctionnalités non intégrées, intégrité du journal).
 * Les événements sont écrits uniquement par le serveur ; l'interface ne peut ni les modifier ni les effacer.
 */

type Tab = "users" | "categories" | "alerts" | "journal";
const PERIODS = [
  { id: "today", label: "Aujourd'hui" },
  { id: "week", label: "Cette semaine" },
  { id: "month", label: "Ce mois" },
  { id: "all", label: "Tout" },
  { id: "custom", label: "Intervalle" },
];

function periodRange(id: string, from: string, to: string) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (id === "today") return { from: start.toISOString(), to: undefined };
  if (id === "week") {
    const d = (start.getDay() + 6) % 7; // lundi
    start.setDate(start.getDate() - d);
    return { from: start.toISOString(), to: undefined };
  }
  if (id === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: undefined };
  if (id === "custom")
    return {
      from: from ? new Date(from + "T00:00:00").toISOString() : undefined,
      to: to ? new Date(to + "T23:59:59.999").toISOString() : undefined,
    };
  return { from: undefined, to: undefined };
}

const initials = (n: string) =>
  (n || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default function AuditPage() {
  const { has } = useAuth();
  const [tab, setTab] = useState<Tab>("users");
  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const range = useMemo(() => periodRange(period, from, to), [period, from, to]);
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // Filtres
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [site, setSite] = useState("all");
  const [status, setStatus] = useState("all");
  const [module, setModule] = useState("all");
  const [actionType, setActionType] = useState("all");
  const [selected, setSelected] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api.get("/roles").then(({ data }) => setRoles(Array.isArray(data) ? data : [])).catch(() => setRoles([]));
    api.get("/integration/sites").then(({ data }) => setSites(Array.isArray(data) ? data : [])).catch(() => setSites([]));
    api.get("/audit/logs", { params: { limit: 1 } }).then(({ data }) => setModules(data?.modules || [])).catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api.get("/audit/stats", { params: range }),
      api.get("/audit/users", { params: { ...range, module, action_type: actionType } }),
    ])
      .then(([s, u]) => {
        if (!alive) return;
        setStats(s.data);
        setUsers(Array.isArray(u.data) ? u.data : []);
      })
      .catch((e) => toast.error(extractErrorMessage(e, "Journal d'audit indisponible")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [range.from, range.to, module, actionType, refreshKey]);

  const activityFilter = module !== "all" || actionType !== "all";
  const filtered = users.filter((u) => {
    const s = q.trim().toLowerCase();
    if (s && ![u.full_name, u.email, u.phone, u.position, u.role_name, u.role_code, u.department].some((x) => String(x || "").toLowerCase().includes(s))) return false;
    if (role !== "all" && u.role_code !== role) return false;
    if (site !== "all" && u.site_id !== site && !(u.site_ids || []).includes(site)) return false;
    if (status === "active" && !u.is_active) return false;
    if (status === "inactive" && u.is_active) return false;
    if (activityFilter && !u.actions_count) return false;
    return true;
  });
  const hasFilters = q || role !== "all" || site !== "all" || status !== "all" || module !== "all" || actionType !== "all";
  const reset = () => {
    setQ("");
    setRole("all");
    setSite("all");
    setStatus("all");
    setModule("all");
    setActionType("all");
  };

  const tabs = [
    { id: "users" as Tab, label: "Utilisateurs", icon: Users, ok: true },
    { id: "categories" as Tab, label: "Catégories d'utilisateurs", icon: Layers, ok: has("roles.read") },
    { id: "alerts" as Tab, label: "Alertes", icon: BellRing, ok: has("audit.alerts"), badge: stats?.open_alerts },
    { id: "journal" as Tab, label: "Journal global", icon: Activity, ok: true },
  ].filter((t) => t.ok);

  const sel = "h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700";

  return (
    <div className="space-y-4">
      <PageHeader title="Journal d'audit" subtitle="Suivi des utilisateurs, cahier d'activité individuel, alertes et sécurité des accès" />

      {/* Période (synchronise indicateurs, cartes et journaux) */}
      <div className="flex flex-wrap items-center gap-2" data-audit-period>
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={`h-8 rounded-xl border px-3 text-xs font-semibold ${period === p.id ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {p.label}
          </button>
        ))}
        {period === "custom" && (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Du" className={sel} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Au" className={sel} />
          </>
        )}
      </div>

      {/* Indicateurs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" data-audit-kpis>
        <Kpi icon={Users} label="Utilisateurs" value={stats?.users_total} tone="text-brand bg-brand/10" />
        <Kpi icon={UserCheck} label="Comptes actifs" value={stats?.users_active} tone="text-emerald-700 bg-emerald-50" />
        <Kpi icon={Clock} label="Connectés (24 h)" value={stats?.users_recent} tone="text-sky-700 bg-sky-50" />
        <Kpi icon={Activity} label="Actions sur la période" value={stats?.actions} tone="text-violet-700 bg-violet-50" />
        <Kpi icon={ShieldAlert} label="Échecs & sécurité" value={stats?.security} tone="text-red-700 bg-red-50" />
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xs" aria-label="Sections du journal">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold ${tab === t.id ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              <Icon className="h-4 w-4" /> {t.label}
              {!!(t as any).badge && <span className="rounded-full bg-red-500 px-1.5 text-[10px] text-white">{(t as any).badge}</span>}
            </button>
          );
        })}
      </nav>

      {tab === "users" && (
        <>
          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs" data-audit-filters>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher un utilisateur : nom, identifiant, téléphone, e-mail, fonction…"
                aria-label="Rechercher un utilisateur"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs focus:bg-white"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Catégorie" className={sel}>
                <option value="all">Toutes les catégories</option>
                {roles.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
              {MULTI_SITE && (
              <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site" className={sel}>
                <option value="all">Tous les sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              )}
              <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Statut du compte" className={sel}>
                <option value="all">Tous les statuts</option>
                <option value="active">Actifs</option>
                <option value="inactive">Inactifs</option>
              </select>
              <select value={module} onChange={(e) => setModule(e.target.value)} aria-label="Module utilisé" className={sel}>
                <option value="all">Tous les modules</option>
                {modules.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select value={actionType} onChange={(e) => setActionType(e.target.value)} aria-label="Type d'action" className={sel}>
                <option value="all">Toutes les actions</option>
                {Object.entries(ACTION_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {hasFilters && (
                <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1 rounded-xl px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100">
                  <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser les filtres
                </button>
              )}
              <span className="ml-auto self-center text-[11px] font-semibold text-slate-500">{filtered.length} utilisateur(s)</span>
            </div>
          </div>

          {loading && !users.length ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : !filtered.length ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-500">Aucun utilisateur ne correspond à ces critères.</p>
          ) : (
            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-60" : ""}`} data-audit-cards>
              {filtered.map((u) => (
                <UserCard key={u.id} u={u} sites={sites} onOpen={() => setSelected(u)} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "categories" && (
        <Categories
          roles={roles}
          users={users}
          onChanged={() => setRefreshKey((k) => k + 1)}
          onUsers={(code) => {
            setRole(code);
            setTab("users");
          }}
          onActivity={(code) => {
            setRole(code);
            setTab("journal");
          }}
        />
      )}

      {tab === "alerts" && <Alerts onChanged={() => setRefreshKey((k) => k + 1)} />}

      {tab === "journal" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-slate-700">Journal global</span>
            {role !== "all" && (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand">
                Catégorie : {roles.find((r) => r.code === role)?.name || role}
                <button type="button" onClick={() => setRole("all")} className="ml-1 font-bold" aria-label="Retirer le filtre de catégorie">
                  ×
                </button>
              </span>
            )}
          </div>
          <AuditTimeline key={`${refreshKey}`} base={{ ...range, role: role !== "all" ? role : undefined, site: site !== "all" ? site : undefined }} modules={modules} showActor title="Journal d'audit" />
        </div>
      )}

      {selected && <Notebook u={selected} range={range} modules={modules} sites={sites} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: any) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-xl font-black tabular-nums text-slate-900">{value ?? "—"}</div>
        <div className="truncate text-[11px] font-semibold text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function Avatar({ u, size = "h-12 w-12 text-sm" }: { u: any; size?: string }) {
  const [broken, setBroken] = useState(false);
  const photo = u.photo_url || u.avatar_url || u.image_url;
  if (photo && !broken) return <img src={photo} alt="" onError={() => setBroken(true)} className={`${size} shrink-0 rounded-full object-cover`} />;
  return <span className={`${size} grid shrink-0 place-items-center rounded-full bg-brand font-bold text-white`}>{initials(u.full_name)}</span>;
}

function UserCard({ u, sites, onOpen }: { u: any; sites: any[]; onOpen: () => void }) {
  const site = u.site_name || sites.find((s) => s.id === u.site_id)?.name;
  return (
    <button type="button" onClick={onOpen} className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:-translate-y-0.5 hover:shadow-md" data-audit-card={u.email}>
      <div className="flex items-start gap-3">
        <Avatar u={u} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-slate-900" data-no-translate>{u.full_name}</div>
          <div className="truncate text-[11px] text-slate-500" data-no-translate>{u.email}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">{u.role_name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{u.is_active ? "Actif" : "Inactif"}</span>
            {u.exceptions > 0 && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">{u.exceptions} exception(s)</span>}
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-1 text-[11px] text-slate-600" data-no-translate>
        {u.position && (
          <div className="flex items-center gap-1.5" data-user-position>
            <Briefcase className="h-3.5 w-3.5 text-slate-400" /> {u.position}
          </div>
        )}
        {u.phone && (
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-slate-400" /> {u.phone}
          </div>
        )}
        {MULTI_SITE && site && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-slate-400" /> {site}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-slate-400" /> Dernière connexion : {u.last_login_at ? fmtDate(u.last_login_at) : "jamais"}
        </div>
      </dl>
      <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
        <span className="font-semibold text-slate-700">{u.actions_count} action(s) sur la période</span>
        {u.denied_count > 0 ? (
          <span className="inline-flex items-center gap-1 font-bold text-red-600">
            <ShieldAlert className="h-3.5 w-3.5" /> {u.denied_count} refus
          </span>
        ) : (
          <span className="font-semibold text-brand opacity-0 transition group-hover:opacity-100">Ouvrir le cahier →</span>
        )}
      </div>
    </button>
  );
}

function Notebook({ u, range, modules, sites, onClose }: { u: any; range: any; modules: string[]; sites: any[]; onClose: () => void }) {
  const { has } = useAuth();
  const site = u.site_name || sites.find((s) => s.id === u.site_id)?.name;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-audit-notebook>
        <DialogHeader>
          <DialogTitle className="text-base">Cahier d'audit</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <Avatar u={u} size="h-14 w-14 text-base" />
          <div className="min-w-0 flex-1 space-y-1 text-xs">
            <div className="text-base font-bold text-slate-900" data-no-translate>{u.full_name}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600" data-no-translate>
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> {u.email}
              </span>
              {u.position && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="h-3.5 w-3.5" /> {u.position}
                </span>
              )}
              {u.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> {u.phone}
                </span>
              )}
              {MULTI_SITE && site && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {site}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">{u.role_name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{u.is_active ? "Actif" : "Inactif"}</span>
              {MULTI_SITE && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Sites : {u.sites}</span>}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600" data-no-translate>Départements : {u.departments}</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Dernière connexion : {u.last_login_at ? fmtDate(u.last_login_at) : "jamais"} · Dernière activité : {u.last_activity_at ? fmtDate(u.last_activity_at) : "—"}
            </div>
          </div>
          {has("users.permissions") && u.role_code !== "super_admin" && (
            <Link to={`/admin/roles?user=${u.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-brand">
              <KeyRound className="h-4 w-4" /> Permissions
            </Link>
          )}
        </div>
        <AuditTimeline base={{ ...range, user_id: u.id }} modules={modules} compact title={`Cahier d'audit — ${u.full_name}`} />
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Catégories d'utilisateurs (= rôles de l'administration) ---------------- */
function Categories({ roles, users, onChanged, onUsers, onActivity }: { roles: any[]; users: any[]; onChanged: () => void; onUsers: (code: string) => void; onActivity: (code: string) => void }) {
  const { has } = useAuth();
  const [editing, setEditing] = useState<any>(null);
  const setStatus = async (r: any, active: boolean) => {
    try {
      await api.put(`/roles/${r.code}/status`, { is_active: active });
      toast.success(`Catégorie « ${r.name} » ${active ? "réactivée" : "désactivée"}`);
      onChanged();
    } catch (e) {
      toast.error(extractErrorMessage(e, "Action impossible"));
    }
  };
  return (
    <div className="space-y-3" data-audit-categories>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Les catégories d'utilisateurs sont les rôles de l'administration : un seul référentiel, partagé avec le module Permissions.</p>
        {has("roles.manage") && (
          <Button size="sm" onClick={() => setEditing({})} className="h-9 rounded-xl bg-brand text-xs text-white hover:bg-brand-strong">
            <Plus className="mr-1.5 h-4 w-4" /> Nouvelle catégorie
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((r) => {
          const members = users.filter((u) => u.role_code === r.code);
          const actions = members.reduce((t, u) => t + (u.actions_count || 0), 0);
          return (
            <div key={r.code} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900">{r.name}</div>
                  <div className="line-clamp-2 text-[11px] text-slate-500">{r.description || "—"}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${r.is_active === false ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{r.is_active === false ? "Désactivée" : "Active"}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-base font-black text-slate-900">{members.length}</div>
                  utilisateur(s)
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-base font-black text-slate-900">{r.permissions?.length || 0}</div>
                  droit(s)
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-base font-black text-slate-900">{actions}</div>
                  action(s)
                </div>
              </div>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                <Button size="sm" variant="outline" onClick={() => onUsers(r.code)} className="h-8 rounded-lg text-[11px]">
                  <Users className="mr-1 h-3.5 w-3.5" /> Utilisateurs
                </Button>
                <Button size="sm" variant="outline" onClick={() => onActivity(r.code)} className="h-8 rounded-lg text-[11px]">
                  <Activity className="mr-1 h-3.5 w-3.5" /> Activités
                </Button>
                {has("roles.manage") && r.code !== "super_admin" && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(r)} className="h-8 rounded-lg text-[11px]" aria-label={`Modifier ${r.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {has("roles.delete") && r.code !== "super_admin" && (
                  <Button size="sm" variant="outline" onClick={() => setStatus(r, r.is_active === false)} className="h-8 rounded-lg text-[11px]">
                    {r.is_active === false ? "Réactiver" : "Désactiver"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {editing && <CategoryDialog role={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </div>
  );
}

function CategoryDialog({ role, onClose, onSaved }: { role: any; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(role.name || "");
  const [description, setDescription] = useState(role.description || "");
  const [saving, setSaving] = useState(false);
  const isNew = !role.code;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isNew) await api.post("/roles", { name, description, permissions: [] });
      else await api.put(`/roles/${role.code}`, { name, description });
      toast.success(isNew ? `Catégorie « ${name} » créée (aucun droit : à configurer dans Rôles & Permissions)` : "Catégorie modifiée");
      onSaved();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Enregistrement impossible"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{isNew ? "Nouvelle catégorie d'utilisateurs" : `Modifier « ${role.name} »`}</DialogTitle>
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
          {isNew && <p className="text-[11px] text-slate-500">Une nouvelle catégorie ne reçoit aucun droit automatiquement : ses permissions se configurent dans Rôles & Permissions.</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving || !name.trim()} className="bg-brand text-white">
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Alertes de sécurité ---------------- */
function Alerts({ onChanged }: { onChanged: () => void }) {
  const [alerts, setAlerts] = useState<any[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [integrity, setIntegrity] = useState<any>(null);
  const load = () => api.get("/audit/alerts").then(({ data }) => setAlerts(Array.isArray(data) ? data : [])).catch((e) => toast.error(extractErrorMessage(e, "Alertes indisponibles")));
  useEffect(() => {
    load();
  }, []);
  const ack = async (a: any) => {
    try {
      await api.post(`/audit/alerts/${a.id}/ack`, {});
      toast.success("Alerte marquée comme traitée");
      load();
      onChanged();
    } catch (e) {
      toast.error(extractErrorMessage(e, "Action impossible"));
    }
  };
  const verify = async () => {
    try {
      const { data } = await api.get("/audit/integrity");
      setIntegrity(data);
      if (!data.ok) load();
    } catch (e) {
      toast.error(extractErrorMessage(e, "Vérification impossible"));
    }
  };
  if (!alerts)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  const list = alerts.filter((a) => showDone || !a.acked_at);
  const TYPE: Record<string, string> = { access_denied: "Accès refusé", coverage: "Permissions", integrity: "Intégrité du journal" };
  return (
    <div className="space-y-3" data-audit-alerts>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={verify} className="h-9 rounded-xl text-xs">
          <Fingerprint className="mr-1.5 h-4 w-4" /> Vérifier l'intégrité du journal
        </Button>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="h-3.5 w-3.5" /> Afficher les alertes traitées
        </label>
        {integrity && (
          <span className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold ${integrity.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`} data-integrity={integrity.ok ? "ok" : "broken"}>
            {integrity.ok ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {integrity.ok ? `Journal intact : ${integrity.sealed} entrée(s) scellée(s)` : `${integrity.broken.length} entrée(s) altérée(s) détectée(s)`}
          </span>
        )}
      </div>
      {!list.length ? (
        <p className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-xs text-slate-500">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Aucune alerte en attente.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => (
            <li key={a.id} className={`flex flex-wrap items-start gap-3 rounded-2xl border bg-white p-3.5 shadow-xs ${a.acked_at ? "border-slate-200 opacity-70" : a.severity === "high" ? "border-red-200" : "border-amber-200"}`} data-alert={a.type}>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${a.type === "access_denied" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"}`}>
                {a.type === "access_denied" ? <ShieldAlert className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{TYPE[a.type] || a.type}</span>
                  {a.count > 1 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">× {a.count}</span>}
                  <span className="text-[11px] text-slate-400">{fmtDate(a.last_at || a.at)}</span>
                </div>
                <div className="mt-1 font-semibold text-slate-800">{a.message}</div>
                {a.path && <div className="mt-0.5 font-mono text-[10px] text-slate-500">{a.path}</div>}
                {a.acked_at && <div className="mt-0.5 text-[11px] text-emerald-700">Traitée par {a.acked_by} · {fmtDate(a.acked_at)}</div>}
              </div>
              {!a.acked_at && (
                <Button size="sm" variant="outline" onClick={() => ack(a)} className="h-8 rounded-lg text-[11px]">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Marquer comme traitée
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
