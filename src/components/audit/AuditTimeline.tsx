import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  PlusCircle,
  RotateCcw,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { closeTab, openPendingTab } from "@/lib/documentViewer";
import { exportTablePdf } from "@/lib/exportTablePdf";

/*
 * Historique chronologique des événements du journal d'audit (cahier d'un utilisateur ou journal global) :
 * filtres (module, type d'action, résultat, recherche), regroupement par jour, détails consultables
 * (anciennes / nouvelles valeurs, IP, session selon la permission « détails sensibles ») et pagination.
 */

export const ACTION_TYPES: Record<string, string> = {
  login: "Connexion",
  logout: "Déconnexion",
  view: "Consultation",
  create: "Création",
  update: "Modification",
  delete: "Suppression",
  approve: "Approbation",
  reject: "Rejet",
  execute: "Opération",
  permission: "Permissions",
  denied: "Accès refusé",
  security: "Sécurité",
};

const ICONS: Record<string, any> = {
  login: LogIn,
  logout: LogOut,
  view: Eye,
  create: PlusCircle,
  update: Pencil,
  delete: Trash2,
  approve: ThumbsUp,
  reject: ThumbsDown,
  execute: Zap,
  permission: KeyRound,
  denied: Ban,
  security: ShieldAlert,
};

const TONE: Record<string, string> = {
  denied: "bg-red-100 text-red-700",
  security: "bg-amber-100 text-amber-700",
  permission: "bg-violet-100 text-violet-700",
  delete: "bg-rose-100 text-rose-700",
  approve: "bg-emerald-100 text-emerald-700",
  reject: "bg-orange-100 text-orange-700",
  login: "bg-sky-100 text-sky-700",
  logout: "bg-slate-100 text-slate-600",
};

export type AuditFilters = { from?: string; to?: string; user_id?: string; role?: string; site?: string; module?: string; action_type?: string; result?: string; q?: string };

