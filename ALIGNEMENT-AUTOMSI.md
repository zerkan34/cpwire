# Atelier Belmet aligné sur la référence AUTOMSI

1 fichier : `server/public/flux/index.html`. Valeurs relevées sur ton fichier, pas approximées.

---

## Méthode

Je n'ai pas regardé ta référence « à l'œil ». J'ai extrait ses 452 000 caractères de CSS, puis
comparé chaque règle de coquille avec celle de l'atelier Belmet, et relevé les **règles
gagnantes** — celles qui l'emportent réellement après toutes les surcharges du fichier, qui en
compte beaucoup.

Exemple : `.seg-tabs .tab` a **six** déclarations de `padding` successives dans ta référence.
La valeur qui s'applique vraiment est `10px 20px`, pas la première trouvée. C'est celle-là que
j'ai reprise.

---

## Ce qui a été aligné, valeur par valeur

| élément | avant (Belmet) | après (= référence) |
|---|---|---|
| `.wrap` | 1320px, fond lavande | pleine largeur, fond blanc |
| `body` | 14px / 1.5 | 14.5px / 1.55 |
| `.brand img` | 34px | 40px |
| `.bc` interlettrage | .14em | .16em |
| `.bt` marge | 6px | 2px |
| `.cli` interlettrage | .12em | .14em |
| onglets | soulignement doré | **seg-tabs** : pilule `#F7F5FC`, actif en carte blanche + ombre |
| onglet padding | 10px 20px | 10px 20px |
| `.toolbar` | gap 10, padding 12 | gap 8, padding 10 |

**La barre collante que j'avais copiée sur ShareFly a été retirée.** Ta référence pose
l'en-tête dans le flux de la page, sous la barre de dégradé. Tu m'as dit de m'inspirer de
l'AUTOMSI « au pixel près » : c'est donc lui qui l'emporte sur ma proposition précédente.

---

## Le bloc d'identité, reconstruit

C'est ce qui manquait le plus. Ta référence n'a pas un simple en-tête : elle a une **appbar**
complète, et l'atelier Belmet n'en avait rien.

Reconstruit à l'identique :

- **marque bicolore** `BEL` violet + `MET` jaune, Poppins 800, 22px
- **filet vertical** de 1px, hauteur 52px, `#EAE5F7`
- **logo Armonie** à 26px
- **sur-titre** « GROUPE BELLION · ATELIERS », 9px, interlettrage 1px
- **titre à deux couleurs** : « Atelier de flux » en `#1B1930`, la précision en `#6A5AC8`
- **pastille de section** : fond `rgba(242,195,22,.12)`, bordure `rgba(242,195,22,.42)`, nom de
  section en violet, description en gris
- **filet de séparation** en `::after`, 1px `#F0EDF9`, à 16px

**La pastille suit l'onglet actif**, comme dans ta référence : « Flux de données · schéma des
échanges et point de découplage », puis « GANTT · planning de la mise en production 2027 ».
Vérifié en cliquant réellement sur l'onglet.

---

## Deux corrections en cours de route

Le titre apparaissait **deux fois** après la reconstruction : une fois dans l'appbar, une fois
dans l'ancien `<h1>`. Repéré à la capture, pas dans le code. L'ancien est retiré, le titre vit
maintenant dans `.ab-h1` comme dans la référence.

Le chapô est passé en `.sub.lead`, limité à 78 caractères par ligne, pour respirer comme dans
ta référence au lieu de courir sur toute la largeur maintenant que le conteneur est pleine
largeur.

---

## Ce que je n'ai pas repris

Ta référence a une **page d'accueil** avant l'atelier : hero avec illustration, recherche
intelligente, gros bouton d'entrée. L'atelier Belmet ouvre directement sur le flux.

Je ne l'ai pas ajoutée parce que ce n'est pas une question de style mais de structure : ça
suppose du contenu que je n'ai pas (illustration, index de recherche, chiffres du dossier).
Dis-moi si tu la veux, et avec quel contenu.

De même, la référence a six onglets (Flux, GANTT, Schéma, Pérennisation, Revue, Aller-retour)
contre deux chez Belmet. Le composant est maintenant le même ; ajouter des sections ne demande
plus que du contenu.

---

## Fichier

```
server/public/flux/index.html
```

Aperçus joints : référence, résultat desktop, résultat mobile.
