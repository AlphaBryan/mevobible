#!/usr/bin/env node
// Produit les icônes PNG de la PWA à partir de public/icone.svg (nécessite Playwright).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/icone.svg", "utf8");
const navigateur = await chromium.launch();
const page = await navigateur.newPage();
for (const [taille, fichier, marge] of [[180, "icone-180.png", 0], [192, "icone-192.png", 0], [512, "icone-512.png", 0], [512, "icone-maskable-512.png", 0.12]]) {
  await page.setViewportSize({ width: taille, height: taille });
  // Version « maskable » : fond plein et dessin réduit pour survivre au découpage rond d'Android.
  const interieur = marge ? svg.replace('rx="96"', 'rx="0"') : svg;
  await page.setContent(`<body style="margin:0;background:${marge ? "#2c3b88" : "transparent"}"><div style="width:${taille}px;height:${taille}px;display:grid;place-items:center">${interieur.replace("<svg ", `<svg width="${taille * (1 - 2 * marge)}" height="${taille * (1 - 2 * marge)}" `)}</div></body>`);
  await page.screenshot({ path: "public/" + fichier, omitBackground: !marge });
}
await navigateur.close();
console.log("✓ icônes générées");
