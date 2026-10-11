import React, { useMemo, useState } from "react";
import { ChevronRight, Search, ShieldAlert } from "lucide-react";

/*
 * Arbre des permissions (module › page › action) construit à partir du catalogue servi par l'API.
 * Cases à cocher individuelles, sélection par page / module, recherche, filtre par application.
 * Cocher une action coche aussi la page dont elle dépend ; décocher une page décoche ses actions.
 */

export type PermDef = {
  code: string;
  label: string;
  module: string;
  page: string;
  kind: string;
  app: "commercial" | "logistique";
  sensitive?: boolean;
  requires?: string[];
  ui_only?: boolean;
};
export type CatalogTree = Array<{ module: string; app: string; pages: Array<{ page: string; actions: PermDef[] }> }>;

const KIND_LABEL: Record<string, string> = {
  view: "Consulter",
  create: "Créer",
  update: "Modifier",
  delete: "Supprimer",
  approve: "Approuver",
  reject: "Rejeter",
  filter: "Filtrer / trier",
  export: "Exporter",
  print: "Imprimer",
  execute: "Exécuter",
  manage: "Gérer",
};

export const APP_LABEL: Record<string, string> = { commercial: "Gestion commerciale", logistique: "Stock & Livraison" };

type Marker = "role" | "grant" | "deny" | null;

