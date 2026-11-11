// Crée un CERVEAU VIERGE (structure « cerveau de vie », règles pour les IA, skills) sans aucune donnée personnelle,
// ajoute des DOMAINES (même moule partout) et des MEMBRES (cerveau partagé à plusieurs, ex. dans un Google Drive).
// Utilisé par l'écran de premier lancement de l'app, la CLI (« init ») et l'outil MCP brain_creer_domaine.
import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";
import { copySkills } from "./skills.mjs";
import { P, MOULE, DOMAINES_DEFAUT, REGIONS_FIXES, POSITIONS_LIBRES, COULEURS_LIBRES, dossierDomaine } from "./structure.mjs";

const today = () => new Date().toISOString().slice(0, 10);
const yamlList = (a) => `[${a.map((x) => JSON.stringify(x)).join(", ")}]`;

async function put(dir, rel, content, created) {
  const p = path.join(dir, rel);
  if (fss.existsSync(p)) return;
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, content, "utf8");
  created?.push(rel);
}

const fm = (o) => "---\n" + Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? yamlList(v) : typeof v === "string" && /[:#"]/.test(v) ? JSON.stringify(v) : v}`).join("\n") + "\n---\n";

// ------------------------------------------------------------------ règles pour les IA
const CLAUDE_MD = (nom) => `# CERVEAU « ${nom} » — règles pour toutes les IA (Claude, ChatGPT, Gemini, Cursor, Codex…)

Ce dossier est un cerveau Axon : notes Markdown reliées par des [[liens]] (compatible Obsidian) + les fichiers (Excel, Word, PDF…) rangés DANS les neurones.
Tu n'as pas de mémoire entre deux sessions : **ce dossier EST ta mémoire**. Lis avant d'agir, écris après avoir agi.

## Au début de chaque session
1. Outil \`brain_demarrer\` (ou lis \`00-COMMENCER-ICI.md\`, puis \`${P.memoire}\`).
2. Avant une tâche : \`brain_skill\` donne le mode d'emploi (capturer, répondre, compiler, entretien, architecte, fichiers, développeur).
3. Pour une question : \`brain_contexte\`, puis ouvre seulement les notes utiles. Ne charge jamais tout le dossier.

## La structure (voir [[Comment marche ce cerveau]])
| Dossier | Contenu |
|---|---|
| \`00-Inbox/\` | Ce qui arrive en vrac. \`_archive/\` = ce qu'on a « supprimé » (récupérable). |
| \`01-Journal/AAAA/\` | Une note par jour et par personne : \`AAAA-MM-JJ Prénom.md\`. |
| \`05-Noyau/\` | Qui on est : objectifs, valeurs, mémoire des IA, registres (décisions, leçons, blocages). |
| \`10-\` à \`69-\` | Les **domaines** (École, Business, Finance, Trading…). Chacun : hub \`<Domaine>.md\` + ${MOULE.map((m) => `\`${m}/\``).join(", ")}. |
| \`70-Savoir/\` | Concepts transverses (utiles à plusieurs domaines). |
| \`75-Personnes/\` | Une note par personne. |
| \`80-Sources/\` | Vidéos, articles, livres, cours (avec le lien d'origine). |
| \`90-Fichiers/\` | Fichiers importés sans place précise (sinon : dans leur projet). |
| \`95-Flux/\` | Données mises à jour par du code. |
| \`99-Systeme/\` | Index, log (\`Log/AAAA-MM Prénom.md\`), régions, membres, modèles. |

## Comment relier (le plus important)
- Chaque note a un **parent** : le hub de son domaine ou de son projet (\`parent: "[[Business]]"\` dans le frontmatter) → hiérarchie claire.
- Et au moins **2 liens latéraux** dans le texte vers des notes d'autres endroits (une personne, un concept, une source) → c'est ce qui rend le cerveau intelligent.
- Un **projet = un dossier = un neurone** : \`Projets/<Projet>/<Projet>.md\` + ses fichiers à côté, intégrés avec \`![[fichier.xlsx]]\`.
- Les sujets sont des **liens**, pas des tags. Les tags servent au type et au statut.

## Règles
- Frontmatter : \`type\`, \`parent\`, \`tags\`, \`auteur\`, \`statut\`, \`cree\`, \`resume\` (une phrase).
- Ne réécris jamais les mots d'un humain : ajoute \`## Synthèse IA\`.
- Ne supprime jamais : \`brain_archiver\`. Chaque modification garde l'ancienne version (\`brain_versions\`).
- Fichiers Office (Excel, Word, PowerPoint) : \`brain_office\` pour lire/modifier sur place, ou \`brain_sortir\` → travailler → \`brain_remettre\`.
- Jamais de mot de passe, de clé API ni d'information bancaire.
- Après une tâche : \`brain_journal\` (une ligne dans le log), puis \`brain_cloture\` en fin de session.
`;

