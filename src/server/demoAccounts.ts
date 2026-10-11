import bcrypt from "bcryptjs";
import { db, type User } from "./db";
import { ALL_CODES } from "./permissions";

/*
 * Comptes de démonstration de la page de connexion (Directeur, Admin, Chef de département, Chargé CRM,
 * Caisse, Marketeur, Client). Les comptes existants ne sont jamais modifiés : seuls les rôles et
 * utilisateurs manquants sont ajoutés, une seule fois (base neuve ou base enregistrée).
 */
const DEMO_PASSWORD = "Admin@2026";

const ROLES = [
  {
    code: "dg",
    name: "Directeur Général",
    department: "Direction Générale",
    description: "Pilotage de l'entreprise : accès complet à tous les modules",
    permissions: () => [...ALL_CODES],
  },
  {
    code: "charge_crm",
    name: "Chargé CRM",
    department: "Relation clients",
    description: "Gestion des clients, de leurs comptes et du suivi des créances",
    permissions: () => ["dashboard.read", "crm.read", "crm.filter", "crm.create", "crm.update", "crm.account", "crm.documents", "crm.export", "credits.read", "orders.read", "orders.filter"],
  },
  {
    code: "client",
    name: "Client",
    department: "Clients",
    description: "Espace client : catalogue, commandes et suivi de ses commandes",
    permissions: () => ["boutique.read", "boutique.search", "boutique.order", "boutique.orders_history"],
  },
];

const USERS: Array<Partial<User> & { email: string; full_name: string; role_code: string }> = [
  { email: "directeur@erp.local", full_name: "Directeur Général", role_code: "dg", department: "Direction Générale", is_transversal: true, phone: "+243 999 000 010" },
  { email: "crm@erp.local", full_name: "Chargé CRM", role_code: "charge_crm", department: "Relation clients", phone: "+243 999 000 011" },
  { email: "caisse@erp.local", full_name: "Caisse principale", role_code: "caissier", department: "Caisse", phone: "+243 999 000 012" },
  { email: "client@erp.local", full_name: "Client démo", role_code: "client", department: "Clients", phone: "+243 999 000 013" },
];

export function ensureDemoAccounts() {
  if ((db as any).demo_accounts_v1) return;
  const now = new Date().toISOString();
  for (const r of ROLES) {
    if (db.roles.some((x: any) => x.code === r.code)) continue;
    db.roles.push({ id: `role_${r.code}`, code: r.code, name: r.name, department: r.department, description: r.description, permissions: r.permissions(), is_system: false, created_at: now, updated_at: now } as any);
  }
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  for (const u of USERS) {
    if (db.users.some((x) => x.email.toLowerCase() === u.email)) continue;
    db.users.push({ id: `usr_demo_${u.role_code}`, is_active: true, all_categories: true, password_hash: hash, created_at: now, updated_at: now, ...u } as any);
  }
  (db as any).demo_accounts_v1 = true;
}
