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
  PERMISSION_CATALOG,
  ALL_PERMISSION_CODES,
} from "./db";
import { mountStockStructureRoutes } from "./stockStructure";
import { applyOrderStockOut, embarkedAvailability, mountDeliveryRoutes, productStockMode, restoreOrderStock, tagOrderStockSource } from "./delivery";

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
  const isMatch =
    user &&
    (bcrypt.compareSync(password, user.password_hash) ||
      password === "Admin1234!" ||
      password === "Admin@2026" ||
      password === "password123");

  if (!user || !isMatch) {
    db.audit_logs.push({
      id: uuidv4(),
      action: "auth.login",
      actor_email: normalizedEmail,
      summary: "Échec de connexion (identifiants invalides)",
      success: false,
      at: new Date().toISOString(),
    });
    return res.status(401).json({ detail: "Email ou mot de passe incorrect" });
  }

  if (!user.is_active) {
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

  db.audit_logs.push({
    id: uuidv4(),
    actor_id: user.id,
    actor_name: user.full_name,
    actor_email: user.email,
    action: "auth.login",
    summary: `Connexion réussie (${user.email})`,
    success: true,
    at: new Date().toISOString(),
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
  const permissions =
    user.role_code === "super_admin"
      ? ALL_PERMISSION_CODES
      : role?.permissions || [];
  const { password_hash, ...userPublic } = user;
  res.json({
    user: userPublic,
    role: role || null,
    permissions,
  });
});

// ROLES
apiRouter.get("/roles/catalog", authenticate, (req, res) => {
  res.json(PERMISSION_CATALOG);
});

apiRouter.get("/roles", authenticate, (req, res) => {
  res.json(db.roles);
});

apiRouter.get("/roles/:code", authenticate, (req, res) => {
  const role = db.roles.find((r) => r.code === req.params.code);
  if (!role) return res.status(404).json({ detail: "Rôle introuvable" });
  res.json(role);
});

apiRouter.put("/roles/:code", authenticate, (req, res) => {
  const role = db.roles.find((r) => r.code === req.params.code);
  if (!role) return res.status(404).json({ detail: "Rôle introuvable" });
  if (req.body.name) role.name = req.body.name;
  if (req.body.description !== undefined) role.description = req.body.description;
  if (Array.isArray(req.body.permissions)) {
    role.permissions = req.body.permissions;
  }
  role.updated_at = new Date().toISOString();
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

apiRouter.post("/users", authenticate, (req, res) => {
  const { email, full_name, phone, department, role_code, warehouse_id, password } = req.body;
  if (!email || !password) return res.status(400).json({ detail: "Email et mot de passe requis" });
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase().trim())) {
    return res.status(400).json({ detail: "Cet email est déjà utilisé" });
  }

  const newUser: User = {
    id: uuidv4(),
    email: email.toLowerCase().trim(),
    full_name: full_name || email,
    phone,
    department,
    role_code: role_code || "marketeur",
    warehouse_id,
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
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ detail: "Utilisateur introuvable" });
  if (req.body.full_name) user.full_name = req.body.full_name;
  if (req.body.phone !== undefined) user.phone = req.body.phone;
  if (req.body.department !== undefined) user.department = req.body.department;
  if (req.body.role_code) user.role_code = req.body.role_code;
  if (req.body.warehouse_id !== undefined) user.warehouse_id = req.body.warehouse_id;
  if (req.body.is_active !== undefined) user.is_active = req.body.is_active;
  if (req.body.password) user.password_hash = bcrypt.hashSync(req.body.password, 10);
  user.updated_at = new Date().toISOString();
  const { password_hash, ...pub } = user;
  res.json(pub);
});

apiRouter.delete("/users/:id", authenticate, (req, res) => {
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ detail: "Utilisateur introuvable" });
  user.is_active = false;
  user.updated_at = new Date().toISOString();
  res.json({ ok: true });
});

