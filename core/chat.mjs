// Le modèle intégré : on parle à Claude (via Claude Code, avec l'abonnement déjà présent sur le PC)
// en lui donnant l'« âme » du Brain + un paquet de contexte calculé localement.
// Les questions de navigation (« c'est où… », « emmène-moi… ») sont résolues instantanément en local, sans tokens.
import { spawn } from "node:child_process";
import os from "node:os";
import { contextPack, neural } from "./maintain.mjs";

// \b ne gère pas les lettres accentuées en JS : on délimite avec des espaces / débuts de phrase.
const NAV = /(^|[\s,.!?'])(c'est\s+o[uù]|o[uù](?=[\s?!,.]|$)|emm[eè]ne[- ]?moi|montre[- ]?moi|am[eè]ne[- ]?moi|va\s+(?:à|a|sur|vers)|trouve[- ]?moi|ouvre|navigue)/i;
const STOP = new Set("c est c'est ou où le la les l du de des d un une neurone neurones note notes dans cerveau brain moi me se trouve trouver est sont il y a va vers sur à a montre emmene emmène amene amène ouvre navigue stp svp please".split(" "));
const norm = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export const isNavigation = (text) => NAV.test(text);

// Navigation locale : recherche neuronale + bonus si le titre contient les mots de la question.
export async function navigate(vault, semantic, text) {
  const words = norm(text).replace(/[^\p{L}\p{N}' -]/gu, " ").split(/[\s']+/).filter((w) => w && !STOP.has(w));
  const q = words.join(" ") || text;
  const hits = await neural(vault, semantic, q, 8);
  const titleScore = (t) => { const nt = norm(t); return words.filter((w) => w.length > 2 && nt.includes(w.replace(/s$/, ""))).length; };
  hits.sort((a, b) => titleScore(b.title) - titleScore(a.title) || 0);
  if (!hits.length) return { text: "Je n'ai trouvé aucun neurone qui correspond. Essaie avec d'autres mots.", target: null, sources: [] };
  const [best, ...rest] = hits;
  const n = vault.notes.get(best.rel);
  const where = best.rel.split("/").slice(0, -1).join(" / ") || "la racine";
  const resume = n?.fm?.resume || best.summary?.slice(0, 180);
  const others = rest.slice(0, 3).map((h) => `[[${h.title}]]`).join(" · ");
  return {
    text: `Le neurone **[[${best.title}]]** se trouve dans \`${where}\`.${resume ? `\n\n> ${resume}` : ""}\n\nJe t'y emmène.${others ? `\n\nProches : ${others}` : ""}`,
    target: best.rel, sources: hits.slice(0, 5).map((h) => ({ rel: h.rel, title: h.title })),
  };
}

// Conversation avec Claude Code en mode non interactif, en flux (stream-json).
// L'âme et le contexte passent par l'entrée standard (la ligne de commande Windows est limitée à 8 191 caractères).
export function askClaude({ vault, semantic, soul, question, sessionId, onEvent }) {
  return new Promise(async (resolve, reject) => {
    const pack = await contextPack(vault, semantic, question, { budgetWords: 3000 }).catch(() => ({ text: "", notes: [] }));
    const prompt = sessionId
      ? `# Contexte mis à jour (extrait du cerveau)\n\n${pack.text}\n\n---\n# Question\n${question}`
      : `${soul}\n\n---\n# Paquet de contexte pour cette question (extrait du cerveau)\n\n${pack.text}\n\n---\n# Question de l'utilisateur\n${question}`;
    const args = ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
      "--disallowedTools", "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Task"];
    if (sessionId) args.push("--resume", sessionId);
    // Lancé hors du dossier du projet : pas de hook ni de serveur MCP à démarrer → réponse plus rapide.
    const win = process.platform === "win32";
    const child = spawn(win ? "claude.cmd" : "claude", args, { cwd: os.tmpdir(), shell: win, windowsHide: true, env: process.env });
    child.stdin.end(prompt, "utf8");
    let buf = "", full = "", sid = sessionId || null, err = "";
    child.stdout.on("data", (d) => {
      buf += d.toString("utf8");
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        if (ev.session_id) sid = ev.session_id;
        if (ev.type === "stream_event" && ev.event?.type === "content_block_delta" && ev.event.delta?.type === "text_delta") {
          full += ev.event.delta.text; onEvent?.({ type: "delta", text: ev.event.delta.text });
        } else if (ev.type === "result") {
          if (!full && ev.result) { full = ev.result; onEvent?.({ type: "delta", text: ev.result }); }
          if (ev.is_error) err = ev.result || "erreur";
        }
      }
    });
    child.stderr.on("data", (d) => (err += d.toString("utf8")));
    child.on("error", (e) => reject(new Error(`Claude Code introuvable (${e.message}). Installe-le, puis connecte-toi une fois avec la commande « claude ».`)));
    child.on("close", (code) => {
      if (/credit balance is too low/i.test(full + err)) return reject(new Error("Claude Code n'a plus de crédit sur le compte utilisé. Ouvre un terminal, tape « claude », puis « /login » et connecte-toi avec ton abonnement Claude (pas une clé API)."));
      if (!full && (code !== 0 || err)) return reject(new Error(err.trim().slice(0, 400) || `Claude s'est arrêté (code ${code})`));
      const m = full.match(/^NAVIGUER:\s*(.+)$/m);
      resolve({ text: full.replace(/^NAVIGUER:.*$/m, "").trim(), sessionId: sid, target: m ? m[1].trim() : null, sources: pack.notes.map((rel) => ({ rel, title: vault.notes.get(rel)?.title || rel })) });
    });
  });
}
