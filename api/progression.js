// Fonction Vercel : lit et écrit l'unique enregistrement de progression de la famille.
//   GET /api/progression   → l'état (404 s'il n'existe pas encore)
//   PUT /api/progression   → enregistre l'état si plus récent (majLe) que celui stocké
//
// Pas de code ni de compte (choix de la famille). Protection légère : une écriture doit venir
// du site lui-même (en-tête Origin identique), et l'état reçu est strictement validé.
// Base : un fichier JSON dans un stockage Vercel Blob PRIVÉ (gratuit avec le plan Hobby).
// Le jeton BLOB_READ_WRITE_TOKEN est ajouté automatiquement par Vercel ; il n'est jamais envoyé au navigateur.

import { get, put } from "@vercel/blob";
import { valide, plusRecent } from "../src/progression.js";

const FICHIER = "progression.json";
let memoire = null; // utilisé seulement en développement local, sans base configurée

function base() {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      async lire() {
        const r = await get(FICHIER, { access: "private", useCache: false });
        return r ? JSON.parse(await new Response(r.stream).text()) : null;
      },
      ecrire: (v) => put(FICHIER, JSON.stringify(v), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" }),
    };
  }
  if (process.env.VERCEL) return null;
  return { lire: async () => memoire, ecrire: async (v) => { memoire = v; } };
}

// Le navigateur envoie toujours l'en-tête Origin sur un PUT : on exige qu'il corresponde au site.
function memeSite(request) {
  const origine = request.headers.get("origin");
  if (!origine) return false;
  try { return new URL(origine).host === new URL(request.url).host || new URL(origine).host === request.headers.get("host"); }
  catch { return false; }
}

const json = (status, data) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

async function traiter(request) {
  if (request.method === "PUT" && !memeSite(request)) return json(403, { erreur: "Écriture refusée" });
  const db = base();
  if (!db) return json(503, { erreur: "Base de données non configurée" });

  const stocke = valide(await db.lire());
  if (request.method === "GET") return stocke ? json(200, stocke) : json(404, { erreur: "Aucune progression enregistrée" });

  let recu;
  try { recu = valide(await request.json()); } catch { recu = null; }
  if (!recu) return json(400, { erreur: "État invalide" });
  const gagnant = stocke ? plusRecent(stocke, recu) : recu;
  if (gagnant === recu) await db.ecrire(recu);
  return json(200, gagnant);
}

export const GET = traiter;
export const PUT = traiter;
