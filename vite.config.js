import { defineConfig } from "vite";

// En développement, /api/progression est servi par la même fonction que sur Vercel
// (stockage en mémoire).
function apiLocale() {
  return {
    name: "api-locale",
    configureServer(server) {
      server.middlewares.use("/api/progression", (req, res) => repondre(req, res, () => server.ssrLoadModule("/api/progression.js")));
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/progression", (req, res) => repondre(req, res, () => import("./api/progression.js")));
    },
  };
}

async function repondre(req, res, charger) {
        const { GET, PUT } = await charger();
        const corps = await new Promise((ok) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => ok(d)); });
        const request = new Request("http://localhost" + req.originalUrl, { method: req.method, body: req.method === "PUT" ? corps : undefined, headers: req.headers });
        const r = await (req.method === "PUT" ? PUT : GET)(request);
        res.statusCode = r.status;
        r.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await r.text());
}

export default defineConfig({
  plugins: [apiLocale()],
  test: { environment: "node" },
});
