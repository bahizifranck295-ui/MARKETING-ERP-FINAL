// Dans l'aperçu, la navigation se fait en mémoire : elle ne dépend plus de
// l'adresse de la fenêtre (que la page d'aperçu de Claude peut bloquer).
import React from "react";
import { MemoryRouter } from "react-router";
export * from "react-router";

export function BrowserRouter({ children }: { children?: React.ReactNode }) {
  let start = "/login";
  try {
    if (localStorage.getItem("erp_access_token")) start = "/dashboard";
  } catch {}
  return <MemoryRouter initialEntries={[start]}>{children}</MemoryRouter>;
}
