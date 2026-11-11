#!/usr/bin/env node
// Serveur MCP du Brain : branche n'importe quelle IA compatible MCP (Claude Code, Claude Desktop,
// Cursor, Codex…) sur le cerveau. Les IA cherchent, lisent, écrivent et relient — sans jamais supprimer.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import { openBrain, modelsDir } from "../core/open.mjs";
import { buildIndexes, lint, hybrid, contextPack } from "../core/maintain.mjs";
import { P, journalDuJour } from "../core/structure.mjs";

const { vault, sem } = await openBrain({ semantic: false });
const VAULT_ABS = vault.root;
let semReady = null;
const ensureSem = async () => {
  if (!semReady) semReady = (async () => { const { Semantic } = await import("../core/semantic.mjs"); const { modelsDir } = await import("../core/open.mjs"); const s = new Semantic(vault, modelsDir); await s.indexAll(); return s; })().catch(() => null); // sans modèle local (connecteur portable) : recherche par mots
  return semReady;
};
const refresh = async () => { await vault.scan(); };
const text = (t) => ({ content: [{ type: "text", text: t }] });
const find = (q) => vault.resolve(q) || vault.search(q, 1)[0]?.rel;

const server = new McpServer({ name: "axon", title: "Axon", version: "0.7.0" }, {
  instructions: "Axon : la mémoire externe persistante de ce cerveau (les humains, leur entreprise, leurs projets). Commence par brain_demarrer (ou brain_carte), puis brain_contexte ou brain_chercher. Après un travail important, écris une note (brain_ecrire) puis fais le rituel de fin de session (brain_cloture). Ne mets jamais de secret (mot de passe, clé) dans le Brain.",
});

server.registerTool("brain_carte", { description: "Carte du Brain : règles (CLAUDE.md) + carte automatique des dossiers. À lire en premier.", inputSchema: {} }, async () => {
  await refresh(); await buildIndexes(vault);
  const rules = await vault.read("CLAUDE.md").catch(() => "");
  const map = await vault.read(P.carte).catch(() => "");
  return text(`${rules}\n\n${map}`);
});

server.registerTool("brain_chercher", { description: "Recherche hybride (mots + sens) dans tout le Brain. Renvoie titres, chemins et résumés.", inputSchema: { requete: z.string(), nombre: z.number().int().min(1).max(40).optional() } }, async ({ requete, nombre = 12 }) => {
  await refresh();
  const s = await ensureSem().catch(() => null);
  const res = await hybrid(vault, s, requete, nombre);
  return text(res.map((r) => `- ${r.title} (${r.rel})\n  ${r.summary}`).join("\n") || "Rien trouvé.");
});

server.registerTool("brain_contexte", { description: "Paquet de contexte compact pour répondre à une question : notes les plus pertinentes en entier + voisines en résumé.", inputSchema: { question: z.string(), mots_max: z.number().int().min(500).max(20000).optional() } }, async ({ question, mots_max = 3500 }) => {
  await refresh();
  const s = await ensureSem().catch(() => null);
  return text((await contextPack(vault, s, question, { budgetWords: mots_max })).text);
});

server.registerTool("brain_lire", { description: "Lit une note (par nom ou chemin).", inputSchema: { note: z.string() } }, async ({ note }) => {
  await refresh(); const rel = find(note);
  return text(rel ? `# ${rel}\n\n${await vault.read(rel)}` : `Note introuvable : ${note}`);
});

server.registerTool("brain_liens", { description: "Liens sortants, rétroliens et notes proches par le sens d'une note.", inputSchema: { note: z.string() } }, async ({ note }) => {
  await refresh(); const rel = find(note);
  if (!rel) return text(`Note introuvable : ${note}`);
  const s = await ensureSem().catch(() => null);
  const near = s ? s.related(rel, 8).map((r) => `- ${r.title} (${Math.round(r.score * 100)} %)`).join("\n") : "(sens indisponible)";
  return text(`Note : ${rel}\n\nSortants :\n${vault.outlinks(rel).map((o) => `- ${o.name}${o.rel ? "" : " (manquante)"}`).join("\n")}\n\nRétroliens :\n${vault.backlinks(rel).map((b) => `- ${b.title}`).join("\n")}\n\nProches :\n${near}`);
});

server.registerTool("brain_ecrire", { description: "Crée ou remplace une note Markdown (chemin relatif .md). Ne supprime jamais rien. Respecte les règles de CLAUDE.md (frontmatter, liens, mots humains intacts).", inputSchema: { chemin: z.string().regex(/\.md$/), contenu: z.string(), raison: z.string().optional() } }, async ({ chemin, contenu, raison }) => {
  await refresh();
  const prev = vault.notes.get(chemin);
  const existed = !!prev;
  // Côté humain protégé : une note écrite par un humain ne peut pas être remplacée par une IA sans accord.
  const author = String(prev?.fm?.auteur || "").toLowerCase();
  if (existed && author && !["claude", "ia", "mcp", "cli"].includes(author)) {
    const old = await vault.read(chemin);
    if (!contenu.startsWith(old.trimEnd())) return text(`Refusé : « ${chemin} » a été écrite par ${prev.fm.auteur} (côté humain). Tu peux seulement AJOUTER à la fin (outil brain_ajouter, section « ## Synthèse IA »), jamais réécrire ses mots.`);
  }
  await vault.write(chemin, contenu);
  await vault.log(`${existed ? "Modification" : "Création"}${raison ? " : " + raison : ""}`, [chemin], "", "MCP");
  return text(`${existed ? "Modifiée" : "Créée"} : ${chemin}`);
});

