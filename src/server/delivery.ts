import { v4 as uuidv4 } from "uuid";
import { db, type Order, type Product, type User } from "./db";
import {
  ensureStockStructure,
  getLevel,
  nextTransferCode,
  recordMovement,
  setGlobalStock,
  transfers,
  warehouseLabel,
} from "./stockStructure";

/*
 * Module Livraison : deux modes de distribution.
 *
 * - Stock embarqué : Dépôt → camion du marketeur. Le dépôt diminue, le stock
 *   embarqué du marketeur augmente d'autant (le stock global ne change pas).
 *   Les ventes du marketeur sont retirées uniquement de son stock embarqué.
 * - Sur commande : Commande → En préparation → En livraison → Livrée
 *   (statuts de commande existants : validated → prepared → shipped → delivered).
 *
 * Le mode est choisi par département = catégorie de produits créée dans
 * Stock › Catégories. Il s'applique à chaque produit vendu selon sa catégorie.
 */

type Mode = "embarked" | "on_order";
const norm = (s: string) => (s || "").trim().toLowerCase();
// Mode d'une catégorie (clé insensible à la casse)
const modeOf = (category: string): Mode => {
  const key = Object.keys(db.delivery_department_modes).find((k) => norm(k) === norm(category));
  return (key && db.delivery_department_modes[key]) || "on_order";
};
const categoryOfProduct = (productId: string) => (db.products.find((p) => p.id === productId)?.category || "").trim() || "Sans catégorie";

const nowIso = () => new Date().toISOString();
const vehicles = () => db.vehicles as any[];
const embarkedStocks = () => db.embarked_stocks as any[];
const embarkedLevels = () => db.embarked_levels as any[];
const embarkedMoves = () => db.embarked_movements as any[];

const MARKETER_ROLES = ["marketeur", "commercial", "chef_dept"];
const canSeeAll = (u: User) => u.role_code === "super_admin" || !!u.is_transversal || u.role_code === "chef_dept";

// Catégories des produits de la commande (affichées sur les cartes)
function orderDepartment(order: Order) {
  return Array.from(new Set((order.items || []).map((it) => categoryOfProduct(it.product_id)))).join(", ");
}

function embarkedFor(marketerId: string, create = false, user?: User) {
  let es = embarkedStocks().find((e) => e.marketer_id === marketerId);
  if (!es && create && user) {
    es = { id: uuidv4(), marketer_id: user.id, marketer_name: user.full_name, vehicle_id: null, created_at: nowIso(), updated_at: nowIso() };
    embarkedStocks().push(es);
  }
  return es;
}

function embarkedLevel(embarkedId: string, productId: string, create: boolean) {
  let l = embarkedLevels().find((x) => x.embarked_id === embarkedId && x.product_id === productId);
  if (!l && create) {
    l = { id: uuidv4(), embarked_id: embarkedId, product_id: productId, quantity: 0, updated_at: nowIso() };
    embarkedLevels().push(l);
  }
  return l;
}

const embarkedTotal = (embarkedId: string) =>
  embarkedLevels().filter((l) => l.embarked_id === embarkedId).reduce((s, l) => s + (Number(l.quantity) || 0), 0);

function vehicleOf(es: any) {
  return vehicles().find((v) => v.id === es?.vehicle_id);
}

function embarkedLabel(es: any) {
  const v = vehicleOf(es);
  return `Stock embarqué · ${es.marketer_name}${v ? ` (${v.plate})` : ""}`;
}

function recordEmbarked(m: {
  es: any;
  product: Product;
  type: "load" | "sale" | "return" | "adjust";
  quantity: number;
  reason: string;
  user_name: string;
  client_name?: string;
  order_code?: string;
  order_id?: string;
  amount?: number;
  warehouse_label?: string;
  reference?: string;
}) {
  const v = vehicleOf(m.es);
  const balance = embarkedLevel(m.es.id, m.product.id, false)?.quantity || 0;
  embarkedMoves().unshift({
    id: uuidv4(),
    embarked_id: m.es.id,
    marketer_id: m.es.marketer_id,
    marketer_name: m.es.marketer_name,
    vehicle_id: v?.id,
    vehicle_plate: v?.plate,
    driver_name: v?.driver_name,
    product_id: m.product.id,
    product_name: m.product.name,
    product_size: m.product.size,
    type: m.type,
    quantity: m.quantity,
    balance_after: balance,
    reason: m.reason,
    client_name: m.client_name,
    order_code: m.order_code,
    order_id: m.order_id,
    amount: m.amount,
    warehouse_label: m.warehouse_label,
    reference: m.reference,
    user_name: m.user_name,
    at: nowIso(),
  });
}

