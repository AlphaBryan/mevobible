// Lecteur verset par verset. Deux modes :
//  - "audio"   : MP3 pré-générés (voix naturelle), un fichier par verset, 000.mp3 = annonce du titre ;
//  - "secours" : synthèse vocale du navigateur, si l'audio du chapitre n'existe pas (ou échoue).
// Index -1 = l'annonce (« Lévitique, chapitre 25. »), 0…n-1 = les versets.
//
// Sur iPhone/iPad, l'audio doit démarrer pendant le geste de l'utilisateur : jouer() appelle
// audio.play() de façon synchrone, sur un seul élément <audio> réutilisé pour tous les versets.

export const VITESSES = [
  { t: "Lent", audio: 0.85, synth: 0.8 },
  { t: "Normal", audio: 1, synth: 0.95 },
  { t: "Rapide", audio: 1.18, synth: 1.12 },
];

export function creerLecteur({ audio, onVerset, onFin, onChange }) {
  const synth = typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined" ? window.speechSynthesis : null;

  // passage : { cle, titre, versets (null tant que le JSON charge), urlAudio(i) | null }
  let passage = null;
  const etat = { playing: false, started: false, current: -1, idx: 0, mode: "audio", attente: false };
  let token = 0;
  let vitesse = 1;
  let voixSynth = [];
  let voixSynthChoisie = "";
  let wakeLock = null;
  const prechargees = new Set();

  const n = () => (passage && passage.versets ? passage.versets.length : 0);
  const notifier = () => onChange && onChange();

  /* ---------- écran allumé ---------- */
  function demanderEveil() {
    try {
      if (navigator.wakeLock && !wakeLock) navigator.wakeLock.request("screen").then((w) => { wakeLock = w; w.addEventListener("release", () => { wakeLock = null; }); }).catch(() => {});
    } catch { /* refus toléré */ }
  }
  function libererEveil() { try { if (wakeLock) wakeLock.release(); } catch { /* déjà libéré */ } wakeLock = null; }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && etat.playing) demanderEveil(); });

  /* ---------- mode audio ---------- */
  function precharger(i) {
    if (!passage || !passage.urlAudio || i >= n()) return;
    const url = passage.urlAudio(i);
    if (prechargees.has(url)) return;
    prechargees.add(url);
    fetch(url).then((r) => r.blob()).catch(() => prechargees.delete(url));
  }

  function jouerAudio(i) {
    const tok = ++token;
    if (synth) synth.cancel();
    etat.current = i; etat.idx = Math.max(0, i);
    onVerset(i);
    const url = passage.urlAudio(i);
    if (!audio.src.endsWith(url)) audio.src = url;
    else audio.currentTime = 0;
    audio.defaultPlaybackRate = VITESSES[vitesse].audio;
    audio.playbackRate = VITESSES[vitesse].audio;
    const p = audio.play();
    if (p && p.catch) p.catch((e) => {
      if (tok !== token || !etat.playing) return;
      if (e && e.name === "NotAllowedError") { suspendre(); return; } // le navigateur exige un clic
      if (e && e.name === "AbortError") return;
      basculerSecours(i);
    });
    precharger(i + 1); precharger(i + 2);
    notifier();
  }

  audio.addEventListener("ended", () => { if (etat.playing && etat.mode === "audio") avancer(etat.current); });
  audio.addEventListener("error", () => { if (etat.playing && etat.mode === "audio" && audio.getAttribute("src")) basculerSecours(etat.current); });

  // Un MP3 manque ou ne se charge pas : on continue au même verset avec la voix de l'appareil.
  function basculerSecours(i) {
    if (!synth) { suspendre(); return; }
    etat.mode = "secours";
    audio.removeAttribute("src"); audio.load();
    notifier();
    parler(i);
  }

  /* ---------- mode secours (synthèse du navigateur) ---------- */
  function chargerVoixSynth() {
    if (!synth) return;
    const fr = (synth.getVoices() || []).filter((v) => (v.lang || "").toLowerCase().replace("_", "-").startsWith("fr"));
    const score = (v) => {
      let s = 0;
      if ((v.lang || "").toLowerCase().includes("ca")) s += 3;
      if (/natural|premium|enhanced|neural|google|amélior/i.test(v.name)) s += 2;
      if (v.localService) s += 1;
      return s;
    };
    voixSynth = fr.sort((a, b) => score(b) - score(a));
  }
  if (synth) {
    chargerVoixSynth();
    if (typeof synth.addEventListener === "function") synth.addEventListener("voiceschanged", chargerVoixSynth);
    else synth.onvoiceschanged = chargerVoixSynth;
  }
  const texteParle = (t) => t.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();

  function parler(i) {
    const tok = ++token;
    if (synth.speaking || synth.pending) synth.cancel();
    const u = new SpeechSynthesisUtterance(i < 0 ? passage.titre : texteParle(passage.versets[i]));
    const v = voixSynth.find((x) => x.voiceURI === voixSynthChoisie) || voixSynth[0];
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "fr-CA";
    u.rate = VITESSES[vitesse].synth;
    u.onend = () => { if (tok === token && etat.playing) avancer(i); };
    u.onerror = (e) => {
      if (e && (e.error === "interrupted" || e.error === "canceled")) return;
      if (tok === token && etat.playing) avancer(i);
    };
    etat.current = i; etat.idx = Math.max(0, i); etat.startedAt = Date.now(); etat.stuck = 0;
    onVerset(i);
    try { synth.resume(); } catch { /* rien */ }
    synth.speak(u);
    notifier();
  }
  // Certains navigateurs « oublient » parfois l'événement de fin : on relance si plus rien ne parle.
  setInterval(() => {
    if (!synth || !etat.playing || etat.mode !== "secours" || etat.attente) return;
    if (synth.speaking || synth.pending) { etat.stuck = 0; return; }
    if (Date.now() - etat.startedAt < 1500) return;
    if (++etat.stuck >= 2) avancer(etat.current);
  }, 1000);

  /* ---------- commun ---------- */
  function lire(i) {
    if (etat.mode === "audio" && passage.urlAudio) jouerAudio(i);
    else if (synth) { etat.mode = "secours"; parler(i); }
    else suspendre();
  }

  function avancer(i) {
    const suivant = i + 1;
    if (!passage.versets) { etat.attente = true; etat.current = suivant; notifier(); return; } // le texte charge encore
    if (suivant >= n()) { fin(); return; }
    lire(suivant);
  }

  function fin() {
    token++;
    etat.playing = false; etat.started = false; etat.idx = 0; etat.current = -1; etat.attente = false;
    libererEveil();
    onFin();
    notifier();
  }

  function suspendre() {
    etat.playing = false; token++;
    audio.pause();
    if (synth) synth.cancel();
    libererEveil();
    notifier();
  }

  return {
    etat,
    synthDisponible: !!synth,

    // Change de passage (arrête la lecture en cours).
    charger(p) {
      suspendre();
      passage = p;
      etat.started = false; etat.idx = 0; etat.current = -1; etat.attente = false;
      etat.mode = p.urlAudio ? "audio" : "secours";
      audio.removeAttribute("src");
      prechargees.clear();
      if (p.urlAudio) { precharger(-1); precharger(0); }
      notifier();
    },

    // Le texte du chapitre vient d'arriver : reprend si la lecture attendait après l'annonce.
    versetsCharges(versets) {
      if (!passage) return;
      passage.versets = versets;
      if (etat.attente && etat.playing) { etat.attente = false; lire(0); }
      notifier();
    },

    jouer() {
      if (!passage) return;
      if (!passage.urlAudio && !synth) return;
      etat.playing = true;
      demanderEveil();
      // Reprise au milieu d'un MP3 en pause : on continue où on était.
      if (etat.mode === "audio" && etat.started && audio.getAttribute("src") && audio.currentTime > 0 && !audio.ended && etat.current >= 0) {
        audio.playbackRate = VITESSES[vitesse].audio;
        audio.play().catch(() => basculerSecours(etat.current));
        notifier();
        return;
      }
      const depart = etat.started ? etat.idx : -1;
      etat.started = true;
      lire(depart);
    },

    pause: suspendre,

    recommencer() {
      suspendre();
      etat.started = false; etat.idx = 0; etat.current = -1;
      if (passage && passage.urlAudio) etat.mode = "audio";
      onVerset(-2);
      this.jouer();
    },

    allerA(i) {
      etat.idx = i; etat.started = true;
      if (etat.playing) lire(i);
      else {
        etat.current = i;
        audio.removeAttribute("src");
        onVerset(i, false);
        notifier();
      }
    },

    vitesse: () => vitesse,
    setVitesse(v) {
      vitesse = v;
      if (etat.mode === "audio") { audio.defaultPlaybackRate = VITESSES[v].audio; audio.playbackRate = VITESSES[v].audio; }
      else if (etat.playing) parler(etat.current);
      notifier();
    },
  };
}
