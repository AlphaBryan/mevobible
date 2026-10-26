#!/usr/bin/env node
// Tests de bout en bout dans de vrais moteurs de navigateur (Playwright) :
// Chromium (Chrome/Edge), WebKit (Safari), Firefox, et émulations iPhone / Android.
// Prérequis : npm run build && npx vite preview --port 4173 (lancé par ce script).
//
//   npm run test:navigateurs

import { chromium, webkit, firefox, devices } from "playwright";
import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";

const BASE = "http://localhost:4173";
const resultats = [];
const espaces = (t) => t.replace(/\s+/g, " ").trim();

async function test(nom, fn) {
  const t0 = Date.now();
  try { await fn(); resultats.push(["✓", nom, Date.now() - t0]); console.log(`✓ ${nom}`); }
  catch (e) { resultats.push(["✗", nom, Date.now() - t0, e.message]); console.log(`✗ ${nom}\n    ${e.message.split("\n").slice(0, 4).join("\n    ")}`); }
}

// Accélère l'audio pendant les tests (la vraie vitesse reste celle du bouton dans l'app).
const ACCELERER = `(() => {
  const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "playbackRate");
  Object.defineProperty(HTMLMediaElement.prototype, "playbackRate", {
    get() { return this.__vraie ?? d.get.call(this); },
    set(v) { this.__vraie = v; d.set.call(this, window.__x ? Math.min(16, v * window.__x) : v); },
  });
})();`;

// Synthèse vocale simulée (moteurs sans voix en mode sans écran) : note ce qui est « dit ».
const FAUSSE_SYNTHESE = `(() => {
  window.__dits = [];
  const synth = { speaking: false, pending: false, _u: null,
    getVoices: () => [{ name: "Amélie", lang: "fr-CA", voiceURI: "amelie", localService: true }],
    speak(u) { this._u = u; this.speaking = true; window.__dits.push(u.text); clearTimeout(this._t);
      this._t = setTimeout(() => { this.speaking = false; if (this._u === u) u.onend && u.onend({}); }, 40); },
    cancel() { clearTimeout(this._t); const u = this._u; this._u = null; this.speaking = false; if (u && u.onerror) u.onerror({ error: "interrupted" }); },
    resume() {}, pause() {}, addEventListener() {} };
  Object.defineProperty(window, "speechSynthesis", { value: synth });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
})();`;

const etat = (page) => page.evaluate(() => ({
  statut: document.getElementById("statusLine").textContent,
  bouton: document.getElementById("playBtn").textContent,
  src: document.getElementById("audio").getAttribute("src") || "",
  paused: document.getElementById("audio").paused,
  t: document.getElementById("audio").currentTime,
  rate: document.getElementById("audio").playbackRate,
  now: [...document.querySelectorAll(".verse")].findIndex((v) => v.classList.contains("now")),
  secours: !document.getElementById("secoursBadge").hidden,
}));

async function attendre(page, cond, ms = 15000, msg = "condition") {
  const fin = Date.now() + ms;
  for (;;) {
    const e = await etat(page);
    if (cond(e)) return e;
    if (Date.now() > fin) throw new Error(`Délai dépassé (${msg}) : ${JSON.stringify(e)}`);
    await page.waitForTimeout(100);
  }
}

async function reinitialiserServeur(etatDepart) {
  await fetch(`${BASE}/api/progression`, { method: "PUT", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ ...etatDepart, majLe: new Date().toISOString() }) });
}
const DEPART = { livre: 3, chapitre: 25, termineLe: null, precedent: null, youtube: "" };

