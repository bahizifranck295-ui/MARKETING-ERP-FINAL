import { v4 as uuidv4 } from "uuid";
import { db, type Product, type Warehouse } from "./db";

/*
 * Module Stock : SITE → DÉPÔTS → PRODUITS → QUANTITÉS → TRANSFERTS
 *
 * - Un site possède plusieurs dépôts ; un dépôt appartient à un seul site.
 * - La quantité d'un produit est tenue par dépôt (db.stock_levels).
 * - product.stock reste le stock global (somme des dépôts) : les autres modules
 *   (commandes, tableau de bord, comptabilité) continuent de le lire tel quel.
 * - Si product.stock change ailleurs (vente approuvée, ajustement, modification),
 *   l'écart est appliqué au dépôt principal du produit pour rester cohérent.
 */

export interface Site {
  id: string;
  code: string;
  name: string;
  location?: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockLevel {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  location_ref?: string;
  updated_at: string;
}

export interface StockTransfer {
  id: string;
  code: string;
  product_id: string;
  product_name: string;
  quantity: number;
  from_warehouse_id: string;
  from_label: string;
  to_warehouse_id: string;
  to_label: string;
  note?: string;
  status: "completed";
  user_name: string;
  created_at: string;
}

const nowIso = () => new Date().toISOString();
const norm = (s: string) => s.trim().toLowerCase();

const sites = () => db.sites as Site[];
const levels = () => db.stock_levels as StockLevel[];
const transfers = () => db.stock_transfers as StockTransfer[];

function siteNameFromWarehouse(w: Warehouse) {
  return ((w.city || "").split(",")[0] || "").trim() || w.name;
}

function siteCode(name: string) {
  const base = `SITE-${name.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "XXX"}`;
  let code = base;
  let i = 2;
  while (sites().some((s) => s.code === code)) code = `${base}${i++}`;
  return code;
}

export function warehouseLabel(w?: Warehouse) {
  if (!w) return "Dépôt inconnu";
  const site = sites().find((s) => s.id === w.site_id);
  return site ? `${site.name} / ${w.name}` : w.name;
}

function defaultWarehouseId(p: Product) {
  if (p.warehouse_id && db.warehouses.some((w) => w.id === p.warehouse_id)) return p.warehouse_id;
  return db.warehouses.find((w) => w.is_active !== false)?.id || db.warehouses[0]?.id;
}

function getLevel(productId: string, warehouseId: string, create: boolean) {
  let lvl = levels().find((l) => l.product_id === productId && l.warehouse_id === warehouseId);
  if (!lvl && create) {
    lvl = { id: uuidv4(), product_id: productId, warehouse_id: warehouseId, quantity: 0, updated_at: nowIso() };
    levels().push(lvl);
  }
  return lvl;
}

function sumLevels(productId: string) {
  return levels()
    .filter((l) => l.product_id === productId)
    .reduce((s, l) => s + (Number(l.quantity) || 0), 0);
}

function setGlobalStock(p: Product) {
  p.stock = sumLevels(p.id);
  p.current_stock = p.stock;
  p.updated_at = nowIso();
}

export function recordMovement(m: {
  product: Product;
  warehouse?: Warehouse;
  quantity: number;
  reason: string;
  reference?: string;
  user_name?: string;
}) {
  db.stock_movements.unshift({
    id: uuidv4(),
    product_id: m.product.id,
    product_name: m.product.name,
    quantity: m.quantity,
    type: m.quantity >= 0 ? "in" : "out",
    reason: m.reason,
    reference: m.reference,
    warehouse_id: m.warehouse?.id,
    warehouse_label: m.warehouse ? warehouseLabel(m.warehouse) : undefined,
    user_name: m.user_name,
    at: nowIso(),
  });
}

/**
 * Met en place la structure (sans rien supprimer) et réaligne les quantités.
 * Appelée avant chaque opération du module Stock : migration automatique des
 * données existantes (dépôts sans site, stock sans dépôt, catégories).
 */
export function ensureStockStructure() {
  // 1. Chaque dépôt existant est rattaché à un site (créé d'après sa ville)
  for (const w of db.warehouses) {
    if (w.site_id && sites().some((s) => s.id === w.site_id)) continue;
    const name = siteNameFromWarehouse(w);
    let site = sites().find((s) => norm(s.name) === norm(name));
    if (!site) {
      site = {
        id: uuidv4(),
        code: siteCode(name),
        name,
        location: w.city || w.address,
        description: "",
        is_active: true,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      sites().push(site);
    }
    w.site_id = site.id;
  }

  // 2. Liste des catégories : on conserve toutes celles déjà utilisées
  for (const p of db.products) {
    const c = (p.category || "").trim();
    if (c && !db.product_categories.some((x) => norm(x) === norm(c))) db.product_categories.push(c);
  }

  // 3. Quantités par dépôt alignées sur le stock global du produit
  if (!db.warehouses.length) return;
  for (const p of db.products) {
    const target = Math.max(0, Number(p.stock) || 0);
    let diff = target - sumLevels(p.id);
    if (diff === 0) continue;
    const mainId = defaultWarehouseId(p)!;
    if (diff > 0) {
      const lvl = getLevel(p.id, mainId, true)!;
      lvl.quantity += diff;
      lvl.updated_at = nowIso();
      continue;
    }
    // diff < 0 : on retire d'abord du dépôt principal, puis des autres
    const ordered = levels()
      .filter((l) => l.product_id === p.id && l.quantity > 0)
      .sort((a, b) => (a.warehouse_id === mainId ? -1 : b.warehouse_id === mainId ? 1 : b.quantity - a.quantity));
    for (const l of ordered) {
      if (diff === 0) break;
      const take = Math.min(l.quantity, -diff);
      l.quantity -= take;
      l.updated_at = nowIso();
      diff += take;
    }
  }
}

function productStats(warehouseIds: Set<string>) {
  let quantity = 0;
  let value = 0;
  const products = new Set<string>();
  let low = 0;
  for (const l of levels()) {
    if (!warehouseIds.has(l.warehouse_id)) continue;
    const p = db.products.find((x) => x.id === l.product_id && x.is_active !== false);
    if (!p) continue;
    products.add(p.id);
    quantity += l.quantity;
    value += l.quantity * (Number(p.cost_price) || 0);
    if (l.quantity <= (Number(p.low_stock_threshold ?? p.alert_threshold) || 0)) low++;
  }
  return { product_count: products.size, quantity, value: Math.round(value * 100) / 100, low_count: low };
}

function depotView(w: Warehouse) {
  const site = sites().find((s) => s.id === w.site_id);
  return {
    ...w,
    site_name: site?.name || "",
    site_code: site?.code || "",
    label: warehouseLabel(w),
    ...productStats(new Set([w.id])),
  };
}

function nextTransferCode() {
  const year = new Date().getFullYear();
  const n = transfers().filter((t) => t.code.startsWith(`TRF-${year}-`)).length + 1;
  return `TRF-${year}-${String(n).padStart(4, "0")}`;
}

export function mountStockStructureRoutes(router: any, authenticate: any) {
  const withStructure = (_req: any, _res: any, next: any) => {
    ensureStockStructure();
    next();
  };
  const userName = (req: any) => req.user?.full_name || req.user?.email || "Utilisateur";

  /* ---------- Sites ---------- */
  router.get("/stock/sites", authenticate, withStructure, (_req: any, res: any) => {
    res.json(
      sites().map((s) => {
        const whs = db.warehouses.filter((w) => w.site_id === s.id);
        return { ...s, depot_count: whs.length, ...productStats(new Set(whs.map((w) => w.id))) };
      })
    );
  });

  router.post("/stock/sites", authenticate, withStructure, (req: any, res: any) => {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    const code = String(b.code || "").trim().toUpperCase();
    if (!name || !code) return res.status(400).json({ detail: "Le nom et le code du site sont obligatoires" });
    if (sites().some((s) => norm(s.code) === norm(code))) return res.status(409).json({ detail: `Le code ${code} est déjà utilisé` });
    if (sites().some((s) => norm(s.name) === norm(name))) return res.status(409).json({ detail: `Le site « ${name} » existe déjà` });
    const site: Site = {
      id: uuidv4(),
      code,
      name,
      location: String(b.location || "").trim(),
      description: String(b.description || "").trim(),
      is_active: b.is_active !== false,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    sites().push(site);
    res.status(201).json(site);
  });

  router.put("/stock/sites/:id", authenticate, withStructure, (req: any, res: any) => {
    const site = sites().find((s) => s.id === req.params.id);
    if (!site) return res.status(404).json({ detail: "Site introuvable" });
    const b = req.body || {};
    if (b.name !== undefined) site.name = String(b.name).trim() || site.name;
    if (b.location !== undefined) site.location = String(b.location).trim();
    if (b.description !== undefined) site.description = String(b.description).trim();
    if (b.is_active !== undefined) site.is_active = !!b.is_active;
    site.updated_at = nowIso();
    res.json(site);
  });

  /* ---------- Dépôts ---------- */
  router.get("/stock/depots", authenticate, withStructure, (req: any, res: any) => {
    const siteId = req.query.site_id as string | undefined;
    res.json(db.warehouses.filter((w) => !siteId || w.site_id === siteId).map(depotView));
  });

  router.post("/stock/depots", authenticate, withStructure, (req: any, res: any) => {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    const code = String(b.code || "").trim().toUpperCase();
    const site = sites().find((s) => s.id === b.site_id);
    if (!site) return res.status(400).json({ detail: "Un dépôt doit être rattaché à un site existant" });
    if (!name || !code) return res.status(400).json({ detail: "Le nom et le code du dépôt sont obligatoires" });
    if (db.warehouses.some((w) => norm(w.code) === norm(code))) return res.status(409).json({ detail: `Le code ${code} est déjà utilisé` });
    if (db.warehouses.some((w) => w.site_id === site.id && norm(w.name) === norm(name)))
      return res.status(409).json({ detail: `Le site ${site.name} a déjà un dépôt « ${name} »` });
    const w: Warehouse = {
      id: uuidv4(),
      code,
      name,
      site_id: site.id,
      manager: String(b.manager || "").trim(),
      address: String(b.location || "").trim(),
      city: site.location || site.name,
      description: String(b.description || "").trim(),
      is_active: b.is_active !== false,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    db.warehouses.push(w);
    res.status(201).json(depotView(w));
  });

  router.put("/stock/depots/:id", authenticate, withStructure, (req: any, res: any) => {
    const w = db.warehouses.find((x) => x.id === req.params.id);
    if (!w) return res.status(404).json({ detail: "Dépôt introuvable" });
    const b = req.body || {};
    if (b.name !== undefined) w.name = String(b.name).trim() || w.name;
    if (b.manager !== undefined) w.manager = String(b.manager).trim();
    if (b.location !== undefined) w.address = String(b.location).trim();
    if (b.description !== undefined) w.description = String(b.description).trim();
    if (b.is_active !== undefined) w.is_active = !!b.is_active;
    w.updated_at = nowIso();
    res.json(depotView(w));
  });

  router.get("/stock/depots/:id", authenticate, withStructure, (req: any, res: any) => {
    const w = db.warehouses.find((x) => x.id === req.params.id);
    if (!w) return res.status(404).json({ detail: "Dépôt introuvable" });
    const items = levels()
      .filter((l) => l.warehouse_id === w.id)
      .map((l) => {
        const p = db.products.find((x) => x.id === l.product_id && x.is_active !== false);
        return p ? { ...p, quantity: l.quantity, location_ref: l.location_ref, value: l.quantity * (Number(p.cost_price) || 0) } : null;
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.name.localeCompare(b.name, "fr"));
    res.json({
      depot: depotView(w),
      items,
      movements: db.stock_movements.filter((m: any) => m.warehouse_id === w.id).slice(0, 10),
      transfers: transfers()
        .filter((t) => t.from_warehouse_id === w.id || t.to_warehouse_id === w.id)
        .slice(0, 10),
    });
  });

  // Affecter un produit à un dépôt (avec quantité initiale éventuelle)
  router.post("/stock/depots/:id/products", authenticate, withStructure, (req: any, res: any) => {
    const w = db.warehouses.find((x) => x.id === req.params.id);
    if (!w) return res.status(404).json({ detail: "Dépôt introuvable" });
    if (w.is_active === false) return res.status(400).json({ detail: "Ce dépôt est inactif" });
    const p = db.products.find((x) => x.id === req.body?.product_id && x.is_active !== false);
    if (!p) return res.status(400).json({ detail: "Produit introuvable" });
    const qty = Number(req.body?.quantity) || 0;
    if (qty < 0 || !Number.isFinite(qty)) return res.status(400).json({ detail: "La quantité initiale doit être positive" });
    const lvl = getLevel(p.id, w.id, true)!;
    lvl.quantity += qty;
    if (req.body?.location_ref !== undefined) lvl.location_ref = String(req.body.location_ref).trim() || undefined;
    lvl.updated_at = nowIso();
    setGlobalStock(p);
    if (qty > 0) recordMovement({ product: p, warehouse: w, quantity: qty, reason: "Entrée en dépôt", user_name: userName(req) });
    res.status(201).json({ ...lvl, product_name: p.name, global_stock: p.stock });
  });

  /* ---------- Quantités par dépôt ---------- */
  router.get("/stock/levels", authenticate, withStructure, (req: any, res: any) => {
    const pid = req.query.product_id as string | undefined;
    res.json(
      levels()
        .filter((l) => !pid || l.product_id === pid)
        .map((l) => ({ ...l, warehouse_label: warehouseLabel(db.warehouses.find((w) => w.id === l.warehouse_id)) }))
    );
  });

  /* ---------- Transferts ---------- */
  router.get("/stock/transfers", authenticate, withStructure, (_req: any, res: any) => {
    res.json(transfers());
  });

  router.post("/stock/transfers", authenticate, withStructure, (req: any, res: any) => {
    const b = req.body || {};
    const p = db.products.find((x) => x.id === b.product_id && x.is_active !== false);
    const from = db.warehouses.find((w) => w.id === b.from_warehouse_id);
    const to = db.warehouses.find((w) => w.id === b.to_warehouse_id);
    const qty = Number(b.quantity);
    if (!p) return res.status(400).json({ detail: "Choisissez un produit" });
    if (!from || !to) return res.status(400).json({ detail: "Choisissez un dépôt source et un dépôt destination" });
    if (from.id === to.id) return res.status(400).json({ detail: "Le dépôt source et le dépôt destination doivent être différents" });
    if (to.is_active === false) return res.status(400).json({ detail: `Le dépôt ${warehouseLabel(to)} est inactif` });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ detail: "La quantité doit être supérieure à 0" });
    const src = getLevel(p.id, from.id, false);
    const available = src?.quantity || 0;
    if (available < qty)
      return res.status(400).json({
        detail: `Quantité insuffisante : ${available} disponible(s) dans ${warehouseLabel(from)} pour ${p.name}`,
      });

    const dst = getLevel(p.id, to.id, true)!;
    src!.quantity -= qty;
    dst.quantity += qty;
    src!.updated_at = dst.updated_at = nowIso();
    setGlobalStock(p); // inchangé : la somme des dépôts reste identique

    const t: StockTransfer = {
      id: uuidv4(),
      code: nextTransferCode(),
      product_id: p.id,
      product_name: p.name,
      quantity: qty,
      from_warehouse_id: from.id,
      from_label: warehouseLabel(from),
      to_warehouse_id: to.id,
      to_label: warehouseLabel(to),
      note: String(b.note || "").trim() || undefined,
      status: "completed",
      user_name: userName(req),
      created_at: nowIso(),
    };
    transfers().unshift(t);
    const reason = `Transfert ${t.code}`;
    recordMovement({ product: p, warehouse: from, quantity: -qty, reason: `${reason} → ${t.to_label}`, reference: t.code, user_name: t.user_name });
    recordMovement({ product: p, warehouse: to, quantity: qty, reason: `${reason} ← ${t.from_label}`, reference: t.code, user_name: t.user_name });
    res.status(201).json(t);
  });

  /* ---------- Mouvements ---------- */
  router.get("/stock/movements", authenticate, withStructure, (_req: any, res: any) => {
    res.json(db.stock_movements.slice(0, 500));
  });

  /* ---------- Catégories ---------- */
  router.get("/stock/categories", authenticate, withStructure, (_req: any, res: any) => {
    res.json(
      db.product_categories
        .map((name) => ({
          name,
          product_count: db.products.filter((p) => p.is_active !== false && norm(p.category || "") === norm(name)).length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    );
  });

  router.post("/stock/categories", authenticate, withStructure, (req: any, res: any) => {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ detail: "Le nom de la catégorie est obligatoire" });
    const existing = db.product_categories.find((c) => norm(c) === norm(name));
    if (existing) return res.status(409).json({ detail: `La catégorie « ${existing} » existe déjà` });
    db.product_categories.push(name);
    res.status(201).json({ name, product_count: 0 });
  });

  router.delete("/stock/categories/:name", authenticate, withStructure, (req: any, res: any) => {
    const name = String(req.params.name || "");
    const idx = db.product_categories.findIndex((c) => norm(c) === norm(name));
    if (idx < 0) return res.status(404).json({ detail: "Catégorie introuvable" });
    const used = db.products.filter((p) => p.is_active !== false && norm(p.category || "") === norm(name)).length;
    if (used > 0)
      return res.status(409).json({
        detail: `Impossible de supprimer « ${db.product_categories[idx]} » : ${used} produit(s) l'utilisent encore`,
      });
    db.product_categories.splice(idx, 1);
    res.json({ ok: true });
  });
}
