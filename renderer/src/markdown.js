// Rendu Markdown → HTML, avec [[liens]] cliquables et ![[médias]] intégrés (images, vidéos, sons, PDF).
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import footnote from "markdown-it-footnote";
import mark from "markdown-it-mark";
import DOMPurify from "dompurify";

const md = new MarkdownIt({ html: true, linkify: true, typographer: true, breaks: false }).use(taskLists).use(footnote).use(mark);

// Encadrés façon Obsidian : « > [!tip] Titre » devient un bloc coloré. On transforme le HTML des
// citations en suivant la profondeur des <blockquote> pour fermer le bon élément.
const CALLOUT_ICONS = { note: "✎", info: "ℹ", tip: "✦", success: "✓", check: "✓", done: "✓", question: "?", faq: "?", help: "?", warning: "⚠", caution: "⚠", attention: "⚠", danger: "⨯", error: "⨯", bug: "⨯", failure: "⨯", example: "◆", abstract: "≡", summary: "≡", quote: "❝", cite: "❝", todo: "☐" };
function callouts(html) {
  const stack = [];
  return html.replace(/<blockquote>\s*<p>\[!([a-z-]+)\]([+-]?)\s*([^\n<]*)(\n|<\/p>)|<blockquote>|<\/blockquote>/gi, (m, type, _fold, title, end) => {
    if (m.toLowerCase() === "</blockquote>") return stack.pop() ? "</div>" : m;
    if (!type) { stack.push(false); return m; }
    stack.push(true);
    const t = type.toLowerCase();
    const label = title.trim() || t.charAt(0).toUpperCase() + t.slice(1);
    return `<div class="callout" data-type="${t}"><div class="callout-title" data-icon="${CALLOUT_ICONS[t] || "✎"}">${label}</div>${end === "\n" ? "<p>" : ""}`;
  });
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const mediaUrl = (rel) => "brain://v/" + rel.split("/").map(encodeURIComponent).join("/");

const KIND = (rel) => {
  const e = (rel.match(/\.[^.]+$/) || [""])[0].toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".svg"].includes(e)) return "image";
  if ([".mp4", ".mov", ".webm", ".mkv", ".m4v", ".ogv"].includes(e)) return "video";
  if ([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".opus"].includes(e)) return "audio";
  if (e === ".pdf") return "pdf";
  if (e === ".md" || !e) return "note";
  return "file";
};
export { KIND as kindOfRel };

export function embedHtml(rel, alt = "") {
  const k = KIND(rel), u = mediaUrl(rel);
  // ![[image.png|120]] = miniature de 120 px de large (syntaxe Obsidian).
  const w = /^\d{2,4}$/.test(String(alt).trim()) ? +alt : 0;
  if (k === "image") return w ? `<img class="thumb" src="${u}" width="${w}" alt="${esc(rel.split("/").pop())}" loading="lazy" data-link="${esc(rel)}">` : `<img src="${u}" alt="${esc(alt || rel)}" loading="lazy">`;
  if (k === "video") return w ? `<video class="thumb" src="${u}" width="${w}" preload="none" controls></video>` : `<video src="${u}" controls preload="metadata"></video>`;
  if (k === "audio") return `<audio src="${u}" controls preload="metadata"></audio>`;
  if (k === "pdf") return `<iframe class="pdf" src="${u}"></iframe>`;
  return `<a class="wl" data-link="${esc(rel)}">${esc(alt || rel)}</a>`;
}

export function splitFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? { fm: m[1], body: src.slice(m[0].length) } : { fm: "", body: src };
}

const CODE = /```[\s\S]*?```|`[^`\n]+`/g;
const MARK = "⁣CODE"; // séparateur invisible pour mettre le code de côté

// resolve(name) → chemin relatif dans le coffre, ou null si la note n'existe pas.
export function render(src, resolve) {
  const { body } = splitFrontmatter(src);
  // On met de côté le code (blocs et `en ligne`) pour ne pas y transformer les [[liens]].
  const kept = [];
  const guarded = body.replace(CODE, (m) => `${MARK}${kept.push(m) - 1}${MARK}`);
  const pre = guarded
    .replace(/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, name, alt) => {
      const rel = resolve(name.trim());
      return rel ? embedHtml(rel, alt) : `<a class="wl missing" data-link="${esc(name)}">${esc(name)}</a>`;
    })
    .replace(/\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, name, _h, alias) => {
      const rel = resolve(name.trim());
      return `<a class="wl${rel ? "" : " missing"}" data-link="${esc(name.trim())}">${esc(alias || name.trim())}</a>`;
    });
  const restored = pre.replace(new RegExp(`${MARK}(\\d+)${MARK}`, "g"), (_, i) => kept[+i]);
  return DOMPurify.sanitize(callouts(md.render(restored)), {
    ADD_TAGS: ["iframe", "video", "audio"], ADD_ATTR: ["controls", "preload", "data-link", "loading", "data-type", "data-icon"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|brain):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
