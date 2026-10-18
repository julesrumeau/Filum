# Filum

Outil web pour analyser les relations OpenStreetMap (itinéraires de randonnée, vélo, bus, polygones, limites administratives) : trouver où elles sont discontinues, et retrouver QUI les a cassées et QUAND, en remontant l'historique de chaque membre, récursivement. Projet frère de Scopus (https://github.com/julesrumeau/Scopus), même philosophie, autre sujet. Nom : "Filum" (latin : le fil).

## Origine du besoin

Un contributeur OSM-FR écrit qu'il manque un analyseur d'itinéraires universel. Une relation contient au moins un segment, chaque segment doit être continu et ordonné (fermé pour un polygone ou une limite administrative). Le point difficile est l'analyse forensic : chaque membre évolue indépendamment, donc raccourcir un chemin, ajouter ou supprimer un nœud au milieu, déplacer un nœud, cassent la continuité sans que la relation change (mêmes membres, même ordre). Regarder les versions de la relation ne suffit pas.

Trois modes souhaités : temps réel (toutes les relations d'un type), forensic (une relation entre deux dates), télécommande (relation en cours d'édition, via JOSM). Périmètre retenu pour commencer : FORENSIC SEUL, UNE relation de taille raisonnable, dans le navigateur, randonnée et vélo d'abord.

Hors sujet pour l'instant : comparer et fusionner des polygones LiDAR ou GPX avec OSM (demande de StC, trop floue).

Particularités par type à traiter plus tard : rôles aller/retour (vélo, voiture, bus V1), arrêts de bus, schéma v2 (relation parente et une sous-relation par sens), rôles de randonnée (variante, accès, excursion, liaison), membres nœuds ou relations, polygones fermés.

## Outils existants (aucun essayé à fond)

