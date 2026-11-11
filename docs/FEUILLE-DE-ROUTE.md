# Feuille de route d'Axon (horizon long)

Principe : chaque brique est **indépendante et remplaçable** (moteur, MCP, app, skills, cerveau = fichiers). On peut construire dessus sans tout casser.

## Fait
- Moteur commun (app, CLI, MCP), recherche mots + sens en local, index Karpathy, santé, paquet `llms-full.txt`.
- 26 outils MCP dont agir sur les fichiers (modifier, créer, renommer, archiver, versions), 6 skills, prompts.
- Cerveau 3D (3 formes, physique Obsidian), accueil à widgets en direct, neurone ouvert en grand, historique.
- Cerveau vierge (`init`), premier lancement Personnel / Cloud, installateur Windows, connecteur Claude Desktop (`Axon.mcpb`).

- Installateur Windows (Setup.exe, Windows 10/11, sans Node.js), carte graphique hautes performances pour l'affichage, IA locale par paquets.

## Prochain (court terme)
0. Signature de l'installateur (certificat de signature de code) pour supprimer l avertissement SmartScreen ; mises à jour automatiques (electron-updater + Releases).
1. **Dépôt public** : app + docs + skills + un cerveau d'exemple vide ; site d'installation local (page d'accueil qui guide : installer, choisir Personnel/Cloud, brancher son IA).
2. Serveur MCP à l'écoute du dossier (plus de rescan) — voir [PASSAGE-A-L-ECHELLE.md](PASSAGE-A-L-ECHELLE.md).
3. Installateur macOS / Linux (`install.sh`).
4. Tests automatiques du moteur et du MCP (`tools/test-*.mjs` → `npm test`).

## Moyen terme
- Serveur MCP **distant** (HTTP streamable + authentification) → Axon dans claude.ai web et mobile.
- Niveau de détail du cerveau 3D (grappes, dépliage par région).
- Cache du parse + vecteurs binaires + SQLite FTS5 pour les très gros cerveaux.
- Synchro intégrée « deux personnes » plus simple (fusion automatique, alerte de conflit dans l'app).

## Long terme
- Plusieurs cerveaux reliés (perso + équipe) avec des liens entre cerveaux.
- Agents planifiés (consolidation chaque nuit, veille, rapports) qui écrivent dans le cerveau.
- Place de marché de skills et de connecteurs partagés entre utilisateurs.
