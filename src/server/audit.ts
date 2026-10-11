import { v4 as uuidv4 } from "uuid";
import { db, type User } from "./db";
import {
  PERM_BY_CODE,
  canAny,
  can,
  catalogTree,
  effectivePermissions,
  ensurePermissionModel,
  isSuperAdmin,
  permissionCoverage,
  roleOf,
  ruleFor,
  scopeOf,
  ALL_CODES,
} from "./permissions";

/*
 * Journal d'audit et sécurité (côté serveur uniquement : l'interface ne peut ni écrire ni effacer).
 *
 *  - Chaque requête qui modifie des données est journalisée automatiquement après sa réponse :
 *    utilisateur, module, action, objet, résultat (réussite / échec), IP, session, et pour les
 *    modifications les anciennes et nouvelles valeurs des champs changés.
 *  - Les consultations des pages principales sont journalisées (au plus une fois par 10 min et par module).
 *  - Connexions, échecs de connexion, déconnexions, refus d'accès et changements de permissions sont
 *    des événements de sécurité ; un refus d'accès déclenche une alerte pour les administrateurs autorisés.
 *  - Les entrées sont chaînées par empreinte (chaque entrée scelle la précédente) : toute modification
 *    ou suppression d'une entrée est détectée par la vérification d'intégrité.
 */

export type ActionType = "login" | "logout" | "view" | "create" | "update" | "delete" | "approve" | "reject" | "execute" | "permission" | "denied" | "security";

