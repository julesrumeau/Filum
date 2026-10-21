# TODO

Mis à jour le 21 octobre 2026, après le tri des éléments inutiles ou infaisables. Contexte, mesures et pièges : voir CLAUDE.md. L'historique détaillé de chaque élément fait est dans git.

Taille (estimation grossière) : S = moins d'une heure, M = quelques heures, L = une journée ou plus.

## À faire

- [ ] [M] **Fenêtre sur les modifications, suite** : résumé par changeset (qui a changé quoi, en un lot), sous-relations et nœuds membres modifiés
- [ ] [M] **Ordre des arrêts de bus** et schéma de transport v2 (relation parente et une sous-relation par sens) : les arrêts sont affichés mais leur ordre n'est pas vérifié
- [ ] [M] **Essayer les cas demandés par pyrog** sur des relations réelles et noter ce qui sort faux : plusieurs niveaux de sous-relations, réseau de carrefours, vélo avec `forward` et `backward`, randonnée avec rôles, parcours de santé, multipolygone (2449758 Hôtel-Dieu), limite administrative (4850451 le Rhône), relations à trous de Strasbourg (1623019, 10017827, 2910706, 48361, 9974539)
- [ ] [S] **Retours du forum** : quand un testeur (pyrog, StC, Guy, lonvia) donne la vraie cause d'une rupture, comparer avec ce que Filum affiche ; c'est la seule validation du forensic possible sans accès à une vérité connue

## Plus tard, hors périmètre actuel

- Frise et forensic directement sur une relation parente (EuroVelo) : coûte l'historique de chaque sous-relation et de chaque chemin (plus de 1 000 appels), le bouton « Enquêter » sur la sous-relation cassée couvre le besoin courant
- Positions passées des nœuds (nœuds supprimés ou déplacés depuis) : un appel d'historique par nœud
- Sélection d'une zone sur la carte avec l'historique des éléments (idée de l'utilisateur, à mesurer avec `changesets?bbox=`)
- Contrôles à la Knooppuntnet : `access`, `oneway`, tags attendus, rôles adaptés au type de relation
- Moniteur : comparer un itinéraire à une référence (GPX, tracé), fonction de Knooppuntnet
- Mode télécommande JOSM (analyser une relation en cours d'édition)
- Mode temps réel sur toutes les relations d'un type : suppose un serveur, contredit « rien côté serveur »
- Comparer et fusionner des polygones LiDAR ou GPX avec OSM (demande de StC, trop floue)

## Décisions prises

1. **Géométrie** : on compare des identifiants de nœuds, pas des positions. Un nœud déplacé ne casse pas le parcours, et suivre la forme coûterait l'historique de chaque nœud
2. **Définition du trou** : connexité physique = trou (rouge). Une rupture dans l'ordre de la liste sans trou physique est « ordre » (orange). Un raccord en T (le bout d'un chemin posé sur le milieu d'un autre) reste « ordre » avec un message dédié : continu pour un marcheur, mais la bonne pratique OSM est de couper le chemin. Cela explique l'écart avec Knooppuntnet sur 12432165 (deux trottoirs sans nœud commun, coupure pour eux, « ordre » pour Filum)
3. **Chargement de l'historique** : automatique, avec estimation, progression et pause
4. **Seuil des ruptures brèves** : 1 jour
5. **Moniteur** : non, tant qu'aucun retour ne le demande

## Fait

- Mesures de faisabilité (CORS, volumes, Overpass trop lent, API OSM groupée en environ 1 s) ; Overpass abandonné
- Détection : connexité, ordre, carrefours, rôles, ronds-points, polygones fermés, anneaux (extérieurs, intérieurs, ouverts), appels groupés tolérants aux identifiants inexistants et aux adresses trop longues
- Interface : arbre dépliable avec chemins sans problème repliés, carte avec zoom, sélection dans les deux sens, trait pointillé des trous, tracé coloré par morceau, fond de carte OSM, nœuds membres, statistiques
- Forensic : périodes de rupture, frise à deux curseurs avec bulle, fenêtre sur les modifications, preuve avant/après, masquage des modifications sans effet, auteur, date, changeset et discussion, « Chercher une cause » (contrôlé sur 2952375)
- Polygones : bouts non raccordés classés libre, posé sur le milieu d'un chemin, embranchement ; liste A, B, A = un trou (trous = morceaux - 1, mesuré sur 8 relations) (21/10/2026)
- Fond de carte : tuiles décalées en zoomant corrigées (21/10/2026, voir CLAUDE.md)
- Contenu d'un polygone (21/10/2026, `contenu.js`, `ui-contenu.js`) : bouton sous les statistiques d'un polygone, éléments étiquetés regroupés par type (Orangerie 274225 : 3 176 arbres, 177 bancs, 5 aires de jeux, identique à la mesure du 18/10), points dessinés sur la carte ; zone limitée à 6 requêtes de 0,25 degré carré, Paris refusé par l'API (plus de 50 000 éléments), état actuel seulement
- Saisie : numéro, adresse openstreetmap.org, `r123`, chemin (`way 123`), relations parentes, paramètres dans l'adresse
- Hygiène : `app.js` découpé en fichiers `ui-*`, échappement du texte OSM (`html.js`), code mort retiré, `test/hygiene.test.js`, 240 tests
- Publication : site en ligne sur GitHub Pages, testé dans Chromium (le tactile et les autres navigateurs ne sont pas testés)

## Abandonné

- Dichotomie sur des instantanés Overpass : remplacée par le balayage local des historiques chargés
- Bandeau « prototype » dans la page : le caractère prototype est dit dans le README
- Griser les éléments non modifiés dans la fenêtre : l'utilisateur veut qu'ils n'apparaissent pas
- Tests sur écran tactile et autres navigateurs, essai de Knooppuntnet et Waymarked Trails, expérience sur le serveur de test d'OSM, historique des `note` et `fixme`, niveau des nœuds dans l'arbre, chemin présent dans plusieurs relations : retirés le 21/10/2026 (infaisables ici, peu utiles ou déjà couverts)