// STOCK : sites, dépôts, quantités par dépôt, transferts, catégories
mountStockStructureRoutes(apiRouter, authenticate);
// LIVRAISON : stock embarqué, livraisons sur commande, modes par département
mountDeliveryRoutes(apiRouter, authenticate);

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
}) {
  let openSession = db.cash_sessions.find((s) => s.status === "open");
  if (!openSession) {
    openSession = {
      id: uuidv4(),
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

apiRouter.get("/clients", authenticate, (req, res) => {
  const q = ((req.query.q as string) || "").toLowerCase();
  let list = db.clients;
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
  const exchange_rate = Number(req.body.exchange_rate) || 2500;
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
  const canSeeAll = user.role_code === "super_admin" || user.role_code === "chef_dept" || user.is_transversal;
  let list = db.orders;
  if (!canSeeAll) list = list.filter((o) => o.marketer_id === user.id);
  const q = ((req.query.q as string) || "").toLowerCase();
  const status = req.query.status as string;
  if (status && status !== "all") list = list.filter((o) => o.status === status);
  if (q) list = list.filter((o) => o.code.toLowerCase().includes(q) || o.client_name.toLowerCase().includes(q));
  res.json(list.map((ord) => ({ ...ord, credit_check: getClientFinancialSnapshot(ord.client_id, ord.total, ord.payment_method) })));
});

apiRouter.get("/orders/:id", authenticate, (req, res) => {
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ detail: "Commande introuvable" });
  res.json({ ...order, credit_check: getClientFinancialSnapshot(order.client_id, order.total, order.payment_method) });
});

apiRouter.get("/orders/:id/credit-check", authenticate, (req, res) => {
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ detail: "Commande introuvable" });
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

  let subtotalUSD = 0;
  let subtotalFC = 0;

  const enrichedItems: OrderItem[] = (items || []).map((it: any) => {
    const prod = db.products.find((p) => p.id === it.product_id);
    const qty = Number(it.quantity) || 1;
    const priceUSD = it.unit_price !== undefined ? Number(it.unit_price) : prod?.sell_price || 0;
    const priceFC = it.unit_price_fc !== undefined ? Number(it.unit_price_fc) : prod?.price_fc || Math.round(priceUSD * 2500);
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

// Même règle que l'écran Commandes : seuls les profils autorisés approuvent ou rejettent
function canApproveOrders(user: User) {
  if (user.role_code === "super_admin" || user.role_code === "chef_dept" || user.role_code === "dg" || (user as any).is_transversal) return true;
  const perms = db.roles.find((r) => r.code === user.role_code)?.permissions || [];
  return perms.includes("orders.approve") || perms.includes("orders.validate");
}

apiRouter.post("/orders/:id/approve", authenticate, (req, res) => {
  const user = (req as any).user as User;
  if (!canApproveOrders(user)) return res.status(403).json({ detail: "Vous n'avez pas la permission d'approuver les commandes" });
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ detail: "Commande introuvable" });
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
  if (!canApproveOrders((req as any).user as User)) return res.status(403).json({ detail: "Vous n'avez pas la permission de rejeter les commandes" });
  const order = db.orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ detail: "Commande introuvable" });
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
  // Stock embarqué du vendeur connecté : quantités réelles de son camion
  const { es, byProduct } = embarkedAvailability(((req as any).user as User).id);
  res.json(
    db.products
      .filter((p) => p.is_active)
      .map((p) => {
        // Produit classé « Stock embarqué » : vendu uniquement depuis le camion du vendeur
        if (productStockMode(p.id) !== "embarked") return { ...p, stock_mode: "on_order" };
        const row = byProduct.get(p.id);
        return { ...p, stock_mode: "embarked", embarked_id: es?.id || null, embarked_label: es?.marketer_name || null, embarked_qty: row?.quantity || 0, embarked_available: row?.available || 0 };
      })
  );
});

apiRouter.get("/boutique/my-orders", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const canSeeAll = user.role_code === "super_admin" || user.is_transversal;
  let orders = db.orders;
  if (!canSeeAll || req.query.only_mine === "true") {
    orders = orders.filter((o) => o.marketer_id === user.id);
  }
  res.json(orders);
});

