# TODO

Mis à jour le 18 octobre 2026. Contexte, mesures et pièges : voir CLAUDE.md.

## À faire, par priorité

### 1. Valider le forensic (le plus important)
- [x] Trous confirmés à l'œil par l'utilisateur sur 2952375 (la détection de trous n'est pas en cause)
- [x] Attribution vérifiée sur 2952375 par l'API : chemin 805380795, v7 (2026-08-02, Axelos) puis v8 (2026-10-13, simonpct, changeset 190448839), les nœuds 1164755103 et 13609807986 (ses deux extrémités) sont retirés, ce qui le détache de ses voisins
- [ ] L'utilisateur contrôle lui-même ces faits sur osm.org (liens complets en https://www.openstreetmap.org/way/805380795/history et api.openstreetmap.org/api/0.6/way/805380795/7 et /8). Il a eu un 404 de son côté, non reproduit : lien exact à redemander
- [ ] Afficher la preuve dans Filum (avant/après : nœuds retirés et ajoutés, extrémités, liens complets) sous chaque modification de l'enquête, pour que chacun puisse contrôler sans aller sur osm.org
- [ ] Vérifier si les morceaux retirés du chemin 805380795 existent comme chemins séparés absents de la relation (hypothèse « coupé, morceau non ajouté »)
- [ ] Contrôler sur 2 ou 3 autres relations avec trous (Strasbourg : 1623019, 10017827, 2910706, 48361, 9974539), et comparer avec Waymarked Trails (onglet « Analyse relation »)
- [ ] Expérience contrôlée sur le serveur de test d'OSM (`master.apis.dev.openstreetmap.org`, jamais sur la vraie base) : casser soi-même une relation et voir si Filum le retrouve. Demande une adresse d'API configurable. Non essayé
- [ ] Plus tard, un seul cas précis à un contributeur OSM-FR, avec message court et naturel

### 2. Fiabilité de la détection
- [ ] Un nœud où 3 chemins se terminent donne un faux bout ouvert (polygones)
- [ ] Un bout de chemin posé sur le milieu d'un autre donne un faux bout ouvert (polygones)
- [ ] Une liste qui alterne entre deux morceaux (A, B, A) produit plusieurs trous pour un seul
- [ ] Les nœuds membres (poteaux, points de passage, arrêts) sont ignorés
- [ ] L'appel groupé échoue en entier si un identifiant n'existe pas (404 sur tout le lot)
- [ ] Une variante qui relie deux morceaux ne comble pas le trou : décision à confirmer avec un contributeur

### 3. Forensic : aller plus loin
- [ ] Frise pour les relations parentes (EuroVelo, schéma v2) : demande l'historique de chaque sous-relation, par étapes
- [ ] Fenêtre sur les modifications : afficher aussi les nœuds membres modifiés, les sous-relations, et un résumé par changeset
- [ ] Détecter la cause probable « chemin coupé, un morceau n'a pas été ajouté à la relation » (cas supposé de 2952375)
- [ ] Forensic récursif sur les super-relations et sous-relations (schéma v2, EuroVelo). Aujourd'hui l'enquête ne porte que sur une relation qui contient directement des chemins, c'est l'hypothèse de départ (analyse récursive) qui n'est pas réalisée
- [ ] Positions des nœuds supprimés depuis (un ancien chemin est dessiné avec des trous : `node/ID/history` coûte un appel par nœud)
- [ ] Reconstituer à une date : les positions des nœuds (la carte utilise les positions actuelles) et les sous-relations
- [ ] Décider pour la géométrie : suivre ou non l'historique de la forme (nœud déplacé, nœud ajouté au milieu). Aujourd'hui on compare des identifiants, donc un nœud déplacé n'est jamais signalé. Le message d'origine le mentionne
- [ ] Historique des tags `note` et `fixme` (ce qui a été écrit puis retiré), pas seulement l'état actuel
- [ ] Notes de carte OSM de la zone d'un trou (3 trouvées autour de 2952375, sans rapport : bruyant, à décider)

### 4. Autres types de relations
- [ ] Transports en commun : arrêts, ordre des arrêts, schéma v2 (relation parente et une sous-relation par sens), bus schéma v1
- [ ] Parcours de santé (jamais essayé)
- [ ] Rôles de randonnée : vérifier d'autres rôles que alternative, excursion, approach, connection

### 5. Interface
- [ ] Anneaux emboîtés pour les polygones : regrouper les chemins en anneaux fermés et montrer contour, trous (`inner`) et îlots dans les trous. Aujourd'hui les chemins sont listés à plat
- [ ] Contenu d'un polygone (objets géographiquement dedans : arbres, bancs, aire de jeux...). Pas un lien OSM : `/map?bbox=` puis test point dans polygone en local. Mesuré sur le parc de l'Orangerie (274225) : 1,6 s, 3 176 arbres, 177 bancs, 53 lampadaires. Limites : l'API refuse les grandes zones (environ 0,25 degré carré ou 50 000 nœuds), état actuel seulement, pas de forensic de ces objets
- [ ] Accepter un numéro de chemin (way) comme point de départ : beaucoup de parcs sont un simple chemin fermé, pas une relation
- [ ] Lignes dans l'arbre pour les bouts ouverts des polygones et pour les chemins isolés (variantes)
- [ ] Parents d'un élément (de l'enfant vers la relation) via `way/ID/relations`
- [ ] Niveau nœuds dans l'arbre, chargé à l'ouverture d'un chemin
- [ ] Sélection d'une zone sur la carte : mesurer d'abord `changesets?bbox=` et `map?bbox=`
- [ ] Zones de clic imprécises quand deux chemins sont très proches (le dernier dessiné gagne)
- [ ] Tester l'écran tactile, un petit écran réel, et d'autres navigateurs que Chromium
- [ ] Un chemin présent dans plusieurs relations n'ouvre que sa première occurrence dans l'arbre

