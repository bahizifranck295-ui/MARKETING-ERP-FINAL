import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { PageHeader, EmptyState, fmtDate } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifs = async () => {
    setLoading(true);
    try {
      const res = await api.get("/notifications");
      setNotifs(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur chargement notifications"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifs();
  }, []);

  const markAllRead = async () => {
    try {
      await api.post("/notifications/mark-all-read");
      toast.success("Toutes les notifications sont marquées comme lues");
      setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true, read: true })));
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec de l'opération"));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Centre de Notifications"
        subtitle="Alertes système, approbations de commandes et rappels"
        right={
          notifs.some((n) => !n.is_read && !n.read) && (
            <Button
              size="sm"
              variant="outline"
              onClick={markAllRead}
              className="rounded-xl border-slate-200 text-xs"
            >
              <CheckCheck className="h-4 w-4 mr-1 text-[#0F3D68]" /> Tout marquer comme lu
            </Button>
          )
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : notifs.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Aucune notification"
          subtitle="Vous êtes à jour !"
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs divide-y divide-slate-100">
          {notifs.map((n) => {
            const isRead = n.is_read || n.read;
            return (
              <div
                key={n.id}
                className={`p-4 flex items-start gap-3 transition-colors ${
                  isRead ? "bg-white" : "bg-blue-50/40"
                }`}
              >
                <div
                  className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                    isRead ? "bg-transparent" : "bg-[#0F3D68]"
                  }`}
                />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-slate-900 text-xs">{n.title}</h4>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {fmtDate(n.created_at || n.at)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
