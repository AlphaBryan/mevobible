#!/usr/bin/env node
// Convertit la Louis Segond 1910 (USFM, dépôt BibleCorps/FRA-B-LSG1910-PD-UBS)
// en un fichier JSON par livre : public/livres/03.json = { nom, chapitres: [[verset, …], …] }.
//
// Usage : node scripts/convertir-usfm.mjs [dossier p.sfm]
// Sans argument, le dépôt est cloné dans ./source-lsg (ignoré par Git).
//
// On ne garde que le texte des versets : introductions, intertitres, références
// croisées et notes sont des ajouts éditoriaux, pas forcément du domaine public.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LIVRES, TOTAL_CHAPITRES, codeLivre } from "../src/livres.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEPOT = "https://github.com/BibleCorps/FRA-B-LSG1910-PD-UBS.git";

function dossierSource() {
  if (process.argv[2]) return process.argv[2];
  const clone = join(RACINE, "source-lsg");
  if (!existsSync(clone)) execFileSync("git", ["clone", "--depth", "1", DEPOT, clone], { stdio: "inherit" });
  return join(clone, "p.sfm");
}

// Lignes entières à ignorer : titres, introductions, intertitres, références, remarques.
const LIGNES_IGNOREES = /^\\(id|ide|h|toc\d|mt\d?|mte\d?|imt\d?|is\d?|ip|ipi|io\d?|ior|iq\d?|ie|ib\d?|s\d?|ms\d?|mr|r|sr|d|sd\d?|rem|periph|cl|cp)\b/;

// Retire les notes et références croisées, puis tous les marqueurs restants en gardant leur texte.
export function nettoyerEnLigne(t) {
  return t
    .replace(/\\x\s.*?\\x\*/g, "")
    .replace(/\\fe?\s.*?\\fe?\*/g, "")
    .replace(/\\(?:tr|th\d|thr\d|tc\d|tcr\d)\s*/g, " ")
    .replace(/\\\+?[a-z]+\d*\*/g, "")       // marqueurs fermants : \wj* \it* \qs* \ord*
    .replace(/\\\+?[a-z]+\d*\s?/g, "");     // marqueurs ouvrants : \wj \it \qs \ord
}

const propre = (t) => t.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();

export function convertirLivre(source, code) {
  const chapitres = [];
  let chap = null;    // versets du chapitre en cours
  let verset = -1;    // index du verset en cours dans ce chapitre (-1 : pas encore de verset)
  const erreurs = [];

  const ajouter = (texte, sep) => {
    if (verset < 0 || !texte && sep !== "\n") return;
    const cur = chap[verset];
    chap[verset] = cur ? cur + sep + texte : texte;
  };

  for (const brute of source.split(/\r?\n/)) {
    let ligne = brute.trim();
    if (!ligne) continue;

    const c = ligne.match(/^\\c\s+(\d+)/);
    if (c) {
      const n = Number(c[1]);
      if (n !== chapitres.length + 1) erreurs.push(`${code} : chapitre ${n} inattendu après ${chapitres.length}`);
      chap = []; chapitres.push(chap); verset = -1;
      continue;
    }
    if (!chap || LIGNES_IGNOREES.test(ligne)) continue;

    // Coquille connue de la source : « \v 11 5Éloignez-vous » = Psaume 119:115.
    if (code === "PSA" && chapitres.length === 119) ligne = ligne.replace(/^\\v 11 5(?=\S)/, "\\v 115 ");

    // Retour à la ligne poétique : \q, \q1, \q2… (le texte qui suit va sur une nouvelle ligne).
    const q = ligne.match(/^\\q\d?(?:\s+(.*))?$/);
    if (q) {
      const reste = q[1] || "";
      const v = reste.match(/^\\v\s+(\d+)\s*(.*)$/);
      if (v) { ouvrirVerset(Number(v[1]), v[2]); continue; }
      ajouter(nettoyerEnLigne(reste), "\n");
      continue;
    }

    const v = ligne.match(/^\\v\s+(\d+)\s*(.*)$/);
    if (v) { ouvrirVerset(Number(v[1]), v[2]); continue; }

    // Paragraphes (\p, \m, \pi, \b, \tr…) : on continue le verset en cours avec une espace.
    ajouter(nettoyerEnLigne(ligne.replace(/^\\(p|m|pi\d?|b|nb|li\d?|pc|pmo|mi)\b\s*/, "")), " ");
  }

  function ouvrirVerset(n, texte) {
    if (n !== chap.length + 1) erreurs.push(`${code} ${chapitres.length}:${n} — attendu ${chap.length + 1}`);
    chap.push(""); verset = chap.length - 1;
    chap[verset] = nettoyerEnLigne(texte);
  }

  return { chapitres: chapitres.map((ch) => ch.map(propre)), erreurs };
}

function main() {
  const dossier = dossierSource();
  const fichiers = readdirSync(dossier).filter((f) => /\.sfm$/.test(f));
  const sortie = join(RACINE, "public", "livres");
  mkdirSync(sortie, { recursive: true });

  let totalChap = 0, totalVersets = 0;
  const erreurs = [];

  LIVRES.forEach(([nom, nbChap, code], i) => {
    const f = fichiers.find((x) => x.includes(`-${code}.`));
    if (!f) { erreurs.push(`Fichier introuvable pour ${nom} (${code})`); return; }
    const r = convertirLivre(readFileSync(join(dossier, f), "utf8"), code);
    erreurs.push(...r.erreurs);
    if (r.chapitres.length !== nbChap) erreurs.push(`${nom} : ${r.chapitres.length} chapitres au lieu de ${nbChap}`);
    r.chapitres.forEach((ch, ci) => ch.forEach((t, vi) => {
      if (!t) erreurs.push(`${nom} ${ci + 1}:${vi + 1} vide`);
      if (/[\\|*]/.test(t)) erreurs.push(`${nom} ${ci + 1}:${vi + 1} contient un marqueur : « ${t} »`);
    }));
    totalChap += r.chapitres.length;
    totalVersets += r.chapitres.reduce((s, ch) => s + ch.length, 0);
    writeFileSync(join(sortie, codeLivre(i + 1) + ".json"), JSON.stringify({ nom, chapitres: r.chapitres }));
  });

  const ps = JSON.parse(readFileSync(join(sortie, "19.json"), "utf8"));
  const v115 = ps.chapitres[118][114];
  if (!v115?.startsWith("Éloignez-vous")) erreurs.push(`Psaume 119:115 non corrigé : « ${v115} »`);
  // Le Psaume 51 est intégré à l'app (étape 1, disponible même hors ligne dès le premier chargement).
  writeFileSync(join(RACINE, "src", "psaume51.json"), JSON.stringify(ps.chapitres[50], null, 1) + "\n");

  console.log(`Livres : ${LIVRES.length} / 66`);
  console.log(`Chapitres : ${totalChap.toLocaleString("fr-CA")} / ${TOTAL_CHAPITRES.toLocaleString("fr-CA")}`);
  console.log(`Versets : ${totalVersets.toLocaleString("fr-CA")}`);
  console.log(`Psaume 119:115 : « ${v115.split("\n")[0]} »`);
  if (erreurs.length) {
    console.error(`\n${erreurs.length} problème(s) :\n` + erreurs.slice(0, 40).join("\n"));
    process.exit(1);
  }
  console.log("✓ Numérotation des versets continue dans les 1 189 chapitres. Aucun marqueur restant.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
