import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Package,
  Wallet,
  Store,
  ShoppingCart,
  Users,
  Calculator,
  BarChart3,
  Truck,
  Target,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Settings,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/erp-ui";

export default function MorePage() {
  const { user, role, has, logout } = useAuth();
  const navigate = useNavigate();

  const links = [
    { to: "/boutique", label: "Boutique Revendeurs", icon: Store, perm: "boutique.read" },
    { to: "/orders", label: "Commandes", icon: ShoppingCart, perm: "orders.read" },
    { to: "/stock", label: "Stock & Dépôts", icon: Package, perm: "stock.read" },
    { to: "/cash", label: "Caisse", icon: Wallet, perm: "cash.read" },
    { to: "/credits", label: "Crédits & Créances", icon: Wallet, perm: "credits.read" },
    { to: "/clients", label: "CRM & Clients", icon: Users, perm: "crm.read" },
    { to: "/delivery", label: "Livraisons & Tournées", icon: Truck, perm: "delivery.read" },
    { to: "/accounting", label: "Comptabilité", icon: Calculator, perm: "accounting.read" },
    { to: "/reports", label: "Rapports & Statistiques", icon: BarChart3, perm: "reports.read" },
    { to: "/objectives", label: "Objectifs Commerciaux", icon: Target, perm: "objectives.read" },
    { to: "/admin/users", label: "Gestion Utilisateurs", icon: Users, perm: "users.read" },
    { to: "/admin/roles", label: "Rôles & Permissions", icon: ShieldCheck, perm: "roles.read" },
    { to: "/admin/audit", label: "Journal d'Audit", icon: ShieldCheck, perm: "audit.read" },
    { to: "/profile", label: "Mon Profil", icon: Settings, perm: null },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Menu Complet" subtitle="Accès rapide à tous les modules" />
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-xs">
        {links.map((item) => {
          if (item.perm && !has(item.perm)) return null;
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold text-slate-800">{item.label}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400" />
            </Link>
          );
        })}
        <button
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="w-full p-3.5 flex items-center justify-between hover:bg-red-50 text-red-600 transition-colors text-xs font-bold"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
              <LogOut className="h-4 w-4" />
            </div>
            <span>Se déconnecter</span>
          </div>
        </button>
      </div>
    </div>
  );
}
