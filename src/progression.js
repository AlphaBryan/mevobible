// Logique pure de la progression (testée dans tests/progression.test.js).
// État partagé : { livre, chapitre, termineLe, precedent, youtube, majLe }.
// « livre, chapitre » = prochain chapitre à lire. Le jour où un chapitre est marqué lu,
// termineLe = ce jour et precedent = ce chapitre : l'app l'affiche coché jusqu'au lendemain.

import { LIVRES, TOTAL_CHAPITRES } from "./livres.js";

export const DEFAUT = { livre: 3, chapitre: 25, termineLe: null, precedent: null, youtube: "", majLe: "1970-01-01T00:00:00.000Z" };

export const nom = (l, c) => LIVRES[l - 1][0] + " " + c;

// Date locale AAAA-MM-JJ (le format en-CA est justement celui-là).
export const jourLocal = (d = new Date()) => d.toLocaleDateString("en-CA");

export function suivant(l, c) {
  if (c < LIVRES[l - 1][1]) return { livre: l, chapitre: c + 1 };
  if (l < 66) return { livre: l + 1, chapitre: 1 };
  return { livre: 1, chapitre: 1 };
}

const chapitreValide = (l, c) => Number.isInteger(l) && l >= 1 && l <= 66 && Number.isInteger(c) && c >= 1 && c <= LIVRES[l - 1][1];

// Nettoie un état venu du stockage ou du serveur ; null s'il est inutilisable.
export function valide(s) {
  if (!s || typeof s !== "object") return null;
  const l = Number(s.livre), c = Number(s.chapitre);
  if (!chapitreValide(l, c)) return null;
  let prec = null;
  if (s.precedent && typeof s.precedent === "object") {
    const pl = Number(s.precedent.livre), pc = Number(s.precedent.chapitre);
    if (chapitreValide(pl, pc)) prec = { livre: pl, chapitre: pc };
  }
  const yt = typeof s.youtube === "string" && /^https:\/\/[^\s"<>]+$/.test(s.youtube) ? s.youtube.slice(0, 400) : "";
  const termine = typeof s.termineLe === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.termineLe) ? s.termineLe : null;
  const maj = typeof s.majLe === "string" && !isNaN(Date.parse(s.majLe)) ? s.majLe : DEFAUT.majLe;
  return { livre: l, chapitre: c, termineLe: termine, precedent: prec, youtube: yt, majLe: maj };
}

export function passageDuJour(etat, aujourdhui = jourLocal()) {
  if (etat.termineLe === aujourdhui && etat.precedent) return { ...etat.precedent, fait: true };
  return { livre: etat.livre, chapitre: etat.chapitre, fait: false };
}

export function marquerLu(etat, aujourdhui = jourLocal()) {
  const p = passageDuJour(etat, aujourdhui);
  if (p.fait) return etat;
  const n = suivant(p.livre, p.chapitre);
  return { ...etat, livre: n.livre, chapitre: n.chapitre, termineLe: aujourdhui, precedent: { livre: p.livre, chapitre: p.chapitre } };
}

export function annuler(etat) {
  if (!etat.precedent) return etat;
  return { ...etat, livre: etat.precedent.livre, chapitre: etat.precedent.chapitre, termineLe: null, precedent: null };
}

export function changerPassage(etat, l, c) {
  return { ...etat, livre: l, chapitre: c, termineLe: null, precedent: null };
}

// Rang absolu du chapitre (Genèse 1 = 1, Apocalypse 22 = 1189).
export function rang(l, c) {
  let n = 0;
  for (let i = 0; i < l - 1; i++) n += LIVRES[i][1];
  return n + c;
}

export function avancement(etat, aujourdhui = jourLocal()) {
  const p = passageDuJour(etat, aujourdhui);
  const lus = rang(p.livre, p.chapitre) - (p.fait ? 0 : 1);
  return { lus, total: TOTAL_CHAPITRES, pourcent: Math.round((lus / TOTAL_CHAPITRES) * 100) };
}

// En cas de conflit entre appareils, la modification la plus récente gagne.
export const plusRecent = (a, b) => (Date.parse(b.majLe) > Date.parse(a.majLe) ? b : a);

// Annonce lue avant les versets : « Psaume 51. » ou « Lévitique, chapitre 25. »
export function titreParle(l, c) {
  if (l === 19) return `Psaume ${c}.`;
  return `${LIVRES[l - 1][0]}, chapitre ${c}.`;
}
