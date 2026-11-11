---
name: axon-repondre
description: Répondre à une question en s'appuyant sur le cerveau Axon, avec les sources, puis garder la réponse si elle compte. À utiliser pour toute question sur la vie, l'école, le business, la finance, le trading, les projets, les décisions passées, « qu'est-ce qu'on sait sur… », « où est… », et quand on dit « garde cette réponse ».
---
# Répondre avec le cerveau

## 1. Trouver (en dépensant peu)
1. `brain_contexte` avec la question : les passages utiles (mots + sens + liens). Presque toujours suffisant.
2. Sinon : lire le **hub** du domaine (`<Domaine>.md`) ou du projet, puis `brain_parcourir` (voisins), puis `brain_lire` sur 1 à 3 notes.
3. Un fichier : `brain_office` (Excel, Word, PowerPoint : lire le contenu) ou `brain_fichier` (tout le reste, qualité d'origine).
4. Ne jamais lire tout un dossier : les `_index.md` donnent une ligne par note.

## 2. Répondre
- Citer les sources `[[Note]]` après chaque fait.
- Distinguer ce que le cerveau **dit** de ce que tu **déduis**.
- Le cerveau ne sait pas : le dire, proposer de chercher ailleurs, puis capturer le résultat (`axon-capturer`).
- Deux notes se contredisent : le signaler, citer les deux, regarder la plus récente et les `Decisions/`.

## 3. Garder (si la réponse compte : analyse, plan, script, tableau, comparaison)
- Dans le domaine concerné : `<Domaine>/Projets/<Projet>/` si c'est pour un projet, sinon `<Domaine>/Ressources/`. `type: rendu`, `parent`, `resume`, la question, la réponse, les sources.
- Une **décision** prise → `<Domaine>/Decisions/<Titre>.md` (contexte, choix, pourquoi, date) + une ligne dans le hub.
- Relier la réponse depuis le hub ou la note du sujet : la prochaine IA la trouve en un saut.
- `brain_journal` à la fin.
