export interface ProductColorStyle {
  name: string;
  primary: string;
  cardBorderHex: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  accentBg: string;
  lightBg: string;
}

const KNOWN_PALETTES: Record<string, ProductColorStyle> = {
  "eau aqua 500ml": {
    name: "Sky Blue",
    primary: "#0284c7",
    cardBorderHex: "#0284c7",
    badgeBg: "#e0f2fe",
    badgeText: "#0369a1",
    badgeBorder: "#7dd3fc",
    accentBg: "#f0f9ff",
    lightBg: "#f0f9ff",
  },
  "eau pure la vie 1.5l": {
    name: "Cyan",
    primary: "#0891b2",
    cardBorderHex: "#0891b2",
    badgeBg: "#cffafe",
    badgeText: "#155e75",
    badgeBorder: "#67e8f9",
    accentBg: "#ecfeff",
    lightBg: "#ecfeff",
  },
  "jus pulpy 1l": {
    name: "Orange",
    primary: "#ea580c",
    cardBorderHex: "#ea580c",
    badgeBg: "#ffedd5",
    badgeText: "#c2410c",
    badgeBorder: "#fdba74",
    accentBg: "#fff7ed",
    lightBg: "#fff7ed",
  },
  "skol lager 65cl": {
    name: "Emerald",
    primary: "#059669",
    cardBorderHex: "#059669",
    badgeBg: "#d1fae5",
    badgeText: "#065f46",
    badgeBorder: "#6ee7b7",
    accentBg: "#ecfdf5",
    lightBg: "#ecfdf5",
  },
  "coca cola 50cl": {
    name: "Red",
    primary: "#dc2626",
    cardBorderHex: "#dc2626",
    badgeBg: "#fee2e2",
    badgeText: "#991b1b",
    badgeBorder: "#fca5a5",
    accentBg: "#fef2f2",
    lightBg: "#fef2f2",
  },
  "johnnie walker red": {
    name: "Purple",
    primary: "#7c3aed",
    cardBorderHex: "#7c3aed",
    badgeBg: "#ede9fe",
    badgeText: "#5b21b6",
    badgeBorder: "#c4b5fd",
    accentBg: "#f5f3ff",
    lightBg: "#f5f3ff",
  },
  "vin 4 cousins rouge": {
    name: "Burgundy Rose",
    primary: "#be123c",
    cardBorderHex: "#be123c",
    badgeBg: "#ffe4e6",
    badgeText: "#9f1239",
    badgeBorder: "#fda4af",
    accentBg: "#fff1f2",
    lightBg: "#fff1f2",
  },
  "farine de maïs extra 25kg": {
    name: "Amber",
    primary: "#d97706",
    cardBorderHex: "#d97706",
    badgeBg: "#fef3c7",
    badgeText: "#92400e",
    badgeBorder: "#fcd34d",
    accentBg: "#fefce8",
    lightBg: "#fffbeb",
  },
  "huile végétale simba 5l": {
    name: "Teal",
    primary: "#0d9488",
    cardBorderHex: "#0d9488",
    badgeBg: "#ccfbf1",
    badgeText: "#115e59",
    badgeBorder: "#5eead4",
    accentBg: "#f0fdfa",
    lightBg: "#f0fdfa",
  },
};

const FALLBACK_PALETTES: ProductColorStyle[] = [
  {
    name: "Sky",
    primary: "#0284c7",
    cardBorderHex: "#0284c7",
    badgeBg: "#e0f2fe",
    badgeText: "#0369a1",
    badgeBorder: "#7dd3fc",
    accentBg: "#f0f9ff",
    lightBg: "#f0f9ff",
  },
  {
    name: "Orange",
    primary: "#ea580c",
    cardBorderHex: "#ea580c",
    badgeBg: "#ffedd5",
    badgeText: "#c2410c",
    badgeBorder: "#fdba74",
    accentBg: "#fff7ed",
    lightBg: "#fff7ed",
  },
  {
    name: "Emerald",
    primary: "#059669",
    cardBorderHex: "#059669",
    badgeBg: "#d1fae5",
    badgeText: "#065f46",
    badgeBorder: "#6ee7b7",
    accentBg: "#ecfdf5",
    lightBg: "#ecfdf5",
  },
  {
    name: "Violet",
    primary: "#7c3aed",
    cardBorderHex: "#7c3aed",
    badgeBg: "#ede9fe",
    badgeText: "#5b21b6",
    badgeBorder: "#c4b5fd",
    accentBg: "#f5f3ff",
    lightBg: "#f5f3ff",
  },
  {
    name: "Rose",
    primary: "#e11d48",
    cardBorderHex: "#e11d48",
    badgeBg: "#ffe4e6",
    badgeText: "#9f1239",
    badgeBorder: "#fda4af",
    accentBg: "#fff1f2",
    lightBg: "#fff1f2",
  },
  {
    name: "Amber",
    primary: "#d97706",
    cardBorderHex: "#d97706",
    badgeBg: "#fef3c7",
    badgeText: "#92400e",
    badgeBorder: "#fcd34d",
    accentBg: "#fffbeb",
    lightBg: "#fffbeb",
  },
  {
    name: "Indigo",
    primary: "#4f46e5",
    cardBorderHex: "#4f46e5",
    badgeBg: "#e0e7ff",
    badgeText: "#3730a3",
    badgeBorder: "#a5b4fc",
    accentBg: "#eef2ff",
    lightBg: "#eef2ff",
  },
  {
    name: "Teal",
    primary: "#0d9488",
    cardBorderHex: "#0d9488",
    badgeBg: "#ccfbf1",
    badgeText: "#115e59",
    badgeBorder: "#5eead4",
    accentBg: "#f0fdfa",
    lightBg: "#f0fdfa",
  },
];

export function getProductColor(productName?: string | null): ProductColorStyle {
  if (!productName || !productName.trim()) {
    return {
      name: "Default Slate",
      primary: "#64748b",
      cardBorderHex: "#cbd5e1",
      badgeBg: "#f1f5f9",
      badgeText: "#475569",
      badgeBorder: "#cbd5e1",
      accentBg: "#f8fafc",
      lightBg: "#ffffff",
    };
  }

  const clean = productName.trim().toLowerCase();
  if (KNOWN_PALETTES[clean]) {
    return KNOWN_PALETTES[clean];
  }

  // Check substring match
  for (const [key, val] of Object.entries(KNOWN_PALETTES)) {
    if (clean.includes(key) || key.includes(clean)) {
      return val;
    }
  }

  // Hash-based deterministic color selection
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % FALLBACK_PALETTES.length;
  return FALLBACK_PALETTES[idx];
}
