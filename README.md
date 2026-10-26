# Lecture du vendredi

Application web pour l'étude biblique familiale du vendredi :

1. **Psaume 51** : prière d'ouverture, lue à voix haute ;
2. **Lecture du jour** : le chapitre suivant de la Bible, dans l'ordre (Genèse 1 → Apocalypse 22, puis on recommence).

Le texte est surligné verset par verset pendant la lecture, et la page défile toute seule. À la fin, un bouton vert « Marquer … comme lu » fait avancer la progression, **partagée entre tous les appareils de la famille**.

- Texte : Louis Segond 1910 (domaine public).
- Voix : voix neuronale Microsoft « Vivienne », **enregistrée à l'avance en MP3**. Elle fonctionne dans tous les navigateurs, sans compte ni réglage.
- Coût : **0 $ par mois** (Vercel Hobby avec stockage Blob inclus, edge-tts gratuit).

---

## Pour la famille

- Ouvrez **https://mevobible.vercel.app** (aucun code, aucun compte).
- Touchez **Écouter**. À la fin du psaume, touchez **Continuer : [chapitre] →**.
- À la fin du chapitre, touchez **Marquer [chapitre] comme lu**. Si c'était une erreur, touchez **Annuler**.
- Raccourcis : **barre d'espace** = lecture/pause ; **toucher un verset** = la lecture saute à ce verset.
- Pour installer l'app comme une application :
  - Chrome ou Edge : icône « Installer » dans la barre d'adresse.
  - Safari (Mac) : Fichier → Ajouter au Dock.
  - iPhone ou iPad : Partager → Sur l'écran d'accueil.

### Changer de chapitre manuellement (semaine sautée, chapitre en plus)

Ouvrez **Réglages** en bas de la page. Sous **Passage du jour**, choisissez le livre et le chapitre, puis touchez **Enregistrer**. Le changement est partagé avec tous les appareils.

---

## Pour l'administrateur

### Installation (une seule fois)

Prérequis : [Node.js](https://nodejs.org) 22 ou plus récent, et Python 3 (déjà présent sur Mac).

```bash
npm install
npm run installer-voix      # installe edge-tts dans .venv/ (pour générer l'audio)
npm run dev                 # app sur http://localhost:5173
```

### Texte biblique

Les fichiers `public/livres/01.json` … `66.json` sont déjà dans le dépôt. Pour les régénérer :

```bash
npm run convertir           # clone BibleCorps/FRA-B-LSG1910-PD-UBS dans source-lsg/ puis convertit
```

Le script vérifie qu'il y a 66 livres et 1 189 chapitres, que la numérotation des versets est continue et qu'aucun marqueur USFM ne reste. Il corrige aussi la coquille de la source au Psaume 119:115. Seul le texte des versets est gardé : introductions, intertitres, références croisées et notes sont exclus.

### Audio (voix naturelle)

Un MP3 par verset (mono, 48 kb/s), plus `000.mp3` pour l'annonce (« Lévitique, chapitre 25. »). Tout est rangé dans `public/audio/<voix>/<livre>/<chapitre>/`.

```bash
npm run audio -- psaume              # Psaume 51 (déjà fait)
npm run audio -- annee 3:25 52       # 52 chapitres à partir de Lévitique 25 (déjà fait)
```

- **Relançable** : les fichiers existants sont sautés. Si vous interrompez la génération (Ctrl+C), relancez la même commande.
- **Compteur** : le script affiche les caractères envoyés et s'arrête avant `PLAFOND_MENSUEL` (900 000 par défaut, variable d'environnement).
- Environ 250 000 caractères et une heure de génération par année.
- Autre voix : `VOIX=fr-CA-SylvieNeural npm run audio -- annee 3:25 52`. Si plusieurs voix sont générées, un choix apparaît dans les Réglages.
- Pour écouter des voix avant de choisir : `npm run audio -- voix` (liste), puis `npm run audio -- echantillon fr-CA-JeanNeural fr-CA-SylvieNeural`.

Si un chapitre n'a pas d'audio, l'app lit avec la voix intégrée de l'appareil et affiche « Voix de secours ».

#### Générer l'année suivante (environ une fois par an)

1. Notez le chapitre affiché dans l'app (par exemple Deutéronome 14, soit livre 5, chapitre 14 ; les numéros des livres sont dans `src/livres.js`).
2. Supprimez l'audio des chapitres déjà lus. C'est nécessaire, car Vercel limite chaque envoi à 100 Mo :
   ```bash
   npm run audio -- menage 5:14 52
   ```
3. Générez les 52 chapitres suivants, puis redéployez :
   ```bash
   npm run audio -- annee 5:14 52
   npx vercel deploy --prod
   ```

### Progression partagée

Un seul enregistrement `{ livre, chapitre, termineLe, precedent, youtube, majLe }` est stocké dans un fichier `progression.json`, dans un stockage **Vercel Blob privé** (inclus gratuitement dans le plan Hobby), derrière la fonction `api/progression.js`.

- **Pas de compte ni de code** : tous ceux qui ouvrent mevobible.vercel.app partagent la même progression (choix de la famille).
- **Protection légère** : la fonction n'accepte une modification que si elle vient du site lui-même (en-tête `Origin`), et elle valide strictement l'état reçu. Le stockage Blob est privé : seul le site peut le lire.
- Chaque appareil garde une copie locale (pour le hors ligne). En cas de conflit, la modification la plus récente (`majLe`) gagne.

### Déploiement (Vercel)

1. `npx vercel login`, puis `npx vercel link` (créez le projet `lecture-du-vendredi`).
2. Stockage privé (une fois) : `npx vercel blob create-store lecture-vendredi-progression --access private -e production --yes`. La variable `BLOB_READ_WRITE_TOKEN` s'ajoute toute seule.
3. `npx vercel deploy --prod`
4. Adresse : https://mevobible.vercel.app (domaine ajouté au projet avec `npx vercel domains add mevobible.vercel.app lecture-du-vendredi`).

**Aucune clé secrète n'est dans le dépôt.** edge-tts n'en utilise pas, et le jeton du stockage Blob ne vit que dans Vercel.

### Tests

```bash
npm test                    # logique : chapitre suivant, marquer lu / annuler, lendemain, %, API
npm run test:navigateurs    # bout en bout : Chrome, Safari (WebKit), Firefox, iPhone et Android émulés,
                            # voix de secours, partage entre appareils, hors ligne
```

### Structure

```
index.html              page (reprend reference-ui.html)
src/style.css           styles du prototype + petits ajouts
src/main.js             interface
src/lecteur.js          lecteur verset par verset (MP3 + voix de secours)
src/progression.js      logique pure de la progression (testée)
src/synchro.js          stockage local + synchronisation serveur
src/livres.js           les 66 livres
api/progression.js      fonction Vercel (progression partagée)
public/sw.js            service worker (hors ligne)
public/livres/          texte, un JSON par livre
public/audio/           MP3 par verset + index.json
scripts/                conversion USFM, génération audio, icônes
tests/                  tests unitaires et navigateurs
```