async function parcoursComplet(type, nomNav, options = {}) {
  const nav = await type.launch();
  const ctx = await nav.newContext({ ...options, locale: "fr-CA" });
  await ctx.addInitScript(ACCELERER);
  const page = await ctx.newPage();
  const erreursJs = [];
  page.on("pageerror", (e) => erreursJs.push(e.message));
  await reinitialiserServeur(DEPART);
  await page.goto(`${BASE}/`);
  await page.evaluate(() => { window.__x = 6; });

  await test(`[${nomNav}] en-tête : date et progression`, async () => {
    const date = espaces(await page.textContent("#dateLine"));
    const jour = new Date().getDay();
    assert.ok(jour === 5 ? date.startsWith("Aujourd’hui, vendredi") : date.startsWith("Prochaine étude : vendredi"), date);
    assert.equal(espaces(await page.textContent("#journeyText")), "114 chapitres lus sur 1 189 depuis Genèse 1 · 10 %");
    assert.equal(await page.getAttribute("#step-psaume", "aria-current"), "step");
    assert.equal(espaces(await page.textContent("#stepLectureTitle")), "Lévitique 25");
  });

  await test(`[${nomNav}] pas de défilement horizontal`, async () => {
    const debord = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(debord <= 0, `débordement de ${debord}px`);
  });

  await test(`[${nomNav}] Psaume 51 lu en entier avec la voix naturelle, surlignage et défilement`, async () => {
    const vus = [];
    await page.exposeFunction("__vu", (i) => vus.push(i)).catch(() => {});
    await page.evaluate(() => {
      new MutationObserver(() => {
        const i = [...document.querySelectorAll(".verse")].findIndex((v) => v.classList.contains("now"));
        if (i >= 0) window.__vu(i);
      }).observe(document.getElementById("verses"), { subtree: true, attributes: true, attributeFilter: ["class"] });
    });
    await page.click("#playBtn");
    const e0 = await attendre(page, (e) => e.src.endsWith("/19/051/000.mp3") && !e.paused, 8000, "annonce du titre");
    assert.equal(e0.secours, false);
    // Vérifie le centrage pendant la lecture d'un verset du milieu.
    await attendre(page, (e) => e.now === 11, 90000, "verset 12");
    await page.waitForTimeout(900);
    const centre = await page.evaluate(() => {
      const r = document.querySelector(".verse.now").getBoundingClientRect();
      return Math.abs((r.top + r.bottom) / 2 - innerHeight / 2) / innerHeight;
    });
    assert.ok(centre < 0.2, `verset en cours loin du centre (${(centre * 100).toFixed(0)} % de l'écran)`);
    await page.waitForSelector("#finish .big:text('Fin du psaume.')", { timeout: 120000 });
    const uniques = [...new Set(vus)];
    assert.deepEqual(uniques, Array.from({ length: 21 }, (_, i) => i), `ordre surligné : ${uniques}`);
    assert.equal(espaces(await page.textContent("#step-psaume .num")), "✓");
  });

  await test(`[${nomNav}] « Continuer » passe à la lecture du jour et lance l'audio en un clic`, async () => {
    await page.click("#finish button:has-text('Continuer : Lévitique 25 →')");
    await attendre(page, (e) => e.src.includes("/03/025/") && !e.paused, 8000, "lecture Lévitique 25");
    assert.equal(await page.getAttribute("#step-lecture", "aria-current"), "step");
    assert.equal(await page.getAttribute("#step-psaume", "aria-current"), null);
    assert.equal(espaces(await page.textContent("#readTitle")), "Lévitique 25");
    await attendre(page, (e) => e.statut === "Verset 1 sur 55", 15000, "verset 1");
  });

  await test(`[${nomNav}] Pause puis Reprendre au même endroit`, async () => {
    await page.evaluate(() => { window.__x = 1; });
    // Pause au milieu d'un long verset (le 10e), pour que la reprise ne tombe pas sur une fin de verset.
    await page.click(".verse:nth-child(10)");
    await attendre(page, (e) => e.src.endsWith("/010.mp3") && e.t > 1.5, 8000, "verset 10 en cours");
    await page.click("#playBtn");
    const e1 = await attendre(page, (e) => e.paused && e.bouton.includes("Reprendre"), 3000, "pause");
    await page.waitForTimeout(800);
    const e2 = await etat(page);
    assert.equal(e2.t, e1.t, "la position a bougé pendant la pause");
    await page.click("#playBtn");
    const e3 = await attendre(page, (e) => !e.paused && e.t > e1.t, 4000, "reprise");
    assert.ok(e3.t - e1.t < 3, "la reprise n'est pas repartie du même endroit");
    assert.equal(e3.src, e1.src, "la reprise a changé de verset");
  });

  await test(`[${nomNav}] clic sur un verset pendant la lecture`, async () => {
    await page.click(".verse:nth-child(10)");
    await attendre(page, (e) => e.src.endsWith("/03/025/010.mp3") && e.statut === "Verset 10 sur 55" && e.now === 9 && !e.paused, 5000, "saut au verset 10");
  });

  await test(`[${nomNav}] vitesse Lent / Normal / Rapide pendant la lecture`, async () => {
    const lu = async () => page.evaluate(() => document.getElementById("audio").__vraie ?? document.getElementById("audio").playbackRate);
    await page.click("#speedBtn"); assert.equal(espaces(await page.textContent("#speedBtn")), "Rapide"); assert.equal(await lu(), 1.18);
    await page.click("#speedBtn"); assert.equal(espaces(await page.textContent("#speedBtn")), "Lent"); assert.equal(await lu(), 0.85);
    await page.click("#speedBtn"); assert.equal(espaces(await page.textContent("#speedBtn")), "Normal"); assert.equal(await lu(), 1);
    assert.equal((await etat(page)).paused, false, "la lecture s'est arrêtée");
  });

  await test(`[${nomNav}] barre d'espace = pause / lecture`, async () => {
    await page.locator("h1").click();
    await page.keyboard.press("Space");
    await attendre(page, (e) => e.paused, 3000, "pause espace");
    await page.keyboard.press("Space");
    await attendre(page, (e) => !e.paused, 3000, "lecture espace");
  });

  await test(`[${nomNav}] Recommencer repart de l'annonce`, async () => {
    await page.click("#restartBtn");
    await attendre(page, (e) => e.src.endsWith("/03/025/000.mp3") && !e.paused, 4000, "recommencer");
  });

  await test(`[${nomNav}] fin du chapitre → Marquer comme lu → Annuler (et partage serveur)`, async () => {
    await page.evaluate(() => { window.__x = 8; });
    await page.click(".verse:nth-child(55)");
    await page.waitForSelector("#finish button:has-text('Marquer Lévitique 25 comme lu')", { timeout: 60000 });
    await page.click("#finish button:has-text('Marquer Lévitique 25 comme lu')");
    await page.waitForSelector("#finish .big:text('✓ Lévitique 25 est lu.')");
    assert.match(espaces(await page.textContent("#finish")), /Vendredi prochain, l’application ouvrira Lévitique 26\./);
    assert.equal(espaces(await page.textContent("#step-lecture .num")), "✓");
    assert.equal(espaces(await page.textContent("#journeyText")), "115 chapitres lus sur 1 189 depuis Genèse 1 · 10 %");
    await page.waitForTimeout(500);
    const serveur = await (await fetch(`${BASE}/api/progression`)).json();
    assert.equal(serveur.chapitre, 26, "le serveur n'a pas reçu la progression");
    await page.click("#finish button:has-text('Annuler')");
    await page.waitForSelector("#finish button:has-text('Marquer Lévitique 25 comme lu')");
    await page.waitForTimeout(500);
    assert.equal((await (await fetch(`${BASE}/api/progression`)).json()).chapitre, 25);
  });

  assert.deepEqual(erreursJs, [], "erreurs JavaScript : " + erreursJs.join(" | "));
  await nav.close();
}

