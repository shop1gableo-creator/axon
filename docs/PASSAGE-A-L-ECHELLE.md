# Passage à l'échelle : un cerveau qui ne rame pas à 100 000 notes

Objectif : rester fluide quand le cerveau grossit (plus de notes, plus de médias, plus d'IA branchées), sur un PC normal.

## Où en est-on (mesuré le 2026-11-11, PC de test)
| Mesure | Valeur |
|---|---|
| Cerveau | 639 notes, 7 095 fichiers, 13 343 liens |
| Premier scan complet | ~1,6 s |
| Scan suivant (incrémental : notes inchangées non relues) | ~1,1 s (le reste = lister les fichiers + reconstruire l'index) |
| Changement d'une note dans l'app | mise à jour incrémentale du graphe, 0 pixel de saut |

## Ce qui est déjà en place
1. **Moteur partagé, données = fichiers** : pas de base à migrer ; caches régénérables dans `.brain/`.
2. **Scan incrémental** (`vault.scan`) : date + taille identiques → la note n'est pas relue.
3. **Modèle d'IA hors de l'interface** (processus séparé) ; vecteurs mis en cache, recalculés seulement pour les notes modifiées.
4. **Index par dossier** (`_index.md`) et `contextPack` à budget de mots : le coût en tokens d'une question ne grandit pas avec le cerveau.
5. **Banques = un neurone par dossier + manifeste JSON** : 2 400 images ne font pas 2 400 nœuds.
6. **Cerveau 3D** : nœuds figés après placement, physique seulement locale quand on glisse, mises à jour incrémentales, liens système cachés, étiquettes à taille fixe.
7. **Surveillance du dossier** qui ignore les médias des banques et les miniatures.
8. **MCP sobre** : 26 outils (au-delà d'environ 30, les IA choisissent moins bien), réponses courtes, messages d'erreur qui disent quoi faire.

## Les paliers suivants (dans l'ordre où ils deviendront utiles)
| Palier | Symptôme | Solution prévue |
|---|---|---|
| ~3 000 notes | le scan du serveur MCP à chaque appel prend > 1 s | garder le serveur MCP **à l'écoute du dossier** (chokidar) au lieu de rescanner ; index MiniSearch mis à jour note par note |
| ~5 000 nœuds affichés | le cerveau 3D chute sous 60 images/s | **niveau de détail** : n'afficher que les hubs de loin, déplier une région quand on s'approche ; étiquettes seulement sur les nœuds proches ; regrouper les feuilles en « grappes » |
| ~10 000 notes | le premier démarrage est long | cache du **parse** (frontmatter, liens, résumé) dans `.brain/notes.json`, vérifié par date + taille ; démarrage en < 1 s |
| ~20 000 notes | vecteurs en JSON trop gros en mémoire | vecteurs en **binaire** (Float32Array, fichier `.bin`), recherche approchée (HNSW, ex. `hnswlib-node`) |
| ~50 000 notes | recherche plein texte lente / mémoire | index plein texte sur disque (**SQLite FTS5** via `better-sqlite3`), le dossier reste la vérité |
| Équipe > 3 personnes | conflits | Git obligatoire pour les notes ; une branche par personne ou synchro fréquente ; médias dans un stockage partagé |
| Accès depuis le web / mobile | pas de programme local | serveur MCP **distant** (transport HTTP « streamable »), avec authentification, devant un cerveau dans le cloud |

## Règles de structure qui évitent les problèmes (voir le skill `axon-architecte`)
- au plus 3 niveaux de dossiers, ~300 notes par dossier, ~800 lignes par note ;
- jamais une note par média dans une banque ; une fiche par banque + manifeste ;
- ce qui est généré par du code (`statut: genere`) vit à part et se régénère ;
- le journal se range par année (`01-Journal/AAAA/`) quand il dépasse ~300 jours.

## Comment mesurer avant d'optimiser
```bash
node cli/brain.mjs stats                  # taille du cerveau
node -e "…"                                # voir tools/ : chronométrer vault.scan() deux fois de suite
```
Dans l'app : l'indicateur d'images/s du cerveau 3D (`#tbStats`). Optimiser seulement ce qui est mesuré.
