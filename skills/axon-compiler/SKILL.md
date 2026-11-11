---
name: axon-compiler
description: Transformer le brut du cerveau Axon (Inbox, sources, fichiers marqués a-compiler) en notes de savoir atomiques, résumées et reliées (méthode LLM Wiki de Karpathy), et tenir les hubs à jour. À utiliser pour « range le cerveau », « trie l'inbox », « mets à jour », ou après plusieurs captures.
---
# Compiler le brut en savoir

Principe (Karpathy) : on ne relit pas les sources à chaque question ; on les **compile une fois** en notes propres, tenues à jour.

## Boucle
1. Lister le brut : `brain_dossier 00-Inbox`, `brain_chercher` « a-compiler ».
2. Pour chaque élément :
   - En extraire les **idées** (concepts réutilisables), les **faits** (chiffres, noms, dates), les **décisions**, les **actions**.
   - Idée propre à un domaine → `<Domaine>/Savoir/`. Idée utile à plusieurs domaines → `70-Savoir/`. Chercher d'abord (`brain_chercher`) : enrichir (`brain_modifier`, une ligne sourcée) plutôt que créer.
   - Décision → `<Domaine>/Decisions/`. Action → dans le projet (`- [ ] …`). Personne → `75-Personnes/`.
   - Chaque note : `parent` (le hub), `resume`, au moins 2 liens latéraux, un lien **retour vers la source**.
   - Ranger l'élément d'Inbox à sa vraie place (`brain_deplacer`, les liens suivent), `statut: compile`.
3. **Hubs** : ajouter dans le hub du domaine (`<Domaine>.md`) les nouveaux projets, savoirs clés et décisions (une ligne + lien).
4. `brain_journal` : combien d'éléments compilés, quelles notes créées ou enrichies.

## Qualité
- **Une note = une idée.** Une note qui parle de 3 sujets → 3 notes reliées.
- Titre en clair = ce qu'on taperait pour chercher. Pas de date (sauf journal).
- Les sujets sont des **liens**, pas des tags. Tags = type et statut seulement.
- Ne jamais réécrire les mots d'un humain : ajouter `## Synthèse IA` dessous.
- Les liens entre domaines ont le plus de valeur (un cours d'économie ↔ une stratégie de trading) : cherche-les.
