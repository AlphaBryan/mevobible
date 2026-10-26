#!/usr/bin/env node
// Génère l'audio des versets avec les voix neuronales Microsoft via edge-tts (gratuit, sans compte).
// Un MP3 par verset (001.mp3, 002.mp3…) + 000.mp3 pour l'annonce du titre.
// Les MP3 sont ensuite servis avec le site : la famille n'a besoin d'aucun outil.
//
//   npm run audio -- voix                       liste les voix françaises (fr-CA puis fr-FR)
//   npm run audio -- echantillon [voix…]        Psaume 51:3-6 avec plusieurs voix → echantillons/
//   npm run audio -- psaume                     Psaume 51 complet
//   npm run audio -- annee [3:25] [52]          52 chapitres à partir de Lévitique 25
//   npm run audio -- menage [3:25] [52]         supprime l'audio hors (Psaume 51 + ces 52 chapitres)
//   npm run audio -- index                      reconstruit public/audio/index.json
//
// Relançable : les fichiers déjà générés sont sautés. Le script compte les caractères
// envoyés ce mois-ci (scripts/.usage.json) et s'arrête avant PLAFOND_MENSUEL.
// Prérequis (une fois) : npm run installer-voix

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LIVRES, codeLivre } from "../src/livres.js";
import { suivant, titreParle } from "../src/progression.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIO = join(RACINE, "public", "audio");
const USAGE = join(RACINE, "scripts", ".usage.json");
const EDGE_TTS = join(RACINE, ".venv", "bin", "edge-tts");

const VOIX = process.env.VOIX || "fr-FR-VivienneMultilingualNeural";
const PLAFOND = Number(process.env.PLAFOND_MENSUEL || 900000);
const EN_PARALLELE = Number(process.env.EN_PARALLELE || 3);

if (!existsSync(EDGE_TTS)) {
  console.error("edge-tts n'est pas installé. Lancez d'abord : npm run installer-voix");
  process.exit(1);
}

const executer = promisify(execFile);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const moisCourant = () => new Date().toISOString().slice(0, 7);

function lireUsage() {
  try {
    const u = JSON.parse(readFileSync(USAGE, "utf8"));
    if (u.mois === moisCourant()) return u;
  } catch { /* premier lancement */ }
  return { mois: moisCourant(), caracteres: 0 };
}
const usage = lireUsage();
let envoyesSession = 0;

// Les retours à la ligne poétiques deviennent des espaces : la ponctuation suffit aux pauses.
const texteParle = (t) => t.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();

// Écrit d'abord dans un fichier temporaire : un arrêt brutal ne laisse jamais de MP3 tronqué.
async function synthetiser(texte, voix, chemin) {
  if (usage.caracteres + texte.length > PLAFOND) {
    throw new Error(`Plafond mensuel atteint (${usage.caracteres.toLocaleString("fr-CA")} / ${PLAFOND.toLocaleString("fr-CA")} caractères). Relancez le mois prochain ou augmentez PLAFOND_MENSUEL.`);
  }
  usage.caracteres += texte.length; envoyesSession += texte.length;
  const id = Math.random().toString(36).slice(2);
  const fichierTexte = join(tmpdir(), `lv-${id}.txt`);
  const partiel = chemin + `.${id}.part`;
  writeFileSync(fichierTexte, texte);
  try {
    for (let essai = 1; ; essai++) {
      try {
        await executer(EDGE_TTS, ["--voice", voix, "--file", fichierTexte, "--write-media", partiel], { timeout: 120000 });
        renameSync(partiel, chemin);
        return;
      } catch (e) {
        rmSync(partiel, { force: true });
        if (essai >= 4) throw new Error(`edge-tts a échoué pour « ${texte.slice(0, 40)}… » : ${e.stderr || e.message}`);
        await dormir(5000 * essai);
      }
    }
  } finally {
    rmSync(fichierTexte, { force: true });
    writeFileSync(USAGE, JSON.stringify(usage));
  }
}

const lireChapitre = (l, c) => JSON.parse(readFileSync(join(RACINE, "public", "livres", codeLivre(l) + ".json"), "utf8")).chapitres[c - 1];
const dossierChapitre = (voix, l, c) => join(AUDIO, voix, codeLivre(l), String(c).padStart(3, "0"));

async function genererChapitre(l, c, voix) {
  const versets = lireChapitre(l, c);
  const dossier = dossierChapitre(voix, l, c);
  mkdirSync(dossier, { recursive: true });
  const travaux = [titreParle(l, c), ...versets.map(texteParle)]
    .map((texte, i) => ({ texte, chemin: join(dossier, String(i).padStart(3, "0") + ".mp3") }))
    .filter((t) => !existsSync(t.chemin));
  // Quelques requêtes en parallèle, sans plus, pour rester raisonnable envers le service.
  const file = [...travaux];
  await Promise.all(Array.from({ length: EN_PARALLELE }, async () => {
    for (let t; (t = file.shift()); ) await synthetiser(t.texte, voix, t.chemin);
  }));
  console.log(`✓ ${LIVRES[l - 1][0]} ${c} — ${travaux.length} fichier(s) générés, ${usage.caracteres.toLocaleString("fr-CA")} caractères ce mois-ci`);
}

