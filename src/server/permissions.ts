import { db, type User } from "./db";

/*
 * Système centralisé des permissions de l'ERP (les deux applications).
 *
 *  - CATALOGUE : chaque fonctionnalité réelle de l'ERP (module › page › action), avec les actions
 *    stratégiques marquées « sensibles ». Le catalogue est servi à l'interface (/roles/catalog) qui
 *    construit l'arbre de cases à cocher : aucune permission n'est codée en dur côté écran.
 *  - DROITS EFFECTIFS d'un utilisateur = modèle de son rôle + exceptions individuelles accordées
 *    − exceptions individuelles retirées. Un retrait l'emporte toujours sur un ajout, et une action
 *    sans sa page (ex. « Approuver » sans « Consulter les commandes ») n'est jamais effective.
 *  - PÉRIMÈTRE DES DONNÉES (distinct des actions) : sites et départements (= catégories de produits),
 *    ou accès transversal. Il filtre les données côté serveur ; aucune permission ne l'élargit.
 *  - GARDE DES ROUTES : chaque route de l'API est associée aux permissions qui l'autorisent.
 *    Une route absente de la table est refusée par défaut (sauf au super administrateur) et signalée
 *    dans le Journal d'audit : une nouvelle fonctionnalité n'hérite jamais de droits automatiquement.
 */

export type PermKind = "view" | "create" | "update" | "delete" | "approve" | "reject" | "filter" | "export" | "print" | "execute" | "manage";

export interface PermDef {
  code: string;
  label: string;
  module: string;
  page: string;
  kind: PermKind;
  app: "commercial" | "logistique";
  sensitive?: boolean;
  /** Anciens codes de rôle qui donnaient déjà cet accès (migration fidèle, une seule fois) */
  legacy?: string[];
  /** Permissions nécessaires pour que celle-ci soit effective (ex. la page avant l'action) */
  requires?: string[];
  /** Action réalisée uniquement dans l'interface (export généré par le navigateur, filtre…) */
  ui_only?: boolean;
}

const P = (
  app: PermDef["app"],
  module: string,
  page: string,
  rows: Array<[string, string, PermKind, Partial<PermDef>?]>
): PermDef[] => rows.map(([code, label, kind, extra]) => ({ code, label, kind, module, page, app, ...(extra || {}) }));

