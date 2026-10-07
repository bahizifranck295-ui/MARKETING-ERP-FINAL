import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { PageHeader } from "@/components/erp-ui";

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const res = await api.get("/roles");
      setRoles(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur chargement rôles"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rôles & Permissions"
        subtitle="Matrice de sécurité, droits d'accès et séparation des pouvoirs"
      />
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles.map((r) => (
            <div
              key={r.id || r.code}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-[#0F3D68]/10 text-[#0F3D68] flex items-center justify-center font-bold">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{r.name}</h3>
                    <span className="font-mono text-[10px] text-slate-400">{r.code}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500">{r.description}</p>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Permissions accordées ({r.permissions?.length || 0})
                </span>
                <div className="flex flex-wrap gap-1">
                  {r.permissions?.map((p: string) => (
                    <span
                      key={p}
                      className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-mono"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
