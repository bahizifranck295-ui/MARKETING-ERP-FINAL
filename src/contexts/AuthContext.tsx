import React, { createContext, useContext, useEffect, useState } from "react";
import { api, tokenStore } from "@/lib/api";

interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  department?: string;
  role_code: string;
  is_transversal?: boolean;
}

interface Role {
  code: string;
  name: string;
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  role: Role | null;
  permissions: string[];
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
  };

  const has = (perm: string | null): boolean => {
    if (!perm) return true;
    if (user?.role_code === "super_admin") return true;
    return permissions.includes(perm);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        permissions,
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