### 6. Déploiement et hygiène du dépôt
- [ ] Publier sur GitHub Pages : pousser `main` sur `origin` (git@github.com:julesrumeau/Filum.git) puis activer Pages. Testé seulement en `file://` et en HTTP local. Le dépôt doit être public pour Pages gratuit (non vérifié)
- [ ] Toujours donner des liens osm.org complets et cliquables (https://www.openstreetmap.org/...)
- [ ] Retirer le code mort : `src/overpass.js` (plus chargé par la page), `truncateCtx` dans `src/frise.js` (plus utilisé)
- [ ] Vérifier la règle de taille (fonction 100 lignes, fichier 1000) : `src/app.js` fait environ 700 lignes
- [ ] Ajouter un test de fumée navigateur (Playwright, hors dépôt) à la procédure de publication, puis publier sur `main` seulement sur ordre

## Plus tard, hors périmètre actuel
- [ ] Mode télécommande JOSM (analyser une relation en cours d'édition)
- [ ] Mode temps réel sur toutes les relations d'un type : suppose un serveur, contredit « rien côté serveur », à rediscuter
- [ ] Comparer et fusionner des polygones LiDAR ou GPX avec OSM (demande de StC, non retenue : trop floue)

## Fait
- [x] CLAUDE.md et TODO.md, mesures de faisabilité (CORS, volumes, Overpass trop lent à 45 à 56 s, API OSM groupée à environ 1 s)
- [x] Détection : connexité (trou) séparée de l'ordre (liste mal triée), carrefours, raccords par le milieu
- [x] Rôles (variante, excursion, accès, liaison, aller/retour) et contour fermé des polygones
- [x] Arbre dépliable à la demande, lignes « Trou » et « Ordre » à leur place, tracé d'une super-relation
- [x] Zoom et déplacement du tracé, sélection dans les deux sens (carte, arbre, enquête)
- [x] Enquête : périodes de rupture, auteur, date, changeset avec commentaire, taille, éditeur, discussion ; notes et fixme des éléments
- [x] Frise à deux curseurs (début : filtre l'enquête, fin : état reconstitué), vue à une date
- [x] Chargement de tout l'historique par pages, pause et reprise (1 049 chemins en 21 à 34 s), calcul par tranches
- [x] Frise sous la recherche, « Analyser » applique la période (plus de bouton Enquêter), fenêtre sur les modifications, ajouts et suppressions (comme demandé par l'utilisateur)
- [x] Optimisation du calcul (16 ms à 2,7 ms par analyse de 986 chemins)
- [x] 166 tests node:test, vérification en Chromium sur `file://`
- [x] Premier commit sur `dev`

- [x] README (utilisation, limites, politique d'usage de l'API, développement) et commit de tout sur `main`
- [x] Pas de bandeau « prototype » dans la page : décision de l'utilisateur, le caractère prototype est dit dans le message d'annonce et dans le README

## Abandonné
- Dichotomie sur des instantanés Overpass : remplacée par le balayage local des historiques chargés (exact, sans requête supplémentaire)
- Décision `file://` : tranchée, Filum tient en `file://` et se déploie sur GitHub Pages
