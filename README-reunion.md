# Module « Réunion » pour cp|WIRE

Prise de notes automatique à partir du **son qui sort de ton ordinateur** : la voix des
participants Teams est captée, transcrite au fil de l'eau, puis synthétisée en compte rendu.

---

## Contenu du paquet

```
server/routes/reunion.js        ← router Express (transcription, CR, sauvegarde)
server/reunionStore.js          ← stockage : se branche sur la persistance cp|WIRE
web/src/pages/Reunion.jsx       ← la page
web/src/pages/Reunion.css
web/src/lib/captureAudio.js     ← capture du son système + micro, découpage en segments
```

Copie chaque fichier au même endroit dans le repo `zerkan34/cpwire`.

---

## Trois points à toucher

### 1. Monter le router (`server/app.js`)

Le stockage se branche tout seul sur `persist.js` : rien à câbler de plus.

À côté de tes autres `app.use(...)` de routes :

```js
app.use(require('./routes/reunion'));
```

Si tes routes passent par un middleware d'authentification, monte-le avant :

```js
app.use(requireAuth, require('./routes/reunion'));
```

Et si tu veux réutiliser ton limiteur existant (`server/limits.js`), ajoute-le de la même
façon : les routes `/api/reunion/transcribe` et `/api/reunion/cr` appellent un moteur payant,
elles méritent la même protection que tes autres routes IA.

### 2. Déclarer la route côté front (`web/src/App.jsx`)

```jsx
const Reunion = lazy(() => import('./pages/Reunion'));
// …
<Route path="/reunion" element={<Reunion />} />
```

Le `lazy` garde le découpage de bundle que tu as mis en place.

### 3. Ajouter l'entrée dans la barre latérale

```jsx
<NavLink to="/reunion">Réunion</NavLink>
```

---

## Variables d'environnement (Render)

| Variable | Obligatoire | Rôle |
|---|---|---|
| `GEMINI_API_KEY` | oui | clé du moteur de transcription, côté serveur uniquement |
| `GEMINI_MODEL` | non | défaut `gemini-2.5-flash` |
| `REUNION_STORE` | non | force un chemin de fichier au lieu de la base durable |

Si `GEMINI_API_KEY` existe déjà pour l'analyse des points bloquants, il n'y a rien à ajouter.

Vérification après déploiement : `GET /api/reunion/health` doit répondre `{"ok":true,"moteur":true}`.

---

## Utilisation en réunion

1. Ouvrir cp|WIRE dans **Chrome ou Edge**, page Réunion.
2. Renseigner l'intitulé et le dossier.
3. **Prévenir les participants** que la séance est retranscrite.
4. Cliquer sur « Démarrer la capture ». Le navigateur demande quoi partager :
   - **Windows** : choisir **l'écran entier**, puis cocher **« Partager aussi l'audio du système »**.
     C'est ce qui fonctionne avec l'application Teams installée.
   - **macOS** : le son système n'est pas capturable. Ouvrir Teams **dans un onglet Chrome** et
     partager cet onglet avec son audio.
5. Le texte apparaît par tranches d'environ trente secondes.
6. Pendant la séance, poser des repères horodatés (Décision / Action / Note) : ils sont
   transmis au moteur au moment de générer le CR.
7. En fin de réunion : « Arrêter », puis « Générer le compte rendu », puis « Enregistrer ».

---

## Points de conception à connaître

**Le micro est mixé au son système.** Ta propre voix ne passe pas par les haut-parleurs : sans
le micro, tu serais absent de la transcription. La case peut être décochée si tu ne fais
qu'écouter.

**Découpage en segments autonomes.** L'enregistreur est arrêté et relancé toutes les 25 secondes,
au lieu d'utiliser le découpage natif du navigateur qui ne met l'en-tête que dans le premier
morceau et rend les suivants illisibles seuls. Conséquence : une coupure de quelques
millisecondes entre deux segments, qui peut tronquer un mot à la jointure. La fin du segment
précédent est envoyée comme contexte pour limiter l'effet.

**Zéro invention.** La consigne de transcription interdit de compléter ou reformuler, et marque
`[inaudible]` les passages incompréhensibles. La consigne du CR interdit toute date, tout chiffre
et tout nom non prononcés ; un porteur d'action non nommé reste vide plutôt qu'être deviné.

**Brouillon local.** La transcription en cours est mémorisée dans le navigateur : un
rafraîchissement accidentel ne la perd pas. Le bouton « Vider » l'efface.

**Sauvegarde branchée sur ta persistance existante.** `reunionStore.js` cherche dans cet ordre :

1. **Base durable** : il charge `server/persist.js` (ou `db.js`) et utilise ses fonctions de
   sauvegarde par blob. Les réunions vont alors dans la même base Neon que ta mémoire et tes
   sessions, sous la clé `reunions`.
2. **Fichier** : à défaut, il écrit dans `DATA_DIR` (via `server/paths.js` s'il existe), donc sur
   ton disque persistant Render s'il est monté. Écriture atomique, pas de fichier tronqué en cas
   de coupure.
3. **Mémoire** : dernier recours, avec un avertissement au démarrage et un bandeau dans la page.

Le mode retenu est écrit dans les logs au démarrage, à côté de tes autres messages de persistance,
et affiché dans l'interface sous forme de badge « Stockage durable » / « Stockage éphémère ».

**Un point à vérifier au premier démarrage.** Je n'ai pas eu le code de `persist.js` sous les yeux
en écrivant ce module : l'adaptateur reconnaît les conventions de nommage les plus probables
(`dbSaveBlob`/`dbLoadBlob`, `saveBlob`/`loadBlob`, `save`/`load`…). Si tes fonctions portent
d'autres noms, le module bascule proprement en mode fichier **et écrit dans les logs la liste
exacte des fonctions exportées** par ton `persist.js`. Il suffit alors d'ajouter le bon nom dans
`NOMS_SAUVEGARDE` / `NOMS_LECTURE` en haut de `reunionStore.js`. Une ligne, sans rien casser.

L'adaptateur suppose aussi la signature `sauvegarde(cle, valeur)` et `lecture(cle)`. Si la tienne
diffère, les deux appels à modifier sont dans `lireTout` et `ecrireTout`.

---

## Coût et volumétrie

Une heure de réunion représente environ 145 segments de 25 secondes, soit autant d'appels au
moteur. C'est le poste de coût du module. Deux leviers si besoin : allonger `segmentMs` dans
`Reunion.jsx` (moins d'appels, latence d'affichage plus longue), ou mettre en pause pendant les
passages sans intérêt.

---

## Limite honnête

La qualité dépend du son entrant. Une réunion à quatre voix qui se coupent, avec des micros
d'ordinateur portable, donnera une transcription utilisable mais imparfaite, et la séparation
« Locuteur A / B » restera approximative parce qu'elle est déduite du texte, pas d'une vraie
identification des voix. Les repères que tu poses en séance sont ce qui fiabilise le CR : ce sont
les seuls éléments dont l'origine est certaine.
