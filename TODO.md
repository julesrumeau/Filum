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
  - Constats du 21/10/2026 (API réelle) : **12432165** a un seul problème d'ordre restant (membres 32 à 33, deux trottoirs 493039306 et 1545417558 sans aucun nœud commun) : c'est sans doute ce que Knooppuntnet compte comme coupure (2 segments), Filum le classe « ordre » car la relation reste reliée par ailleurs. **20245275** : le bout d'un trottoir (1301536802) est posé sur le MILIEU du suivant (1301485285) : raccord en T, relation continue pour un marcheur, mais signalée « ordre » par la règle actuelle (bouts seulement). **15024156** : 302 chemins, 1 morceau, 0 trou, 0 ordre (Filum ne voit rien, cohérent avec l'idée d'un défaut de Waymarked Trails). Décision (21/10/2026) : le raccord en T reste « ordre » mais avec un message dédié (champ `touching`), voir « Décisions prises »

## P1. Lisibilité, saisie et confiance (retours demandés, rapides, très visibles)

- [x] [S] Liste des membres **repliée** (21/10/2026) : les suites de 3 chemins ou plus sans rien à signaler sont dans un bloc replié « N chemin(s) sans problème », les trous, lignes d'ordre et chemins au bord d'un trou restent visibles (2952375 : 47 lignes au lieu de 1 022). Un clic sur la carte ouvre le bloc qui contient le chemin. Pas appliqué dans la fenêtre sur une période
- [x] [S] **Saisie** (21/10/2026, `src/input.js`) : adresse openstreetmap.org (avec #map, /history...), `relation 123`, `r123`, `#123`. L'adresse d'un chemin ou d'un nœud donne une explication au lieu d'être prise pour une relation
- [x] [M] **Paramètres dans l'adresse** (21/10/2026) : `?relation=ID&du=AAAA-MM-JJ&au=AAAA-MM-JJ`, mis à jour à chaque analyse (sans effet si le navigateur refuse), relus au démarrage, la période déclenche la lecture de l'historique. Vérifié en file://
- [x] [S] **Légende de la frise** (21/10/2026) : phrase dédiée quand la relation n'a qu'une version
- [x] [S] **Libellé d'une relation** (21/10/2026, `tree.relationLabel`) : name (avec ref), sinon départ → via → arrivée, sinon ref. Reste : `stage`, nom de la relation parente. [M] puis le symbole `osmc:symbol` en graphique
- [x] [M] **Preuve avant/après** (21/10/2026) : sous chaque modification, un bloc « Preuve » replié : versions avant et après en données brutes de l'API (liens api.openstreetmap.org/api/0.6/.../N), historique complet, extrémités avant et après, nœuds retirés et ajoutés, tags avant et après, membres ajoutés et retirés (10 au plus par liste, le reste compté). Vérifié sur 2952375 : v220 → v221 retire bien le chemin 242380146 (contrôlé à part par l'API). Pas encore dans l'enquête par rupture (colonne de droite), seulement dans la liste
- [x] [M] **Frise : bulle au survol** (21/10/2026, `frise.hoverInfo`) : date sous la souris, version de la relation à moins de 6 px (auteur, changeset), rupture qui contient la date (début et fin, premiers responsables). Vérifié sur 2952375 : la rupture 2015-01-07 à 2024-12-17 (Guigos) s'affiche. Souris seulement, rien pour le tactile. Les chemins et nœuds ne sont pas sur la frise (seulement les versions de la relation)
- [x] [M] **Masquer les changements mineurs** (21/10/2026, `changes.impactDates` et `filterMinor`) : case à cocher sous la frise. Une modification est mineure si elle ne change que des tags ou ajoute/retire des nœuds à l'intérieur d'un chemin ET que le nombre de trous et de morceaux ne change pas à cette date. Sont toujours gardés : créations, suppressions, appartenance à la relation, rôles, extrémités changées. Limite : deux modifications à la même seconde partagent le verdict. Mesuré sur 2952375 depuis avril 2026 : 316 événements, 86 après filtre (230 masqués)
- [x] [M] **Trou sur la carte** (21/10/2026) : trait pointillé rouge entre les deux bouts libres les plus proches (les ronds existaient déjà). Le trait n'est pas cliquable (il gênerait les chemins), seulement surligné quand le trou est sélectionné
- [x] [S] **Zoom sur le chemin sélectionné** dans la liste (21/10/2026, `fit` dans `setupZoom`) : cadre le chemin avec de la marge, jamais plus de 60 fois. Pas d'animation
- [x] [M] **Fond de carte** (21/10/2026, `src/tuiles.js`) : bouton carré dans les commandes de zoom, tuiles tile.openstreetmap.org (zoom choisi pour 256 px, 40 tuiles au plus, ajoutées et retirées au déplacement), attribution affichée. Le tracé est passé en projection Web Mercator pour s'aligner sur les tuiles (avant : équirectangulaire corrigée par le cosinus). Vérifié sur 274225 : le polygone suit le parc et le plan d'eau, 9 tuiles en 200, aucune erreur ; en file:// les tuiles se chargent sans Referer. À surveiller : la politique d'usage des tuiles OSM (usage léger) si le site est très visité ; pas de fond sur les relations immenses (EuroVelo) non testé
- [x] [S] **Zones de clic** (21/10/2026, `pickAt`) : une pastille d'abord, sinon parmi les chemins qui se recouvrent sous le doigt, le plus proche du point (distance au segment). Mesuré sur 2952375 zoomé : 61 clics sur 80 au milieu d'un chemin choisissent le bon (contre 1 sur 80 avant) ; les autres tombent sur un nœud commun à deux chemins, où le choix reste ambigu

