import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, Search, Loader2 } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { PageHeader, EmptyState, fmtDate } from "@/components/erp-ui";
import { Input } from "@/components/ui/input";

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadAudit = async () => {
    setLoading(true);
    try {
      const res = await api.get("/audit/logs");
      setLogs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur chargement audit"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
  }, []);

  const filteredLogs = logs.filter((l) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      l.action?.toLowerCase().includes(q) ||
      l.user_name?.toLowerCase().includes(q) ||
      l.details?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Journal d'Audit & Sécurité"
        subtitle="Historique des actions critiques, connexions et modifications de données"
      />
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Rechercher par action, utilisateur..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10 rounded-xl bg-white border-slate-200 text-xs"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Aucun événement d'audit"
          subtitle="Toutes les actions système seront enregistrées ici."
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs divide-y divide-slate-100">
          {filteredLogs.map((l) => (
            <div key={l.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{l.action}</span>
                  <span className="text-[10px] text-slate-400">• {fmtDate(l.created_at || l.at)}</span>
                </div>
                <div className="text-slate-600">{l.details || l.summary || "Opération standard"}</div>
              </div>
              <div className="text-right text-slate-500">
                <span className="font-semibold text-slate-800 block">{l.user_name || l.actor_name || l.actor_email}</span>
                <span className="font-mono text-[10px] text-slate-400">{l.ip || "127.0.0.1"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
