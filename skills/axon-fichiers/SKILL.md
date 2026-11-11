---
name: axon-fichiers
description: Travailler sur les FICHIERS rangés dans les neurones du cerveau Axon — lire et modifier un Excel, un Word, un PowerPoint, un PDF, une image, du code ; en créer de nouveaux ; les sortir pour les retravailler puis les remettre ; revenir à une ancienne version. À utiliser dès qu'une demande touche un fichier (« mets à jour mon budget », « corrige le plan de cours », « fais-moi un tableau », « ajoute une diapo »).
---
# Les fichiers dans les neurones

Un fichier vit **dans le neurone qu'il concerne** : `30-Finance/Projets/Budget 2027/Budget 2027.xlsx` à côté de `Budget 2027.md`, qui l'intègre avec `![[Budget 2027.xlsx]]`.

## Choisir la méthode
| Besoin | Méthode |
|---|---|
| Lire un Excel / Word / PowerPoint | `brain_office` action `lire` (Excel : `feuille`, `plage` ex. `A1:H60`) |
| Changer des valeurs, ajouter des lignes, une feuille (Excel) | `brain_office` action `ecrire` : `cellules` {"C3": 350, "D10": "=SUM(D2:D9)"}, `lignes` [[…]] ajoutées à la fin, `nouvelle_feuille` |
| Remplacer du texte, ajouter des paragraphes (Word) ou des lignes dans une diapo (PowerPoint) | `brain_office` action `modifier` : `remplacements` [{chercher, remplacer}] avec le texte **exact** lu avant ; `ajouter` [...] ; `diapo` n |
| Gros travail (graphique, mise en page, nouvelles diapos, PDF, image, analyse) | `brain_sortir` → travailler sur la copie avec tes propres outils (Python : openpyxl, python-docx, python-pptx ; skills docx / xlsx / pptx / pdf) → `brain_remettre` (même chemin) |
| Créer un nouveau fichier Office | le créer sur le PC (tes outils), puis `brain_remettre` avec `destination` = dossier du neurone et `note` = la note qui doit l'intégrer |
| Fichier texte / code / CSV | `brain_modifier` (rechercher-remplacer exact) ou `brain_creer_fichier` |
| Revenir en arrière | `brain_versions` (liste), puis `restaurer` |

## Toujours
1. **Lire avant de modifier.** Pour un remplacement Word/PowerPoint, copier le texte exact tel que `lire` le renvoie.
2. Dire à l'humain ce qui a changé (cellules, paragraphes) et que l'ancienne version est gardée.
3. Excel : les formules sont recalculées à l'ouverture dans Excel ; ne pas écraser une formule par une valeur sans le dire.
4. Ne jamais supprimer un fichier : `brain_archiver`.
5. `brain_journal` à la fin.

## Sans accès au PC (claude.ai sur le web, téléphone)
Ces outils passent par le connecteur Axon installé sur le PC. Sans lui, demander à l'humain d'ouvrir Claude Desktop ou Claude Code sur son PC.