export const ACTION_TYPES: Record<ActionType, string> = {
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

/* ---------------- Empreinte chaînée (sans dépendance : fonctionne aussi dans l'aperçu navigateur) ---------------- */
function fingerprint(str: string) {
  let h1 = 0xdeadbeef ^ 0x9e37,
    h2 = 0x41c6ce57 ^ 0x9e37;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

const SEALED_FIELDS = ["id", "at", "actor_id", "action", "action_type", "module", "entity_id", "summary", "success", "changes", "prev_hash"];
const sealOf = (e: any) => fingerprint(JSON.stringify(SEALED_FIELDS.map((k) => e[k] ?? null)));

function lastHash() {
  for (let i = db.audit_logs.length - 1; i >= 0; i--) {
    const h = (db.audit_logs[i] as any).hash;
    if (h) return h as string;
  }
  return "GENESIS";
}

export function recordAudit(e: Record<string, any>) {
  const entry: any = {
    id: uuidv4(),
    at: new Date().toISOString(),
    success: true,
    ...e,
  };
  // Compatibilité avec les anciens champs (user_id / user_name / details)
  entry.user_id = entry.user_id || entry.actor_id;
  entry.user_name = entry.user_name || entry.actor_name;
  entry.prev_hash = lastHash();
  entry.hash = sealOf(entry);
  db.audit_logs.push(entry);
  return entry;
}

/** Complète l'entrée automatique de la requête en cours (résumé métier plus précis) */
export function auditNote(req: any, info: Record<string, any>) {
  req._auditNote = { ...(req._auditNote || {}), ...info };
}

/* ---------------- Contexte de la requête ---------------- */
const ipOf = (req: any) =>
  String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || req.socket?.remoteAddress || "aperçu navigateur";
const sessionOf = (req: any) => {
  const auth = String(req.headers?.authorization || "");
  return auth.startsWith("Bearer ") ? "S-" + fingerprint(auth.slice(7)).slice(0, 8) : null;
};
const actorFields = (u?: User | null) =>
  u ? { actor_id: u.id, actor_name: u.full_name, actor_email: u.email, role_code: u.role_code } : {};

/* ---------------- Objets suivis : anciennes / nouvelles valeurs ---------------- */
const ENTITY_SOURCES: Array<{ re: RegExp; entity: string; find: (id: string) => any }> = [
  { re: /^\/users\/([^/]+)(\/permissions)?$/, entity: "Utilisateur", find: (id) => db.users.find((u) => u.id === id) },
  { re: /^\/roles\/([^/]+)(\/status)?$/, entity: "Rôle", find: (code) => (db.roles as any[]).find((r) => r.code === code) },
  { re: /^\/clients\/([^/]+)(\/(adjust-credit-limit|photo|document))?$/, entity: "Client", find: (id) => db.clients.find((c) => c.id === id) },
  { re: /^\/products\/([^/]+)(\/adjust)?$/, entity: "Produit", find: (id) => db.products.find((p) => p.id === id) },
  { re: /^\/integration\/catalog\/([^/]+)\/availability$/, entity: "Produit", find: (id) => db.products.find((p) => p.id === id) },
  { re: /^\/orders\/([^/]+)\/(approve|reject)$/, entity: "Commande", find: (id) => db.orders.find((o) => o.id === id) },
  { re: /^\/delivery\/orders\/([^/]+)\/advance$/, entity: "Commande", find: (id) => db.orders.find((o) => o.id === id) },
  { re: /^\/stock\/sites\/([^/]+)$/, entity: "Site", find: (id) => ((db as any).sites || []).find((s: any) => s.id === id) },
  { re: /^\/stock\/depots\/([^/]+)$/, entity: "Dépôt", find: (id) => db.warehouses.find((w) => w.id === id) },
  { re: /^\/cash\/rates$/, entity: "Taux de change", find: () => (db as any).rates_config },
  { re: /^\/cash\/sessions\/([^/]+)\/close$/, entity: "Session de caisse", find: (id) => db.cash_sessions.find((s) => s.id === id) },
];

const IGNORED_DIFF = new Set(["updated_at", "hash", "prev_hash"]);
const SECRET_FIELDS = new Set(["password", "password_hash", "token", "access_token", "refresh_token"]);
const BULKY = (v: any) => typeof v === "string" && (v.startsWith("data:") || v.length > 400);

function snapshot(obj: any) {
  if (!obj) return null;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return null;
  }
}

const show = (v: any) => {
  if (v === undefined || v === null || v === "") return "—";
  if (BULKY(v)) return "(contenu volumineux)";
  if (typeof v === "object") {
    const s = JSON.stringify(v);
    return s.length > 160 ? s.slice(0, 157) + "…" : s;
  }
  return String(v);
};

export function diffOf(before: any, after: any) {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: Array<{ field: string; old: string; new: string }> = [];
  keys.forEach((k) => {
    if (IGNORED_DIFF.has(k)) return;
    const a = JSON.stringify(before[k] ?? null);
    const b = JSON.stringify(after[k] ?? null);
    if (a === b) return;
    if (SECRET_FIELDS.has(k)) out.push({ field: k === "password_hash" ? "mot de passe" : k, old: "••••", new: "•••• (modifié)" });
    else out.push({ field: k, old: show(before[k]), new: show(after[k]) });
  });
  return out.slice(0, 40);
}

function sanitize(body: any) {
  if (!body || typeof body !== "object") return undefined;
  const out: any = {};
  Object.entries(body).forEach(([k, v]) => {
    if (SECRET_FIELDS.has(k)) out[k] = "••••";
    else if (BULKY(v)) out[k] = "(contenu volumineux)";
    else if (Array.isArray(v)) out[k] = v.length > 20 ? `${v.length} élément(s)` : v;
    else out[k] = v;
  });
  const s = JSON.stringify(out);
  return s.length > 1500 ? JSON.parse(JSON.stringify({ résumé: s.slice(0, 1500) + "…" })) : out;
}

const labelOf = (x: any) => (x ? x.full_name || x.name || x.code || x.label || x.id : undefined);

/* ---------------- Classement des actions ---------------- */
function actionTypeOf(method: string, path: string): ActionType {
  if (path.startsWith("/auth/logout")) return "logout";
  if (/\/permissions$/.test(path) || path.startsWith("/roles")) return method === "GET" ? "view" : "permission";
  if (/\/approve$|\/claim-bonus$/.test(path)) return "approve";
  if (/\/reject$|\/reverse$/.test(path)) return "reject";
  if (method === "GET") return "view";
  if (method === "DELETE") return "delete";
  if (/\/(open|close|sync|advance|adjust|transfers|load|return|toggle-record|payments)$/.test(path) || path === "/stock/transfers") return "execute";
  if (method === "PUT" || method === "PATCH") return "update";
  return "create";
}

const MODULE_BY_PREFIX: Array<[RegExp, string]> = [
  [/^\/auth/, "Authentification"],
  [/^\/(users|roles)/, "Administration"],
  [/^\/audit/, "Journal d'audit"],
  [/^\/boutique/, "Boutique"],
  [/^\/(orders)/, "Commandes"],
  [/^\/clients/, "CRM Clients"],
  [/^\/cash/, "Caisse"],
  [/^\/credits/, "Crédits"],
  [/^\/accounting/, "Comptabilité"],
  [/^\/objectives/, "Objectifs"],
  [/^\/(dashboard)/, "Tableau de bord"],
  [/^\/reports\/stock-state/, "Stock"],
  [/^\/reports/, "Rapports"],
  [/^\/(stock|warehouses|products)/, "Stock"],
  [/^\/delivery/, "Livraison"],
  [/^\/integration\/(catalog|categories)/, "Boutique"],
  [/^\/integration/, "Intégration"],
  [/^\/notifications/, "Notifications"],
];

function moduleOf(path: string, codes?: string[]) {
  const code = (codes || []).find((c) => PERM_BY_CODE.has(c));
  if (code) return PERM_BY_CODE.get(code)!.module;
  return MODULE_BY_PREFIX.find(([re]) => re.test(path))?.[1] || "Système";
}

// Consultations journalisées (pages principales), une fois par 10 min / utilisateur / module
const VIEW_ROUTES: Array<[RegExp, string]> = [
  [/^\/dashboard$/, "Tableau de bord"],
  [/^\/boutique\/products$/, "Catalogue de la boutique"],
  [/^\/orders$/, "Liste des commandes"],
  [/^\/clients$/, "Liste des clients"],
  [/^\/clients\/[^/]+\/account$/, "Compte client"],
  [/^\/cash\/active-session$/, "Caisse"],
  [/^\/credits\/debts$/, "Crédits & créances"],
  [/^\/accounting\/movements$/, "Écritures comptables"],
  [/^\/reports\/summary$/, "Rapports"],
  [/^\/objectives$/, "Objectifs"],
  [/^\/users$/, "Utilisateurs"],
  [/^\/users\/[^/]+\/permissions$/, "Permissions d'un utilisateur"],
  [/^\/audit\/users$/, "Journal d'audit"],
  [/^\/audit\/logs$/, "Cahier d'audit"],
  [/^\/stock\/depots$/, "Stock"],
  [/^\/delivery\/orders$/, "Livraisons"],
];
const lastView = new Map<string, number>();

/* ---------------- Alertes de sécurité ---------------- */
function alerts(): any[] {
  if (!(db as any).audit_alerts) (db as any).audit_alerts = [];
  return (db as any).audit_alerts;
}

function notifyAdmins(title: string, message: string) {
  db.notifications.push({ id: uuidv4(), title, message, type: "security", read: false, is_read: false, at: new Date().toISOString(), perm: "audit.alerts" } as any);
}

export function raiseAlert(a: { type: string; severity: "high" | "medium" | "info"; key: string; message: string; user?: User | null; path?: string; required?: string[] }) {
  const list = alerts();
  const open = list.find((x) => x.key === a.key && !x.acked_at);
  const now = new Date().toISOString();
  if (open) {
    open.count = (open.count || 1) + 1;
    open.last_at = now;
    return open;
  }
  const alert = {
    id: uuidv4(),
    type: a.type,
    severity: a.severity,
    key: a.key,
    message: a.message,
    path: a.path,
    required: a.required,
    user_id: a.user?.id,
    user_name: a.user?.full_name,
    at: now,
    last_at: now,
    count: 1,
  };
  list.unshift(alert);
  if (list.length > 500) list.length = 500;
  notifyAdmins(a.type === "access_denied" ? "Alerte sécurité : accès refusé" : "Alerte permissions", a.message);
  return alert;
}

let coverageChecked = false;
function checkCoverage(router: any) {
  if (coverageChecked) return;
  coverageChecked = true;
  const cov = permissionCoverage(router);
  cov.unmapped.forEach((r) =>
    raiseAlert({
      type: "coverage",
      severity: "high",
      key: `coverage:${r.method} ${r.path}`,
      message: `Fonctionnalité non intégrée au module Permissions : ${r.method} ${r.path} (refusée à tous sauf au super administrateur)`,
      path: r.path,
    })
  );
  cov.sensitive_unprotected.forEach((p) =>
    raiseAlert({ type: "coverage", severity: "high", key: `sensitive:${p.code}`, message: `Action stratégique sans contrôle serveur : ${p.label} (${p.code})` })
  );
}

/* ---------------- Middleware de sécurité : garde des permissions + journalisation ---------------- */
export function installSecurity(router: any, resolveUser: (req: any) => User | null) {
  router.use((req: any, res: any, next: any) => {
    ensurePermissionModel();
    checkCoverage(router);
    const user = resolveUser(req);
    req._actor = user;
    const rule = ruleFor(req.method, req.path);
    const startedAt = Date.now();

    // Instantané avant modification (anciennes valeurs)
    let source: any = null;
    let entityId: string | null = null;
    let before: any = null;
    if (req.method !== "GET") {
      for (const s of ENTITY_SOURCES) {
        const m = req.path.match(s.re);
        if (m) {
          source = s;
          entityId = m[1] ? decodeURIComponent(m[1]) : null;
          before = snapshot(s.find(entityId || ""));
          break;
        }
      }
    }

    // Journalisation après la réponse (une seule fois)
    let logged = false;
    const finish = (raw: any) => {
      if (logged) return;
      logged = true;
      // res.json() d'Express appelle res.send() avec le texte JSON : on retrouve l'objet
      let body = raw;
      if (typeof raw === "string") {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }
      try {
        afterResponse(req, res, body, { user, rule, source, entityId, before, startedAt });
      } catch (e) {
        console.error("audit", e);
      }
    };
    for (const fn of ["json", "send"]) {
      const orig = res[fn]?.bind(res);
      if (!orig) continue;
      res[fn] = (body: any) => {
        const out = orig(body);
        finish(body);
        return out;
      };
    }

    // --- Garde des permissions ---
    if (rule?.rule === "public") return next();
    if (!user) return next(); // la route répond 401 (authentification obligatoire)
    if (rule?.rule === "authenticated") return next();
    if (!rule) {
      if (isSuperAdmin(user)) return next();
      return deny(req, res, user, [], "Fonctionnalité non intégrée au module Permissions");
    }
    const codes = rule.rule as string[];
    if (canAny(user, codes)) return next();
    return deny(req, res, user, codes);
  });
}

function deny(req: any, res: any, user: User, required: string[], reason?: string) {
  const labels = required.map((c) => PERM_BY_CODE.get(c)?.label || c);
  const detail = reason ? `Accès refusé : ${reason}` : `Accès refusé : permission requise « ${labels[0] || "?"} »${labels.length > 1 ? ` (ou ${labels.length - 1} autre(s))` : ""}`;
  req._denied = { required, reason };
  raiseAlert({
    type: "access_denied",
    severity: "high",
    key: `denied:${user.id}:${req.method} ${ruleFor(req.method, req.path)?.pattern || req.path}`,
    message: `${user.full_name} a tenté « ${labels[0] || req.method + " " + req.path} » sans autorisation (${moduleOf(req.path, required)})`,
    user,
    path: `${req.method} ${req.path}`,
    required,
  });
  return res.status(403).json({ detail, code: "PERMISSION_DENIED", required });
}

function afterResponse(req: any, res: any, body: any, ctx: any) {
  const { user, rule, source, entityId, before } = ctx;
  const path: string = req.path;
  const method: string = req.method;
  const status = Number(res.statusCode) || 200;
  const ok = status < 400;
  if (path === "/auth/login" || path === "/audit/access-attempt") return; // journalisés par leur route
  const codes: string[] = Array.isArray(rule?.rule) ? rule.rule : [];
  const module = moduleOf(path, codes);
  const base = {
    ...actorFields(user),
    module,
    ip: ipOf(req),
    session: sessionOf(req),
    user_agent: String(req.headers?.["user-agent"] || "").slice(0, 160) || undefined,
    app: req.headers?.["x-erp-app"] || undefined,
    method,
    path,
    status_code: status,
    success: ok,
  };

  // Refus décidé par la route elle-même (permission ou périmètre vérifiés dans le code)
  if (!req._denied && status === 403 && body && typeof body === "object" && (body.code === "PERMISSION_DENIED" || body.code === "SCOPE_DENIED") && user) {
    req._denied = { required: body.required || [], reason: body.detail };
    raiseAlert({
      type: "access_denied",
      severity: body.code === "SCOPE_DENIED" ? "medium" : "high",
      key: `denied:${user.id}:${method} ${rule?.pattern || path}:${body.code}`,
      message: `${user.full_name} : ${body.detail}`,
      user,
      path: `${method} ${path}`,
    });
  }
  // Refus d'accès : toujours journalisé (événement de sécurité)
  if (req._denied) {
    const labels = (req._denied.required || []).map((c: string) => PERM_BY_CODE.get(c)?.label || c);
    recordAudit({
      ...base,
      action: "access.denied",
      action_type: "denied",
      security: true,
      success: false,
      summary: `Tentative refusée : ${labels[0] || req._denied.reason || path}`,
      details: req._denied.reason || `Permission requise : ${labels.join(" ou ")}`,
    });
    return;
  }

  if (method === "GET") {
    if (!user || !ok) return;
    const view = VIEW_ROUTES.find(([re]) => re.test(path));
    if (!view) return;
    const key = `${user.id}|${view[1]}|${entityId || (path.match(/^\/clients\/([^/]+)/)?.[1] ?? "")}`;
    const now = Date.now();
    if ((lastView.get(key) || 0) > now - 10 * 60 * 1000) return;
    lastView.set(key, now);
    const client = path.match(/^\/clients\/([^/]+)\/account$/) ? db.clients.find((c) => c.id === path.split("/")[2]) : null;
    recordAudit({ ...base, action: "view", action_type: "view", summary: `Consultation : ${view[1]}${client ? ` — ${client.name}` : ""}`, entity: client ? "Client" : undefined, entity_id: client?.id });
    return;
  }

  // Déconnexion : uniquement si l'utilisateur est identifié
  if (path === "/auth/logout") {
    if (user) recordAudit({ ...base, action: "auth.logout", action_type: "logout", summary: `Déconnexion (${user.email})` });
    return;
  }
  if (!user && path.startsWith("/auth")) return;

  const type = actionTypeOf(method, path);
  const heldCode = codes.find((c) => can(user, c)) || codes[0];
  const label = (heldCode && PERM_BY_CODE.get(heldCode)?.label) || `${method} ${path}`;
  const after = source ? snapshot(source.find(entityId || "")) : null;
  const target = after || before || (body && typeof body === "object" && !Array.isArray(body) ? body : null);
  const targetLabel = source ? labelOf(target) : labelOf(body?.user || body?.order || body?.client || body?.product || body);
  const note = req._auditNote || {};
  const changes = before && after ? diffOf(before, after) : [];
  const errorDetail = !ok && body && typeof body === "object" ? body.detail : undefined;
  recordAudit({
    ...base,
    action: note.action || (heldCode || `${method} ${path}`),
    action_type: note.action_type || type,
    entity: source?.entity || note.entity,
    entity_id: entityId || (body && typeof body === "object" ? body.id : undefined),
    entity_label: targetLabel,
    summary: (note.summary || `${label}${targetLabel ? ` — ${targetLabel}` : ""}`) + (ok ? "" : ` (échec : ${errorDetail || "erreur " + status})`),
    changes: changes.length ? changes : undefined,
    request: sanitize(req.body),
    security: type === "permission" || note.security || undefined,
  });
}

/* ---------------- Routes : journal, cahiers, alertes, rôles, permissions individuelles ---------------- */
const publicUser = (u: any) => {
  if (!u) return u;
  const { password_hash, ...rest } = u;
  return rest;
};

function inPeriod(at: string, from?: string, to?: string) {
  const t = new Date(at).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime()) return false;
  return true;
}

