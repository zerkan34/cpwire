# Module Réunion — installation dans cp|WIRE

Correction de la livraison précédente : elle était en CommonJS et supposait `react-router`.
Ton serveur est en **ESM** et ta navigation se fait par **onglets**. Tout est réaligné.

## Fichiers à copier

```
server/routes/reunion.js              ← nouveau
server/reunionStore.js                ← nouveau
web/src/components/Reunion.jsx        ← nouveau  (components/, pas pages/)
web/src/components/Reunion.css        ← nouveau
web/src/lib/captureAudio.js           ← nouveau  (créer le dossier lib/ si absent)
server/app.js                         ← REMPLACER par la version fournie
web/src/App.jsx                       ← REMPLACER par la version fournie
```

`app.js` et `App.jsx` sont **tes fichiers**, avec seulement les lignes du module ajoutées.

## Ce qui a été modifié dans tes deux fichiers

**server/app.js** — 2 lignes
- ligne 50 : `import { reunionRouter } from "./routes/reunion.js";`
- ligne 1394 : `app.use(reunionRouter({ guard, aiLimiter }));`
  placé **avant** le fallback `/api` 404, sinon la route serait avalée par lui.
  Le router reçoit ton `guard` (routes protégées) et ton `aiLimiter`
  (40 appels / 10 min, la même bride que tes autres appels IA).

**web/src/App.jsx** — 4 lignes
- import paresseux `Reunion`, à côté de `Meetings`
- sous-onglet `{ id: "transcription", label: "Transcription" }` dans `SUBTABS.atelier`,
  juste après « Réunions ». **`Meetings.jsx` n'est pas touché**, ton onglet Réunions existant
  reste tel quel.
- `"transcription"` ajouté au `Set` des sous-onglets masqués au rôle consultation,
  comme `reunions` et `cra`
- le rendu, avec un `PageHero` à la convention de tes autres pages

Résultat : **Atelier → Transcription**.

## Variable d'environnement

`GEMINI_API_KEY` sur Render. Si elle existe déjà pour l'analyse des points bloquants, rien à faire.
Contrôle après déploiement : `/api/reunion/health` doit répondre `"moteur":true`.

## Stockage

`reunionStore.js` utilise `saveBlob` / `restoreBlob` / `persistenceActive` de ton `persist.js`,
donc la même base durable que ta mémoire, sous la clé `reunions`. Il fait un aller-retour de test
au démarrage : si la base ne répond pas, il bascule sur un fichier dans `dataDir()` de `paths.js`,
et en dernier recours sur la mémoire. Le mode retenu apparaît dans les logs Render au démarrage et
sous forme de badge dans la page.

## Point à surveiller au premier essai

Ton `api.js` ne m'a pas été fourni : j'ai supposé que `guard` lit le jeton dans
`Authorization: Bearer <token>`, en le récupérant via `getToken()` que tu exportes déjà.
Si la page affiche des erreurs 401, c'est ce schéma qu'il faut ajuster : la fonction `entetes()`
est en haut de `Reunion.jsx`, trois lignes à modifier. Envoie-moi `api.js` et je fige.

## Utilisation

Chrome ou Edge. Windows : partager **l'écran entier** et cocher **« Partager aussi l'audio du
système »** (fonctionne avec l'application Teams installée). macOS : le son système n'est pas
capturable, ouvrir Teams dans un onglet et partager cet onglet.
