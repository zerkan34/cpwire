# CPwire — cockpit de pilotage du chef de projet (Jira → tableau de bord)

Ton tableau de bord personnel : il interroge Jira via son API, consolide tous tes
projets, et affiche en continu **à faire / en cours / bloqués / en retard / terminés**,
avec une carte par projet et l'avancement global. Conçu comme outil de pilotage perso.

```
  Jira Cloud
     │  (API REST, jeton côté serveur)
     ▼
  server/  (Node + Express)  ── normalise, met en cache, expose /api/portfolio
     │  (JSON)
     ▼
  web/     (React + Vite)    ── KPIs, cartes projet, filtres, table des tickets
```

L'identité visuelle reprend celle de ta synthèse portefeuille (indigo / or).

---

## 1. Prérequis

- **Node.js 18 ou plus** (`node --version`).
- Un compte Jira Cloud avec accès aux projets à suivre.

## 2. Récupérer un jeton d'API Jira

1. Va sur https://id.atlassian.com/manage-profile/security/api-tokens
2. « Créer un jeton d'API », nomme-le (ex. *Cockpit*), copie la valeur.
3. Garde ton e-mail Atlassian et l'URL de ton instance (ex. `https://armonie.atlassian.net`).

> Le jeton reste **uniquement côté serveur** (fichier `server/.env`, jamais commité).
> Il n'est jamais envoyé au navigateur.

## 3. Configurer & lancer le backend

```bash
cd server
cp .env.example .env        # puis édite .env avec tes valeurs Jira
npm install
npm start                   # API sur http://localhost:4000
```

Vérifie : http://localhost:4000/api/health → `{ "ok": true, "jiraConfigured": true, ... }`

> Sans Jira configuré, l'API renvoie un **jeu de démonstration** : tu peux voir l'écran
> tourner immédiatement, puis brancher Jira ensuite.

## 4. Lancer le frontend

```bash
cd web
cp .env.example .env        # laisse VITE_API_BASE vide en local
npm install
npm run dev                 # interface sur http://localhost:5173
```

Ouvre http://localhost:5173 — le cockpit charge le portefeuille et se rafraîchit
via le bouton « Actualiser depuis Jira ».

---

## 5. Adapter à tes projets

Tout est centralisé :

