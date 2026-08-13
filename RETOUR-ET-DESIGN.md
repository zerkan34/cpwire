# Atelier de flux : retour et coquille ShareFly

2 fichiers. Rendu vérifié côte à côte avec ShareFly.

---

## Le bouton retour

Point à vérifier de ton côté : **`flux/index.html` avait déjà le bouton**, je l'avais ajouté
avec le ménage du dépôt. Si tu ne le vois pas, c'est que cette version n'est pas déployée.

En revanche, tu avais raison sur un autre écran, et celui-là m'avait échappé :
**`GANTT_Belmet_editable.html` n'avait aucune sortie**. Tu ouvres le GANTT depuis l'atelier, et
tu es coincé : ni retour à l'atelier, ni retour à cp|WIRE.

Il a maintenant **deux sorties**, parce que les deux ont du sens :

- `← cp|WIRE` pour revenir à l'application
- `‹ Atelier de flux` pour remonter d'un cran, là d'où tu viens

---

## La coquille, copiée sur ShareFly

Tu as raison, il n'y avait aucune raison que les deux pages autonomes ne se ressemblent pas.
J'ai repris la barre de ShareFly **à l'identique**, pas approximativement :

```
position: sticky, top: 0, z-index: 40
fond blanc à 82 % + backdrop-filter: saturate(1.3) blur(12px)
filet bas de 1 px
display: flex, gap: 22px, padding: 11px 28px
marque séparée par un filet vertical à gauche
```

Le bouton porte le même libellé (`← cp|WIRE`), le même style, et surtout le **même
comportement** : `window.top` d'abord, pour fonctionner même si la page est un jour réaffichée
dans un cadre, et la même variable de destination `SHAREFLY_CPWIRE_BASE` que ShareFly, avec un
repli sur `CPWIRE_BASE` puis `/`.

Adaptations mobile : la barre se resserre, le filet vertical disparaît et le nom du client passe
à la ligne plutôt que d'écraser le reste.

---

## Ce que je n'ai pas changé

**La palette du contenu.** L'atelier reste en charte Armonie (violet, jaune, dégradé
noir-violet-jaune du bandeau) : c'est un outil que tu montres à Belmet, il doit porter la marque
Armonie. ShareFly, lui, est en palette cp|WIRE. Seule la **coquille** est commune, ce qui est
exactement le bon niveau de mutualisation : même structure, identité respectée.

**Le contenu de l'atelier.** Je n'ai touché ni au diagramme de flux, ni au GANTT, ni aux
livrables.

---

## Vérification

Les trois pages rendues en headless :

| page | bouton retour | barre |
|---|---|---|
| ShareFly | `← cp|WIRE` | sticky |
| Atelier de flux | `← cp|WIRE` | sticky |
| GANTT | `← cp|WIRE` + `‹ Atelier de flux` | — |

---

## Fichiers

```
server/public/flux/index.html                  ← barre collante style ShareFly
server/public/flux/GANTT_Belmet_editable.html  ← deux retours ajoutés
```
