// Lecture du vendredi : étape 1 = Psaume 51, étape 2 = chapitre du jour.
// L'interface et ses comportements reprennent le prototype reference-ui.html.

import PSAUME_51 from "./psaume51.json";
import { LIVRES, TOTAL_CHAPITRES, codeLivre } from "./livres.js";
import { DEFAUT, valide, nom, jourLocal, passageDuJour, marquerLu, annuler, changerPassage, avancement, plusRecent, titreParle } from "./progression.js";
import { creerLecteur, VITESSES } from "./lecteur.js";
import { nettoyerAdresse, lsGet, lsSet, lireServeur, ecrireServeur } from "./synchro.js";

const $ = (id) => document.getElementById(id);
const reduit = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- état ---------- */
let etat = valide(lsGet("lv.etat")) || { ...DEFAUT };
const prefs = Object.assign({ voix: "", vitesse: 1, taille: 1.3 }, lsGet("lv.prefs") || {});
if (!VITESSES[prefs.vitesse]) prefs.vitesse = 1;
const savePrefs = () => lsSet("lv.prefs", prefs);
nettoyerAdresse();

let etape = "psaume";
let psaumeFini = false;
let versets = PSAUME_51;
let lectureCle = null, lectureVersets = null, lectureErreur = false;
let indexAudio = null; // { voix: { nomVoix: ["03:25", …] } }

const jour = () => passageDuJour(etat, jourLocal());
const cleJour = () => { const p = jour(); return p.livre + ":" + p.chapitre; };

/* ---------- progression partagée ---------- */
let syncStatut = "…";

function enregistrer(nouvel) {
  nouvel.majLe = new Date().toISOString();
  etat = nouvel; lsSet("lv.etat", etat);
  envoyer();
}

async function envoyer() {
  try {
    const r = await ecrireServeur(etat);
    syncStatut = "ok";
    if (r) appliquerDistant(r);
  } catch { syncStatut = "horsligne"; }
  renderSync();
}

function appliquerDistant(r) {
  if (plusRecent(etat, r) !== r || r === etat) return;
  const avant = cleJour();
  etat = r; lsSet("lv.etat", etat);
  if (cleJour() !== avant && etape === "lecture" && !lecteur.etat.playing) { resetLecture(); allerEtape("lecture", false); }
  renderTout();
}

async function synchroniser() {
  try {
    const distant = await lireServeur();
    syncStatut = "ok";
    if (!distant || Date.parse(etat.majLe) > Date.parse(distant.majLe)) await envoyer();
    else appliquerDistant(distant);
  } catch { syncStatut = "horsligne"; }
  renderSync();
}