const AGENTS_MD = `# AGENTS.md — instructions pour toute IA

Lis \`CLAUDE.md\` (les règles valent pour toutes les IA), puis \`00-COMMENCER-ICI.md\`.
Avec le serveur MCP Axon : commence par \`brain_demarrer\`, puis \`brain_skill\` pour le mode d'emploi de ta tâche.
Sans outils : lis \`llms-full.txt\` (tout l'essentiel en un fichier).
`;

// ------------------------------------------------------------------ un domaine (le moule)
/** Crée un domaine complet : dossier numéroté, hub, sous-dossiers du moule, région 3D, lien depuis l'accueil. */
export async function creerDomaine(dir, d, { created = [], regions = true } = {}) {
  const folder = dossierDomaine(d);
  await put(dir, `${folder}/${d.nom}.md`, fm({ type: "hub", tags: ["domaine"], parent: "[[00-COMMENCER-ICI]]", auteur: "ia", statut: "actif", resume: d.description || `Hub du domaine ${d.nom}.`, cree: today() }) +
`# ${d.nom}

> ${d.description || "À compléter : ce que couvre ce domaine."}

## Objectifs
-

## Projets en cours
<!-- un projet = un dossier dans Projets/ avec sa note du même nom -->

## Savoir clé
<!-- les notes les plus utiles de Savoir/ -->

## Décisions
<!-- les décisions de Decisions/, datées -->

## Ressources
<!-- documents et fichiers de référence -->

Liens : [[00-COMMENCER-ICI]] · [[Comment marche ce cerveau]]
`, created);
  for (const sub of MOULE) await fs.mkdir(path.join(dir, folder, sub), { recursive: true });
  if (regions) await ajouterRegion(dir, { nom: d.nom, position: d.position, couleur: d.couleur, dossiers: [folder], description: d.description || "" });
  // lien depuis l'accueil
  const start = path.join(dir, "00-COMMENCER-ICI.md");
  if (fss.existsSync(start)) {
    let s = await fs.readFile(start, "utf8");
    if (!s.includes(`[[${d.nom}]]`)) { s = s.replace("<!-- domaines -->", `- [[${d.nom}]] — ${d.description || ""}\n<!-- domaines -->`); await fs.writeFile(start, s, "utf8"); }
  }
  return folder;
}

/** Prochain numéro et position libres pour un nouveau domaine. */
export function prochainDomaine(dir, nom, description = "") {
  const used = fss.readdirSync(dir).map((f) => f.match(/^(\d\d)-/)?.[1]).filter(Boolean).map(Number);
  let num = 10; while (used.includes(num) && num < 69) num += 10;
  if (used.includes(num)) { num = 11; while (used.includes(num) && num < 69) num++; }
  const k = used.filter((n) => n >= 10 && n < 70).length;
  return { nom, num, position: POSITIONS_LIBRES[k % POSITIONS_LIBRES.length], couleur: COULEURS_LIBRES[k % COULEURS_LIBRES.length], description };
}