export const PERMISSIONS: PermDef[] = [
  // ---------------- Gestion commerciale ----------------
  ...P("commercial", "Tableau de bord", "Indicateurs", [
    ["dashboard.read", "Voir le tableau de bord (chiffre d'affaires, bénéfice net, créances, ventes, clients, caisse, graphiques)", "view", { legacy: ["*"] }],
  ]),
  ...P("commercial", "Boutique", "Catalogue", [
    ["boutique.read", "Consulter la boutique et le catalogue", "view", { legacy: ["boutique.read"] }],
    ["boutique.search", "Rechercher et filtrer le catalogue", "filter", { legacy: ["boutique.read"], requires: ["boutique.read"], ui_only: true }],
    ["boutique.order", "Passer une commande (panier)", "create", { legacy: ["boutique.order"], requires: ["boutique.read"] }],
  ]),
  ...P("commercial", "Boutique", "Mes commandes", [
    ["boutique.orders_history", "Consulter mes commandes", "view", { legacy: ["boutique.read"], requires: ["boutique.read"] }],
    ["orders.all", "Voir les commandes de tous les vendeurs", "view", { legacy: ["orders.all"], sensitive: true }],
  ]),
  ...P("commercial", "Boutique", "Produits & catégories", [
    ["products.create", "Créer un produit (Nouveau produit)", "create", { legacy: ["stock.create"] }],
    ["products.update", "Modifier un produit", "update", { legacy: ["stock.update"] }],
    ["products.delete", "Supprimer un produit", "delete", { legacy: ["stock.update"], sensitive: true }],
    ["products.availability", "Rendre un produit disponible / indisponible", "update", { legacy: ["stock.update"], sensitive: true }],
    ["categories.manage", "Créer / supprimer une catégorie (département)", "manage", { legacy: ["stock.create", "stock.update"], sensitive: true }],
  ]),
  ...P("commercial", "Commandes", "Gestion des commandes", [
    ["orders.read", "Consulter les commandes", "view", { legacy: ["orders.read"] }],
    ["orders.filter", "Filtrer, trier et rechercher les commandes", "filter", { legacy: ["orders.read"], requires: ["orders.read"], ui_only: true }],
    ["orders.create", "Créer une commande", "create", { legacy: ["orders.create"] }],
    ["orders.approve", "Approuver une commande (sortie de stock)", "approve", { legacy: ["orders.approve", "orders.validate"], requires: ["orders.read"], sensitive: true }],
    ["orders.reject", "Rejeter une commande", "reject", { legacy: ["orders.approve", "orders.validate"], requires: ["orders.read"], sensitive: true }],
    ["orders.override_credit", "Approuver en dérogation au plafond de crédit", "approve", { requires: ["orders.approve"], sensitive: true }],
    ["orders.print", "Imprimer / télécharger la facture", "print", { legacy: ["orders.read", "boutique.read"], ui_only: true }],
  ]),
  ...P("commercial", "CRM Clients", "Clients", [
    ["crm.read", "Consulter les clients", "view", { legacy: ["crm.read"] }],
    ["crm.filter", "Filtrer, trier et rechercher les clients", "filter", { legacy: ["crm.read"], requires: ["crm.read"], ui_only: true }],
    ["crm.create", "Créer un client", "create", { legacy: ["crm.create"], requires: ["crm.read"] }],
    ["crm.update", "Modifier un client", "update", { legacy: ["crm.update"], requires: ["crm.read"] }],
  ]),
  ...P("commercial", "CRM Clients", "Compte client", [
    ["crm.account", "Consulter le compte client (relevé, transactions)", "view", { legacy: ["crm.read"], requires: ["crm.read"] }],
    ["crm.documents", "Ajouter la photo et les documents du client", "update", { legacy: ["crm.update", "crm.create"], requires: ["crm.read"] }],
    ["crm.credit_limit", "Ajuster le plafond de crédit", "update", { legacy: ["crm.update"], requires: ["crm.read"], sensitive: true }],
    ["crm.payments", "Enregistrer un paiement client", "create", { legacy: ["credits.manage", "cash.create"], sensitive: true }],
    ["crm.reverse", "Annuler une transaction client", "delete", { legacy: ["credits.manage"], sensitive: true }],
    ["crm.export", "Exporter / imprimer le dossier client (PDF)", "export", { legacy: ["crm.read"], requires: ["crm.read"], ui_only: true }],
  ]),
  ...P("commercial", "Caisse", "Sessions & opérations", [
    ["cash.read", "Consulter la caisse", "view", { legacy: ["cash.read"] }],
    ["cash.filter", "Filtrer et rechercher dans le journal de caisse", "filter", { legacy: ["cash.read"], requires: ["cash.read"], ui_only: true }],
    ["cash.open", "Ouvrir une session de caisse", "execute", { legacy: ["cash.create"], requires: ["cash.read"] }],
    ["cash.close", "Clôturer la caisse (billetage)", "execute", { legacy: ["cash.close"], requires: ["cash.read"], sensitive: true }],
    ["cash.create", "Enregistrer une entrée / sortie de caisse", "create", { legacy: ["cash.create"], requires: ["cash.read"], sensitive: true }],
    ["cash.deposits", "Encaisser les versements des marketeurs", "approve", { legacy: ["cash.create"], requires: ["cash.read"], sensitive: true }],
    ["cash.expense_categories", "Créer une catégorie de dépense", "create", { legacy: ["cash.create"], requires: ["cash.read"] }],
    ["cash.rates", "Modifier les taux de change", "update", { legacy: ["cash.update"], requires: ["cash.read"], sensitive: true }],
    ["cash.export", "Exporter / imprimer reçus et journaux (PDF)", "export", { legacy: ["cash.read"], requires: ["cash.read"], ui_only: true }],
  ]),
  ...P("commercial", "Crédits", "Crédits & créances", [
    ["credits.read", "Consulter les crédits clients", "view", { legacy: ["credits.read"] }],
    ["credits.manage", "Encaisser un remboursement de crédit", "create", { legacy: ["credits.manage"], requires: ["credits.read"], sensitive: true }],
  ]),
  ...P("commercial", "Comptabilité", "Écritures", [
    ["accounting.read", "Consulter les écritures comptables", "view", { legacy: ["accounting.read"] }],
    ["accounting.record", "Pointer / dépointer une écriture", "update", { legacy: ["accounting.read"], requires: ["accounting.read"], sensitive: true }],
    ["accounting.sync", "Synchroniser les écritures", "execute", { legacy: ["accounting.read"], requires: ["accounting.read"], sensitive: true }],
    ["accounting.export", "Exporter les écritures (PDF)", "export", { legacy: ["accounting.read"], requires: ["accounting.read"], ui_only: true }],
  ]),
  ...P("commercial", "Rapports", "Rapports commerciaux", [
    ["reports.read", "Consulter les rapports (vue d'ensemble, par jour, semaine, mois ou année)", "view", { legacy: ["reports.read"] }],
    ["reports.sales", "Rapport des ventes (fiches par catégorie)", "view", { legacy: ["reports.read"], requires: ["reports.read"] }],
    ["reports.cash", "Livre de caisse", "view", { legacy: ["reports.read"], requires: ["reports.read"] }],
    ["reports.credits", "Créances & marketeurs", "view", { legacy: ["reports.read"], requires: ["reports.read"] }],
    ["reports.export", "Exporter / imprimer les rapports (PDF, CSV)", "export", { legacy: ["reports.read"], requires: ["reports.read"], ui_only: true }],
  ]),
  ...P("commercial", "Objectifs", "Objectifs commerciaux", [
    ["objectives.read", "Consulter les objectifs", "view", { legacy: ["objectives.read"] }],
    ["objectives.manage", "Créer un objectif", "create", { legacy: ["objectives.manage"], requires: ["objectives.read"], sensitive: true }],
    ["objectives.claim", "Réclamer un bonus atteint", "execute", { legacy: ["objectives.read"], requires: ["objectives.read"] }],
  ]),
  ...P("commercial", "Utilisateurs", "Comptes utilisateurs", [
    ["users.read", "Consulter les utilisateurs", "view", { legacy: ["users.read"] }],
    ["users.create", "Créer un utilisateur", "create", { legacy: ["users.create"], requires: ["users.read"], sensitive: true }],
    ["users.update", "Modifier un utilisateur (profil, rôle, mot de passe)", "update", { legacy: ["users.update"], requires: ["users.read"], sensitive: true }],
    ["users.delete", "Désactiver un utilisateur", "delete", { legacy: ["users.delete"], requires: ["users.read"], sensitive: true }],
    ["users.scope", "Attribuer les départements (périmètre)", "manage", { legacy: ["users.update"], requires: ["users.read"], sensitive: true }],
  ]),
  ...P("commercial", "Rôles & permissions", "Rôles & modèles de permissions", [
    ["roles.read", "Consulter les rôles et leurs modèles de permissions", "view", { legacy: ["roles.read"] }],
    ["roles.manage", "Créer / modifier un rôle et son modèle de permissions", "manage", { legacy: ["roles.manage"], requires: ["roles.read"], sensitive: true }],
    ["roles.delete", "Désactiver / réactiver un rôle", "delete", { legacy: ["roles.manage"], requires: ["roles.read"], sensitive: true }],
  ]),
  ...P("commercial", "Rôles & permissions", "Permissions individuelles", [
    ["users.permissions", "Configurer les permissions individuelles", "manage", { legacy: ["roles.manage"], requires: ["users.read"], sensitive: true }],
  ]),
  ...P("commercial", "Journal d'audit", "Journal & alertes", [
    ["audit.read", "Consulter le journal d'audit et les cahiers des utilisateurs", "view", { legacy: ["audit.read"] }],
    ["audit.details", "Voir les détails sensibles (anciennes / nouvelles valeurs, IP, session)", "view", { legacy: ["audit.read"], requires: ["audit.read"], sensitive: true }],
    ["audit.alerts", "Recevoir et traiter les alertes de sécurité", "manage", { legacy: ["audit.read"], requires: ["audit.read"], sensitive: true }],
    ["audit.export", "Exporter le journal d'audit et les cahiers (PDF)", "export", { legacy: ["audit.read"], requires: ["audit.read"], ui_only: true }],
  ]),
  // ---------------- Stock & Livraison ----------------
  ...P("logistique", "Stock", "Produits & dépôts", [
    ["stock.read", "Consulter le stock", "view", { legacy: ["stock.read"] }],
    ["stock.create", "Ajouter un produit / des quantités en stock", "create", { legacy: ["stock.create"], requires: ["stock.read"] }],
    ["stock.update", "Modifier un produit en stock", "update", { legacy: ["stock.update"], requires: ["stock.read"] }],
    ["stock.adjust", "Ajuster le stock (inventaire)", "update", { legacy: ["stock.adjust"], requires: ["stock.read"], sensitive: true }],
    ["stock.transfer", "Transférer du stock entre dépôts", "execute", { legacy: ["stock.transfer"], requires: ["stock.read"], sensitive: true }],
    ["stock.history", "Consulter l'historique des mouvements et transferts", "view", { legacy: ["stock.read"], requires: ["stock.read"] }],
    ["warehouse.read", "Consulter les dépôts", "view", { legacy: ["warehouse.read", "stock.read"] }],
    ["warehouse.manage", "Créer / modifier les dépôts", "manage", { legacy: ["warehouse.manage"], requires: ["warehouse.read"], sensitive: true }],
  ]),
  ...P("logistique", "Stock", "Rapports d'état de stock", [
    ["stock.reports", "Générer et consulter les rapports d'état de stock", "view", { legacy: ["stock.read"] }],
    ["stock.export", "Exporter / imprimer l'état de stock (PDF)", "export", { legacy: ["stock.read"], requires: ["stock.reports"], ui_only: true }],
  ]),
  ...P("logistique", "Rapports Stock & Livraison", "Rapports logistiques", [
    ["logistics_reports.read", "Consulter les rapports Stock & Livraison", "view", { requires: ["stock.read"] }],
    ["logistics_reports.export", "Exporter le rapport des livraisons (CSV)", "export", { requires: ["logistics_reports.read"], ui_only: true }],
  ]),
  ...P("logistique", "Livraison", "Livraisons & tournées", [
    ["delivery.read", "Consulter les livraisons", "view", { legacy: ["delivery.read"] }],
    ["delivery.create", "Préparer une livraison", "execute", { legacy: ["delivery.create"], requires: ["delivery.read"] }],
    ["delivery.dispatch", "Chargement camion / expédition", "execute", { legacy: ["delivery.dispatch"], requires: ["delivery.read"] }],
    ["delivery.confirm", "Confirmer la livraison", "approve", { legacy: ["delivery.confirm"], requires: ["delivery.read"] }],
    ["delivery.embarked", "Charger / retourner / ajuster le stock embarqué", "execute", { legacy: ["delivery.dispatch"], requires: ["delivery.read"], sensitive: true }],
    ["delivery.vehicles", "Gérer les camions et chauffeurs", "manage", { legacy: ["delivery.dispatch"], requires: ["delivery.read"] }],
    ["delivery.config", "Configurer les départements de livraison", "manage", { legacy: ["delivery.create"], requires: ["delivery.read"], sensitive: true }],
  ]),
];

