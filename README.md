# Axon — un second cerveau pour toi et tes IA

Axon transforme un dossier (dans ton **Google Drive** ou sur ton PC) en **mémoire persistante** que tes IA partagent : Claude d'abord, mais aussi Cursor, Codex, Gemini, ChatGPT. Toi, tu le vois en 3D. Tes IA y cherchent par le sens, lisent, écrivent, modifient tes **Excel, Word et PowerPoint** sur place — et ne suppriment jamais rien (archive + anciennes versions gardées).

## Installer (Windows 10 et 11)
1. Colonne de droite : **Releases** → télécharge **`Axon-Setup-1.0.0.exe`**.
2. Double-clic dessus → assistant d'installation (choix du dossier → Installer → Terminer). Rien à taper, pas de terminal, **pas besoin de Node.js** : tout est dans l'installateur.
3. Axon s'ouvre : ton **prénom** → ton **dossier** (Cloud = Google Drive, ou Personnel = ce PC) → tes **domaines de vie**. Le cerveau se crée dans ce dossier et **Claude est branché automatiquement**.
4. Quitte Claude Desktop complètement (icône près de l'horloge → Quitter), rouvre-le et écris : `Appelle brain_demarrer`.

Désinstaller : Paramètres Windows → Applications → Axon (ton cerveau n'est jamais supprimé). Mettre à jour : lancer le nouveau Setup par-dessus.

**Performances** : l'affichage du cerveau 3D utilise la carte graphique la plus puissante (sur un portable à deux puces : la NVIDIA/AMD, pas l'Intel) ; l'IA locale tourne sur le processeur par paquets (mesuré plus rapide que la carte graphique pour ce petit modèle). `Ctrl+K` → « Matériel utilisé » pour vérifier.

Le guide complet (installation, connecteur, dépannage, cerveau à deux) : [`guide/index.html`](guide/index.html) — bouton « Ouvrir le guide » à la fin du premier lancement, ou `Ctrl+K` → Guide dans l'app.

## Ce que ça crée
```
00-COMMENCER-ICI.md   00-Inbox/   01-Journal/   05-Noyau/
10-Ecole/  20-Business/  30-Finance/  40-Trading/  …   ← chaque domaine : hub + Projets, Savoir, Decisions, Ressources, Archives
70-Savoir/  75-Personnes/  80-Sources/  90-Fichiers/  95-Flux/  99-Systeme/
```
Détails et raisons : [docs/STRUCTURE.md](docs/STRUCTURE.md).

## Les 7 skills (branchés d'office)
| Skill | Quand |
|---|---|
| `axon-capturer` | « garde ça » : un lien, un fichier, une idée, rangé au bon endroit et relié |
| `axon-repondre` | « qu'est-ce qu'on sait sur… », avec les sources ; garder les réponses importantes |
| `axon-compiler` | « range le cerveau » : le brut devient du savoir relié, les hubs se tiennent à jour |
| `axon-entretien` | « vérifie », « fais le point » : santé + consolidation |
| `axon-architecte` | ajouter un domaine, réorganiser, rester rapide en grandissant, cerveau partagé |
| `axon-fichiers` | Excel, Word, PowerPoint, PDF, code : lire, modifier, sortir, remettre, revenir en arrière |
| `axon-developpeur` | modifier ou étendre le code d'Axon |

## Un cerveau à deux
Partage le dossier Google Drive avec ton ami (Éditeur), il ajoute un raccourci dans « Mon Drive », installe Axon et choisit **le même dossier** : il le rejoint. Chacun son journal et son log, chaque note signée. Voir le guide, section 5.

## Pour les IA (et les curieux)
Commence par [AGENTS.md](AGENTS.md), puis `docs/` : [ARCHITECTURE](docs/ARCHITECTURE.md) · [STRUCTURE](docs/STRUCTURE.md) · [OUTILS-MCP](docs/OUTILS-MCP.md) · [DEVELOPPER](docs/DEVELOPPER.md) · [SOURCES](docs/SOURCES.md) · [PASSAGE-A-L-ECHELLE](docs/PASSAGE-A-L-ECHELLE.md) · [FEUILLE-DE-ROUTE](docs/FEUILLE-DE-ROUTE.md).

## Principes
Tes notes restent des fichiers lisibles · rien n'est jamais supprimé · la recherche par le sens tourne sur ton PC · jamais de secret (mot de passe, clé) dans le cerveau.
