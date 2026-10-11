import React, { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Crown,
  Eye,
  EyeOff,
  HandCoins,
  Loader2,
  Lock,
  Megaphone,
  ShieldCheck,
  ShoppingBag,
  User,
  UserCog,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { APP_INFO } from "@/app/edition";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LOGO_ALT, LOGO_SRC } from "@/app/brand";
import { LoginIntro, shouldPlayIntro } from "@/components/login/LoginIntro";
import "@/components/login/intro.css";

const DEMO_PASSWORD = "Admin@2026";

type DemoAccount = { key: string; label: string; email: string; hint: string; icon: React.ElementType };

/** Comptes de démonstration visibles par défaut (le Directeur est aussi le Manager) */
const MAIN_DEMOS: DemoAccount[] = [
  { key: "directeur", label: "Directeur", email: "directeur@erp.local", hint: "Accès complet", icon: Crown },
  { key: "admin", label: "Admin", email: "admin@erp.local", hint: "Administration système", icon: ShieldCheck },
];
/** Comptes affichés seulement après « Voir tous les comptes de démonstration » */
const MORE_DEMOS: DemoAccount[] = [
  { key: "chef", label: "Chef de département", email: "chef@erp.local", hint: "Gestion du département", icon: UserCog },
  { key: "crm", label: "Chargé CRM", email: "crm@erp.local", hint: "Relation clients", icon: Users },
  { key: "caisse", label: "Caisse", email: "caisse@erp.local", hint: "Encaissements", icon: HandCoins },
  { key: "marketer", label: "Marketeur", email: "marketer@erp.local", hint: "Ventes terrain", icon: Megaphone },
  { key: "client", label: "Client", email: "client@erp.local", hint: "Boutique en ligne", icon: ShoppingBag },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@erp.local");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // Introduction : « playing » (page cachée) → « revealing » (le logo rejoint sa place) → « done »
  const [phase, setPhase] = useState<"playing" | "revealing" | "done">(() => (shouldPlayIntro() ? "playing" : "done"));
  const logoRef = useRef<HTMLImageElement>(null);

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

  const target = useCallback(() => logoRef.current, []);
  const onReveal = useCallback(() => setPhase((p) => (p === "playing" ? "revealing" : p)), []);
  const onDone = useCallback(() => setPhase("done"), []);

  const hidden = phase === "playing";
  const demoCard = (a: DemoAccount, i: number) => {
    const Icon = a.icon;
    const active = email.toLowerCase() === a.email;
    return (
      <button
        key={a.key}
        type="button"
        data-demo-account={a.key}
        onClick={() => setCredentials(a.email, DEMO_PASSWORD)}
        style={{ transitionDelay: `${i * 60}ms` }}
        className={`group flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
          active
            ? "border-brand bg-brand/10"
            : "border-slate-200 bg-white/60 hover:border-brand/60 hover:bg-brand/5"
        }`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#087bff] to-[#8200ff] text-white shadow-md">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">{a.label}</span>
          <span className="block truncate text-[11px] text-slate-500" data-no-translate>{a.email}</span>
          <span className="block truncate text-[11px] font-semibold text-brand">{a.hint}</span>
        </span>
      </button>
    );
  };

  return (
    <div className={`relative min-h-screen overflow-hidden ${hidden ? "login-hidden" : ""}`} data-login-phase={phase}>
      <div className="login-bg login-reveal" aria-hidden>
        <div className="login-bg-horizon" />
      </div>

      <div
        className="relative z-10 mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center gap-5 px-4 py-8"
        inert={hidden || undefined}
      >
        <ThemeToggle className="login-reveal absolute right-4 top-4" />

        {/* Logo officiel (image fournie, seulement mise à l'échelle) et présentation */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            ref={logoRef}
            src={LOGO_SRC}
            alt={LOGO_ALT}
            data-login-logo
            style={{ aspectRatio: "1683 / 935" }}
            className={`logo-tile h-24 w-auto rounded-2xl object-contain p-1.5 shadow-[0_0_40px_rgba(8,123,255,0.35)] sm:h-28 ${
              phase === "done" ? "" : "opacity-0"
            }`}
          />
          <p className="login-reveal max-w-xs text-sm text-slate-600">
            Une solution complète pour une gestion d'entreprise plus intelligente.
          </p>
          <span className="login-reveal rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[11px] text-slate-600">
            <span data-app-name className="font-bold text-brand">{APP_INFO.name}</span> · {APP_INFO.subtitle}
          </span>
        </div>

        {/* Formulaire de connexion */}
        <div className="login-glass login-reveal w-full space-y-5 rounded-3xl p-5 sm:p-6" style={{ transitionDelay: "120ms" }}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Nom d'utilisateur ou email</span>
              <span className="relative block">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  name="login"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Nom d'utilisateur ou email"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white/70 pl-9 pr-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
                />
              </span>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700">Mot de passe</span>
              <span className="relative block">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mot de passe"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white/70 pl-9 pr-10 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  title={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:text-brand"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#087bff] to-[#8200ff] text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(8,123,255,0.7)] transition hover:brightness-110 disabled:opacity-70"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Se connecter
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {/* Comptes de démonstration */}
          <div className="space-y-3" data-demo-accounts>
            <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span className="h-px flex-1 bg-slate-200" />
              Comptes de démonstration
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">{MAIN_DEMOS.map(demoCard)}</div>
            {showAll && <div className="grid gap-2 sm:grid-cols-2" data-demo-more>{MORE_DEMOS.map(demoCard)}</div>}
            <button
              type="button"
              data-demo-toggle
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 transition hover:border-brand/60 hover:text-brand"
            >
              {showAll ? "Masquer les autres comptes" : "Voir tous les comptes de démonstration"}
              {showAll ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <p className="text-center text-[11px] text-slate-500">
              Mot de passe de démonstration : <span className="font-semibold" data-no-translate>{DEMO_PASSWORD}</span>
            </p>
          </div>
        </div>
      </div>

      {phase !== "done" && <LoginIntro target={target} onReveal={onReveal} onDone={onDone} />}
    </div>
  );
}
