import express, { type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import {
  db,
  type User,
  type Role,
  type Warehouse,
  type Product,
  type Client,
  type Order,
  type OrderItem,
  type CashSession,
  type CashOperation,
  type Delivery,
  type Credit,
  type Objective,
} from "./db";
import { ensureStockStructure, mountStockStructureRoutes, orderLocation, userSite } from "./stockStructure";
import { mountStockReportRoutes } from "./stockReport";
import { appScopeGuard, mountIntegrationRoutes } from "./integration";
import { installSecurity, mountAuditRoutes, recordAudit, auditNote, cleanGrant } from "./audit";
import { can, effectivePermissions, isSuperAdmin, scopeOf, inSiteScope, inCategoryScope, orderInCategoryScope, PERM_BY_CODE } from "./permissions";
import { applyOrderStockOut, mountDeliveryRoutes, restoreOrderStock, tagOrderStockSource } from "./delivery";

export const JWT_SECRET = process.env.JWT_SECRET || "erp_secret_jwt_key_2026";

export function authenticate(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ detail: "Non authentifié" });
  }
  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const user = db.users.find((u) => u.id === payload.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ detail: "Utilisateur invalide ou désactivé" });
    }
    (req as any).user = user;
    next();
  } catch {
    return res.status(401).json({ detail: "Token invalide ou expiré" });
  }
}

export const apiRouter = express.Router();
// Deux applications sur la même API : chacune n'accède qu'aux routes de ses modules (voir integration.ts)
apiRouter.use(appScopeGuard);
// Permissions (garde de chaque route) et journal d'audit automatique : voir permissions.ts et audit.ts
installSecurity(apiRouter, (req: any) => {
  const auth = String(req.headers?.authorization || "");
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as any;
    const u = db.users.find((x) => x.id === payload.sub);
    return u && u.is_active ? u : null;
  } catch {
    return null;
  }
});

apiRouter.get("/", (req, res) => {
  res.json({ service: "ERP Distribution", status: "ok", version: "0.1.0" });
});

apiRouter.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// AUTH
apiRouter.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = (email || "").toLowerCase().trim();
  const user = db.users.find((u) => u.email.toLowerCase() === normalizedEmail);
  // Seul le mot de passe propre au compte est accepté (aucun mot de passe universel : il contournerait
  // toutes les permissions en ouvrant n'importe quel compte, super administrateur compris)
  const isMatch = !!user && typeof password === "string" && bcrypt.compareSync(password, user.password_hash);

  const loginCtx = {
    ip: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "aperçu navigateur",
    user_agent: String(req.headers["user-agent"] || "").slice(0, 160) || undefined,
    app: req.headers["x-erp-app"] || undefined,
    module: "Authentification",
  };
  if (!user || !isMatch) {
    // Échec rattaché au compte visé (s'il existe) : visible dans son cahier d'audit
    recordAudit({
      ...loginCtx,
      action: "auth.login",
      action_type: "security",
      security: true,
      actor_id: user?.id,
      actor_name: user?.full_name,
      actor_email: normalizedEmail,
      role_code: user?.role_code,
      summary: "Échec de connexion (identifiants invalides)",
      success: false,
    });
    return res.status(401).json({ detail: "Email ou mot de passe incorrect" });
  }

  if (!user.is_active) {
    recordAudit({ ...loginCtx, action: "auth.login", action_type: "security", security: true, actor_id: user.id, actor_name: user.full_name, actor_email: user.email, role_code: user.role_code, summary: "Connexion refusée : compte désactivé", success: false });
    return res.status(403).json({ detail: "Compte désactivé" });
  }

  user.last_login_at = new Date().toISOString();
  const access_token = jwt.sign(
    { sub: user.id, email: user.email, role: user.role_code },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
  const refresh_token = jwt.sign(
    { sub: user.id, type: "refresh" },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  recordAudit({
    ...loginCtx,
    actor_id: user.id,
    actor_name: user.full_name,
    actor_email: user.email,
    role_code: user.role_code,
    action: "auth.login",
    action_type: "login",
    summary: `Connexion réussie (${user.email})`,
    success: true,
  });

  const { password_hash, ...userPublic } = user;
  res.json({ access_token, refresh_token, token: access_token, expires_in: 28800, user: userPublic });
});

apiRouter.post("/auth/refresh", (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ detail: "Refresh token requis" });
  }
  try {
    const payload = jwt.verify(refresh_token, JWT_SECRET) as any;
    const user = db.users.find((u) => u.id === payload.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ detail: "Utilisateur introuvable ou inactif" });
    }
    const access_token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role_code },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    res.json({ access_token, refresh_token, token: access_token, expires_in: 28800 });
  } catch {
    res.status(401).json({ detail: "Refresh token expiré ou invalide" });
  }
});

apiRouter.post("/auth/logout", (req, res) => {
  res.json({ ok: true });
});

apiRouter.get("/auth/me", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const role = db.roles.find((r) => r.code === user.role_code);
  // Droits effectifs = modèle du rôle + exceptions individuelles (les retraits l'emportent)
  const permissions = effectivePermissions(user);
  const { password_hash, ...userPublic } = user;
  res.json({
    user: userPublic,
    role: role || null,
    permissions,
    scope: scopeOf(user),
  });
});

// JOURNAL D'AUDIT, catalogue des permissions, rôles (catégories d'utilisateurs) et permissions individuelles
mountAuditRoutes(apiRouter, authenticate);

// ROLES

apiRouter.get("/roles", authenticate, (req, res) => {
  res.json(db.roles);
});

apiRouter.get("/roles/:code", authenticate, (req, res) => {
  const role = db.roles.find((r) => r.code === req.params.code);
  if (!role) return res.status(404).json({ detail: "Rôle introuvable" });
  res.json(role);
});

apiRouter.put("/roles/:code", authenticate, (req, res) => {
  const actor = (req as any).user as User;
  const role = db.roles.find((r) => r.code === req.params.code);
  if (!role) return res.status(404).json({ detail: "Rôle introuvable" });
  // Le super administrateur garde toujours tous les droits
  if (role.code === "super_admin") return res.status(403).json({ detail: "Le rôle Super Administrateur est protégé : il conserve tous les droits" });
  if (req.body.name) role.name = req.body.name;
  if (req.body.description !== undefined) role.description = req.body.description;
  if (Array.isArray(req.body.permissions)) {
    const g = cleanGrant(actor, req.body.permissions);
    if (g.error) return res.status(403).json({ detail: g.error });
    role.permissions = g.codes;
  }
  role.updated_at = new Date().toISOString();
  auditNote(req, {
    action: "permission.role.update",
    action_type: "permission",
    security: true,
    summary: Array.isArray(req.body.permissions)
      ? `Modèle de permissions du rôle « ${role.name} » modifié (${role.permissions.length} permission(s))`
      : `Catégorie d'utilisateurs « ${role.name} » modifiée`,
  });
  res.json(role);
});

// USERS
apiRouter.get("/users", authenticate, (req, res) => {
  const q = ((req.query.q as string) || "").toLowerCase().trim();
  const role = req.query.role as string;
  let list = db.users;
  if (role && role !== "all") {
    list = list.filter((u) => u.role_code === role);
  }
  if (q) {
    list = list.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.full_name.toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q)) ||
        (u.department && u.department.toLowerCase().includes(q)) ||
        u.role_code.toLowerCase().includes(q)
    );
  }

  const listWithStats = list.map(({ password_hash, ...rest }) => {
    const userOrders = db.orders.filter((o) => o.marketer_id === rest.id);
    const approvedOrders = userOrders.filter(
      (o) =>
        o.status === "validated" ||
        o.status === "delivered" ||
        o.status === "shipped" ||
        o.status === "prepared"
    );
    const pendingOrders = userOrders.filter((o) => o.status === "pending_approval");
    const totalSalesFC = userOrders.reduce(
      (sum, o) => sum + (o.total_fc || Math.round(o.total * 2500)),
      0
    );
    const totalSalesUSD = userOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const sortedOrders = [...userOrders].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return {
      ...rest,
      stats: {
        orders_count: userOrders.length,
        approved_count: approvedOrders.length,
        pending_count: pendingOrders.length,
        total_sales_fc: totalSalesFC,
        total_sales_usd: Math.round(totalSalesUSD * 100) / 100,
        last_order_at: sortedOrders[0]?.created_at || null,
      },
    };
  });
  res.json(listWithStats);
});

// Départements de l'utilisateur = catégories de produits : accès à toutes, ou rattaché à une sélection
function categoryAccess(body: any) {
  if (body?.all_categories === undefined && body?.categories === undefined) return null;
  const all = body.all_categories === true;
  const categories = all ? [] : Array.from(new Set((Array.isArray(body.categories) ? body.categories : []).map((c: any) => String(c).trim()).filter(Boolean))) as string[];
  return { all_categories: all, categories, department: all ? "Toutes les catégories" : categories.join(", ") };
}

/*
 * Protection des comptes : seul un super administrateur crée, modifie ou désactive un super administrateur ;
 * un administrateur ne peut attribuer qu'un rôle dont il possède lui-même tous les droits (pas d'élévation).
 */
// Photo de profil : image en data URL, taille raisonnable
function photoError(v: any) {
  if (!v) return null;
  if (typeof v !== "string" || !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(v)) return "La photo doit être une image (PNG, JPEG, WEBP ou GIF)";
  if (v.length > 700_000) return "La photo est trop lourde (500 Ko maximum)";
  return null;
}

function roleAssignError(actor: User, roleCode?: string) {
  if (!roleCode || isSuperAdmin(actor)) return null;
  if (roleCode === "super_admin") return "Seul un super administrateur peut attribuer le rôle Super Administrateur";
  const role: any = db.roles.find((r) => r.code === roleCode);
  if (!role) return "Rôle introuvable";
  if (role.is_active === false) return `Le rôle « ${role.name} » est désactivé`;
  const mine = new Set(effectivePermissions(actor));
  const over = (role.permissions || []).filter((c: string) => !mine.has(c));
  return over.length ? `Vous ne pouvez pas attribuer le rôle « ${role.name} » : il donne des droits que vous ne possédez pas (${over.length})` : null;
}
const scopeFieldsChanged = (u: any, body: any) => {
  const cats = (x: any) => JSON.stringify([...(x || [])].map(String).sort());
  return (
    (body.site_id !== undefined && (body.site_id || undefined) !== (u.site_id || undefined)) ||
    (body.all_categories !== undefined && (body.all_categories === true) !== (u.all_categories === true || !(u.categories || []).length)) ||
    (body.categories !== undefined && body.all_categories !== true && cats(body.categories) !== cats(u.categories))
  );
};

apiRouter.post("/users", authenticate, (req, res) => {
  const actor = (req as any).user as User;
  const { email, full_name, phone, department, role_code, warehouse_id, site_id, password } = req.body;
  const photoErr = photoError(req.body.photo_url);
  if (photoErr) return res.status(400).json({ detail: photoErr });
  const roleErr = roleAssignError(actor, role_code || "marketeur");
  if (roleErr) return res.status(403).json({ detail: roleErr });
  const access = categoryAccess(req.body);
  if (access && !access.all_categories && !access.categories.length) return res.status(400).json({ detail: "Choisissez au moins une catégorie, ou donnez l'accès à toutes les catégories" });
  if (!email || !password) return res.status(400).json({ detail: "Email et mot de passe requis" });
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase().trim())) {
    return res.status(400).json({ detail: "Cet email est déjà utilisé" });
  }

  const newUser: User = {
    id: uuidv4(),
    email: email.toLowerCase().trim(),
    full_name: full_name || email,
    phone,
    position: String(req.body.position || "").trim() || undefined,
    photo_url: req.body.photo_url || undefined,
    department: access ? access.department : department,
    ...(access ? { categories: access.categories, all_categories: access.all_categories } : {}),
    role_code: role_code || "marketeur",
    warehouse_id,
    site_id: site_id || undefined,
    is_active: true,
    password_hash: bcrypt.hashSync(password, 10),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.users.push(newUser);
  const { password_hash, ...pub } = newUser;
  res.status(201).json(pub);
});