async function testsSecours(type, nomNav) {
  const nav = await type.launch();
  // Service worker bloqué : sinon il répondrait avant la simulation de MP3 manquant.
  const ctx = await nav.newContext({ locale: "fr-CA", serviceWorkers: "block" });
  await ctx.addInitScript(FAUSSE_SYNTHESE);
  const page = await ctx.newPage();

  await test(`[${nomNav}] voix de secours quand l'audio d'un chapitre n'existe pas (Genèse 1)`, async () => {
    await reinitialiserServeur({ ...DEPART, livre: 1, chapitre: 1 });
    await page.goto(`${BASE}/`);
    await page.click("#step-lecture");
    await page.waitForSelector(".verse");
    assert.equal(await page.isVisible("#secoursBadge"), true, "badge « Voix de secours » absent");
    await page.click("#playBtn");
    await page.waitForFunction(() => window.__dits.length >= 3);
    const dits = await page.evaluate(() => window.__dits.slice(0, 2));
    assert.deepEqual(dits, ["Genèse, chapitre 1.", "Au commencement, Dieu créa les cieux et la terre."]);
    assert.equal((await etat(page)).src, "", "un MP3 a été demandé");
    await page.click("#playBtn");
  });

  await test(`[${nomNav}] bascule en voix de secours si un MP3 manque en cours de lecture`, async () => {
    await reinitialiserServeur(DEPART);
    await page.route("**/audio/**/03/025/003.mp3", (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto(`${BASE}/`);
    await page.click("#step-lecture");
    await page.waitForSelector(".verse");
    assert.equal(await page.isVisible("#secoursBadge"), false);
    await page.click(".verse:nth-child(2)");
    await page.click("#playBtn");
    await attendre(page, (e) => e.src.endsWith("/03/025/002.mp3"), 5000, "verset 2 en MP3");
    await page.waitForFunction(() => window.__dits.some((t) => t.startsWith("Pendant six années tu ensemenceras")), null, { timeout: 30000 });
    assert.equal(await page.isVisible("#secoursBadge"), true, "badge « Voix de secours » absent");
    await page.click("#playBtn");
  });
  await nav.close();
}

async function testPartage() {
  const nav = await chromium.launch();
  await test("[Partage] un appareil marque « lu », l'autre le voit", async () => {
    await reinitialiserServeur(DEPART);
    const a = await (await nav.newContext()).newPage();
    const b = await (await nav.newContext()).newPage();
    await b.goto(`${BASE}/`);
    await a.goto(`${BASE}/`);
    await a.click("#step-lecture");
    await a.click("#finish button:has-text('Marquer Lévitique 25 comme lu')", { timeout: 10000 }).catch(async () => {
      await a.evaluate(() => document.querySelector(".verse:last-child").click());
      await a.click("#finish button:has-text('Marquer Lévitique 25 comme lu')");
    });
    await a.waitForTimeout(500);
    await b.reload();
    await b.waitForFunction(() => document.querySelector("#step-lecture .num").textContent === "✓");
    // Un ancien lien avec ?f=… est nettoyé : l'adresse reste simplement le site.
    await b.goto(BASE + "/?f=ancien-code");
    await b.waitForFunction(() => location.search === "");
    assert.match(await b.textContent("#syncLine"), /partagée avec la famille/);
  });
  await test("[Partage] la fonction refuse une écriture venant d'un autre site", async () => {
    const r = await fetch(`${BASE}/api/progression`, { method: "PUT", headers: { "Content-Type": "application/json", Origin: "https://autre-site.example" }, body: JSON.stringify(DEPART) });
    assert.equal(r.status, 403);
  });
  await nav.close();
}

async function testHorsLigne() {
  const nav = await chromium.launch();
  await test("[Hors ligne] l'app, le Psaume 51 et le chapitre du jour s'ouvrent sans réseau", async () => {
    await reinitialiserServeur(DEPART);
    const ctx = await nav.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => page.reload());
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await page.waitForTimeout(6000); // laisse le service worker télécharger le chapitre du jour
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForSelector(".verse");
    await page.click("#step-lecture");
    await page.waitForSelector(".verse:nth-child(55)");
    const enCache = await page.evaluate(async () => {
      const ok = [];
      for (const u of ["/audio/fr-FR-VivienneMultilingualNeural/19/051/021.mp3", "/audio/fr-FR-VivienneMultilingualNeural/03/025/055.mp3"]) ok.push(!!(await caches.match(u)));
      return ok;
    });
    assert.deepEqual(enCache, [true, true], "audio absent du cache");
  });
  await nav.close();
}

/* ---------- lancement ---------- */
const serveur = spawn("npx", ["vite", "preview", "--port", "4173", "--strictPort"], { stdio: "ignore" });
for (let i = 0; i < 50; i++) { try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
try {
  const quoi = process.argv[2] || "tout";
  if (["tout", "chrome"].includes(quoi)) await parcoursComplet(chromium, "Chrome bureau", { viewport: { width: 1280, height: 900 } });
  if (["tout", "safari"].includes(quoi)) await parcoursComplet(webkit, "Safari bureau (WebKit)", { viewport: { width: 1280, height: 900 } });
  if (["tout", "firefox"].includes(quoi)) await parcoursComplet(firefox, "Firefox bureau", { viewport: { width: 1280, height: 900 } });
  if (["tout", "iphone"].includes(quoi)) await parcoursComplet(webkit, "iPhone SE 375 px (WebKit)", { ...devices["iPhone SE"] });
  if (["tout", "android"].includes(quoi)) await parcoursComplet(chromium, "Android Pixel 7 (émulé)", { ...devices["Pixel 7"] });
  if (["tout", "secours"].includes(quoi)) { await testsSecours(chromium, "Chrome"); await testsSecours(webkit, "Safari"); }
  if (["tout", "partage"].includes(quoi)) await testPartage();
  if (["tout", "horsligne"].includes(quoi)) await testHorsLigne();
} finally {
  serveur.kill();
}
const echecs = resultats.filter((r) => r[0] === "✗");
console.log(`\n${resultats.length - echecs.length} / ${resultats.length} tests réussis`);
process.exit(echecs.length ? 1 : 0);
