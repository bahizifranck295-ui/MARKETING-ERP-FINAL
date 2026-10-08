import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

export const PERMISSION_CATALOG: Record<string, Array<{ code: string; label: string }>> = {
  Administration: [
    { code: "users.read", label: "Consulter les utilisateurs" },
    { code: "users.create", label: "Créer un utilisateur" },
    { code: "users.update", label: "Modifier un utilisateur" },
    { code: "users.delete", label: "Désactiver / supprimer un utilisateur" },
    { code: "roles.read", label: "Consulter les rôles et permissions" },
    { code: "roles.manage", label: "Gérer les rôles et permissions" },
    { code: "audit.read", label: "Consulter le journal d'audit" },
    { code: "settings.read", label: "Consulter les paramètres" },
    { code: "settings.manage", label: "Gérer les paramètres" },
  ],
  "CRM Clients": [
    { code: "crm.read", label: "Consulter les clients" },
    { code: "crm.create", label: "Créer un client" },
    { code: "crm.update", label: "Modifier un client" },
    { code: "crm.delete", label: "Supprimer un client" },
  ],
  Commandes: [
    { code: "orders.read", label: "Consulter les commandes" },
    { code: "orders.create", label: "Créer une commande" },
    { code: "orders.update", label: "Modifier une commande" },
    { code: "orders.validate", label: "Valider une commande" },
    { code: "orders.delete", label: "Annuler une commande" },
  ],
  Caisse: [
    { code: "cash.read", label: "Consulter la caisse" },
    { code: "cash.create", label: "Enregistrer une opération de caisse" },
    { code: "cash.update", label: "Modifier une opération" },
    { code: "cash.close", label: "Clôturer la caisse" },
    { code: "billeting.read", label: "Consulter le billetage" },
    { code: "billeting.manage", label: "Gérer le billetage numérique" },
  ],
  "Crédits & Paiements": [
    { code: "credits.read", label: "Consulter les crédits clients" },
    { code: "credits.manage", label: "Gérer les crédits et paiements" },
  ],
  Stock: [
    { code: "stock.read", label: "Consulter le stock" },
    { code: "stock.create", label: "Ajouter un produit" },
    { code: "stock.update", label: "Modifier un produit" },
    { code: "stock.adjust", label: "Ajuster le stock (inventaire)" },
    { code: "stock.transfer", label: "Transférer du stock entre dépôts" },
    { code: "warehouse.read", label: "Consulter les dépôts" },
    { code: "warehouse.manage", label: "Gérer les dépôts" },
  ],
  Livraison: [
    { code: "delivery.read", label: "Consulter les livraisons" },
    { code: "delivery.create", label: "Préparer une livraison" },
    { code: "delivery.dispatch", label: "Chargement camion / Expédition" },
    { code: "delivery.confirm", label: "Confirmer la livraison" },
  ],
  "Rapports & KPIs": [
    { code: "dashboard.read", label: "Consulter le tableau de bord" },
    { code: "reports.read", label: "Consulter les rapports et statistiques" },
    { code: "objectives.read", label: "Consulter les objectifs commerciaux" },
    { code: "objectives.manage", label: "Gérer les objectifs commerciaux" },
    { code: "accounting.read", label: "Consulter les écritures comptables" },
  ],
  "Boutique & Ventes Terrain": [
    { code: "boutique.read", label: "Consulter la boutique et produits" },
    { code: "boutique.order", label: "Créer une commande dans la boutique" },
    { code: "orders.all", label: "Voir toutes les commandes (tous vendeurs)" },
    { code: "orders.approve", label: "Approuver ou rejeter les commandes Boutique" },
  ],
};

export const ALL_PERMISSION_CODES: string[] = Object.values(PERMISSION_CATALOG).flatMap((items) =>
  items.map((i) => i.code)
);

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  department?: string;
  role_code: string;
  warehouse_id?: string;
  business_unit_id?: string;
  site_id?: string;
  is_transversal?: boolean;
  is_active: boolean;
  password?: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  department?: string;
  description?: string;
  permissions: string[];
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address?: string;
  city?: string;
  site_id?: string;
  manager?: string;
  manager_user_id?: string;
  capacity?: number;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category?: string;
  size?: string;
  unit: string;
  cost_price: number;
  sell_price: number;
  price_fc?: number;
  badge?: string;
  image_url?: string;
  currency: string;
  warehouse_id?: string;
  business_unit_id?: string;
  site_id?: string;
  stock: number;
  current_stock?: number;
  alert_threshold?: number;
  low_stock_threshold: number;
  bonus_rules: any[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  code: string;
  name: string;
  type: string;
  phone?: string;
  secondary_phone?: string;
  email?: string;
  address?: string;
  city?: string;
  site_id?: string;
  credit_limit: number;
  current_credit: number;
  balance: number;
  initial_balance?: number;
  photo_url?: string;
  product_id?: string;
  product_name?: string;
  business_unit?: string;
  department?: string;
  marketer_name?: string;
  marketer_id?: string;
  order_num?: number;
  document_url?: string;
  document_name?: string;
  document_type?: string;
  document_size?: string;
  document_uploaded_at?: string;
  document_verified?: boolean;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  product_id: string;
  product_code?: string;
  product_name?: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  unit_price_fc?: number;
  discount?: number;
  bonus_qty?: number;
  bonus_percent?: number;
  total_qty?: number;
  line_total: number;
  line_total_fc?: number;
  // Source du stock fixée à la création de la vente
  stock_source?: "embarked" | "on_order";
  embarked_id?: string;
  embarked_owner_id?: string;
  embarked_owner_name?: string;
}