apiRouter.put("/users/:id", authenticate, (req, res) => {
  const actor = (req as any).user as User;
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ detail: "Utilisateur introuvable" });
  if (isSuperAdmin(user) && !isSuperAdmin(actor)) return res.status(403).json({ detail: "Le super administrateur est protégé : seul un super administrateur peut le modifier" });
  const touchesProfile = ["full_name", "phone", "email", "role_code", "password", "is_active", "warehouse_id", "position", "photo_url"].some((k) => req.body[k] !== undefined && (k === "password" ? !!req.body.password : (req.body[k] ?? "") !== ((user as any)[k] ?? "")));
  if (touchesProfile && !can(actor, "users.update")) return res.status(403).json({ detail: "Permission requise : Modifier un utilisateur", code: "PERMISSION_DENIED" });
  if (req.body.is_active === false && user.is_active && !can(actor, "users.delete"))
    return res.status(403).json({ detail: "Permission requise : Désactiver un utilisateur", code: "PERMISSION_DENIED" });
  if (user.id === actor.id && req.body.is_active === false) return res.status(409).json({ detail: "Vous ne pouvez pas désactiver votre propre compte" });
  if (scopeFieldsChanged(user, req.body) && !can(actor, "users.scope")) return res.status(403).json({ detail: "Permission requise : Attribuer les sites et départements", code: "PERMISSION_DENIED" });
  if (req.body.role_code && req.body.role_code !== user.role_code) {
    const roleErr = roleAssignError(actor, req.body.role_code);
    if (roleErr) return res.status(403).json({ detail: roleErr });
  }
  if (isSuperAdmin(user) && (req.body.is_active === false || (req.body.role_code && req.body.role_code !== "super_admin"))) {
    const others = db.users.filter((u) => u.id !== user.id && isSuperAdmin(u) && u.is_active).length;
    if (!others) return res.status(409).json({ detail: "Impossible : c'est le dernier super administrateur actif" });
  }
  if (req.body.full_name) user.full_name = req.body.full_name;
  if (req.body.phone !== undefined) user.phone = req.body.phone;
  if (req.body.position !== undefined) user.position = String(req.body.position || "").trim() || undefined;
  if (req.body.photo_url !== undefined) {
    const photoErr = photoError(req.body.photo_url);
    if (photoErr) return res.status(400).json({ detail: photoErr });
    user.photo_url = req.body.photo_url || undefined;
  }
  if (req.body.department !== undefined) user.department = req.body.department;
  const access = categoryAccess(req.body);
  if (access && !access.all_categories && !access.categories.length) return res.status(400).json({ detail: "Choisissez au moins une catégorie, ou donnez l'accès à toutes les catégories" });
  if (access) Object.assign(user, access);
  if (req.body.role_code) user.role_code = req.body.role_code;
  if (req.body.warehouse_id !== undefined) user.warehouse_id = req.body.warehouse_id;
  if (req.body.site_id !== undefined) user.site_id = req.body.site_id || undefined;
  if (req.body.is_active !== undefined) user.is_active = req.body.is_active;
  if (req.body.password) user.password_hash = bcrypt.hashSync(req.body.password, 10);
  user.updated_at = new Date().toISOString();
  const { password_hash, ...pub } = user;
  res.json(pub);
});

apiRouter.delete("/users/:id", authenticate, (req, res) => {
  const actor = (req as any).user as User;
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ detail: "Utilisateur introuvable" });
  if (user.id === actor.id) return res.status(409).json({ detail: "Vous ne pouvez pas désactiver votre propre compte" });
  if (isSuperAdmin(user) && !isSuperAdmin(actor)) return res.status(403).json({ detail: "Le super administrateur est protégé" });
  if (isSuperAdmin(user) && !db.users.some((u) => u.id !== user.id && isSuperAdmin(u) && u.is_active))
    return res.status(409).json({ detail: "Impossible : c'est le dernier super administrateur actif" });
  user.is_active = false;
  user.updated_at = new Date().toISOString();
  res.json({ ok: true });
});

// STOCK : sites, dépôts, quantités par dépôt, transferts, catégories
mountStockStructureRoutes(apiRouter, authenticate);
// LIVRAISON : stock embarqué, livraisons sur commande, modes par département
mountDeliveryRoutes(apiRouter, authenticate);
mountStockReportRoutes(apiRouter, authenticate);
// INTÉGRATION entre Gestion commerciale et Stock & Livraison (référentiels, catalogue, ventes)
mountIntegrationRoutes(apiRouter, authenticate);

// WAREHOUSES
apiRouter.get("/warehouses", authenticate, (req, res) => {
  res.json(db.warehouses);
});

// PRODUCTS
apiRouter.get("/products", authenticate, (req, res) => {
  const q = ((req.query.q as string) || "").toLowerCase();
  let list = db.products.filter((p) => p.is_active !== false);
  if (q) {
    list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  }
  res.json(list);
});

apiRouter.get("/stock/products", authenticate, (req, res) => {
  const q = ((req.query.q as string) || "").toLowerCase();
  let list = db.products.filter((p) => p.is_active !== false);
  if (q) {
    list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  }
  res.json(list);
});

apiRouter.post("/products", authenticate, (req, res) => {
  const p = req.body;
  const sellPrice = Number(p.sell_price) || 0;
  const newProduct: Product = {
    id: uuidv4(),
    code: p.code || `PRD-${Date.now().toString().slice(-4)}`,
    name: p.name,
    category: p.category,
    size: p.size ? String(p.size).trim() : undefined,
    unit: p.unit || "unité",
    cost_price: Number(p.cost_price) || 0,
    sell_price: sellPrice,
    price_fc: p.price_fc ? Number(p.price_fc) : Math.round(sellPrice * 2500),
    badge: p.badge || undefined,
    image_url: p.image_url || undefined,
    currency: p.currency || "USD",
    warehouse_id: p.warehouse_id || db.warehouses[0]?.id,
    stock: Number(p.stock) || 0,
    current_stock: Number(p.stock) || 0,
    alert_threshold: Number(p.alert_threshold || p.low_stock_threshold) || 5,
    low_stock_threshold: Number(p.low_stock_threshold || p.alert_threshold) || 5,
    bonus_rules: p.bonus_rules || [],
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.products.push(newProduct);
  res.status(201).json(newProduct);
});

apiRouter.put("/products/:id", authenticate, (req, res) => {
  const prod = db.products.find((p) => p.id === req.params.id);
  if (!prod) return res.status(404).json({ detail: "Produit introuvable" });
  Object.assign(prod, req.body, { updated_at: new Date().toISOString() });
  if (req.body.stock !== undefined) prod.current_stock = req.body.stock;
  res.json(prod);
});

// Suppression d'un produit : archivé (is_active = false) pour conserver l'historique des commandes et mouvements.
// Refusée tant qu'il reste du stock, pour ne pas faire disparaître de la valeur du stock.
apiRouter.delete("/products/:id", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const prod = db.products.find((p) => p.id === req.params.id && p.is_active !== false);
  if (!prod) return res.status(404).json({ detail: "Produit introuvable" });
  const qty = Number(prod.stock ?? prod.current_stock ?? 0) || 0;
  if (qty > 0)
    return res.status(409).json({
      detail: `Impossible de supprimer « ${prod.name} » : il reste ${qty} ${prod.unit || "unité(s)"} en stock. Videz d'abord son stock (ajustement ou transfert).`,
    });
  prod.is_active = false;
  (prod as any).deleted_at = new Date().toISOString();
  (prod as any).deleted_by = user?.full_name;
  prod.updated_at = new Date().toISOString();
  res.json({ ok: true });
});

apiRouter.post("/products/:id/adjust", authenticate, (req, res) => {
  const delta = Number(req.body.quantity) || 0;
  const reason = req.body.reason || "Ajustement";
  const prod = db.products.find((p) => p.id === req.params.id);
  if (!prod) return res.status(404).json({ detail: "Produit introuvable" });
  prod.stock = Math.max(0, prod.stock + delta);
  prod.current_stock = prod.stock;
  prod.updated_at = new Date().toISOString();
  db.stock_movements.unshift({
    id: uuidv4(),
    product_id: prod.id,
    product_name: prod.name,
    quantity: delta,
    type: delta >= 0 ? "in" : "out",
    reason,
    at: new Date().toISOString(),
  });
  res.json(prod);
});

export function recordAccountingMovement(params: {
  module: "orders" | "cash" | "stock";
  reference: string;
  source: string;
  title: string;
  debit_account: string;
  credit_account: string;
  amount: number;
  document_url?: string;
  document_name?: string;
  billetage?: any;
  operation_id?: string;
  user_name?: string;
}) {
  const mov = {
    id: uuidv4(),
    module: params.module,
    date: new Date().toISOString().split("T")[0],
    reference: params.reference,
    source: params.source,
    source_doc: params.reference,
    title: params.title,
    debit_account: params.debit_account,
    credit_account: params.credit_account,
    amount: Math.round(params.amount * 100) / 100,
    document_url: params.document_url,
    document_name: params.document_name,
    billetage: params.billetage,
    operation_id: params.operation_id,
    user_name: params.user_name, // utilisateur ayant effectué l'opération
    is_recorded: false,
    status: "unrecorded",
    created_at: new Date().toISOString(),
  };
  db.accounting_movements.unshift(mov);
  return mov;
}

/*
 * Taux de change par catégorie de produits (Caisse › Taux) : il fixe le taux de
 * toutes les transactions de la catégorie (vente en boutique, encaissement).
 */
export function categoryRate(category?: string | null) {
  const r = category ? Number(db.rates_config?.category_rates?.[category]) : 0;
  return r > 0 ? r : Number(db.rates_config?.general_rate) || 2500;
}
/** Catégorie de produits d'une commande (celle de ses articles). */
export function orderCategory(order: any): string | undefined {
  for (const it of order?.items || []) {
    const cat = db.products.find((p) => p.id === it.product_id)?.category;
    if (cat) return cat;
  }
  return undefined;
}
export const orderRate = (order: any) => categoryRate(orderCategory(order));

/* ---------- Caisses par site ----------
 * Chaque site a sa propre caisse (une session ouverte au plus par site).
 * Une caissière rattachée à un site n'opère que la caisse de son site ;
 * le super administrateur, le DG et les utilisateurs transversaux choisissent le site (en-tête X-Cash-Site).
 */
const CASH_ALL_SITES_ROLES = ["super_admin", "dg"];
export function cashSiteLocked(u?: User | null) {
  // Accès transversal « Caisses de tous les sites » : la caisse n'est plus verrouillée sur le site de l'utilisateur
  return !!u?.site_id && !CASH_ALL_SITES_ROLES.includes(u.role_code) && !u.is_transversal && scopeOf(u, "cash").all_sites !== true;
}
/** Créances : verrouillées sur le site de l'utilisateur, sauf accès transversal « Clients (CRM) et créances » */
export function creditSiteLocked(u?: User | null) {
  return !!u?.site_id && !CASH_ALL_SITES_ROLES.includes(u.role_code) && !u.is_transversal && scopeOf(u, "clients").all_sites !== true;
}
export function sessionSiteId(s: CashSession) {
  return s.site_id || userSite(null).id;
}
export function cashSiteFor(user?: User | null, requested?: any): string | null {
  if (cashSiteLocked(user)) {
    // Utilisateur rattaché à plusieurs sites : il choisit parmi ses sites uniquement
    const r = typeof requested === "string" ? requested : "";
    const mine = scopeOf(user).site_ids;
    return r && mine.includes(r) ? r : userSite(user).id;
  }
  const r = typeof requested === "string" ? requested : "";
  return (r && r !== "all" ? r : null) || userSite(user).id;
}
const requestedCashSite = (req: any) => req.body?.site_id || req.query?.site_id || req.headers?.["x-cash-site"];
export function openSessionOf(siteId: string | null) {
  return db.cash_sessions.find((s) => s.status === "open" && sessionSiteId(s) === siteId);
}
const siteNameOf = (id: string | null) => userSite({ site_id: id || undefined }).name;

export function recordCashInflow(params: {
  amount: number;
  category: string;
  reason: string;
  reference: string;
  client_id?: string;
  client_name?: string;
  payment_method?: string;
  userName: string;
  document_url?: string;
  document_name?: string;
  billetage?: any;
  department?: string;
  currency?: "USD" | "CDF";
  exchange_rate?: number;
  site_id?: string | null;
}) {
  const siteId = params.site_id || userSite(null).id;
  let openSession = openSessionOf(siteId);
  if (!openSession) {
    openSession = {
      id: uuidv4(),
      site_id: siteId || undefined,
      site_name: siteNameOf(siteId),
      opened_by: "system",
      opened_by_name: params.userName || "Système",
      opened_at: new Date().toISOString(),
      initial_balance: 0,
      exchange_rate: params.exchange_rate || 2500,
      status: "open",
    };
    db.cash_sessions.unshift(openSession);
  }

  const rate = params.exchange_rate || openSession.exchange_rate || 2500;
  const opCurrency = params.currency || "USD";
  const numAmount = params.amount || 0;
  const amountUSD = opCurrency === "USD" ? numAmount : Math.round((numAmount / rate) * 100) / 100;
  const amountCDF = opCurrency === "CDF" ? numAmount : Math.round(numAmount * rate);

  const op: CashOperation = {
    id: uuidv4(),
    session_id: openSession.id,
    type: "in",
    category: params.category,
    amount: Math.round(params.amount * 100) / 100,
    currency: opCurrency,
    amount_usd: amountUSD,
    amount_cdf: amountCDF,
    exchange_rate: rate,
    reason: params.reason,
    reference: params.reference,
    client_id: params.client_id,
    client_name: params.client_name,
    payment_method: params.payment_method || "cash",
    document_url: params.document_url,
    document_name: params.document_name,
    billetage: params.billetage,
    department: params.department || openSession.department || "Maize Mill",
    created_at: new Date().toISOString(),
    created_by: params.userName,
  };
  db.cash_operations.unshift(op);

  // Automatically record accounting entry for the cash inflow
  try {
    recordAccountingMovement({
      module: "cash",
      reference: params.reference,
      source: `Caisse - ${params.category}`,
      title: params.reason || `Entrée de Caisse (${params.category})`,
      debit_account: "571100 - Caisse Centrale",
      credit_account: params.client_id ? "411100 - Clients" : "701100 - Recettes d'exploitation",
      amount: amountUSD,
      document_url: params.document_url,
      document_name: params.document_name,
      billetage: params.billetage,
      operation_id: op.id,
      user_name: params.userName,
    });
  } catch (e) {
    console.warn("Accounting movement auto-record skipped:", e);
  }

  return op;
}