server.registerTool("brain_ajouter", { description: "Ajoute du texte à la fin d'une note existante (sans toucher au reste).", inputSchema: { note: z.string(), texte: z.string() } }, async ({ note, texte }) => {
  await refresh(); const rel = find(note);
  if (!rel) return text(`Note introuvable : ${note}`);
  await vault.write(rel, (await vault.read(rel)).replace(/\s*$/, "\n\n") + texte + "\n");
  await vault.log("Ajout", [rel], "", "MCP");
  return text(`Ajouté à ${rel}`);
});

server.registerTool("brain_importer", { description: "Importe n'importe quel fichier du PC (vidéo, image, son, PDF, texte, Markdown…) dans le Brain : copie rangée par mois + fiche. Une vidéo ou un son est transcrit automatiquement (Whisper local), une image reçoit le texte qu'elle contient (OCR), un PDF / Word / PowerPoint / Excel est converti en Markdown (texte cherchable).", inputSchema: { fichier: z.string(), description: z.string().optional() } }, async ({ fichier, description }) => {
  const r = await vault.importFile(path.resolve(fichier), { auteur: "IA" });
  let extra = "";
  try {
    const { transcribe, ocr, transcriptSection, ocrSection } = await import("../core/enrich.mjs");
    const file = vault.abs(r.fileRel);
    const section = r.kind === "video" || r.kind === "audio" ? transcriptSection(await transcribe(file, modelsDir)) : r.kind === "image" ? ocrSection(await ocr(file, modelsDir)) : "";
    let note = await vault.read(r.noteRel);
    if (description) note = note.replace(/## Description\n\n/, `## Description\n\n${description}\n`);
    if (section) note = note.replace(/\n## Liens\n/, section + "\n## Liens\n").replace("statut: a-decrire", "statut: a-compiler");
    await vault.write(r.noteRel, note);
    extra = section ? (r.kind === "image" ? " · texte de l'image lu (OCR)" : " · transcription ajoutée") : "";
  } catch (e) { extra = ` · enrichissement impossible : ${e.message}`; }
  return text(`${r.kind} importé${extra}. Fiche : ${r.noteRel} · fichier : ${r.fileRel}`);
});

// ---------- IA universelle : démarrage, mémoire d'apprentissage, ressources, prompt ----------
server.registerTool("brain_demarrer", { description: "À APPELER EN PREMIER par toute IA qui découvre ce cerveau : qui sont les humains de ce cerveau, la carte des régions, ce que les IA savent déjà d'eux, les dernières actions et le protocole de travail. Une seule lecture suffit pour commencer.", inputSchema: {} }, async () => {
  await refresh();
  const strip = (s) => s.replace(/^---[\s\S]*?---\n/, "").trim();
  const start = strip(await vault.read("00-COMMENCER-ICI.md").catch(() => ""));
  const mem = strip(await vault.read(P.memoire).catch(() => ""));
  const log = (await vault.readLog(10)).join("\n");
  return text(`${start}\n\n---\n# Ce que les IA savent déjà\n${mem}\n\n---\n# Dernières actions\n${log}`);
});

server.registerTool("brain_apprendre", { description: "Ajoute à la mémoire des IA (« Ce que les IA savent de nous ») un fait DURABLE appris sur les humains de ce cerveau ou leur entreprise. Une ligne, datée et sourcée automatiquement. Sections : qui, preferences, business, outils, projets, questions.", inputSchema: { fait: z.string().min(5), section: z.enum(["qui", "preferences", "business", "outils", "projets", "questions"]), source: z.string().optional(), ia: z.string().optional() } }, async ({ fait, section, source = "conversation", ia = "IA" }) => {
  const rel = P.memoire;
  const heads = { qui: "## Qui ils sont", preferences: "## Comment ils travaillent / leurs préférences", business: "## Le business", outils: "## Leurs outils", projets: "## Projets en cours", questions: "## Questions ouvertes" };
  let note = await vault.read(rel);
  const day = new Date().toISOString().slice(0, 10);
  const line = section === "questions" ? `- ${fait} (posée par ${ia}, ${day})` : `- ${day} · ${fait} Source : ${source} (${ia}).`;
  const h = heads[section], i = note.indexOf(h);
  if (i < 0) note = note.replace(/\s*$/, `\n\n${h}\n${line}\n`);
  else { const next = note.indexOf("\n## ", i + h.length); const at = next < 0 ? note.length : next; note = note.slice(0, at).replace(/\s*$/, "\n") + line + "\n" + note.slice(at); }
  await vault.write(rel, note);
  await vault.log(`Mémoire IA (${section}) : ${fait.slice(0, 80)}`, [rel], "", ia);
  return text(`Appris et noté dans « Ce que les IA savent de nous » (${section}).`);
});

// Rituel de fin de session : 3 questions (décidé ? appris ? bloqué ?) rangées dans 3 registres datés.
const REGISTRES = {
  decisions: { rel: P.registres + "/Registre des decisions.md", titre: "Registre des décisions", resume: "Chaque choix structurant, daté, avec le pourquoi (rempli par le rituel de fin de session)." },
  lecons: { rel: P.registres + "/Registre des lecons.md", titre: "Registre des leçons", resume: "Ce qu'on a appris qui change notre façon de faire (rempli par le rituel de fin de session)." },
  blocages: { rel: P.registres + "/Registre des blocages.md", titre: "Registre des blocages", resume: "Ce qui a bloqué plus de 30 minutes et la solution trouvée, pour ne jamais rebloquer." },
};
async function appendRegistre(key, lines) {
  const r = REGISTRES[key];
  let src = await vault.read(r.rel).catch(() => `---\ntype: registre\ntags: [noyau, registre]\nauteur: ia\nstatut: vivant\nresume: ${r.resume}\ncree: ${new Date().toISOString().slice(0, 10)}\n---\n# ${r.titre}\n\nRelié à [[Ce que les IA savent de nous]] et au [[00-COMMENCER-ICI|point d'entrée]]. Les lignes les plus récentes sont en bas.\n\n`);
  await vault.write(r.rel, src.replace(/\s*$/, "\n") + lines.join("\n") + "\n");
}
server.registerTool("brain_cloture", { description: "RITUEL DE FIN DE SESSION (2 minutes, à faire à la fin de tout travail qui compte) : ce qui a été fait, les décisions prises (avec le pourquoi), les leçons apprises, les blocages et leur solution. Range tout dans les registres du Noyau et dans la note du jour.", inputSchema: {
  resume: z.string().min(5).describe("Ce qui a été fait pendant la session, en une ou deux phrases"),
  decisions: z.array(z.object({ choix: z.string(), pourquoi: z.string() })).optional(),
  lecons: z.array(z.string()).optional(),
  blocages: z.array(z.object({ probleme: z.string(), solution: z.string() })).optional(),
  notes: z.array(z.string()).optional().describe("Notes touchées pendant la session"),
  ia: z.string().optional(),
} }, async ({ resume, decisions = [], lecons = [], blocages = [], notes = [], ia = "IA" }) => {
  const day = new Date().toISOString().slice(0, 10);
  const links = notes.map((n) => `[[${path.basename(n, ".md")}]]`).join(" ");
  const src = links ? ` (session : ${links})` : "";
  if (decisions.length) await appendRegistre("decisions", decisions.map((d) => `- ${day} · **${d.choix}** — pourquoi : ${d.pourquoi}${src} · ${ia}`));
  if (lecons.length) await appendRegistre("lecons", lecons.map((l) => `- ${day} · ${l}${src} · ${ia}`));
  if (blocages.length) await appendRegistre("blocages", blocages.map((b) => `- ${day} · ${b.probleme} → **solution :** ${b.solution}${src} · ${ia}`));
  const rel = journalDuJour(vault.user);
  let j = await vault.read(rel).catch(() => `---\ntype: journal\ntags: [journal]\ncree: ${day}\n---\n# ${day}\n\n## Humains\n- \n\n## Agents IA\n`);
  const bilan = [`- ${new Date().toTimeString().slice(0, 5)} · ${ia} · ${resume}${links ? " · " + links : ""}`,
    decisions.length ? `  - Décidé : ${decisions.map((d) => d.choix).join(" ; ")} → [[Registre des decisions]]` : "",
    lecons.length ? `  - Appris : ${lecons.join(" ; ")} → [[Registre des lecons]]` : "",
    blocages.length ? `  - Bloqué : ${blocages.map((b) => b.probleme).join(" ; ")} → [[Registre des blocages]]` : ""].filter(Boolean).join("\n");
  j = /## Agents IA\n/.test(j) ? j.replace(/## Agents IA\n/, `## Agents IA\n${bilan}\n`) : j.replace(/\s*$/, `\n\n## Agents IA\n${bilan}\n`);
  await vault.write(rel, j);
  await vault.log(`Clôture de session : ${resume.slice(0, 90)}`, [rel, ...notes], "", ia);
  return text(`Session clôturée : ${decisions.length} décision(s), ${lecons.length} leçon(s), ${blocages.length} blocage(s) rangés dans 05-Noyau/Registres et dans ${rel}.`);
});

const strip = (s) => s.replace(/^---[\s\S]*?---\n/, "");
server.registerResource("commencer-ici", "brain://commencer-ici", { title: "Commencer ici", description: "Point d'entrée du cerveau pour toute IA", mimeType: "text/markdown" },
  async (uri) => ({ contents: [{ uri: uri.href, text: strip(await vault.read("00-COMMENCER-ICI.md")) }] }));
server.registerResource("memoire-ia", "brain://memoire-ia", { title: "Ce que les IA savent de nous", description: "Mémoire vivante des IA sur les humains de ce cerveau", mimeType: "text/markdown" },
  async (uri) => ({ contents: [{ uri: uri.href, text: strip(await vault.read(P.memoire)) }] }));
server.registerResource("contexte-complet", "brain://contexte-complet", { title: "Contexte complet (llms-full.txt)", description: "L'essentiel du cerveau en un fichier", mimeType: "text/plain" },
  async (uri) => ({ contents: [{ uri: uri.href, text: await vault.read("llms-full.txt").catch(() => "") }] }));
server.registerPrompt("demarrer", { title: "Démarrer avec le Brain", description: "Prépare l'IA : lit le point d'entrée et la mémoire, puis attend la tâche." },
  async () => ({ messages: [{ role: "user", content: { type: "text", text: "Appelle l'outil brain_demarrer, lis tout, puis résume en 5 lignes ce que tu sais des humains de ce cerveau et de leurs projets, et demande-moi sur quoi on travaille. Pendant la session, utilise brain_contexte avant de répondre et brain_apprendre quand tu découvres quelque chose de durable. À la fin, fais le rituel brain_cloture." } }] }));

// ----- SKILLS : modes d'emploi pour travailler avec le cerveau (app/skills, ou .claude/skills du cerveau) -----
const { loadSkills } = await import("../core/skills.mjs");
const SKILLS = loadSkills(VAULT_ABS);
for (const sk of SKILLS) {
  server.registerPrompt(sk.name, { title: sk.name.replace("axon-", "Axon · "), description: sk.description },
    async () => ({ messages: [{ role: "user", content: { type: "text", text: `Suis ce mode d'emploi pour la suite :

${sk.body}` } }] }));
}
server.registerTool("brain_skill", { description: `Les SKILLS d'Axon = comment bien travailler avec ce cerveau. Sans nom : liste. Avec un nom : le mode d'emploi complet à suivre. Disponibles : ${SKILLS.map((k) => k.name).join(", ")}. Lis le bon skill AVANT une tâche de ce type (capturer, répondre, compiler, entretenir, restructurer, coder).`, inputSchema: { nom: z.string().optional() } },
  async ({ nom }) => {
    if (!nom) return text(SKILLS.map((k) => `- **${k.name}** : ${k.description}`).join("\n"));
    const k = SKILLS.find((x) => x.name === nom || x.name === "axon-" + nom);
    return text(k ? k.body : `Skill inconnu « ${nom} ». Disponibles : ${SKILLS.map((x) => x.name).join(", ")}`);
  });

// Créer un neurone complet en un appel (texte + médias + liens), rangé dans la bonne région.
// L'app Brain, si elle est ouverte, le montre naître en direct (éclosion + liens qui s'allument).
server.registerTool("brain_creer_neurone", { description: "Crée un NEURONE (une note) dans une région du cerveau, avec texte, médias importés et liens vers d'autres neurones. L'app Brain le montre naître en direct. Régions : Noyau, E-com, Finance, Savoir, Projets, Système, Banques. Pour en créer plusieurs reliés entre eux, appelle cet outil plusieurs fois (le premier d'abord).", inputSchema: {
  titre: z.string().min(2), region: z.string(), texte: z.string().optional(), liens: z.array(z.string()).optional().describe("Titres des neurones à relier"), medias: z.array(z.string()).optional().describe("Chemins de fichiers du PC à importer et intégrer"), tags: z.array(z.string()).optional(), ia: z.string().optional(),
} }, async ({ titre, region, texte = "", liens = [], medias = [], tags = [], ia = "IA" }) => {
  const { loadRegions } = await import("../core/regions.mjs");
  const regions = await loadRegions(vault);
  const norm = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const reg = regions.find((r) => norm(r.nom) === norm(region)) || regions.find((r) => norm(r.nom).includes(norm(region)));
  if (!reg) return text(`Région inconnue « ${region} ». Régions : ${regions.map((r) => r.nom).join(", ")}.`);
  const folder = reg.dossiers.find((d) => d !== "racine") || P.inbox;
  const embeds = [];
  for (const m of medias) { try { const r = await vault.importFile(m, { auteur: ia }); embeds.push(r.kind === "note" ? `- [[${path.basename(r.noteRel, ".md")}]]` : `![[${path.basename(r.fileRel)}]]`); } catch (e) { embeds.push(`- (import impossible : ${path.basename(m)} — ${e.message})`); } }
  await refresh();
  const missing = liens.filter((l) => !vault.resolve(l));
  const body = [texte.trim(), embeds.length && `## Médias\n\n${embeds.join("\n\n")}`, liens.length && `## Liens\n\n${liens.map((l) => `- [[${l}]]`).join("\n")}`].filter(Boolean).join("\n\n");
  const rel = await vault.createNote({ title: titre, folder, body, tags: [norm(reg.nom), ...tags], type: "note", auteur: ia });
  await vault.log(`Nouveau neurone « ${titre} » (${reg.nom})`, [rel], "", ia);
  return text(`Neurone créé : ${rel} (région ${reg.nom}, ${liens.length} lien(s), ${embeds.length} média(s)).${missing.length ? `\nCes liens n'existent pas encore (neurones fantômes à créer) : ${missing.join(", ")}.` : ""}`);
});

// =====================================================================================
// L'IA PEUT TOUT FAIRE (mais ne détruit jamais) : lister, créer, modifier, déplacer, renommer, archiver.
// Chaque modification garde la version précédente dans .brain/versions/ (restaurable).
// =====================================================================================
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
async function saveVersion(rel) {
  const fsp = await import("node:fs/promises");
  const src = vault.abs(rel);
  try { await fsp.access(src); } catch { return null; }
  const dest = vault.abs(`.brain/versions/${rel}/${stamp()}${path.extname(rel)}`);
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
  return dest;
}
const isHuman = (rel) => { const a = String(vault.notes.get(rel)?.fm?.auteur || "").toLowerCase(); return a && !["claude", "ia", "mcp", "cli", "drive", "test"].includes(a); };

server.registerTool("brain_dossier", { description: "Liste un dossier du cerveau : sous-dossiers, notes (avec leur résumé) et fichiers (type, taille). Sans chemin : la racine. Pour naviguer comme dans l'explorateur, mais en sachant ce que contient chaque note.", inputSchema: { chemin: z.string().optional() } }, async ({ chemin = "" }) => {
  const fsp = await import("node:fs/promises");
  await refresh();
  const dir = chemin.replace(/\\/g, "/").replace(/\/$/, "");
  let ents = [];
  try { ents = await fsp.readdir(vault.abs(dir || "."), { withFileTypes: true }); } catch { return text(`Dossier introuvable : ${chemin}`); }
  const dirs = [], notes = [], files = [];
  for (const e of ents) {
    if (e.name.startsWith(".") || ["_mini", "_apercus"].includes(e.name)) continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) dirs.push(`📁 ${e.name}/`);
    else if (e.name.endsWith(".md")) { const n = vault.notes.get(rel); notes.push(`📝 ${e.name}${n?.fm?.resume ? ` — ${String(n.fm.resume).slice(0, 120)}` : ""}`); }
    else { const f = vault.files.get(rel); files.push(`📎 ${e.name} (${f ? (f.size / 1048576).toFixed(2) + " Mo" : "?"})`); }
  }
  const more = files.length > 60 ? `\n… et ${files.length - 60} autres fichiers (utilise brain_banque pour filtrer)` : "";
  return text([`# ${dir || "(racine du cerveau)"}`, ...dirs, ...notes, ...files.slice(0, 60)].join("\n") + more);
});

server.registerTool("brain_modifier", { description: "Modifie un document texte du cerveau (note .md, code .js/.c/.cs/.py/.mq5, .csv, .json, .txt…) en remplaçant un passage EXACT par un autre. La version précédente est sauvegardée (restaurable avec brain_versions). Pour une note écrite par Gabriel ou Léo, il faut confirme_humain: true (seulement si l'utilisateur l'a demandé).", inputSchema: {
  fichier: z.string(), chercher: z.string().min(1), remplacer: z.string(), tout: z.boolean().optional(), confirme_humain: z.boolean().optional(), raison: z.string().optional(),
} }, async ({ fichier, chercher, remplacer, tout = false, confirme_humain = false, raison }) => {
  await refresh();
  const rel = findFile(fichier); if (!rel) return text(`Fichier introuvable : ${fichier}`);
  if (!TEXTY.test(rel)) return text(`« ${rel} » n'est pas un fichier texte. Pour un Word/PDF, crée une version modifiée avec brain_creer_fichier.`);
  if (isHuman(rel) && !confirme_humain) return text(`« ${rel} » a été écrite par ${vault.notes.get(rel).fm.auteur}. Je ne la modifie que si l'utilisateur le demande explicitement (relance avec confirme_humain: true), sinon ajoute une section « ## Synthèse IA » avec brain_ajouter.`);
  const old = await vault.read(rel);
  const count = old.split(chercher).length - 1;
  if (!count) return text(`Passage introuvable dans ${rel}. Lis le fichier (brain_lire / brain_fichier) et recopie le texte exact.`);
  if (count > 1 && !tout) return text(`Le passage apparaît ${count} fois dans ${rel}. Ajoute du contexte pour qu'il soit unique, ou mets tout: true.`);
  const v = await saveVersion(rel);
  await vault.write(rel, tout ? old.split(chercher).join(remplacer) : old.replace(chercher, remplacer));
  await vault.log(`Modification${raison ? " : " + raison : ""}`, [rel], "", "MCP");
  return text(`Modifié : ${rel} (${tout ? count : 1} remplacement(s)). Ancienne version gardée : ${path.relative(vault.root, v)}`);
});

server.registerTool("brain_creer_fichier", { description: "Crée (ou remplace, avec ecraser: true) N'IMPORTE QUEL fichier texte dans le cerveau : note, code (.js, .c, .cs, .py, .mq5…), CSV, JSON, HTML, script. Le dossier est créé si besoin. Si le fichier existait, l'ancienne version est sauvegardée. Pour importer un fichier binaire du PC (image, vidéo, PDF), utilise brain_importer.", inputSchema: {
  chemin: z.string(), contenu: z.string(), ecraser: z.boolean().optional(), raison: z.string().optional(),
} }, async ({ chemin, contenu, ecraser = false, raison }) => {
  await refresh();
  const rel = chemin.replace(/\\/g, "/").replace(/^\/+/, "");
  if (/(mot.?de.?passe|password|token|api.?key|secret)/i.test(rel + contenu.slice(0, 2000)) && /(sk-|ghp_|AKIA|-----BEGIN)/.test(contenu)) return text("Refusé : ce contenu ressemble à un secret (clé, mot de passe). Les secrets ne vont jamais dans le cerveau.");
  const exists = vault.notes.has(rel) || vault.files.has(rel);
  if (exists && !ecraser) return text(`« ${rel} » existe déjà. Relance avec ecraser: true (l'ancienne version sera gardée) ou utilise brain_modifier.`);
  if (exists && isHuman(rel)) return text(`« ${rel} » a été écrite par un humain : utilise brain_modifier avec confirme_humain si l'utilisateur l'a demandé.`);
  const v = exists ? await saveVersion(rel) : null;
  await vault.write(rel, contenu);
  await vault.log(`${exists ? "Remplacement" : "Création"} de fichier${raison ? " : " + raison : ""}`, [rel], "", "MCP");
  return text(`${exists ? "Remplacé" : "Créé"} : ${rel}${v ? ` (ancienne version : ${path.relative(vault.root, v)})` : ""}`);
});

server.registerTool("brain_deplacer", { description: "Déplace ou renomme une note, un fichier ou un dossier du cerveau. Les [[liens]] qui pointaient vers une note renommée sont mis à jour partout. Ne remplace jamais un fichier existant.", inputSchema: { de: z.string(), vers: z.string(), raison: z.string().optional() } }, async ({ de, vers, raison }) => {
  const fsp = await import("node:fs/promises");
  await refresh();
  const src = findFile(de) || de.replace(/\\/g, "/");
  const dest = vers.replace(/\\/g, "/").replace(/^\/+/, "");
  try { await fsp.access(vault.abs(src)); } catch { return text(`Introuvable : ${de}`); }
  try { await fsp.access(vault.abs(dest)); return text(`« ${dest} » existe déjà : je ne remplace jamais. Choisis un autre nom.`); } catch { /* libre */ }
  await fsp.mkdir(path.dirname(vault.abs(dest)), { recursive: true });
  await fsp.rename(vault.abs(src), vault.abs(dest));
  // liens : [[Ancien titre]] → [[Nouveau titre]] si le nom de la note change
  let fixed = 0;
  const oldName = path.basename(src, ".md"), newName = path.basename(dest, ".md");
  if (src.endsWith(".md") && oldName !== newName) {
    await refresh();
    const re = new RegExp(`\\[\\[${oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\|[^\\]]*|#[^\\]]*)?\\]\\]`, "g");
    for (const n of vault.notes.values()) {
      const t = await vault.read(n.rel); if (!re.test(t)) continue; re.lastIndex = 0;
      await vault.write(n.rel, t.replace(re, (_, rest = "") => `[[${newName}${rest}]]`)); fixed++;
    }
  }
  await refresh();
  await vault.log(`Déplacement ${src} → ${dest}${raison ? " : " + raison : ""}`, [dest], "", "MCP");
  return text(`Déplacé : ${src} → ${dest}${fixed ? ` · liens mis à jour dans ${fixed} note(s)` : ""}`);
});

server.registerTool("brain_archiver", { description: "« Supprimer » sans perdre : déplace une note, un fichier ou un dossier dans 00-Inbox/_archive/ (règle du cerveau : on ne supprime jamais). Récupérable à tout moment avec brain_deplacer.", inputSchema: { chemin: z.string(), raison: z.string().optional() } }, async ({ chemin, raison }) => {
  const fsp = await import("node:fs/promises");
  await refresh();
  const src = findFile(chemin) || chemin.replace(/\\/g, "/");
  try { await fsp.access(vault.abs(src)); } catch { return text(`Introuvable : ${chemin}`); }
  const dest = `${P.archive}/${new Date().toISOString().slice(0, 10)}/${src}`;
  await fsp.mkdir(path.dirname(vault.abs(dest)), { recursive: true });
  await fsp.rename(vault.abs(src), vault.abs(dest));
  await refresh();
  await vault.log(`Archivé${raison ? " : " + raison : ""}`, [dest], "", "MCP");
  return text(`Archivé (récupérable) : ${src} → ${dest}`);
});

server.registerTool("brain_versions", { description: "Liste les anciennes versions d'un fichier (sauvegardées à chaque modification par l'IA) et peut en restaurer une (restaurer: nom de la version). La version actuelle est elle-même sauvegardée avant restauration.", inputSchema: { fichier: z.string(), restaurer: z.string().optional() } }, async ({ fichier, restaurer }) => {
  const fsp = await import("node:fs/promises");
  await refresh();
  const rel = findFile(fichier) || fichier;
  const dir = vault.abs(`.brain/versions/${rel}`);
  const list = (await fsp.readdir(dir).catch(() => [])).sort().reverse();
  if (!restaurer) return text(list.length ? `Versions de ${rel} (la plus récente d'abord) :\n${list.map((v) => `- ${v}`).join("\n")}` : `Aucune ancienne version de ${rel}.`);
  if (!list.includes(restaurer)) return text(`Version inconnue : ${restaurer}`);
  await saveVersion(rel);
  await fsp.copyFile(path.join(dir, restaurer), vault.abs(rel));
  await refresh();
  await vault.log(`Restauration de ${rel} (${restaurer})`, [rel], "", "MCP");
  return text(`Restauré : ${rel} ← ${restaurer} (la version d'avant est gardée aussi).`);
});

// ---------- Fichiers en qualité d'origine (n'importe quel type) ----------
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", md: "text/markdown", txt: "text/plain", csv: "text/csv", json: "application/json", html: "text/html", css: "text/css", js: "text/javascript", mjs: "text/javascript", ts: "text/plain", c: "text/x-c", h: "text/x-c", cpp: "text/x-c++", cs: "text/plain", py: "text/x-python", mq5: "text/plain", xml: "application/xml", yml: "text/yaml", yaml: "text/yaml" };
const TEXTY = /\.(md|txt|csv|json|html?|css|m?js|ts|tsx|jsx|c|h|cpp|hpp|cs|py|java|go|rs|rb|php|sh|ps1|bat|sql|xml|ya?ml|ini|toml|mq[45]|log|svg)$/i;
function findFile(q) {
  const s = String(q).trim().replace(/\\/g, "/");
  if (vault.files.has(s) || vault.notes.has(s)) return s;
  const r = vault.resolve(s); if (r) return r;
  const low = s.toLowerCase();
  for (const f of vault.files.values()) if (f.name.toLowerCase() === low || f.rel.toLowerCase().endsWith("/" + low)) return f.rel;
  for (const f of vault.files.values()) if (f.name.toLowerCase().startsWith(low)) return f.rel;
  return null;
}
// Fichiers Office (lire / modifier sur place, sortir / remettre) et domaines
const { registerOfficeTools } = await import("./office-tools.mjs");
registerOfficeTools(server, { vault, text, refresh, saveVersion, findFile });

server.registerTool("brain_fichier", { description: "Donne N'IMPORTE QUEL fichier du cerveau en QUALITÉ D'ORIGINE : image, vidéo, son, PDF, Word, Excel, PowerPoint, code (.js .c .cs .py .net…), texte. Renvoie le chemin exact du fichier d'origine, sa taille, son empreinte SHA-256 ; pour une image, l'image elle-même ; pour un document ou du code, son texte ; pour une vidéo, sa durée, sa miniature et sa transcription si elle existe. Option copier_vers : copie le fichier d'origine, octet pour octet, dans un dossier de travail. Trouver un fichier : brain_banque ou brain_chercher.", inputSchema: {
  fichier: z.string().describe("Chemin dans le cerveau (ex. 30-Finance/Projets/Budget 2027/Budget 2027.xlsx) ou nom du fichier"),
  copier_vers: z.string().optional().describe("Dossier du PC où copier l'original (créé si besoin)"),
  apercu: z.boolean().optional().describe("Joindre l'image (par défaut oui pour les images de moins de 5 Mo)"),
} }, async ({ fichier, copier_vers, apercu = true }) => {
  const fsp = await import("node:fs/promises"), crypto = await import("node:crypto");
  await refresh();
  const rel = findFile(fichier);
  if (!rel) return text(`Fichier introuvable : « ${fichier} ». Cherche-le avec brain_banque (médias) ou brain_chercher (notes).`);
  const abs = vault.abs(rel), buf = await fsp.readFile(abs), ext = path.extname(rel).slice(1).toLowerCase();
  const sha = crypto.createHash("sha256").update(buf).digest("hex"), mime = MIME[ext] || "application/octet-stream";
  const lines = [`Fichier : ${rel}`, `Chemin d'origine (qualité parfaite) : ${abs}`, `Type : ${mime} · ${(buf.length / 1048576).toFixed(2)} Mo · SHA-256 ${sha}`];
  const content = [];
  if (copier_vers) {
    await fsp.mkdir(copier_vers, { recursive: true });
    const dest = path.join(copier_vers, path.basename(rel));
    await fsp.copyFile(abs, dest);
    const same = crypto.createHash("sha256").update(await fsp.readFile(dest)).digest("hex") === sha;
    lines.push(`Copié vers : ${dest} (${same ? "identique à l'original, vérifié" : "ATTENTION : copie différente"})`);
  }
  if (/^image\//.test(mime) && ext !== "svg" && apercu && buf.length < 5 * 1048576) content.push({ type: "image", data: buf.toString("base64"), mimeType: mime });
  else if (/^image\//.test(mime) && buf.length >= 5 * 1048576) lines.push("Image lourde : utilise copier_vers pour l'original.");
  if (TEXTY.test(rel)) { const t = buf.toString("utf8"); lines.push("", "--- Contenu ---", t.slice(0, 60000) + (t.length > 60000 ? "\n… (tronqué : utilise copier_vers pour le fichier complet)" : "")); }
  else if (/\.(pdf|docx|pptx|xlsx|xls|odt)$/i.test(rel)) { const { extractDoc } = await import("../core/docs.mjs"); const r = await extractDoc(abs).catch(() => null); if (r) lines.push("", "--- Texte extrait ---", r.markdown); }
  else if (/^(video|audio)\//.test(mime)) {
    const fiche = rel.replace(/\.[^.]+$/, ".md"), posterRel = rel.replace(/\/([^/]+)\.[^.]+$/, "/_apercus/$1.jpg");
    if (vault.files.has(posterRel)) content.push({ type: "image", data: (await fsp.readFile(vault.abs(posterRel))).toString("base64"), mimeType: "image/jpeg" });
    if (vault.notes.has(fiche)) { const f = await vault.read(fiche); const tr = f.split(/^## Transcription/m)[1]; if (tr) lines.push("", "--- Transcription ---", tr.slice(0, 20000)); }
    lines.push("Vidéo/son : l'original est au chemin ci-dessus (lecture ou montage directs, ou copier_vers).");
  }
  return { content: [{ type: "text", text: lines.join("\n") }, ...content] };
});

// ---------- Parcourir les liens (économe en tokens) ----------
server.registerTool("brain_parcourir", { description: "Suit les LIENS à partir d'un neurone, sur 1 à 3 niveaux, et rend une carte compacte (titre + résumé d'une ligne par neurone, sens du lien). Idéal pour comprendre une zone du cerveau sans lire chaque note : beaucoup moins de tokens. Ensuite, brain_lire seulement les notes utiles.", inputSchema: {
  note: z.string(), profondeur: z.number().int().min(1).max(3).optional(), max: z.number().int().min(5).max(120).optional(), sans_systeme: z.boolean().optional(),
} }, async ({ note, profondeur = 2, max = 40, sans_systeme = true }) => {
  await refresh();
  const start = find(note); if (!start) return text(`Neurone introuvable : ${note}`);
  const sys = (r) => sans_systeme && /^(99-Systeme|95-Flux)\//.test(r) && r !== start;
  const resume = (r) => { const n = vault.notes.get(r); return String(n?.fm?.resume || "").replace(/\s+/g, " ").slice(0, 140); };
  const seen = new Map([[start, 0]]), lines = [];
  let frontier = [start];
  for (let d = 1; d <= profondeur && seen.size < max; d++) {
    const next = [];
    for (const r of frontier) {
      const outs = vault.outlinks(r).filter((o) => o.rel && vault.notes.has(o.rel)).map((o) => [o.rel, "→"]);
      const ins = vault.backlinks(r).map((b) => [b.rel, "←"]);
      for (const [x, dir] of [...outs, ...ins]) {
        if (seen.has(x) || sys(x) || seen.size >= max) continue;
        seen.set(x, d); next.push(x);
        lines.push(`${"  ".repeat(d)}${dir} ${vault.notes.get(x)?.title || x}  (${x})${resume(x) ? ` — ${resume(x)}` : ""}`);
      }
    }
    frontier = next;
  }
  return text([`# Carte autour de « ${vault.notes.get(start)?.title || start} »`, resume(start) ? `> ${resume(start)}` : "", `${seen.size - 1} neurone(s) sur ${profondeur} niveau(x). → = lien sortant, ← = rétrolien.`, "", ...lines].filter(Boolean).join("\n"));
});

// Ressource pour les clients qui joignent des fichiers : axon://fichier/<chemin> renvoie le fichier d'origine.
const { ResourceTemplate } = await import("@modelcontextprotocol/sdk/server/mcp.js");
server.registerResource("fichier", new ResourceTemplate("axon://fichier/{+chemin}", { list: undefined }), { title: "Fichier du cerveau (qualité d'origine)", description: "N'importe quel fichier du cerveau Axon, octet pour octet." },
  async (uri, { chemin }) => {
    const fsp = await import("node:fs/promises");
    const rel = findFile(decodeURIComponent(chemin)); if (!rel) throw new Error("Fichier introuvable");
    const buf = await fsp.readFile(vault.abs(rel)), ext = path.extname(rel).slice(1).toLowerCase(), mimeType = MIME[ext] || "application/octet-stream";
    return { contents: [TEXTY.test(rel) ? { uri: uri.href, mimeType, text: buf.toString("utf8") } : { uri: uri.href, mimeType, blob: buf.toString("base64") }] };
  });

// Banques de médias : recherche filtrée dans les <Domaine>/Banques/_manifest.json (un dossier = un neurone, des centaines de fichiers).
let manifest = null;
server.registerTool("brain_banque", { description: "Trouve des médias dans les banques (images, détourages, clips vidéo, photos : tout dossier Banques/ qui a un _manifest.json). Filtres combinables : texte libre, banque, catégorie ou thème, marque, couleur, format (vertical | horizontal), hd. Renvoie le chemin de chaque fichier dans le Brain et sa description. Lire d'abord « Banques de contenu ».", inputSchema: {
  texte: z.string().optional(), banque: z.string().optional(), categorie: z.string().optional(), marque: z.string().optional(), couleur: z.string().optional(), format: z.enum(["vertical", "horizontal"]).optional(), hd: z.boolean().optional(), nombre: z.number().int().min(1).max(200).optional(),
} }, async ({ texte, banque, categorie, marque, couleur, format, hd, nombre = 30 }) => {
  if (!manifest) { manifest = []; for (const f of vault.files.values()) if (/(^|\/)Banques\/_manifest\.json$/.test(f.rel)) manifest.push(...JSON.parse(await vault.read(f.rel).catch(() => "[]"))); }
  if (!manifest.length) return text("Aucune banque de médias dans ce cerveau (un dossier <Domaine>/Banques/<Banque>/ avec un _manifest.json). Pour les fichiers : brain_chercher ou brain_dossier.");
  const norm = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const has = (v, q) => !q || norm(v).includes(norm(q));
  const words = norm(texte).split(/\s+/).filter(Boolean);
  const res = manifest.filter((m) => has(m.banque, banque) && (has(m.categorie, categorie) || has(m.neurone, categorie)) && has(m.marque, marque) && has(m.couleur, couleur) && (!format || m.format === format) && (hd === undefined || !!m.hd === hd)
    && words.every((w) => norm(`${m.rel} ${m.desc} ${m.neurone} ${m.marque} ${m.couleur} ${m.categorie}`).includes(w)));
  if (!res.length) return text("Rien trouvé. Essayez moins de filtres, ou lisez la note « Banques de contenu ».");
  return text(`${res.length} résultat(s)${res.length > nombre ? ` (les ${nombre} premiers)` : ""} :\n` + res.slice(0, nombre).map((m) => `- ${m.rel}${m.desc ? ` — ${m.desc}` : ""}${m.marque ? ` · ${m.marque}` : ""}${m.couleur ? ` · ${m.couleur}` : ""}${m.duree ? ` · ${m.duree} s ${m.format || ""}` : ""}${m.neurone ? ` · neurone : ${m.neurone}` : ""}`).join("\n") + `\n\nChemins relatifs au coffre : ${VAULT_ABS}`);
});

server.registerTool("brain_recent", { description: "Notes modifiées récemment.", inputSchema: { nombre: z.number().int().min(1).max(100).optional() } }, async ({ nombre = 20 }) => {
  await refresh();
  return text(vault.recent(nombre).map((r) => `- ${new Date(r.mtime).toISOString().slice(0, 16)} ${r.title} (${r.rel})`).join("\n"));
});

server.registerTool("brain_journal", { description: "Ajoute une ligne au log du Brain ET à la section « Agents IA » de la note du jour (qui a fait quoi).", inputSchema: { texte: z.string(), notes: z.array(z.string()).optional() } }, async ({ texte, notes = [] }) => {
  await vault.log(texte, notes, "", "MCP");
  const day = new Date().toISOString().slice(0, 10), rel = journalDuJour(vault.user);
  let src = await vault.read(rel).catch(() => `---\ntype: journal\ntags: [journal]\ncree: ${day}\n---\n# ${day}\n\n## Humains\n- \n\n## Agents IA\n`);
  const line = `- ${new Date().toTimeString().slice(0, 5)} · ${texte}${notes.length ? " · " + notes.map((n) => `[[${path.basename(n, ".md")}]]`).join(" ") : ""}`;
  src = /## Agents IA\n/.test(src) ? src.replace(/## Agents IA\n/, `## Agents IA\n${line}\n`) : src.replace(/\s*$/, `\n\n## Agents IA\n${line}\n`);
  await vault.write(rel, src);
  return text("Journalisé (log + note du jour).");
});

server.registerTool("brain_maj", { description: "Met à jour TOUT le cerveau : flux API (marchés, crypto, devises, veilles, météo), chiffres de la note du jour, index automatiques et rapport de santé. À utiliser quand on dit « mets tout à jour ».", inputSchema: {} }, async () => {
  const { runAll } = await import("../core/connectors.mjs");
  const r = await runAll(vault);
  await refresh(); await buildIndexes(vault); await refresh();
  const s = await ensureSem().catch(() => null);
  const h = await lint(vault, s);
  return text(`Flux : ${r.filter((x) => !x.error).length}/${r.length} mis à jour${r.some((x) => x.error) ? " (échecs : " + r.filter((x) => x.error).map((x) => x.nom).join(", ") + ")" : ""}\nIndex régénérés · Santé : ${h.score}/100 (liens cassés ${h.broken}, orphelines ${h.orphans}, doublons ${h.duplicates})`);
});

server.registerTool("brain_sante", { description: "Met à jour les index automatiques et le rapport de santé (liens cassés, orphelins, doublons…).", inputSchema: {} }, async () => {
  await refresh(); await buildIndexes(vault); await refresh();
  const s = await ensureSem().catch(() => null);
  return text(JSON.stringify(await lint(vault, s), null, 2) + "\nDétail : " + P.sante);
});

await server.connect(new StdioServerTransport());