export default function AuditTimeline({ base, modules, showActor = false, compact = false, title }: { base: AuditFilters; modules?: string[]; showActor?: boolean; compact?: boolean; title?: string }) {
  const { has, user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [module, setModule] = useState(base.module || "all");
  const [actionType, setActionType] = useState(base.action_type || "all");
  const [result, setResult] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const params = { ...base, module, action_type: actionType, result, q: q.trim() || undefined };
  // Historique toujours à jour : rechargement automatique toutes les 15 s tant qu'il est affiché
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => setPage(1), [JSON.stringify(base), module, actionType, result, q]);
  useEffect(() => {
    setModule(base.module || "all");
    setActionType(base.action_type || "all");
  }, [base.module, base.action_type]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .get("/audit/logs", { params: { ...params, page, limit: 25 } })
        .then(({ data }) => alive && setData(data))
        .catch((e) => toast.error(extractErrorMessage(e, "Journal indisponible")))
        .finally(() => alive && setLoading(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [JSON.stringify(params), page, tick]);

  // Export PDF de l'historique affiché (tous les événements correspondant aux critères, toutes pages)
  const exportPdf = async () => {
    const tab = openPendingTab(title || "Journal d'audit");
    setExporting(true);
    try {
      const all: any[] = [];
      for (let p = 1; p <= 50; p++) {
        const { data: res } = await api.get("/audit/logs", { params: { ...params, page: p, limit: 200 } });
        all.push(...(res.items || []));
        if (p >= (res.pages || 1)) break;
      }
      const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("fr-FR") : "");
      const period = base.from || base.to ? `du ${fmt(base.from) || "début"} au ${fmt(base.to) || fmt(new Date().toISOString())}` : "toute la période";
      const filters = [
        period,
        module !== "all" ? `module ${module}` : "",
        actionType !== "all" ? ACTION_TYPES[actionType] || actionType : "",
        result === "success" ? "réussites" : result === "failure" ? "échecs / refus" : "",
        q.trim() ? `recherche « ${q.trim()} »` : "",
      ].filter(Boolean);
      const ok = await exportTablePdf({
        title: (title || "Journal d'audit").toUpperCase(),
        fileName: `${(title || "Journal d'audit").replace(/[^\p{L}\p{N}]+/gu, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`,
        columns: [
          { label: "Date et heure", weight: 1.2 },
          ...(showActor ? [{ label: "Utilisateur", weight: 1.3, bold: true }] : []),
          { label: "Module", weight: 1 },
          { label: "Type", weight: 0.9 },
          { label: "Action", weight: 3 },
          { label: "Résultat", weight: 0.8, color: (r: string[]) => (r[r.length - 1] === "Échec" ? ([190, 18, 60] as [number, number, number]) : ([5, 150, 105] as [number, number, number])) },
        ],
        rows: all.map((e) => [
          new Date(e.at).toLocaleString("fr-FR"),
          ...(showActor ? [e.actor_name || e.actor_email || ""] : []),
          e.module || "",
          ACTION_TYPES[e.action_type] || e.action_type || "",
          e.summary || "",
          e.success === false ? "Échec" : "Réussite",
        ]),
        editedBy: user?.full_name || "Utilisateur",
        filtersLabel: filters.join(" · "),
        countLabel: "Événements",
        emptyLabel: "Aucun événement pour ces critères.",
        tab,
      });
      if (!ok) closeTab(tab);
    } catch (e) {
      closeTab(tab);
      toast.error(extractErrorMessage(e, "Export PDF impossible"));
    } finally {
      setExporting(false);
    }
  };

  const items: any[] = data?.items || [];
  const days: Array<[string, any[]]> = [];
  items.forEach((e) => {
    const d = new Date(e.at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const last = days[days.length - 1];
    if (last && last[0] === d) last[1].push(e);
    else days.push([d, [e]]);
  });
  const mods = modules || data?.modules || [];
  const sel = "h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700";

  return (
    <div className="space-y-3" data-audit-timeline>
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans les actions…" aria-label="Rechercher dans les actions" className={`${sel} min-w-[180px] flex-1`} />
        <select value={module} onChange={(e) => setModule(e.target.value)} aria-label="Module" className={sel}>
          <option value="all">Tous les modules</option>
          {mods.map((m: string) => (
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
        <select value={result} onChange={(e) => setResult(e.target.value)} aria-label="Résultat" className={sel}>
          <option value="all">Réussites et échecs</option>
          <option value="success">Réussites</option>
          <option value="failure">Échecs / refus</option>
        </select>
        {(module !== "all" || actionType !== "all" || result !== "all" || q) && (
          <button type="button" onClick={() => { setModule("all"); setActionType("all"); setResult("all"); setQ(""); }} className="inline-flex h-9 items-center gap-1 rounded-xl px-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-100">
            <RotateCcw className="h-3.5 w-3.5" /> Réinitialiser
          </button>
        )}
        {has("audit.export") && (
          <button type="button" onClick={exportPdf} disabled={exporting} data-audit-export-pdf className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-brand hover:bg-slate-50">
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
          </button>
        )}
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : !items.length ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">Aucun événement pour ces critères.</p>
      ) : (
        <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
          {days.map(([day, evs]) => (
            <div key={day}>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{day}</div>
              <ol className="relative space-y-1.5 border-l border-slate-200 pl-4">
                {evs.map((e) => {
                  const Icon = ICONS[e.action_type] || Zap;
                  const isOpen = open === e.id;
                  const failed = e.success === false;
                  const hasMore = e.changes?.length || e.request || e.ip || e.details || e.has_details || e.entity_label;
                  return (
                    <li key={e.id} className="relative" data-audit-event={e.action_type}>
                      <span className={`absolute -left-[27px] top-2 grid h-5 w-5 place-items-center rounded-full ring-4 ring-white ${TONE[e.action_type] || "bg-slate-100 text-slate-600"}`}>
                        <Icon className="h-3 w-3" />
                      </span>
                      <button
                        type="button"
                        onClick={() => hasMore && setOpen(isOpen ? null : e.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${failed ? "border-red-200 bg-red-50/60" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-mono text-[11px] font-semibold text-slate-500">{new Date(e.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                          <span className={`rounded-full px-2 py-px text-[10px] font-bold ${TONE[e.action_type] || "bg-slate-100 text-slate-600"}`}>{ACTION_TYPES[e.action_type] || e.action_type}</span>
                          {e.module && <span className="rounded-full bg-slate-100 px-2 py-px text-[10px] font-semibold text-slate-600">{e.module}</span>}
                          {showActor && <span className="text-[11px] font-bold text-slate-700" data-no-translate>{e.actor_name || e.actor_email || "Inconnu"}</span>}
                          <span className={`ml-auto inline-flex items-center gap-1 text-[10px] font-bold ${failed ? "text-red-600" : "text-emerald-600"}`}>
                            {failed ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                            {failed ? "Échec" : "Réussite"}
                          </span>
                          {hasMore && <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />}
                        </div>
                        <div className={`mt-0.5 text-xs ${compact ? "line-clamp-1" : ""} text-slate-800`}>{e.summary || e.details || e.action}</div>
                      </button>
                      {isOpen && (
                        <div className="mt-1 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700" data-audit-details>
                          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                            <Row k="Date et heure" v={new Date(e.at).toLocaleString("fr-FR")} />
                            <Row k="Utilisateur" v={e.actor_name ? `${e.actor_name} (${e.actor_email || ""})` : e.actor_email} />
                            <Row k="Module" v={e.module} />
                            <Row k="Action" v={e.action} mono />
                            <Row k="Objet" v={[e.entity, e.entity_label].filter(Boolean).join(" · ")} />
                            <Row k="Résultat" v={failed ? `Échec${e.status_code ? ` (${e.status_code})` : ""}` : "Réussite"} />
                            {e.details && <Row k="Détail" v={e.details} />}
                            {e.ip && <Row k="Adresse IP" v={e.ip} mono />}
                            {e.session && <Row k="Session" v={e.session} mono />}
                            {e.app && <Row k="Application" v={e.app === "logistique" ? "Stock & Livraison" : "Gestion commerciale"} />}
                            {e.user_agent && <Row k="Navigateur" v={e.user_agent} />}
                          </dl>
                          {e.changes?.length > 0 && (
                            <div>
                              <div className="mb-1 font-bold text-slate-600">Anciennes → nouvelles valeurs</div>
                              <table className="w-full text-[11px]">
                                <tbody>
                                  {e.changes.map((c: any, i: number) => (
                                    <tr key={i} className="border-t border-slate-200">
                                      <td className="py-1 pr-2 font-mono text-slate-500">{c.field}</td>
                                      <td className="py-1 pr-2 text-red-600 line-through break-all">{c.old}</td>
                                      <td className="py-1 text-emerald-700 break-all">{c.new}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {e.request && (
                            <div>
                              <div className="mb-1 font-bold text-slate-600">Données envoyées</div>
                              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-2 font-mono text-[10px]">{JSON.stringify(e.request, null, 2)}</pre>
                            </div>
                          )}
                          {e.has_details && !e.changes && <p className="text-slate-500">Détails sensibles masqués (permission « Voir les détails sensibles » requise).</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>
            {data.total} événement(s) · page {data.page}/{data.pages}
          </span>
          <div className="flex gap-1">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Page précédente" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} aria-label="Page suivante" className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white disabled:opacity-40">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v?: string; mono?: boolean }) {
  if (!v) return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-slate-500">{k} :</dt>
      <dd className={`min-w-0 break-all font-semibold ${mono ? "font-mono" : ""}`} data-no-translate>
        {v}
      </dd>
    </div>
  );
}
