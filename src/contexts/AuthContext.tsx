import React, { createContext, useContext, useEffect, useState } from "react";
import { api, tokenStore } from "@/lib/api";
import { setThemeUser } from "@/theme/theme";

interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  department?: string;
  photo_url?: string;
  role_code: string;
  is_transversal?: boolean;
}

interface Role {
  code: string;
  name: string;
  permissions: string[];
}

export interface DataScope {
  all_sites: boolean;
  site_ids: string[];
  all_categories: boolean;
  categories: string[];
}

interface AuthContextType {
  user: User | null;
  role: Role | null;
  permissions: string[];
  scope: DataScope | null;
  hasAny: (perms: string[]) => boolean;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  has: (perm: string | null) => boolean;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [scope, setScope] = useState<DataScope | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const reloadUser = async () => {
    if (!tokenStore.access) {
      setUser(null);
      setRole(null);
      setPermissions([]);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setRole(data.role);
      setPermissions(data.permissions || []);
      setScope(data.scope || null);
    } catch {
      tokenStore.clear();
      setUser(null);
      setRole(null);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadUser();
  }, []);

  // Préférence de thème propre à chaque utilisateur
  useEffect(() => {
    setThemeUser(user?.id || null);
  }, [user?.id]);

  // Droits toujours à jour : rechargés au retour sur l'onglet, chaque minute, et dès qu'une action est refusée
  // (une permission retirée par l'administrateur s'applique sans reconnexion)
  useEffect(() => {
    const refresh = () => {
      if (tokenStore.access) reloadUser();
    };
    const iv = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("erp:permission-denied", refresh);
    return () => {
      clearInterval(iv);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("erp:permission-denied", refresh);
    };
  }, []);

  const login = async (email: string, pass: string) => {
    const { data } = await api.post("/auth/login", { email, password: pass });
    tokenStore.set(data);
    await reloadUser();
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    tokenStore.clear();
    setUser(null);
    setRole(null);
    setPermissions([]);
    setScope(null);
  };

  const has = (perm: string | null): boolean => {
    if (!perm) return true;
    if (user?.role_code === "super_admin") return true;
    return permissions.includes(perm);
  };
  const hasAny = (perms: string[]) => perms.some((p) => has(p));

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        permissions,
        scope,
        hasAny,
        loading,
        login,
        logout,
        has,
        reloadUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
