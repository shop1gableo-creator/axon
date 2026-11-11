# AGENTS.md — Axon, pour une IA qui découvre le projet

Tu ne connais rien à Axon ? Lis dans cet ordre (≈ 15 min de lecture, tout le reste est du détail) :

1. **Ce fichier** : la carte.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) : qui fait quoi dans le code, comment les données circulent.
3. [`docs/STRUCTURE.md`](docs/STRUCTURE.md) : comment un cerveau (le dossier de notes) est organisé et pourquoi.
4. [`docs/OUTILS-MCP.md`](docs/OUTILS-MCP.md) : les outils que les IA utilisent (généré depuis le code).
5. Pour coder : [`docs/DEVELOPPER.md`](docs/DEVELOPPER.md) (recettes) et [`docs/SOURCES.md`](docs/SOURCES.md) (doc officielle de chaque librairie, à lire AVANT d'utiliser une API inconnue).
6. Pour l'avenir : [`docs/PASSAGE-A-L-ECHELLE.md`](docs/PASSAGE-A-L-ECHELLE.md) et [`docs/FEUILLE-DE-ROUTE.md`](docs/FEUILLE-DE-ROUTE.md).

## Axon en 6 lignes
- Un **cerveau** = un dossier de fichiers Markdown reliés par des `[[liens]]` (compatible Obsidian), sur le PC ou dans Google Drive.
- Un **moteur** (`core/`) le lit, construit le graphe des liens, cherche par mots ET par sens (modèle local), calcule des index.
- Un **serveur MCP** (`mcp/server.mjs`) donne ce moteur à toutes les IA : lire, chercher, créer, modifier, renommer, archiver (jamais de suppression, versions gardées).
- Une **app Electron** (`main.mjs` + `renderer/`) montre le cerveau en 3D, les notes, un accueil en direct.
- Une **CLI** (`cli/brain.mjs`) fait la même chose en ligne de commande (scripts, hooks, tests).
- Des **skills** (`skills/axon-*`) disent aux IA *comment* travailler avec un cerveau (capturer, répondre, compiler, entretenir, architecturer, fichiers, développer).
- Une **structure** unique (`core/structure.mjs`) : domaines de vie sur le même moule, journal et log par personne.

## Les dossiers du dépôt
| Chemin | Rôle |
|---|---|
| `core/` | Moteur sans Electron (partagé par app, CLI, MCP). Le cœur : `vault.mjs`. |
| `mcp/server.mjs` | Les outils `brain_*` (protocole MCP, stdio). |
| `cli/brain.mjs` | La ligne de commande (`init`, `cherche`, `contexte`, `sante`…). |
| `main.mjs`, `preload.cjs` | Processus principal Electron et pont sécurisé vers l'interface. |
| `renderer/` | L'interface : `src/*.js` → bundle esbuild `dist/app.js` ; styles `*.css`. |
| `skills/` | Les 6 skills (source unique, copiés dans chaque cerveau et dans `~/.claude/skills`). |
| `connector/` | Le paquet Claude Desktop (`manifest.json` ; `npm run connector` produit `Axon.mcpb`). |
| `setup/`, `Installer Axon.cmd`, `guide/` | Installateur Windows (double-clic) et guide HTML local. |
| `tools/` | Scripts annexes (import de banques de médias, construction du connecteur, tests). |
| `docs/` | Toute la documentation. |

## Règles d'or (valables pour toute modification)
1. Le cerveau reste **des fichiers lisibles** : aucune donnée enfermée dans une base propriétaire. Les caches (`.brain/`) se régénèrent.
2. **Jamais de suppression** : archiver dans `00-Inbox/_archive/`. Toute modification garde l'ancienne version (`.brain/versions/`).
3. **Jamais de secret** (clé, mot de passe) dans le code ni dans un cerveau.
4. Les mots d'un humain ne sont pas réécrits : une IA ajoute `## Synthèse IA`.
5. Fluide sur un PC normal : rien de lourd dans le processus de l'interface (modèle d'IA dans un processus séparé).
6. Tester sur un cerveau jetable : `node cli/brain.mjs init <dossier-temporaire>` puis `BRAIN_VAULT=<dossier>`.

## Commandes
```bash
npm install && npm run build      # dépendances + interface
npm start                         # lancer l'app
node cli/brain.mjs init <dossier> # créer un cerveau vierge
npm run connector                 # reconstruire Axon.mcpb (après un changement du serveur MCP)
```