export default function PermissionTree({
  tree,
  value,
  onChange,
  marker,
  lockedCodes,
  readOnly,
}: {
  tree: CatalogTree;
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Origine d'un droit (rôle, exception ajoutée, exception retirée) */
  marker?: (code: string) => Marker;
  /** Codes que l'administrateur ne peut pas accorder (il ne les possède pas) */
  lockedCodes?: Set<string>;
  readOnly?: boolean;
}) {
  const [q, setQ] = useState("");
  const [app, setApp] = useState<"all" | "commercial" | "logistique">("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const all = useMemo(() => tree.flatMap((m) => m.pages.flatMap((p) => p.actions)), [tree]);
  const byCode = useMemo(() => new Map(all.map((a) => [a.code, a])), [all]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tree
      .filter((m) => app === "all" || m.app === app)
      .map((m) => ({
        ...m,
        pages: m.pages
          .map((p) => ({
            ...p,
            actions: p.actions.filter((a) => !s || [a.label, a.code, p.page, m.module].some((x) => x.toLowerCase().includes(s))),
          }))
          .filter((p) => p.actions.length),
      }))
      .filter((m) => m.pages.length);
  }, [tree, q, app]);

  const editable = (code: string) => !readOnly && !(lockedCodes?.has(code) && !value.has(code));

  const setMany = (codes: string[], on: boolean) => {
    const next = new Set(value);
    for (const c of codes) {
      if (on) {
        if (!editable(c)) continue;
        next.add(c);
        // dépendances (la page avant l'action)
        for (const r of byCode.get(c)?.requires || []) if (editable(r) || next.has(r)) next.add(r);
      } else {
        if (readOnly) continue;
        next.delete(c);
        // les actions qui dépendent de ce droit ne sont plus effectives : on les décoche aussi
        for (const a of all) if ((a.requires || []).includes(c)) next.delete(a.code);
      }
    }
    onChange(next);
  };

  const state = (codes: string[]) => {
    const n = codes.filter((c) => value.has(c)).length;
    return n === 0 ? "none" : n === codes.length ? "all" : "some";
  };

  const visibleCodes = visible.flatMap((m) => m.pages.flatMap((p) => p.actions.map((a) => a.code)));

  return (
    <div className="space-y-3" data-perm-tree>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une fonctionnalité…"
            aria-label="Rechercher une fonctionnalité"
            className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs"
          />
        </div>
        <select value={app} onChange={(e) => setApp(e.target.value as any)} aria-label="Application" className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold">
          <option value="all">Les deux applications</option>
          <option value="commercial">Gestion commerciale</option>
          <option value="logistique">Stock & Livraison</option>
        </select>
        {!readOnly && (
          <>
            <button type="button" onClick={() => setMany(visibleCodes, true)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-brand hover:bg-slate-50">
              Tout cocher
            </button>
            <button type="button" onClick={() => setMany(visibleCodes, false)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">
              Tout décocher
            </button>
          </>
        )}
      </div>

      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {visible.map((m) => {
          const key = `${m.app}:${m.module}`;
          const codes = m.pages.flatMap((p) => p.actions.map((a) => a.code));
          const st = state(codes);
          const isOpen = open[key] ?? !!q;
          return (
            <div key={key} data-perm-module={m.module}>
              <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50/70">
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))} aria-expanded={isOpen} className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100">
                  <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </button>
                <TriBox state={st} disabled={readOnly} label={`Tout le module ${m.module}`} onToggle={() => setMany(codes, st !== "all")} />
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="truncate text-sm font-bold text-slate-900">{m.module}</span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{APP_LABEL[m.app]}</span>
                </button>
                <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">
                  {codes.filter((c) => value.has(c)).length}/{codes.length}
                </span>
              </div>
              {isOpen && (
                <div className="space-y-2 bg-slate-50/50 px-3 pb-3 pt-1">
                  {m.pages.map((p) => {
                    const pc = p.actions.map((a) => a.code);
                    const ps = state(pc);
                    return (
                      <div key={p.page} className="rounded-xl border border-slate-200 bg-white">
                        <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                          <TriBox state={ps} disabled={readOnly} label={`Toute la page ${p.page}`} onToggle={() => setMany(pc, ps !== "all")} />
                          <span className="text-xs font-bold text-slate-700">{p.page}</span>
                        </div>
                        <ul className="grid grid-cols-1 gap-x-4 px-3 py-1.5 md:grid-cols-2">
                          {p.actions.map((a) => {
                            const on = value.has(a.code);
                            const mk = marker?.(a.code) || null;
                            const locked = !editable(a.code);
                            const missing = on ? (a.requires || []).filter((r) => !value.has(r)) : [];
                            return (
                              <li key={a.code} className="flex items-start gap-2 py-1.5" data-perm={a.code}>
                                <input
                                  type="checkbox"
                                  checked={on}
                                  disabled={locked}
                                  onChange={() => setMany([a.code], !on)}
                                  aria-label={a.label}
                                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand disabled:opacity-40"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-medium text-slate-800">{a.label}</div>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                    <span className="rounded bg-slate-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-slate-500">{KIND_LABEL[a.kind] || a.kind}</span>
                                    {a.sensitive && (
                                      <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-700">
                                        <ShieldAlert className="h-2.5 w-2.5" /> Sensible
                                      </span>
                                    )}
                                    {mk === "grant" && <span className="rounded bg-emerald-50 px-1.5 py-px text-[9px] font-bold text-emerald-700">+ Exception ajoutée</span>}
                                    {mk === "deny" && <span className="rounded bg-red-50 px-1.5 py-px text-[9px] font-bold text-red-700">− Exception retirée</span>}
                                    {mk === "role" && on && <span className="rounded bg-sky-50 px-1.5 py-px text-[9px] font-semibold text-sky-700">Rôle</span>}
                                    {locked && !on && !readOnly && <span className="text-[9px] text-slate-400">Vous ne possédez pas ce droit</span>}
                                    {missing.length > 0 && <span className="text-[9px] font-semibold text-amber-700">Nécessite « {byCode.get(missing[0])?.label} »</span>}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {!visible.length && <p className="p-6 text-center text-xs text-slate-500">Aucune fonctionnalité ne correspond.</p>}
      </div>
    </div>
  );
}

function TriBox({ state, onToggle, disabled, label }: { state: "all" | "some" | "none"; onToggle: () => void; disabled?: boolean; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={state === "all"}
      ref={(el) => {
        if (el) el.indeterminate = state === "some";
      }}
      disabled={disabled}
      onChange={onToggle}
      className="h-4 w-4 shrink-0 rounded border-slate-300 accent-brand"
    />
  );
}
