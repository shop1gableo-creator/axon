# La structure d'un cerveau Axon

Source de vérité dans le code : [`core/structure.mjs`](../core/structure.mjs). Création : [`core/scaffold.mjs`](../core/scaffold.mjs).

Un cerveau est un **dossier**. Tout est en Markdown lisible + les fichiers d'origine (Excel, Word, PDF, images) rangés dans leurs neurones. Axon n'ajoute qu'un dossier caché `.brain/` (caches, anciennes versions) qui se régénère. Aucun enfermement : Obsidian, l'explorateur, Google Drive, Git lisent tout.

## Pourquoi cette forme
Elle combine quatre méthodes éprouvées :
- **PARA** (Tiago Forte) : séparer ce qui est actif (Projets) de ce qui dure (domaines, Ressources) et de ce qui est fini (Archives) ;
- **Johnny.Decimal** : des numéros par dizaines (10, 20, 30…) → ordre stable, place pour insérer (15, 25) ;
- **Maps of Content** (Nick Milo) : chaque domaine a un **hub** qui sert de carte ;
- **LLM Wiki** (Karpathy) : le brut (Inbox, Sources) est **compilé** par l'IA en notes atomiques reliées, avec un index et un log.
Et une règle à nous : **tous les domaines ont le même moule** (fractal). L'IA sait donc toujours où ranger, et on peut ajouter des domaines sans fin.

## L'arbre
```
<Cerveau>/
├─ 00-COMMENCER-ICI.md       accueil : qui on est, la liste des domaines, le protocole (1re page lue par une IA)
├─ CLAUDE.md · AGENTS.md · GEMINI.md   règles pour les IA
├─ 00-Inbox/                 arrivées en vrac · _archive/ = « corbeille » récupérable
├─ 01-Journal/AAAA/          AAAA-MM-JJ Prénom.md (un fichier par jour ET par personne)
├─ 05-Noyau/                 Objectifs · Ce que les IA savent de nous · Registres/ (décisions, leçons, blocages)
├─ 10-<Domaine>/ … 69-       les domaines de vie (défaut : 10-Ecole, 20-Business, 30-Finance, 40-Trading)
│   ├─ <Domaine>.md          HUB : objectifs, projets en cours, savoir clé, décisions, ressources
│   ├─ Projets/<Projet>/     un projet = un dossier = un neurone : <Projet>.md + ses fichiers
│   ├─ Savoir/               notes atomiques propres au domaine
│   ├─ Decisions/            une note par décision (contexte, choix, pourquoi, date)
│   ├─ Ressources/           documents de référence, modèles, rendus de l'IA
│   ├─ Archives/             projets finis (rien n'est supprimé)
│   └─ Banques/ (option)     banques de médias : une fiche + _manifest.json par banque
├─ 70-Savoir/                concepts transverses (utiles à plusieurs domaines)
├─ 75-Personnes/             une note par personne
├─ 80-Sources/               vidéos, articles, livres, cours (avec le lien d'origine)
├─ 90-Fichiers/AAAA-MM/      fichiers importés sans place précise (+ fiche automatique)
├─ 95-Flux/                  données écrites par du code (marchés, météo…)
└─ 99-Systeme/               index · Log/AAAA-MM Prénom.md · Membres · Regions du cerveau · Templates/ · carte-auto · Sante du cerveau
```

## Les liaisons
| Type | Où | Rôle |
|---|---|---|
| **Verticale** | `parent: "[[Hub]]"` dans le frontmatter | chaque note sait où elle habite → navigation et contexte sûrs |
| **Latérale** | ≥ 2 `[[liens]]` dans le texte | croiser les domaines (école ↔ trading, business ↔ finance) : c'est là que naissent les idées |
| **Hubs** | `<Domaine>.md`, `<Projet>.md`, `00-COMMENCER-ICI.md` | cartes tenues à jour → l'IA lit 1 page au lieu de 50 |
| **Automatique** | `_index.md` par dossier, recherche par le sens, rétroliens | retrouver ce qui n'est pas relié à la main |
Les **sujets** sont des liens. Les **tags** ne servent qu'au type et au statut.

## Une note
```markdown
---
type: note | hub | projet | decision | personne | source | rendu | journal | log
parent: "[[Business]]"
tags: [projet]
auteur: Alex               # un humain → l'IA ne réécrit pas sans accord ; « claude » / « ia » → modifiable
statut: brouillon | a-compiler | compile | actif | termine | genere
resume: "Une phrase, reprise dans les index et les résultats de recherche."
cree: 2026-11-11
---
# Titre en clair

…

## Synthèse IA     ← ce qu'une IA ajoute sous les mots d'un humain
```

## Fichiers système
| Fichier | Rôle | Écrit par |
|---|---|---|
| `99-Systeme/Log/AAAA-MM Prénom.md` | carnet de bord : `date | agent | qui | ce qui a changé | [[notes]]`, jamais effacé ; un fichier par personne et par mois → pas de conflit dans un Drive partagé | le code (`vault.log`) |
| `99-Systeme/index.md` | sommaire manuel des notes importantes | IA / humain |
| `<dossier>/_index.md` | une ligne (le `resume`) par note | le code |
| `99-Systeme/Membres.md` | qui partage ce cerveau | le code (premier lancement / rejoindre) |
| `99-Systeme/Regions du cerveau.md` | régions du cerveau 3D (frontmatter `regions:`) : une par domaine + Noyau, Savoir, Arrivées, Système | le code + humain |
| `llms.txt`, `llms-full.txt` | le cerveau pour une IA sans outils | le code |

## Cerveau partagé
Deux personnes choisissent **le même dossier** (Google Drive partagé, raccourci dans « Mon Drive »). Le second « rejoint » le cerveau. Chacun a son journal et son log ; chaque note porte son `auteur`. Limite de Google Drive : deux modifications simultanées de la **même** note créent une copie « (1) ». Pour une équipe qui écrit beaucoup en parallèle : Git (fusion ligne par ligne). Conseil : un cerveau perso + un cerveau d'équipe, branchés tous les deux sur Claude (`brancher … --nom axon-equipe`).