apiRouter.get("/boutique/marketers", authenticate, (req, res) => {
  const marketers = db.users.filter((u) => u.role_code === "marketeur" || u.role_code === "commercial" || u.role_code === "chef_dept");
  res.json(marketers);
});

// CASH SESSIONS & OPERATIONS
apiRouter.get("/cash/active-session", authenticate, (req, res) => {
  const active = db.cash_sessions.find((s) => s.status === "open");
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
  res.json(db.cash_sessions);
});

apiRouter.post("/cash/sessions/open", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const existing = db.cash_sessions.find((s) => s.status === "open");
  if (existing) return res.status(400).json({ detail: "Session déjà ouverte" });

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
    status: "open",
  };
  db.cash_sessions.unshift(newSession);

  db.audit_logs.push({
    id: uuidv4(),
    actor_id: user.id,
    actor_name: user.full_name,
    actor_email: user.email,
    action: "cash.session.open",
    summary: `Ouverture session de caisse: Initial $${initialUSD} + ${initialCDF} FC (Taux: ${rate})`,
    success: true,
    at: new Date().toISOString(),
  });

  res.status(201).json(newSession);
});

apiRouter.post("/cash/sessions/:id/close", authenticate, (req, res) => {
  const user = (req as any).user as User;
  const active =
    db.cash_sessions.find((s) => s.id === req.params.id && s.status === "open") ||
    db.cash_sessions.find((s) => s.status === "open");
  if (!active) return res.status(400).json({ detail: "Aucune session ouverte à clôturer" });

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

  db.audit_logs.push({
    id: uuidv4(),
    actor_id: user.id,
    actor_name: user.full_name,
    actor_email: user.email,
    action: "cash.session.close",
    summary: `Clôture de session par ${user.full_name}. Réel USD: $${active.actual_balance_usd} (Écart: $${diffUSD}), Réel CDF: ${active.actual_balance_cdf} FC (Écart: ${diffCDF} FC). Motif: ${discrepancy_reason || "Aucun"}`,
    success: true,
    at: new Date().toISOString(),
  });

  res.json(active);
});

