import React, { useEffect, useState } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  BarChart3,
  Bell,
  ChevronRight,
  Home,
  LogOut,
  Package,
  ShoppingCart,
  Store,
  Users,
  Wallet,
  Wifi,
  WifiOff,
  Calculator,
  Truck,
  UserCheck,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  HandCoins,
  Target,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";
import { APP_INFO, IS_LOGISTICS, REPORTS_PERM, inThisApp } from "@/app/edition";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import BrandLogo from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOGO_ALT, LOGO_SRC } from "@/app/brand";

const BOTTOM_NAV = IS_LOGISTICS
  ? [
      { to: "/dashboard", label: "Accueil", icon: Home, perm: null },
      { to: "/stock", label: "Stock", icon: Package, perm: "stock.read" },
      { to: "/delivery", label: "Livraisons", icon: Truck, perm: "delivery.read" },
      { to: "/reports", label: "Rapports", icon: BarChart3, perm: REPORTS_PERM },
    ]
  : [
      { to: "/dashboard", label: "Accueil", icon: Home, perm: null },
      { to: "/boutique", label: "Boutique", icon: Store, perm: "boutique.read" },
      { to: "/clients", label: "Clients", icon: Users, perm: "crm.read" },
      { to: "/orders", label: "Ventes", icon: ShoppingCart, perm: "orders.read" },
      { to: "/cash", label: "Caisse", icon: Wallet, perm: "cash.read" },
    ];

// Chaque application n'affiche que ses propres modules (voir src/app/edition.ts)
const DESKTOP_NAV = [
  { to: "/dashboard", label: "Tableau de bord", icon: Home, perm: null },
  { to: "/boutique", label: "Boutique / Ventes", icon: Store, perm: "boutique.read" },
  { to: "/orders", label: "Commandes", icon: ShoppingCart, perm: "orders.read" },
  { to: "/clients", label: "Clients (CRM)", icon: Users, perm: "crm.read" },
  { to: "/cash", label: "Caisse", icon: Wallet, perm: "cash.read" },
  { to: "/credits", label: "Crédits & Créances", icon: HandCoins, perm: "credits.read" },
  { to: "/accounting", label: "Comptabilité", icon: Calculator, perm: "accounting.read" },
  { to: "/stock", label: "Stock & Dépôts", icon: Package, perm: "stock.read" },
  { to: "/delivery", label: "Livraisons", icon: Truck, perm: "delivery.read" },
  { to: "/reports", label: IS_LOGISTICS ? "Rapports Stock & Livraison" : "Rapports & KPIs", icon: BarChart3, perm: REPORTS_PERM },
  { to: "/objectives", label: "Objectifs commerciaux", icon: Target, perm: "objectives.read" },
  { to: "/admin/users", label: "Utilisateurs", icon: UserCheck, perm: "users.read" },
  { to: "/admin/roles", label: "Rôles & permissions", icon: ShieldCheck, perm: "roles.read" },
  { to: "/admin/audit", label: "Journal d'audit", icon: ClipboardList, perm: "audit.read" },
  { to: "/profile", label: "Mon Compte", icon: Settings, perm: null },
].filter((item) => inThisApp(item.to));

