import { v4 as uuidv4 } from "uuid";
import { db } from "./db";
import { ensureStockStructure } from "./stockStructure";

/*
 * Rapports › État de stock : rapport « Sales & Stock Report » (modèle papier PREMIDIS).
 *
 * Toutes les quantités sont lues dans les données existantes, sans source en double :
 * - stock_levels      : quantité actuelle de chaque produit dans chaque dépôt ;
 * - stock_movements   : chaque entrée / sortie d'un dépôt (ventes, transferts,
 *                       chargements camion, retours, ajustements) ;
 * - stock_transfers   : dépôt d'origine et de destination de chaque transfert ;
 * - orders            : mode de vente (comptant / crédit), client, prix ;
 *   order.stock_ledger : dépôt (ou camion) d'où chaque article est réellement sorti.
 *
 * Stock final = quantité actuelle − mouvements postérieurs à la période.
 * Stock initial = stock final − mouvements de la période.
 * Ainsi Initial + Reçu − Envoyé − Comptant − Crédit − Dommages = Final, sans double comptage.
 */

type Bucket = "received" | "sent" | "cash" | "credit" | "damage";
type Row = {
  product_id: string;
  product: string;
  unit: string;
  opening: number;
  received: number;
  sent: number;
  cash: number;
  credit: number;
  damage: number;
  closing: number;
};

const BUCKETS: Bucket[] = ["received", "sent", "cash", "credit", "damage"];
const DAMAGE_RE = /^Ajustement : (Perte \/ Avarie|Cadeau)/;
const ADMIN_ROLES = ["super_admin", "chef_dept", "dg"];

const sitesList = () => db.sites as any[];
const canSeeAllSites = (u: any) => ADMIN_ROLES.includes(u?.role_code) || !!u?.is_transversal || !u?.site_id;

function siteOfWarehouse(wid?: string) {
  return db.warehouses.find((w) => w.id === wid)?.site_id;
}

function orderByCode(code?: string) {
  return code ? (db.orders as any[]).find((o) => o.code === code) : undefined;
}

/** Classe un mouvement de dépôt dans une colonne du rapport. */
function classify(m: any): { bucket: Bucket; qty: number } {
  const q = Number(m.quantity) || 0;
  const reason = String(m.reason || "");
  // Vente (et sa remise en stock en cas de rejet / annulation) : comptant ou crédit selon la commande
  if (/^Vente /.test(reason) || /retour au dépôt$/.test(reason)) {
    const order = orderByCode(m.reference);
    return { bucket: order?.payment_method === "credit" ? "credit" : "cash", qty: -q };
  }
  // Transfert entre dépôts, chargement vers un camion, retour d'un camion
  if (/^Transfert /.test(reason) || /^Déstockage /.test(reason) || m.kind === "embarked_load" || m.kind === "embarked_return" || /^Retour /.test(reason)) {
    return q < 0 ? { bucket: "sent", qty: -q } : { bucket: "received", qty: q };
  }
  // Dommages et cadeaux (ajustements « Perte / Avarie » ou « Cadeau / Don »)
  if (q < 0 && (DAMAGE_RE.test(reason) || ["damage", "gift"].includes(m.adjust_reason))) return { bucket: "damage", qty: -q };
  // Entrées validées, réceptions, retours client et corrections d'inventaire (signées)
  return { bucket: "received", qty: q };
}

/** Transfert entre deux dépôts du même site : ni sortie ni entrée pour le site. */
function isIntraSiteTransfer(m: any) {
  if (!/^Transfert /.test(String(m.reason || ""))) return false;
  const t = (db.stock_transfers as any[]).find((x) => x.code === m.reference);
  if (!t) return false;
  const a = siteOfWarehouse(t.from_warehouse_id);
  return !!a && a === siteOfWarehouse(t.to_warehouse_id);
}

function damageNote(m: any) {
  const reason = String(m.reason || "");
  const motif = m.adjust_reason === "gift" || /^Ajustement : Cadeau/.test(reason) ? "Cadeau / Don" : "Perte / Avarie";
  const note = m.adjust_note ?? (reason.match(/\((.*)\)$/)?.[1] || "");
  return { motif, comment: note };
}