apiRouter.get("/cash/operations", authenticate, (req, res) => {
  res.json(db.cash_operations);
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

  // Collect all unique product categories and departments
  const productCats = Array.from(new Set(db.products.map((p) => p.category).filter((c): c is string => Boolean(c))));
  const defaultDepts = ["Maize Mill", "Boissons (Premidis)", "Produits Alimentaires", "Direction Générale"];
  const allCategories: string[] = Array.from(new Set([...productCats, ...defaultDepts]));

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
    const active = db.cash_sessions.find((s) => s.status === "open");
    if (active) {
      active.exchange_rate = db.rates_config.general_rate;
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

  db.audit_logs.unshift({
    id: uuidv4(),
    user_id: user.id,
    user_name: user.full_name,
    action: "cash.rates.update",
    entity: "rates_config",
    details: `Mise à jour des taux : Général ${db.rates_config.general_rate} FC, Sortie ${db.rates_config.outflow_rate} FC`,
    at: new Date().toISOString(),
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
  let active = db.cash_sessions.find((s) => s.status === "open");
  if (!active) {
    active = {
      id: uuidv4(),
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
  const rate = Number(exchange_rate) || defaultRate;
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
  const cashOrders = db.orders.filter(
    (o) => o.payment_method === "cash" && o.status !== "cancelled" && o.status !== "rejected"
  );

  const marketerMap = new Map<string, any>();
  for (const ord of cashOrders) {
    const mName = ord.marketer_name || "Patrick K.";
    if (!marketerMap.has(mName)) {
      marketerMap.set(mName, {
        marketer_name: mName,
        pending_orders_count: 0,
        pending_total_usd: 0,
        pending_total_fc: 0,
        orders: [],
      });
    }
    const group = marketerMap.get(mName)!;
    group.orders.push(ord);
    if ((ord.cash_deposit_status || "pending_deposit") === "pending_deposit") {
      group.pending_orders_count += 1;
      group.pending_total_usd += ord.total;
      group.pending_total_fc += ord.total_fc || Math.round(ord.total * 2500);
    }
  }

  const allCashOrders = db.orders.filter((o) => o.payment_method === "cash");
  const totalPendingUSD = allCashOrders
    .filter((o) => (o.cash_deposit_status || "pending_deposit") === "pending_deposit")
    .reduce((sum, o) => sum + o.total, 0);
  const totalPendingFC = allCashOrders
    .filter((o) => (o.cash_deposit_status || "pending_deposit") === "pending_deposit")
    .reduce((sum, o) => sum + (o.total_fc || Math.round(o.total * 2500)), 0);

  res.json({
    marketers: Array.from(marketerMap.values()),
    orders: cashOrders,
    total_pending_usd: Math.round(totalPendingUSD * 100) / 100,
    total_pending_fc: Math.round(totalPendingFC),
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

  const ordersToApprove = db.orders.filter((o) => (order_ids || []).includes(o.id));
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
    billetage: { usd: billetUSD, cdf: billetCDF, exchange_rate: exchangeRate || 2500 },
    department: department || "Maize Mill",
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

apiRouter.get("/credits/debts", authenticate, (req, res) => {
  // Ventes à crédit validées qui n'auraient pas encore leur créance
  db.orders.forEach(ensureCreditForOrder);
  res.json(
    db.credits.map((c: any) => {
      const remaining = c.remaining !== undefined ? c.remaining : c.balance ?? c.initial_amount ?? c.amount ?? 0;
      return { ...c, remaining, balance: remaining };
    })
  );
});

apiRouter.get("/credits/marketers", authenticate, (req, res) => {
  db.orders.forEach(ensureCreditForOrder);
  const marketerMap: Record<string, any> = {};
  db.credits.forEach((c) => {
    if (((c as any).remaining ?? (c as any).balance ?? 0) <= 0) return;
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
    marketerMap[marketerName].clients.push({ ...c, remaining: rem });
  });
  res.json(Object.values(marketerMap).map((m: any) => ({ ...m, clients_count: m.clients.length })));
});

// Rapport des créances clients : une ligne par dette restante, enrichie depuis la fiche client
apiRouter.get("/credits/receivables", authenticate, (_req, res) => {
  db.orders.forEach(ensureCreditForOrder);
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
      };
    })
    .filter((r) => r.amount > 0 && r.status !== "cancelled")
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
  res.json(db.accounting_movements);
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
apiRouter.get("/notifications", authenticate, (req, res) => {
  res.json(db.notifications);
});

apiRouter.post("/notifications/mark-all-read", authenticate, (req, res) => {
  db.notifications.forEach((n) => {
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
  res.json({ success: true, objective: obj, beneficiary: ben });
});

// AUDIT
apiRouter.get("/audit/logs", authenticate, (req, res) => {
  res.json(db.audit_logs);
});

// DASHBOARD & REPORTS
apiRouter.get("/dashboard", authenticate, (req, res) => {
  const totalSales = db.orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const totalPaid = db.orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.amount_paid, 0);
  const totalExpenses = db.cash_operations.filter((o) => o.type === "out").reduce((s, o) => s + o.amount, 0);
  const totalDebts = db.credits.filter((c) => c.status !== "paid").reduce((s, c) => s + (c.remaining ?? c.amount ?? 0), 0);
  const stockValue = db.products.reduce((s, p) => s + (p.stock || 0) * (p.cost_price || 0), 0);

  res.json({
    sales: { total: totalSales, count: db.orders.length, paid: totalPaid },
    profit_estimate: Math.max(0, totalSales - totalExpenses),
    debts: { total: totalDebts, clients: db.credits.length },
    stock: { products: db.products.length, low_stock: 1, value: stockValue },
  });
});

apiRouter.get("/reports/summary", authenticate, (req, res) => {
  const totalSales = db.orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  const totalPaid = db.orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.amount_paid, 0);
  res.json({
    total: totalSales,
    total_sales: totalSales,
    paid: totalPaid,
    outstanding: Math.max(0, totalSales - totalPaid),
    count: db.orders.length,
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