export const PERM_BY_CODE = new Map(PERMISSIONS.map((p) => [p.code, p]));
export const ALL_CODES = PERMISSIONS.map((p) => p.code);

/* ---------------- Migration fidèle des rôles existants (une seule fois) ---------------- */
const MODEL_VERSION = 2;

export function ensurePermissionModel() {
  if ((db as any).permission_model_version === MODEL_VERSION) return;
  for (const role of db.roles as any[]) {
    if (role.code === "super_admin") {
      role.permissions = [...ALL_CODES];
      continue;
    }
    const before = new Set<string>(role.permissions || []);
    const next = new Set<string>([...before].filter((c) => PERM_BY_CODE.has(c)));
    for (const p of PERMISSIONS) {
      if (!p.legacy) continue;
      // « * » : accès que l'interface donnait déjà à tous les profils (tableau de bord)
      if (p.legacy.includes("*") || p.legacy.some((l) => before.has(l))) next.add(p.code);
    }
    role.permissions = [...next];
    if (role.is_active === undefined) role.is_active = true;
  }
  (db as any).permission_model_version = MODEL_VERSION;
}

/*
 * Permissions ajoutées après la migration : accordées une seule fois aux rôles (et exceptions
 * individuelles) qui avaient déjà cet accès, sans rejouer la migration complète.
 *  - Rapports Stock & Livraison : ouverts jusqu'ici par « reports.read », export par « stock.export ».
 */
