# cp|WIRE — passation

Document destiné à la personne qui reprend l'outil. Rédigé le 13 août 2026.

Il ne remplace pas le README, il répond à ce que le README ne dit pas : comment ça tourne,
qu'est-ce qui casse, et par quoi commencer.

---

## À FAIRE AVANT TOUTE CHOSE

**Changer le mot de passe du compte propriétaire.**

Le fichier `server/.env.example`, versionné sur GitHub, contenait le mot de passe réel du compte
propriétaire **en clair**. Il est donc dans l'historique des commits, et l'effacer aujourd'hui ne
l'en retire pas : quiconque a accès au dépôt peut le retrouver.

Le fichier est corrigé, mais **le mot de passe lui-même doit être changé** dans Render ›
Environment › `AUTH_PASSWORD`. Cinq minutes, et c'est la première chose à faire.

Profitez-en pour vérifier que le jeton Jira (`JIRA_API_TOKEN`) et les secrets Microsoft n'ont
jamais transité par un fichier versionné. À ma connaissance, non.

---

## Ce que c'est

Trois surfaces, une seule application Node qui les sert toutes.

**cp|WIRE** — le cockpit de pilotage. Lit Jira (environ 4 800 tickets), consolide, et affiche
l'état du portefeuille : ce qui bouge, ce qui bloque, la charge, les échéances, les SLA. Produit
les comptes rendus et les livrables PDF à la charte Armonie.

**ShareFly** — l'espace documentaire, `/sharefly/`. Un catalogue de 14 333 documents avec leurs
métadonnées, adossé à SharePoint pour le contenu réel. Organisé en huit espaces, dont Avant-vente
et RH.

**Atelier de flux** — `/flux/`, l'outil interactif du projet Belmet ERP26 : diagramme de flux
éditable, GANTT, livrables client.

---

## Comment ça tourne

```
Jira Cloud  ──API──►  server/ (Node 20 + Express, ESM)  ──►  web/ (React + Vite)
                          │
                          ├── Neon Postgres   mémoire, sessions, réunions, engagements
                          ├── SharePoint      contenu des documents ShareFly
                          ├── Microsoft Graph envoi du digest du soir
                          └── WeasyPrint      génération des PDF (Python)
```

Hébergement : **Render**, image Docker (`Dockerfile` à la racine), build automatique sur push
vers `main`. Le Dockerfile installe Node, Python et WeasyPrint, puis construit le front.

Démarrage local :

```
cd server && npm install && npm start     # port 4000
cd web    && npm install && npm run dev   # port 5173, proxy /api vers 4000
```

Tests : `cd server && npm test` — 78 tests, 77 passent, 1 ignoré (il exige `web/dist`, donc un
`npm run build` préalable). **Un rouge est une régression, pas du bruit.**

---

## Ce qui casse, et ce que ça fait

| si ça tombe | conséquence | l'application reste utilisable ? |
|---|---|---|
| Jira | tous les écrans sont vides | non, c'est la source unique |
| Neon Postgres | repli sur fichier, puis mémoire | oui, mais les données ne survivent plus au redéploiement |
| SharePoint | ShareFly affiche le catalogue, n'ouvre plus les fichiers | oui, partiellement |
| Microsoft Graph | plus de digest ni de confirmation par e-mail | oui |
| clé IA | assistant et transcription muets | oui |

Le point le plus sensible est **la persistance**. Vérifiez que `DATABASE_URL` est bien renseignée
sur Render : sans elle, tout retombe sur `DATA_DIR`, et sans disque persistant monté, la mémoire
de l'outil est réinitialisée à chaque déploiement. Un bandeau le signale dans l'interface, mais
il faut le regarder.

---

## Configuration

73 variables d'environnement. Elles sont toutes documentées et classées par criticité dans
`server/.env.example`. Les quatre premières sections suffisent à faire tourner l'outil.

Contrôle rapide après un déploiement : ouvrir `/api/health` (doit répondre `{"ok":true}`) puis,
connecté, `/api/health/detail`, qui indique si Jira, l'IA, Microsoft et la persistance sont
branchés.

