---
name: axon-architecte
description: Concevoir et faire grandir la STRUCTURE d'un cerveau Axon (domaines, projets, liaisons, régions 3D, banques de médias, cerveau partagé) pour qu'il reste rapide et clair à 100, 10 000 ou 100 000 notes. À utiliser pour ajouter un domaine de vie, un projet, réorganiser, décider comment relier des choses, ou quand le cerveau devient lent ou confus.
---
# Architecte du cerveau

Référence : `docs/STRUCTURE.md` et `docs/PASSAGE-A-L-ECHELLE.md` dans le dépôt Axon. Source de vérité dans le code : `core/structure.mjs`.

## La forme
```
00-Inbox · 01-Journal/AAAA · 05-Noyau          ← arrivées, journal par personne, qui on est
10- … 69-  <Domaine>/                          ← chaque domaine de vie, même moule :
              <Domaine>.md (hub) · Projets/<Projet>/ · Savoir/ · Decisions/ · Ressources/ · Archives/
70-Savoir · 75-Personnes · 80-Sources           ← transverse
90-Fichiers · 95-Flux · 99-Systeme              ← machine
```
Numéros par dizaines (10, 20, 30…) : on peut insérer un domaine voisin (15, 25) sans tout renuméroter.

## Les 3 liaisons (ce qui rend le cerveau intelligent)
1. **Verticale** : `parent: "[[Hub]]"` dans chaque note → arbre clair, l'IA ne se perd pas.
2. **Latérale** : ≥ 2 `[[liens]]` dans le texte vers d'autres endroits (surtout d'autres domaines).
3. **Hubs** : chaque domaine et chaque gros projet a sa note-carte, tenue à jour → l'IA lit 1 hub au lieu de 50 notes.
Les sujets sont des liens, pas des tags.

## Ajouter
| Besoin | Faire |
|---|---|
| Nouveau domaine de vie | **demander confirmation**, puis `brain_creer_domaine` (moule + région 3D + lien dans l'accueil) |
| Sous-domaine qui grandit (ex. Trading → Crypto) | d'abord un dossier dans `Savoir/` ou un projet ; s'il dépasse ~150 notes, un domaine voisin (`41-Crypto`) relié au hub parent |
| Projet | `<Domaine>/Projets/<Nom>/<Nom>.md` (modèle Projet) + ses fichiers à côté ; fini → `statut: termine` puis `Archives/` |
| Banque de médias (centaines d'images) | `<Domaine>/Banques/<Banque>/` + une fiche + `_manifest.json` ; jamais une note par image |
| Flux automatique | connecteur dans le code (`core/connectors.mjs`) → `95-Flux/<Région>/` |

## Règles qui gardent le cerveau rapide
- ≤ 3 niveaux sous un domaine · ~300 notes par dossier · ~800 lignes par note (au-delà : découper + note sommaire).
- Les fichiers lourds (vidéos, banques) restent dans le cloud / le PC ; une fiche légère les décrit.
- Renommer seulement avec `brain_deplacer` (les liens suivent). Ne jamais renuméroter un domaine sans accord.
- Les `_index.md` sont automatiques : écrire de bons `resume:` plutôt que des index à la main.

## Cerveau partagé (Drive)
Chacun son journal (`01-Journal/AAAA/AAAA-MM-JJ Prénom.md`) et son log (`99-Systeme/Log/AAAA-MM Prénom.md`) : ne jamais écrire dans ceux d'un autre. Éviter de modifier une note qu'un autre est en train de modifier. Conseiller deux cerveaux : un perso (privé) et un d'équipe (partagé).

## Avant de restructurer
Proposer le plan (avant / après, nombre de notes), attendre l'accord, déplacer avec `brain_deplacer` un dossier à la fois, puis `brain_sante`, `brain_maj` et une ligne de journal.