const ADDED_PERMISSIONS: Array<[string, string]> = [
  ["logistics_reports.read", "reports.read"],
  ["logistics_reports.export", "stock.export"],
];

export function ensureAddedPermissions() {
  const done: string[] = ((db as any).permission_additions ||= []);
  for (const [code, from] of ADDED_PERMISSIONS) {
    if (done.includes(code)) continue;
    for (const role of db.roles as any[]) {
      const perms: string[] = role.permissions || [];
      if (role.code === "super_admin" || perms.includes(from)) role.permissions = Array.from(new Set([...perms, code]));
    }
    for (const u of db.users as any[]) {
      if ((u.perm_grants || []).includes(from)) u.perm_grants = Array.from(new Set([...u.perm_grants, code]));
      if ((u.perm_denies || []).includes(from)) u.perm_denies = Array.from(new Set([...u.perm_denies, code]));
    }
    done.push(code);
  }
}

/* ---------------- Droits effectifs ---------------- */
export const isSuperAdmin = (u?: User | null) => u?.role_code === "super_admin";

export function roleOf(u: User) {
  return (db.roles as any[]).find((r) => r.code === u.role_code);
}

export function effectivePermissions(u?: User | null): string[] {
  if (!u) return [];
  ensurePermissionModel();
  ensureAddedPermissions();
  if (isSuperAdmin(u)) return [...ALL_CODES];
  const role = roleOf(u);
  const base: string[] = role && role.is_active !== false ? role.permissions || [] : [];
  const grants: string[] = (u as any).perm_grants || [];
  const denies = new Set<string>((u as any).perm_denies || []);
  const set = new Set<string>([...base, ...grants].filter((c) => PERM_BY_CODE.has(c) && !denies.has(c)));
  // Une action n'est effective qu'avec sa page / sa condition (jusqu'à stabilité)
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of [...set]) {
      const req = PERM_BY_CODE.get(c)?.requires || [];
      if (req.some((r) => !set.has(r))) {
        set.delete(c);
        changed = true;
      }
    }
  }
  return [...set];
}

