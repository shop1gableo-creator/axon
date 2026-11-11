# Sources : où apprendre ce qu'Axon utilise

Avant d'utiliser une API que tu ne connais pas, **lis la doc officielle ci-dessous** (versions dans `package.json`). Les idées d'Axon viennent aussi des projets listés en bas.

## Idées fondatrices
| Sujet | Où lire |
|---|---|
| Méthode « LLM Wiki » (brut → wiki compilé, index, log, lint) | gist d'Andrej Karpathy « LLM Wiki » (avril 2026) : https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f |
| Agent Skills (SKILL.md, chargement progressif) | https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills · bonnes pratiques : https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices · exemples : https://github.com/anthropics/skills |
| Model Context Protocol | https://modelcontextprotocol.io (spécification, transports, outils / prompts / ressources) · SDK : https://github.com/modelcontextprotocol/typescript-sdk |
| Paquet Claude Desktop (MCPB) | https://github.com/anthropics/mcpb |
| Conception d'outils MCP sobres | playbook de Block : https://engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers |
| llms.txt | https://llmstxt.org |
| Format Obsidian (liens, intégrations, propriétés) | https://help.obsidian.md · skills `obsidian-markdown`, `obsidian-bases`, `json-canvas` |

## Librairies (par rôle)
| Rôle | Librairie | Doc |
|---|---|---|
| App de bureau | Electron | https://www.electronjs.org/docs/latest |
| Bundle | esbuild | https://esbuild.github.io |
| Cerveau 3D | 3d-force-graph, three.js, d3-force-3d, three-spritetext | https://github.com/vasturiano/3d-force-graph · https://threejs.org/docs · https://github.com/vasturiano/d3-force-3d |
| Graphes 2D / données | d3 | https://d3js.org |
| Frontmatter | gray-matter, yaml | https://github.com/jonschlinkert/gray-matter · https://eemeli.org/yaml |
| Recherche plein texte | MiniSearch | https://lucaong.github.io/minisearch |
| Recherche par le sens (local) | transformers.js + modèle `onnx-community/embeddinggemma-300m-ONNX` | https://huggingface.co/docs/transformers.js |
| Surveillance de dossier | chokidar | https://github.com/paulmillr/chokidar |
| Git | simple-git | https://github.com/steveukx/git-js |
| Éditeur | CodeMirror 6 | https://codemirror.net/docs |
| Markdown | markdown-it, DOMPurify, KaTeX, Mermaid | https://markdown-it.github.io · https://github.com/cure53/DOMPurify |
| Documents → texte | pdfjs-dist, mammoth (Word), xlsx, jszip, turndown, defuddle | https://mozilla.github.io/pdf.js · https://github.com/mwilliamson/mammoth.js |
| OCR / transcription | tesseract.js ; Whisper (via transformers.js) | https://github.com/naptha/tesseract.js |
| Validation | zod | https://zod.dev |
| Animations | gsap, motion | https://gsap.com/docs · https://motion.dev |
| Police | Inter (fontsource) | https://fontsource.org/fonts/inter |

## Données en direct (sans clé)
Binance WebSocket : https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams · Open-Meteo : https://open-meteo.com/en/docs · catalogue d'API gratuites : https://github.com/public-apis/public-apis

## Projets dont on s'inspire (à lire, pas à copier)
Obsidian (graphe, liens) · Logseq · Foam · Khoj · Smart Connections · mindcorpus · Graphify · implémentations du LLM Wiki (ex. nashsu/llm_wiki). La bibliothèque locale `references/` (catalogue dans le cerveau : `40-Sources/Repos/Catalogue code open source.md`) contient des clones à étudier.

## Pour aller plus loin (passage à l'échelle)
better-sqlite3 / SQLite FTS5 : https://www.sqlite.org/fts5.html · hnswlib-node (recherche vectorielle approchée) : https://github.com/yoshoku/hnswlib-node · MCP transport HTTP « streamable » (serveur distant) : spécification MCP.
