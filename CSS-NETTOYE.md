# Interface : charte variabilisée, CSS mort retiré

1 fichier modifié (`web/src/theme.css`), **0 pixel de différence** sur les écrans testés.
70 tests serveur + 13 front, zéro rouge.

---

## Ce que j'ai failli faire, et pourquoi je me suis arrêté

En variabilisant les couleurs, mon script a remplacé la déclaration `--gold: #A8884E` par le
jaune Armonie. J'ai vérifié : **`var(--gold)` est utilisé à 103 endroits**. Ce n'était plus de la
mutualisation, c'était repeindre toute l'interface d'un coup, sans que tu l'aies demandé.

J'ai restauré `--gold` et `--hd-logo` à leurs valeurs d'origine. L'identité cp|WIRE (violet
`#6e5cc4`, orange, dégradé du bandeau) reste intacte.

C'est une distinction qui compte : ta **charte documentaire** s'applique à ce qui sort vers tes
clients, c'est fait. L'**identité de ton outil interne** est un autre sujet, et ce n'est pas à
moi de le trancher au détour d'un script.

---

## Ce qui est fait

**81 couleurs codées en dur deviennent des variables.** Les teintes de la charte documentaire
étaient recopiées 81 fois dans `theme.css`, sur l'ancienne charte navy/or. Elles pointent
maintenant vers un jeu de variables déclaré en tête de fichier :

```
--arm-noir     #1D1D1B      --arm-jaune         #F2C316
--arm-violet   #3B2E8C      --arm-jaune-clair   #F4CC3A
--arm-violet-clair #C4C0DC  --arm-magenta       #E91E63
--arm-lavande  #F5F2FC      --arm-filet         #E2DEF0
--arm-grad     noir → violet → jaune
```

Conséquence pratique : le jour où tu voudras aligner l'interface sur la charte, ce sera **neuf
lignes à changer** au lieu de quatre-vingt-une occurrences à traquer.

**81 règles CSS mortes supprimées, 7 Ko.** Ce sont les styles de `QuoteBoard`, `DeadlineRadar` et
`Digest`, les composants supprimés lors des passes précédentes. J'avais retiré le code mais
laissé son habillage derrière moi. Vérifié : zéro référence dans tout le projet.

---

## Vérification

J'ai comparé deux écrans rendus en headless, **pixel par pixel**, avant et après :
**0 pixel de différence**. C'est le résultat attendu, et c'est la seule preuve qui vaille pour
une modification de feuille de style.

---

## Ce que je n'ai pas supprimé, et pourquoi

Ma détection trouve **271 autres classes CSS jamais référencées** dans le code. Je ne les touche
pas, et la raison est importante : de nombreuses classes sont **construites dynamiquement**
(`` className={`pill ${etat}`} ``, `af-chip`, `adm-status-i`…). Une recherche textuelle ne les
voit pas, et les supprimer casserait des styles en silence, sans erreur de compilation pour
prévenir.

La liste complète est jointe (`classes-css-a-verifier.txt`). Chaque famille demande une
vérification manuelle : ouvrir l'écran concerné, regarder. C'est faisable, mais ça se fait
écran par écran, pas au script.

Les trois familles que j'ai retirées étaient sûres parce que leurs composants **n'existent
plus** : aucun risque qu'une classe soit fabriquée à la volée par du code supprimé.

---

## Fichiers

```
web/src/theme.css                  ← 81 couleurs variabilisées, 81 règles mortes retirées
classes-css-a-verifier.txt         ← les 271 classes à examiner écran par écran
```

---

## Reste au tableau

**Aligner l'interface sur la charte Armonie** : neuf lignes, mais un changement visuel majeur.
À décider, pas à subir. Je peux te produire un avant/après en capture avant que tu tranches.

**Les 42 états du composant racine** : les deux causes réelles de lenteur sont traitées, le
reste est structurel et sans gêne au quotidien.

**Les 271 classes CSS** : à passer en revue écran par écran, quand tu auras un moment creux.
