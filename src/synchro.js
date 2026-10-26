// Progression partagée entre les appareils de la famille.
// - localStorage = cache local (fonctionne hors ligne) ;
// - /api/progression = l'enregistrement unique sur le serveur (aucun code, aucun compte).
// En cas de conflit, la modification la plus récente (majLe) gagne.

import { valide } from "./progression.js";

export function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage bloqué */ } }

// Anciens liens avec ?f=… : on retire ce paramètre de l'adresse, il ne sert plus.
export function nettoyerAdresse() {
  try {
    const u = new URL(location.href);
    if (u.searchParams.has("f")) { u.searchParams.delete("f"); history.replaceState(null, "", u); }
  } catch { /* rien */ }
}

const URL_API = "/api/progression";

export async function lireServeur() {
  const r = await fetch(URL_API, { cache: "no-store" });
  if (r.status === 404) return null;            // rien encore d'enregistré
  if (!r.ok) throw new Error("HTTP " + r.status);
  return valide(await r.json());
}

export async function ecrireServeur(etat) {
  const r = await fetch(URL_API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(etat) });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return valide(await r.json());
}
