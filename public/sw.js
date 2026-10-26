// Service worker : garde l'interface, le Psaume 51 et le chapitre du jour (texte + audio)
// pour que l'étude fonctionne même si le Wi-Fi est capricieux.
//  - pages et index : réseau d'abord, cache si hors ligne ;
//  - fichiers à nom unique (assets, livres, MP3) : cache d'abord.

const VERSION = "lv-v1";
const COQUILLE = "coquille-" + VERSION;
const CONTENU = "contenu-" + VERSION;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(COQUILLE);
    await c.addAll(["/", "/manifest.webmanifest", "/icone.svg", "/audio/index.json"]);
    // Les fichiers JS/CSS construits par Vite sont référencés par la page d'accueil.
    const html = await (await c.match("/")).text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    await c.addAll(assets);
    // Psaume 51 : toujours disponible.
    const idx = await (await c.match("/audio/index.json")).json().catch(() => ({ voix: {} }));
    const contenu = await caches.open(CONTENU);
    for (const [voix, liste] of Object.entries(idx.voix || {})) {
      if (!liste.includes("19:51")) continue;
      const urls = Array.from({ length: 22 }, (_, i) => `/audio/${voix}/19/051/${String(i).padStart(3, "0")}.mp3`);
      await contenu.addAll(urls).catch(() => {});
    }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.endsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// La page envoie la liste des fichiers du chapitre du jour à garder.
self.addEventListener("message", (e) => {
  if (!e.data || e.data.type !== "garder" || !Array.isArray(e.data.urls)) return;
  e.waitUntil((async () => {
    const c = await caches.open(CONTENU);
    for (const u of e.data.urls) {
      if (typeof u !== "string" || !u.startsWith("/")) continue;
      if (!(await c.match(u))) await c.add(u).catch(() => {});
    }
  })());
});

// Safari lit l'audio par morceaux (en-tête Range) : on découpe la réponse en cache (206).
async function partielle(req, reponse) {
  const buf = await reponse.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  const debut = m && m[1] ? Number(m[1]) : 0;
  const fin = m && m[2] ? Math.min(Number(m[2]), buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(debut, fin + 1), {
    status: 206,
    headers: {
      "Content-Type": reponse.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${debut}-${fin}/${buf.byteLength}`,
      "Content-Length": String(fin - debut + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  const immuable = /^\/(assets|livres|audio\/fr-)/.test(url.pathname);
  if (immuable) {
    e.respondWith((async () => {
      const enCache = await caches.match(url.pathname);
      if (enCache) return req.headers.has("range") ? partielle(req, enCache) : enCache;
      // Les requêtes partielles (Range) de <audio> passent au réseau sans être mises en cache.
      const r = await fetch(req);
      if (r.ok && r.status === 200 && !req.headers.has("range")) {
        const copie = r.clone();
        caches.open(url.pathname.startsWith("/assets") ? COQUILLE : CONTENU).then((c) => c.put(url.pathname, copie));
      }
      return r;
    })());
    return;
  }

  // Page d'accueil (avec ou sans ?f=…) et index audio : réseau d'abord.
  const cle = req.mode === "navigate" ? "/" : url.pathname;
  e.respondWith((async () => {
    try {
      const r = await fetch(req);
      if (r.ok) { const copie = r.clone(); caches.open(COQUILLE).then((c) => c.put(cle, copie)); }
      return r;
    } catch {
      const enCache = await caches.match(cle);
      if (enCache) return enCache;
      throw new Error("hors ligne");
    }
  })());
});