async function ajouterRegion(dir, r) {
  const p = path.join(dir, P.regions);
  let s = fss.existsSync(p) ? await fs.readFile(p, "utf8") : null;
  const bloc = `  - nom: ${r.nom}\n    position: ${r.position}\n    couleur: "${r.couleur}"\n    dossiers: ${yamlList(r.dossiers)}\n    description: ${JSON.stringify(r.description || "")}\n`;
  if (!s) {
    s = `---\nregions:\n${bloc}type: systeme\ntags: [systeme, regions]\nauteur: ia\nstatut: actif\nresume: "Régions du cerveau 3D : nom, position, couleur, dossiers. Modifiable librement."\ncree: ${today()}\n---\n# Régions du cerveau\n\nChaque région regroupe des dossiers et occupe une zone du cerveau 3D. Positions possibles : centre, haut, bas, avant, arriere, gauche, droite, haut-avant, haut-arriere, haut-gauche, haut-droite, avant-gauche, avant-droite, arriere-gauche, arriere-droite.\n`;
  } else if (!s.includes(`- nom: ${r.nom}\n`)) s = s.replace(/\ntype: systeme\n/, `\n${bloc}type: systeme\n`);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, s, "utf8");
}

/** Ajoute une personne à la liste des membres (cerveau partagé). */
export async function ajouterMembre(dir, utilisateur) {
  if (!utilisateur) return;
  const p = path.join(dir, P.membres);
  let s = fss.existsSync(p) ? await fs.readFile(p, "utf8") : fm({ type: "systeme", tags: ["systeme", "membres"], auteur: "ia", resume: "Les personnes qui partagent ce cerveau. Chacune a son journal et son log : pas de conflit dans un Drive partagé.", cree: today() }) + "# Membres\n\n";
  if (!s.includes(`- ${utilisateur} `)) s += `- ${utilisateur} — depuis le ${today()}\n`;
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, s, "utf8");
}

export const estUnCerveau = (dir) => ["00-COMMENCER-ICI.md", "CLAUDE.md"].every((f) => fss.existsSync(path.join(dir, f)));

