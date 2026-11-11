---
name: axon-capturer
description: Faire entrer quelque chose dans le cerveau Axon (lien, article, vidéo, PDF, image, Excel, Word, code, conversation, idée en vrac) et le ranger au bon endroit, relié. À utiliser dès qu'on dit « garde ça », « mets dans le cerveau », « ajoute », « range », ou qu'on donne un fichier ou une URL à retenir.
---
# Capturer

Règle d'or : **ranger là où on le cherchera**, et relier. Le brut ne se modifie jamais : on écrit à côté.

## 1. Où ça va ?
| Ce qu'on reçoit | Où | Outil |
|---|---|---|
| Fichier lié à un projet (Excel, Word, PDF, image…) | **dans le neurone du projet** : `<Domaine>/Projets/<Projet>/` | `brain_remettre` (chemin du PC + destination + note pour l'intégrer) |
| Fichier de référence d'un domaine | `<Domaine>/Ressources/` | `brain_remettre` |
| Fichier sans place claire | `90-Fichiers/AAAA-MM/` + fiche automatique | `brain_importer` |
| Lien web, vidéo, livre, cours | `80-Sources/` : URL, résumé 5 lignes, « ce qu'on en retient », citations courtes | `brain_creer_neurone` |
| Idée, note vocale, texte en vrac | `00-Inbox/` | `brain_ajouter` |
| Code, CSV, JSON | dans le projet concerné | `brain_creer_fichier` |
| Une personne | `75-Personnes/<Prénom Nom>.md` | `brain_creer_neurone` |
| Un fait durable sur l'humain (préférence, habitude) | mémoire des IA | `brain_apprendre` |

Pas de projet qui convient ? Crée-le : `<Domaine>/Projets/<Nom>/<Nom>.md` (modèle `99-Systeme/Templates/Projet.md`), relié au hub du domaine. Pas de domaine qui convient ? Demande à l'humain, puis `brain_creer_domaine`.

## 2. Toujours
1. **Chercher avant d'écrire** (`brain_chercher`) : si la note existe, la compléter (`brain_modifier`), ne pas en créer une deuxième.
2. Frontmatter : `type`, `parent` (le hub ou le projet : `"[[Business]]"`), `tags`, `auteur` (l'humain qui l'a dit, ou `claude`), `statut: a-compiler`, `cree`, `resume` (une phrase).
3. Au moins **2 liens latéraux** vers d'autres endroits (une personne, un concept de `70-Savoir`, une source, un autre domaine).
4. Jamais de mot de passe, clé, code de récupération, pièce d'identité, info bancaire : refuser et le dire.
5. Finir par `brain_journal` (une ligne : quoi, [[notes]]).

Ensuite, `axon-compiler` transforme le brut en savoir propre.
