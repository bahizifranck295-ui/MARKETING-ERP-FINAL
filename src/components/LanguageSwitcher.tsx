import { Languages } from "lucide-react";
import { useLang } from "@/i18n/useLang";
import type { Lang } from "@/i18n";

const OPTIONS: { value: Lang; label: string; short: string }[] = [
  { value: "fr", label: "Français", short: "FR" },
  { value: "en", label: "English", short: "EN" },
];

/** Sélecteur de langue de l'ERP (Français / English). */
export function LanguageSwitcher({ variant = "light", className = "" }: { variant?: "light" | "dark"; className?: string }) {
  const [lang, setLang] = useLang();
  const dark = variant === "dark";
  return (
    <div
      data-no-translate
      role="group"
      aria-label="Langue / Language"
      className={`inline-flex items-center gap-1 rounded-xl p-1 ${dark ? "bg-white/15 ring-1 ring-white/25" : "bg-slate-100 ring-1 ring-slate-200"} ${className}`}
    >
      <Languages className={`h-4 w-4 mx-1 ${dark ? "text-white/80" : "text-slate-500"}`} aria-hidden />
      {OPTIONS.map((o) => {
        const active = lang === o.value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.label}
            aria-pressed={active}
            data-lang={o.value}
            onClick={() => setLang(o.value)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              active
                ? dark
                  ? "bg-white text-[#211A5C] shadow"
                  : "bg-white text-[#211A5C] shadow-sm"
                : dark
                ? "text-white/85 hover:bg-white/10"
                : "text-slate-600 hover:bg-white/70"
            }`}
          >
            <span className="sm:hidden">{o.short}</span>
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