// CLIENTS ACCOUNT LOGIC
export const clientDocumentStore = new Map<
  string,
  { data: string; name: string; type: string; size: string; uploaded_at: string }
>();

export function getClientDocumentUrl(client: any): string | null {
  if (!client) return null;
  const stored = clientDocumentStore.get(client.id);
  if (stored?.data) return stored.data;
  if (client.document_url && client.document_url.startsWith("data:")) return client.document_url;
  return client.document_url || null;
}

export function getClientAccountData(clientId: string) {
  const client = db.clients.find((c) => c.id === clientId || c.code === clientId);
  if (!client) return null;

  const actualId = client.id;
  const orders = db.orders.filter(
    (o) => (o.client_id === actualId || o.client_id === client.code) && o.status !== "cancelled" && o.status !== "pending_approval"
  );
  const payments = db.cash_operations.filter(
    (op) => (op.client_id === actualId || op.client_id === client.code) && op.type === "in" && !op.is_reversed
  );

  const txList: any[] = [];

  for (const o of orders) {
    txList.push({
      id: o.id,
      type: "order",
      title: "COMMANDE (TOUT PRODUIT)",
      code: o.code,
      date: o.created_at,
      created_at: o.created_at,
      amount: o.total,
      total: o.total,
      total_fc: o.total_fc,
      currency: o.currency,
      payment_method: o.payment_method,
      payment_status: o.payment_status,
      client_name: client.name,
      client_phone: client.phone,
      delivery_address: o.delivery_address || client.address,
      marketer_name: o.marketer_name,
      delta_display: `-${Math.round(o.total).toLocaleString()} $`,
      delta_sign: "-",
      items: o.items || [],
      notes: o.notes,
      status: o.status,
    });
  }

  for (const p of payments) {
    const methodStr = (p.payment_method || "BY CASH").toUpperCase();
    txList.push({
      id: p.id,
      operation_id: p.id,
      type: "payment",
      title: `PAIEMENT / DÉPÔT (${methodStr})`,
      code: p.reference || `PAI-${p.id.slice(0, 6)}`,
      date: p.created_at,
      amount: p.amount,
      amount_usd: p.amount_usd || p.amount,
      amount_cdf: p.amount_cdf || 0,
      currency: p.currency || "USD",
      exchange_rate: p.exchange_rate,
      department: p.department,
      category: p.category,
      created_by: p.created_by,
      delta_display: `+${Math.round(p.amount).toLocaleString()} $`,
      delta_sign: "+",
      payment_method: p.payment_method || "cash",
      notes: p.reason,
      document_url: p.document_url,
      document_name: p.document_name,
      billetage: p.billetage,
      status: "completed",
    });
  }

  txList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let runningSolde = -(client.initial_balance || 0);
  for (const tx of txList) {
    if (tx.type === "payment") runningSolde += tx.amount;
    else if (tx.type === "order") runningSolde -= tx.amount;
    tx.nouveau_solde = Math.round(runningSolde * 100) / 100;
    tx.solde_type = tx.nouveau_solde > 0 ? "advance" : tx.nouveau_solde < 0 ? "credit" : "zero";
  }

  const finalSolde = Math.round(runningSolde * 100) / 100;
  client.balance = finalSolde;
  client.current_credit = finalSolde < 0 ? Math.abs(finalSolde) : 0;

  const totalCommandes = orders.reduce((sum, o) => sum + o.total, 0);
  const totalPaiements = payments.reduce((sum, p) => sum + p.amount, 0);
  const creditLimit = client.credit_limit || 0;
  const creditDebt = finalSolde < 0 ? Math.abs(finalSolde) : 0;
  const advanceAmount = finalSolde > 0 ? finalSolde : 0;
  const creditDisponible = Math.max(0, creditLimit - creditDebt);

  return {
    client: {
      ...client,
      credit_limit: creditLimit,
      current_credit: creditDebt,
      current_balance: finalSolde,
      balance: finalSolde,
      solde_actuel: finalSolde,
      solde_type: finalSolde > 0 ? "advance" : finalSolde < 0 ? "credit" : "zero",
      advance_amount: advanceAmount,
      credit_debt: creditDebt,
      document_url: getClientDocumentUrl(client),
    },
    solde_actuel: finalSolde,
    solde_type: finalSolde > 0 ? "advance" : finalSolde < 0 ? "credit" : "zero",
    advance_amount: advanceAmount,
    credit_debt: creditDebt,
    total_commandes: totalCommandes,
    total_paiements: totalPaiements,
    credit_limit: creditLimit,
    credit_disponible: creditDisponible,
    transactions: txList,
    ventes_par_produit: [],
  };
}

export function getClientFinancialSnapshot(clientId: string, orderTotalUSD: number, paymentMethod: string) {
  const client = db.clients.find((c) => c.id === clientId);
  if (!client) {
    return {
      client_id: clientId,
      client_name: "Client Inconnu",
      client_code: "CLI-000",
      credit_limit: 0,
      current_balance: 0,
      solde_actuel: 0,
      available_credit: 0,
      order_amount: orderTotalUSD,
      payment_method: paymentMethod || "cash",
      is_credit: paymentMethod === "credit",
      projected_balance: orderTotalUSD,
      is_exceeded: false,
      exceeded_amount: 0,
    };
  }

  const acct = getClientAccountData(client.id);
  const soldeActuel = acct ? acct.solde_actuel : (client.balance || 0);
  const currentDebt = soldeActuel < 0 ? Math.abs(soldeActuel) : 0;
  const creditLimit = client.credit_limit || 0;
  const availableCredit = Math.max(0, Math.round((creditLimit - currentDebt) * 100) / 100);

  const projectedSolde = Math.round((soldeActuel - orderTotalUSD) * 100) / 100;
  const projectedDebt = projectedSolde < 0 ? Math.abs(projectedSolde) : 0;

  const isCredit = paymentMethod === "credit";
  const isExceeded = isCredit && creditLimit > 0 && projectedDebt > creditLimit;
  const exceededAmount = isExceeded ? Math.round((projectedDebt - creditLimit) * 100) / 100 : 0;

  return {
    client_id: client.id,
    client_name: client.name,
    client_code: client.code,
    credit_limit: creditLimit,
    current_balance: currentDebt,
    solde_actuel: soldeActuel,
    available_credit: availableCredit,
    order_amount: orderTotalUSD,
    payment_method: paymentMethod || "cash",
    is_credit: isCredit,
    projected_balance: projectedDebt,
    is_exceeded: isExceeded,
    exceeded_amount: exceededAmount,
  };
}

// Périmètre CRM : un client rattaché à un site ou à un département hors périmètre n'est pas visible
function clientInScope(u: User, c: any) {
  if (c.site_id && !inSiteScope(u, c.site_id, "clients") && ((db as any).sites || []).some((s: any) => s.id === c.site_id)) return false;
  const bu = c.business_unit;
  if (bu && db.product_categories.some((x) => x.toLowerCase() === String(bu).toLowerCase()) && !inCategoryScope(u, bu, "clients")) return false;
  return true;
}

apiRouter.get("/clients", authenticate, (req, res) => {
  const q = ((req.query.q as string) || "").toLowerCase();
  let list = db.clients.filter((c) => clientInScope((req as any).user, c));
  if (q) {
    list = list.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)));
  }
  const enriched = list.map((c) => {
    const acct = getClientAccountData(c.id);
    const solde = acct ? acct.solde_actuel : (c.balance || 0);
    return {
      ...c,
      document_url: getClientDocumentUrl(c),
      current_balance: solde,
      balance: solde,
      solde_actuel: solde,
    };
  });
  res.json(enriched);
});

apiRouter.post("/clients", authenticate, (req, res) => {
  const c = req.body;
  const clientId = uuidv4();
  const bu = c.business_unit || c.department || c.product_name || "Boissons";
  const newClient: Client = {
    id: clientId,
    code: c.code || `CLI-${Date.now().toString().slice(-4)}`,
    name: c.name,
    type: c.type || "Grossiste",
    phone: c.phone || "",
    secondary_phone: c.secondary_phone || "",
    email: c.email || "",
    address: c.address || "",
    city: c.city || "Goma, RDC",
    business_unit: bu,
    department: bu,
    marketer_name: c.marketer_name || "Patrick K.",
    credit_limit: Number(c.credit_limit) || 0,
    current_credit: 0,
    balance: 0,
    photo_url: c.photo_url || "",
    document_url: c.document_url || "",
    document_name: c.document_name || "",
    document_type: c.document_type || "",
    document_size: c.document_size || "",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.clients.push(newClient);
  res.status(201).json(newClient);
});

apiRouter.get("/clients/:id/account", authenticate, (req, res) => {
  const data = getClientAccountData(req.params.id);
  if (!data) return res.status(404).json({ detail: "Client introuvable" });
  res.json(data);
});

apiRouter.put("/clients/:id", authenticate, (req, res) => {
  const client = db.clients.find((c) => c.id === req.params.id || c.code === req.params.id);
  if (!client) return res.status(404).json({ detail: "Client introuvable" });
  Object.assign(client, req.body, { updated_at: new Date().toISOString() });
  res.json({ ...client, document_url: getClientDocumentUrl(client) });
});

apiRouter.post("/clients/:id/photo", authenticate, (req, res) => {
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ detail: "Client introuvable" });
  client.photo_url = req.body.photo_url;
  client.updated_at = new Date().toISOString();
  res.json({ ok: true, photo_url: client.photo_url });
});

apiRouter.post("/clients/:id/adjust-credit-limit", authenticate, (req, res) => {
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ detail: "Client introuvable" });
  client.credit_limit = Number(req.body.credit_limit) || 0;
  client.updated_at = new Date().toISOString();
  res.json(getClientAccountData(client.id));
});

apiRouter.post("/clients/:id/document", authenticate, (req, res) => {
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ detail: "Client introuvable" });
  const { document_url, document_name, document_type, document_size } = req.body;
  client.document_url = document_url;
  client.document_name = document_name || "Document_Client.pdf";
  client.document_type = document_type || "Document PDF";
  client.document_size = document_size || "";
  client.document_uploaded_at = new Date().toISOString();
  client.updated_at = new Date().toISOString();
  res.json({ ok: true, client });
});