/* ---------- textes et audio ---------- */
const cache = {};
function chargerLivre(l) {
  if (!cache[l]) {
    cache[l] = fetch("/livres/" + codeLivre(l) + ".json")
      .then((r) => { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .catch((e) => { delete cache[l]; throw e; });
  }
  return cache[l];
}

const voixDisponibles = () => Object.keys((indexAudio && indexAudio.voix) || {});
const voixActive = () => { const v = voixDisponibles(); return v.includes(prefs.voix) ? prefs.voix : v[0]; };

// URL du MP3 d'un verset, ou null si l'audio du chapitre n'a pas été généré.
// Tant que l'index n'est pas connu, on tente l'audio : le lecteur bascule sur la voix de secours en cas d'échec.
function urlAudioPour(l, c) {
  const v = voixActive();
  const cle = codeLivre(l) + ":" + c;
  if (indexAudio && (!v || !indexAudio.voix[v].includes(cle))) return null;
  const voix = v || "fr-FR-VivienneMultilingualNeural";
  const base = `/audio/${voix}/${codeLivre(l)}/${String(c).padStart(3, "0")}/`;
  return (i) => base + String(i + 1).padStart(3, "0") + ".mp3";
}

function resetLecture() { lectureCle = null; lectureVersets = null; lectureErreur = false; }

function preparerLecture() {
  const p = jour(), cle = p.livre + ":" + p.chapitre;
  if (lectureCle === cle && (lectureVersets || !lectureErreur)) return;
  lectureCle = cle; lectureVersets = null; lectureErreur = false;
  chargerLivre(p.livre).then((d) => {
    if (lectureCle !== cle) return;
    lectureVersets = d.chapitres[p.chapitre - 1] || [];
    if (etape === "lecture") { lecteur.versetsCharges(lectureVersets); versets = lectureVersets; renderLecteur(); }
    mettreEnCacheHorsLigne();
  }).catch(() => {
    if (lectureCle !== cle) return;
    lectureErreur = true;
    if (etape === "lecture") renderLecteur();
  });
}

// Demande au service worker de garder le chapitre du jour (texte + audio) pour le Wi-Fi capricieux.
function mettreEnCacheHorsLigne() {
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller || !lectureVersets) return;
  const p = jour();
  const urls = ["/livres/" + codeLivre(p.livre) + ".json"];
  const f = urlAudioPour(p.livre, p.chapitre);
  if (f && indexAudio) for (let i = -1; i < lectureVersets.length; i++) urls.push(f(i));
  navigator.serviceWorker.controller.postMessage({ type: "garder", urls });
}

/* ---------- lecteur ---------- */
const lecteur = creerLecteur({
  audio: $("audio"),
  onVerset: (i, defiler = true) => surligner(i, defiler),
  onFin: finLecture,
  onChange: renderPlayer,
});

function chargerPassageDansLecteur() {
  if (etape === "psaume") {
    lecteur.charger({ cle: "19:51", titre: titreParle(19, 51), versets: PSAUME_51, urlAudio: urlAudioPour(19, 51) });
  } else {
    const p = jour();
    lecteur.charger({ cle: p.livre + ":" + p.chapitre, titre: titreParle(p.livre, p.chapitre), versets: lectureVersets, urlAudio: urlAudioPour(p.livre, p.chapitre) });
  }
}

function surligner(i, defiler) {
  const items = $("verses").children;
  for (let k = 0; k < items.length; k++) items[k].classList.toggle("now", k === i);
  if (defiler && i >= 0 && items[i]) items[i].scrollIntoView({ behavior: reduit() ? "auto" : "smooth", block: "center" });
}

function finLecture() {
  surligner(-2, false);
  if (etape === "psaume") psaumeFini = true;
  renderEtapes(); renderFin();
  const fin = $("finish");
  fin.scrollIntoView({ behavior: reduit() ? "auto" : "smooth", block: "center" });
  const b = fin.querySelector("button");
  if (b) b.focus({ preventScroll: true });
}

/* ---------- affichage ---------- */
function renderEntete() {
  const d = new Date();
  const fmt = (x) => x.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
  if (d.getDay() === 5) $("dateLine").textContent = "Aujourd’hui, " + fmt(d);
  else { const v = new Date(d); v.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); $("dateLine").textContent = "Prochaine étude : " + fmt(v); }
  const a = avancement(etat, jourLocal());
  $("journeyFill").style.width = Math.max(1, (a.lus / a.total) * 100).toFixed(1) + "%";
  $("journeyText").textContent = a.lus.toLocaleString("fr-CA") + " chapitres lus sur " + TOTAL_CHAPITRES.toLocaleString("fr-CA") + " depuis Genèse 1 · " + a.pourcent + " %";
}

function renderEtapes() {
  const p = jour();
  $("stepLectureTitle").textContent = nom(p.livre, p.chapitre);
  const s1 = $("step-psaume"), s2 = $("step-lecture");
  if (etape === "psaume") s1.setAttribute("aria-current", "step"); else s1.removeAttribute("aria-current");
  if (etape === "lecture") s2.setAttribute("aria-current", "step"); else s2.removeAttribute("aria-current");
  s1.classList.toggle("done", psaumeFini);
  s2.classList.toggle("done", p.fait);
  s1.querySelector(".num").textContent = psaumeFini ? "✓" : "1";
  s2.querySelector(".num").textContent = p.fait ? "✓" : "2";
}

