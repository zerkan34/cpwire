# Charte corrigée — tous les documents cp|WIRE

4 fichiers modifiés. **70 tests, 69 passent, zéro rouge.** Deux PDF joints pour comparer.

---

## Les couleurs viennent de ton document, pas de ma mémoire

J'ai converti ton `Arbitrage du périmètre AUTOMSI` en images et relevé les teintes **au pixel** :

| relevé sur le document | valeur | usage constaté |
|---|---|---|
| titre « Arbitrage du périmètre » | `#3B2E8C` | violet Armonie |
| kicker « ARMONIE GROUP », encart 20 | `#F2C316` | jaune doré |
| en-tête de tableau, page 2 | `#3B2E8C` sur `#F5F2FC` | violet sur lavande |
| filets et aplats secondaires | `#C4C0DC` | violet clair |
| texte courant | `#1D1D1B` | noir Armonie |
| pastilles et conclusions « acquis » | `#2F7D4F` | vert |

Et le dégradé de couverture, échantillonné d'un bord à l'autre : `#1E1E1F` puis `#2E275C` puis
`#EBBD1A`. **Noir, violet, jaune.**

---

## Ce qui était faux

`shared/armonie-palette.js` portait `navy #2E2A5D`, `indigo #4B3F8F`, `or #A88B4B` : l'ancienne
charte. Tous les documents produits par cp|WIRE sortaient donc hors charte, y compris le
registre que je t'ai livré ce matin.

Trois autres endroits recopiaient ces couleurs au lieu de les lire :

- `server/crArmonie.js` : la palette entière, en dur ;
- `web/src/blockersDoc.js` : quatre constantes, avec un or `#A8884E` qui était **une nuance de
  plus** que partout ailleurs ;
- `web/src/charter.js` : le dégradé de couverture allait navy vers indigo vers or.

---

## Ce que j'ai fait

**La palette est corrigée à la source.** Les clés gardent leurs noms (`navy`, `indigo`, `gold`)
pour ne rien casser chez les fichiers qui les importent, mais portent les bonnes teintes :
`navy` devient le violet, `indigo` le violet clair, `gold` le jaune, `red` le magenta. J'ai
ajouté des alias explicites (`ARMONIE.violet`, `ARMONIE.jaune`, `ARMONIE.magenta`…) pour que le
code écrit à partir de maintenant nomme les couleurs comme elles s'appellent vraiment.

**Le dégradé de couverture** va désormais de noir à violet à jaune, vérifié au pixel sur le PDF
régénéré : `#201F25` puis `#382C82` puis `#DDB223`.

**Les trois copies en dur** lisent maintenant la source unique.

---

## Un défaut que j'ai créé, vu au rendu et corrigé

En basculant `indigo` du bleu-violet foncé vers le violet clair, j'ai rendu **illisible** tout ce
qui l'utilisait comme couleur de texte : le libellé « EN BREF » de la couverture est apparu en
lavande sur lavande.

Je ne l'ai pas déduit, je l'ai vu en régénérant le PDF et en le regardant. Les trois usages de
`indigo` comme couleur d'écriture repassent sur le violet plein ; le seul usage restant est un
aplat de légende, où le violet clair est correct.

C'est la raison pour laquelle je régénère et je regarde à chaque fois plutôt que de me fier au
code : un changement de palette ne se vérifie pas en lisant des valeurs hexadécimales.

---

## À comparer

Les deux PDF joints sont le **même document**, produit avant et après :

- `exemple-AVANT-ancienne-charte.pdf`
- `exemple-APRES-charte-corrigee.pdf`

Regarde la couverture et les en-têtes de tableau. Si quelque chose ne colle pas avec ta charte,
dis-le, tout se corrige à un seul endroit maintenant.

---

## Ce que je n'ai PAS touché, et pourquoi

**`web/src/theme.css` garde ses couleurs actuelles.** C'est l'interface de cp|WIRE, pas un
livrable client, et elle contient plus de soixante teintes codées en dur (`#2E2A5D` répété des
dizaines de fois, variables `--navy`, `--indigo`, `--gold`). Basculer l'interface est un
chantier distinct, à part entière, qui change l'apparence de l'outil que tu utilises tous les
jours.

Mon avis : ce qui compte, c'est que ce qui **sort** vers tes clients soit à la charte. C'est fait.
L'interface interne peut suivre plus tard, tranquillement, si tu le souhaites.

---

## Fichiers

```
shared/armonie-palette.js       ← palette corrigée + alias explicites
web/src/charter.js              ← dégradé noir/violet/jaune, contrastes corrigés
web/src/blockersDoc.js          ← palette mutualisée
server/crArmonie.js             ← palette mutualisée
```

Ces quatre fichiers suffisent : `recapDoc.js`, `engagementsDoc.js`, `docgen.js`, `projets.js` et
`digest.js` lisaient déjà la source unique, ils héritent automatiquement.