export function computeStockState(params: { site_id: string; category: string; warehouse_id?: string; from: string; to: string }) {
  ensureStockStructure();
  const site = sitesList().find((s) => s.id === params.site_id);
  if (!site) throw new Error("Site introuvable");
  const from = new Date(params.from).getTime();
  const to = new Date(params.to).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new Error("Période invalide");

  const siteDepots = db.warehouses.filter((w) => w.site_id === site.id);
  const depots = params.warehouse_id && params.warehouse_id !== "all" ? siteDepots.filter((w) => w.id === params.warehouse_id) : siteDepots;
  if (params.warehouse_id && params.warehouse_id !== "all" && !depots.length) throw new Error("Ce dépôt n'appartient pas au site choisi");
  const depotIds = new Set(depots.map((w) => w.id));

  const category = String(params.category || "").trim();
  const products = (db.products as any[])
    .filter((p) => p.is_active !== false && (p.category || "").trim().toLowerCase() === category.toLowerCase())
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const productIds = new Set(products.map((p) => p.id));

  const moves = (db.stock_movements as any[]).filter((m) => depotIds.has(m.warehouse_id) && productIds.has(m.product_id));
  const tsOf = (m: any) => new Date(m.at).getTime();

  const buildRows = (wids: Set<string>, opts: { siteView: boolean; onlyHeld: boolean }) => {
    const rows: Row[] = [];
    for (const p of products) {
      const current = (db.stock_levels as any[])
        .filter((l) => l.product_id === p.id && wids.has(l.warehouse_id))
        .reduce((s, l) => s + (Number(l.quantity) || 0), 0);
      const hasLevel = (db.stock_levels as any[]).some((l) => l.product_id === p.id && wids.has(l.warehouse_id));
      const pm = moves.filter((m) => m.product_id === p.id && wids.has(m.warehouse_id));
      const after = pm.filter((m) => tsOf(m) > to).reduce((s, m) => s + (Number(m.quantity) || 0), 0);
      const within = pm.filter((m) => tsOf(m) >= from && tsOf(m) <= to);
      const closing = current - after;
      const r: Row = { product_id: p.id, product: p.name, unit: [p.size, p.unit].filter(Boolean).join(" · "), opening: 0, received: 0, sent: 0, cash: 0, credit: 0, damage: 0, closing };
      let net = 0;
      for (const m of within) {
        net += Number(m.quantity) || 0;
        if (opts.siteView && isIntraSiteTransfer(m)) continue; // neutre pour le site
        const c = classify(m);
        r[c.bucket] += c.qty;
      }
      r.opening = closing - net;
      if (opts.onlyHeld && !hasLevel && !within.length) continue;
      rows.push(r);
    }
    return rows;
  };

  const totals = (rows: Row[]) => {
    const t: any = { opening: 0, closing: 0 };
    BUCKETS.forEach((b) => (t[b] = 0));
    rows.forEach((r) => {
      t.opening += r.opening;
      t.closing += r.closing;
      BUCKETS.forEach((b) => (t[b] += r[b]));
    });
    return t;
  };

  const mainRows = buildRows(depotIds, { siteView: depots.length > 1, onlyHeld: false });
  const sections = depots.map((w) => {
    const rows = buildRows(new Set([w.id]), { siteView: false, onlyHeld: true });
    return { warehouse_id: w.id, warehouse_name: w.name, rows, totals: totals(rows) };
  });

  // Notes : justification des dommages et cadeaux de la période
  const notes = moves
    .filter((m) => tsOf(m) >= from && tsOf(m) <= to && classify(m).bucket === "damage")
    .sort((a, b) => tsOf(a) - tsOf(b))
    .map((m) => {
      const w = db.warehouses.find((x) => x.id === m.warehouse_id);
      const { motif, comment } = damageNote(m);
      return { date: m.at, product: m.product_name, quantity: Math.abs(Number(m.quantity) || 0), depot: w?.name || "-", motif, comment, user_name: m.user_name || "" };
    });

  // Ventes à crédit de la période : quantités réellement sorties des dépôts du périmètre
  const credit: any[] = [];
  const truckCredit: any[] = [];
  const creditOrders = (db.orders as any[]).filter((o) => o.payment_method === "credit" && !["pending_approval", "cancelled", "rejected", "draft"].includes(o.status));
  for (const o of creditOrders) {
    for (const it of o.items || []) {
      if (!productIds.has(it.product_id)) continue;
      // Prix dans la devise de la commande (FC : prix unitaire en francs enregistré sur la ligne)
      const cur = o.currency || "USD";
      const price = cur === "CDF" && it.unit_price_fc != null ? Number(it.unit_price_fc) || 0 : Number(it.unit_price) || 0;
      const fromDepots = moves.filter((m) => m.reference === o.code && m.product_id === it.product_id && tsOf(m) >= from && tsOf(m) <= to && classify(m).bucket === "credit");
      const qty = fromDepots.reduce((s, m) => s + classify(m).qty, 0);
      if (qty) {
        const depotNames = Array.from(new Set(fromDepots.map((m) => db.warehouses.find((w) => w.id === m.warehouse_id)?.name).filter(Boolean)));
        credit.push({ order_code: o.code, date: fromDepots[0]?.at || o.approved_at || o.created_at, client: o.client_name, product: it.product_name || products.find((p) => p.id === it.product_id)?.name, qty, price, amount: Math.round(qty * price * 100) / 100, currency: cur, comment: `${o.code} · ${depotNames.join(", ")}` });
      }
      // Vente à crédit servie depuis un camion du site (hors tableau des dépôts)
      const ledgerEmbarked = (o.stock_ledger || []).filter((e: any) => e.kind === "embarked" && e.product_id === it.product_id);
      const when = new Date(o.stock_applied_at || o.approved_at || o.created_at).getTime();
      const marketer = db.users.find((u) => u.id === o.marketer_id) as any;
      const mSite = marketer?.site_id || siteOfWarehouse(marketer?.warehouse_id);
      if (ledgerEmbarked.length && (!params.warehouse_id || params.warehouse_id === "all") && mSite === site.id && when >= from && when <= to) {
        const q = ledgerEmbarked.reduce((s: number, e: any) => s + (Number(e.quantity) || 0), 0);
        truckCredit.push({ order_code: o.code, date: o.stock_applied_at || o.approved_at || o.created_at, client: o.client_name, product: it.product_name, qty: q, price, amount: Math.round(q * price * 100) / 100, currency: cur, comment: `${o.code} · camion de ${o.marketer_name || "marketeur"} (hors tableau des dépôts)` });
      }
    }
  }
  credit.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  truckCredit.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    site_id: site.id,
    site_name: site.name,
    category,
    warehouse_id: params.warehouse_id && params.warehouse_id !== "all" ? params.warehouse_id : "all",
    warehouse_name: params.warehouse_id && params.warehouse_id !== "all" ? depots[0]?.name : "Tous les dépôts",
    from: params.from,
    to: params.to,
    main: { rows: mainRows, totals: totals(mainRows), intra_site_neutral: depots.length > 1 },
    sections,
    notes,
    credit: [...credit, ...truckCredit],
    computed_at: new Date().toISOString(),
  };
}