function renderLecteur() {
  const ol = $("verses"); ol.textContent = "";
  const yt = $("ytLink");
  if (etape === "psaume") {
    versets = PSAUME_51;
    $("readTitle").textContent = "Psaume 51";
    $("readMeta").textContent = PSAUME_51.length + " versets · Louis Segond 1910";
    yt.hidden = false;
    if (etat.youtube) { yt.href = etat.youtube; yt.textContent = "Ouvrir notre vidéo YouTube ↗"; }
    else { yt.href = "https://www.youtube.com/results?search_query=psaume+51"; yt.textContent = "Ouvrir une vidéo du Psaume 51 sur YouTube ↗"; }
  } else {
    const p = jour();
    yt.hidden = true;
    $("readTitle").textContent = nom(p.livre, p.chapitre);
    versets = lectureVersets;
    if (!versets) {
      $("readMeta").textContent = "Louis Segond 1910";
      const li = document.createElement("li"); li.className = "loading";
      li.textContent = lectureErreur ? "Le chapitre n’a pas pu se charger. Vérifiez la connexion Internet, puis touchez l’étape 2 pour réessayer." : "Chargement du chapitre…";
      ol.appendChild(li);
      renderFin(); renderPlayer();
      return;
    }
    $("readMeta").textContent = versets.length + " versets · Louis Segond 1910";
  }
  versets.forEach((t, i) => {
    const li = document.createElement("li"); li.className = "verse"; li.tabIndex = 0;
    li.setAttribute("aria-label", "Verset " + (i + 1));
    const n = document.createElement("span"); n.className = "vn"; n.textContent = i + 1;
    const v = document.createElement("span"); v.className = "vt"; v.textContent = t;
    li.append(n, v);
    li.addEventListener("click", () => lecteur.allerA(i));
    li.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); lecteur.allerA(i); } });
    ol.appendChild(li);
  });
  if (lecteur.etat.current >= 0) surligner(lecteur.etat.current, false);
  renderFin(); renderPlayer();
}

function bouton(cls, texte, fn) {
  const b = document.createElement("button"); b.type = "button"; b.className = "btn " + cls; b.textContent = texte;
  b.addEventListener("click", fn); return b;
}
function para(cls, texte) { const p = document.createElement("p"); if (cls) p.className = cls; p.textContent = texte; return p; }

function renderFin() {
  const f = $("finish"); f.textContent = ""; f.className = "finish";
  const p = jour();
  if (etape === "psaume") {
    f.hidden = false;
    f.append(para("big", psaumeFini ? "Fin du psaume." : "Après le psaume"));
    const r = document.createElement("div"); r.className = "row";
    r.append(bouton("btn-primary", "Continuer : " + nom(p.livre, p.chapitre) + " →", () => allerEtape("lecture", true)));
    f.append(r);
    return;
  }
  if (!lectureVersets && !p.fait) { f.hidden = true; return; }
  f.hidden = false;
  const r = document.createElement("div"); r.className = "row";
  if (p.fait) {
    f.classList.add("is-done");
    f.append(para("big", "✓ " + nom(p.livre, p.chapitre) + " est lu."));
    f.append(para("", "Vendredi prochain, l’application ouvrira " + nom(etat.livre, etat.chapitre) + "."));
    r.append(bouton("btn-ghost", "Annuler", () => { enregistrer(annuler(etat)); renderTout(); }));
  } else {
    const n = marquerLu(etat, jourLocal());
    f.append(para("big", "Fin de la lecture"));
    f.append(para("", "Quand vous avez terminé, marquez le chapitre comme lu. Vendredi prochain, ce sera " + nom(n.livre, n.chapitre) + "."));
    r.append(bouton("btn-ok", "Marquer " + nom(p.livre, p.chapitre) + " comme lu", () => {
      if (jour().fait) return;
      enregistrer(marquerLu(etat, jourLocal()));
      renderTout();
      const b = $("finish").querySelector("button"); if (b) b.focus({ preventScroll: true });
    }));
  }
  f.append(r);
}

