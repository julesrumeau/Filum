# TODO

Mis à jour le 21 octobre 2026, après les 17 messages du fil du forum OSM-FR (fil 47601). Contexte, mesures et pièges : voir CLAUDE.md.

Taille (estimation grossière) : S = moins d'une heure, M = quelques heures, L = une journée ou plus.

## P0. Bugs qui bloquent des testeurs (à corriger tout de suite)

- [x] [S] **Adresses d'appels groupés trop longues** (corrigé le 21/10/2026 : découpage par longueur d'adresse, 7 000 caractères maximum, mesuré : l'API répond 200 jusqu'à 8 058 et 414 à partir de 8 358 ; 13668305 trace 1 911 chemins sans erreur) : 700 identifiants de 11 chiffres font 8 454 caractères pour une limite courante de 8 190. Erreur « URI Too Long », puis erreur CORS trompeuse, et la carte ne se trace pas (relation 13668305, sous-relations de 837, 462 et 616 membres). Découper par longueur d'adresse et non par nombre d'identifiants, pour les nœuds, les chemins et les relations. Tester avec des identifiants longs
- [x] [S] **Libellé « environ undefined chemin(s) à lire, environ NaN s »** (corrigé le 21/10/2026 : `totalWays` est de nouveau calculé, `estimateLoad` ne renvoie jamais NaN) avant le premier chargement : `fr.totalWays` est lu mais n'est plus défini depuis la refonte de la frise
- [x] [M] **Ronds-points** (21/10/2026) : un chemin `junction=roundabout` s'entre et se sort par n'importe lequel de ses nœuds (`continuity.js`), les états reconstitués gardent les tags des chemins. Mesuré : 12432165 passe de 3 à 1 problème d'ordre. Les ronds-points partiels (non bouclés) ne sont pas traités
- [x] [M] **Trou absent de la fenêtre sur les modifications** (21/10/2026) : cause trouvée sans reproduction exacte, `windowTree` masquait un trou dont les deux chemins n'avaient pas bougé dans la période. Les trous sont maintenant toujours gardés (état à la date de fin), les problèmes d'ordre suivent l'ancienne règle. Vérifié sur 2952375 (période étroite : 5 trous). Un chemin retiré ou supprimé a une pastille rouge dans la liste ; il reste invisible sur la carte (ses positions ne sont plus disponibles)
- [x] [M] **Appel groupé qui échoue en entier** (21/10/2026) : sur 404, le lot est coupé en deux jusqu'à isoler l'identifiant manquant (absent du résultat, donc compté comme membre manquant). Vérifié sur l'API réelle : le message 404 correspond
- [ ] [M] **Comprendre les écarts avec Waymarked Trails et Knooppuntnet** : sur 12432165, Knooppuntnet compte 2 segments, Filum 1 morceau et 3 problèmes d'ordre. Les outils comptent peut-être les segments dans l'ordre de la liste, Filum par connexité physique : décider d'aligner ou d'expliquer. Voir aussi le faux positif de 20245275 (3 points jaunes, 2 vrais, 1 faux) et le cas 15024156 de StC (Waymarked Trails signale encore une erreur, Knooppuntnet non, lonvia pense à un bug de Waymarked Trails ; vérifier que Filum ne montre pas de données périmées)

## P1. Lisibilité, saisie et confiance (retours demandés, rapides, très visibles)

- [ ] [S] Liste des membres **repliée par défaut**, ou dépliée là où la relation est cassée (bibi, pyrog) ; sous-listes comme FacilMap
- [ ] [S] **Saisie** : coller une URL openstreetmap.org, accepter `relation 123` et `r123`
- [ ] [M] Mettre les **paramètres de l'analyse dans l'URL** pour la partager
- [ ] [S] **Légende de la frise** confuse pour une relation à une seule version
- [ ] [S] **Libellé d'une relation** : `from`, `via`, `to`, `ref`, `stage`, nom de la relation parente. [M] puis le symbole `osmc:symbol` en graphique
- [ ] [M] **Preuve avant/après** sous chaque modification de l'enquête (nœuds retirés et ajoutés, extrémités, liens complets en https://www.openstreetmap.org/...) pour que chacun contrôle sans aller sur osm.org
- [ ] [M] **Frise** : bulle au survol d'un trait (date, auteur, type de changement : relation, chemin, nœud, sous-relation)
- [ ] [M] **Masquer les changements mineurs** (géométrie, tags sans impact), comme le bouton « impact » de Knooppuntnet
- [ ] [M] **Trou sur la carte** : rond coloré et trait pointillé entre les deux extrémités, comme Waymarked Trails
- [ ] [S] **Zoom sur le chemin sélectionné** dans la liste (touche MAJ ou animation), utile quand il est tout petit
- [ ] [M] **Fond de carte** : bouton de couches avec un fond OSM, car le rendu vectoriel ne montre pas les poteaux
- [ ] [S] Zones de clic imprécises quand deux chemins sont très proches (le dernier dessiné gagne)