apiRouter.post("/clients/:id/payments", authenticate, (req, res) => {
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ detail: "Client introuvable" });
  const user = (req as any).user as User;

  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ detail: "Le montant doit être supérieur à 0" });
  // Encaissement d'une créance précise (module Crédits)
  const targetCredit: any = req.body.credit_id ? db.credits.find((c: any) => c.id === req.body.credit_id) : null;
  if (req.body.credit_id && !targetCredit) return res.status(404).json({ detail: "Créance introuvable" });
  if (targetCredit) {
    const due = targetCredit.remaining ?? targetCredit.balance ?? 0;
    const inUsd = req.body.currency === "CDF" ? amount / (Number(req.body.exchange_rate) || 2500) : amount;
    if (due <= 0) return res.status(400).json({ detail: "Cette créance est déjà soldée" });
    if (inUsd > due + 0.005) return res.status(400).json({ detail: `Le montant dépasse le reste dû (${due.toFixed(2)} $)` });
  }
  const payment_method = req.body.payment_method || "cash";
  const notes = req.body.notes || `Règlement direct client ${client.name}`;
  const reference = req.body.reference || `ENC-${Date.now().toString().slice(-6)}`;
  const department = req.body.department || client.department || "Maize Mill";
  const currency = req.body.currency === "CDF" ? "CDF" : "USD";
  // Créance liée à une vente : taux de la catégorie de cette vente ; sinon taux choisi / taux de la catégorie
  const creditOrder = targetCredit?.order_id ? db.orders.find((o) => o.id === targetCredit.order_id) : null;
  const exchange_rate = creditOrder ? orderRate(creditOrder) : Number(req.body.exchange_rate) || categoryRate(department);
  const billetage = req.body.billetage;
  const document_url = req.body.document_url;
  const document_name = req.body.document_name;

  recordCashInflow({
    amount,
    category: "RÈGLEMENT DIRECT CLIENT",
    reason: notes,
    reference,
    client_id: client.id,
    client_name: client.name,
    payment_method,
    userName: user.full_name,
    department,
    currency,
    exchange_rate,
    billetage,
    document_url,
    document_name,
    site_id: cashSiteFor(user, requestedCashSite(req)),
  });

  // Convert amount to USD for balance reduction if paid in CDF
  const amountInUSD = currency === "USD" ? amount : Math.round((amount / exchange_rate) * 100) / 100;
  client.balance = Math.round(((client.balance || 0) + amountInUSD) * 100) / 100;
  client.current_credit = Math.max(0, -client.balance);
  client.updated_at = new Date().toISOString();

  // Also update corresponding db.credits item if present
  let remToDeduct = amountInUSD;
  const clientCredits = db.credits.filter(
    (c) => (c.client_id === client.id || c.client_name === client.name) && (c.remaining || c.balance || 0) > 0
  );
  // La créance choisie est réglée en premier
  if (targetCredit) clientCredits.sort((a: any, b: any) => (a.id === targetCredit.id ? -1 : b.id === targetCredit.id ? 1 : 0));
  for (const cr of clientCredits) {
    if (remToDeduct <= 0) break;
    const currentRem = cr.remaining !== undefined ? cr.remaining : (cr.balance || 0);
    const deduction = Math.min(currentRem, remToDeduct);
    cr.paid = Math.round(((cr.paid || 0) + deduction) * 100) / 100;
    (cr.payments ||= []).push({ id: uuidv4(), amount: Math.round(deduction * 100) / 100, currency: "USD", method: payment_method, date: new Date().toISOString(), cashier_name: user.full_name, billetage, notes: reference });
    cr.remaining = Math.round((currentRem - deduction) * 100) / 100;
    cr.balance = cr.remaining;
    if (cr.remaining <= 0) {
      cr.status = "paid";
    } else {
      cr.status = "partial";
    }
    remToDeduct -= deduction;
  }

  res.status(201).json(getClientAccountData(client.id));
});

apiRouter.post("/clients/:id/transactions/:txId/reverse", authenticate, (req, res) => {
  const client = db.clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ detail: "Client introuvable" });

  const payment = db.cash_operations.find((op) => op.id === req.params.txId && op.client_id === client.id);
  if (payment) {
    payment.is_reversed = true;
    return res.json(getClientAccountData(client.id));
  }

  const order = db.orders.find((o) => o.id === req.params.txId && o.client_id === client.id);
  if (order) {
    if (order.status !== "cancelled") restoreOrderStock(order, (req as any).user as User, "Annulation");
    order.status = "cancelled";
    cancelCreditForOrder(order);
    return res.json(getClientAccountData(client.id));
  }

  res.status(404).json({ detail: "Transaction introuvable" });
});

// ORDERS
apiRouter.get("/orders", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const canSeeAll = user.role_code === "super_admin" || user.role_code === "chef_dept" || user.is_transversal || can(user, "orders.all") || can(user, "orders.approve");
  let list = db.orders;
  if (!canSeeAll) list = list.filter((o) => o.marketer_id === user.id);
  const q = ((req.query.q as string) || "").toLowerCase();
  const status = req.query.status as string;
  if (status && status !== "all") list = list.filter((o) => o.status === status);
  if (q) list = list.filter((o) => o.code.toLowerCase().includes(q) || o.client_name.toLowerCase().includes(q));
  // Site et dépôt de chaque commande ; un utilisateur rattaché à un site ne voit que les commandes de son site
  // (la direction et les utilisateurs transversaux voient tous les sites)
  // Le périmètre (sites attribués, accès transversal aux commandes) est appliqué juste en dessous
  const siteLocked = false;
  let located = list.map((ord) => ({ ...ord, ...orderLocation(ord) }));
  if (siteLocked) located = located.filter((o) => o.site_id === user.site_id);
  // Périmètre : sites et départements (catégories de produits) attribués à l'utilisateur
  located = located.filter((o) => inSiteScope(user, o.site_id, "orders") && orderInCategoryScope(user, o));
  const siteQ = req.query.site_id as string;
  const depotQ = req.query.warehouse_id as string;
  if (siteQ && siteQ !== "all") located = located.filter((o) => o.site_id === siteQ);
  if (depotQ && depotQ !== "all") located = located.filter((o) => o.warehouse_id === depotQ);
  res.json(located.map((ord) => ({ ...ord, credit_check: getClientFinancialSnapshot(ord.client_id, ord.total, ord.payment_method) })));
});

// Une commande hors du périmètre de l'utilisateur est traitée comme introuvable (pas de fuite par identifiant)
function orderVisibleTo(u: User, o: any) {
  const loc = orderLocation(o);
  const own = o.marketer_id === u.id;
  const all = u.role_code === "super_admin" || u.role_code === "chef_dept" || u.is_transversal || can(u, "orders.all") || can(u, "orders.approve");
  return (own || all) && inSiteScope(u, loc.site_id, "orders") && orderInCategoryScope(u, o);
}

apiRouter.get("/orders/:id", authenticate, (req, res) => {
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order || !orderVisibleTo((req as any).user, order)) return res.status(404).json({ detail: "Commande introuvable" });
  res.json({ ...order, credit_check: getClientFinancialSnapshot(order.client_id, order.total, order.payment_method) });
});

apiRouter.get("/orders/:id/credit-check", authenticate, (req, res) => {
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order || !orderVisibleTo((req as any).user, order)) return res.status(404).json({ detail: "Commande introuvable" });
  res.json(getClientFinancialSnapshot(order.client_id, order.total, order.payment_method));
});

apiRouter.post("/orders", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const { client_id, client_name, client_phone, items, payment_method, notes, delivery_address, source, currency } = req.body;

  let client = client_id ? db.clients.find((c) => c.id === client_id) : null;
  if (!client && client_name) {
    client = {
      id: uuidv4(),
      code: `CLI-${Date.now().toString().slice(-4)}`,
      name: client_name,
      type: "Détaillant",
      phone: client_phone || "",
      address: delivery_address || "Goma, RDC",
      city: "Goma, RDC",
      credit_limit: 1000,
      current_credit: 0,
      balance: 0,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.clients.push(client);
  }

  if (!client) return res.status(400).json({ detail: "Client introuvable" });

  // Une commande hors Boutique est créée directement « validée » : elle exige le droit « Créer une commande »,
  // sinon elle passerait outre l'approbation
  if (source !== "boutique" && !can(user, "orders.create"))
    return res.status(403).json({ detail: "Permission requise : Créer une commande (hors Boutique, sans approbation)", code: "PERMISSION_DENIED" });
  if (source === "boutique" && !can(user, "boutique.order"))
    return res.status(403).json({ detail: "Permission requise : Passer une commande (panier)", code: "PERMISSION_DENIED" });
  // Départements de l'utilisateur : il ne commande que les produits de ses catégories
  const outOfScope = (items || [])
    .map((it: any) => db.products.find((p) => p.id === it.product_id))
    .filter((p: any) => p && !inCategoryScope(user, p.category, "catalog"));
  if (outOfScope.length)
    return res.status(403).json({
      detail: `Produit hors de vos départements : ${outOfScope.map((p: any) => p.name).join(", ")}`,
      code: "SCOPE_DENIED",
    });

  // Produit marqué « Indisponible » (Boutique › Catégories) : la commande est refusée avec un message clair
  const unavailable = (items || [])
    .map((it: any) => db.products.find((p) => p.id === it.product_id))
    .filter((p: any) => p && p.available === false);
  if (unavailable.length)
    return res.status(409).json({
      detail: `Produit indisponible : ${unavailable.map((p: any) => p.name).join(", ")}. Il ne peut pas être commandé pour le moment.`,
      unavailable: unavailable.map((p: any) => p.id),
    });

  let subtotalUSD = 0;
  let subtotalFC = 0;

  const enrichedItems: OrderItem[] = (items || []).map((it: any) => {
    const prod = db.products.find((p) => p.id === it.product_id);
    const qty = Number(it.quantity) || 1;
    const priceUSD = it.unit_price !== undefined ? Number(it.unit_price) : prod?.sell_price || 0;
    // Prix en FC au taux de la catégorie du produit (Caisse › Taux)
    const priceFC = it.unit_price_fc !== undefined ? Number(it.unit_price_fc) : Math.round(priceUSD * categoryRate(prod?.category));
    const lineTotalUSD = qty * priceUSD;
    const lineTotalFC = qty * priceFC;
    subtotalUSD += lineTotalUSD;
    subtotalFC += lineTotalFC;
    return {
      product_id: it.product_id,
      product_code: prod?.code || it.product_code,
      product_name: prod?.name || it.product_name,
      unit: prod?.unit || it.unit || "Unité",
      quantity: qty,
      unit_price: priceUSD,
      unit_price_fc: priceFC,
      discount: 0,
      line_total: lineTotalUSD,
      line_total_fc: lineTotalFC,
    };
  });

  const totalUSD = Math.round(subtotalUSD * 100) / 100;
  const totalFC = Math.round(subtotalFC);

  const isBoutique = source === "boutique";
  // Numéro unique : on avance tant que le code existe déjà
  let orderCount = db.orders.length + 1;
  const makeCode = (n: number) => (isBoutique ? `CMD-${String(n + 150).padStart(5, "0")}` : `CMD-2026-${String(n).padStart(4, "0")}`);
  while (db.orders.some((o) => o.code === makeCode(orderCount))) orderCount++;
  const orderCode = makeCode(orderCount);

  const isCash = payment_method === "cash";

  const newOrder: Order = {
    id: uuidv4(),
    code: orderCode,
    client_id: client.id,
    client_name: client.name,
    client_phone: client.phone,
    marketer_id: user.id,
    marketer_name: user.full_name,
    business_unit_id: user.business_unit_id || "bu_goma",
    site_id: user.site_id || "site_goma_principal",
    source: isBoutique ? "boutique" : "standard",
    currency: currency || (isBoutique ? "CDF" : "USD"),
    items: enrichedItems,
    subtotal: totalUSD,
    subtotal_fc: totalFC,
    discount: 0,
    total: totalUSD,
    total_fc: totalFC,
    amount_paid: 0,
    amount_paid_fc: 0,
    outstanding: totalUSD,
    outstanding_fc: totalFC,
    payment_method: payment_method || "cash",
    payment_status: "unpaid",
    cash_deposit_status: isCash ? "pending_deposit" : "not_applicable",
    status: isBoutique ? "pending_approval" : "validated",
    delivery_address: delivery_address || client.address,
    notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Source du stock de chaque ligne selon le classement du produit dans le module Livraison
  const sourceError = tagOrderStockSource(newOrder, { strict: true });
  if (sourceError) return res.status(400).json({ detail: sourceError });
  db.orders.unshift(newOrder);
  ensureCreditForOrder(newOrder);
  res.status(201).json(newOrder);
});

/* ---------- Ventes à crédit → créances (module Crédits) ---------- */
// Une vente à crédit validée crée une créance unique, à encaisser plus tard en caisse
function ensureCreditForOrder(order: Order) {
  if (order.payment_method !== "credit" || ["pending_approval", "cancelled", "rejected"].includes(order.status)) return;
  if (db.credits.some((c: any) => c.order_id === order.id)) return;
  const client = db.clients.find((c) => c.id === order.client_id);
  db.credits.unshift({
    id: uuidv4(),
    order_id: order.id,
    order_code: order.code,
    client_id: order.client_id,
    client_name: order.client_name,
    client_code: client?.code,
    client_phone: order.client_phone || client?.phone,
    marketer_id: order.marketer_id,
    marketer_name: order.marketer_name,
    initial_amount: Number(order.total) || 0,
    paid: 0,
    remaining: Number(order.total) || 0,
    balance: Number(order.total) || 0,
    currency: "USD",
    status: "pending",
    due_date: new Date(Date.now() + 86400000 * 30).toISOString(),
    created_at: new Date().toISOString(),
    payments: [],
  } as any);
}

// Vente annulée : sa créance non encore payée est annulée
function cancelCreditForOrder(order: Order) {
  const cr: any = db.credits.find((c: any) => c.order_id === order.id);
  if (!cr || (cr.paid || 0) > 0) return;
  cr.status = "cancelled";
  cr.remaining = 0;
  cr.balance = 0;
}

// Approbation / rejet : permission (contrôlée par la garde des routes) + périmètre de la commande
function canApproveOrders(user: User, action: "orders.approve" | "orders.reject" = "orders.approve") {
  return can(user, action);
}

apiRouter.post("/orders/:id/approve", authenticate, (req, res) => {
  const user = (req as any).user as User;
  if (!canApproveOrders(user)) return res.status(403).json({ detail: "Vous n'avez pas la permission d'approuver les commandes" });
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order || !orderVisibleTo(user, order)) return res.status(404).json({ detail: "Commande introuvable" });
  if (req.body?.override_credit_limit === true) {
    if (!can(user, "orders.override_credit"))
      return res.status(403).json({ detail: "Permission requise : Approuver en dérogation au plafond de crédit", code: "PERMISSION_DENIED" });
    auditNote(req, { action: "orders.override_credit", action_type: "approve", security: true, summary: `Commande ${order.code} approuvée en dérogation au plafond de crédit` });
  }
  // Une commande n'est approuvée (et déstockée) qu'une seule fois
  if (order.status !== "pending_approval")
    return res.status(409).json({ detail: `La commande ${order.code} a déjà été traitée (statut : ${order.status}) : aucun nouveau retrait de stock` });

  // Sortie de stock selon le classement Livraison : stock embarqué du marketeur ou dépôt
  const stockError = applyOrderStockOut(order, user);
  if (stockError) return res.status(400).json({ detail: stockError });

  order.status = "validated";
  ensureCreditForOrder(order);
  order.approved_by = user.full_name;
  order.approved_at = new Date().toISOString();
  order.updated_at = new Date().toISOString();

  res.json({ ...order, credit_check: getClientFinancialSnapshot(order.client_id, order.total, order.payment_method) });
});

