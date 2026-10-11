import React, { useEffect } from "react";
import { Navigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, ShieldOff } from "lucide-react";
import { api } from "@/lib/api";

/*
 * Page protégée : sans la permission, la page n'est ni affichée ni chargée (aucun appel de données) ;
 * la tentative est signalée au Journal d'audit (le serveur bloque de toute façon chaque appel non autorisé).
 */
export default function ProtectedRoute({
  children,
  permission = null,
  anyOf,
}: {
  children: React.ReactNode;
  permission?: string | null;
  anyOf?: string[];
}) {
  const { user, loading, has, hasAny } = useAuth();
  const location = useLocation();
  const allowed = !user || ((!permission || has(permission)) && (!anyOf || hasAny(anyOf)));

  useEffect(() => {
    if (!loading && user && !allowed) {
      api.post("/audit/access-attempt", { page: location.pathname }).catch(() => {});
    }
  }, [loading, user, allowed, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0F3D68]" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs" data-access-denied>
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-600">
          <ShieldOff className="h-6 w-6" />
        </span>
        <h1 className="text-base font-bold text-slate-900">Accès non autorisé</h1>
        <p className="mt-1 text-xs text-slate-500">
          Cette page ne fait pas partie de vos permissions. La tentative a été enregistrée dans le journal d'audit.
        </p>
        <Link to="/dashboard" className="mt-4 inline-flex h-9 items-center rounded-xl bg-[#0F3D68] px-4 text-xs font-bold text-white">
          Retour au tableau de bord
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
