# Architecture d'Axon

## Vue d'ensemble

```
                 ┌──────────────── le CERVEAU (dossier de fichiers) ────────────────┐
                 │ notes .md (frontmatter YAML + [[liens]]) · médias · .brain/ (caches) │
                 └──────────────▲──────────────────────────────▲────────────────────┘
                                │ lit / écrit                  │ lit / écrit
                    ┌───────────┴───────────┐        ┌─────────┴─────────┐
                    │   core/ (le moteur)   │        │  Obsidian, Explorer, │
                    │ vault · semantic ·    │        │  Git, Google Drive…  │
                    │ maintain · scaffold…  │        └──────────────────────┘
                    └──▲────────▲────────▲──┘
                       │        │        │
          ┌────────────┘        │        └─────────────┐
 ┌────────┴────────┐  ┌─────────┴────────┐  ┌──────────┴─────────┐
 │ App Electron    │  │ Serveur MCP      │  │ CLI                 │
 │ main.mjs ↔      │  │ mcp/server.mjs   │  │ cli/brain.mjs       │
 │ preload ↔ UI    │  │ (Claude, Cursor, │  │ (scripts, hooks,    │
 │ (cerveau 3D)    │  │  Codex, Gemini…) │  │  tests)             │
 └─────────────────┘  └──────────────────┘  └─────────────────────┘
```

Un seul moteur, trois façons d'y accéder. **La vérité est toujours le dossier** : l'app, le MCP et la CLI peuvent tourner en même temps, chacun relit les fichiers.

## Le moteur (`core/`)

| Fichier | Rôle | Points clés |
|---|---|---|
| `vault.mjs` | Classe `Vault` : parcourt le dossier, lit chaque note (gray-matter pour le frontmatter), extrait liens `[[…]]`, intégrations `![[…]]`, tags, résumé ; construit le graphe et l'index plein texte (MiniSearch). Crée, écrit, importe. | **Scan incrémental** : une note dont la date et la taille n'ont pas changé n'est pas relue. `resolve(nom)` trouve une note par titre ou chemin. |
| `semantic.mjs` + `semantic-worker.mjs` | Recherche **par le sens** : chaque note → vecteur (modèle `embeddinggemma-300m` ONNX, quantifié q8, 100 % local via transformers.js). Cache dans `.brain/`. | Dans l'app, le modèle tourne dans un **processus séparé** (utilityProcess) pour ne jamais bloquer l'interface. |
| `maintain.mjs` | Méthode Karpathy : `buildIndexes` (un `_index.md` par dossier), `lint` (santé), `hybrid` (mots + sens, fusion des rangs), `contextPack` (paquet compact pour répondre, budget de mots), `personalizedPageRank` (propagation dans les liens), `meta`. | `contextPack` est ce qui fait économiser des tokens : l'IA reçoit les bons passages, pas les notes entières. |
| `pack.mjs` | Génère `llms.txt` et `llms-full.txt` (format llmstxt.org) : le cerveau lisible par une IA **sans outils**. | |
| `structure.mjs` | **La structure** : chemins (`P`), moule d un domaine, domaines par défaut, régions fixes, chemins du journal et du log par personne. | Source unique : tout le code passe par là. |
| `scaffold.mjs` | `createEmptyBrain` (cerveau vierge), `creerDomaine`, `ajouterMembre`. | Ne remplace jamais un fichier existant. |
| `office.mjs` | Excel (ExcelJS), Word et PowerPoint (XML dans le zip) : lire et modifier sur place sans casser la mise en forme. | Un remplacement peut traverser plusieurs « runs » d un paragraphe. |
| `claude-connect.mjs` | Branche / débranche Claude Desktop (toutes les configs trouvées, avec sauvegarde) et Claude Code ; copie les skills. | Utilise Node s il existe, sinon Electron en mode Node. |
| `skills.mjs` | Charge les skills (`app/skills` + `.claude/skills` du cerveau) ; les copie dans un nouveau cerveau. | |
| `regions.mjs` | Les régions du cerveau 3D, lues depuis la note `99-Systeme/Regions du cerveau.md` (configurable sans code). | |
| `docs.mjs`, `enrich.mjs`, `ocr-cli.mjs` | Extraction de texte : PDF/Word/Excel/PowerPoint → Markdown ; vidéo/son → transcription Whisper ; image → OCR Tesseract. Le contenu des médias devient cherchable. | OCR dans un processus Node à part (Tesseract se bloque dans Electron). |
| `connectors.mjs`, `live.mjs`, `apis.mjs` | Données externes : connecteurs qui écrivent `95-Flux/` (historique daté) ; flux en direct pour l'accueil (Binance WebSocket, Yahoo, Open-Meteo) **sans écrire** dans le cerveau. | Uniquement des API publiques sans clé. |
| `chat.mjs` | Le « modèle » intégré : navigation résolue localement, sinon Claude via Claude Code. | |
| `open.mjs` | Ouvre le cerveau hors de l'app (CLI, MCP) avec les mêmes réglages (`%APPDATA%/brain/settings.json`, variable `BRAIN_VAULT`). | |

