// Mini-Express pour navigateur : juste ce que src/server/api.ts utilise
// (Router avec get/post/put/patch/delete/use, req.body/params/query/headers,
// res.status/json). Le code du serveur reste inchangé.
type Handler = (req: any, res: any, next: (err?: any) => void) => any;
type Layer = { method: string; keys: string[]; regex: RegExp | null; handlers: Handler[] };

function compile(path: string) {
  const keys: string[] = [];
  const src = path
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\/:([A-Za-z0-9_]+)/g, (_m, k) => {
      keys.push(k);
      return "/([^/]+)";
    })
    .replace(/\*/g, ".*");
  return { keys, regex: new RegExp(`^${src}/?$`) };
}

export class Router {
  stack: Layer[] = [];
  private add(method: string, args: any[]) {
    if (typeof args[0] === "string") {
      const { keys, regex } = compile(args[0]);
      this.stack.push({ method, keys, regex, handlers: args.slice(1).flat() });
    } else {
      this.stack.push({ method, keys: [], regex: null, handlers: args.flat() });
    }
    return this;
  }
  get(...a: any[]) { return this.add("GET", a); }
  post(...a: any[]) { return this.add("POST", a); }
  put(...a: any[]) { return this.add("PUT", a); }
  patch(...a: any[]) { return this.add("PATCH", a); }
  delete(...a: any[]) { return this.add("DELETE", a); }
  all(...a: any[]) { return this.add("ALL", a); }
  use(...a: any[]) { return this.add("USE", a); }

  async handle(req: any, res: any): Promise<boolean> {
    for (const layer of this.stack) {
      if (res.finished) return true;
      if (layer.method !== "USE" && layer.method !== "ALL" && layer.method !== req.method) continue;
      if (layer.regex) {
        const m = layer.regex.exec(req.path);
        if (!m) continue;
        req.params = {};
        layer.keys.forEach((k, i) => (req.params[k] = decodeURIComponent(m[i + 1])));
      }
      for (const h of layer.handlers) {
        let calledNext = false;
        await h(req, res, (err?: any) => {
          if (err) throw err;
          calledNext = true;
        });
        if (res.finished || !calledNext) break;
      }
      if (res.finished) return true;
    }
    return res.finished;
  }
}

function express() {
  throw new Error("express() n'est pas disponible dans l'aperçu navigateur");
}
express.Router = () => new Router();
express.json = () => (_req: any, _res: any, next: any) => next();
express.urlencoded = () => (_req: any, _res: any, next: any) => next();
export default express;
export type Request = any;
export type Response = any;