export function mountStockReportRoutes(router: any, authenticate: any) {
  const userName = (req: any) => req.user?.full_name || req.user?.email || "Utilisateur";
  // Séparation des données par site : un utilisateur rattaché à un site ne voit que ce site
  const allowedSite = (req: any, siteId: string) => canSeeAllSites(req.user) || req.user?.site_id === siteId;

  router.get("/reports/stock-state", authenticate, (req: any, res: any) => {
    const q = req.query || {};
    if (!allowedSite(req, q.site_id)) return res.status(403).json({ detail: "Accès limité à votre site d'affectation" });
    try {
      res.json(computeStockState({ site_id: q.site_id, category: q.category, warehouse_id: q.warehouse_id, from: q.from, to: q.to }));
    } catch (e: any) {
      res.status(400).json({ detail: e?.message || "Rapport impossible" });
    }
  });

  // Historique : chaque rapport généré est conservé tel qu'il a été calculé
  router.post("/reports/stock-state/history", authenticate, (req: any, res: any) => {
    const b = req.body || {};
    if (!allowedSite(req, b.site_id)) return res.status(403).json({ detail: "Accès limité à votre site d'affectation" });
    try {
      const data = computeStockState({ site_id: b.site_id, category: b.category, warehouse_id: b.warehouse_id, from: b.from, to: b.to });
      const entry = {
        id: uuidv4(),
        site_id: data.site_id,
        site_name: data.site_name,
        category: data.category,
        warehouse_id: data.warehouse_id,
        warehouse_name: data.warehouse_name,
        from: data.from,
        to: data.to,
        period_label: String(b.period_label || ""),
        period_key: String(b.period_key || ""),
        generated_at: data.computed_at,
        generated_by: userName(req),
        generated_by_id: req.user?.id,
        data,
      };
      ((db as any).stock_reports ||= []).unshift(entry);
      res.status(201).json(entry);
    } catch (e: any) {
      res.status(400).json({ detail: e?.message || "Rapport impossible" });
    }
  });

  router.get("/reports/stock-state/history", authenticate, (req: any, res: any) => {
    const list = ((db as any).stock_reports || []) as any[];
    res.json(list.filter((r) => allowedSite(req, r.site_id)).map(({ data, ...meta }) => meta));
  });

  router.get("/reports/stock-state/history/:id", authenticate, (req: any, res: any) => {
    const r = (((db as any).stock_reports || []) as any[]).find((x) => x.id === req.params.id);
    if (!r || !allowedSite(req, r.site_id)) return res.status(404).json({ detail: "Rapport introuvable" });
    res.json(r);
  });
}
