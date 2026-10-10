import { Check, Languages } from "lucide-react";
import { useLang } from "@/i18n/useLang";
import type { Lang } from "@/i18n";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const OPTIONS: { value: Lang; label: string; short: string }[] = [
  { value: "fr", label: "Français", short: "FR" },
  { value: "en", label: "English", short: "EN" },
];

/** Sélecteur de langue de l'ERP : bouton « traduction » ouvrant une petite liste (Français / English). */
export function LanguageSwitcher({ variant = "light", className = "" }: { variant?: "light" | "dark"; className?: string }) {
  const [lang, setLang] = useLang();
  const dark = variant === "dark";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-no-translate
          data-lang-trigger
          aria-label="Langue / Language"
          title="Langue / Language"
          className={`relative h-9 w-9 rounded-full flex items-center justify-center transition ${
            dark ? "bg-white/15 hover:bg-white/25 ring-1 ring-white/25 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
          } ${className}`}
        >
          <Languages className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[150px]" data-no-translate>
        {OPTIONS.map((o) => (
          <DropdownMenuItem key={o.value} data-lang={o.value} onSelect={() => setLang(o.value)} className="flex items-center gap-2 cursor-pointer">
            <span className="w-7 text-[11px] font-bold text-slate-400">{o.short}</span>
            <span className="flex-1">{o.label}</span>
            {lang === o.value && <Check className="h-4 w-4 text-[#211A5C]" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
