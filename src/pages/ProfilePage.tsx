import React, { useState } from "react";
import { toast } from "sonner";
import { Lock, LogOut, Loader2, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTheme, type ThemePref } from "@/theme/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "@/lib/api";
import { PageHeader } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ProfilePage() {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const initials = (user?.full_name || "CD")
    .split(" ")
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const form = e.target as any;
    const currentPassword = form.elements.currentPassword.value;
    const newPassword = form.elements.newPassword.value;
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      toast.success("Mot de passe mis à jour avec succès");
      form.reset();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Impossible de modifier le mot de passe"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mon Profil & Paramètres"
        subtitle="Informations de votre compte utilisateur"
      />
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row items-center gap-5">
        <div className="h-20 w-20 rounded-2xl bg-brand text-white font-black text-2xl flex items-center justify-center shadow-md">
          {initials}
        </div>
        <div className="text-center sm:text-left space-y-1">
          <h2 className="text-xl font-bold text-slate-900">{user?.full_name}</h2>
          <p className="text-xs text-slate-500">{user?.email}</p>
          <div className="pt-1 flex flex-wrap justify-center sm:justify-start gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-brand/10 text-brand text-xs font-semibold">
              {role?.name || user?.role_code}
            </span>
            {user?.department && (
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs capitalize">
                {user.department}
              </span>
            )}
          </div>
        </div>
      </div>

      <ThemePreference />

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Lock className="h-5 w-5 text-slate-600" />
          <h3 className="font-bold text-slate-900 text-sm">Sécurité & Mot de Passe</h3>
        </div>
        <form onSubmit={handleUpdatePassword} className="space-y-3 max-w-md text-xs">
          <div>
            <Label className="text-xs font-semibold">Mot de passe actuel</Label>
            <Input
              name="currentPassword"
              type="password"
              required
              className="mt-1 h-9 rounded-lg"
              placeholder="••••••••"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold">Nouveau mot de passe</Label>
            <Input
              name="newPassword"
              type="password"
              required
              className="mt-1 h-9 rounded-lg"
              placeholder="••••••••"
            />
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-brand hover:bg-brand-strong text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Mettre à jour le mot de passe
          </Button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex items-center justify-between">
        <div>
          <span className="font-bold text-slate-900 text-sm block">Déconnexion</span>
          <span className="text-xs text-slate-400">Terminer la session sur cet appareil</span>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-xs"
        >
          <LogOut className="h-4 w-4 mr-1.5" /> Se déconnecter
        </Button>
      </div>
    </div>
  );
}

/* Préférence d'affichage : enregistrée pour cet utilisateur, appliquée immédiatement */
function ThemePreference() {
  const { pref, setPref } = useTheme();
  const options: Array<{ v: ThemePref; label: string; icon: any; hint: string }> = [
    { v: "light", label: "Clair", icon: Sun, hint: "Gris-lavande, blanc et violet" },
    { v: "dark", label: "Sombre", icon: Moon, hint: "Bleu nuit, bleu électrique et cyan" },
    { v: "system", label: "Système", icon: Monitor, hint: "Suit le réglage de l'appareil" },
  ];
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3" data-theme-pref>
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <Palette className="h-4 w-4 text-brand" /> Apparence
      </h2>
      <div role="radiogroup" aria-label="Thème de l'application" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((o) => {
          const Icon = o.icon;
          const on = pref === o.v;
          return (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPref(o.v)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${on ? "border-brand bg-brand/10" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <span className={`grid h-9 w-9 place-items-center rounded-lg ${on ? "bg-brand text-white" : "bg-slate-100 text-slate-600"}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-bold text-slate-900">{o.label}</span>
                <span className="block text-[11px] text-slate-500">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