apiRouter.post("/orders/:id/reject", authenticate, (req, res) => {
  if (!canApproveOrders((req as any).user as User, "orders.reject")) return res.status(403).json({ detail: "Vous n'avez pas la permission de rejeter les commandes" });
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order || !orderVisibleTo((req as any).user, order)) return res.status(404).json({ detail: "Commande introuvable" });
  if (order.status === "cancelled") return res.json(order);
  // Commande déjà déstockée : les quantités retournent dans le stock d'origine
  restoreOrderStock(order, (req as any).user as User, "Rejet");
  order.status = "cancelled";
  cancelCreditForOrder(order);
  order.rejection_reason = req.body.reason || "Rejeté par le responsable";
  order.updated_at = new Date().toISOString();
  res.json(order);
});

// BOUTIQUE
apiRouter.get("/boutique/products", authenticate, (req, res) => {
  // Catalogue de vente (Gestion commerciale) : prix et disponibilité, sans quantités de stock.
  // La source (camion / dépôt) d'une ligne vendue reste décidée par le serveur à la commande.
  res.json(
    db.products
      .filter((p) => p.is_active && inCategoryScope((req as any).user, p.category, "catalog"))
      .map((p: any) => {
        const { stock, current_stock, low_stock_threshold, alert_threshold, warehouse_id, ...rest } = p;
        return { ...rest, available: p.available !== false };
      })
  );
});

apiRouter.get("/boutique/my-orders", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const canSeeAll = user.role_code === "super_admin" || user.is_transversal || can(user, "orders.all");
  let orders = db.orders;
  if (!canSeeAll || req.query.only_mine === "true") {
    orders = orders.filter((o) => o.marketer_id === user.id);
  }
  res.json(orders.filter((o) => o.marketer_id === user.id || (inSiteScope(user, orderLocation(o).site_id, "orders") && orderInCategoryScope(user, o))));
});

apiRouter.get("/boutique/marketers", authenticate, (req, res) => {
  const marketers = db.users.filter((u) => u.role_code === "marketeur" || u.role_code === "commercial" || u.role_code === "chef_dept");
  res.json(marketers);
});

// CASH SESSIONS & OPERATIONS
apiRouter.get("/cash/active-session", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const active = openSessionOf(cashSiteFor(user, requestedCashSite(req)));
  if (!active) return res.json({ session: null, transactions: [] });
  const ops = db.cash_operations.filter((o) => o.session_id === active.id);

  // Compute live theoretical balances
  const totalInUSD = ops
    .filter((o) => o.type === "in")
    .reduce((sum, o) => sum + (o.amount_usd || (o.currency === "USD" ? o.amount : o.amount / (o.exchange_rate || 2500))), 0);
  const totalInCDF = ops
    .filter((o) => o.type === "in")
    .reduce((sum, o) => sum + (o.amount_cdf || (o.currency === "CDF" ? o.amount : o.amount * (o.exchange_rate || 2500))), 0);
  const totalOutUSD = ops
    .filter((o) => o.type === "out")
    .reduce((sum, o) => sum + (o.amount_usd || (o.currency === "USD" ? o.amount : o.amount / (o.exchange_rate || 2500))), 0);
  const totalOutCDF = ops
    .filter((o) => o.type === "out")
    .reduce((sum, o) => sum + (o.amount_cdf || (o.currency === "CDF" ? o.amount : o.amount * (o.exchange_rate || 2500))), 0);

  const initialUSD = active.initial_balance_usd !== undefined ? active.initial_balance_usd : (active.initial_balance || 0);
  const initialCDF = active.initial_balance_cdf || 0;
  const theoreticalBalanceUSD = Math.round((initialUSD + totalInUSD - totalOutUSD) * 100) / 100;
  const theoreticalBalanceCDF = Math.round(initialCDF + totalInCDF - totalOutCDF);

  res.json({
    session: {
      ...active,
      theoretical_balance_usd: theoreticalBalanceUSD,
      theoretical_balance_cdf: theoreticalBalanceCDF,
    },
    transactions: ops,
    theoretical_balance_usd: theoreticalBalanceUSD,
    theoretical_balance_cdf: theoreticalBalanceCDF,
    total_in_usd: totalInUSD,
    total_in_cdf: totalInCDF,
    total_out_usd: totalOutUSD,
    total_out_cdf: totalOutCDF,
    ...active,
  });
});

apiRouter.get("/cash/sessions", authenticate, (req, res) => {
  const user = (req as any).user as User;
  // Une caissière rattachée à un site ne voit que les sessions de sa caisse
  const mine = cashSiteLocked(user) ? userSite(user).id : null;
  res.json(db.cash_sessions.filter((s) => !mine || sessionSiteId(s) === mine).map((s) => ({ ...s, site_id: sessionSiteId(s), site_name: s.site_name || siteNameOf(sessionSiteId(s)) })));
});

apiRouter.post("/cash/sessions/open", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const siteId = cashSiteFor(user, requestedCashSite(req));
  const existing = openSessionOf(siteId);
  if (existing) return res.status(400).json({ detail: `La caisse du site ${siteNameOf(siteId)} est déjà ouverte` });

  const initialUSD = Number(req.body.initial_amount_usd) || 500;
  const initialCDF = Number(req.body.initial_amount_cdf) || 250000;
  const rate = Number(req.body.exchange_rate) || db.rates_config?.general_rate || 2500;

  const newSession: CashSession = {
    id: uuidv4(),
    opened_by: user.id,
    opened_by_name: user.full_name,
    opened_at: new Date().toISOString(),
    initial_balance: initialUSD,
    initial_balance_usd: initialUSD,
    initial_balance_cdf: initialCDF,
    exchange_rate: rate,
    department: req.body.department || "Maize Mill",
    // La caisse est rattachée à son site (site d'affectation de la caissière, ou site choisi par la direction)
    site_id: siteId || undefined,
    site_name: siteNameOf(siteId),
    status: "open",
  };
  db.cash_sessions.unshift(newSession);

  auditNote(req, { action: "cash.session.open", action_type: "execute", summary: `Ouverture caisse ${siteNameOf(siteId)} : Initial $${initialUSD} + ${initialCDF} FC (Taux: ${rate})` });

  res.status(201).json(newSession);
});

apiRouter.post("/cash/sessions/:id/close", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const active =
    db.cash_sessions.find((s) => s.id === req.params.id && s.status === "open") ||
    openSessionOf(cashSiteFor(user, requestedCashSite(req)));
  if (!active) return res.status(400).json({ detail: "Aucune session ouverte à clôturer" });
  if (cashSiteLocked(user) && sessionSiteId(active) !== userSite(user).id)
    return res.status(403).json({ detail: "Vous ne pouvez clôturer que la caisse de votre site" });

  const {
    actual_usd: actualUsdIn,
    actual_cdf: actualCdfIn,
    theoretical_usd: theoreticalUsdIn,
    theoretical_cdf: theoreticalCdfIn,
    difference_usd,
    difference_cdf,
    discrepancy_reason: discrepancyReasonIn,
    closing_billetage: closingBilletageIn,
    department,
    closing_document_url,
    closing_document_name,
    notes,
  } = req.body;

  // L'écran Caisse envoie actual_balance_usd / actual_balance_cdf / billetage : les deux noms sont acceptés
  const actual_usd = actualUsdIn ?? req.body.actual_balance_usd;
  const actual_cdf = actualCdfIn ?? req.body.actual_balance_cdf;
  const closing_billetage = closingBilletageIn ?? req.body.billetage;
  // Solde théorique calculé par le serveur s'il n'est pas fourni : fonds initial + entrées − sorties de la session
  // (même calcul que la caisse active : /cash/active-session)
  const sessionOps = db.cash_operations.filter((o: any) => o.session_id === active.id);
  const sumOps = (type: string, cur: "usd" | "cdf") =>
    sessionOps
      .filter((o: any) => o.type === type)
      .reduce(
        (sum: number, o: any) =>
          sum +
          (cur === "usd"
            ? o.amount_usd || (o.currency === "USD" ? o.amount : o.amount / (o.exchange_rate || 2500))
            : o.amount_cdf || (o.currency === "CDF" ? o.amount : o.amount * (o.exchange_rate || 2500))),
        0
      );
  const initUsd = active.initial_balance_usd !== undefined ? active.initial_balance_usd : active.initial_balance || 0;
  const theoretical_usd = theoreticalUsdIn ?? Math.round((initUsd + sumOps("in", "usd") - sumOps("out", "usd")) * 100) / 100;
  const theoretical_cdf = theoreticalCdfIn ?? Math.round((active.initial_balance_cdf || 0) + sumOps("in", "cdf") - sumOps("out", "cdf"));
  const discrepancy_reason = discrepancyReasonIn ?? req.body.notes;
  const diffUSD = difference_usd !== undefined ? Number(difference_usd) : (Number(actual_usd) || 0) - (Number(theoretical_usd) || 0);
  const diffCDF = difference_cdf !== undefined ? Number(difference_cdf) : (Number(actual_cdf) || 0) - (Number(theoretical_cdf) || 0);

  // Motif obligatoire uniquement quand l'écran fournit lui-même le solde théorique (comportement inchangé)
  const hasDiscrepancy = theoreticalUsdIn !== undefined && (Math.abs(diffUSD) > 0.01 || Math.abs(diffCDF) > 50);
  if (hasDiscrepancy && !discrepancy_reason?.trim()) {
    return res.status(400).json({
      detail: "Un motif d'écart obligatoire doit être fourni lorsqu'un écart est constaté",
    });
  }

  active.status = "closed";
  active.closed_by = user.full_name;
  active.closed_at = new Date().toISOString();
  active.actual_balance_usd = Number(actual_usd) || 0;
  active.actual_balance_cdf = Number(actual_cdf) || 0;
  active.theoretical_balance_usd = Number(theoretical_usd) || 0;
  active.theoretical_balance_cdf = Number(theoretical_cdf) || 0;
  active.difference_usd = diffUSD;
  active.difference_cdf = diffCDF;
  active.discrepancy_reason = discrepancy_reason || "";
  active.closing_billetage = closing_billetage || undefined;
  active.department = department || active.department || "Maize Mill";
  active.closing_document_url = closing_document_url || "";
  active.closing_document_name = closing_document_name || `Bordereau_Cloture_${active.id}.pdf`;
  active.notes = notes || "";

  auditNote(req, { action: "cash.session.close", action_type: "execute", summary: `Clôture de session par ${user.full_name}. Réel USD: $${active.actual_balance_usd} (Écart: $${diffUSD}), Réel CDF: ${active.actual_balance_cdf} FC (Écart: ${diffCDF} FC). Motif: ${discrepancy_reason || "Aucun"}` });

  res.json(active);
});

apiRouter.get("/cash/operations", authenticate, (req, res) => {
  const user = (req as any).user as User;
  // Chaque opération porte le site de sa caisse ; une caissière rattachée à un site ne voit que sa caisse
  const siteOfSession = new Map(db.cash_sessions.map((s) => [s.id, sessionSiteId(s)]));
  const mainSite = userSite(null).id;
  const mine = cashSiteLocked(user) ? userSite(user).id : null;
  const list = db.cash_operations.map((o) => {
    const sid = siteOfSession.get(o.session_id) || mainSite;
    return { ...o, site_id: sid, site_name: siteNameOf(sid) };
  });
  res.json(mine ? list.filter((o) => o.site_id === mine) : list);
});