## P2. Fonctionnalités demandées qui élargissent l'outil

- [x] [M] **Nœuds membres** (21/10/2026) : chargés en un appel groupé (`fetchMemberNodes`), nom, ref et type (`public_transport=...`) dans l'arbre, carrés ocre sur la carte, bouton losange pour les masquer, sélection dans les deux sens. Vérifié sur le bus 9948029 (24 arrêts, clics dans les deux sens, aucune erreur). L'analyse les ignore toujours (ordre des arrêts non vérifié), masqués dans la fenêtre sur une période (positions et tags passés non reconstitués)
- [x] [S] **Relations parentes** (21/10/2026, `osmapi.fetchParents`) : « Fait partie de » sous le résumé, boutons qui lancent l'analyse de la relation parente (vérifié : 12432165 → 13668305 « Sur les pas des Huguenots »). Pour un chemin, voir le point suivant
- [ ] [M] **Dans quelle sous-relation est la discontinuité**, avec coloration par segments (le « chemin de fer » de Knooppuntnet)
- [x] [M] **Statistiques pour inciter à redécouper** (21/10/2026, `src/stats.js`) : bloc « Statistiques de la relation » replié sous le résumé : longueur totale (distance sur la sphère, chaque chemin une fois) et plus long chemin, relations, niveaux, chemins, nœuds, maximum de nœuds sur un chemin, 5 relations les plus chargées, avertissement au-delà de 300 membres (seuil à valider : « quelques centaines » selon les bonnes pratiques, pas une règle stricte). Contrôle de plausibilité : EuroVelo 15 Bâle-Karlsruhe 251 km. Pas de nombre de segments (voir le point « sous-relation »)
- [ ] [L] **Frise et forensic pour les relations parentes** (EuroVelo, schéma v2, relation 6438529) : historique de chaque sous-relation, par étapes. C'est l'hypothèse de départ (analyse récursive) qui n'est pas réalisée
- [ ] [M] **Détecter la cause probable** « chemin coupé, un morceau n'a pas été ajouté à la relation » (cas supposé de 2952375)
- [ ] [M] **Anneaux emboîtés** pour les polygones : contour, trous (`inner`), îlots dans les trous. Lignes dans l'arbre pour les bouts ouverts et les chemins isolés
- [x] [M] **Numéro de chemin** (21/10/2026) : `way 123`, `w123`, adresse openstreetmap.org/way/123. Une seule relation parente : elle est analysée et le chemin sélectionné ; plusieurs : liste de boutons ; aucune : message (nœuds, fermé ou ouvert). Vérifié sur 1301485285 (1 relation), 805380795 (6 relations), chemin inexistant. Il reste à analyser le CONTENU d'un parc qui n'est qu'un chemin fermé (point « Contenu d'un polygone »)
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

## Décisions prises (21/10/2026, sur demande de l'utilisateur de ne plus lui poser ces questions)

1. **Géométrie** : non pour l'instant. On compare des identifiants de nœuds ; un nœud déplacé ne casse pas le parcours, et suivre la forme coûterait l'historique de chaque nœud. À rouvrir si les retours le demandent
2. **Définition du trou** : connexité physique = trou (rouge), conformément à la définition posée au départ par l'utilisateur (plusieurs morceaux non reliés). Une rupture dans l'ordre de la liste sans trou physique reste « ordre » (orange), avec un message qui distingue le raccord en T (les deux chemins se touchent ailleurs qu'à un bout : couper un chemin règle le problème) du saut dans la liste (aucun nœud commun). Un raccord en T n'est PAS un trou : continu pour un marcheur, mais la bonne pratique OSM est de couper le chemin
3. **Chargement de l'historique** : automatique, avec estimation, barre de progression et pause (déjà en place). Une confirmation est à ajouter seulement si des abus apparaissent
4. **Seuil des ruptures brèves** : 1 jour, à régler selon les retours
5. **Moniteur** (comparer à une référence) : non, hors périmètre tant qu'aucun retour ne le demande

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
