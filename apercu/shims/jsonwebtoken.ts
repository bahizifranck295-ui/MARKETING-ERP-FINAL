// Jetons de démonstration pour l'aperçu navigateur (même interface que jsonwebtoken).
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const unb64 = (s: string) => decodeURIComponent(escape(atob(s)));

function parseExpiry(v: any): number {
  if (typeof v === "number") return v;
  const m = /^(\d+)\s*([smhd])?$/.exec(String(v));
  if (!m) return 8 * 3600;
  const n = Number(m[1]);
  return n * ({ s: 1, m: 60, h: 3600, d: 86400 } as any)[m[2] || "s"];
}

export function sign(payload: any, secret: string, opts: any = {}) {
  const iat = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat };
  if (opts.expiresIn) body.exp = iat + parseExpiry(opts.expiresIn);
  return `${b64('{"alg":"demo"}')}.${b64(JSON.stringify(body))}.${b64(secret).slice(0, 12)}`;
}

export function verify(token: string, secret: string) {
  const [, body, sig] = String(token).split(".");
  if (!body || sig !== b64(secret).slice(0, 12)) throw new Error("invalid token");
  const payload = JSON.parse(unb64(body));
  if (payload.exp && payload.exp < Date.now() / 1000) throw new Error("jwt expired");
  return payload;
}

export default { sign, verify };