FacilMap (`relation <id>`, `blame relation <id>`, lent, non récursif selon le test de l'utilisateur), Relation Analyzer (ra.osmsurround.org), Osmose, Waymarked Trails, Geofabrik OSMInspector, osm-history (pewu), osm-deep-history, requête QLever. Hypothèse de valeur à vérifier : l'analyse récursive de l'historique (relation, sous-relations, chemins, nœuds) est ce que les autres ne font pas.

## Mesures de faisabilité (18 octobre 2026)

Relations de test :
- 12586521 : EuroVelo 15 Rheinradweg, super-relation. Récursivement : 149 relations, 910 chemins, 5 623 nœuds (1,9 Mo en JSON Overpass). 70 versions de la relation racine.
- 7444 : Paris, limite administrative. 21 sous-relations, 88 chemins en direct (217 chemins et 2 351 nœuds en récursif à la date du 2020-01-01). 204 versions.
- 2202162 : France niveau 2, 1 758 membres, version 754. Test de charge.

API OSM (`api.openstreetmap.org/api/0.6`) :
- CORS ouvert (renvoie l'origine demandée), utilisable depuis un navigateur.
- `relation/<id>/history` : un appel par élément. `relation/<id>/full` ne descend PAS dans les sous-relations (12586521 renvoie 149 relations et zéro chemin).
- Pas d'historique en masse. Approche naïve sur EuroVelo 15 : environ 6 700 requêtes. Inacceptable (politique d'usage OSMF) : c'est la cause de la lenteur de FacilMap.

Overpass (`overpass-api.de/api/interpreter`) :
- CORS `*`. Exige un User-Agent identifiable en dehors du navigateur (sinon HTTP 406). Quota : 2 slots, des 502 ponctuels (une relance a suffi).
- `rel(ID);>>;out meta;` donne toute la hiérarchie récursive en UNE requête, avec version, changeset, utilisateur et date de chaque élément.
- `[date:"AAAA-MM-JJT00:00:00Z"]` donne l'état de la relation et de ses membres à cette date, en une requête. Fonctionne (testé sur 7444 en 2020).

## État du code et pièges

- `src/continuity.js` : logique pure (`analyzeContinuity`, `analyzeTree`), testée par `npm test` (69 tests). Deux notions séparées : (1) CONNEXITÉ = les chemins forment-ils un seul morceau (regroupement par nœuds partagés, n'importe où dans le chemin) ; plusieurs morceaux = vrai TROU (`gaps`, rouge). (2) ORDRE = chaque chemin se raccorde-t-il par un bout au précédent dans la liste ; sinon `orderIssues` (orange), sans trou. Un carrefour partagé par 3 ou 4 chemins ne pose donc plus de fausse alerte. RÔLES : alternative, excursion, approach, connection sont à part (hors chaîne principale, `detached` si elles ne touchent rien) ; un passage forward/backward fait recommencer la chaîne sans problème d'ordre (mais reste un trou si les deux morceaux ne partagent aucun nœud). POLYGONES (type multipolygon ou boundary) : on ne regarde pas l'ordre ni le nombre de morceaux (îles possibles) mais les BOUTS OUVERTS (`openEnds` : nœud où arrive un nombre impair de bouts de chemins), outer et inner séparément ; un chemin sans rôle compte comme outer. Paris 7444 : contour fermé, 0 bout ouvert. Limites : un nœud où 3 chemins finissent donne un faux bout ouvert, un raccord de bout sur le milieu d'un autre chemin aussi. Sur 8 relations de Strasbourg testées les rôles n'ont presque rien changé (les trous restent), elles utilisent peu de rôles. Ne gère PAS les nœuds membres. Limite connue : une liste qui alterne entre deux morceaux (A, B, A) produit plusieurs trous pour un seul vrai.
- `src/osmapi.js` : récupération de l'état ACTUEL via l'API OSM en appels groupés (`relations.json?relations=a,b,c`, `ways.json?ways=...`, 700 ids max par appel), niveau par niveau pour les sous-relations. EuroVelo 15 : 4 appels, environ 1 s. Les nœuds (coordonnées) ne sont chargés que pour la relation cliquée, la continuité n'en a pas besoin. Piège : un appel groupé échoue en entier si un id n'existe pas (pas encore géré).
- `src/overpass.js` : instantané à une date (`[date:]`), PAS chargé par la page pour l'instant, réservé au futur forensic. MESURÉ LE 18/10/2026 : 45 s (12586521) et 56 s (7444) avant le premier octet, avec des 502 « at capacity » fréquents, et les miroirs overpass.private.coffee et overpass.kumi.systems répondent 500. Overpass récursif (`>>`) est donc trop lent pour l'interactif : à repenser pour le forensic (peu d'instantanés, requêtes ciblées, ou autre source).
- `src/viewport.js` : zoom/déplacement du tracé (fonctions pures testées, 23 tests au total). Le tracé est un SVG dont la vue (viewBox) est calculée à la taille du conteneur, sinon la souris et le dessin se décalent (letterbox). Traits en `non-scaling-stroke`, pastilles rouges à rayon recalculé pour rester à 6 px.
- `src/app.js` + `index.html` : page de départ (liste des relations et tracé SVG sans carte de fond, discontinuités en rouge).
- Vérifié en vrai Chromium depuis `file://` : le CORS d'Overpass passe. Piège : quand Overpass répond 502/504, la réponse n'a pas d'en-tête CORS et le navigateur affiche une erreur CORS trompeuse. Les réessais couvrent le cas.
- Test navigateur : Playwright installé hors dépôt (`playwright-core`), Chromium du cache Playwright. Il manquait `libnss3` et `libnspr4` : récupérés avec `apt-get download` + `dpkg -x` dans le scratchpad, puis `LD_LIBRARY_PATH`. Sans droits root.
- Non vérifié : fiabilité des discontinuités signalées sur de vrais cas (faux positifs probables tant que les rôles ne sont pas gérés). Paris (7444) : 0 problème sur 21 relations, à confirmer à la main.

## Forensic : mesure faite le 18/10/2026 (relation 2952375, 5 trous)

Insight clé : la continuité se calcule sur les IDENTIFIANTS de nœuds. Déplacer un nœud ne casse donc rien. Seuls comptent (1) la liste des membres de la relation et (2) la liste de nœuds de chaque chemin. Pas besoin de l'historique des nœuds. Mesures via l'API OSM seule (sans Overpass) : état actuel 3 appels, 1,1 s ; historique des 9 chemins aux bords des trous, 9 appels en parallèle, 0,5 s ; historique de la relation (221 versions) 1 s. On sait alors lire pour chaque chemin quelle version a changé ses extrémités (auteur, date). Exemple : plusieurs chemins modifiés le 2026-10-13 par le même contributeur. Ceci est une piste, PAS un forensic validé : changement d'extrémité n'implique pas faute (un contributeur peut réparer ou raccrocher). Reste à faire : retrouver la date exacte où le trou apparaît (recalcul de la continuité à chaque version, sans Overpass) et gérer les membres retirés de la relation.

## Arbre (18/10/2026)

- `src/tree.js` (pur, testé, 86 tests au total) : `buildTree(snapshot, rootId)` donne l'arbre relation > sous-relations > chemins > nœuds membres, avec rôle, version, auteur, date, changeset, statut (bon/ordre/mauvais), résumé, chemins « bord de trou », cycles et membres manquants. `wayRefsOf` réunit tous les chemins d'une relation et de ses sous-relations (sert au tracé : une super-relation affiche toutes ses étapes).
- La page remplace la liste plate par cet arbre en `<details>`, enfants dessinés SEULEMENT à l'ouverture (1 022 membres sans ralentir). Bouton « Tracé » par relation. Les nœuds d'un chemin ne sont pas dans l'arbre (non chargés), et il n'y a pas encore le sens inverse (parents d'un élément).
- Idée de l'utilisateur à étudier : sélection d'une zone sur la carte avec l'historique des éléments. À mesurer avant (API `changesets?bbox=` probablement moins chère que l'historique de chaque élément). Piège : un changeset peut être énorme et sans rapport (190448839 : 4 554 changements, « Trottoirs et passages piétons », a coupé des chemins du sentier 2952375), l'enquête affiche maintenant commentaire, taille et éditeur (`fetchChangesets`, `changesets.json?changesets=a,b,c`, lots de 50), regroupés par changeset. 94 tests au total.

## Sélection carte et arbre (18/10/2026)

- `buildTree` insère des LIGNES `gap` (trou) et `order` (problème d'ordre) dans l'arbre, juste avant le membre qui ne se raccorde pas, avec chemin d'avant (`fromRef`), chemin d'après (`toRef`), bouts libres. `findPath(tree, match)` donne le chemin racine vers cible. 103 tests au total.
- Clic sur une ligne chemin/trou/ordre de l'arbre : surbrillance sur la carte (chemins en violet, pastille qui change de couleur) et, pour un trou, centrage et zoom x6. Clic sur un chemin ou une pastille de la carte : l'arbre ouvre les relations parentes, surligne et défile. L'ENQUÊTE suit aussi la sélection (chemins concernés en violet gras, ligne du changeset surlignée) et un clic sur un chemin de l'enquête le sélectionne partout ; la sélection faite avant l'enquête est réappliquée. Clic dans le vide : désélection. Un glissement (plus de 4 px) ne sélectionne rien.
- Détails techniques : chaque chemin est dessiné deux fois (trait épais invisible de 14 px pour le clic, trait fin visible) ; `elementFromPoint` au `pointerup` car la capture du pointeur redirige l'événement vers le svg. Piège : deux chemins voisins se recouvrent dans la zone de clic, le dernier dessiné gagne. Un chemin présent dans plusieurs relations : la première occurrence est ouverte dans l'arbre. Les bouts ouverts de polygones n'ont pas de ligne dans l'arbre (pastilles seulement).

## Explications laissées par les contributeurs (18/10/2026)

Sources vérifiées sur 2952375 : (1) commentaire du changeset (déjà affiché) ; (2) discussion du changeset (`changeset/ID.json?include_discussion=true`, champ `changeset.comments` : visible, user, date, text ; seulement si `comments_count` > 0, environ 4 % des changesets d'une zone ; affichée dans l'enquête, commentaires masqués exclus) ; (3) tags `note`, `fixme`, `description`, `comment` (toutes langues, toute casse) des chemins et relations, affichés dans l'arbre (état ACTUEL seulement, pas l'historique des tags) ; (4) Notes de carte OSM de la zone (`notes.json?bbox=`) : 3 trouvées autour des trous de 2952375, sans rapport (non implémenté, bruyant). Constat : sur 2952375, 33 notes d'éléments existent mais aucune sur un chemin au bord d'un trou, et les 3 changesets n'ont aucune discussion : le seul indice reste le commentaire du changeset (« Trottoirs et passages piétons »). Affichage des notes et discussions testé avec des données INJECTÉES (fausses) dans le navigateur, pas sur un cas réel. 109 tests au total.

## Frise à deux curseurs (18/10/2026)

- `src/frise.js` (pur, testé) : `toFraction`/`fromFraction` (échelle de dates), `truncateCtx` (historique jusqu'à la date de fin), `clipSpans` (fenêtre : retire les ruptures terminées avant la date de début, marque `startsBeforeWindow`), `bandsOf`, `tickFractions`. `osmapi.fetchRelationHistory`. 122 tests au total.
- Page : sous l'arbre, deux `<input type=range>` superposés (zéro dépendance), repères = versions de la relation (1 appel à l'affichage), bandes rouges = périodes de rupture après « Enquêter sur la période ». Sens validé par l'utilisateur : curseur de DROITE = date de l'état analysé (arbre, carte, trous reconstitués, versions postérieures ignorées) ; curseur de GAUCHE = ne limite que la liste des modifications et ruptures de l'enquête, sans fausser l'état. Extrémités = vue actuelle. La frise ne s'applique qu'à une relation qui contient directement des chemins (pas aux super-relations).
- PROBLÈME CONNU, MAJEUR : tant que seuls 60 chemins ont leur historique lu, la vue à une date passée est FAUSSE. Mesuré sur 2952375 au 2022-10-10 : 109 trous, 96 morceaux, 10 chemins absents (résultat absurde), parce que les chemins non lus sont pris dans leur état actuel alors qu'ils ont été coupés depuis. La page affiche « ATTENTION, NON FIABLE » et les bandes sont rayées, mais la frise paraît presque entièrement rouge. Remède : charger l'historique de tous les chemins membres à la date voulue. Mesuré : 160 historiques en 5 s (concurrence 8) ou 3 s (16), soit environ 20 à 30 s pour 1 022 chemins. À proposer avec confirmation (nombre d'appels affiché), pas en silence. Les positions (nœuds) à une date ne sont pas reconstituées non plus (nœuds actuels seulement).

## Forensic : état du code (18/10/2026)

- `src/forensic.js` (pur, testé) : `stateAt` (relation et chemins à une date, à partir des historiques), `timeline` (continuité après chaque version), `findBreaks` (périodes de rupture : début avec versions responsables, fin = réparation ou null, `fromCreation`), `borderWayRefs` (chemins à examiner). Pas de dichotomie : les historiques sont chargés une fois puis balayés en local, c'est exact et sans requête supplémentaire.
- `fetchHistoryContext` (osmapi.js) : historique de la relation + des chemins aux bords des trous + des chemins retirés de la relation au fil du temps, max 60 chemins, 8 appels en parallèle. Les autres chemins sont pris dans leur ÉTAT ACTUEL.
- Bouton « Enquêter » dans la page (relations avec trou). 2952375 : 5 s, 0 erreur console.
- LIMITE MAJEURE : l'approximation « autres chemins à l'état actuel » peut fabriquer de fausses périodes anciennes. Sur 2952375 le résultat annonce une rupture « dès la création » (2013) réparée en 2026, avec la limite de 60 chemins atteinte : à ne PAS croire. La rupture récente (changeset 190448839, 2026-10-13, relation v221 + 9 chemins dans un seul changeset) est plus crédible mais pas vérifiée à la main. Pour fiabiliser : charger tous les chemins ayant été membres (coûteux) ou ne remonter que jusqu'à la dernière période où l'approximation tient.
- Un seul changeset qui touche la relation et plusieurs chemins = probablement un travail de restructuration, pas forcément une faute.

## Conséquence de conception (ancienne piste Overpass, à relativiser) (à valider avec l'utilisateur)

Ne pas récupérer l'historique de chaque élément. Prendre des instantanés datés (Overpass `[date:]`), tester la continuité à chaque date, chercher par dichotomie la première date où elle casse (environ log2 du nombre de dates, soit une dizaine de requêtes). Ensuite seulement, aller chercher via l'API OSM l'historique des quelques éléments fautifs pour désigner le changeset et le contributeur. À vérifier : coût d'un instantané de grosse relation (EuroVelo 15 daté), précision de la dichotomie quand la continuité casse puis se rétablit plusieurs fois.

## Conventions

- Statique, sans serveur, sans compte, sans étape de construction. À décider : tenir en `file://` comme Scopus (les requêtes réseau ne posent pas de problème en soi).
- Scripts classiques (pas de modules ES) si `file://` est retenu. Zéro dépendance si possible, pas de CDN, toute dépendance est à justifier.
- Développement : tests d'abord, les voir échouer (node:test). Branche `dev`, fusion dans `dev` avec `--no-ff` seulement quand l'utilisateur le dit, publication sur `main` (fast-forward) seulement sur son ordre, avec `npm test` et un test de fumée (Chromium, Playwright hors dépôt) avant et après, puis vérification du site publié.
- Vérifier en vrai navigateur avant de dire que c'est bon. Dire clairement ce qui n'a pas été vérifié.
- Garde-fou de taille : fonction 100 lignes, fichier 1000 (à reprendre si utile).
- Tenir `CLAUDE.md` (décisions, pièges, mesures) et `TODO.md` à jour.

## Écriture et communication

- Jamais de tiret cadratin (le long tiret) dans ce qui est écrit : interface, aide, README, commits, réponses. Utiliser deux-points, virgule, point ou parenthèses.
- Interface et aide en français, vouvoiement.
- Commits terminés par : `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
- Réponses : français, directes, honnêtes sur ce qui est vérifié ou non. Pas de caractères parasites en début de ligne (pas de "> ") dans les brouillons pour le forum. Messages pour le forum OSM-FR : courts, naturels, sans justification excessive.

## L'utilisateur

Jules Rumeau. Développe Scopus en projet personnel. N'EST PAS spécialiste d'OpenStreetMap : il apprend. Expliquer simplement le vocabulaire OSM (nœud, chemin, relation, membre, rôle, version, changeset, multipolygone). Il veut comprendre le besoin réel avant de construire, ne veut pas harceler ses interlocuteurs, et veut tester lui-même sur des cas réels.
