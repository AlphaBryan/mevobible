import { describe, it, expect } from "vitest";
import { GET, PUT } from "../api/progression.js";
import { DEFAUT } from "../src/progression.js";

// Sans stockage Blob configuré, la fonction utilise un stockage en mémoire (développement local).
const URL_API = "http://mevobible.test/api/progression";
const lire = () => GET(new Request(URL_API));
const ecrire = (corps, origine = "http://mevobible.test") => PUT(new Request(URL_API, {
  method: "PUT", body: JSON.stringify(corps), headers: { "Content-Type": "application/json", ...(origine ? { Origin: origine } : {}) },
}));

describe("API progression", () => {
  it("404 tant que rien n'est enregistré", async () => {
    expect((await lire()).status).toBe(404);
  });

  it("refuse une écriture qui ne vient pas du site", async () => {
    expect((await ecrire(DEFAUT, "https://autre-site.example")).status).toBe(403);
    expect((await ecrire(DEFAUT, null)).status).toBe(403);
  });

  it("enregistre puis relit l'état, sans aucun code", async () => {
    const e = { ...DEFAUT, chapitre: 26, majLe: "2026-10-30T10:00:00.000Z" };
    expect((await ecrire(e)).status).toBe(200);
    expect(await (await lire()).json()).toMatchObject({ livre: 3, chapitre: 26 });
  });

  it("garde la version la plus récente en cas de conflit", async () => {
    const vieux = { ...DEFAUT, chapitre: 20, majLe: "2026-10-29T10:00:00.000Z" };
    expect(await (await ecrire(vieux)).json()).toMatchObject({ chapitre: 26 });
  });

  it("rejette un état invalide", async () => {
    expect((await ecrire({ livre: 99 })).status).toBe(400);
  });
});
