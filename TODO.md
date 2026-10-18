# TODO

## Fait
- [x] CLAUDE.md et TODO.md créés à partir du résumé de départ
- [x] CORS de l'API OSM et d'Overpass vérifiés
- [x] Volume de requêtes mesuré (EuroVelo 15 : environ 6 700 historiques en naïf)
- [x] Instantané daté Overpass (`[date:]`) testé sur 7444

- [x] Détection de discontinuités (11 tests) et page de départ, vérifiées en Chromium sur `file://` (7444 et 12586521)

## Prochaine étape
- [x] Lenteur : passage d'Overpass (45 à 56 s) à l'API OSM groupée (environ 1 s)
- [ ] Forensic : trouver un moyen d'obtenir l'état passé sans Overpass récursif lent (à mesurer : Overpass ciblé par chemin, historique en masse, ohsome)
- [ ] L'utilisateur teste la page sur des cas réels et dit si les trous signalés sont de vrais trous
- [ ] Tester `index.html` sur GitHub Pages
- [x] Séparer connexité (trou) et ordre (liste mal triée)
- [x] Rôles (variante, accès, aller/retour) et contour fermé des polygones
- [x] Forensic v1 sans Overpass (bouton Enquêter, 69 tests)
- [ ] Fiabiliser le forensic : l'approximation « chemins non chargés à leur état actuel » crée de fausses ruptures anciennes (voir CLAUDE.md)
- [ ] Vérifier à la main le changeset 190448839 (relation 2952375)

- [x] Arbre des relations (dépliable, à la demande) et tracé d'une super-relation
- [ ] Parents d'un élément (de l'enfant vers la relation) via `way/ID/relations`
- [ ] Niveau nœuds dans l'arbre, chargé à l'ouverture d'un chemin
- [x] Commentaire, taille et éditeur du changeset dans l'enquête (une ligne par changeset)
- [ ] Mesurer la sélection d'une zone (`changesets?bbox=`, `map?bbox=`)

- [x] Lignes « Trou » et « Ordre » dans l'arbre, sélection dans les deux sens carte et arbre
- [ ] Lignes pour les bouts ouverts des polygones, et pour les chemins isolés (variantes)

- [x] Discussions des changesets et tags note/fixme/description (arbre et enquête)
- [ ] Notes de carte OSM de la zone d'un trou (bruyant, à décider)
- [ ] Historique des tags note/fixme (ce qui a été écrit puis retiré), pas seulement l'état actuel

- [x] Frise à deux curseurs, fenêtre de période, vue à une date (approximative)
- [ ] PRIORITÉ : bouton « Charger tout l'historique » avec confirmation (nombre d'appels, environ 20 à 30 s pour 1 022 chemins), sans quoi les dates passées sont fausses
- [ ] Reconstituer les sous-relations et les positions de nœuds à une date

## À mesurer encore
- [ ] Instantané daté de EuroVelo 15 (poids, durée, 502 éventuels)
- [ ] Combien d'instantanés pour une dichotomie fiable (continuité qui casse puis se rétablit)
- [ ] Récupération de l'historique d'un seul élément via l'API OSM et correspondance avec les changesets
- [ ] Limites Overpass : quotas, serveurs miroirs, comportement sur la France (2202162)

## Plus tard
- [ ] Rôles aller/retour, schéma v2, arrêts de bus, rôles de randonnée
- [ ] Mode télécommande JOSM
- [ ] Mode temps réel (suppose un serveur, à rediscuter)
- [ ] Décider `file://` ou pas