const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>';

function renderPlayer() {
  const e = lecteur.etat, btn = $("playBtn");
  const sansVoix = e.mode === "secours" && !lecteur.synthDisponible;
  const pret = !!versets && !sansVoix;
  btn.disabled = !pret; $("restartBtn").disabled = !pret;
  if (e.playing) { btn.innerHTML = ICON_PAUSE + "<span>Pause</span>"; btn.setAttribute("aria-label", "Mettre en pause"); }
  else { btn.innerHTML = ICON_PLAY + "<span>" + (e.started ? "Reprendre" : "Écouter") + "</span>"; btn.setAttribute("aria-label", e.started ? "Reprendre la lecture" : "Écouter le texte"); }
  $("statusTitle").textContent = etape === "psaume" ? "Psaume 51" : nom(jour().livre, jour().chapitre);
  let ligne = "Prêt à écouter";
  if (!versets) ligne = "Chargement…";
  else if (e.playing && e.current < 0) ligne = "Annonce du passage";
  else if (e.started || e.current >= 0) ligne = "Verset " + (Math.max(0, e.current) + 1) + " sur " + versets.length;
  $("statusLine").textContent = ligne;
  const vt = VITESSES[lecteur.vitesse()].t;
  $("speedBtn").textContent = vt; $("speedBtn").setAttribute("aria-label", "Vitesse de lecture : " + vt);
  $("secoursBadge").hidden = e.mode !== "secours";
  const n = $("notice");
  if (sansVoix) { n.textContent = "La lecture à voix haute n’est pas disponible pour ce passage dans ce navigateur. Lisez à tour de rôle : touchez un verset pour le surligner."; n.hidden = false; }
  else n.hidden = true;
}

function renderReglages() {
  const sb = $("setBook");
  if (!sb.options.length) LIVRES.forEach((b, i) => { const o = document.createElement("option"); o.value = i + 1; o.textContent = b[0]; sb.appendChild(o); });
  const p = jour();
  const cible = p.fait ? { livre: etat.livre, chapitre: etat.chapitre } : p;
  if (document.activeElement !== sb && document.activeElement !== $("setChap")) {
    sb.value = cible.livre; remplirChapitres(cible.livre); $("setChap").value = cible.chapitre;
  }
  if (document.activeElement !== $("setYt")) $("setYt").value = etat.youtube || "";
  const voix = voixDisponibles(), sel = $("setVoice");
  $("voiceField").hidden = voix.length < 2;
  if (voix.length >= 2 && sel.options.length !== voix.length) {
    sel.textContent = "";
    voix.forEach((v) => { const o = document.createElement("option"); o.value = v; o.textContent = v.replace(/^fr-(CA|FR)-/, "").replace(/(Multilingual)?Neural$/, "") + " (" + v.slice(0, 5) + ")"; sel.appendChild(o); });
  }
  if (voix.length >= 2) sel.value = voixActive();
  renderSync();
}
function remplirChapitres(l) {
  const sc = $("setChap"); sc.textContent = "";
  for (let c = 1; c <= LIVRES[l - 1][1]; c++) { const o = document.createElement("option"); o.value = c; o.textContent = "Chapitre " + c; sc.appendChild(o); }
}
function renderSync() {
  const t = { "…": "Progression partagée avec la famille.", ok: "✓ Progression partagée avec la famille.", horsligne: "Hors ligne : la progression sera partagée au retour de la connexion." };
  $("syncLine").textContent = t[syncStatut];
}

function renderTout() {
  renderEntete(); renderEtapes(); renderReglages();
  if (etape === "lecture") { preparerLecture(); if (!lecteur.etat.playing) renderLecteur(); else renderFin(); }
  else renderFin();
  renderPlayer();
}