export const can = (u: User | null | undefined, code: string) => isSuperAdmin(u) || effectivePermissions(u).includes(code);
export const canAny = (u: User | null | undefined, codes: string[]) => {
  if (isSuperAdmin(u)) return true;
  const eff = new Set(effectivePermissions(u));
  return codes.some((c) => eff.has(c));
};

/* ---------------- Périmètre des données : sites et départements ---------------- */
export interface DataScope {
  all_sites: boolean;
  site_ids: string[];
  all_categories: boolean;
  categories: string[];
  /** Ressources pour lesquelles l'utilisateur a un accès transversal (tous sites, tous départements) */
  transversal_resources: ScopeResource[];
}

/*
 * Accès transversal limité à certaines ressources : par exemple un agent CRM limité au site de Goma
 * qui gère pourtant les clients de tous les sites. Il élargit uniquement les DONNÉES de cette ressource ;
 * les actions restent soumises aux permissions.
 */
export const SCOPE_RESOURCES = {
  catalog: "Catalogue et commandes de produits",
  orders: "Commandes (consultation, approbation)",
  clients: "Clients (CRM) et créances",
  cash: "Caisses de tous les sites",
  indicators: "Indicateurs et rapports",
} as const;
export type ScopeResource = keyof typeof SCOPE_RESOURCES;
const isResource = (r: any): r is ScopeResource => typeof r === "string" && r in SCOPE_RESOURCES;

const TRANSVERSAL_ROLES = ["super_admin", "dg"];
const norm = (s: any) => String(s || "").trim().toLowerCase();

export function scopeOf(u?: User | null, resource?: ScopeResource): DataScope {
  if (!u) return { all_sites: false, site_ids: [], all_categories: false, categories: [], transversal_resources: [] };
  const anyU = u as any;
  const transversal_resources: ScopeResource[] = (Array.isArray(anyU.transversal_resources) ? anyU.transversal_resources : []).filter(isResource);
  if (resource && transversal_resources.includes(resource)) return { all_sites: true, site_ids: [], all_categories: true, categories: [], transversal_resources };
  const site_ids: string[] = Array.from(new Set([...(Array.isArray(anyU.site_ids) ? anyU.site_ids : []), ...(u.site_id ? [u.site_id] : [])].filter(Boolean)));
  const all_sites = TRANSVERSAL_ROLES.includes(u.role_code) || !!u.is_transversal || anyU.all_sites === true || site_ids.length === 0;
  const categories: string[] = Array.isArray(u.categories) ? u.categories.filter(Boolean) : [];
  const all_categories = isSuperAdmin(u) || u.all_categories === true || categories.length === 0;
  return { all_sites, site_ids: all_sites ? [] : site_ids, all_categories, categories: all_categories ? [] : categories, transversal_resources };
}

export function inSiteScope(u: User | null | undefined, siteId?: string | null, resource?: ScopeResource) {
  const s = scopeOf(u, resource);
  return s.all_sites || (!!siteId && s.site_ids.includes(siteId));
}

export function inCategoryScope(u: User | null | undefined, category?: string | null, resource?: ScopeResource) {
  const s = scopeOf(u, resource);
  if (s.all_categories) return true;
  return !!category && s.categories.some((c) => norm(c) === norm(category));
}

/** Commande visible : au moins une ligne dans les départements de l'utilisateur */
export function orderInCategoryScope(u: User | null | undefined, order: any, resource: ScopeResource = "orders") {
  const s = scopeOf(u, resource);
  if (s.all_categories) return true;
  return (order.items || []).some((it: any) => {
    const p = db.products.find((x) => x.id === it.product_id);
    return inCategoryScope(u, p?.category || it.category, resource);
  });
}

