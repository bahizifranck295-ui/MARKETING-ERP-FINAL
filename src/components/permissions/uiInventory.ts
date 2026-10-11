/*
 * Inventaire automatique des contrôles de droits de l'interface.
 * Le code source des écrans (chargé à la demande, uniquement à l'ouverture du contrôle) est analysé :
 * chaque has("…"), hasAny([…]), permission="…", anyOf={[…]} et perm: "…" est recensé avec son fichier.
 * Ainsi un nouveau bouton protégé par un code inconnu du catalogue est signalé automatiquement.
 */
const sources = import.meta.glob("../../**/*.{tsx,ts}", { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

const PATTERNS = [
  /\bhas\(\s*["']([a-z_]+\.[a-z_]+)["']\s*\)/g,
  /\bpermission=["']([a-z_]+\.[a-z_]+)["']/g,
  /\bperm:\s*["']([a-z_]+\.[a-z_]+)["']/g,
];
const LISTS = [/\bhasAny\(\s*\[([^\]]*)\]/g, /\banyOf=\{\[([^\]]*)\]\}/g];

export async function scanInterface(): Promise<{ files: number; usage: Record<string, string[]> }> {
  const usage: Record<string, string[]> = {};
  const add = (code: string, file: string) => {
    (usage[code] ||= []).includes(file) || usage[code].push(file);
  };
  const entries = Object.entries(sources).filter(([f]) => !f.includes("/server/") && !f.endsWith("uiInventory.ts"));
  await Promise.all(
    entries.map(async ([file, load]) => {
      const src = await load();
      const name = file.replace(/^(\.\.\/)+/, "src/");
      for (const re of PATTERNS) for (const m of src.matchAll(re)) add(m[1], name);
      for (const re of LISTS)
        for (const m of src.matchAll(re)) for (const c of m[1].matchAll(/["']([a-z_]+\.[a-z_]+)["']/g)) add(c[1], name);
    })
  );
  return { files: entries.length, usage };
}