// Solde actuel d'une caisse (session ouverte du site) : utilisé par la vue des caisses et le tableau de bord
function siteCashRow(site: any, rate: number) {
  const session = openSessionOf(site.id);
  let usd = 0;
  let cdf = 0;
  let inUsd = 0;
  let outUsd = 0;
  if (session) {
    usd = Number(session.initial_balance_usd ?? session.initial_balance ?? 0) || 0;
    cdf = Number(session.initial_balance_cdf || 0) || 0;
    for (const o of db.cash_operations.filter((x) => x.session_id === session.id)) {
      const sign = o.type === "in" ? 1 : -1;
      const b: any = (o as any).billetage;
      const hasBillet = b && (Number(b.total_usd) > 0 || Number(b.total_cdf) > 0);
      usd += sign * (hasBillet ? Number(b.total_usd) || 0 : o.currency === "USD" ? Number(o.amount) || 0 : 0);
      cdf += sign * (hasBillet ? Number(b.total_cdf) || 0 : o.currency === "CDF" ? Number(o.amount) || 0 : 0);
      const u = Number(o.amount_usd) || (o.currency === "USD" ? Number(o.amount) || 0 : (Number(o.amount) || 0) / (o.exchange_rate || rate));
      if (o.type === "in") inUsd += u;
      else outUsd += u;
    }
  }
  const cashiers = db.users.filter((u) => u.is_active !== false && u.role_code === "caissier" && u.site_id === site.id).map((u) => u.full_name);
  return {
    site_id: site.id,
    site_name: site.name,
    is_open: !!session,
    session_id: session?.id || null,
    opened_by_name: session?.opened_by_name || null,
    opened_at: session?.opened_at || null,
    cashiers,
    cash_usd: Math.round(usd * 100) / 100,
    cash_cdf: Math.round(cdf),
    current_usd: Math.round((usd + cdf / rate) * 100) / 100,
    in_usd: Math.round(inUsd * 100) / 100,
    out_usd: Math.round(outUsd * 100) / 100,
  };
}

// Vue générale des caisses : une ligne par site (session ouverte, caissière, solde actuel), plus le total
apiRouter.get("/cash/overview", authenticate, (req, res) => {
  const user = (req as any).user as User;
  ensureStockStructure();
  const rate = Number(db.rates_config?.general_rate) || 2500;
  const mine = cashSiteLocked(user) ? userSite(user).id : null;
  const allSites = ((db as any).sites || []).filter((x: any) => x.is_active !== false && (!mine || x.id === mine));
  const rows = allSites.map((site: any) => siteCashRow(site, rate));
  const sum = (k: string) => rows.reduce((t: number, r: any) => t + (Number(r[k]) || 0), 0);
  res.json({
    rate,
    sites: rows,
    total: {
      cash_usd: Math.round(sum("cash_usd") * 100) / 100,
      cash_cdf: Math.round(sum("cash_cdf")),
      current_usd: Math.round(sum("current_usd") * 100) / 100,
      in_usd: Math.round(sum("in_usd") * 100) / 100,
      out_usd: Math.round(sum("out_usd") * 100) / 100,
      open_count: rows.filter((r: any) => r.is_open).length,
    },
  });
});

// EXPENSE CATEGORIES API
apiRouter.get("/cash/expense-categories", authenticate, (req, res) => {
  if (!db.expense_categories || db.expense_categories.length === 0) {
    db.expense_categories = [
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
    ];
  }
  res.json(db.expense_categories);
});

// CASH EXCHANGE RATES CONFIG API
apiRouter.get("/cash/rates", authenticate, (req, res) => {
  if (!db.rates_config) {
    db.rates_config = {
      general_rate: 2500,
      outflow_rate: 2500,
      category_rates: {},
      updated_at: new Date().toISOString(),
      updated_by: "Système",
    };
  }

  // Catégories de produits réellement présentes dans le logiciel (Stock › Catégories + produits actifs)
  ensureStockStructure();
  const productCats = db.products.filter((p) => p.is_active !== false).map((p) => p.category).filter((c): c is string => Boolean(c));
  const allCategories: string[] = Array.from(new Set([...(db.product_categories || []), ...productCats])).sort((a, b) => a.localeCompare(b, "fr"));

  for (const cat of allCategories) {
    if (typeof db.rates_config.category_rates[cat] !== "number") {
      db.rates_config.category_rates[cat] = db.rates_config.general_rate || 2500;
    }
  }

  res.json({
    ...db.rates_config,
    categories: allCategories,
  });
});

apiRouter.post("/cash/rates", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const { general_rate, outflow_rate, category_rates } = req.body;

  if (!db.rates_config) {
    db.rates_config = {
      general_rate: 2500,
      outflow_rate: 2500,
      category_rates: {},
      updated_at: new Date().toISOString(),
      updated_by: user.full_name,
    };
  }

  if (general_rate && Number(general_rate) > 0) {
    db.rates_config.general_rate = Number(general_rate);
    for (const open of db.cash_sessions.filter((s) => s.status === "open")) {
      open.exchange_rate = db.rates_config.general_rate;
    }
  }

  if (outflow_rate && Number(outflow_rate) > 0) {
    db.rates_config.outflow_rate = Number(outflow_rate);
  }

  if (category_rates && typeof category_rates === "object") {
    for (const [cat, r] of Object.entries(category_rates)) {
      const numR = Number(r);
      if (numR > 0) {
        db.rates_config.category_rates[cat] = numR;
      }
    }
  }

  db.rates_config.updated_at = new Date().toISOString();
  db.rates_config.updated_by = user.full_name;

  auditNote(req, {
    action: "cash.rates.update",
    action_type: "update",
    summary: `Mise à jour des taux : Général ${db.rates_config.general_rate} FC, Sortie ${db.rates_config.outflow_rate} FC`,
  });

  const productCats = Array.from(new Set(db.products.map((p) => p.category).filter((c): c is string => Boolean(c))));
  const defaultDepts = ["Maize Mill", "Boissons (Premidis)", "Produits Alimentaires", "Direction Générale"];
  const allCategories: string[] = Array.from(new Set([...productCats, ...defaultDepts]));

  res.json({
    ...db.rates_config,
    categories: allCategories,
  });
});

apiRouter.post("/cash/expense-categories", authenticate, (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ detail: "Le nom de la catégorie de dépense est obligatoire" });
  }
  const cleanName = name.trim();
  if (!db.expense_categories) {
    db.expense_categories = [];
  }
  const exists = db.expense_categories.some(
    (c) => c.toLowerCase() === cleanName.toLowerCase()
  );
  if (exists) {
    return res.status(400).json({ detail: "Cette catégorie de dépense existe déjà" });
  }
  db.expense_categories.push(cleanName);
  res.status(201).json({ success: true, category: cleanName, categories: db.expense_categories });
});

apiRouter.get("/cash/operations/:id/document", authenticate, (req, res) => {
  const op = db.cash_operations.find(
    (o) => o.id === req.params.id || o.reference === req.params.id
  );
  if (!op) return res.status(404).json({ detail: "Opération introuvable" });
  res.json({
    document_url: op.document_url || null,
    document_name: op.document_name || `Bordereau_${op.reference}.pdf`,
    billetage: op.billetage || null,
    reference: op.reference,
    category: op.category,
    amount: op.amount,
    currency: op.currency,
    type: op.type,
    beneficiary: op.beneficiary,
    authorized_by: op.authorized_by,
    reason: op.reason,
    created_at: op.created_at,
  });
});

apiRouter.post("/cash/operations", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const opSite = cashSiteFor(user, requestedCashSite(req));
  let active = openSessionOf(opSite);
  if (!active) {
    active = {
      id: uuidv4(),
      site_id: opSite || undefined,
      site_name: siteNameOf(opSite),
      opened_by: user.id,
      opened_by_name: user.full_name,
      opened_at: new Date().toISOString(),
      initial_balance: 0,
      initial_balance_usd: 0,
      initial_balance_cdf: 0,
      exchange_rate: 2500,
      status: "open",
    };
    db.cash_sessions.unshift(active);
  }

  const {
    type,
    category,
    amount,
    currency,
    exchange_rate,
    reason,
    reference,
    payment_method,
    client_id,
    client_name,
    marketer_name,
    beneficiary,
    authorized_by,
    authorization_proof,
    document_url,
    document_name,
    order_id,
    order_code,
    department,
    billetage,
  } = req.body;

  const numAmount = Number(amount) || 0;
  const opType = type === "out" ? "out" : "in";
  const opCurrency = currency === "CDF" ? "CDF" : "USD";
  let defaultRate = active.exchange_rate || 2500;
  if (opType === "out") {
    defaultRate = db.rates_config?.outflow_rate || db.rates_config?.general_rate || defaultRate;
  } else if (department && db.rates_config?.category_rates?.[department]) {
    defaultRate = db.rates_config.category_rates[department];
  } else if (category && db.rates_config?.category_rates?.[category]) {
    defaultRate = db.rates_config.category_rates[category];
  } else if (db.rates_config?.general_rate) {
    defaultRate = db.rates_config.general_rate;
  }
  // Encaissement d'une vente : taux de la catégorie de cette vente (Caisse › Taux)
  const linkedOrder = opType === "in" && (order_id || order_code) ? db.orders.find((o) => o.id === order_id || o.code === order_id || o.code === order_code) : null;
  const rate = linkedOrder ? orderRate(linkedOrder) : Number(exchange_rate) || defaultRate;
  const amountUSD = opCurrency === "USD" ? numAmount : Math.round((numAmount / rate) * 100) / 100;
  const amountCDF = opCurrency === "CDF" ? numAmount : Math.round(numAmount * rate);

  const opRef = reference || (opType === "in" ? `ENC-${Date.now().toString().slice(-6)}` : `DEC-${Date.now().toString().slice(-6)}`);

  // Handle client credit update
  let resolvedClientName = client_name;
  if (client_id) {
    const cl = db.clients.find((c) => c.id === client_id);
    if (cl) {
      resolvedClientName = cl.name;
      cl.balance = Math.round(((cl.balance || 0) + (opType === "in" ? amountUSD : -amountUSD)) * 100) / 100;
      cl.current_credit = cl.balance < 0 ? Math.abs(cl.balance) : 0;
      cl.updated_at = new Date().toISOString();
    }
  }

  // If operation is linked to an order
  if (order_id) {
    const ord = db.orders.find((o) => o.id === order_id || o.code === order_id);
    if (ord) {
      ord.cash_deposit_status = "deposited";
      ord.payment_status = "paid";
      ord.amount_paid = ord.total;
      ord.outstanding = 0;
      ord.cash_deposited_at = new Date().toISOString();
      ord.cash_deposited_by = user.full_name;
    }
  }

  const newOp: CashOperation = {
    id: uuidv4(),
    session_id: active.id,
    type: opType,
    category: category || (opType === "in" ? "Encaissement" : "Décaissement"),
    amount: numAmount,
    currency: opCurrency,
    amount_usd: amountUSD,
    amount_cdf: amountCDF,
    exchange_rate: rate,
    reason: reason || `${category || "Opération"} - ${resolvedClientName || marketer_name || "Caisse"}`,
    reference: opRef,
    client_id: client_id || undefined,
    client_name: resolvedClientName || undefined,
    marketer_name: marketer_name || undefined,
    beneficiary: beneficiary || undefined,
    authorized_by: authorized_by || undefined,
    authorization_proof: authorization_proof || undefined,
    document_url: document_url || undefined,
    document_name: document_name || undefined,
    payment_method: payment_method || "cash",
    billetage: billetage || undefined,
    created_at: new Date().toISOString(),
    created_by: user.full_name,
  };
  db.cash_operations.unshift(newOp);

  // Automatically record accounting entry for cash outflow
  if (opType === "out") {
    try {
      recordAccountingMovement({
        module: "cash",
        reference: opRef,
        source: `Caisse - ${category || "Décaissement"}`,
        title: reason || `Sortie de Caisse (${category || "Dépense"}) - Bénéficiaire: ${beneficiary || "Non spécifié"}`,
        debit_account: "601100 - Charges d'exploitation",
        credit_account: "571100 - Caisse Centrale",
        amount: -amountUSD,
        document_url: document_url || undefined,
        document_name: document_name || undefined,
        billetage: billetage || undefined,
        operation_id: newOp.id,
        user_name: user.full_name,
      });
    } catch (err) {
      console.error("Accounting movement error on outflow:", err);
    }
  }

  res.status(201).json(newOp);
});

