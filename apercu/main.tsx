import "./shims/safe-storage";
import { resetDemoData, demoReady } from "./browser-server";
import "./preview.css";
import "../src/main.tsx";

// Petit bandeau propre à l'aperçu (hors application)
const bar = document.createElement("div");
bar.className = "no-print";
bar.style.cssText = "position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147483647;display:flex;gap:8px;align-items:center;padding:6px 10px;border-radius:999px;background:#0f1d33;color:#fff;font:12px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25)";
bar.innerHTML = '<span>Aperçu · données démo</span><button type="button" style="all:unset;cursor:pointer;text-decoration:underline">Réinitialiser</button>';
const confirmBox = () => {
  const b = bar.querySelector("button")!;
  if (b.dataset.armed) return resetDemoData();
  b.dataset.armed = "1";
  b.textContent = "Confirmer ?";
  setTimeout(() => { delete b.dataset.armed; b.textContent = "Réinitialiser"; }, 4000);
};
bar.querySelector("button")!.addEventListener("click", confirmBox);
document.body.appendChild(bar);
// Premier chargement : le jeu de démo se prépare (quelques secondes)
const label = bar.querySelector("span")!;
let settled = false;
demoReady().then(() => { settled = true; label.textContent = "Aperçu · données démo"; });
setTimeout(() => { if (!settled) label.textContent = "Préparation des données démo…"; }, 300);