// public/audio/index.json : { voix: { "fr-FR-VivienneMultilingualNeural": ["03:25", …] } }.
// L'app le lit pour savoir si un chapitre a son audio, sinon elle prend la voix de secours.
function ecrireIndex() {
  const index = { voix: {} };
  if (!existsSync(AUDIO)) return;
  for (const v of readdirSync(AUDIO, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const liste = [];
    for (let l = 1; l <= 66; l++) {
      const dl = join(AUDIO, v.name, codeLivre(l));
      if (!existsSync(dl)) continue;
      for (const dc of readdirSync(dl).sort()) {
        const c = Number(dc);
        const n = readdirSync(join(dl, dc)).filter((f) => f.endsWith(".mp3")).length;
        if (n === lireChapitre(l, c).length + 1) liste.push(`${codeLivre(l)}:${c}`);
      }
    }
    if (liste.length) index.voix[v.name] = liste;
  }
  writeFileSync(join(AUDIO, "index.json"), JSON.stringify(index));
  console.log(`index.json mis à jour (${Object.entries(index.voix).map(([v, l]) => `${v} : ${l.length} chapitres complets`).join(", ")})`);
}

async function listerVoix() {
  const { stdout } = await executer(EDGE_TTS, ["--list-voices"]);
  const fr = stdout.split("\n").filter((l) => /^fr-(CA|FR)-/.test(l));
  console.log([...fr.filter((l) => l.startsWith("fr-CA")), ...fr.filter((l) => l.startsWith("fr-FR"))].join("\n"));
}

async function echantillons(voix) {
  const ps = lireChapitre(19, 51).slice(2, 6).map(texteParle).join(" ");
  const dossier = join(RACINE, "echantillons");
  mkdirSync(dossier, { recursive: true });
  for (const v of voix) {
    await synthetiser(ps, v, join(dossier, `${v}.mp3`));
    console.log(`✓ echantillons/${v}.mp3`);
  }
}

const [mode, ...args] = process.argv.slice(2);
try {
  if (mode === "voix") await listerVoix();
  else if (mode === "echantillon") await echantillons(args.length ? args : ["fr-CA-SylvieNeural", "fr-CA-JeanNeural", "fr-CA-AntoineNeural", "fr-FR-VivienneMultilingualNeural"]);
  else if (mode === "psaume") { await genererChapitre(19, 51, VOIX); ecrireIndex(); }
  else if (mode === "annee") {
    const [l0, c0] = (args[0] || "3:25").split(":").map(Number);
    const nb = Number(args[1] || 52);
    let p = { livre: l0, chapitre: c0 };
    try {
      for (let i = 0; i < nb; i++) { await genererChapitre(p.livre, p.chapitre, VOIX); p = suivant(p.livre, p.chapitre); }
    } finally { ecrireIndex(); }
  } else if (mode === "menage") {
    // Garde le Psaume 51 + les N chapitres à partir de la position donnée ; supprime le reste
    // (chapitres déjà lus) pour rester sous la limite d'envoi de Vercel (100 Mo).
    const [l0, c0] = (args[0] || "3:25").split(":").map(Number);
    const garder = new Set(["19/051"]);
    let p = { livre: l0, chapitre: c0 };
    for (let i = 0; i < Number(args[1] || 52); i++) { garder.add(`${codeLivre(p.livre)}/${String(p.chapitre).padStart(3, "0")}`); p = suivant(p.livre, p.chapitre); }
    let supprimes = 0;
    for (const v of readdirSync(AUDIO, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const dl of readdirSync(join(AUDIO, v.name))) {
        for (const dc of readdirSync(join(AUDIO, v.name, dl))) {
          if (!garder.has(`${dl}/${dc}`)) { rmSync(join(AUDIO, v.name, dl, dc), { recursive: true }); supprimes++; }
        }
      }
    }
    console.log(`${supprimes} chapitre(s) supprimé(s).`);
    ecrireIndex();
  } else if (mode === "index") ecrireIndex();
  else { console.log("Modes : voix | echantillon [voix…] | psaume | annee [livre:chapitre] [nombre] | index"); process.exitCode = 1; }
} catch (e) {
  console.error("\n✗ " + e.message);
  process.exitCode = 1;
} finally {
  if (envoyesSession) console.log(`\nCaractères envoyés : ${envoyesSession.toLocaleString("fr-CA")} cette fois, ${usage.caracteres.toLocaleString("fr-CA")} / ${PLAFOND.toLocaleString("fr-CA")} ce mois-ci.`);
}
