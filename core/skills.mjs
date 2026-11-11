// Les SKILLS d'Axon : des modes d'emploi courts (format Agent Skills : SKILL.md avec name + description)
// qui disent à une IA COMMENT travailler avec le cerveau (capturer, répondre, compiler, entretenir,
// architecturer, développer). Source unique : app/skills/. Ils sont :
//  - copiés dans chaque nouveau cerveau (.claude/skills/) → Claude Code les charge tout seul ;
//  - copiés dans ~/.claude/skills par l'installateur → disponibles partout ;
//  - servis par le serveur MCP (prompts + outil brain_skill) → toute IA branchée les a, même sans dossier.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// app/core → app/skills ; connecteur empaqueté : connector/server → connector/skills
export const SKILLS_DIR = [path.join(here, "..", "skills"), path.join(here, "skills")].find((d) => fs.existsSync(d)) || path.join(here, "..", "skills");

/** Liste les skills (d'abord ceux du cerveau, qui peuvent remplacer ceux de l'app). */
export function loadSkills(vaultRoot) {
  const out = new Map();
  for (const dir of [SKILLS_DIR, vaultRoot && path.join(vaultRoot, ".claude", "skills")]) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const f = path.join(dir, name, "SKILL.md");
      if (!name.startsWith("axon-") || !fs.existsSync(f)) continue;
      const raw = fs.readFileSync(f, "utf8");
      const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || "";
      const description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() || "";
      out.set(name, { name, description, body: raw.replace(/^---[\s\S]*?---\r?\n/, "").trim(), dir: path.dirname(f) });
    }
  }
  return [...out.values()];
}

/** Copie les skills de l'app dans `dest` (ne remplace pas un skill déjà personnalisé). */
export function copySkills(dest) {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const done = [];
  for (const name of fs.readdirSync(SKILLS_DIR)) {
    const to = path.join(dest, name);
    if (fs.existsSync(to)) continue;
    fs.cpSync(path.join(SKILLS_DIR, name), to, { recursive: true });
    done.push(name);
  }
  return done;
}