/* ---------------- Table des routes → permissions ---------------- */
const PUBLIC = "public";
const AUTH = "authenticated";
type Rule = string[] | typeof PUBLIC | typeof AUTH;

// Ordre important : la première règle qui correspond s'applique (routes fixes avant routes à paramètre)
export const ROUTE_RULES: Array<[string, string, Rule]> = [
  ["GET", "/", PUBLIC],
  ["GET", "/health", PUBLIC],
  ["POST", "/auth/login", PUBLIC],
  ["POST", "/auth/refresh", PUBLIC],
  ["POST", "/auth/logout", PUBLIC],
  ["GET", "/auth/me", AUTH],
  ["POST", "/auth/change-password", AUTH],
  ["GET", "/notifications", AUTH],
  ["POST", "/notifications/mark-all-read", AUTH],
  ["POST", "/audit/access-attempt", AUTH],
  // Référentiels communs (lecture seule, sans données sensibles)
  ["GET", "/integration/sites", AUTH],
  ["GET", "/integration/categories", AUTH],
  // Administration
  ["GET", "/roles/catalog", ["roles.read", "users.permissions"]],
  ["GET", "/roles", ["roles.read", "users.read", "audit.read", "users.permissions"]],
  ["POST", "/roles", ["roles.manage"]],
  ["PUT", "/roles/:code/status", ["roles.delete"]],
  ["GET", "/roles/:code", ["roles.read"]],
  ["PUT", "/roles/:code", ["roles.manage"]],
  ["GET", "/users", ["users.read", "audit.read", "cash.read", "objectives.manage"]],
  ["POST", "/users", ["users.create"]],
  ["GET", "/users/:id/permissions", ["users.permissions", "users.read"]],
  ["PUT", "/users/:id/permissions", ["users.permissions", "users.scope"]],
  ["PUT", "/users/:id", ["users.update", "users.scope"]],
  ["DELETE", "/users/:id", ["users.delete"]],
  ["GET", "/audit/logs", ["audit.read"]],
  ["GET", "/audit/users", ["audit.read"]],
  ["GET", "/audit/stats", ["audit.read"]],
  ["GET", "/audit/alerts", ["audit.alerts"]],
  ["POST", "/audit/alerts/:id/ack", ["audit.alerts"]],
  ["GET", "/audit/coverage", ["audit.alerts", "users.permissions", "roles.manage"]],
  ["GET", "/audit/integrity", ["audit.read"]],
  // Tableau de bord & rapports commerciaux
  ["GET", "/dashboard", ["dashboard.read"]],
  ["GET", "/reports/summary", ["reports.read"]],
  ["GET", "/reports/site-map", ["reports.read"]],
  // Boutique & catalogue
  ["GET", "/boutique/products", ["boutique.read"]],
  ["GET", "/boutique/my-orders", ["boutique.orders_history", "boutique.read"]],
  ["GET", "/boutique/marketers", ["boutique.read", "orders.read"]],
  ["GET", "/integration/catalog", ["boutique.read", "crm.read", "reports.read", "objectives.read", "products.update", "categories.manage"]],
  ["PUT", "/integration/catalog/:id/availability", ["products.availability"]],
  ["POST", "/integration/categories", ["categories.manage"]],
  ["DELETE", "/integration/categories/:name", ["categories.manage"]],
  ["GET", "/integration/sales", ["stock.read", "stock.reports", "logistics_reports.read"]],
  ["POST", "/products/:id/adjust", ["stock.adjust"]],
  ["POST", "/products", ["products.create", "stock.create"]],
  ["PUT", "/products/:id", ["products.update", "stock.update"]],
  ["DELETE", "/products/:id", ["products.delete"]],
  ["GET", "/products", ["stock.read", "delivery.read", "stock.reports", "logistics_reports.read"]],
  // Commandes
  ["GET", "/orders", ["orders.read", "reports.read", "cash.read"]],
  ["POST", "/orders", ["boutique.order", "orders.create"]],
  ["GET", "/orders/:id/credit-check", ["orders.read"]],
  ["POST", "/orders/:id/approve", ["orders.approve"]],
  ["POST", "/orders/:id/reject", ["orders.reject"]],
  ["GET", "/orders/:id", ["orders.read"]],
  // CRM
  ["GET", "/clients", ["crm.read", "boutique.order", "orders.create", "cash.read", "credits.read"]],
  ["POST", "/clients", ["crm.create"]],
  ["GET", "/clients/:id/account", ["crm.account", "credits.read", "cash.read"]],
  ["POST", "/clients/:id/photo", ["crm.documents"]],
  ["POST", "/clients/:id/document", ["crm.documents"]],
  ["POST", "/clients/:id/adjust-credit-limit", ["crm.credit_limit"]],
  ["POST", "/clients/:id/payments", ["crm.payments", "credits.manage"]],
  ["POST", "/clients/:id/transactions/:txId/reverse", ["crm.reverse"]],
  ["PUT", "/clients/:id", ["crm.update"]],
  // Caisse
  ["GET", "/cash/active-session", ["cash.read", "reports.cash"]],
  ["GET", "/cash/sessions", ["cash.read", "reports.cash"]],
  ["POST", "/cash/sessions/open", ["cash.open"]],
  ["POST", "/cash/sessions/:id/close", ["cash.close"]],
  ["GET", "/cash/operations/:id/document", ["cash.read", "crm.account", "accounting.read", "reports.cash"]],
  ["GET", "/cash/operations", ["cash.read", "reports.cash"]],
  ["POST", "/cash/operations", ["cash.create"]],
  ["GET", "/cash/overview", ["cash.read"]],
  ["GET", "/cash/expense-categories", ["cash.read"]],
  ["POST", "/cash/expense-categories", ["cash.expense_categories"]],
  ["GET", "/cash/rates", ["boutique.read", "cash.read", "credits.read", "reports.read", "orders.read"]],
  ["POST", "/cash/rates", ["cash.rates"]],
  ["GET", "/cash/marketer-deposits", ["cash.read"]],
  ["GET", "/cash/marketer-orders/:marketerName", ["cash.read"]],
  ["POST", "/cash/marketer-deposits/approve", ["cash.deposits"]],
  // Crédits
  ["GET", "/credits/debts", ["credits.read"]],
  ["GET", "/credits/marketers", ["credits.read"]],
  ["GET", "/credits/receivables", ["credits.read", "reports.credits"]],
  ["GET", "/credits", ["credits.read", "reports.credits", "reports.read"]],
  // Comptabilité
  ["GET", "/accounting/movements", ["accounting.read"]],
  ["POST", "/accounting/sync", ["accounting.sync"]],
  ["POST", "/accounting/movements/:id/toggle-record", ["accounting.record"]],
  // Objectifs
  ["GET", "/objectives", ["objectives.read"]],
  ["POST", "/objectives/:id/claim-bonus", ["objectives.claim"]],
  ["POST", "/objectives", ["objectives.manage"]],
  // Stock
  ["GET", "/warehouses", ["stock.read", "warehouse.read"]],
  ["GET", "/stock/products", ["stock.read"]],
  ["GET", "/stock/sites", ["stock.read", "warehouse.read", "delivery.read", "stock.reports"]],
  ["POST", "/stock/sites", ["warehouse.manage"]],
  ["PUT", "/stock/sites/:id", ["warehouse.manage"]],
  ["GET", "/stock/depot-managers", ["warehouse.read", "warehouse.manage"]],
  ["GET", "/stock/depots", ["stock.read", "warehouse.read", "delivery.read", "stock.reports"]],
  ["POST", "/stock/depots", ["warehouse.manage"]],
  ["POST", "/stock/depots/:id/adjust", ["stock.adjust"]],
  ["POST", "/stock/depots/:id/products", ["stock.create"]],
  ["GET", "/stock/depots/:id", ["stock.read", "warehouse.read"]],
  ["PUT", "/stock/depots/:id", ["warehouse.manage"]],
  ["GET", "/stock/levels", ["stock.read", "delivery.read", "stock.reports"]],
  ["GET", "/stock/transfers", ["stock.history", "stock.transfer"]],
  ["POST", "/stock/transfers", ["stock.transfer"]],
  ["GET", "/stock/movements", ["stock.history"]],
  ["GET", "/stock/categories", ["stock.read", "stock.reports", "categories.manage"]],
  ["POST", "/stock/categories", ["categories.manage", "stock.create"]],
  ["DELETE", "/stock/categories/:name", ["categories.manage"]],
  ["GET", "/stock/embarked-summary", ["stock.read", "delivery.read", "logistics_reports.read"]],
  ["GET", "/reports/stock-state/history/:id", ["stock.reports"]],
  ["GET", "/reports/stock-state/history", ["stock.reports"]],
  ["POST", "/reports/stock-state/history", ["stock.reports"]],
  ["GET", "/reports/stock-state", ["stock.reports"]],
  // Livraison
  ["GET", "/delivery/overview", ["delivery.read", "stock.read"]],
  ["GET", "/delivery/vehicles", ["delivery.read"]],
  ["POST", "/delivery/vehicles", ["delivery.vehicles"]],
  ["DELETE", "/delivery/vehicles/:id", ["delivery.vehicles"]],
  ["GET", "/delivery/marketers", ["delivery.read"]],
  ["GET", "/delivery/embarked/movements", ["delivery.read"]],
  ["GET", "/delivery/embarked/sales", ["delivery.read"]],
  ["GET", "/delivery/embarked", ["delivery.read"]],
  ["POST", "/delivery/embarked/load", ["delivery.embarked"]],
  ["POST", "/delivery/embarked/:id/return", ["delivery.embarked"]],
  ["POST", "/delivery/embarked/:id/adjust", ["delivery.embarked"]],
  ["GET", "/delivery/orders", ["delivery.read", "logistics_reports.read"]],
  ["POST", "/delivery/orders/:id/advance", ["delivery.create", "delivery.dispatch", "delivery.confirm"]],
  ["GET", "/delivery/departments", ["delivery.read"]],
  ["PUT", "/delivery/departments/:name", ["delivery.config"]],
  ["GET", "/delivery/tours", ["delivery.read"]],
  ["PUT", "/delivery/tours/:id/status", ["delivery.dispatch", "delivery.confirm"]],
];