function allerEtape(e, lancer) {
  etape = e;
  if (e === "lecture") preparerLecture();
  versets = e === "psaume" ? PSAUME_51 : lectureVersets;
  chargerPassageDansLecteur();
  renderEtapes(); renderLecteur();
  window.scrollTo({ top: 0, behavior: reduit() ? "auto" : "smooth" });
  // Lancé dans le clic : l'annonce peut démarrer même si le texte du chapitre charge encore.
  if (lancer) lecteur.jouer();
}

/* ---------- événements ---------- */
$("step-psaume").addEventListener("click", () => allerEtape("psaume", false));
$("step-lecture").addEventListener("click", () => { if (lectureErreur) resetLecture(); allerEtape("lecture", false); });
$("playBtn").addEventListener("click", () => { lecteur.etat.playing ? lecteur.pause() : lecteur.jouer(); });
$("restartBtn").addEventListener("click", () => lecteur.recommencer());
$("speedBtn").addEventListener("click", () => {
  prefs.vitesse = (lecteur.vitesse() + 1) % VITESSES.length; savePrefs();
  lecteur.setVitesse(prefs.vitesse);
});
$("setVoice").addEventListener("change", (e) => { prefs.voix = e.target.value; savePrefs(); chargerPassageDansLecteur(); renderPlayer(); });
$("sizeUp").addEventListener("click", () => { prefs.taille = Math.min(2, +(prefs.taille + 0.1).toFixed(2)); appliquerTaille(); });
$("sizeDown").addEventListener("click", () => { prefs.taille = Math.max(1, +(prefs.taille - 0.1).toFixed(2)); appliquerTaille(); });
function appliquerTaille() { document.documentElement.style.setProperty("--read-size", prefs.taille + "rem"); savePrefs(); }

$("setBook").addEventListener("change", (e) => remplirChapitres(+e.target.value));
$("setPassageBtn").addEventListener("click", () => {
  const l = +$("setBook").value, c = +$("setChap").value;
  enregistrer(changerPassage(etat, l, c));
  resetLecture();
  if (etape === "lecture") allerEtape("lecture", false);
  renderTout();
  flash("setPassageMsg");
});
$("setYtBtn").addEventListener("click", () => {
  const v = $("setYt").value.trim();
  if (v && !/^https:\/\/[^\s"<>]+$/.test(v)) { $("setYtMsg").textContent = "Le lien doit commencer par https://"; flash("setYtMsg"); return; }
  $("setYtMsg").textContent = "Enregistré";
  enregistrer({ ...etat, youtube: v.slice(0, 400) });
  if (etape === "psaume") renderLecteur();
  flash("setYtMsg");
});
function flash(id) { const el = $(id); el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 2500); }

document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.tagName === "SUMMARY" || t.isContentEditable)) return;
  if ($("playBtn").disabled) return;
  e.preventDefault();
  lecteur.etat.playing ? lecteur.pause() : lecteur.jouer();
});

// Nouvelle journée ou retour sur l'onglet : on relit la progression (autre appareil, lendemain).
let dernierJour = jourLocal();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  synchroniser();
  if (jourLocal() !== dernierJour) { dernierJour = jourLocal(); if (!lecteur.etat.playing) { resetLecture(); renderTout(); if (etape === "lecture") allerEtape("lecture", false); } }
});
window.addEventListener("online", synchroniser);
setInterval(() => { if (document.visibilityState === "visible" && !lecteur.etat.playing) synchroniser(); }, 5 * 60000);

/* ---------- démarrage ---------- */
appliquerTaille();
lecteur.setVitesse(prefs.vitesse);
chargerPassageDansLecteur();
preparerLecture();
renderTout();
renderLecteur();
synchroniser();

fetch("/audio/index.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : { voix: {} }))
  .catch(() => ({ voix: {} }))
  .then((idx) => {
    indexAudio = idx && idx.voix ? idx : { voix: {} };
    if (!lecteur.etat.started) chargerPassageDansLecteur();
    renderReglages(); renderPlayer();
    mettreEnCacheHorsLigne();
  });

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then(() => mettreEnCacheHorsLigne()).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", mettreEnCacheHorsLigne);
}
