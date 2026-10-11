import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Landmark, Lock, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { APP_INFO } from "@/app/edition";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOGO_ALT, LOGO_SRC } from "@/app/brand";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@erp.local");
  const [password, setPassword] = useState("Admin@2026");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Connexion réussie !");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(
        err?.response?.data?.detail || "Email ou mot de passe incorrect."
      );
    } finally {
      setLoading(false);
    }
  };

  const setCredentials = (em: string, pw: string) => {
    setEmail(em);
    setPassword(pw);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-app px-4 py-8">
      <div className="relative w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <ThemeToggle className="absolute right-4 top-4" />
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex justify-center">
            <img
              src={LOGO_SRC}
              alt="PREMIDIS SARL"
              className="logo-tile h-20 w-auto rounded-2xl object-contain p-1.5"
            />
          </div>
          <h1 className="text-2xl font-black text-ink tracking-tight mt-2">
            PREMIDIS SARL
          </h1>
          <p className="text-xs text-slate-500">
            <span data-app-name className="font-bold text-brand">{APP_INFO.name}</span> · {APP_INFO.subtitle}
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Email de connexion</Label>
            <div className="relative">
              <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9 h-11 rounded-xl bg-slate-50 border-slate-200 text-sm focus:bg-white"
                placeholder="nom@erp.local"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Mot de passe</Label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 h-11 rounded-xl bg-slate-50 border-slate-200 text-sm focus:bg-white"
                placeholder="••••••••"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl bg-brand hover:bg-brand-strong text-white font-bold text-sm shadow-md"
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Se connecter
          </Button>
        </form>

        {/* Demo Fast Accounts */}
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
            Comptes démo pré-configurés
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setCredentials("admin@erp.local", "Admin@2026")}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-left transition-colors"
            >
              <div className="font-bold text-slate-800 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                Super Admin
              </div>
              <div className="text-[10px] text-slate-400">admin@erp.local</div>
            </button>
            <button
              type="button"
              onClick={() => setCredentials("chef@erp.local", "Admin@2026")}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-left transition-colors"
            >
              <div className="font-bold text-slate-800">Chef Ventes</div>
              <div className="text-[10px] text-slate-400">chef@erp.local</div>
            </button>
            <button
              type="button"
              onClick={() => setCredentials("marketer@erp.local", "Admin@2026")}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-left transition-colors"
            >
              <div className="font-bold text-slate-800">Patrick K. (Terrain)</div>
              <div className="text-[10px] text-slate-400">marketer@erp.local</div>
            </button>
            <button
              type="button"
              onClick={() => setCredentials("sarah.kalala@erp.local", "Admin@2026")}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-left transition-colors"
            >
              <div className="font-bold text-slate-800">Sarah K. (Terrain)</div>
              <div className="text-[10px] text-slate-400">sarah.kalala@erp.local</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