## Le serveur MCP (`mcp/server.mjs` + `mcp/office-tools.mjs`)
- SDK officiel `@modelcontextprotocol/sdk`, transport **stdio**. Nom du serveur : `axon`.
- **Outils** (`registerTool`, schémas zod) : voir [OUTILS-MCP.md](OUTILS-MCP.md).
- **Prompts** : `demarrer` + un prompt par skill (`axon-capturer`, …) → dans Claude Desktop, menu « + ».
- **Ressources** : `brain://commencer-ici`, `brain://memoire-ia`, `brain://contexte-complet`, et le modèle `axon://fichier/{+chemin}` (n'importe quel fichier).
- Sécurités : chemins confinés au cerveau, refus des fichiers à nom sensible, version gardée avant chaque modification, protection des notes humaines (`auteur:` ≠ IA → accord explicite requis).
- Empaquetage Claude Desktop : esbuild en un fichier (`connector/server/index.mjs`) + `manifest.json` (format MCPB) → `Axon.mcpb`.

## L'app Electron
- `main.mjs` : fenêtre (barre de titre sombre intégrée), **écran de premier lancement** (`renderer/onboarding.html` : prénom, dossier Cloud / Personnel / rejoindre, domaines, branchement de Claude), surveillance du dossier (chokidar, ignore les médias lourds des banques), IPC `vault:*`, recherche, synchro Git (simple-git), données en direct.
- `preload.cjs` : pont `window.brain.*` (contextIsolation) — l'interface ne touche jamais le disque.
- `renderer/src/` :
  - `app.js` : navigation, historique (précédent / suivant), arborescence, palette de commandes, accueil à widgets ;
  - `brain3d.js` : le cerveau 3D (3d-force-graph + three.js, d3-force-3d). Trois formes (Cerveau, Cerveau + colonne, Galaxie). Physique façon Obsidian : les nœuds se figent une fois posés ; glisser tire les voisins liés et repousse les autres, puis tout revient. Mises à jour **incrémentales** (les objets sont réutilisés, rien ne saute quand une note change) ;
  - `focus.js` (neurone ouvert en grand), `home.js` (widgets), `editor.js` (CodeMirror 6), `markdown.js` (markdown-it + DOMPurify), `views.js`, `waves.js`, `model.js`, `apis.js`.

## Flux typiques
- **Une IA écrit une note** → MCP `brain_creer_neurone` → `vault.createNote` → fichier sur disque → chokidar dans l'app → mise à jour incrémentale du graphe → le neurone « naît » en direct.
- **Une IA pose une question** → `brain_contexte` → `hybrid` (MiniSearch + vecteurs) → `personalizedPageRank` sur les liens → `contextPack` (budget de mots) → texte compact.
- **Synchro entre 2 personnes** → Git (notes) + Drive (médias), ou dossier Drive partagé. Voir [STRUCTURE.md](STRUCTURE.md#partager).