// MARKETER CASH DEPOSITS & DYNAMIC NON-DEPOSITED ORDERS
apiRouter.get("/cash/marketer-deposits", authenticate, (req, res) => {
  const user = (req as any).user as User;
  // Versements attendus pour la caisse du site choisi : tous les marketeurs du site (fiche utilisateur)
  // et toutes les ventes au comptant de ce site non encore versées
  const siteId = cashSiteFor(user, requestedCashSite(req));
  const cashOrders = db.orders.filter(
    (o) => o.payment_method === "cash" && o.status !== "cancelled" && o.status !== "rejected" && orderLocation(o).site_id === siteId
  );
  const roleName = (code: string) => db.roles.find((r) => r.code === code)?.name || code;
  const warehouseName = (id?: string) => db.warehouses.find((w) => w.id === id)?.name || "";
  const profile = (u?: User) =>
    u
      ? {
          marketer_id: u.id,
          email: u.email,
          phone: u.phone || "",
          role_code: u.role_code,
          role_name: roleName(u.role_code),
          site_name: userSite(u).name,
          warehouse_name: warehouseName(u.warehouse_id),
          departments: u.all_categories ? "Toutes les catégories" : (u.categories || []).join(", ") || u.department || "",
          is_active: u.is_active !== false,
        }
      : {};

  const marketerMap = new Map<string, any>();
  const groupFor = (name: string, u?: User) => {
    const key = u?.id || name;
    if (!marketerMap.has(key)) {
      marketerMap.set(key, {
        marketer_name: u?.full_name || name,
        ...profile(u),
        pending_orders_count: 0,
        pending_total_usd: 0,
        pending_total_fc: 0,
        deposited_total_usd: 0,
        last_deposit_at: null as string | null,
        orders: [],
      });
    }
    return marketerMap.get(key)!;
  };
  // Tous les vendeurs du site, même sans versement attendu
  for (const u of db.users)
    if (u.is_active !== false && ["marketeur", "commercial"].includes(u.role_code) && userSite(u).id === siteId) groupFor(u.full_name, u);

  for (const ord of cashOrders) {
    // Le vendeur de la commande (par identifiant, sinon par nom) : une seule carte par personne
    const u = db.users.find((x) => x.id === ord.marketer_id) || db.users.find((x) => x.full_name === ord.marketer_name);
    const group = groupFor(ord.marketer_name || "Marketeur", u);
    // Taux de la catégorie de la commande (Caisse › Taux), utilisé pour l'encaissement
    group.orders.push({ ...ord, fx_category: orderCategory(ord), fx_rate: orderRate(ord) });
    if ((ord.cash_deposit_status || "pending_deposit") === "pending_deposit") {
      group.pending_orders_count += 1;
      group.pending_total_usd += ord.total;
      group.pending_total_fc += ord.total_fc || Math.round(ord.total * orderRate(ord));
    } else {
      group.deposited_total_usd += ord.total;
      const at = (ord as any).cash_deposited_at;
      if (at && (!group.last_deposit_at || at > group.last_deposit_at)) group.last_deposit_at = at;
    }
  }

  const pending = cashOrders.filter((o) => (o.cash_deposit_status || "pending_deposit") === "pending_deposit");
  const marketers = Array.from(marketerMap.values())
    .map((m) => ({ ...m, pending_total_usd: Math.round(m.pending_total_usd * 100) / 100, deposited_total_usd: Math.round(m.deposited_total_usd * 100) / 100 }))
    .sort((a, b) => b.pending_total_usd - a.pending_total_usd || a.marketer_name.localeCompare(b.marketer_name, "fr"));

  res.json({
    marketers,
    orders: cashOrders,
    total_pending_usd: Math.round(pending.reduce((sum, o) => sum + o.total, 0) * 100) / 100,
    total_pending_fc: Math.round(pending.reduce((sum, o) => sum + (o.total_fc || Math.round(o.total * 2500)), 0)),
  });
});

apiRouter.get("/cash/marketer-orders/:marketerName", authenticate, (req, res) => {
  const marketerName = decodeURIComponent(req.params.marketerName || "");
  const orders = db.orders.filter(
    (o) =>
      o.marketer_name?.toLowerCase() === marketerName.toLowerCase() &&
      o.payment_method === "cash" &&
      (o.cash_deposit_status || "pending_deposit") === "pending_deposit" &&
      o.status !== "cancelled" &&
      o.status !== "rejected"
  );
  res.json(orders);
});

apiRouter.post("/cash/marketer-deposits/approve", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const { order_ids, amount, billetUSD, billetCDF, exchangeRate, notes, department, document_url, document_name } = req.body;

  const ids: string[] = Array.isArray(order_ids) ? order_ids : req.body.order_id ? [req.body.order_id] : [];
  const ordersToApprove = db.orders.filter((o) => ids.includes(o.id));
  // Taux de la catégorie des commandes encaissées (Caisse › Taux)
  const fxCategory = orderCategory(ordersToApprove[0]);
  const fxRate = ordersToApprove.length ? orderRate(ordersToApprove[0]) : Number(exchangeRate) || 2500;
  const totalExpectedUSD = ordersToApprove.reduce((sum, o) => sum + o.total, 0);
  const finalAmount = Number(amount) > 0 ? Number(amount) : totalExpectedUSD;

  const depositRef = `VERS-${Date.now().toString().slice(-6)}`;
  const marketerNames = Array.from(new Set(ordersToApprove.map((o) => o.marketer_name || "Marketeur"))).join(", ");
  const orderCodes = ordersToApprove.map((o) => o.code).join(", ");

  recordCashInflow({
    amount: finalAmount,
    category: "VERSEMENT JOURNALIER MARKETEUR (COMPTE CLIENT)",
    reason: `Versement espèces par ${marketerNames} (${orderCodes})`,
    reference: depositRef,
    client_name: ordersToApprove[0]?.client_name,
    client_id: ordersToApprove[0]?.client_id,
    payment_method: "cash",
    userName: user.full_name,
    document_url,
    document_name,
    billetage: req.body.billetage || { usd: billetUSD, cdf: billetCDF, exchange_rate: fxRate },
    department: fxCategory || department || "Maize Mill",
    exchange_rate: fxRate,
    site_id: cashSiteFor(user, requestedCashSite(req)),
  });

  for (const ord of ordersToApprove) {
    ord.cash_deposit_status = "deposited";
    ord.payment_status = "paid";
    ord.amount_paid = ord.total;
    ord.outstanding = 0;
    ord.cash_deposited_at = new Date().toISOString();
    ord.cash_deposited_by = user.full_name;
  }

  res.json({
    success: true,
    deposit_reference: depositRef,
    amount_deposited: finalAmount,
    approved_orders_count: ordersToApprove.length,
  });
});

// CREDITS
apiRouter.get("/credits", authenticate, (req, res) => {
  res.json(db.credits);
});

// Site d'une dette : site de la vente à crédit d'origine, sinon de la dernière vente du client, sinon site principal
function creditSite(c: any): { site_id: string | null; site_name: string } {
  const ord = (c.order_id && db.orders.find((o) => o.id === c.order_id)) || db.orders.find((o) => o.client_id === c.client_id || (c.client_name && o.client_name === c.client_name));
  if (ord) {
    const loc = orderLocation(ord);
    return { site_id: loc.site_id, site_name: loc.site_name };
  }
  const main = userSite(null);
  return { site_id: main.id, site_name: main.name };
}

apiRouter.get("/credits/debts", authenticate, (req, res) => {
  const user = (req as any).user as User;
  // Ventes à crédit validées qui n'auraient pas encore leur créance
  db.orders.forEach(ensureCreditForOrder);
  // Une personne rattachée à un site ne voit que les dettes de son site
  const mine = creditSiteLocked(user) ? userSite(user).id : null;
  res.json(
    db.credits
      .map((c: any) => ({ c, site: creditSite(c) }))
      .filter(({ site }) => !mine || site.site_id === mine)
      .map(({ c, site }) => {
      const remaining = c.remaining !== undefined ? c.remaining : c.balance ?? c.initial_amount ?? c.amount ?? 0;
      // Taux de la catégorie de produits de la vente à crédit (Caisse › Taux), appliqué à l'encaissement
      const ord = c.order_id ? db.orders.find((o) => o.id === c.order_id) : null;
      const fx_category = ord ? orderCategory(ord) : undefined;
      // Source de la dette : la vente à crédit d'origine (commande, date, articles)
      const source = ord
        ? {
            order_code: ord.code,
            date: ord.approved_at || ord.created_at,
            marketer_name: ord.marketer_name,
            total: ord.total,
            currency: ord.currency || "USD",
            items: (ord.items || []).map((it: any) => ({ product: it.product_name, quantity: it.quantity, unit: it.unit, line_total: it.line_total })),
          }
        : c.order_code
        ? { order_code: c.order_code, date: c.created_at, items: [] }
        : null;
      return { ...c, remaining, balance: remaining, fx_category, fx_rate: categoryRate(fx_category), source, ...site };
    })
  );
});

apiRouter.get("/credits/marketers", authenticate, (req, res) => {
  const user = (req as any).user as User;
  db.orders.forEach(ensureCreditForOrder);
  const mine = creditSiteLocked(user) ? userSite(user).id : null;
  const marketerMap: Record<string, any> = {};
  db.credits.forEach((c) => {
    if (((c as any).remaining ?? (c as any).balance ?? 0) <= 0) return;
    const site = creditSite(c);
    if (mine && site.site_id !== mine) return;
    const marketerName = c.marketer_name || "Non assigné";
    if (!marketerMap[marketerName]) {
      marketerMap[marketerName] = {
        marketer_id: c.marketer_id || "none",
        marketer_name: marketerName,
        total_remaining: 0,
        clients: [],
      };
    }
    const rem = c.remaining !== undefined ? c.remaining : (c.initial_amount || c.amount || 0);
    marketerMap[marketerName].total_remaining += rem;
    marketerMap[marketerName].clients.push({ ...c, remaining: rem, ...site });
  });
  res.json(Object.values(marketerMap).map((m: any) => ({ ...m, clients_count: m.clients.length })));
});

// Rapport des créances clients : une ligne par dette restante, enrichie depuis la fiche client
apiRouter.get("/credits/receivables", authenticate, (req, res) => {
  const user = (req as any).user as User;
  db.orders.forEach(ensureCreditForOrder);
  // Mêmes dettes et même site que le module Crédits (/credits/debts) ; limité au site d'affectation si besoin
  const mine = creditSiteLocked(user) ? userSite(user).id : null;
  const rows = db.credits
    .map((c: any) => {
      const remaining = Number(c.remaining ?? c.balance ?? c.initial_amount ?? 0) || 0;
      const client = db.clients.find((x) => x.id === c.client_id) || db.clients.find((x) => x.name === c.client_name);
      // Commande d'origine (par identifiant uniquement : un même numéro peut exister ailleurs)
      const order = c.order_id ? db.orders.find((o) => o.id === c.order_id) : undefined;
      return {
        id: c.id,
        order_code: c.order_code || order?.code || "",
        debt_date: order?.created_at || c.created_at,
        client_id: client?.id || c.client_id,
        client_name: client?.name || c.client_name,
        // Marketeur attribué au client à sa création (fiche client), pas celui de la commande
        marketer_name: client?.marketer_name || "Non attribué",
        // Téléphone enregistré dans la fiche du client
        client_phone: client?.phone || c.client_phone || "",
        amount: Math.round(remaining * 100) / 100,
        status: c.status,
        ...creditSite(c),
      };
    })
    .filter((r) => r.amount > 0 && r.status !== "cancelled" && (!mine || r.site_id === mine))
    .sort((a, b) => String(b.debt_date).localeCompare(String(a.debt_date)));
  res.json(rows);
});

// DELIVERIES
apiRouter.get("/delivery/tours", authenticate, (req, res) => {
  res.json(db.deliveries);
});

apiRouter.put("/delivery/tours/:id/status", authenticate, (req, res) => {
  const del = db.deliveries.find((d) => d.id === req.params.id);
  if (!del) return res.status(404).json({ detail: "Livraison introuvable" });
  del.status = req.body.status || "delivered";
  del.updated_at = new Date().toISOString();
  res.json(del);
});

// ACCOUNTING
apiRouter.get("/accounting/movements", authenticate, (req, res) => {
  // Comptabilité de la Gestion commerciale : ventes, commandes, caisse, crédits (les écritures du
  // module Stock restent en base mais ne sont pas affichées ici)
  res.json(db.accounting_movements.filter((m: any) => m.module !== "stock"));
});

apiRouter.post("/accounting/sync", authenticate, (req, res) => {
  db.accounting_movements.forEach((m) => {
    m.is_recorded = true;
    m.status = "recorded";
  });
  res.json({ ok: true });
});

apiRouter.post("/accounting/movements/:id/toggle-record", authenticate, (req, res) => {
  const m = db.accounting_movements.find((mov) => mov.id === req.params.id);
  if (!m) return res.status(404).json({ detail: "Mouvement introuvable" });
  m.is_recorded = !m.is_recorded;
  m.status = m.is_recorded ? "recorded" : "unrecorded";
  res.json({ is_recorded: m.is_recorded, movement: m });
});

// NOTIFICATIONS
// Une notification ciblée (utilisateur ou permission, ex. alertes de sécurité) n'est vue que par ses destinataires
const notificationFor = (u: User) => (n: any) => (!n.user_id || n.user_id === u.id) && (!n.perm || can(u, n.perm));

