import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/theme/theme";

/**
 * Bouton de changement de thème : lune en mode clair (« Activer le mode sombre »),
 * soleil en mode sombre (« Activer le mode clair »). Le changement est immédiat, sans rechargement.
 * variant « hero » : posé sur l'en-tête en dégradé du tableau de bord.
 */
export function ThemeToggle({ variant = "default", className = "" }: { variant?: "default" | "hero"; className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  const label = dark ? "Activer le mode clair" : "Activer le mode sombre";
  const base =
    variant === "hero"
      ? "bg-white/15 hover:bg-white/25 ring-1 ring-white/25 text-white"
      : "hdr-btn";
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      data-theme-toggle={theme}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${base} ${className}`}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