export interface Order {
  id: string;
  code: string;
  client_id: string;
  client_name: string;
  client_phone?: string;
  marketer_id?: string;
  marketer_name?: string;
  business_unit_id?: string;
  site_id?: string;
  source?: "boutique" | "direct" | "standard";
  currency?: string;
  items: OrderItem[];
  subtotal: number;
  subtotal_fc?: number;
  discount: number;
  total: number;
  total_fc?: number;
  amount_paid: number;
  amount_paid_fc?: number;
  outstanding: number;
  outstanding_fc?: number;
  payment_method: string;
  payment_status: "paid" | "partial" | "unpaid";
  cash_deposit_status?: "pending_deposit" | "deposited" | "not_applicable";
  cash_deposited_at?: string;
  cash_deposited_by?: string;
  cash_deposit_billetage?: any;
  cash_deposit_notes?: string;
  bank_reference?: string;
  status:
    | "draft"
    | "pending"
    | "pending_approval"
    | "validated"
    | "prepared"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "rejected";
  rejection_reason?: string;
  approved_by?: string;
  approved_at?: string;
  delivery_address?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CashSession {
  id: string;
  opened_by: string;
  opened_by_name?: string;
  opened_at: string;
  initial_balance: number;
  initial_balance_usd?: number;
  initial_balance_cdf?: number;
  initial_billetage?: {
    usd?: Record<string, number>;
    cdf?: Record<string, number>;
    exchange_rate?: number;
  };
  closed_by?: string;
  closed_at?: string;
  actual_balance?: number;
  actual_balance_usd?: number;
  actual_balance_cdf?: number;
  theoretical_balance?: number;
  theoretical_balance_usd?: number;
  theoretical_balance_cdf?: number;
  difference?: number;
  difference_usd?: number;
  difference_cdf?: number;
  closing_billetage?: {
    usd?: Record<string, number>;
    cdf?: Record<string, number>;
    total_usd?: number;
    total_cdf?: number;
    exchange_rate?: number;
  };
  department?: string;
  discrepancy_reason?: string;
  closing_document_url?: string;
  closing_document_name?: string;
  exchange_rate?: number;
  status: "open" | "closed";
  notes?: string;
}

export interface CashOperation {
  id: string;
  session_id: string;
  type: "in" | "out";
  category: string;
  amount: number;
  currency?: "USD" | "CDF";
  amount_usd?: number;
  amount_cdf?: number;
  exchange_rate?: number;
  reason: string;
  reference?: string;
  client_id?: string;
  client_name?: string;
  marketer_id?: string;
  marketer_name?: string;
  beneficiary?: string;
  authorized_by?: string;
  authorization_proof?: string;
  document_url?: string;
  document_name?: string;
  document_type?: string;
  document_size?: string;
  payment_method?: string;
  department?: string;
  client_allocations?: Array<{
    client_id: string;
    client_name: string;
    amount: number;
    amount_usd?: number;
  }>;
  billetage?: {
    usd?: Record<string, number>;
    cdf?: Record<string, number>;
    total_usd?: number;
    total_cdf?: number;
    exchange_rate?: number;
  };
  is_reversed?: boolean;
  reversed_at?: string;
  reversed_by?: string;
  created_at: string;
  created_by?: string;
}

export interface Delivery {
  id: string;
  code?: string;
  order_id: string;
  order_code: string;
  client_name: string;
  client_phone?: string;
  address?: string;
  items: any[];
  status: "prepared" | "shipped" | "delivered" | "cancelled";
  vehicle_plate?: string;
  driver_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CreditPayment {
  id: string;
  amount: number;
  currency?: string;
  method: string;
  date: string;
  cashier_name?: string;
  billetage?: any;
  notes?: string;
}

export interface Credit {
  id: string;
  order_id?: string;
  order_code?: string;
  client_id: string;
  client_name: string;
  client_code?: string;
  client_phone?: string;
  marketer_id?: string;
  marketer_name?: string;
  initial_amount: number;
  amount?: number;
  paid: number;
  remaining: number;
  balance?: number;
  currency?: string;
  status: "pending" | "partial" | "paid";
  due_date?: string;
  created_at: string;
  payments?: CreditPayment[];
}

export interface Notification {
  id: string;
  user_id?: string;
  role_code?: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  is_read?: boolean;
  at: string;
}

export interface ObjectiveBeneficiary {
  user_id: string;
  user_name: string;
  role_code?: string;
  bonus_type: "money" | "nature";
  bonus_amount: number;
  bonus_qty: number;
  bonus_unit: string;
  status: "pending" | "paid";
  paid_at?: string;
  paid_by?: string;
  payment_ref?: string;
}

export interface Objective {
  id: string;
  business_unit?: string;
  site?: string;
  label?: string;
  user_id?: string;
  user_name?: string;
  target_amount: number;
  target_qty?: number;
  actual_amount?: number;
  current_amount?: number;
  actual_qty?: number;
  unit?: string;
  bonus_type?: "money" | "nature";
  bonus_amount?: number;
  bonus_qty?: number;
  bonus_unit?: string;
  beneficiaries?: ObjectiveBeneficiary[];
  period?: string;
  period_start?: string;
  period_end?: string;
  status: "active" | "reached" | "completed" | "in_progress";
  created_at?: string;
}

export interface AuditLog {
  id: string;
  actor_id?: string;
  actor_name?: string;
  actor_email?: string;
  user_id?: string;
  user_name?: string;
  action: string;
  entity?: string;
  entity_id?: string;
  summary?: string;
  details?: string;
  success?: boolean;
  at: string;
  created_at?: string;
  ip?: string;
}

export interface ExchangeRateConfig {
  general_rate: number;
  outflow_rate: number;
  category_rates: Record<string, number>;
  updated_at: string;
  updated_by?: string;
}

export const db = {
  users: [] as User[],
  roles: [] as Role[],
  warehouses: [] as Warehouse[],
  products: [] as Product[],
  clients: [] as Client[],
  orders: [] as Order[],
  cash_sessions: [] as CashSession[],
  cash_operations: [] as CashOperation[],
  deliveries: [] as Delivery[],
  credits: [] as Credit[],
  notifications: [] as Notification[],
  objectives: [] as Objective[],
  audit_logs: [] as AuditLog[],
  stock_movements: [] as any[],
  // Module Stock : Sites → Dépôts → Produits → Quantités (voir stockStructure.ts)
  sites: [] as any[],
  stock_levels: [] as any[],
  stock_transfers: [] as any[],
  product_categories: [] as string[],
  // Module Livraison : camions, stock embarqué des marketeurs, modes par département (voir delivery.ts)
  vehicles: [] as any[],
  embarked_stocks: [] as any[],
  embarked_levels: [] as any[],
  embarked_movements: [] as any[],
  delivery_department_modes: {} as Record<string, "embarked" | "on_order">,
  accounting_movements: [] as any[],
  expense_categories: [] as string[],
  rates_config: {
    general_rate: 2500,
    outflow_rate: 2500,
    category_rates: {
      "Eau": 2500,
      "Jus": 2500,
      "Bière": 2500,
      "Boisson": 2500,
      "Whisky": 2500,
      "Vin": 2500,
      "Produits": 2500,
      "Maize Mill": 2500,
      "Boissons (Premidis)": 2500,
      "Produits Alimentaires": 2500,
      "Direction Générale": 2500,
    },
    updated_at: new Date().toISOString(),
    updated_by: "Système",
  } as ExchangeRateConfig,
};

export function seedData() {
  const now = new Date().toISOString();

  // Roles
  db.roles = [
    {
      id: uuidv4(),
      code: "super_admin",
      name: "Super Administrateur",
      department: "Direction Générale",
      description: "Accès complet et illimité à tous les modules",
      permissions: ALL_PERMISSION_CODES,
      is_system: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      code: "chef_dept",
      name: "Chef de Département / Responsable",
      department: "Ventes & Distribution",
      description: "Supervision des ventes, validation des commandes et approbations",
      permissions: [
        "crm.read", "crm.create", "crm.update",
        "orders.read", "orders.create", "orders.validate", "orders.approve", "orders.delete", "orders.all",
        "stock.read", "reports.read", "boutique.read", "cash.read"
      ],
      is_system: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      code: "commercial",
      name: "Commercial / Vendeur",
      department: "Ventes",
      description: "Prise de commandes, gestion des clients et suivi des objectifs",
      permissions: [
        "crm.read", "crm.create", "crm.update",
        "orders.read", "orders.create",
        "boutique.read", "boutique.order",
        "objectives.read"
      ],
      is_system: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      code: "marketeur",
      name: "Revendeur / Vendeur Terrain",
      department: "Ventes Terrain",
      description: "Prise de commandes terrain via Boutique, gestion de ses ventes",
      permissions: [
        "crm.read", "crm.create",
        "orders.read", "orders.create",
        "boutique.read", "boutique.order",
        "objectives.read"
      ],
      is_system: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      code: "gestionnaire_stock",
      name: "Gestionnaire de Stock",
      department: "Logistique",
      description: "Entrées, sorties, inventaires et gestion multi-dépôts",
      permissions: ["stock.read", "stock.create", "stock.update", "stock.adjust", "stock.transfer", "warehouse.read"],
      is_system: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      code: "caissier",
      name: "Caissier",
      department: "Finance",
      description: "Ouverture/fermeture de caisse, encaissements et billetage",
      permissions: ["cash.read", "cash.create", "cash.update", "cash.close", "billeting.read", "billeting.manage"],
      is_system: true,
      created_at: now,
      updated_at: now,
    },
  ];

  const adminPwdHash = bcrypt.hashSync("Admin@2026", 10);

  const adminUser: User = {
    id: "usr_admin_default",
    email: "admin@erp.local",
    full_name: "Super Administrateur",
    phone: "+243 999 000 001",
    department: "Direction Générale",
    role_code: "super_admin",
    is_transversal: true,
    is_active: true,
    password_hash: adminPwdHash,
    created_at: now,
    updated_at: now,
  };
  db.users.push(adminUser);

  const marketerUser: User = {
    id: "usr_patrick_k",
    email: "marketer@erp.local",
    full_name: "Patrick K.",
    phone: "+243 971 002 001",
    department: "Ventes Goma Nord",
    role_code: "marketeur",
    is_active: true,
    password_hash: adminPwdHash,
    created_at: now,
    updated_at: now,
  };
  db.users.push(marketerUser);

  const marketerUser2: User = {
    id: "usr_sarah_k",
    email: "sarah.kalala@erp.local",
    full_name: "Sarah Kalala",
    phone: "+243 812 445 566",
    department: "Ventes Goma Sud",
    role_code: "marketeur",
    is_active: true,
    password_hash: adminPwdHash,
    created_at: now,
    updated_at: now,
  };
  db.users.push(marketerUser2);

  const marketerUser3: User = {
    id: "usr_jean_k",
    email: "jean.kasongo@erp.local",
    full_name: "Jean Kasongo",
    phone: "+243 850 789 123",
    department: "Ventes Bukavu",
    role_code: "commercial",
    is_active: true,
    password_hash: adminPwdHash,
    created_at: now,
    updated_at: now,
  };
  db.users.push(marketerUser3);

  const chefUser: User = {
    id: "usr_alice_m",
    email: "chef@erp.local",
    full_name: "Alice M.",
    phone: "+243 992 003 002",
    department: "Direction Commerciale",
    role_code: "chef_dept",
    is_active: true,
    password_hash: adminPwdHash,
    created_at: now,
    updated_at: now,
  };
  db.users.push(chefUser);

  const defaultWarehouse: Warehouse = {
    id: "wh_goma",
    code: "DEP-GOMA",
    name: "Dépôt Central Goma",
    address: "20 Route Aéroport, Q. Bujovu",
    city: "Goma, RDC",
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  db.warehouses.push(defaultWarehouse);

  const sampleProducts = [
    {
      code: "PRD-EAU-AQUA",
      name: "Eau AQua 500ml",
      category: "Eau",
      unit: "Bouteille",
      cost_price: 0.14,
      sell_price: 0.20,
      price_fc: 500,
      stock: 240,
      low_stock_threshold: 30,
      badge: "Nouveau",
      image_url: "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=600&auto=format&fit=crop&q=80",
    },
    {
      code: "PRD-JUS-PULPY",
      name: "Jus Pulpy 1L",
      category: "Jus",
      unit: "Bouteille",
      cost_price: 0.72,
      sell_price: 1.00,
      price_fc: 2500,
      stock: 150,
      low_stock_threshold: 20,
      badge: "",
      image_url: "https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=600&auto=format&fit=crop&q=80",
    },
    {
      code: "PRD-SKOL-65",
      name: "Skol Lager 65cl",
      category: "Bière",
      unit: "Bouteille",
      cost_price: 0.60,
      sell_price: 0.80,
      price_fc: 2000,
      stock: 180,
      low_stock_threshold: 25,
      badge: "",
      image_url: "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&auto=format&fit=crop&q=80",
    },
    {
      code: "PRD-COCA-50",
      name: "Coca Cola 50cl",
      category: "Boisson",
      unit: "Bouteille",
      cost_price: 0.30,
      sell_price: 0.40,
      price_fc: 1000,
      stock: 320,
      low_stock_threshold: 40,
      badge: "",
      image_url: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80",
    },
    {
      code: "PRD-JW-RED",
      name: "Johnnie Walker Red",
      category: "Whisky",
      unit: "Bouteille",
      cost_price: 7.60,
      sell_price: 10.00,
      price_fc: 25000,
      stock: 45,
      low_stock_threshold: 10,
      badge: "",
      image_url: "https://images.unsplash.com/photo-1527281400683-1aae777175f8?w=600&auto=format&fit=crop&q=80",
    },
    {
      code: "PRD-VIN-4COUS",
      name: "Vin 4 Cousins Rouge",
      category: "Vin",
      unit: "Bouteille",
      cost_price: 3.00,
      sell_price: 4.00,
      price_fc: 10000,
      stock: 12,
      low_stock_threshold: 15,
      badge: "Stock faible",
      image_url: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&auto=format&fit=crop&q=80",
    },
    {
      code: "PRD-EAU-LAVIE",
      name: "Eau Pure La Vie 1.5L",
      category: "Eau",
      unit: "Bouteille",
      cost_price: 0.35,
      sell_price: 0.50,
      price_fc: 1200,
      stock: 350,
      low_stock_threshold: 50,
      badge: "",
      image_url: "https://images.unsplash.com/photo-1559839914-1b396e6dd9d9?w=600&auto=format&fit=crop&q=80",
    },
    {
      code: "PRD-MAIS-25K",
      name: "Farine de Maïs Extra 25kg",
      category: "Produits",
      unit: "Sac",
      cost_price: 16.0,
      sell_price: 20.0,
      price_fc: 50000,
      stock: 90,
      low_stock_threshold: 15,
      badge: "",
      image_url: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80",
    },
    {
      code: "PRD-HUILE-5L",
      name: "Huile Végétale Simba 5L",
      category: "Produits",
      unit: "Bidon",
      cost_price: 6.50,
      sell_price: 8.50,
      price_fc: 21250,
      stock: 65,
      low_stock_threshold: 10,
      badge: "Populaire",
      image_url: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&auto=format&fit=crop&q=80",
    },
  ];

  for (const sp of sampleProducts) {
    db.products.push({
      id: uuidv4(),
      code: sp.code,
      name: sp.name,
      category: sp.category,
      unit: sp.unit,
      cost_price: sp.cost_price,
      sell_price: sp.sell_price,
      price_fc: sp.price_fc,
      badge: sp.badge || undefined,
      image_url: sp.image_url || undefined,
      currency: "USD",
      warehouse_id: defaultWarehouse.id,
      stock: sp.stock,
      current_stock: sp.stock,
      alert_threshold: sp.low_stock_threshold,
      low_stock_threshold: sp.low_stock_threshold,
      bonus_rules: [{ min_qty: 10, max_qty: null, percentage: 5 }],
      is_active: true,
      created_at: now,
      updated_at: now,
    });
  }

  const sampleClients = [
    {
      code: "CLI-001",
      order_num: 1,
      name: "ABC",
      type: "Grossiste",
      phone: "+243 970 123 456",
      secondary_phone: "+243 821 000 111",
      email: "client.abc@commerce.cd",
      address: "Goma, Nord-Kivu",
      city: "Goma, RDC",
      business_unit: "Boissons",
      department: "Boissons",
      product_name: "Eau AQua 500ml",
      marketer_name: "Patrick K.",
      photo_url: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=300&auto=format&fit=crop&q=80",
      document_url: "/assets/dossier_client_00039_goma.pdf",
      document_name: "Contrat_Distribution_ABC.pdf",
      document_type: "Contrat Commercial",
      document_size: "49.5 Ko",
      document_uploaded_at: "2026-01-20T10:00:00Z",
      document_verified: true,
      credit_limit: 5000,
      current_credit: 2500,
      balance: -2500,
      initial_balance: 2500,
    },
    {
      code: "CLI-004",
      order_num: 4,
      name: "Chez Mama SARL",
      type: "Demi-grossiste",
      phone: "+243 975 333 444",
      secondary_phone: "+243 812 333 444",
      email: "chezmama@commerce.cd",
      address: "Goma, Himbi",
      city: "Goma, RDC",
      business_unit: "Boissons",
      department: "Boissons",
      product_name: "Jus Pulpy 1L",
      marketer_name: "Patrick K.",
      photo_url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=300&auto=format&fit=crop&q=80",
      document_url: "/assets/dossier_client_00039_goma.pdf",
      document_name: "Dossier_Chez_Mama.pdf",
      document_type: "Accord de Crédit",
      document_size: "49.5 Ko",
      document_uploaded_at: "2026-02-15T11:00:00Z",
      document_verified: true,
      credit_limit: 6500,
      current_credit: 5100,
      balance: -5100,
      initial_balance: 5100,
    },
    {
      code: "CLI-009",
      order_num: 9,
      name: "Commerce Virunga",
      type: "Grossiste",
      phone: "+243 976 888 111",
      secondary_phone: "+243 897 888 111",
      email: "virunga@commerce.cd",
      address: "Goma, Ndosho",
      city: "Goma, RDC",
      business_unit: "Boissons",
      department: "Boissons",
      product_name: "Skol Lager 65cl",
      marketer_name: "Patrick K.",
      photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80",
      document_url: "/assets/dossier_client_00039_goma.pdf",
      document_name: "Contrat_Commerce_Virunga.pdf",
      document_type: "Contrat Commercial",
      document_size: "49.5 Ko",
      document_uploaded_at: "2026-02-18T14:30:00Z",
      document_verified: true,
      credit_limit: 5500,
      current_credit: 2050,
      balance: -2050,
      initial_balance: 2050,
    },
    {
      code: "CLI-002",
      order_num: 2,
      name: "Kivu Distribution",
      type: "Grossiste",
      phone: "+243 972 456 789",
      secondary_phone: "+243 810 456 789",
      email: "kivudistrib@commerce.cd",
      address: "Goma, Karisimbi",
      city: "Goma, RDC",
      business_unit: "Lait & produits laitiers",
      department: "Lait & produits laitiers",
      product_name: "Lait Entier Pasteurisé",
      marketer_name: "Sarah M.",
      photo_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=300&auto=format&fit=crop&q=80",
      document_url: "/assets/dossier_client_00039_goma.pdf",
      document_name: "Dossier_Kivu_Distribution.pdf",
      document_type: "Accord de Crédit",
      document_size: "49.5 Ko",
      document_uploaded_at: "2026-01-10T09:15:00Z",
      document_verified: true,
      credit_limit: 8000,
      current_credit: 3250,
      balance: -3250,
      initial_balance: 3250,
    },
    {
      code: "CLI-011",
      order_num: 11,
      name: "Maison Kivu",
      type: "Demi-grossiste",
      phone: "+243 970 111 011",
      secondary_phone: "+243 819 111 011",
      email: "maisonkivu@commerce.cd",
      address: "Goma, Mugunga",
      city: "Goma, RDC",
      business_unit: "Lait & produits laitiers",
      department: "Lait & produits laitiers",
      product_name: "Yaourt Brassé Nature",
      marketer_name: "Sarah M.",
      photo_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80",
      document_url: "/assets/dossier_client_00039_goma.pdf",
      document_name: "Fiche_Maison_Kivu.pdf",
      document_type: "Accord de Crédit",
      document_size: "49.5 Ko",
      document_uploaded_at: "2026-02-05T10:00:00Z",
      document_verified: true,
      credit_limit: 6000,
      current_credit: 1450,
      balance: -1450,
      initial_balance: 1450,
    },
    {
      code: "CLI-003",
      order_num: 3,
      name: "Marché Central Goma",
      type: "Grossiste",
      phone: "+243 993 111 222",
      secondary_phone: "+243 822 111 222",
      email: "marchecentral@commerce.cd",
      address: "Goma, Centre-ville",
      city: "Goma, RDC",
      business_unit: "Produits alimentaires",
      department: "Produits alimentaires",
      product_name: "Farine de Maïs Extra 25kg",
      marketer_name: "David B.",
      photo_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80",
      document_url: "/assets/dossier_client_00039_goma.pdf",
      document_name: "Contrat_Marche_Central.pdf",
      document_type: "Contrat Commercial",
      document_size: "49.5 Ko",
      document_uploaded_at: "2026-01-18T16:00:00Z",
      document_verified: true,
      credit_limit: 4000,
      current_credit: 0,
      balance: 0,
      initial_balance: 0,
    },
    {
      code: "CLI-008",
      order_num: 8,
      name: "Établissement Bahati",
      type: "Grossiste",
      phone: "+243 978 444 555",
      secondary_phone: "+243 813 444 555",
      email: "bahati@commerce.cd",
      address: "Goma, Majengo",
      city: "Goma, RDC",
      business_unit: "Produits alimentaires",
      department: "Produits alimentaires",
      product_name: "Huile Végétale Simba 5L",
      marketer_name: "Aline N.",
      photo_url: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&auto=format&fit=crop&q=80",
      document_url: "/assets/dossier_client_00039_goma.pdf",
      document_name: "Dossier_Bahati.pdf",
      document_type: "Accord de Crédit",
      document_size: "49.5 Ko",
      document_uploaded_at: "2026-02-12T13:40:00Z",
      document_verified: true,
      credit_limit: 7500,
      current_credit: 0,
      balance: 0,
      initial_balance: 0,
    },
    {
      code: "CLI-005",
      order_num: 5,
      name: "Kivu Hôtel",
      type: "Hôtellerie",
      phone: "+243 981 555 666",
      secondary_phone: "+243 815 555 666",
      email: "kivuhotel@commerce.cd",
      address: "Goma, Les Volcans",
      city: "Goma, RDC",
      business_unit: "Hôtellerie",
      department: "Hôtellerie",
      product_name: "Eau AQua 500ml",
      marketer_name: "Aline N.",
      photo_url: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=300&auto=format&fit=crop&q=80",
      document_url: "/assets/dossier_client_00039_goma.pdf",
      document_name: "Contrat_Kivu_Hotel.pdf",
      document_type: "Contrat Hôtellerie",
      document_size: "49.5 Ko",
      document_uploaded_at: "2026-01-25T08:30:00Z",
      document_verified: true,
      credit_limit: 10000,
      current_credit: 0,
      balance: 4750,
      initial_balance: -4750,
    },
    {
      code: "CLI-012",
      order_num: 12,
      name: "Hôtel Volcan",
      type: "Hôtellerie",
      phone: "+243 970 222 012",
      secondary_phone: "+243 814 222 012",
      email: "hotelvolcan@commerce.cd",
      address: "Goma, Himbi",
      city: "Goma, RDC",
      business_unit: "Hôtellerie",
      department: "Hôtellerie",
      product_name: "Jus Pulpy 1L",
      marketer_name: "Aline N.",
      photo_url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=300&auto=format&fit=crop&q=80",
      document_url: "/assets/dossier_client_00039_goma.pdf",
      document_name: "Contrat_Hotel_Volcan.pdf",
      document_type: "Contrat Hôtellerie",
      document_size: "49.5 Ko",
      document_uploaded_at: "2026-02-22T15:20:00Z",
      document_verified: true,
      credit_limit: 9000,
      current_credit: 0,
      balance: 0,
      initial_balance: 0,
    },
    {
      code: "CLI-006",
      order_num: 6,
      name: "Supermarché Horizon",
      type: "Supermarché",
      phone: "+243 990 777 888",
      secondary_phone: "+243 825 777 888",
      email: "horizon@commerce.cd",
      address: "Goma, Katindo",
      city: "Goma, RDC",
      business_unit: "Grande distribution",
      department: "Grande distribution",
      product_name: "Jus Pulpy 1L",
      marketer_name: "Sarah M.",
      photo_url: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=300&auto=format&fit=crop&q=80",
      document_url: "/assets/dossier_client_00039_goma.pdf",
      document_name: "Accord_Supermarche_Horizon.pdf",
      document_type: "Accord de Crédit",
      document_size: "49.5 Ko",
      document_uploaded_at: "2026-01-30T17:00:00Z",
      document_verified: true,
      credit_limit: 12000,
      current_credit: 7300,
      balance: -7300,
      initial_balance: 7300,
    },
    {
      code: "CLI-007",
      order_num: 7,
      name: "Restaurant La Source",
      type: "Restaurant",
      phone: "+243 974 222 999",
      secondary_phone: "+243 816 222 999",
      email: "lasource@commerce.cd",
      address: "Goma, Mabanga",
      city: "Goma, RDC",
      business_unit: "Restauration",
      department: "Restauration",
      product_name: "Eau AQua 500ml",
      marketer_name: "David B.",
      photo_url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=300&auto=format&fit=crop&q=80",
      document_url: "/assets/dossier_client_00039_goma.pdf",
      document_name: "Fiche_La_Source.pdf",
      document_type: "Accord de Crédit",
      document_size: "49.5 Ko",
      document_uploaded_at: "2026-02-08T12:00:00Z",
      document_verified: true,
      credit_limit: 3500,
      current_credit: 0,
      balance: 1200,
      initial_balance: -1200,
    },
    {
      code: "CLI-010",
      order_num: 10,
      name: "Client Exemple 10",
      type: "Professionnel",
      phone: "+243 970 000 010",
      secondary_phone: "+243 818 000 010",
      email: "exemple10@commerce.cd",
      address: "Goma, RDC",
      city: "Goma, RDC",
      business_unit: "Autres",
      department: "Autres",
      product_name: "Vin 4 Cousins Rouge",
      marketer_name: "Sarah M.",
      photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80",
      document_url: "/assets/dossier_client_00039_goma.pdf",
      document_name: "Dossier_Client_Exemple_10.pdf",
      document_type: "Fiche KYC",
      document_size: "49.5 Ko",
      document_uploaded_at: "2026-02-25T14:00:00Z",
      document_verified: true,
      credit_limit: 2500,
      current_credit: 0,
      balance: 850,
      initial_balance: -850,
    },
    {
      code: "00039_GOMA",
      order_num: 13,
      name: "NZAYIWENGA SEBUGENDO Augustin",
      type: "Grossiste",
      phone: "0858524912",
      secondary_phone: "0847568400",
      email: "augustin.sebugendo@gmail.com",
      address: "Ndosho Entrée Cheval",
      city: "Goma, RDC",
      business_unit: "Boissons",
      department: "Boissons",
      product_name: "Eau AQua 500ml",
      marketer_name: "Patrick K.",
      photo_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80",
      document_url: "/assets/dossier_client_00039_goma.pdf",
      document_name: "Fiche_Connaissance_Client_00039_GOMA.pdf",
      document_type: "Formulaire Connaissance Client (KYC & Crédit)",
      document_size: "49.5 Ko",
      document_uploaded_at: "2026-09-10T09:30:00Z",
      document_verified: true,
      credit_limit: 6850,
      current_credit: 2150,
      balance: -2150,
      initial_balance: 2150,
    },
  ];

  for (let idx = 0; idx < sampleClients.length; idx++) {
    const sc = sampleClients[idx];
    const matchedProd = db.products.find((p) => p.name === sc.product_name);
    db.clients.push({
      id: uuidv4(),
      code: sc.code,
      name: sc.name,
      type: sc.type,
      phone: sc.phone,
      secondary_phone: sc.secondary_phone,
      email: sc.email,
      address: sc.address,
      city: sc.city,
      photo_url: sc.photo_url,
      product_id: matchedProd?.id,
      product_name: sc.product_name,
      business_unit: sc.business_unit || sc.product_name,
      department: sc.department || sc.business_unit || sc.product_name,
      marketer_name: sc.marketer_name || "Patrick K.",
      order_num: sc.order_num || idx + 1,
      document_url: sc.document_url,
      document_name: sc.document_name,
      document_type: sc.document_type,
      document_size: (sc as any).document_size,
      document_uploaded_at: sc.document_uploaded_at,
      document_verified: sc.document_verified,
      credit_limit: sc.credit_limit,
      current_credit: sc.current_credit,
      balance: sc.balance,
      initial_balance: (sc as any).initial_balance || 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    });
  }

  const cashSession: CashSession = {
    id: uuidv4(),
    opened_by: adminUser.id,
    opened_by_name: adminUser.full_name,
    opened_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    initial_balance: 600.0,
    initial_balance_usd: 500.0,
    initial_balance_cdf: 250000,
    exchange_rate: 2500,
    department: "Maize Mill",
    status: "open",
  };
  db.cash_sessions.push(cashSession);

  const pastClosedSession: CashSession = {
    id: "sess-closed-2026-001",
    opened_by: adminUser.id,
    opened_by_name: adminUser.full_name,
    opened_at: new Date(Date.now() - 86400000 * 1 - 3600000 * 8).toISOString(),
    closed_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    closed_by: adminUser.full_name,
    department: "Maize Mill",
    initial_balance: 500.0,
    initial_balance_usd: 500.0,
    initial_balance_cdf: 200000,
    theoretical_balance_usd: 1250.0,
    theoretical_balance_cdf: 450000,
    actual_balance_usd: 1250.0,
    actual_balance_cdf: 450000,
    difference_usd: 0,
    difference_cdf: 0,
    exchange_rate: 2500,
    closing_billetage: {
      usd: { "100": 12, "50": 1 },
      cdf: { "20000": 20, "10000": 5 },
      total_usd: 1250,
      total_cdf: 450000,
      exchange_rate: 2500,
    },
    status: "closed",
    notes: "Clôture normale journalière, caisse équilibrée sans écart.",
  };
  db.cash_sessions.push(pastClosedSession);

  db.cash_operations.push({
    id: uuidv4(),
    session_id: cashSession.id,
    type: "in",
    category: "Ventes comptant",
    amount: 810.0,
    currency: "USD",
    amount_usd: 810.0,
    amount_cdf: 2025000,
    exchange_rate: 2500,
    reason: "Encaissement commande CMD-2026-0001",
    reference: "CMD-2026-0001",
    client_id: db.clients[0]?.id,
    client_name: db.clients[0]?.name,
    payment_method: "cash",
    document_name: "Bordereau_Encaissement_CMD-2026-0001.pdf",
    document_url: "/assets/dossier_client_00039_goma.pdf",
    document_type: "application/pdf",
    document_size: "49.5 Ko",
    billetage: {
      usd: { "100": 8, "10": 1 },
      cdf: {},
      total_usd: 810,
      total_cdf: 0,
      exchange_rate: 2500,
    },
    created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    created_by: adminUser.full_name,
  });

  db.cash_operations.push({
    id: uuidv4(),
    session_id: cashSession.id,
    type: "out",
    category: "Carburant & Transport",
    amount: 45.0,
    currency: "USD",
    amount_usd: 45.0,
    amount_cdf: 112500,
    exchange_rate: 2500,
    reason: "Plein véhicule livraison Camionnette 01",
    beneficiary: "Station Total Goma (Chauffeur Jean Mukendi)",
    authorized_by: "Direction Générale (Visa #DG-041)",
    authorization_proof: "Bon de dépense #BD-2026-088",
    reference: "DEC-2026-001",
    payment_method: "cash",
    document_name: "Recu_Carburant_Total.pdf",
    document_url: "/assets/dossier_client_00039_goma.pdf",
    document_type: "application/pdf",
    document_size: "142 Ko",
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    created_by: adminUser.full_name,
  });

  const client1 = db.clients[0];
  const prod1 = db.products[0];
  const prod2 = db.products[1];

  const order1: Order = {
    id: uuidv4(),
    code: "CMD-2026-0001",
    client_id: client1.id,
    client_name: client1.name,
    client_phone: client1.phone,
    marketer_id: adminUser.id,
    marketer_name: adminUser.full_name,
    items: [
      { product_id: prod1.id, product_code: prod1.code, product_name: prod1.name, unit: prod1.unit, quantity: 20, unit_price: prod1.sell_price, discount: 0, line_total: 540.0 },
      { product_id: prod2.id, product_code: prod2.code, product_name: prod2.name, unit: prod2.unit, quantity: 10, unit_price: prod2.sell_price, discount: 0, line_total: 345.0 },
    ],
    subtotal: 885.0,
    discount: 0,
    total: 885.0,
    amount_paid: 885.0,
    outstanding: 0,
    payment_method: "cash",
    payment_status: "paid",
    status: "delivered",
    delivery_address: client1.address,
    notes: "Livré et encaissé en totalité",
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    updated_at: now,
  };
  db.orders.push(order1);

  const client2 = db.clients[1];
  const order2: Order = {
    id: uuidv4(),
    code: "CMD-2026-0002",
    client_id: client2.id,
    client_name: client2.name,
    client_phone: client2.phone,
    marketer_id: adminUser.id,
    marketer_name: adminUser.full_name,
    items: [
      { product_id: db.products[2].id, product_code: db.products[2].code, product_name: db.products[2].name, unit: db.products[2].unit, quantity: 15, unit_price: db.products[2].sell_price, discount: 0, line_total: 780.0 },
      { product_id: db.products[3].id, product_code: db.products[3].code, product_name: db.products[3].name, unit: db.products[3].unit, quantity: 25, unit_price: db.products[3].sell_price, discount: 0, line_total: 550.0 },
    ],
    subtotal: 1330.0,
    discount: 0,
    total: 1330.0,
    amount_paid: 500.0,
    outstanding: 830.0,
    payment_method: "credit",
    payment_status: "partial",
    status: "shipped",
    delivery_address: client2.address,
    notes: "Acompte de 500 USD versé, solde à 15 jours",
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    updated_at: now,
  };
  db.orders.push(order2);

  const boutiqueSeedOrders = [
    { code: "CMD-00160", client_name: "ABC", created_iso: new Date(Date.now() - 1800000).toISOString(), articles_count: 50, total_fc: 2500000, status: "pending_approval" as const, payment_status: "unpaid" as const, cash_deposit_status: "not_applicable" as const, payment_method: "credit", marketer: "Patrick K." },
    { code: "CMD-00159", client_name: "Dieudonné L.", created_iso: new Date(Date.now() - 3600000 * 1).toISOString(), articles_count: 6, total_fc: 45000, status: "validated" as const, payment_status: "unpaid" as const, cash_deposit_status: "pending_deposit" as const, payment_method: "cash", marketer: "Patrick K." },
    { code: "CMD-00158", client_name: "Supermarché Le Phare", created_iso: new Date(Date.now() - 3600000 * 3).toISOString(), articles_count: 5, total_fc: 32500, status: "delivered" as const, payment_status: "unpaid" as const, cash_deposit_status: "pending_deposit" as const, payment_method: "cash", marketer: "Sarah M." },
    { code: "CMD-00157", client_name: "Aline M.", created_iso: new Date(Date.now() - 3600000 * 5).toISOString(), articles_count: 3, total_fc: 17000, status: "pending_approval" as const, payment_status: "unpaid" as const, cash_deposit_status: "pending_deposit" as const, payment_method: "cash", marketer: "David B." },
    { code: "CMD-00156", client_name: "Jean Pierre Grossiste", created_iso: new Date(Date.now() - 3600000 * 24).toISOString(), articles_count: 8, total_fc: 54000, status: "delivered" as const, payment_status: "paid" as const, cash_deposit_status: "deposited" as const, payment_method: "cash", marketer: "Patrick K." },
    { code: "CMD-00155", client_name: "Marceline T.", created_iso: new Date(Date.now() - 3600000 * 28).toISOString(), articles_count: 2, total_fc: 6000, status: "cancelled" as const, rejection_reason: "Rupture de stock temporaire sur l'article commandé", payment_status: "unpaid" as const, cash_deposit_status: "not_applicable" as const, payment_method: "cash", marketer: "Aline N." },
    { code: "CMD-00154", client_name: "Grace B.", created_iso: new Date(Date.now() - 3600000 * 48).toISOString(), articles_count: 4, total_fc: 22500, status: "delivered" as const, payment_status: "paid" as const, cash_deposit_status: "deposited" as const, payment_method: "cash", marketer: "Sarah M." },
    { code: "CMD-00161", client_name: "Alimentation La Source", created_iso: new Date(Date.now() - 3600000 * 2).toISOString(), articles_count: 12, total_fc: 85000, status: "delivered" as const, payment_status: "unpaid" as const, cash_deposit_status: "pending_deposit" as const, payment_method: "cash", marketer: "Nathalie Mukendi" },
    { code: "CMD-00162", client_name: "Hôtel Volcan Goma", created_iso: new Date(Date.now() - 3600000 * 4).toISOString(), articles_count: 20, total_fc: 150000, status: "delivered" as const, payment_status: "unpaid" as const, cash_deposit_status: "pending_deposit" as const, payment_method: "cash", marketer: "Sarah M." },
    { code: "CMD-00163", client_name: "Kivu Distribution SARL", created_iso: new Date(Date.now() - 3600000 * 6).toISOString(), articles_count: 15, total_fc: 110000, status: "delivered" as const, payment_status: "unpaid" as const, cash_deposit_status: "pending_deposit" as const, payment_method: "cash", marketer: "Jean Kasongo" },
  ];

  for (const bo of boutiqueSeedOrders) {
    const cl = db.clients.find((c) => c.name === bo.client_name) || db.clients[0];
    const unitPriceFC = Math.round(bo.total_fc / bo.articles_count);
    const totalUSD = Math.round((bo.total_fc / 2500) * 100) / 100;
    const isDeposited = bo.cash_deposit_status === "deposited";

    db.orders.push({
      id: uuidv4(),
      code: bo.code,
      client_id: cl.id,
      client_name: cl.name,
      client_phone: cl.phone,
      marketer_id: `mkt_${(bo.marketer || "marketer").toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
      marketer_name: bo.marketer || marketerUser.full_name,
      business_unit_id: "bu_goma",
      site_id: "site_goma_principal",
      source: "boutique",
      currency: "CDF",
      items: [
        {
          product_id: db.products[0].id,
          product_code: db.products[0].code,
          product_name: db.products[0].name,
          unit: db.products[0].unit,
          quantity: bo.articles_count,
          unit_price: Math.round((unitPriceFC / 2500) * 100) / 100,
          unit_price_fc: unitPriceFC,
          discount: 0,
          line_total: totalUSD,
          line_total_fc: bo.total_fc,
        },
      ],
      subtotal: totalUSD,
      subtotal_fc: bo.total_fc,
      discount: 0,
      total: totalUSD,
      total_fc: bo.total_fc,
      amount_paid: isDeposited ? totalUSD : 0,
      amount_paid_fc: isDeposited ? bo.total_fc : 0,
      outstanding: isDeposited ? 0 : totalUSD,
      outstanding_fc: isDeposited ? 0 : bo.total_fc,
      payment_method: bo.payment_method || "cash",
      payment_status: bo.payment_status,
      cash_deposit_status: bo.cash_deposit_status,
      cash_deposited_at: isDeposited ? bo.created_iso : undefined,
      cash_deposited_by: isDeposited ? "Caissière Principale" : undefined,
      status: bo.status,
      rejection_reason: (bo as any).rejection_reason,
      notes: "Commande terrain Boutique",
      created_at: bo.created_iso,
      updated_at: bo.created_iso,
    });
  }

  db.deliveries.push({
    id: uuidv4(),
    code: "LIV-2026-0001",
    order_id: order2.id,
    order_code: order2.code,
    client_name: order2.client_name,
    client_phone: order2.client_phone,
    address: order2.delivery_address,
    items: order2.items,
    status: "shipped",
    vehicle_plate: "1234-AB/01",
    driver_name: "Jean-Paul Makambo",
    notes: "En cours d'acheminement vers le client",
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: now,
  });

  const clientA = db.clients[1];
  const clientB = db.clients[2];
  const clientShala = db.clients[0];

  db.credits.push(
    {
      id: "crd-nathalie-1",
      order_id: "ord-crd-01",
      order_code: "CMD-2026-0001",
      client_id: clientA.id,
      client_name: "Client A (Supermarché Le Phare)",
      client_code: "CLI-002",
      client_phone: "+243 992 003 002",
      marketer_id: marketerUser2.id,
      marketer_name: "Nathalie Mukendi",
      initial_amount: 1000.0,
      paid: 0,
      remaining: 1000.0,
      currency: "USD",
      status: "pending",
      due_date: new Date(Date.now() + 86400000 * 7).toISOString(),
      created_at: new Date(Date.now() - 86400000 * 25).toISOString(),
      payments: [],
    },
    {
      id: "crd-nathalie-2",
      order_id: "ord-crd-02",
      order_code: "CMD-2026-0002",
      client_id: clientB.id,
      client_name: "Client B (Jean Pierre Grossiste)",
      client_code: "CLI-003",
      client_phone: "+243 813 004 003",
      marketer_id: marketerUser2.id,
      marketer_name: "Nathalie Mukendi",
      initial_amount: 2000.0,
      paid: 0,
      remaining: 2000.0,
      currency: "USD",
      status: "pending",
      due_date: new Date(Date.now() + 86400000 * 10).toISOString(),
      created_at: new Date(Date.now() - 86400000 * 18).toISOString(),
      payments: [],
    },
    {
      id: "crd-nathalie-3",
      order_id: "ord-crd-03",
      order_code: "CMD-2026-0003",
      client_id: "cli_c_nathalie",
      client_name: "Client C (Marceline T.)",
      client_code: "CLI-004",
      client_phone: "+243 824 005 004",
      marketer_id: marketerUser2.id,
      marketer_name: "Nathalie Mukendi",
      initial_amount: 500.0,
      paid: 0,
      remaining: 500.0,
      currency: "USD",
      status: "pending",
      due_date: new Date(Date.now() + 86400000 * 12).toISOString(),
      created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
      payments: [],
    },
    {
      id: "crd-patrick-1",
      order_id: "ord-crd-05",
      order_code: "CMD-2026-0010",
      client_id: clientShala.id,
      client_name: clientShala.name,
      client_code: clientShala.code,
      client_phone: clientShala.phone,
      marketer_id: adminUser.id,
      marketer_name: "Patrick K.",
      initial_amount: 830.0,
      paid: 82.0,
      remaining: 748.0,
      currency: "USD",
      status: "partial",
      due_date: new Date(Date.now() + 86400000 * 14).toISOString(),
      created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
      payments: [
        {
          id: uuidv4(),
          amount: 82.0,
          currency: "USD",
          method: "cash",
          date: new Date(Date.now() - 86400000 * 2).toISOString(),
          cashier_name: "Caisse Principale",
          notes: "Acompte partiel",
        },
      ],
    }
  );

  db.notifications.push({
    id: uuidv4(),
    title: "Alerte Stock Bas",
    message: "Le produit Vin 4 Cousins Rouge a atteint le seuil critique (12 bouteilles restantes).",
    type: "warning",
    read: false,
    at: new Date(Date.now() - 1800000).toISOString(),
  });

  db.notifications.push({
    id: uuidv4(),
    title: "Nouvelle Commande Expédiée",
    message: "La commande CMD-2026-0002 pour Aline M. est en cours de livraison.",
    type: "info",
    read: false,
    at: new Date(Date.now() - 3600000).toISOString(),
  });

  db.objectives.push(
    {
      id: "obj-mais-goma-01",
      business_unit: "Farine de Maïs Extra",
      site: "Goma",
      label: "Objectif Mensuel Maïs - 4 000 sacs",
      user_id: adminUser.id,
      user_name: adminUser.full_name,
      target_amount: 80000.0,
      target_qty: 4000,
      actual_amount: 80000.0,
      actual_qty: 4000,
      unit: "sacs",
      bonus_type: "money",
      bonus_amount: 50.0,
      bonus_qty: 0,
      bonus_unit: "USD",
      beneficiaries: [
        {
          user_id: marketerUser2.id,
          user_name: "Nathalie Mukendi",
          role_code: "marketer",
          bonus_type: "money",
          bonus_amount: 50.0,
          bonus_qty: 0,
          bonus_unit: "USD",
          status: "pending",
        },
        {
          user_id: marketerUser.id,
          user_name: "Patrick K.",
          role_code: "marketer",
          bonus_type: "money",
          bonus_amount: 50.0,
          bonus_qty: 0,
          bonus_unit: "USD",
          status: "pending",
        },
      ],
      period_start: new Date(Date.now() - 86400000 * 20).toISOString(),
      period_end: new Date(Date.now() + 86400000 * 10).toISOString(),
      status: "reached",
      created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    },
    {
      id: "obj-whisky-goma-02",
      business_unit: "Whisky & Liqueurs",
      site: "Goma",
      label: "Objectif Trimestriel Whisky Premium",
      user_id: adminUser.id,
      user_name: adminUser.full_name,
      target_amount: 15000.0,
      target_qty: 500,
      actual_amount: 9600.0,
      actual_qty: 320,
      unit: "cartons",
      bonus_type: "nature",
      bonus_amount: 0,
      bonus_qty: 2,
      bonus_unit: "cartons",
      beneficiaries: [
        {
          user_id: marketerUser2.id,
          user_name: "Sarah Kalala",
          role_code: "marketer",
          bonus_type: "nature",
          bonus_amount: 0,
          bonus_qty: 2,
          bonus_unit: "cartons",
          status: "pending",
        },
      ],
      period_start: new Date(Date.now() - 86400000 * 15).toISOString(),
      period_end: new Date(Date.now() + 86400000 * 45).toISOString(),
      status: "active",
      created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
    }
  );

  db.accounting_movements = [
    {
      id: "acc-stock-1",
      module: "stock",
      index: 1,
      date: "31/05/2025 14:32",
      type: "out",
      type_label: "Sortie",
      reference: "SRT-250531-0012",
      title: "Sortie de stock",
      product_name: "Soda 50cl",
      details: "Quantité: 24\nStock après: 76",
      source: "Vente #VEN-0053\nBoutique",
      source_doc: "VEN-0053",
      warehouse: "Dépôt principal",
      stock_before: 100,
      stock_after: 76,
      quantity: 24,
      user_name: "John Kasereka",
      amount: -24.0,
      currency: "USD",
      amount_fc: 60000,
      status: "unrecorded",
      is_recorded: false,
      items: [{ name: "Soda 50cl", quantity: 24, unit_price: 1.0, amount: 24.0 }],
      additional_info: { client: "SHALA", sale_type: "Vente directe", payment_method: "Espèces", notes: "-" },
    },
    {
      id: "acc-stock-2",
      module: "stock",
      index: 2,
      date: "31/05/2025 14:15",
      type: "in",
      type_label: "Entrée",
      reference: "ENT-250531-0008",
      title: "Entrée de stock",
      product_name: "Eau 1.5L",
      details: "Quantité: 48\nStock après: 120",
      source: "Achat #ACH-0021\nFournisseur",
      source_doc: "ACH-0021",
      warehouse: "Dépôt principal",
      stock_before: 72,
      stock_after: 120,
      quantity: 48,
      user_name: "Sarah Kalala",
      amount: 48.0,
      currency: "USD",
      amount_fc: 120000,
      status: "unrecorded",
      is_recorded: false,
      items: [{ name: "Eau 1.5L", quantity: 48, unit_price: 1.0, amount: 48.0 }],
      additional_info: { client: "BRALIMA", sale_type: "Réception marchandise", payment_method: "Virement", notes: "Facture F-2025-412" },
    },
    {
      id: "acc-stock-3",
      module: "stock",
      index: 3,
      date: "31/05/2025 13:40",
      type: "out",
      type_label: "Sortie",
      reference: "SRT-250531-0011",
      title: "Sortie de stock",
      product_name: "Jus Ananas 1L",
      details: "Quantité: 12\nStock après: 35",
      source: "Vente #VEN-0052\nBoutique",
      source_doc: "VEN-0052",
      warehouse: "Dépôt principal",
      stock_before: 47,
      stock_after: 35,
      quantity: 12,
      user_name: "Patrick K.",
      amount: -36.0,
      currency: "USD",
      amount_fc: 90000,
      status: "recorded",
      is_recorded: true,
      items: [{ name: "Jus Ananas 1L", quantity: 12, unit_price: 3.0, amount: 36.0 }],
      additional_info: { client: "Hôtel Serena", sale_type: "Vente directe", payment_method: "Airtel Money", notes: "-" },
    },
    {
      id: "acc-stock-4",
      module: "stock",
      index: 4,
      date: "31/05/2025 13:05",
      type: "transfer",
      type_label: "Transfert",
      reference: "TRF-250531-0003",
      title: "Transfert de stock",
      product_name: "Bière Primus",
      details: "Quantité: 30\nVers: Bar",
      source: "Transfert interne\nDépôt -> Bar",
      source_doc: "TRF-0003",
      warehouse: "Dépôt principal",
      stock_before: 120,
      stock_after: 90,
      quantity: 30,
      user_name: "John Kasereka",
      amount: -30.0,
      currency: "USD",
      amount_fc: 75000,
      status: "unrecorded",
      is_recorded: false,
      items: [{ name: "Bière Primus", quantity: 30, unit_price: 1.0, amount: 30.0 }],
      additional_info: { client: "Bar Restaurant", sale_type: "Transfert interne", payment_method: "Interne", notes: "Approvisionnement bar" },
    },
    {
      id: "acc-stock-5",
      module: "stock",
      index: 5,
      date: "31/05/2025 12:22",
      type: "adjustment",
      type_label: "Ajustement",
      reference: "AJT-250531-0002",
      title: "Ajustement de stock",
      product_name: "Fanta 50cl",
      details: "Quantité: +6\nRaison: Inventaire",
      source: "Inventaire\nAjustement",
      source_doc: "INV-2025-05",
      warehouse: "Dépôt principal",
      stock_before: 44,
      stock_after: 50,
      quantity: 6,
      user_name: "Admin Comptable",
      amount: 6.0,
      currency: "USD",
      amount_fc: 15000,
      status: "recorded",
      is_recorded: true,
      items: [{ name: "Fanta 50cl", quantity: 6, unit_price: 1.0, amount: 6.0 }],
      additional_info: { client: "Inventaire", sale_type: "Régularisation", payment_method: "Aucun", notes: "Surplus d'inventaire" },
    }
  ];

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