const compiled = ROUTE_RULES.map(([method, pattern, rule]) => ({
  method,
  pattern,
  rule,
  re: new RegExp("^" + pattern.replace(/:[A-Za-z]+/g, "[^/]+") + "/?$"),
}));

export function ruleFor(method: string, path: string) {
  const m = method.toUpperCase();
  return compiled.find((r) => r.method === m && r.re.test(path)) || null;
}

/* ---------------- Inventaire automatique : routes non couvertes, actions stratégiques non protégées ---------------- */
export function permissionCoverage(router: any) {
  const routes: Array<{ method: string; path: string }> = [];
  for (const l of router?.stack || []) {
    if (!l.route) continue;
    for (const m of Object.keys(l.route.methods)) routes.push({ method: m.toUpperCase(), path: l.route.path });
  }
  const unmapped = routes.filter((r) => !compiled.some((c) => c.method === r.method && c.pattern === r.path));
  const enforced = new Set<string>();
  compiled.forEach((c) => Array.isArray(c.rule) && c.rule.forEach((code) => enforced.add(code)));
  const unknownCodes = [...enforced].filter((c) => !PERM_BY_CODE.has(c));
  // Une action stratégique doit être vérifiée par le serveur (sauf exports produits par le navigateur)
  const sensitiveUnprotected = PERMISSIONS.filter(
    (p) => p.sensitive && !p.ui_only && !enforced.has(p.code) && !SERVER_CHECKED_IN_CODE.includes(p.code) && !NO_FEATURE_CODES.includes(p.code)
  );
  return {
    routes_total: routes.length,
    routes_mapped: routes.length - unmapped.length,
    unmapped,
    unknown_codes: unknownCodes,
    sensitive_unprotected: sensitiveUnprotected.map((p) => ({ code: p.code, label: p.label, module: p.module })),
    ui_only: PERMISSIONS.filter((p) => p.ui_only).map((p) => p.code),
    enforced: [...enforced, ...SERVER_CHECKED_IN_CODE].filter((c, i, arr) => arr.indexOf(c) === i),
    no_feature: NO_FEATURE_CODES,
  };
}

// Permissions vérifiées dans le code des routes (au-delà de la table) : dérogation de crédit, etc.
export const SERVER_CHECKED_IN_CODE = ["orders.override_credit", "orders.all", "users.scope", "users.permissions", "audit.details"];
// Permissions sans fonctionnalité dans l'ERP actuel (n'accordent rien). Les anciennes (paramètres,
// billetage séparé, modifier / annuler une commande, supprimer un client, modifier une opération de
// caisse) ont été retirées du catalogue ; les codes encore stockés dans les rôles sont ignorés.
export const NO_FEATURE_CODES: string[] = [];

/** Catalogue groupé (module › page › actions) servi à l'interface */
export function catalogTree() {
  const tree: any[] = [];
  for (const p of PERMISSIONS) {
    let mod = tree.find((m) => m.module === p.module && m.app === p.app);
    if (!mod) tree.push((mod = { module: p.module, app: p.app, pages: [] }));
    let page = mod.pages.find((x: any) => x.page === p.page);
    if (!page) mod.pages.push((page = { page: p.page, actions: [] }));
    page.actions.push(p);
  }
  return tree;
}
