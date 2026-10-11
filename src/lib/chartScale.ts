/* Outils de graphiques communs aux deux applications (montants abrégés, graduations rondes) */
export function compactMoney(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M$`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k$`;
  return `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} $`;
}

// Échelle à 4 graduations rondes (1, 2, 2,5 ou 5 × 10^n)
export function niceScale(v: number) {
  const raw = Math.max(v, 1) / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = ([1, 2, 2.5, 5, 10].find((s) => s * pow >= raw) || 10) * pow;
  return { max: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}
