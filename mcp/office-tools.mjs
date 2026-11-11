// Outils MCP pour les FICHIERS OFFICE et les DOMAINES (branchés par server.mjs).
//  brain_office   : lire / modifier sur place un Excel, un Word ou un PowerPoint (ancienne version gardée)
//  brain_sortir   : copie un fichier du cerveau dans un dossier de travail (pour le modifier avec n'importe quel outil)
//  brain_remettre : remet le fichier modifié (ou un nouveau fichier) dans son neurone, en gardant l'ancienne version
//  brain_creer_domaine : ajoute un domaine de vie complet (hub + Projets/Savoir/Decisions/Ressources/Archives + région 3D)
import fs from "node:fs/promises";
import fss from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { excelLire, excelEcrire, docLire, docModifier, officeKind } from "../core/office.mjs";
import { creerDomaine, prochainDomaine } from "../core/scaffold.mjs";

export function registerOfficeTools(server, { vault, text, refresh, saveVersion, findFile }) {
  const WORK = path.join(os.homedir(), "Axon-travail");
  const sortiesFile = () => vault.abs(".brain/sorties.json");
  const readSorties = async () => JSON.parse(await fs.readFile(sortiesFile(), "utf8").catch(() => "{}"));

  server.registerTool("brain_office", {
    description: "Lit ou MODIFIE SUR PLACE un fichier Office du cerveau sans casser sa mise en forme. Excel (.xlsx) : action « lire » (tableau, option feuille / plage ex. A1:F40) ou « ecrire » (cellules {\"B3\": 120, \"C3\": \"=B3*2\"}, lignes à ajouter à la fin, nouvelle_feuille). Word (.docx) et PowerPoint (.pptx) : « lire » (texte par paragraphe / diapo) ou « modifier » (remplacements [{chercher, remplacer}] au texte EXACT lu avant, ajouter = paragraphes à la fin ou dans la diapo). L'ancienne version est toujours gardée (brain_versions pour revenir). Lis TOUJOURS avant de modifier.",
    inputSchema: {
      fichier: z.string().describe("Chemin ou nom du fichier (.xlsx, .docx, .pptx)"),
      action: z.enum(["lire", "ecrire", "modifier"]),
      feuille: z.string().optional(), plage: z.string().optional(),
      cellules: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
      lignes: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).optional(),
      nouvelle_feuille: z.string().optional(),
      remplacements: z.array(z.object({ chercher: z.string().min(1), remplacer: z.string() })).optional(),
      ajouter: z.array(z.string()).optional(), diapo: z.number().optional(),
    },
  }, async (a) => {
    await refresh();
    const rel = findFile(a.fichier);
    if (!rel) return text(`Fichier introuvable « ${a.fichier} ». Cherche-le avec brain_chercher ou brain_dossier.`);
    const kind = officeKind(rel);
    if (!kind) return text(`« ${rel} » n'est pas un .xlsx, .docx ou .pptx. Pour un texte : brain_modifier. Pour un autre format : brain_sortir puis brain_remettre.`);
    const abs = vault.abs(rel);
    try {
      if (a.action === "lire") return text(`# ${rel}\n\n${kind === "xlsx" ? await excelLire(abs, a) : await docLire(abs, kind)}`);
      const v = await saveVersion(rel);
      const msg = kind === "xlsx" ? await excelEcrire(abs, a) : await docModifier(abs, kind, a);
      await vault.load(rel);
      await vault.log(`Fichier Office modifié : ${path.basename(rel)}`, [rel], "", "IA");
      return text(`${msg}\nAncienne version gardée : ${path.relative(vault.root, v)}`);
    } catch (e) { return text(`Échec sur « ${rel} » : ${e.message}. Le fichier n'a pas été abîmé si l'erreur est survenue avant l'écriture ; sinon restaure avec brain_versions.`); }
  });

  server.registerTool("brain_sortir", {
    description: "Copie un fichier du cerveau (n'importe quel format : Excel, Word, PowerPoint, image, PDF, code…) dans un dossier de travail sur ce PC, pour le modifier avec un vrai outil (Python, Excel, script…). Renvoie le chemin de la copie. Quand c'est fini : brain_remettre avec ce chemin.",
    inputSchema: { fichier: z.string() },
  }, async ({ fichier }) => {
    await refresh();
    const rel = findFile(fichier);
    if (!rel) return text(`Fichier introuvable « ${fichier} ».`);
    const dir = path.join(WORK, new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
    await fs.mkdir(dir, { recursive: true });
    const dest = path.join(dir, path.basename(rel));
    await fs.copyFile(vault.abs(rel), dest);
    const s = await readSorties(); s[dest] = rel;
    await fs.mkdir(path.dirname(sortiesFile()), { recursive: true });
    await fs.writeFile(sortiesFile(), JSON.stringify(s, null, 2));
    return text(`Copie de travail : ${dest}\nOriginal : ${rel}\nModifie la copie, puis appelle brain_remettre avec chemin_local = ce chemin.`);
  });

  server.registerTool("brain_remettre", {
    description: "Remet dans le cerveau un fichier du PC : la copie modifiée d'un brain_sortir (elle reprend sa place, l'ancienne version est gardée), ou un NOUVEAU fichier (Excel, Word, image…) à ranger dans un neurone (destination = dossier ou chemin dans le cerveau, ex. « 30-Finance/Projets/Budget 2027 »). Option note : intègre le fichier dans cette note avec ![[…]].",
    inputSchema: { chemin_local: z.string(), destination: z.string().optional(), note: z.string().optional() },
  }, async ({ chemin_local, destination, note }) => {
    const src = path.resolve(chemin_local);
    if (!fss.existsSync(src)) return text(`Fichier introuvable sur le PC : ${src}`);
    const s = await readSorties();
    let rel = s[src];
    if (!rel) {
      if (!destination) return text("Ce fichier ne vient pas d'un brain_sortir : indique destination (dossier du neurone, ex. 30-Finance/Projets/Budget 2027).");
      const d = destination.replace(/\\/g, "/").replace(/\/$/, "");
      rel = path.extname(d) ? d : `${d}/${path.basename(src)}`;
      if (/(^|\/)\.\.(\/|$)/.test(rel)) return text("Destination invalide.");
    }
    const v = await saveVersion(rel);
    await fs.mkdir(path.dirname(vault.abs(rel)), { recursive: true });
    await fs.copyFile(src, vault.abs(rel));
    await vault.load(rel);
    let embed = "";
    if (note) {
      await refresh();
      const nrel = vault.resolve(note);
      if (nrel) { const body = await vault.read(nrel); if (!body.includes(`![[${path.basename(rel)}]]`)) { await saveVersion(nrel); await vault.write(nrel, body.replace(/\s*$/, `\n\n![[${path.basename(rel)}]]\n`)); embed = ` · intégré dans ${nrel}`; } }
    }
    if (s[src]) { delete s[src]; await fs.writeFile(sortiesFile(), JSON.stringify(s, null, 2)); }
    await vault.log(`${v ? "Fichier remis à jour" : "Nouveau fichier"} : ${path.basename(rel)}`, [rel], "", "IA");
    return text(`${v ? "Remis à sa place" : "Rangé"} : ${rel}${v ? ` (ancienne version gardée : ${path.relative(vault.root, v)})` : ""}${embed}`);
  });

  server.registerTool("brain_creer_domaine", {
    description: "Ajoute un DOMAINE de vie au cerveau (ex. Santé, Sport, Musique, Immobilier) avec le moule complet : dossier numéroté, hub <Domaine>.md, Projets/, Savoir/, Decisions/, Ressources/, Archives/, une région dans le cerveau 3D et un lien depuis l'accueil. Vérifie d'abord avec brain_dossier qu'il n'existe pas déjà.",
    inputSchema: { nom: z.string().min(2), description: z.string().optional() },
  }, async ({ nom, description = "" }) => {
    const clean = nom.replace(/[\\/:*?"<>|]/g, "").trim();
    const d = prochainDomaine(vault.root, clean, description);
    const folder = await creerDomaine(vault.root, d);
    await refresh();
    await vault.log(`Nouveau domaine « ${clean} »`, [`${folder}/${clean}.md`], "", "IA");
    return text(`Domaine créé : ${folder}/ (hub ${clean}.md, région ${d.position}). Complète le hub avec les objectifs du domaine.`);
  });
}
