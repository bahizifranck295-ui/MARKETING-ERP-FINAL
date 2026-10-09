import { useEffect, useState } from "react";
import { getLang, onLangChange, setLang, type Lang } from "./index";

/** Langue courante de l'interface + fonction de changement. */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, set] = useState<Lang>(getLang());
  useEffect(() => onLangChange(set), []);
  return [lang, setLang];
}