- **Quels projets** : `PROJECTS` dans `server/.env` (ex. `TEDL,TDSS,TIMA,TDIA,PTAF,ERP26`).
- **Quels tickets** : variable `JQL` dans `server/.env` pour une requête sur mesure
  (par défaut : tout ce qui n'est pas terminé + ce qui est passé en « Terminé » sur 14 jours).
- **Noms de dossiers** : table `DOSSIERS` dans `server/config.js`
  (préfixe de clé → libellé lisible, ex. `TDIA → DIAPAR`).
- **Détection des blocages** : fonction `bucketFromStatus` dans `server/config.js`
  (statuts « bloqué / on hold / en attente », libellés, drapeau d'obstacle).

## 6. Déploiement (quand tu veux le sortir du poste)

Le plus simple pour un usage perso :

- **Backend** sur [Render](https://render.com) ou [Railway](https://railway.app) (service Node) :
  - Build : `npm install` · Start : `npm start` · Racine : `server/`
  - Renseigne les variables d'environnement (les mêmes que `.env`).
- **Frontend** sur [Vercel](https://vercel.com) ou [Netlify](https://netlify.com) :
  - Racine : `web/` · Build : `npm run build` · Sortie : `dist`
  - Variable `VITE_API_BASE` = l'URL publique de ton backend.

### Sécurité (important pour un outil perso exposé)

- Active **`ACCESS_TOKEN`** dans `server/.env` (un secret long). Le frontend l'envoie
  via `VITE_ACCESS_TOKEN`. Sans le bon jeton, l'API renvoie 401.
- Restreins le CORS à ton domaine front en production (dans `server/index.js`,
  remplace `cors()` par `cors({ origin: "https://ton-domaine" })`).
- Ne commite jamais les fichiers `.env`.

---

## 7. Suite logique (déjà câblé pour évoluer)

- **Génération de CR COPIL** : la sortie `/api/portfolio` contient tout le nécessaire
  (avancement, à faire, bloqués, retards par dossier) pour produire un compte rendu.
  Brancher l'API Claude (ou CARL AI en interne) sur ce JSON suffit à générer la synthèse.
- **Au-delà de Jira** : ajouter un module par source (Teams, Outlook, GitLab) dans
  `server/` puis fusionner dans l'agrégat — le frontend ne change pas.
- **Rafraîchissement programmé** : un simple cron qui appelle `/api/portfolio?refresh=1`.

## Variante Atlassian Forge

Si tu veux zéro hébergement et que ça reste centré Jira, l'alternative est une **app
Forge** (le jeton et l'exécution sont gérés par Atlassian, l'UI vit dans Jira). C'est
plus simple à exploiter mais moins libre qu'un cockpit autonome — d'où le choix de
Node + React ici, plus adapté à un outil de pilotage personnel extensible.

---

## Fonctions « outil du chef de projet » (v2)

- **Mes tickets surlignés** : les tickets qui te sont assignés (variable `ME`) ressortent
  en or avec le badge « Pour moi », sont triés en tête, et filtrables (« Mes tickets »).
- **Modale ticket** : clic sur une ligne → détail complet, lien Jira, et deux actions :
  - *Rédiger le rapport (IA)* à partir d'une note rapide ;
  - *Envoyer dans Jira* → ajoute le rapport en **commentaire** et (option) passe le ticket
    à « Terminé » (transition). Confirmation demandée avant tout envoi.
- **Récap du jour** (onglet) : ce qui a bougé aujourd'hui, par client, cliquable.
  Bouton **« Formuler le CR journalier de {client} »** → CR rédigé à ta charte,
  aperçu, téléchargeable (.html) ou imprimable en PDF.
- **Compte rendu de réunion** (onglet) : objet, participants, notes, **audio (transcrit)**,
  **images (lues par l'IA)** → CR structuré (objet, décisions D1…, actions, prochaines
  étapes) à ta charte, modifiable et téléchargeable.
- **Historique** (onglet) : journal persistant de tout ce qui est produit / poussé.

### Ce qui nécessite une clé (sinon repli automatique)

| Fonction | Avec clé | Sans clé |
|---|---|---|
| Rédaction CR / rapports | API Claude (`ANTHROPIC_API_KEY`) | gabarit structuré à partir des données |
| Transcription audio | Whisper (`OPENAI_API_KEY`) | coller la transcription manuellement |
| Push Jira (commentaire + statut) | jeton Jira (write) | simulé et journalisé (mode démo) |

L'outil est **pleinement utilisable sans aucune clé** (mode démo + gabarits) ; les clés
ne font qu'améliorer la qualité rédactionnelle et l'automatisation.

### Note de sécurité (push Jira)

L'action « Envoyer dans Jira » **modifie** des données chez le client. Elle est
volontairement protégée par une **confirmation** dans l'interface, et n'agit que sur le
ticket ouvert. Vérifie toujours le rapport avant l'envoi.


---

## Nouveautés CPwire

- **Page d'authentification** : identifiants définis côté serveur (`AUTH_EMAIL` / `AUTH_PASSWORD`
  dans `server/.env`). Une session est ouverte après connexion ; rien n'est stocké en clair côté navigateur.
- **Import Jira exhaustif et vérifié** : par défaut, TOUS les tickets des projets listés dans
  `PROJECTS` sont importés (aucun filtre excluant), avec pagination complète. Le cockpit affiche
  le **nombre de tickets importés par projet** et **t'alerte si un projet configuré remonte 0**
  (clé erronée ou droits manquants).
- **Zéro simulation par défaut** : sans Jira configuré, l'appli affiche un écran de configuration
  (pas de fausses données). Le mode démo n'existe que si tu mets explicitement `ALLOW_DEMO=1`.
- **Fiche dossier éditable** : clique une carte du portefeuille (ex. DIAPAR) → historique court,
  technologies, équipe & contacts (nom, poste, e-mail, statut, côté Client/Armonie). Tu peux
  **ajouter / retirer** des personnes et **tout modifier** ; enregistrement persistant
  (`server/data/dossiers.json`, pré-rempli avec les données connues des 7 dossiers).

### Vérifier que « tout est bien importé »

1. Renseigne les **clés exactes** de tes 7 projets dans `PROJECTS` (Jira > Projet > Paramètres).
2. Connecte-toi : la ligne « Import vérifié — N tickets : TEDL (x) · TDSS (y) … » te donne le détail.
3. Si un projet apparaît dans « projet(s) sans ticket », corrige sa clé ou tes droits d'accès.

---

## Mettre CPwire en ligne (un seul service, sans terminal)

Le serveur sert désormais **aussi l'interface** : il n'y a qu'**un seul service** à déployer.
Ton jeton Jira reste une variable d'environnement privée chez l'hébergeur — il n'est jamais
dans le code ni visible côté navigateur.

### Option recommandée — Render (gratuit), via Blueprint

1. Crée un compte **GitHub** (gratuit) et un compte **Render** (gratuit, « Sign up with GitHub »).
2. Mets ce dossier `pmo-cockpit/` dans un dépôt GitHub (glisser-déposer via « Add file > Upload files »
   sur un nouveau dépôt privé suffit — aucun terminal requis).
3. Sur Render : **New + → Blueprint**, choisis ton dépôt. Render lit `render.yaml` et propose le service `cpwire`.
4. Renseigne les variables privées demandées : `AUTH_EMAIL`, `AUTH_PASSWORD`, `JIRA_BASE_URL`,
   `JIRA_EMAIL`, `JIRA_API_TOKEN` (et, si tu veux la rédaction IA, `ANTHROPIC_API_KEY`).
   Vérifie `PROJECTS` (les clés exactes de tes 7 projets).
5. **Create** → au bout de quelques minutes tu obtiens une URL `https://cpwire-xxxx.onrender.com`.
   Ouvre-la, connecte-toi : c'est en ligne.

> Plan gratuit Render : le service se met en veille après inactivité (premier accès un peu lent).
> Pour un service toujours actif, passe au plan payant (quelques €/mois).

### Autres hébergeurs

Le `Dockerfile` fourni fonctionne aussi sur **Railway**, **Fly.io**, **Scaleway**, un VPS, etc.
Commande équivalente en local avec Docker :
```bash
docker build -t cpwire ./pmo-cockpit
docker run -p 4000:4000 --env-file ./pmo-cockpit/server/.env cpwire
```

### Sécurité quand c'est exposé sur internet

- La **page d'authentification** protège l'accès : garde un `AUTH_PASSWORD` long et unique.
- Ton **jeton Jira** vit uniquement en variable d'environnement côté serveur (privé).
- Si tu héberges, pense à restreindre le CORS au domaine de ton service en production
  (dans `server/index.js`, remplace `cors()` par `cors({ origin: "https://ton-url" })`).

### Lancement local simplifié (un seul process)

Plus besoin de deux terminaux :
```bash
cd web && npm install && npm run build && cd ../server
cp .env.example .env   # renseigne tes valeurs
npm install && npm start   # http://localhost:4000 sert l'app + l'API
```

---

## Fonctions ajoutées (modale ticket, rapports, partage)

- **Lien Jira dans la modale** : « Ouvrir le ticket dans Jira ↗ » — ouvre la vraie page du ticket, quel que soit son statut (terminé, en cours, annulé…).
- **Explication simple** : à l'ouverture d'un ticket, CPwire génère une explication en langage clair (non technique). Mise en cache pour ne pas régénérer (donc ne pas repayer) tant que le ticket n'a pas changé. Nécessite `ANTHROPIC_API_KEY` pour la vraie analyse ; sans clé, repli sur la description du ticket.
- **Rapport de ticket → Jira** : « Rédiger le rapport (IA) » puis « Envoyer dans Jira » (commentaire + passage du statut). Confirmation avant envoi.
- **Rapport journalier par client** (onglet Récap) + **Rapport global** (tous les clients, organisé par client).
- **Partage** sur chaque rapport :
  - « **Partager par Outlook** » — ouvre Outlook avec le rapport (via `mailto`, aucune configuration).
  - « **Déposer sur SharePoint** » (rapport d'un client → son dossier) et « **Envoyer via Outlook (auto)** » — via Microsoft Graph, nécessitent la configuration Microsoft 365 ci-dessous.

## Connexion Microsoft 365 (Outlook + SharePoint) — optionnel

Ces deux fonctions utilisent **Microsoft Graph**. Il faut une **app déclarée dans Azure AD (Entra)** par un administrateur :
1. Entra admin center → App registrations → New registration.
2. API permissions → Microsoft Graph → **Application permissions** : `Mail.Send`, `Sites.ReadWrite.All` → **Grant admin consent**.
3. Certificates & secrets → New client secret.
4. Récupérer : **Tenant ID**, **Client ID**, **Client secret**, et l'ID du site SharePoint (`SP_SITE_ID`).
5. Renseigner dans Render → Environment : `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_SENDER` (adresse expéditrice), `SP_SITE_ID` (et `SP_DRIVE_ID` si besoin).

Tant que ces variables sont vides, les boutons Graph renvoient un message clair « non configuré » — rien n'est simulé.