## P2. Fonctionnalités demandées qui élargissent l'outil

- [ ] [M] **Nœuds membres** (arrêts, poteaux, balisage, carrefours) affichés dans l'arbre et sur la carte, optionnels, cliquables ; l'analyse les ignore encore
- [ ] [S] **Relations parentes** (« Partie de ») via `way/ID/relations` et `relation/ID/relations`
- [ ] [M] **Dans quelle sous-relation est la discontinuité**, avec coloration par segments (le « chemin de fer » de Knooppuntnet)
- [ ] [M] **Statistiques pour inciter à redécouper** : longueur totale, sous-relations et niveaux, longueur et nombre de membres par relation, segments, nombre de nœuds, maximum de nœuds par chemin, plus long chemin
- [ ] [L] **Frise et forensic pour les relations parentes** (EuroVelo, schéma v2, relation 6438529) : historique de chaque sous-relation, par étapes. C'est l'hypothèse de départ (analyse récursive) qui n'est pas réalisée
- [ ] [M] **Détecter la cause probable** « chemin coupé, un morceau n'a pas été ajouté à la relation » (cas supposé de 2952375)
- [ ] [M] **Anneaux emboîtés** pour les polygones : contour, trous (`inner`), îlots dans les trous. Lignes dans l'arbre pour les bouts ouverts et les chemins isolés
- [ ] [M] **Accepter un numéro de chemin** comme point de départ (beaucoup de parcs sont un simple chemin fermé)
- [ ] [L] **Positions passées des nœuds** : nœuds supprimés depuis (`node/ID/history` coûte un appel par nœud) et nœuds déplacés ; les sous-relations à une date
- [ ] [M] Fenêtre sur les modifications : nœuds membres modifiés, sous-relations, résumé par changeset
- [ ] [M] Niveau nœuds dans l'arbre, chargé à l'ouverture d'un chemin
- [ ] [M] Contenu d'un polygone (arbres, bancs, aire de jeux) : `/map?bbox=` puis test point dans polygone en local. Mesuré sur l'Orangerie (274225) : 1,6 s, 3 176 arbres. L'API refuse les grandes zones (environ 0,25 degré carré), état actuel seulement
- [ ] [M] Sélection d'une zone sur la carte : mesurer d'abord `changesets?bbox=` et `map?bbox=`
- [ ] [S] Un chemin présent dans plusieurs relations n'ouvre que sa première occurrence dans l'arbre

## P3. Validation et couverture (pour savoir si l'outil est juste)