apiRouter.get("/notifications", authenticate, (req, res) => {
  const u = (req as any).user as User;
  let list = db.notifications.filter(notificationFor(u));
  if (req.query.unread_only === "true") list = list.filter((n: any) => !n.read && !n.is_read);
  res.json([...list].sort((a: any, b: any) => String(b.at || "").localeCompare(String(a.at || ""))).slice(0, Number(req.query.limit) || 200));
});

apiRouter.post("/notifications/mark-all-read", authenticate, (req, res) => {
  db.notifications.filter(notificationFor((req as any).user)).forEach((n) => {
    n.read = true;
    n.is_read = true;
  });
  res.json({ ok: true });
});

// OBJECTIVES
apiRouter.get("/objectives", authenticate, (req, res) => {
  res.json(db.objectives);
});

apiRouter.post("/objectives", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const newObj: Objective = {
    id: `obj-${Date.now().toString().slice(-6)}`,
    ...req.body,
    user_id: user.id,
    user_name: user.full_name,
    actual_amount: 0,
    actual_qty: 0,
    status: "active",
    created_at: new Date().toISOString(),
  };
  db.objectives.unshift(newObj);
  res.status(201).json(newObj);
});

apiRouter.post("/objectives/:id/claim-bonus", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const obj = db.objectives.find((o) => o.id === req.params.id);
  if (!obj) return res.status(404).json({ detail: "Objectif introuvable" });
  const ben = obj.beneficiaries?.find((b) => b.user_id === req.body.beneficiary_id);
  if (ben) {
    ben.status = "paid";
    ben.paid_at = new Date().toISOString();
  }
  // Seuil atteint et toutes les primes encaissées : l'objectif est clôturé
  const reached = (obj.actual_qty || obj.actual_amount || 0) >= (obj.target_qty || obj.target_amount || 1) || obj.status === "reached";
  if (reached && obj.beneficiaries?.length && obj.beneficiaries.every((b) => b.status === "paid")) obj.status = "completed";
  res.json({ success: true, objective: obj, beneficiary: ben });
});

// AUDIT

// DASHBOARD & REPORTS
// Tableau de bord de la Gestion commerciale : chiffres du jour, créances et commandes (aucune donnée de stock)
apiRouter.get("/dashboard", authenticate, (req, res) => {
  const me = (req as any).user as User;
  const today = new Date().toDateString();
  const isToday = (d?: string) => !!d && new Date(d).toDateString() === today;
  // Indicateurs limités au périmètre de l'utilisateur (sites et départements)
  const live = db.orders.filter(
    (o) => o.status !== "cancelled" && (o.status as string) !== "rejected" && inSiteScope(me, orderLocation(o).site_id, "indicators") && orderInCategoryScope(me, o, "indicators")
  );
  const salesToday = live.filter((o) => isToday(o.approved_at || o.created_at));
  const usd = (o: any) => Number(o.amount_usd) || (o.currency === "USD" ? Number(o.amount) || 0 : (Number(o.amount) || 0) / (o.exchange_rate || 2500));
  const sessionSite = new Map(db.cash_sessions.map((x) => [x.id, sessionSiteId(x)]));
  const opsToday = db.cash_operations.filter((o: any) => isToday(o.created_at) && inSiteScope(me, sessionSite.get(o.session_id) || null, "indicators"));
  const cashIn = opsToday.filter((o) => o.type === "in").reduce((t, o) => t + usd(o), 0);
  const cashOut = opsToday.filter((o) => o.type === "out").reduce((t, o) => t + usd(o), 0);
  const openDebts = db.credits.filter((c: any) => c.status !== "cancelled" && (Number(c.remaining ?? c.balance ?? 0) || 0) > 0 && inSiteScope(me, creditSite(c).site_id, "indicators"));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  res.json({
    sales: { today_total: r2(salesToday.reduce((t, o) => t + (Number(o.total) || 0), 0)), today_count: salesToday.length },
    cash: { today_in: r2(cashIn), today_out: r2(cashOut) },
    debts: {
      total: r2(openDebts.reduce((t, c: any) => t + (Number(c.remaining ?? c.balance ?? 0) || 0), 0)),
      count: openDebts.length,
      clients: new Set(openDebts.map((c: any) => c.client_id || c.client_name)).size,
    },
    orders: { pending_approval: live.filter((o) => o.status === "pending_approval").length },
    objectives: { active: db.objectives.filter((o: any) => o.status !== "completed").length },
    ...dashboardOverview(me, live, usd, sessionSite, Number(req.query.days) || 7, String(req.query.range || "day")),
  });
});

/*
 * Tableau de bord : indicateurs du jour comparés à la veille, ventes des N derniers jours,
 * répartition des ventes par catégorie et produits en rupture. Données réelles, dans le périmètre.
 */
function dashboardOverview(me: User, live: any[], usd: (o: any) => number, sessionSite: Map<string, string | null>, daysIn: number, rangeIn = "day") {
  const days = [7, 14, 30].includes(daysIn) ? daysIn : 7;
  const dayKey = (d: Date | string) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
  const now = new Date();
  const todayKey = dayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = dayKey(yesterday);
  const saleDay = (o: any) => dayKey(o.approved_at || o.created_at);
  // Période choisie dans l'en-tête du tableau de bord (aujourd'hui / cette semaine / ce mois / cette année),
  // mêmes bornes que le module Rapports ; la période précédente de même nature sert à la comparaison
  const range = ["day", "week", "month", "year"].includes(rangeIn) ? rangeIn : "day";
  const periodKeys = (shift: number): [string, string] => {
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    let a: Date, b: Date;
    if (range === "week") {
      const monday = d - ((now.getDay() + 6) % 7) + 7 * shift;
      a = new Date(y, m, monday); b = new Date(y, m, monday + 7);
    } else if (range === "month") { a = new Date(y, m + shift, 1); b = new Date(y, m + shift + 1, 1); }
    else if (range === "year") { a = new Date(y + shift, 0, 1); b = new Date(y + shift + 1, 0, 1); }
    else { a = new Date(y, m, d + shift); b = new Date(y, m, d + shift + 1); }
    return [dayKey(a), dayKey(b)];
  };
  const curP = periodKeys(0);
  const prevP = periodKeys(-1);
  const inP = (k: string, [lo, hi]: [string, string]) => k >= lo && k < hi;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const productById = new Map(db.products.map((p) => [p.id, p]));
  // Bénéfice net réel (même calcul que Rapports › Vue d'ensemble, période « Aujourd'hui ») :
  // bénéfice brut Σ quantité × (prix de vente − prix de revient du produit) des ventes non annulées,
  // moins les dépenses de caisse (sorties) du jour
  const grossOf = (list: any[]) =>
    list.reduce(
      (s, o) =>
        s +
        (o.items || []).reduce(
          (t: number, it: any) => t + (Number(it.quantity) || 0) * ((Number(it.unit_price) || 0) - (Number((productById.get(it.product_id) as any)?.cost_price) || 0)),
          0
        ),
      0
    );
  const reportOrdersIn = (r: [string, string]) =>
    db.orders.filter(
      (o: any) => o.status !== "cancelled" && inP(saleDay(o), r) && inSiteScope(me, orderLocation(o).site_id, "indicators") && orderInCategoryScope(me, o, "indicators")
    );
  const cashOutIn = (r: [string, string]) =>
    db.cash_operations
      .filter((o: any) => o.type === "out" && inP(dayKey(o.created_at), r) && inSiteScope(me, sessionSite.get(o.session_id) || null, "indicators"))
      .reduce((t: number, o: any) => t + usd(o), 0);
  const netIn = (r: [string, string]) => r2(grossOf(reportOrdersIn(r)) - cashOutIn(r));
  const salesIn = (r: [string, string]) => live.filter((o) => inP(saleDay(o), r));
  const salesOn = (k: string) => live.filter((o) => saleDay(o) === k);
  const sum = (list: any[], f: (o: any) => number) => r2(list.reduce((t, o) => t + f(o), 0));
  const cashInOn = (k: string) =>
    sum(
      db.cash_operations.filter((o: any) => o.type === "in" && dayKey(o.created_at) === k && inSiteScope(me, sessionSite.get(o.session_id) || null, "indicators")),
      usd
    );
  const clients = db.clients.filter((c: any) => c.is_active !== false && clientInScope(me, c));
  const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const kpi = (t: number, y: number) => ({ today: t, yesterday: y });

  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i));
    const list = salesOn(dayKey(d));
    return { date: dayKey(d), total: sum(list, (o) => Number(o.total) || 0), count: list.length };
  });
  const firstKey = series[0].date;
  const inPeriod = live.filter((o) => saleDay(o) >= firstKey);
  const byCat = new Map<string, number>();
  for (const o of inPeriod)
    for (const it of o.items || []) {
      const p: any = productById.get(it.product_id);
      const cat = (p?.category && String(p.category).trim()) || "Sans catégorie";
      if (!inCategoryScope(me, p?.category, "indicators")) continue;
      byCat.set(cat, (byCat.get(cat) || 0) + (Number(it.line_total) || 0));
    }
  // Produits signalés « Indisponible » dans Boutique › Catégories : ils quittent la liste dès qu'ils
  // redeviennent disponibles
  const out_of_stock = db.products
    .filter((p: any) => p.is_active !== false && p.available === false && inCategoryScope(me, p.category, "indicators"))
    .map((p: any) => ({ id: p.id, name: p.name, category: p.category || "", image_url: p.image_url || "" }));

  // Solde actuel en caisse : caisses ouvertes des sites du périmètre (même calcul que Caisse › Vue des caisses)
  ensureStockStructure();
  const rate = Number(db.rates_config?.general_rate) || 2500;
  const cashRows = ((db as any).sites || []).filter((x: any) => x.is_active !== false && inSiteScope(me, x.id, "indicators")).map((x: any) => siteCashRow(x, rate));
  const cash_balance = {
    current_usd: r2(cashRows.reduce((t: number, r: any) => t + r.current_usd, 0)),
    cash_usd: r2(cashRows.reduce((t: number, r: any) => t + r.cash_usd, 0)),
    cash_cdf: Math.round(cashRows.reduce((t: number, r: any) => t + r.cash_cdf, 0)),
    open_count: cashRows.filter((r: any) => r.is_open).length,
  };

  // Versements en attente : ventes au comptant pas encore versées en caisse (même règle que Caisse › Versements)
  const pendingDeposits = db.orders.filter(
    (o: any) =>
      o.payment_method === "cash" &&
      o.status !== "cancelled" &&
      o.status !== "rejected" &&
      (o.cash_deposit_status || "pending_deposit") === "pending_deposit" &&
      inSiteScope(me, orderLocation(o).site_id, "indicators")
  );
  const pending_deposits = {
    total_usd: r2(pendingDeposits.reduce((t: number, o: any) => t + (Number(o.total) || 0), 0)),
    orders_count: pendingDeposits.length,
    marketers_count: new Set(pendingDeposits.map((o: any) => o.marketer_id || o.marketer_name)).size,
  };

  return {
    overview: {
      cash_balance,
      pending_deposits,
      range,
      revenue: kpi(sum(salesIn(curP), (o) => Number(o.total) || 0), sum(salesIn(prevP), (o) => Number(o.total) || 0)),
      net_profit: kpi(netIn(curP), netIn(prevP)),
      receipts: kpi(cashInOn(todayKey), cashInOn(yesterdayKey)),
      sales_count: kpi(salesIn(curP).length, salesIn(prevP).length),
      clients: kpi(clients.length, clients.filter((c: any) => !c.created_at || new Date(c.created_at).getTime() < endOfYesterday).length),
      days,
      series,
      period_total: sum(inPeriod, (o) => Number(o.total) || 0),
      by_category: [...byCat.entries()].map(([category, total]) => ({ category, total: r2(total) })).sort((a, b) => b.total - a.total),
      out_of_stock,
    },
  };
}

apiRouter.get("/reports/summary", authenticate, (req, res) => {
  const me = (req as any).user as User;
  const scoped = db.orders.filter((o) => o.status !== "cancelled" && inSiteScope(me, orderLocation(o).site_id, "indicators") && orderInCategoryScope(me, o, "indicators"));
  const totalSales = scoped.reduce((s, o) => s + o.total, 0);
  const totalPaid = scoped.reduce((s, o) => s + o.amount_paid, 0);
  res.json({
    total: totalSales,
    total_sales: totalSales,
    paid: totalPaid,
    outstanding: Math.max(0, totalSales - totalPaid),
    count: scoped.length,
  });
});

// PROFILE
apiRouter.post("/auth/change-password", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const dbUser = db.users.find((u) => u.id === user.id);
  if (!dbUser) return res.status(404).json({ detail: "Utilisateur introuvable" });
  dbUser.password_hash = bcrypt.hashSync(req.body.newPassword, 10);
  res.json({ ok: true });
});