export default function Layout() {
  const { user, role, logout, has } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [online, setOnline] = useState(navigator.onLine);
  const [unread, setUnread] = useState(2);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .get("/notifications", { params: { unread_only: true, limit: 20 } })
        .then((r) => {
          if (alive && r.data) setUnread(r.data.length || 0);
        })
        .catch(() => {});
      // Les alertes de sécurité arrivent dans les notifications (plus de bandeau en haut de page)
    };
    load();
    const iv = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const initials = (user?.full_name || user?.email || "CD")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "CD";

  const isFullWidthPage = location.pathname.startsWith("/accounting");
  const bottomItems = [
    ...BOTTOM_NAV,
    ...(inThisApp("/accounting") ? [{ to: "/accounting", label: "Compta", icon: Calculator, perm: "accounting.read" }] : []),
  ].filter((item) => !item.perm || has(item.perm));

  return (
    <div className="min-h-screen bg-app text-slate-900 flex flex-col lg:flex-row dark:bg-transparent">
      {/* DESKTOP SIDEBAR */}
      <aside
        className={`hidden lg:flex flex-col flex-shrink-0 bg-sidebar text-sidebar-fg border-r border-sidebar-line transition-all duration-300 sticky top-0 h-screen z-40 ${
          sidebarCollapsed ? "w-20" : "w-[245px]"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 flex items-center gap-3 border-b border-sidebar-line select-none">
          {/* Logo PREMIDIS sur fond clair dans les deux thèmes (lisibilité) */}
          <div className="h-9 w-14 rounded-xl logo-tile border border-line flex items-center justify-center p-0.5 flex-shrink-0 shadow-xs">
            <img
              src={LOGO_SRC}
              alt={LOGO_ALT}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-black tracking-wider text-ink truncate">
                PREMIDIS SARL
              </span>
              <span className="text-[10px] text-sidebar-muted truncate" data-app-name>
                {APP_INFO.name}
              </span>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
          {DESKTOP_NAV.map((item) => {
            const allowed = item.perm ? has(item.perm) : true;
            if (!allowed) return null;
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={sidebarCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? "bg-brand text-white font-semibold shadow-[var(--shadow-glow)]"
                      : "nav-item text-sidebar-fg hover:bg-sidebar-hover hover:text-brand dark:hover:text-white"
                  } ${sidebarCollapsed ? "justify-center px-0" : ""}`
                }
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* User Card & Collapse */}
        <div className="p-3 border-t border-sidebar-line space-y-2">
          <div
            onClick={() => navigate("/profile")}
            className={`flex items-center gap-2.5 p-2 rounded-xl hover:bg-sidebar-hover cursor-pointer transition-colors ${
              sidebarCollapsed ? "justify-center" : ""
            }`}
          >
            <div className="h-8 w-8 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-ink truncate" data-no-translate={user?.full_name ? "" : undefined}>
                  {user?.full_name || "Utilisateur"}
                </span>
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                  <span>En ligne</span>
                </div>
              </div>
            )}
          </div>
          <div className={`flex items-center gap-2 ${sidebarCollapsed ? "flex-col" : ""}`}>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex-1 w-full flex items-center justify-center gap-2 py-1.5 text-[11px] text-sidebar-muted hover:text-brand hover:bg-sidebar-hover rounded-lg transition-colors"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span>Réduire le menu</span>
              </>
            )}
          </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* MOBILE TOP BAR (< lg) */}
        <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <BrandLogo size={36} />
          <div className="flex items-center gap-2">
            <OnlineBadge online={online} />
            {location.pathname !== "/dashboard" && <LanguageSwitcher />}
            <ThemeToggle />
            <button
              onClick={() => navigate("/notifications")}
              className="hdr-btn relative h-9 w-9 rounded-full flex items-center justify-center"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-9 w-9 rounded-full bg-brand text-white text-xs font-semibold flex items-center justify-center hover:bg-brand-strong transition-colors">
                  {initials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-900" data-no-translate>
                      {user?.full_name}
                    </span>
                    <span className="text-xs text-slate-500">{user?.email}</span>
                    <span className="mt-1 inline-flex w-fit text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand/10 text-brand font-semibold">
                      {role?.name || user?.role_code}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/profile")}>
                  Mon profil
                </DropdownMenuItem>
                {inThisApp("/accounting") && has("accounting.read") && (
                  <DropdownMenuItem onClick={() => navigate("/accounting")}>
                    Comptabilité
                  </DropdownMenuItem>
                )}
                {has("users.read") && inThisApp("/admin/users") && (
                  <DropdownMenuItem onClick={() => navigate("/admin/users")}>
                    Utilisateurs
                  </DropdownMenuItem>
                )}
                {(has("roles.read") || has("users.permissions")) && inThisApp("/admin/roles") && (
                  <DropdownMenuItem onClick={() => navigate("/admin/roles")}>
                    Rôles & permissions
                  </DropdownMenuItem>
                )}
                {has("audit.read") && inThisApp("/admin/audit") && (
                  <DropdownMenuItem onClick={() => navigate("/admin/audit")}>
                    Journal d'audit
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => navigate("/more")}>
                  Plus d'options <ChevronRight className="ml-auto h-4 w-4" />
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await logout();
                    navigate("/login");
                  }}
                  className="text-red-600 focus:text-red-700"
                >
                  <LogOut className="h-4 w-4 mr-2" /> Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>


        {/* MAIN BODY */}
        <main
          className={`flex-1 ${
            isFullWidthPage
              ? "p-3 sm:p-5 lg:p-6"
              : "px-4 pt-4 pb-28 lg:pb-8 max-w-[600px] lg:max-w-6xl w-full mx-auto"
          }`}
        >
          <Outlet />
        </main>

        {/* MOBILE BOTTOM NAV (< lg) */}
        {/* Modules non autorisés : absents (et non simplement grisés) */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 grid z-40 shadow-lg"
          style={{ gridTemplateColumns: `repeat(${bottomItems.length}, minmax(0, 1fr))` }}
        >
          {bottomItems.map((item) => (
            <BottomLink key={item.to} to={item.to} icon={item.icon} label={item.label} enabled />
          ))}
        </nav>
      </div>
    </div>
  );
}

function BottomLink({
  to,
  label,
  icon: Icon,
  enabled,
}: {
  to: string;
  label: string;
  icon: any;
  enabled: boolean;
}) {
  return (
    <NavLink
      to={enabled ? to : "#"}
      onClick={(e) => {
        if (!enabled) e.preventDefault();
      }}
      className={({ isActive }) => {
        const base =
          "flex flex-col items-center justify-center py-2.5 gap-0.5 text-[11px] transition-colors";
        if (!enabled) return `${base} text-slate-300 cursor-not-allowed`;
        return `${base} ${
          isActive
            ? "text-brand font-semibold"
            : "text-slate-500 hover:text-slate-900"
        }`;
      }}
    >
      <Icon className="h-5 w-5" strokeWidth={2} />
      <span>{label}</span>
    </NavLink>
  );
}

function OnlineBadge({ online }: { online: boolean }) {
  return (
    <span
      className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
        online
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-amber-50 text-amber-700 border border-amber-200"
      }`}
    >
      {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
      {online ? "En ligne" : "Hors ligne"}
    </span>
  );
}
