---
name: axon-developpeur
description: Comprendre, réparer et étendre le CODE de l'application Axon (Electron, cerveau 3D, moteur, serveur MCP, CLI, connecteurs). À utiliser pour ajouter un outil MCP, un connecteur de données, un widget, une forme du cerveau 3D, corriger un bug, optimiser, ou expliquer comment Axon fonctionne.
---
# Développer Axon

Lis d'abord, dans le dépôt de l'app : `AGENTS.md` (carte rapide), puis `docs/ARCHITECTURE.md` (qui fait quoi), `docs/DEVELOPPER.md` (recettes pas à pas) et `docs/SOURCES.md` (documentation officielle de chaque librairie : va la lire avant d'utiliser une API que tu ne connais pas).

## Carte éclair
- `core/` = le moteur, **sans Electron** (utilisé par l'app, la CLI et le serveur MCP) : `vault.mjs` (lecture du coffre, graphe, recherche), `semantic.mjs` (recherche par le sens, local), `maintain.mjs` (index, santé, contexte), `scaffold.mjs` (cerveau vierge).
- `mcp/server.mjs` = les outils `brain_*` pour toutes les IA. `cli/brain.mjs` = les mêmes en ligne de commande.
- `main.mjs` (processus Electron) ↔ `preload.cjs` (pont) ↔ `renderer/src/*.js` (interface, bundle esbuild).
- `renderer/src/brain3d.js` = le cerveau 3D (3d-force-graph + three.js).

## Méthode
1. Lire le fichier concerné **en entier** avant de le modifier ; suivre le style existant (français dans les commentaires et l'interface).
2. Petits changements, testés : `node --check`, `npm run build`, puis la commande ou l'outil concerné sur un **cerveau de test** (`node cli/brain.mjs init <dossier temporaire>` puis `BRAIN_VAULT=<dossier>`), jamais sur le vrai cerveau.
3. Interface : lancer l'app (`npm start`) et regarder ; captures automatiques avec la variable `BRAIN_STEPS` (voir `main.mjs`).
4. Après un changement du serveur MCP : reconstruire le connecteur (`npm run connector`) et le dire.
5. Écrire ce qui a changé dans le cerveau (note `Brain app` / journal) et dans `docs/` si l'architecture bouge.

## Interdits
- Jamais de secret (clé API, mot de passe) dans le code ni dans le cerveau : variables d'environnement ou réglages locaux.
- Ne jamais supprimer de fichier du cerveau depuis le code : archiver dans `00-Inbox/_archive/`.
- Pas de dépendance lourde sans raison : le cerveau doit rester fluide sur un PC normal.