- [ ] [M] **Valider le forensic sur un cas dont on connaît la vraie cause**. Les retours de pyrog, StC et Guy sont la meilleure source : relations 20245275, 15024156, 13668305, 12432165. Faits déjà vérifiés par l'API sur 2952375 (chemin 805380795, v7 puis v8 du 2026-10-13, changeset 190448839, ses deux extrémités retirées)
- [ ] [M] **Cas à tester demandés par pyrog** : relation à plusieurs niveaux de sous-relations, réseau de carrefours (comparer l'historique avec Knooppuntnet), transport en commun, vélo avec `forward` et `backward`, randonnée avec rôles (`alternative`, `excursion`, `approach`, `connection`, `main`), parcours de santé avec stations, multipolygone (2449758 Hôtel-Dieu), limite administrative (4850451 le Rhône)
- [ ] [S] **Essayer Knooppuntnet et Waymarked Trails** pour noter ce qu'ils font ou non. À clarifier : SebastienP dit que Knooppuntnet fait le temps réel et l'historique, pyrog dit qu'il n'a pas de forensic mais cite sa liste de changements comme modèle
- [ ] [L] **Contrôles de Knooppuntnet** à terme : `access` selon l'activité, `oneway` selon le sens, tags principaux (`type`, `route`, `network`...), tags des membres (pas de `highway=motorway` pour un itinéraire pédestre), rôles adaptés au type (inner et outer, platform, forward et backward seulement pour vélo et voiture)
- [ ] [M] Contrôler sur d'autres relations avec trous (Strasbourg : 1623019, 10017827, 2910706, 48361, 9974539) et comparer avec Waymarked Trails
- [ ] [M] Expérience contrôlée sur le serveur de test d'OSM (`master.apis.dev.openstreetmap.org`, jamais sur la vraie base) : casser soi-même une relation et voir si Filum le retrouve. Demande une adresse d'API configurable. Non essayé
- [ ] [M] Faux positifs polygones : un nœud où 3 chemins se terminent, un bout posé sur le milieu d'un autre chemin
- [ ] [M] Une liste qui alterne entre deux morceaux (A, B, A) produit plusieurs trous pour un seul
- [ ] [S] Une variante qui relie deux morceaux ne comble pas le trou : à confirmer avec un contributeur
- [ ] [M] Transports en commun : arrêts, ordre des arrêts, schéma v2, bus schéma v1 ; parcours de santé (jamais essayé)
- [ ] [S] Historique des tags `note` et `fixme` (ce qui a été écrit puis retiré) ; notes de carte OSM de la zone d'un trou (bruyant, à décider)

## P4. Dépôt, déploiement et hygiène

- [ ] [S] Commiter et pousser `CLAUDE.md` et `TODO.md` (modifiés depuis le dernier commit), et republier `main` après chaque lot de corrections (sur ordre de l'utilisateur)
- [ ] [S] Retirer le code mort : `src/overpass.js` (plus chargé par la page), `truncateCtx` dans `src/frise.js` (plus utilisé)
- [ ] [M] `src/app.js` fait environ 770 lignes : le découper avant d'atteindre la règle de 1 000 lignes ; vérifier la règle de 100 lignes par fonction
- [ ] [S] Mettre le README à jour quand la saisie ou les limites changent
- [ ] [S] Test de fumée navigateur (Playwright, hors dépôt) avant et après chaque publication, y compris sur l'adresse GitHub Pages
- [ ] [M] Tester l'écran tactile, un petit écran réel et d'autres navigateurs que Chromium
- Convention : toujours donner des liens osm.org complets et cliquables

## Décisions à prendre par l'utilisateur

1. **Géométrie** : suivre ou non l'historique de la forme (nœud déplacé, nœud ajouté au milieu) ? Aujourd'hui on compare des identifiants, donc un nœud déplacé n'est jamais signalé. Le message d'origine le mentionne
2. **Définition du trou** : garder la connexité physique, ou s'aligner sur Waymarked Trails et Knooppuntnet (rupture dans l'ordre de la liste) ? Liée au bug de 12432165
3. **Chargement de l'historique** : automatique quand on choisit une période (environ 1 000 appels pour 2952375) ou avec confirmation ? Plus il y a de testeurs, plus la confirmation s'impose
4. **Seuil des ruptures brèves** : 1 jour aujourd'hui, à régler selon les retours
5. **Moniteur** (comparer à une référence) : à reconsidérer si les retours le demandent

## Plus tard, hors périmètre actuel

- [ ] Moniteur : comparer un itinéraire à une référence (GPX, tracé), fonction de Knooppuntnet, proche de la demande de StC non retenue
- [ ] Mode télécommande JOSM (analyser une relation en cours d'édition)
- [ ] Mode temps réel sur toutes les relations d'un type : suppose un serveur (Knooppuntnet analyse toutes les 2 h), contredit « rien côté serveur »
- [ ] Comparer et fusionner des polygones LiDAR ou GPX avec OSM (demande de StC, trop floue)

## Fait

- [x] Mesures de faisabilité : CORS, volumes, Overpass trop lent (45 à 56 s), API OSM groupée (environ 1 s)
- [x] Détection : connexité (trou) séparée de l'ordre (liste mal triée), carrefours, raccords par le milieu, rôles (variante, excursion, accès, liaison, aller/retour), contour fermé des polygones
- [x] Arbre dépliable à la demande, lignes « Trou » et « Ordre » à leur place, tracé d'une super-relation, zoom et déplacement, sélection dans les deux sens (carte, arbre, enquête)
- [x] Enquête : périodes de rupture (les brèves regroupées), auteur, date, changeset avec commentaire, taille, éditeur, discussion ; notes et `fixme` des éléments
- [x] Frise à deux curseurs sous la recherche, « Analyser » applique la période, fenêtre sur les modifications, ajouts et suppressions, voile gris hors période
- [x] Chargement de tout l'historique par pages, pause et reprise (1 049 chemins en 21 à 34 s), calcul par tranches, calcul 6 fois plus rapide
- [x] Correction de la carte vide quand la date de fin recule (nœuds supprimés sans coordonnées)
- [x] 173 tests node:test, vérification en Chromium (`file://`, HTTP local, GitHub Pages)
- [x] README, premiers commits, `main` poussé, site en ligne sur GitHub Pages
- [x] Message d'annonce sur le forum OSM-FR, 17 messages de retour lus

## Abandonné

- Dichotomie sur des instantanés Overpass : remplacée par le balayage local des historiques chargés (exact, sans requête supplémentaire)
- Bandeau « prototype » dans la page : décision de l'utilisateur, le caractère prototype est dit dans le message d'annonce et dans le README
- Griser les éléments non modifiés dans la fenêtre : l'utilisateur veut qu'ils n'apparaissent pas, la période complète sert à tout voir