/** Crée un cerveau vierge dans `dir`. Ne remplace jamais un fichier existant. */
export async function createEmptyBrain(dir, { nom = "Axon", utilisateur = "", equipe = "", domaines = DOMAINES_DEFAUT } = {}) {
  await fs.mkdir(dir, { recursive: true });
  const existing = (await fs.readdir(dir)).filter((f) => !f.startsWith(".") && !/^desktop\.ini$/i.test(f));
  if (existing.length && !estUnCerveau(dir)) throw new Error(`Le dossier « ${dir} » n'est pas vide : choisis un dossier vide (ou crée un sous-dossier).`);
  const qui = utilisateur || equipe || "moi";
  const created = [];
  for (const f of [P.inbox, P.archive, P.journal, P.registres, P.savoir, P.personnes, P.sources, P.fichiers, P.flux, P.logDir, P.templates]) await fs.mkdir(path.join(dir, f), { recursive: true });

  await put(dir, "CLAUDE.md", CLAUDE_MD(nom), created);
  await put(dir, "AGENTS.md", AGENTS_MD, created);
  await put(dir, "GEMINI.md", "Lis AGENTS.md puis CLAUDE.md : les règles de ce cerveau valent pour toutes les IA.\n", created);
  await put(dir, "00-COMMENCER-ICI.md", fm({ type: "hub", tags: ["systeme", "accueil"], auteur: "ia", statut: "a-completer", resume: "Point d'entrée : qui nous sommes, les domaines, le protocole. La première page que lit une IA.", cree: today() }) +
`# ${nom}

## Qui je suis / qui nous sommes
- ${qui}. À compléter : ce que tu fais, tes objectifs, ta façon de travailler (ou dis-le simplement à ton IA, elle l'écrira).

## Les domaines
<!-- domaines -->

## Le reste du cerveau
- [[Ce que les IA savent de nous]] — la mémoire des IA
- [[index]] — les notes importantes · [[Comment marche ce cerveau]] — le mode d'emploi
- Arrivées : \`00-Inbox\` · Journal : \`01-Journal\` · Savoir transverse : \`70-Savoir\` · Personnes : \`75-Personnes\` · Sources : \`80-Sources\`

## Protocole de chaque session (pour les IA)
1. \`brain_demarrer\` → 2. \`brain_skill\` → 3. \`brain_contexte\` avant de répondre → 4. écrire, relier, journaliser → 5. \`brain_cloture\`.
`, created);
  await put(dir, P.memoire, fm({ type: "memoire", tags: ["noyau", "memoire", "ia"], parent: "[[00-COMMENCER-ICI]]", auteur: "ia", statut: "vivant", resume: "Mémoire durable des IA : chaque IA y ajoute ce qu'elle apprend (une ligne datée et sourcée).", cree: today() }) +
    "# Ce que les IA savent de nous\n\n## Qui ils sont\n\n## Comment ils travaillent / leurs préférences\n\n## Le business\n\n## Leurs outils\n\n## Projets en cours\n\n## Questions ouvertes\n\nLiens : [[00-COMMENCER-ICI]]\n", created);
  await put(dir, `${P.noyau}/Objectifs.md`, fm({ type: "hub", tags: ["noyau"], parent: "[[00-COMMENCER-ICI]]", auteur: qui, statut: "a-completer", resume: "Mes objectifs : cette année, dans 3 ans, dans 10 ans. Chaque domaine s'y rattache.", cree: today() }) +
    "# Objectifs\n\n## Cette année\n- \n\n## Dans 3 ans\n- \n\n## Dans 10 ans\n- \n\nLiens : [[00-COMMENCER-ICI]] · [[Ce que les IA savent de nous]]\n", created);
  await put(dir, "99-Systeme/index.md", fm({ type: "index", tags: ["systeme"], auteur: "ia", resume: "Sommaire manuel des notes importantes.", cree: today() }) +
    "# Index\n\n> **À quoi sert cette page ?** Le sommaire des notes IMPORTANTES, tenu à la main (par toi ou l'IA).\n> Chaque dossier a en plus un `_index.md` automatique (une ligne par note) : on ne l'écrit jamais à la main.\n\n- [[00-COMMENCER-ICI]] — point d'entrée\n- [[Objectifs]] — mes objectifs\n- [[Ce que les IA savent de nous]] — mémoire des IA\n- [[Comment marche ce cerveau]] — mode d'emploi\n", created);
  await put(dir, "99-Systeme/Comment marche ce cerveau.md", fm({ type: "guide", tags: ["systeme", "guide"], parent: "[[00-COMMENCER-ICI]]", auteur: "ia", statut: "actif", resume: "Mode d'emploi : les dossiers, comment relier, le log, l'index, les fichiers Office, les skills.", cree: today() }) +
`# Comment marche ce cerveau

## L'idée
Tu déposes du **brut** (liens, fichiers, idées) → l'IA le **range** et le **relie** → elle **répond** en citant les notes → elle **entretient** le tout.
Ce sont de simples dossiers : tout s'ouvre sans Axon.

## La forme : des domaines, tous sur le même moule
Chaque domaine de ta vie (École, Business, Finance, Trading…) a :
- un **hub** \`<Domaine>.md\` : la carte du domaine (objectifs, projets, savoir clé, décisions) ;
- \`Projets/<Projet>/\` : **un projet = un dossier = un neurone**, avec ses fichiers (Excel, Word, PDF) à côté ;
- \`Savoir/\` (ce que tu apprends) · \`Decisions/\` · \`Ressources/\` · \`Archives/\`.
Ajouter un domaine : demande à l'IA « crée un domaine Santé » (outil \`brain_creer_domaine\`).

## Les liaisons
1. **Vers le haut** : chaque note a un \`parent\` (son hub) → on ne se perd jamais.
2. **De côté** : au moins 2 liens vers d'autres endroits (une personne, un concept, une source) → les idées se croisent entre domaines (ex. un cours d'économie relié à ta stratégie de trading).
3. **Les hubs** listent l'essentiel → l'IA lit le hub avant d'ouvrir 50 notes.

## Les fichiers système
| Fichier | C'est quoi | Qui l'écrit |
|---|---|---|
| \`99-Systeme/Log/AAAA-MM Prénom.md\` | Le **carnet de bord** : une ligne par action (date, qui, quoi). Un fichier par personne → pas de conflit à deux. | l'IA, après chaque tâche |
| [[index]] | Le **sommaire** des notes importantes. | l'IA ou toi |
| \`_index.md\` (un par dossier) | La **table des matières automatique** : une ligne de résumé par note. | le programme |
| [[Membres]] | Qui partage ce cerveau. | le programme |

## Les fichiers Office
Un Excel, un Word ou un PowerPoint vit dans son neurone. L'IA peut le lire, le modifier sur place (\`brain_office\`), ou le sortir, travailler dessus et le remettre (\`brain_sortir\` / \`brain_remettre\`). L'ancienne version est toujours gardée.

## Ce qui est protégé
Rien n'est supprimé (\`00-Inbox/_archive/\`) · chaque modification garde l'ancienne version · l'IA ne réécrit pas les mots d'un humain sans accord.

Liens : [[00-COMMENCER-ICI]] · [[index]]
`, created);
  await put(dir, `${P.templates}/Note.md`, "---\ntype: note\nparent: \ntags: []\nauteur: \nstatut: brouillon\nresume: \ncree: {{date}}\n---\n# {{titre}}\n\n\n## Liens\n- \n", created);
  await put(dir, `${P.templates}/Projet.md`, "---\ntype: projet\nparent: \ntags: [projet]\nauteur: \nstatut: actif\nresume: \ncree: {{date}}\n---\n# {{titre}}\n\n## Objectif\n\n## Statut et prochaines étapes\n- [ ] \n\n## Fichiers\n<!-- ![[fichier.xlsx]] -->\n\n## Liens\n- \n", created);
  await put(dir, `${P.templates}/Decision.md`, "---\ntype: decision\nparent: \ntags: [decision]\nauteur: \nstatut: valide\nresume: \ncree: {{date}}\n---\n# {{titre}}\n\n## Contexte\n\n## Choix\n\n## Pourquoi\n\n## Liens\n- \n", created);
  await put(dir, `${P.templates}/Personne.md`, "---\ntype: personne\nparent: \ntags: [personne]\nauteur: \nresume: \ncree: {{date}}\n---\n# {{titre}}\n\n## Qui\n\n## Contexte / comment on se connaît\n\n## Liens\n- \n", created);
  await put(dir, ".gitignore", "# Gros fichiers : restent sur le PC ou dans le cloud\n*.mp4\n*.mov\n*.mkv\n*.webm\n*.wav\n*.flac\n*.zip\n.brain/\n**/Banques/**/*.png\n**/Banques/**/*.jpg\n**/Banques/**/*.webp\n", created);

  for (const r of REGIONS_FIXES) await ajouterRegion(dir, r);
  for (const d of domaines) await creerDomaine(dir, d, { created });
  await ajouterMembre(dir, utilisateur);
  await fs.mkdir(path.join(dir, P.logDir), { recursive: true });
  const logRel = `${P.logDir}/${today().slice(0, 7)}${utilisateur ? " " + utilisateur : ""}.md`;
  await put(dir, logRel, fm({ type: "log", tags: ["systeme"], resume: "Carnet de bord : une ligne par action (date | agent | qui | quoi | notes)." }) + `# Log\n\n${today()} | Axon | ${qui} | Création du cerveau « ${nom} » (${domaines.map((d) => d.nom).join(", ")}) | [[00-COMMENCER-ICI]]\n`, created);
  const skills = copySkills(path.join(dir, ".claude", "skills"));
  return { dir, created, skills };
}