---

## Ce qu'il faut savoir avant de toucher au code

**L'architecture impose trois sources uniques.** Elles ont coûté cher à mettre en place, ne les
contournez pas :

- `shared/texte.js` — normalisation de texte. `cle()` pour comparer, `libelle()` pour afficher.
  Ne redéfinissez jamais un `norm` local : il en existait vingt-deux, avec quatre comportements
  différents, et c'est ce qui faisait diverger les chiffres d'un écran à l'autre.
- `shared/groupes.js` — familles de catégories de tickets.
- `shared/armonie-palette.js` — la charte. Une couleur se change **ici et nulle part ailleurs**.

**Le pipeline PDF est verrouillé.** `server/pdf/safe_fetch.py` interdit à WeasyPrint de charger
la moindre ressource externe. Ne le retirez pas : sans lui, un HTML envoyé par un utilisateur
peut faire lire un fichier du serveur et le renvoyer dans le PDF. C'était le cas, c'est démontré,
c'est fermé.

**Les tests de sécurité ne sont pas décoratifs.** `server/test/securite.test.js` et
`server/test/acces-public.test.js` vérifient que les rôles restreints le restent et qu'aucune
surface n'est publique. S'ils passent au rouge, quelque chose d'important a été ouvert.

**Les tests doivent être insensibles au temps.** Trois tests du radar d'échéances ont viré au
rouge tout seuls parce qu'ils codaient en dur des dates devenues passées. Les fonctions
concernées acceptent désormais une date de référence injectable. Gardez ce réflexe.

---

## Les trente premiers jours

**Semaine 1.** Changer le mot de passe propriétaire. Vérifier `DATABASE_URL`. Lancer les tests et
constater le vert. Faire un déploiement de bout en bout pour valider la chaîne.

**Semaine 2.** Prendre en main les trois surfaces en usage réel : un récap du soir, une réunion
transcrite, un livrable PDF généré. C'est le meilleur moyen de comprendre l'outil.

**Semaine 3.** Lire `AUDIT-FINAL.md`, section « ce qui reste ouvert ». Rien n'y est urgent, mais
tout y est daté et expliqué.

**Semaine 4.** Le ménage du dépôt, si ce n'est pas déjà fait : voir `nettoyage-depot.sh`.

---

## Ce que personne d'autre ne sait

Point d'honnêteté, parce que c'est le vrai risque d'une passation.

L'outil a été conçu et développé par une seule personne, pour son propre usage, puis élargi.
Le README le dit encore : « ton tableau de bord personnel ». Cela signifie que :

- certaines conventions ne sont écrites nulle part ailleurs que dans le code (les commentaires
  sont abondants et volontairement explicatifs, lisez-les) ;
- il n'y a pas de deuxième personne qui sache déployer ou diagnostiquer ;
- les comptes tiers (Jira, SharePoint, Neon, Render, clés IA) sont rattachés à des accès
  personnels qu'il faut transférer.

**La liste des accès à transférer** est à établir avec le partant avant son départ, elle n'est
pas dans le dépôt et ne doit pas y être. Au minimum : Render, Neon, GitHub, le jeton Jira, les
enregistrements d'application Microsoft, et les clés IA.

---

## Où trouver quoi

```
server/app.js               montage des routes, point d'entrée de lecture
server/auth-core.js         authentification, rôles, sessions
server/jira.js              tout ce qui touche à Jira
server/sharefly.js          ShareFly
server/digest.js            le point du soir
server/engagements.js       registre des actions et décisions
server/pdf/                 génération PDF (Python, WeasyPrint)
shared/                     les trois sources uniques
web/src/App.jsx             navigation et état global
web/src/components/         60 écrans
web/src/lib/                socle partagé du front
```

Les fichiers portent des commentaires qui expliquent **pourquoi** le code est ainsi, pas ce qu'il
fait. C'est là que se trouve l'essentiel de ce qui n'est pas transmissible autrement.
