# Audit final — cp|WIRE, ShareFly, Delivery

13 août 2026. Audit de sortie, sur le dépôt complet.
**78 tests, 77 passent, 1 ignoré à bon escient, zéro échec.**

---

## Deux découvertes majeures, corrigées

### 1. ShareFly et l'Atelier de flux étaient PUBLICS

**C'est le point le plus grave de tout ce que j'ai trouvé sur ce dépôt.**

Le router ShareFly n'avait aucun garde d'authentification. `/flux` était servi en statique, sans
garde non plus. Toute personne connaissant l'URL, sans compte, sans mot de passe, accédait à :

- **`/api/sharefly/catalogue`** : les 14 333 documents avec leurs noms et métadonnées. J'y ai
  compté **78 fichiers au nom manifestement sensible** : « Armonie_PROPOSITION
  COMMERCIALE_TMA_Mode JETONS », « Contrat de jetons », « Proposition rénovation DIAPAR », des
  documents RH.
- **`/api/sharefly/spfile`** : cette route redirige vers le **contenu réel** du fichier dans
  SharePoint.
- **`/flux/`** : les livrables du client Belmet, dossier de cadrage et comptes rendus de comité
  compris.

Les mentions « Accès restreint » affichées sur les espaces Avant-vente et RH n'étaient qu'un
**texte descriptif** dans un tableau JavaScript. Rien, côté serveur, ne les faisait respecter.

**Le correctif n'était pas trivial**, et une première tentative naïve aurait tout cassé. Ces
pages s'ouvrent par une navigation pleine page, qui n'envoie aucun en-tête personnalisé : poser
simplement le garde rendait ShareFly inaccessible, ce que j'ai vérifié avant de livrer (401 sur
la page elle-même).

La solution retenue : un **cookie de session** posé à la connexion, `httpOnly` et
`SameSite=Strict`. Le garde accepte désormais l'en-tête (appels du front) ou le cookie
(navigations pleine page). `SameSite=Strict` ferme la porte au CSRF que l'usage d'un cookie
ouvrirait autrement.

Vérifié de bout en bout : refus sans compte sur les cinq surfaces, accès rétabli une fois
connecté, y compris en navigation directe. Huit tests le verrouillent
(`server/test/acces-public.test.js`).

### 2. Un mot de passe en clair dans le dépôt

`server/.env.example` et `server/env.example`, tous deux versionnés, contenaient le mot de passe
réel du compte propriétaire en clair.

Le `.gitignore` couvrait `.env` et `.env.*`, mais ces fichiers étaient **déjà suivis** par git :
une règle d'ignorance ne détache pas un fichier déjà versionné.

Les deux fichiers sont corrigés, et `.env.example` est devenu un modèle documenté des 73
variables, classées par criticité. **Mais le mot de passe est dans l'historique des commits et y
restera : il doit être changé.** C'est la première ligne de `PASSATION.md`.

Je dois reconnaître que mon audit précédent était passé à côté : je cherchais des jetons
Atlassian et des URL Postgres, pas un mot de passe dans un fichier d'exemple.

---

## Périmètre 1 — cp|WIRE

**Solide.** 78 tests, sécurité reprise en profondeur lors des passes précédentes : deux failles
fermées et prouvées par l'expérience (lecture de fichiers via le rendu PDF, authentification qui
s'ouvrait en cas de variable manquante), rôles cohérents, sessions expirantes, CORS strict en
production, hachage scrypt de l'état de l'art.

**Architecture assainie.** 19 composants supprimés sur 70, doublons éliminés (`norm` : 22
définitions, aujourd'hui zéro), trois sources uniques partagées serveur et front.

**Reste ouvert, sans urgence :** les 42 états du composant racine (les deux causes réelles de
lenteur sont traitées), 271 classes CSS à vérifier écran par écran, et l'interface qui porte
encore l'ancienne charte — neuf lignes suffiraient, mais c'est un choix visuel.

---

## Périmètre 2 — ShareFly

**Le problème d'accès est réglé** (voir plus haut). Les fichiers illisibles aussi : les blobs
étaient créés sans type MIME et tout passait par une iframe, y compris les `.docx`.

**Ce qui reste fragile :**

Le catalogue est un **fichier JSON de 3,1 Mo versionné dans le dépôt**
(`server/public/sharefly/catalogue.json`). Il est donc figé au dernier commit : il ne reflète
l'état réel de SharePoint qu'au moment où quelqu'un le régénère. Personne ne sait à quelle
fréquence il faut le faire, ni comment. **C'est le premier point à documenter avec le partant.**

Le fichier fait par ailleurs 3,1 Mo chargés au démarrage de la page, ce qui est lourd.

---

## Périmètre 3 — Delivery

Delivery n'est pas une application : c'est un **espace documentaire dans ShareFly**, aux côtés de
Clients, Avant-vente, Pilotage CDP, Boîte à outils, Réglementaire, Partenaires, RH et Archives.

Son cas illustre le constat central de cet audit : **la séparation des espaces est déclarative,
pas appliquée.** Les huit espaces sont des étiquettes de filtrage dans l'interface. Un compte
authentifié voit tout, y compris Avant-vente et RH, quel que soit son rôle.

Depuis le correctif, il faut au moins un compte. Mais **entre un compte en consultation et le
compte propriétaire, aucune différence sur ShareFly.**

**Recommandation, non implémentée faute d'arbitrage :** rattacher chaque espace à un rôle
minimum, et filtrer côté serveur dans `/api/sharefly/catalogue`. Techniquement une demi-journée.
Ce qui manque n'est pas le code, c'est la décision : qui a le droit de voir Avant-vente et RH.
Cette décision appartient à Armonie, pas à moi, et elle doit être prise avant que des comptes en
consultation ne soient distribués largement.

---

## Ce que je livre

```
PASSATION.md                        le document de reprise
AUDIT-FINAL.md                      ce document
server/.env.example                 73 variables documentées, sans secret
server/auth-core.js                 cookie de session (httpOnly, SameSite=Strict)
server/sharefly.js                  garde d'authentification
server/app.js                       garde sur /flux
server/routes/auth.js               pose et retrait du cookie
server/test/acces-public.test.js    8 tests : aucune surface publique
```

---

## Les cinq points ouverts, par ordre d'importance

1. **Changer le mot de passe propriétaire.** Cinq minutes. Il est dans l'historique git.
2. **Décider des droits par espace ShareFly.** Avant-vente et RH sont visibles de tout compte.
3. **Documenter la régénération du catalogue ShareFly.** Personne ne sait comment ni quand.
4. **Vérifier `DATABASE_URL` sur Render.** Sans elle, la mémoire de l'outil est effacée à chaque
   déploiement.
5. **Transférer les accès tiers** : Render, Neon, GitHub, jeton Jira, applications Microsoft,
   clés IA. À faire de vive voix, jamais dans le dépôt.

Aucun des quatre derniers points n'est bloquant aujourd'hui. Le premier l'est.