function stripSensitive(e: any, viewer: User) {
  if (can(viewer, "audit.details")) return e;
  const { changes, request, ip, session, user_agent, ...rest } = e;
  return { ...rest, has_details: !!(changes || request) };
}

export function mountAuditRoutes(router: any, authenticate: any) {
  const me = (req: any) => req.user as User;

  // Cartes des utilisateurs (profils réels) + statistiques de la période
  router.get("/audit/users", authenticate, (req: any, res: any) => {
    const { from, to, module, action_type } = req.query;
    const logs = db.audit_logs as any[];
    const sites: any[] = (db as any).sites || [];
    res.json(
      db.users.map((u: any) => {
        const mine = logs.filter((l) => (l.actor_id || l.user_id) === u.id);
        // Période + module / type d'action choisis : nombre d'actions correspondantes
        const period = mine.filter(
          (l) =>
            inPeriod(l.at || l.created_at, from, to) &&
            (!module || module === "all" || l.module === module) &&
            (!action_type || action_type === "all" || (l.action_type || legacyType(l)) === action_type)
        );
        const role = (db.roles as any[]).find((r) => r.code === u.role_code);
        const scope = scopeOf(u);
        return {
          ...publicUser(u),
          role_name: role?.name || u.role_code,
          role_active: role ? role.is_active !== false : false,
          site_name: u.site_id ? sites.find((s) => s.id === u.site_id)?.name : undefined,
          sites: scope.all_sites ? "Tous les sites" : scope.site_ids.map((id) => sites.find((s) => s.id === id)?.name || id).join(", "),
          departments: scope.all_categories ? "Tous les départements" : scope.categories.join(", "),
          actions_count: period.length,
          denied_count: period.filter((l) => l.action_type === "denied" || (l.success === false && l.security)).length,
          last_activity_at: mine.reduce((m, l) => ((l.at || "") > m ? l.at : m), ""),
          exceptions: ((u.perm_grants || []).length || 0) + ((u.perm_denies || []).length || 0),
        };
      })
    );
  });

  // Indicateurs du tableau de bord du journal
  router.get("/audit/stats", authenticate, (req: any, res: any) => {
    const { from, to } = req.query;
    const logs = (db.audit_logs as any[]).filter((l) => inPeriod(l.at || l.created_at, from, to));
    const recent = Date.now() - 24 * 3600 * 1000;
    res.json({
      users_total: db.users.length,
      users_active: db.users.filter((u) => u.is_active).length,
      users_recent: db.users.filter((u) => u.last_login_at && new Date(u.last_login_at).getTime() >= recent).length,
      actions: logs.length,
      security: logs.filter((l) => l.action_type === "denied" || l.success === false || l.security).length,
      open_alerts: alerts().filter((a) => !a.acked_at).length,
    });
  });

  // Journal / cahier d'un utilisateur : filtres + pagination (les détails sensibles selon audit.details)
  router.get("/audit/logs", authenticate, (req: any, res: any) => {
    const { user_id, module, action_type, result, from, to, q, role, site } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
    let list = [...(db.audit_logs as any[])].sort((a, b) => String(b.at || b.created_at).localeCompare(String(a.at || a.created_at)));
    if (user_id) list = list.filter((l) => (l.actor_id || l.user_id) === user_id);
    if (role && role !== "all") {
      const ids = new Set(db.users.filter((u) => u.role_code === role).map((u) => u.id));
      list = list.filter((l) => ids.has(l.actor_id || l.user_id));
    }
    if (site && site !== "all") {
      const ids = new Set(db.users.filter((u: any) => u.site_id === site || (u.site_ids || []).includes(site)).map((u) => u.id));
      list = list.filter((l) => ids.has(l.actor_id || l.user_id));
    }
    if (module && module !== "all") list = list.filter((l) => l.module === module);
    if (action_type && action_type !== "all") list = list.filter((l) => (l.action_type || legacyType(l)) === action_type);
    if (result === "success") list = list.filter((l) => l.success !== false);
    if (result === "failure") list = list.filter((l) => l.success === false);
    if (from || to) list = list.filter((l) => inPeriod(l.at || l.created_at, from, to));
    if (q) {
      const s = String(q).toLowerCase();
      list = list.filter((l) => [l.summary, l.details, l.action, l.actor_name, l.user_name, l.entity_label, l.module].some((x) => String(x || "").toLowerCase().includes(s)));
    }
    const total = list.length;
    const items = list.slice((page - 1) * limit, page * limit).map((l) => stripSensitive({ ...l, action_type: l.action_type || legacyType(l), at: l.at || l.created_at }, me(req)));
    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)), modules: Array.from(new Set((db.audit_logs as any[]).map((l) => l.module).filter(Boolean))).sort() });
  });

  // Vérification de l'intégrité du journal (empreintes chaînées)
  router.get("/audit/integrity", authenticate, (_req: any, res: any) => {
    let prev = "GENESIS";
    let sealed = 0;
    const broken: any[] = [];
    for (const l of db.audit_logs as any[]) {
      if (!l.hash) continue; // événement antérieur au chaînage
      sealed++;
      if (l.prev_hash !== prev || sealOf(l) !== l.hash) broken.push({ id: l.id, at: l.at, summary: l.summary });
      prev = l.hash;
    }
    if (broken.length) raiseAlert({ type: "integrity", severity: "high", key: `integrity:${broken[0].id}`, message: `Journal d'audit : ${broken.length} entrée(s) altérée(s) ou supprimée(s) détectée(s)` });
    res.json({ ok: broken.length === 0, sealed, legacy: db.audit_logs.length - sealed, broken });
  });

  router.get("/audit/alerts", authenticate, (_req: any, res: any) => res.json(alerts()));

  router.post("/audit/alerts/:id/ack", authenticate, (req: any, res: any) => {
    const a = alerts().find((x) => x.id === req.params.id);
    if (!a) return res.status(404).json({ detail: "Alerte introuvable" });
    a.acked_at = new Date().toISOString();
    a.acked_by = me(req).full_name;
    a.ack_note = String(req.body?.note || "").slice(0, 300) || undefined;
    auditNote(req, { action: "audit.alert.ack", action_type: "security", security: true, summary: `Alerte traitée : ${a.message}` });
    res.json(a);
  });

  router.get("/audit/coverage", authenticate, (_req: any, res: any) => res.json(permissionCoverage(router)));

  // Tentative d'ouverture d'une page interdite, signalée par l'interface (la page n'appelle alors aucune API)
  router.post("/audit/access-attempt", authenticate, (req: any, res: any) => {
    const u = me(req);
    const page = String(req.body?.page || "").slice(0, 120);
    const key = `${u.id}|attempt|${page}`;
    const now = Date.now();
    if ((lastView.get(key) || 0) > now - 60 * 1000) return res.json({ ok: true });
    lastView.set(key, now);
    recordAudit({
      ...actorFields(u),
      module: "Navigation",
      action: "access.denied",
      action_type: "denied",
      security: true,
      success: false,
      ip: ipOf(req),
      session: sessionOf(req),
      summary: `Tentative d'ouverture d'une page non autorisée : ${page}`,
      details: "Signalé par l'interface (page masquée et inaccessible)",
    });
    raiseAlert({ type: "access_denied", severity: "medium", key: `page:${u.id}:${page}`, message: `${u.full_name} a tenté d'ouvrir la page ${page} sans autorisation`, user: u, path: page });
    res.json({ ok: true });
  });

  /* ----- Catalogue et rôles (= catégories d'utilisateurs) ----- */
  router.get("/roles/catalog", authenticate, (_req: any, res: any) => res.json({ tree: catalogTree(), codes: ALL_CODES }));

  router.post("/roles", authenticate, (req: any, res: any) => {
    const u = me(req);
    const name = String(req.body?.name || "").trim();
    const code = String(req.body?.code || name)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    if (!name || !code) return res.status(400).json({ detail: "Le nom du rôle est obligatoire" });
    if ((db.roles as any[]).some((r) => r.code === code)) return res.status(409).json({ detail: `Le rôle « ${code} » existe déjà` });
    const perms = cleanGrant(u, req.body?.permissions);
    if (perms.error) return res.status(403).json({ detail: perms.error });
    const now = new Date().toISOString();
    const role = { id: uuidv4(), code, name, department: req.body?.department || undefined, description: req.body?.description || "", permissions: perms.codes, is_system: false, is_active: true, created_at: now, updated_at: now };
    (db.roles as any[]).push(role);
    auditNote(req, { action_type: "permission", summary: `Rôle créé : ${name} (${perms.codes.length} permission(s))`, entity: "Rôle", security: true });
    res.status(201).json(role);
  });

  router.put("/roles/:code/status", authenticate, (req: any, res: any) => {
    const role = (db.roles as any[]).find((r) => r.code === req.params.code);
    if (!role) return res.status(404).json({ detail: "Rôle introuvable" });
    if (role.code === "super_admin") return res.status(403).json({ detail: "Le rôle Super Administrateur est protégé" });
    const active = req.body?.is_active !== false;
    const users = db.users.filter((x) => x.role_code === role.code && x.is_active).length;
    if (!active && users) return res.status(409).json({ detail: `Impossible de désactiver « ${role.name} » : ${users} utilisateur(s) actif(s) l'utilisent encore. Réaffectez-les d'abord.` });
    role.is_active = active;
    role.updated_at = new Date().toISOString();
    auditNote(req, { action_type: "permission", summary: `Rôle ${active ? "réactivé" : "désactivé"} : ${role.name}` });
    res.json(role);
  });

  /* ----- Permissions individuelles et périmètre d'un utilisateur ----- */
  router.get("/users/:id/permissions", authenticate, (req: any, res: any) => {
    const target: any = db.users.find((x) => x.id === req.params.id);
    if (!target) return res.status(404).json({ detail: "Utilisateur introuvable" });
    const role = roleOf(target);
    const history = (db.audit_logs as any[])
      .filter((l) => l.action_type === "permission" && l.entity_id === target.id)
      .slice(-30)
      .reverse()
      .map((l) => stripSensitive(l, me(req)));
    res.json({
      user: publicUser(target),
      role: role ? { code: role.code, name: role.name, is_active: role.is_active !== false, permissions: role.permissions || [] } : null,
      grants: target.perm_grants || [],
      denies: target.perm_denies || [],
      effective: effectivePermissions(target),
      scope: scopeOf(target),
      raw_scope: { site_ids: target.site_ids || (target.site_id ? [target.site_id] : []), all_sites: target.all_sites === true || !!target.is_transversal, categories: target.categories || [], all_categories: target.all_categories !== false && !(target.categories || []).length ? true : target.all_categories === true },
      protected: isSuperAdmin(target),
      history,
    });
  });

  router.put("/users/:id/permissions", authenticate, (req: any, res: any) => {
    const actor = me(req);
    const target: any = db.users.find((x) => x.id === req.params.id);
    if (!target) return res.status(404).json({ detail: "Utilisateur introuvable" });
    if (isSuperAdmin(target) && !isSuperAdmin(actor)) return res.status(403).json({ detail: "Le super administrateur est protégé : seul un super administrateur peut le modifier" });
    if (target.id === actor.id && !isSuperAdmin(actor)) return res.status(403).json({ detail: "Vous ne pouvez pas modifier vos propres permissions" });
    const wantsPerms = Array.isArray(req.body?.grants) || Array.isArray(req.body?.denies);
    const wantsScope = req.body?.scope && typeof req.body.scope === "object";
    if (wantsPerms && !can(actor, "users.permissions")) return res.status(403).json({ detail: "Permission requise : Configurer les permissions individuelles", code: "PERMISSION_DENIED" });
    if (wantsScope && !can(actor, "users.scope")) return res.status(403).json({ detail: "Permission requise : Attribuer les sites et départements", code: "PERMISSION_DENIED" });

    if (wantsPerms) {
      const g = cleanGrant(actor, req.body.grants || []);
      if (g.error) return res.status(403).json({ detail: g.error });
      const denies = Array.from(new Set((req.body.denies || []).filter((c: string) => PERM_BY_CODE.has(c)))) as string[];
      // Un retrait l'emporte : un code ne peut pas être à la fois accordé et retiré
      target.perm_grants = g.codes.filter((c) => !denies.includes(c));
      target.perm_denies = denies;
    }
    if (wantsScope) {
      const s = req.body.scope;
      const siteIds = Array.from(new Set((Array.isArray(s.site_ids) ? s.site_ids : []).filter((id: string) => ((db as any).sites || []).some((x: any) => x.id === id)))) as string[];
      const cats = Array.from(new Set((Array.isArray(s.categories) ? s.categories : []).map((c: any) => String(c).trim()).filter(Boolean))) as string[];
      if (s.all_sites !== true && !siteIds.length) return res.status(400).json({ detail: "Choisissez au moins un site, ou l'accès à tous les sites" });
      if (s.all_categories !== true && !cats.length) return res.status(400).json({ detail: "Choisissez au moins un département, ou l'accès à tous les départements" });
      target.all_sites = s.all_sites === true;
      target.is_transversal = s.all_sites === true;
      target.site_ids = s.all_sites === true ? [] : siteIds;
      if (s.all_sites !== true) target.site_id = siteIds.includes(target.site_id) ? target.site_id : siteIds[0];
      target.all_categories = s.all_categories === true;
      target.categories = s.all_categories === true ? [] : cats;
      target.department = s.all_categories === true ? "Toutes les catégories" : cats.join(", ");
    }
    target.updated_at = new Date().toISOString();
    auditNote(req, { action: "permission.user.update", action_type: "permission", security: true, summary: `Permissions / périmètre modifiés pour ${target.full_name}` });
    res.json({ ok: true, effective: effectivePermissions(target), scope: scopeOf(target) });
  });
}

/** Un administrateur ne peut accorder que ce qu'il possède lui-même (pas d'élévation de privilèges) */
export function cleanGrant(actor: User, codes: any): { codes: string[]; error?: string } {
  const list = Array.from(new Set((Array.isArray(codes) ? codes : []).filter((c: string) => PERM_BY_CODE.has(c)))) as string[];
  if (isSuperAdmin(actor)) return { codes: list };
  const mine = new Set(effectivePermissions(actor));
  const over = list.filter((c) => !mine.has(c));
  if (over.length) return { codes: [], error: `Vous ne pouvez pas accorder des droits que vous ne possédez pas : ${over.map((c) => PERM_BY_CODE.get(c)?.label || c).join(", ")}` };
  return { codes: list };
}

// Anciennes entrées (avant ce module) : type déduit de l'action
function legacyType(l: any): ActionType {
  const a = String(l.action || "");
  if (a === "auth.login") return l.success === false ? "security" : "login";
  if (a.includes("rates") || a.includes("update")) return "update";
  if (a.includes("open") || a.includes("close")) return "execute";
  return "execute";
}