function embarkedView(es: any) {
  const v = vehicleOf(es);
  const items = embarkedLevels()
    .filter((l) => l.embarked_id === es.id && l.quantity > 0)
    .map((l) => {
      const p = db.products.find((x) => x.id === l.product_id);
      return p ? { product_id: p.id, name: p.name, size: p.size, code: p.code, image_url: p.image_url, unit: p.unit, quantity: l.quantity, value: l.quantity * (Number(p.cost_price) || 0) } : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.quantity - a.quantity);
  const total = embarkedTotal(es.id);
  const capacity = Number(v?.capacity) || 0;
  return {
    ...es,
    vehicle: v || null,
    items,
    total_quantity: total,
    total_value: Math.round(items.reduce((s: number, i: any) => s + i.value, 0) * 100) / 100,
    capacity: capacity || null,
    fill: capacity ? Math.round((total / capacity) * 100) : null,
  };
}

/**
 * Stock embarqué d'un marketeur, vu comme un vrai stock :
 * quantité réelle dans le camion, quantité réservée par ses ventes en attente
 * d'approbation, et quantité encore disponible à la vente.
 */
export function embarkedAvailability(marketerId: string, exceptOrderId?: string) {
  ensureStockStructure();
  const es = embarkedFor(marketerId || "");
  const byProduct = new Map<string, { quantity: number; reserved: number; available: number }>();
  if (!es) return { es: null as any, byProduct };
  for (const l of embarkedLevels().filter((x) => x.embarked_id === es.id && x.quantity > 0))
    byProduct.set(l.product_id, { quantity: l.quantity, reserved: 0, available: l.quantity });
  for (const o of db.orders) {
    if (o.status !== "pending_approval" || o.id === exceptOrderId) continue;
    for (const it of o.items || []) {
      const row = it.stock_source === "embarked" && it.embarked_id === es.id ? byProduct.get(it.product_id) : undefined;
      if (row) {
        row.reserved += it.quantity;
        row.available = Math.max(0, row.quantity - row.reserved);
      }
    }
  }
  return { es, byProduct };
}

/**
 * À la création de la vente : enregistre la source exacte du stock de chaque ligne.
 * - « embarked » : le produit est dans le camion du marketeur qui vend → la ligne
 *   référence SON stock embarqué (identifiant + propriétaire).
 * - « on_order » : sinon, ou si la vente est explicitement faite depuis le dépôt.
 * En mode strict (création), refuse une quantité supérieure au stock embarqué disponible.
 */
export function tagOrderStockSource(order: Order, opts: { strict?: boolean; requested?: string } = {}): string | null {
  const { es, byProduct } = embarkedAvailability(order.marketer_id || "", order.id);
  const fromDepot = opts.requested === "depot" || opts.requested === "on_order";
  for (const it of order.items) {
    if (it.stock_source) continue;
    const row = byProduct.get(it.product_id);
    if (es && row && !fromDepot) {
      if (opts.strict && it.quantity > row.available)
        return `Stock embarqué insuffisant pour ${it.product_name} : ${row.available} disponible(s) dans le camion de ${es.marketer_name}${row.reserved ? ` (${row.reserved} déjà réservé(s) par des ventes en attente)` : ""}`;
      it.stock_source = "embarked";
      it.embarked_id = es.id;
      it.embarked_owner_id = es.marketer_id;
      it.embarked_owner_name = es.marketer_name;
    } else it.stock_source = "on_order";
  }
  const emb = order.items.filter((it) => it.stock_source === "embarked");
  const origin = !emb.length ? "on_order" : emb.length === order.items.length ? "embarked" : "mixed";
  (order as any).stock_origin = origin;
  (order as any).delivery_mode = origin;
  if (emb.length && es) {
    (order as any).embarked_id = es.id;
    (order as any).embarked_owner_id = es.marketer_id;
    (order as any).embarked_label = embarkedLabel(es);
  }
  return null;
}

/**
 * Sortie de stock à l'approbation d'une commande (quel que soit l'approbateur).
 * - Lignes « embarked » : retirées UNIQUEMENT du stock embarqué enregistré sur
 *   la vente (celui du marketeur vendeur), jamais du dépôt.
 * - Lignes « on_order » : retirées du stock du dépôt concerné.
 * Renvoie un message d'erreur, ou null si la sortie est faite.
 */
export function applyOrderStockOut(order: Order, user: User): string | null {
  ensureStockStructure();
  // Commandes créées avant l'enregistrement de la source : on la détermine
  // à partir du marketeur de la vente (jamais de l'approbateur)
  if (order.items.some((it) => !it.stock_source)) tagOrderStockSource(order);
  const embarkedItems = order.items.filter((it) => it.stock_source === "embarked");
  const otherItems = order.items.filter((it) => it.stock_source !== "embarked");
  // Contrôles avant toute sortie
  for (const it of embarkedItems) {
    const es = embarkedStocks().find((e) => e.id === it.embarked_id);
    if (!es) return `Le stock embarqué de ${it.embarked_owner_name || order.marketer_name} lié à cette vente est introuvable`;
    const have = embarkedLevel(es.id, it.product_id, false)?.quantity || 0;
    if (have < it.quantity) return `Stock embarqué insuffisant pour ${it.product_name} : ${have} dans le camion de ${es.marketer_name}, ${it.quantity} vendu(s)`;
  }
  for (const it of embarkedItems) {
    const es = embarkedStocks().find((e) => e.id === it.embarked_id)!;
    const p = db.products.find((x) => x.id === it.product_id);
    if (!p) continue;
    const l = embarkedLevel(es.id, p.id, false)!;
    l.quantity -= it.quantity;
    l.updated_at = nowIso();
    setGlobalStock(p);
    recordEmbarked({
      es,
      product: p,
      type: "sale",
      quantity: -it.quantity,
      reason: `Vente ${order.code} · approuvée par ${user.full_name}`,
      user_name: user.full_name,
      client_name: order.client_name,
      order_code: order.code,
      order_id: order.id,
      amount: Number(it.line_total) || it.quantity * (Number(it.unit_price) || 0),
    });
  }
  // Produits « Sur commande » : sortie du stock normal du dépôt concerné
  // (dépôt du marketeur, sinon dépôt principal du produit, puis les autres si besoin)
  const sources: Array<{ product_name: string; warehouse_label: string; quantity: number }> = [];
  const marketer = db.users.find((x) => x.id === order.marketer_id);
  for (const it of otherItems) {
    const prod = db.products.find((p) => p.id === it.product_id);
    if (!prod) continue;
    const preferred = [marketer?.warehouse_id, prod.warehouse_id].filter((id): id is string => !!id && db.warehouses.some((w) => w.id === id));
    const lvls = (db.stock_levels as any[])
      .filter((l) => l.product_id === prod.id && l.quantity > 0)
      .sort((a, b) => {
        const ia = preferred.indexOf(a.warehouse_id), ib = preferred.indexOf(b.warehouse_id);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.quantity - a.quantity;
      });
    let left = it.quantity;
    for (const l of lvls) {
      if (left <= 0) break;
      const take = Math.min(l.quantity, left);
      l.quantity -= take;
      l.updated_at = nowIso();
      left -= take;
      const w = db.warehouses.find((x) => x.id === l.warehouse_id);
      recordMovement({ product: prod, warehouse: w, quantity: -take, reason: `Vente ${order.code} (sur commande) · ${order.client_name}`, reference: order.code, user_name: user.full_name });
      sources.push({ product_name: prod.name, warehouse_label: warehouseLabel(w), quantity: take });
    }
    setGlobalStock(prod);
  }
  if (sources.length) (order as any).stock_sources = sources;
  return null;
}

const STAGE_FLOW: Record<string, { next: Order["status"]; label: string }> = {
  validated: { next: "prepared", label: "En préparation" },
  prepared: { next: "shipped", label: "En livraison" },
  shipped: { next: "delivered", label: "Livrée" },
};

// Commandes en attente créées avant l'enregistrement de la source du stock
function tagLegacyPendingOrders() {
  for (const o of db.orders) if (o.status === "pending_approval" && (o.items || []).some((it) => !it.stock_source)) tagOrderStockSource(o);
}

export function mountDeliveryRoutes(router: any, authenticate: any) {
  const me = (req: any) => req.user as User;

  /* ---------- Vue d'ensemble ---------- */
  router.get("/delivery/overview", authenticate, (req: any, res: any) => {
    ensureStockStructure();
    const u = me(req);
    const all = canSeeAll(u);
    tagLegacyPendingOrders();
    const stocks = embarkedStocks().filter((e) => all || e.marketer_id === u.id);
    const today = new Date().toDateString();
    const orders = db.orders.filter((o) => (all || o.marketer_id === u.id) && o.status !== "cancelled" && (o as any).delivery_mode !== "embarked");
    res.json({
      can_see_all: all,
      embarked_units: stocks.reduce((s, e) => s + embarkedTotal(e.id), 0),
      orders_in_progress: orders.filter((o) => ["pending_approval", "validated", "prepared", "shipped"].includes(o.status)).length,
      delivered_today: orders.filter((o) => o.status === "delivered" && new Date((o as any).delivered_at || o.updated_at).toDateString() === today).length,
      shipping_now: orders.filter((o) => o.status === "shipped").length,
      depot_units: (db.stock_levels as any[]).reduce((s, l) => s + (Number(l.quantity) || 0), 0),
    });
  });

  /* ---------- Camions & chauffeurs ---------- */
  router.get("/delivery/vehicles", authenticate, (_req: any, res: any) => {
    res.json(
      vehicles().map((v) => {
        const es = embarkedStocks().find((e) => e.vehicle_id === v.id);
        return { ...v, assigned_to: es?.marketer_name || null, load: es ? embarkedTotal(es.id) : 0 };
      })
    );
  });

  router.post("/delivery/vehicles", authenticate, (req: any, res: any) => {
    const b = req.body || {};
    const plate = String(b.plate || "").trim().toUpperCase();
    const driver = String(b.driver_name || "").trim();
    if (!plate || !driver) return res.status(400).json({ detail: "La plaque du camion et le nom du chauffeur sont obligatoires" });
    if (vehicles().some((v) => v.plate === plate)) return res.status(409).json({ detail: `Le camion ${plate} existe déjà` });
    const capacity = b.capacity === undefined || b.capacity === "" ? null : Number(b.capacity);
    if (capacity !== null && (!Number.isFinite(capacity) || capacity <= 0)) return res.status(400).json({ detail: "La capacité doit être supérieure à 0" });
    const v = { id: uuidv4(), plate, driver_name: driver, driver_phone: String(b.driver_phone || "").trim(), type: String(b.type || "Camion").trim(), capacity, is_active: true, created_at: nowIso() };
    vehicles().push(v);
    res.status(201).json(v);
  });

  router.delete("/delivery/vehicles/:id", authenticate, (req: any, res: any) => {
    const i = vehicles().findIndex((v) => v.id === req.params.id);
    if (i < 0) return res.status(404).json({ detail: "Camion introuvable" });
    const es = embarkedStocks().find((e) => e.vehicle_id === req.params.id);
    if (es && embarkedTotal(es.id) > 0) return res.status(409).json({ detail: `Ce camion transporte encore le stock de ${es.marketer_name}` });
    if (es) es.vehicle_id = null;
    vehicles().splice(i, 1);
    res.json({ ok: true });
  });

  /* ---------- Marketeurs (pour le déstockage) ---------- */
  router.get("/delivery/marketers", authenticate, (req: any, res: any) => {
    const u = me(req);
    res.json(
      db.users
        .filter((x) => x.is_active !== false && MARKETER_ROLES.includes(x.role_code) && (canSeeAll(u) || x.id === u.id))
        .map((x) => ({ id: x.id, full_name: x.full_name, department: x.department }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "fr"))
    );
  });

  /* ---------- Stock embarqué ---------- */
  router.get("/delivery/embarked", authenticate, (req: any, res: any) => {
    ensureStockStructure();
    const u = me(req);
    res.json(embarkedStocks().filter((e) => canSeeAll(u) || e.marketer_id === u.id).map(embarkedView));
  });

  router.get("/delivery/embarked/movements", authenticate, (req: any, res: any) => {
    const u = me(req);
    const statusOf = (id?: string) => db.orders.find((o) => o.id === id)?.status;
    res.json(
      embarkedMoves()
        .filter((m) => canSeeAll(u) || m.marketer_id === u.id)
        .slice(0, 1000)
        .map((m) => (m.type === "sale" ? { ...m, order_status: statusOf(m.order_id) } : m))
    );
  });

  // Ventes terrain réalisées depuis un stock embarqué (toutes, y compris en attente d'approbation)
  router.get("/delivery/embarked/sales", authenticate, (req: any, res: any) => {
    const u = me(req);
    tagLegacyPendingOrders();
    const rows: any[] = [];
    for (const o of db.orders) {
      if (!canSeeAll(u) && o.marketer_id !== u.id) continue;
      for (const it of o.items || []) {
        if (it.stock_source !== "embarked") continue;
        rows.push({
          id: `${o.id}:${it.product_id}`,
          embarked_id: it.embarked_id,
          order_id: o.id,
          order_code: o.code,
          order_status: o.status,
          client_name: o.client_name,
          marketer_name: o.marketer_name,
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: it.quantity,
          amount: Number(it.line_total) || it.quantity * (Number(it.unit_price) || 0),
          created_at: o.created_at,
          approved_at: o.approved_at || null,
        });
      }
    }
    res.json(rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
  });

  // Déstockage : Dépôt → stock embarqué du marketeur (camion + chauffeur)
  router.post("/delivery/embarked/load", authenticate, (req: any, res: any) => {
    ensureStockStructure();
    const b = req.body || {};
    const u = me(req);
    const w = db.warehouses.find((x) => x.id === b.warehouse_id);
    const p = db.products.find((x) => x.id === b.product_id && x.is_active !== false);
    const marketer = db.users.find((x) => x.id === b.marketer_id && MARKETER_ROLES.includes(x.role_code));
    const v = vehicles().find((x) => x.id === b.vehicle_id);
    const qty = Number(b.quantity);
    if (!w) return res.status(400).json({ detail: "Choisissez le dépôt source" });
    if (!p) return res.status(400).json({ detail: "Choisissez un produit" });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ detail: "La quantité doit être supérieure à 0" });
    if (!marketer) return res.status(400).json({ detail: "Choisissez un marketeur" });
    if (!v) return res.status(400).json({ detail: "Choisissez le chauffeur / camion" });
    const other = embarkedStocks().find((e) => e.vehicle_id === v.id && e.marketer_id !== marketer.id && embarkedTotal(e.id) > 0);
    if (other) return res.status(409).json({ detail: `Le camion ${v.plate} transporte déjà le stock de ${other.marketer_name}` });
    const src = getLevel(p.id, w.id, false);
    const available = src?.quantity || 0;
    if (available < qty) return res.status(400).json({ detail: `Quantité insuffisante : ${available} disponible(s) dans ${warehouseLabel(w)} pour ${p.name}` });
    const es = embarkedFor(marketer.id, true, marketer)!;
    if (es.vehicle_id && es.vehicle_id !== v.id && embarkedTotal(es.id) > 0)
      return res.status(409).json({ detail: `${marketer.full_name} a déjà du stock dans le camion ${vehicleOf(es)?.plate}. Faites d'abord un retour au dépôt.` });
    if (v.capacity && embarkedTotal(es.id) + qty > v.capacity)
      return res.status(400).json({ detail: `Capacité du camion ${v.plate} dépassée : ${Math.max(0, v.capacity - embarkedTotal(es.id))} unité(s) de place libre` });

    es.vehicle_id = v.id;
    es.updated_at = nowIso();
    src!.quantity -= qty;
    src!.updated_at = nowIso();
    const lvl = embarkedLevel(es.id, p.id, true)!;
    lvl.quantity += qty;
    lvl.updated_at = nowIso();
    setGlobalStock(p); // inchangé : la quantité passe du dépôt au camion

    const code = nextTransferCode();
    const toLabel = embarkedLabel(es);
    transfers().unshift({
      id: uuidv4(),
      code,
      product_id: p.id,
      product_name: p.name,
      quantity: qty,
      from_warehouse_id: w.id,
      from_label: warehouseLabel(w),
      to_warehouse_id: `embarked:${es.id}`,
      to_label: toLabel,
      note: `Chauffeur : ${v.driver_name}`,
      status: "completed",
      user_name: u.full_name,
      created_at: nowIso(),
    });
    recordMovement({ product: p, warehouse: w, quantity: -qty, reason: `Déstockage ${code} → ${toLabel}`, reference: code, user_name: u.full_name });
    recordEmbarked({ es, product: p, type: "load", quantity: qty, reason: `Déstockage ${code}`, user_name: u.full_name, warehouse_label: warehouseLabel(w), reference: code });
    res.status(201).json({ code, depot_remaining: src!.quantity, embarked: embarkedView(es) });
  });

  // Retour au dépôt : stock embarqué → dépôt
  router.post("/delivery/embarked/:id/return", authenticate, (req: any, res: any) => {
    ensureStockStructure();
    const u = me(req);
    const es = embarkedStocks().find((e) => e.id === req.params.id);
    const w = db.warehouses.find((x) => x.id === req.body?.warehouse_id);
    const p = db.products.find((x) => x.id === req.body?.product_id);
    const qty = Number(req.body?.quantity);
    if (!es) return res.status(404).json({ detail: "Stock embarqué introuvable" });
    if (!canSeeAll(u) && es.marketer_id !== u.id) return res.status(403).json({ detail: "Accès refusé" });
    if (!w || !p) return res.status(400).json({ detail: "Choisissez le produit et le dépôt de retour" });
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ detail: "La quantité doit être supérieure à 0" });
    const l = embarkedLevel(es.id, p.id, false);
    if ((l?.quantity || 0) < qty) return res.status(400).json({ detail: `Quantité insuffisante : ${l?.quantity || 0} dans le camion` });
    l!.quantity -= qty;
    const dst = getLevel(p.id, w.id, true)!;
    dst.quantity += qty;
    dst.updated_at = l!.updated_at = nowIso();
    setGlobalStock(p);
    const code = nextTransferCode();
    transfers().unshift({
      id: uuidv4(), code, product_id: p.id, product_name: p.name, quantity: qty,
      from_warehouse_id: `embarked:${es.id}`, from_label: embarkedLabel(es), to_warehouse_id: w.id, to_label: warehouseLabel(w),
      note: "Retour de stock embarqué", status: "completed", user_name: u.full_name, created_at: nowIso(),
    });
    recordMovement({ product: p, warehouse: w, quantity: qty, reason: `Retour ${code} ← ${embarkedLabel(es)}`, reference: code, user_name: u.full_name });
    recordEmbarked({ es, product: p, type: "return", quantity: -qty, reason: `Retour au dépôt ${code}`, user_name: u.full_name, warehouse_label: warehouseLabel(w), reference: code });
    res.json(embarkedView(es));
  });

  // Ajustement du stock embarqué (perte, casse, correction…)
  router.post("/delivery/embarked/:id/adjust", authenticate, (req: any, res: any) => {
    ensureStockStructure();
    const u = me(req);
    const es = embarkedStocks().find((e) => e.id === req.params.id);
    const p = db.products.find((x) => x.id === req.body?.product_id);
    const delta = Number(req.body?.quantity);
    if (!es) return res.status(404).json({ detail: "Stock embarqué introuvable" });
    if (!canSeeAll(u)) return res.status(403).json({ detail: "Seul un responsable peut ajuster un stock embarqué" });
    if (!p || !Number.isFinite(delta) || delta === 0) return res.status(400).json({ detail: "Indiquez le produit et la quantité (+ ou -)" });
    const l = embarkedLevel(es.id, p.id, delta > 0)!;
    if ((l?.quantity || 0) + delta < 0) return res.status(400).json({ detail: `Quantité insuffisante : ${l?.quantity || 0} dans le camion` });
    const v = vehicleOf(es);
    if (delta > 0 && v?.capacity && embarkedTotal(es.id) + delta > v.capacity) return res.status(400).json({ detail: `Capacité du camion ${v.plate} dépassée` });
    l.quantity += delta;
    l.updated_at = nowIso();
    setGlobalStock(p);
    const reason = String(req.body?.reason || "Ajustement").trim();
    recordEmbarked({ es, product: p, type: "adjust", quantity: delta, reason: `Ajustement : ${reason}`, user_name: u.full_name });
    res.json(embarkedView(es));
  });

  /* ---------- Commandes / livraisons sur commande ---------- */
  router.get("/delivery/orders", authenticate, (req: any, res: any) => {
    const u = me(req);
    tagLegacyPendingOrders();
    res.json(
      db.orders
        .filter((o) => (canSeeAll(u) || o.marketer_id === u.id) && o.status !== "cancelled" && o.status !== "rejected" && (o as any).delivery_mode !== "embarked")
        .map((o) => {
          const del = (db.deliveries as any[]).find((d) => d.order_id === o.id);
          // Les lignes vendues depuis un stock embarqué ne sont jamais « à livrer »
          const items = (o.items || []).filter((it) => it.stock_source !== "embarked");
          return { ...o, items, department: orderDepartment({ ...o, items }), delivery: del || null, delivered_at: (o as any).delivered_at || (o.status === "delivered" ? del?.updated_at || o.updated_at : null) };
        })
    );
  });

  // Faire avancer une commande : En préparation → En livraison → Livrée
  router.post("/delivery/orders/:id/advance", authenticate, (req: any, res: any) => {
    const u = me(req);
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ detail: "Commande introuvable" });
    const step = STAGE_FLOW[order.status];
    if (!step) return res.status(400).json({ detail: order.status === "pending_approval" ? "Approuvez d'abord la commande" : "Cette commande est déjà livrée" });
    const now = nowIso();
    order.status = step.next;
    order.updated_at = now;
    let del = (db.deliveries as any[]).find((d) => d.order_id === order.id);
    if (step.next === "shipped") {
      const v = vehicles().find((x) => x.id === req.body?.vehicle_id);
      if (!del) {
        del = {
          id: uuidv4(),
          code: `LIV-${new Date().getFullYear()}-${String(db.deliveries.length + 1).padStart(4, "0")}`,
          order_id: order.id,
          order_code: order.code,
          client_name: order.client_name,
          client_phone: order.client_phone,
          address: order.delivery_address,
          items: order.items.filter((it) => it.stock_source !== "embarked"),
          created_at: now,
        };
        db.deliveries.push(del);
      }
      del.status = "shipped";
      del.vehicle_plate = v?.plate || del.vehicle_plate;
      del.driver_name = v?.driver_name || del.driver_name;
      del.shipped_at = now;
      del.updated_at = now;
    }
    if (step.next === "delivered") {
      (order as any).delivered_at = now;
      (order as any).delivered_by = u.full_name;
      if (del) {
        del.status = "delivered";
        del.updated_at = now;
      }
    }
    if (step.next === "prepared") (order as any).prepared_at = now;
    res.json({ ...order, stage: step.label });
  });

  /* ---------- Configuration des départements (= catégories du module Stock) ---------- */
  router.get("/delivery/departments", authenticate, (_req: any, res: any) => {
    ensureStockStructure();
    res.json(
      [...db.product_categories]
        .sort((a, b) => a.localeCompare(b, "fr"))
        .map((name) => ({
          name,
          mode: modeOf(name),
          products: db.products.filter((p) => p.is_active !== false && norm(p.category || "") === norm(name)).length,
        }))
    );
  });

  router.put("/delivery/departments/:name", authenticate, (req: any, res: any) => {
    ensureStockStructure();
    const u = me(req);
    if (!canSeeAll(u)) return res.status(403).json({ detail: "Seul un responsable peut modifier la configuration" });
    const name = db.product_categories.find((c) => norm(c) === norm(req.params.name));
    const mode = req.body?.mode;
    if (!name) return res.status(404).json({ detail: "Catégorie introuvable dans Stock › Catégories" });
    if (mode !== "embarked" && mode !== "on_order") return res.status(400).json({ detail: "Mode inconnu" });
    for (const k of Object.keys(db.delivery_department_modes)) if (norm(k) === norm(name)) delete db.delivery_department_modes[k];
    db.delivery_department_modes[name] = mode;
    res.json({ name, mode });
  });
}
