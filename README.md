# Filum

Filum analyse les relations OpenStreetMap (itinéraires de randonnée et de vélo, polygones, limites administratives) : il trouve où elles sont discontinues, et retrouve qui les a cassées et quand, en remontant l'historique de leurs chemins.

C'est un **prototype**. Il fonctionne sur les cas essayés, mais ses résultats ne sont pas validés (voir « Limites »). Les retours sont ce qui permettra de l'améliorer.

Projet frère de [Scopus](https://github.com/julesrumeau/Scopus), même philosophie : une page statique, sans serveur, sans compte, sans dépendance.

## Utilisation

Ouvrez `index.html` dans un navigateur (ou la version publiée), saisissez une relation et cliquez sur « Analyser ». Vous pouvez coller son adresse openstreetmap.org (par exemple `openstreetmap.org/relation/2952375`) ou écrire `2952375`, `relation 2952375`, `r2952375`.

L'adresse de la page Filum garde la relation et la période analysée (`?relation=2952375&du=2026-04-01`) : copiez-la pour partager une analyse.

Quelques relations pour essayer :

| Numéro | Ce que c'est |
|---|---|
| 2952375 | Sentier Stanislas-Kléber : 1 022 chemins, 5 trous aujourd'hui, une histoire riche (la frise est utile ici) |
| 7444 | Paris, limite administrative : un polygone, contour fermé |
| 274225 | Parc de l'Orangerie à Strasbourg : un multipolygone simple (un contour, sept trous) |
| 12586521 | EuroVelo 15, relation parente de 148 étapes : arbre et tracé, mais pas la frise |

### Ce que vous voyez

- **L'arbre** : la relation, ses sous-relations, ses chemins, avec pour chacun la version, l'auteur et la date. Les suites de chemins sans problème sont repliées (« 40 chemin(s) sans problème »), seuls les trous et leurs abords restent visibles. Les trous (rouge) et les problèmes d'ordre (orange) sont des lignes à leur place exacte dans la liste.
- **La carte** : le tracé, sans fond de carte. Les points rouges sont les extrémités qui ne se raccordent pas. Molette pour zoomer, glisser pour se déplacer.
- **La sélection** : un clic sur un chemin ou un trou, dans l'arbre ou sur la carte, le met en surbrillance partout.
- **La frise** (sous la recherche) : deux curseurs, début et fin de la période. La barre rouge montre les périodes où la relation était cassée, sur toute son histoire. Après avoir déplacé les curseurs, cliquez sur « Analyser » : l'historique des chemins est lu (environ 30 secondes pour 1 000 chemins, avec une barre de progression et une pause), puis la page montre ce qui a été créé, modifié, ajouté, retiré ou supprimé dans la période, avec l'auteur, la date et le changeset. Ce qui n'a pas bougé dans la période n'apparaît pas. Une case sous la frise masque les modifications sans effet sur la continuité (tags, géométrie intérieure). Sous chaque modification, le bloc « Preuve » donne de quoi contrôler soi-même : versions avant et après (données brutes de l'API), nœuds retirés ou ajoutés, tags avant et après, membres ajoutés ou retirés. Pour tout voir, gardez la période complète.
- **Les périodes de rupture** : pour chacune, qui a modifié quoi au moment où elle commence et où elle finit, avec le commentaire du changeset et sa discussion. Les ruptures de moins d'un jour, le plus souvent des éditions faites en plusieurs envois, sont regroupées dans un bloc replié.

### Comment Filum décide qu'il y a un trou

Une relation d'itinéraire est une liste de chemins. Filum regarde si les chemins se touchent par un nœud commun (même identifiant de nœud). S'il reste plusieurs morceaux séparés, c'est un **trou**. Si les chemins se touchent mais que la liste n'est pas dans l'ordre du parcours, c'est un **problème d'ordre** (pas forcément un trou). Pour un polygone, on cherche les **bouts ouverts** : un contour doit se refermer sur lui-même.

Quelques rôles sont pris en compte : `alternative`, `excursion`, `approach` et `connection` sont des chemins à part, `forward` et `backward` font recommencer la chaîne.

Un nœud déplacé ne casse donc rien, puisque seul compte l'identifiant. Voir « Limites ».

## Vocabulaire OSM

- **Nœud** : un point. **Chemin** (way) : une suite de nœuds. **Relation** : un groupe d'éléments (ses **membres**), chacun avec un **rôle**.
- **Version** : chaque modification d'un élément crée une nouvelle version. **Changeset** : le lot de modifications envoyé d'un coup par une personne, avec un commentaire.
- **Multipolygone** : une relation qui décrit une surface avec des trous (rôles `outer` pour le contour, `inner` pour les trous).

## Limites connues

- **Résultats non validés.** Les faits affichés (quelle version, quel auteur, quels nœuds retirés) se vérifient sur openstreetmap.org, et un cas a été contrôlé en détail (relation 2952375). Rien n'a été confronté à une vérité connue sur d'autres relations. Une modification au moment d'une rupture n'est pas forcément une faute : la personne a pu réparer ou raccrocher un autre chemin, et un gros changeset peut n'avoir aucun rapport avec la relation.
- **La frise ne marche que pour une relation qui contient directement des chemins**, pas pour une relation parente comme EuroVelo (saisissez le numéro d'une de ses sous-relations).
- **La géométrie n'est pas suivie.** Déplacer un nœud, ou en ajouter ou en retirer au milieu d'un chemin, n'est pas signalé comme un changement de forme.
- **Positions passées approximatives.** À une date passée, un ancien chemin est dessiné avec des trous là où ses nœuds ont été supprimés depuis. Les sous-relations ne sont pas reconstituées à une date.
- **Pas encore gérés** : arrêts de bus et ordre des arrêts, schéma de transport v2, parcours de santé, nœuds membres (ils sont affichés mais pas analysés), démarrage depuis un chemin (seul un numéro de relation est accepté).
- **Faux positifs possibles** : un nœud où trois chemins se terminent, ou un bout posé sur le milieu d'un autre chemin, peut donner un faux bout ouvert sur un polygone.
- **Aucun mode temps réel ni télécommande JOSM.**
- Testé uniquement dans Chromium (en `file://` et en HTTP local). Pas testé sur téléphone.

## Données et politique d'usage

Les données viennent de l'[API publique d'OpenStreetMap](https://api.openstreetmap.org), appelée directement depuis votre navigateur. Rien ne passe par un serveur de Filum. Une analyse simple coûte une quinzaine d'appels. Lire l'historique complet d'une grande relation en demande environ un par chemin (environ 1 000 pour 2952375) : Filum les envoie par pages de 80, 8 à la fois, avec une pause possible. Merci de ne pas le lancer en boucle sur de grosses relations.

Données © contributeurs OpenStreetMap, sous licence [ODbL](https://www.openstreetmap.org/copyright).

## Développement

Pas de dépendance, pas d'étape de construction : des scripts classiques, qui tiennent en `file://`.

```
npm test        # 201 tests (node:test)
```

| Fichier | Rôle |
|---|---|
| `src/continuity.js` | Connexité, ordre, rôles, polygones fermés |
| `src/osmapi.js` | Lecture de l'API OSM (états, historiques, changesets, discussions) |
| `src/forensic.js` | État à une date, périodes de rupture |
| `src/changes.js` | Ce qui change dans une période (créé, modifié, ajouté, retiré, supprimé) |
| `src/tree.js` | Arbre des relations, fenêtre sur une période |
| `src/frise.js`, `src/viewport.js` | Échelle de dates, zoom |
| `src/input.js` | Saisie (numéro, adresse) et paramètres d'adresse |
| `src/app.js`, `index.html` | Interface |

La logique est pure et testée d'abord (tests écrits avant le code). `CLAUDE.md` contient les décisions, les mesures et les pièges rencontrés ; `TODO.md`, ce qui reste à faire.

## Retours

Une erreur de détection, un faux trou, une relation qui se comporte bizarrement ? Ouvrez une issue sur le dépôt GitHub (`julesrumeau/Filum`) en indiquant le numéro de la relation et ce que vous attendiez.
