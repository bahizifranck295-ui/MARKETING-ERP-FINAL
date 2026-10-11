import type express from "express";
import { db } from "./db";
import { ensureStockStructure } from "./stockStructure";

/*
 * Séparation des deux applications (même API, même base de données) :
 *  - Gestion commerciale (X-ERP-App: commercial) : Boutique, Commandes, CRM, Caisse, Crédits,
 *    Comptabilité, Rapports commerciaux, Objectifs, Administration ;
 *  - Stock & Livraison (X-ERP-App: logistique) : Stock, Livraison et rapports logistiques.
 * Chaque application n'accède qu'aux routes de ses modules. Les données dont l'autre a besoin
 * passent uniquement par les routes /integration/* ci-dessous (lecture, sans statistiques de stock),
 * et la sortie de stock à l'approbation d'une vente reste faite par le serveur (règle métier commune).
 */

const norm = (s: string) => String(s || "").trim().toLowerCase();
const starts = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(p + "/"));

// Routes réservées à chaque application
const LOGISTICS_ONLY = ["/stock", "/delivery", "/reports/stock-state"];
const COMMERCIAL_ONLY = ["/boutique", "/orders", "/clients", "/cash", "/credits", "/accounting", "/objectives", "/users", "/roles", "/audit", "/dashboard", "/reports/summary", "/reports/site-map"];

function ownerOf(method: string, path: string): "commercial" | "logistique" | null {
  if (starts(path, LOGISTICS_ONLY)) return "logistique";
  if (/^\/products\/[^/]+\/adjust$/.test(path)) return "logistique"; // ajustement de stock
  // Catalogue : lecture complète (quantités) côté logistique ; la création / modification d'un produit
  // reste possible depuis la Boutique (formulaire « Nouveau produit »)
  if (path === "/products" && method === "GET") return "logistique";
  if (starts(path, COMMERCIAL_ONLY)) return "commercial";
  return null; // commun : /auth, /notifications, /integration, /products (écriture), /roles/catalog…
}

/** Refuse à une application les routes des modules de l'autre application. */
export function appScopeGuard(req: any, res: any, next: any) {
  const app = String(req.headers?.["x-erp-app"] || "");
  if (app !== "commercial" && app !== "logistique") return next(); // appels sans application (outils, tests)
  const owner = ownerOf(req.method, req.path);
  if (owner && owner !== app) {
    return res.status(403).json({
      detail:
        owner === "logistique"
          ? "Ce module appartient au projet Stock & Livraison"
          : "Ce module appartient au projet Gestion commerciale",
    });
  }
  next();
}

export function mountIntegrationRoutes(router: express.Router, authenticate: any) {
  /* Référentiels partagés (lecture) */
  router.get("/integration/sites", authenticate, (_req: any, res: any) => {
    ensureStockStructure();
    res.json(
      ((db as any).sites || [])
        .filter((s: any) => s.is_active !== false)
        .map((s: any) => ({ id: s.id, code: s.code, name: s.name, location: s.location || "" }))
    );
  });

  router.get("/integration/categories", authenticate, (_req: any, res: any) => {
    ensureStockStructure();
    res.json(
      db.product_categories
        .map((name) => ({ name, product_count: db.products.filter((p) => p.is_active !== false && norm(p.category || "") === norm(name)).length }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    );
  });

  router.post("/integration/categories", authenticate, (req: any, res: any) => {
    ensureStockStructure();
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ detail: "Le nom de la catégorie est obligatoire" });
    const existing = db.product_categories.find((c) => norm(c) === norm(name));
    if (existing) return res.status(409).json({ detail: `La catégorie « ${existing} » existe déjà` });
    db.product_categories.push(name);
    res.status(201).json({ name, product_count: 0 });
  });

  router.delete("/integration/categories/:name", authenticate, (req: any, res: any) => {
    ensureStockStructure();
    const name = String(req.params.name || "");
    const idx = db.product_categories.findIndex((c) => norm(c) === norm(name));
    if (idx < 0) return res.status(404).json({ detail: "Catégorie introuvable" });
    const used = db.products.filter((p) => p.is_active !== false && norm(p.category || "") === norm(name)).length;
    if (used > 0) return res.status(409).json({ detail: `Impossible de supprimer « ${db.product_categories[idx]} » : ${used} produit(s) l'utilisent encore` });
    db.product_categories.splice(idx, 1);
    res.json({ ok: true });
  });

  /* Catalogue de vente pour la Gestion commerciale : prix et disponibilité, sans quantités de stock */
  router.get("/integration/catalog", authenticate, (_req: any, res: any) => {
    res.json(
      db.products
        .filter((p) => p.is_active !== false)
        .map((p: any) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          category: p.category,
          size: p.size,
          unit: p.unit,
          sell_price: p.sell_price,
          price_fc: p.price_fc,
          cost_price: p.cost_price,
          currency: p.currency,
          badge: p.badge,
          image_url: p.image_url,
          available: p.available !== false,
        }))
    );
  });

  /* Disponibilité à la vente (Boutique › Catégories) : un produit indisponible ne peut pas être commandé */
  router.put("/integration/catalog/:id/availability", authenticate, (req: any, res: any) => {
    const p: any = db.products.find((x) => x.id === req.params.id && x.is_active !== false);
    if (!p) return res.status(404).json({ detail: "Produit introuvable" });
    p.available = req.body?.available !== false;
    p.updated_at = new Date().toISOString();
    res.json({ id: p.id, available: p.available });
  });

  /* Ventes validées pour Stock & Livraison (courbes d'évolution du stock) : lignes vendues, sans montants */
  router.get("/integration/sales", authenticate, (_req: any, res: any) => {
    res.json(
      db.orders
        .filter((o) => ["validated", "prepared", "shipped", "delivered"].includes(o.status))
        .map((o: any) => ({
          id: o.id,
          code: o.code,
          status: o.status,
          created_at: o.created_at,
          approved_at: o.approved_at,
          items: (o.items || []).map((it: any) => ({ product_id: it.product_id, product_name: it.product_name, quantity: it.quantity, stock_source: it.stock_source })),
        }))
    );
  });
}
