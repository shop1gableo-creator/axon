---
name: axon-entretien
description: Garder le cerveau Axon en bonne santé et le consolider (contrôle de santé + « rêve » de fin de journée) — liens cassés, orphelins, doublons, notes sans résumé ni parent, inbox à trier, hubs à jour, leçons de la semaine. À utiliser pour « vérifie », « nettoie », « répare », « fais le point », chaque soir ou chaque semaine.
---
# Entretien et consolidation

## A. Contrôle de santé
1. `brain_sante` : liens cassés, orphelins, sans résumé, doublons probables, inbox.
2. Réparer ce qui est sûr :
   - lien cassé → trouver la bonne note (`brain_chercher`) et corriger (`brain_modifier`) ;
   - orphelin ou sans `parent` → le rattacher à son hub + 2 liens latéraux ;
   - sans `resume` → en écrire un (une phrase) ;
   - doublon → fusionner dans la meilleure note, archiver l'autre (`brain_archiver`), jamais supprimer.
3. Ce qui demande un humain (doublon douteux, note humaine à changer) → le lister, ne pas toucher.

## B. Consolidation (« rêve »)
1. Lire le log depuis la dernière fois (`brain_recent`, `99-Systeme/Log/`).
2. En tirer : **leçons**, **décisions**, **blocages**, ce qu'on a appris sur l'humain.
3. Écrire : registres (`brain_cloture`), mémoire des IA (`brain_apprendre`), décisions dans `<Domaine>/Decisions/`.
4. Mettre à jour les **hubs** des domaines touchés (projets en cours, savoir clé).
5. Compiler l'inbox restante (`axon-compiler`), puis `brain_maj` et `brain_journal`.

## Signes qu'il faut restructurer (→ `axon-architecte`)
- un dossier dépasse ~300 notes au même niveau ;
- une note dépasse ~800 lignes ;
- un domaine mélange deux sujets qui grandissent chacun ;
- la même question revient et `brain_contexte` ne trouve pas la réponse.
