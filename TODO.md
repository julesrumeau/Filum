# TODO

Mis à jour le 21 octobre 2026, après le tri des éléments inutiles ou infaisables. Contexte, mesures et pièges : voir CLAUDE.md. L'historique détaillé de chaque élément fait est dans git.

Taille (estimation grossière) : S = moins d'une heure, M = quelques heures, L = une journée ou plus.

## À faire

- [ ] [M] **Fenêtre sur les modifications, suite** : résumé par changeset (qui a changé quoi, en un lot), sous-relations et nœuds membres modifiés
- [ ] [M] **Ordre des arrêts de bus** et schéma de transport v2 (relation parente et une sous-relation par sens) : les arrêts sont affichés mais leur ordre n'est pas vérifié
- [ ] [M] **Essayer les cas demandés par pyrog** sur des relations réelles et noter ce qui sort faux : plusieurs niveaux de sous-relations, réseau de carrefours, vélo avec `forward` et `backward`, randonnée avec rôles, parcours de santé, multipolygone (2449758 Hôtel-Dieu), limite administrative (4850451 le Rhône), relations à trous de Strasbourg (1623019, 10017827, 2910706, 48361, 9974539)
- [ ] [S] **Retours du forum** : quand un testeur (pyrog, StC, Guy, lonvia) donne la vraie cause d'une rupture, comparer avec ce que Filum affiche ; c'est la seule validation du forensic possible sans accès à une vérité connue

## Plus tard, hors périmètre actuel

