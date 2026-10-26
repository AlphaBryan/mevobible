import { describe, it, expect } from "vitest";
import { suivant, marquerLu, annuler, passageDuJour, avancement, changerPassage, valide, plusRecent, titreParle, rang, DEFAUT } from "../src/progression.js";
import { LIVRES, TOTAL_CHAPITRES } from "../src/livres.js";

const VENDREDI = "2026-10-30";
const SAMEDI = "2026-10-31";

describe("chapitre suivant", () => {
  it("avance dans le même livre", () => {
    expect(suivant(3, 25)).toEqual({ livre: 3, chapitre: 26 });
  });
  it("Lévitique 27 → Nombres 1", () => {
    expect(suivant(3, 27)).toEqual({ livre: 4, chapitre: 1 });
  });
  it("Apocalypse 22 → Genèse 1", () => {
    expect(suivant(66, 22)).toEqual({ livre: 1, chapitre: 1 });
  });
  it("parcourt les 1 189 chapitres et revient au début", () => {
    let p = { livre: 1, chapitre: 1 };
    for (let i = 0; i < TOTAL_CHAPITRES; i++) p = suivant(p.livre, p.chapitre);
    expect(p).toEqual({ livre: 1, chapitre: 1 });
    expect(TOTAL_CHAPITRES).toBe(1189);
    expect(LIVRES).toHaveLength(66);
  });
});

describe("marquer lu, annuler, bascule au lendemain", () => {
  const depart = { ...DEFAUT }; // Lévitique 25

  it("le jour même, le chapitre lu reste affiché, coché", () => {
    const e = marquerLu(depart, VENDREDI);
    expect(e).toMatchObject({ livre: 3, chapitre: 26, termineLe: VENDREDI, precedent: { livre: 3, chapitre: 25 } });
    expect(passageDuJour(e, VENDREDI)).toEqual({ livre: 3, chapitre: 25, fait: true });
  });

  it("dès le lendemain, l'app affiche le chapitre suivant", () => {
    const e = marquerLu(depart, VENDREDI);
    expect(passageDuJour(e, SAMEDI)).toEqual({ livre: 3, chapitre: 26, fait: false });
  });

  it("marquer deux fois le même jour ne fait avancer qu'une fois", () => {
    const e = marquerLu(marquerLu(depart, VENDREDI), VENDREDI);
    expect(e).toMatchObject({ livre: 3, chapitre: 26 });
  });

  it("annuler revient exactement à l'état d'avant", () => {
    const e = annuler(marquerLu(depart, VENDREDI));
    expect(e).toMatchObject({ livre: 3, chapitre: 25, termineLe: null, precedent: null });
    expect(passageDuJour(e, VENDREDI)).toEqual({ livre: 3, chapitre: 25, fait: false });
  });

  it("Lévitique 27 marqué lu → Nombres 1 le lendemain", () => {
    const e = marquerLu(changerPassage(depart, 3, 27), VENDREDI);
    expect(passageDuJour(e, SAMEDI)).toEqual({ livre: 4, chapitre: 1, fait: false });
  });

  it("Apocalypse 22 marqué lu → Genèse 1 le lendemain", () => {
    const e = marquerLu(changerPassage(depart, 66, 22), VENDREDI);
    expect(passageDuJour(e, SAMEDI)).toEqual({ livre: 1, chapitre: 1, fait: false });
  });

  it("changer le passage dans les Réglages efface le « lu aujourd'hui »", () => {
    const e = changerPassage(marquerLu(depart, VENDREDI), 5, 1);
    expect(passageDuJour(e, VENDREDI)).toEqual({ livre: 5, chapitre: 1, fait: false });
  });
});

describe("pourcentage de progression", () => {
  it("Lévitique 25 à lire : 114 chapitres lus · 10 %", () => {
    expect(rang(3, 25)).toBe(115);
    expect(avancement(DEFAUT, VENDREDI)).toEqual({ lus: 114, total: 1189, pourcent: 10 });
  });
  it("Lévitique 25 marqué lu aujourd'hui : 115 lus", () => {
    expect(avancement(marquerLu(DEFAUT, VENDREDI), VENDREDI).lus).toBe(115);
    expect(avancement(marquerLu(DEFAUT, VENDREDI), SAMEDI).lus).toBe(115);
  });
  it("Genèse 1 : 0 % ; Apocalypse 22 lu : 100 %", () => {
    expect(avancement(changerPassage(DEFAUT, 1, 1), VENDREDI)).toMatchObject({ lus: 0, pourcent: 0 });
    expect(avancement(marquerLu(changerPassage(DEFAUT, 66, 22), VENDREDI), VENDREDI)).toMatchObject({ lus: 1189, pourcent: 100 });
  });
});

describe("validation et conflits", () => {
  it("rejette les états invalides", () => {
    expect(valide(null)).toBeNull();
    expect(valide({ livre: 3, chapitre: 28 })).toBeNull();
    expect(valide({ livre: 67, chapitre: 1 })).toBeNull();
  });
  it("nettoie un lien YouTube non https", () => {
    expect(valide({ ...DEFAUT, youtube: "javascript:alert(1)" }).youtube).toBe("");
  });
  it("la modification la plus récente gagne", () => {
    const a = { ...DEFAUT, majLe: "2026-10-30T10:00:00.000Z" };
    const b = { ...DEFAUT, chapitre: 26, majLe: "2026-10-30T11:00:00.000Z" };
    expect(plusRecent(a, b)).toBe(b);
    expect(plusRecent(b, a)).toBe(b);
  });
});

describe("annonce parlée", () => {
  it("Psaume 51. / Lévitique, chapitre 25.", () => {
    expect(titreParle(19, 51)).toBe("Psaume 51.");
    expect(titreParle(3, 25)).toBe("Lévitique, chapitre 25.");
  });
});