- Forensic des TROUS à travers toute une relation parente (EuroVelo) : coûte l'historique de chaque sous-relation et de chaque chemin (plus de 1 000 appels). La frise de la relation parente seule (sa structure) est faite
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
- Tickets #4, #21, #22 (frise) : heure UTC à la seconde partout, adresse avec heure (`du=AAAA-MM-JJThh:mm:ssZ`), bouton « Analyser cette période exacte » sur chaque rupture, bulle de la frise avec toutes les versions proches et leurs membres ajoutés ou retirés
- Ticket #1, retour de pyrog (25/10/2026) : le rang d'un chemin dans un contour suit l'ordre de la LISTE (avant : l'ordre du contour, d'où un rail coupé quand la liste n'est pas dans l'ordre du tour : 296576721, 86298926, 86297905 de 19876654) ; un second rail à droite referme le contour. Reste : forward et backward
- Ticket #3 (25/10/2026) : un clic sur « morceau N » dans les statistiques met le morceau en évidence et cadre la carte ; « boucle fermée » indiquée quand tous les bouts du morceau se raccordent. Vérifié sur 2952375 (morceau 2 : 5 chemins)
- Ticket #18 (25/10/2026) : une relation supprimée s'ouvre dans sa dernière version avant la suppression, avec un bandeau (qui, quand, quel changeset) ; la frise va jusqu'à la suppression ; une suppression suivie d'un retour est gérée (relation 100 : supprimée en 2007, revenue en 2025, supprimée de nouveau en 2025)
- Ticket #5 (25/10/2026) : chemins retirés ou supprimés dessinés en pointillé rouge sur la carte de la période (`forensic.lastWayNodes`, `osmapi.fetchNodePositions`) ; mesuré sur 617169320 (retiré de 15024156 le 2023-01-06) : 11 nœuds, 5 encore positionnés, 6 supprimés lus par 6 appels d'historique
- Ticket #1, partie alignement (25/10/2026) : le bouclage est un rail vertical dans la marge gauche (coin haut au début, coin bas à la fin, petit rond pour un chemin fermé sur lui-même), continu d'une ligne à l'autre. Reste : les rôles forward et backward (aller et retour) dans ce rail
- Ticket #7 (25/10/2026) : contributeurs de la période (nombre, classement, créés, modifiés, supprimés, membres, changesets), replié, sans appel de plus (`changes.contributorStats`) ; sur 17032107 depuis 2025 : 13 contributeurs
- Retour de pyrog sur #6 (25/10/2026) : osmc:symbol lu de façon tolérante (couleur seule, couleur ou forme inconnue = rendu partiel avec avertissement). Formes de Waymarked Trails non dessinées : arch, corner, fork, pointer, rectangle, hexagon, shell, etc.
- Ticket #26 (25/10/2026) : « Voir aussi » vers Waymarked Trails, PTNA, Knooppuntnet selon le type (`src/liens.js`) et nom des contributeurs lié à How did you contribute. Adresses WMT et HDYC vérifiées (WMT : modèle donné par pyrog) ; PTNA et Knooppuntnet répondent mais leur contenu est chargé par JavaScript, non vérifié
- Tickets #24 (résumé de période : membres ajoutés ou retirés de la relation) et #25 (message de carte quand la période ne touche aucun chemin), 25/10/2026
- Ticket #6 (25/10/2026) : balisage `osmc:symbol` dessiné à côté du nom de la relation (`src/osmc.js`, couleurs de la liste connue seulement), vérifié sur GR 534 (losange rouge) et GR 965 (blanc et rouge, numéro)
- Tickets #9 et #3 (partie liste, 23/10/2026) : longueur de chaque relation et liste des morceaux (chemins, nœuds, longueur, couleur de la carte) dans les statistiques ; 13668305 : 211, 87 et 113 km comme pyrog. Reste de #3 : clic sur un morceau pour le mettre en évidence
- Ticket #14 (23/10/2026) : changements de tags en vert (+ ajout), orange (~ modification), rouge (− retrait), avec un signe en plus de la couleur
- Ticket #2 (23/10/2026) : icône de bouclage dans l'arbre (chemin fermé sur lui-même, début, suite, fin d'un contour fermé de plusieurs chemins), vérifié sur 53137
- Tickets #10 (stage dans le libellé) et #11 (clic simple sans zoom, Maj+clic pour cadrer un chemin), 23/10/2026
- Ticket #15 (23/10/2026) : la frise et la fenêtre sur les modifications s'appliquent aussi à une relation faite de sous-relations (14234324 : v23 à v25, +3 membres), sans descendre dans les sous-relations
- Ticket #20 : périodes de membres mélangés (problème d'ordre sans trou) dans la frise (bandes orange) et la liste de l'enquête, mesuré sur 17032107 : du 2026-10-09 (v16, Cavokld) au 2026-10-23 (v17, pyrog), comme KPN
- Tickets #17 à #19 (22/10/2026) : relation inexistante ou supprimée avec un message clair (`checkRoot` dans `osmapi.js`), sous-relation supprimée ignorée, relation sans chemin dessinée avec ses nœuds membres. Reste de #18 : analyser une relation supprimée sur ses versions d'avant
- Contenu d'un polygone (21/10/2026, `contenu.js`, `ui-contenu.js`) : bouton sous les statistiques d'un polygone, éléments étiquetés regroupés par type (Orangerie 274225 : 3 176 arbres, 177 bancs, 5 aires de jeux, identique à la mesure du 18/10), points dessinés sur la carte ; zone limitée à 6 requêtes de 0,25 degré carré, Paris refusé par l'API (plus de 50 000 éléments), état actuel seulement
- Saisie : numéro, adresse openstreetmap.org, `r123`, chemin (`way 123`), relations parentes, paramètres dans l'adresse
- Hygiène : `app.js` découpé en fichiers `ui-*`, échappement du texte OSM (`html.js`), code mort retiré, `test/hygiene.test.js`, 240 tests
- Publication : site en ligne sur GitHub Pages, testé dans Chromium (le tactile et les autres navigateurs ne sont pas testés)

## Abandonné

- Dichotomie sur des instantanés Overpass : remplacée par le balayage local des historiques chargés
- Bandeau « prototype » dans la page : le caractère prototype est dit dans le README
- Griser les éléments non modifiés dans la fenêtre : l'utilisateur veut qu'ils n'apparaissent pas
- Tests sur écran tactile et autres navigateurs, essai de Knooppuntnet et Waymarked Trails, expérience sur le serveur de test d'OSM, historique des `note` et `fixme`, niveau des nœuds dans l'arbre, chemin présent dans plusieurs relations : retirés le 21/10/2026 (infaisables ici, peu utiles ou déjà couverts)
