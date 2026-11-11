// Conversion des documents (PDF, Word, PowerPoint, Excel) en Markdown lisible par une IA.
// Même idée que MarkItDown (Microsoft) : le fichier d'origine reste dans son dossier, et sa fiche
// reçoit le texte extrait, donc il devient cherchable (mots + sens) et lisible par n'importe quel agent.
import fs from "node:fs/promises";
import path from "node:path";

export const DOC_EXT = [".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".odt"];
const MAX_CHARS = 60000; // au-delà, on tronque (la fiche reste légère, le fichier complet est à côté)

export async function extractDoc(file) {
  const ext = path.extname(file).toLowerCase();
  let md = "";
  if (ext === ".pdf") md = await pdf(file);
  else if (ext === ".docx" || ext === ".odt") md = await docx(file);
  else if (ext === ".pptx") md = await pptx(file);
  else if (ext === ".xlsx" || ext === ".xls") md = await sheet(file);
  else return null;
  md = md.replace(/\n{3,}/g, "\n\n").trim();
  if (!md) return null;
  const truncated = md.length > MAX_CHARS;
  return { markdown: truncated ? md.slice(0, MAX_CHARS) + "\n\n*(texte tronqué : voir le fichier d'origine)*" : md, chars: md.length, truncated };
}

async function pdf(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await fs.readFile(file));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 200); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let line = "", out = [], lastY = null;
    for (const it of tc.items) {
      const y = it.transform?.[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) { out.push(line); line = ""; }
      line += it.str; if (it.hasEOL) { out.push(line); line = ""; }
      lastY = y;
    }
    out.push(line);
    const text = out.map((l) => l.trimEnd()).join("\n").trim();
    if (text) pages.push(`### Page ${i}\n\n${text}`);
  }
  await doc.cleanup?.();
  return pages.join("\n\n");
}

async function docx(file) {
  const mammoth = (await import("mammoth")).default;
  // convertToMarkdown garde titres, listes, gras : idéal pour une IA.
  const r = await mammoth.convertToMarkdown({ path: file });
  return r.value
    .replace(/<a id="[^"]*"><\/a>/g, "")
    .replace(/__([^_\n]+?)__/g, "**$1**")
    .replace(/\\([.\-()!#])/g, "$1");
}

async function pptx(file) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await fs.readFile(file));
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  const out = [];
  for (const [i, name] of slides.entries()) {
    const xml = await zip.file(name).async("string");
    const paras = xml.split(/<\/a:p>/).map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decode(m[1])).join("")).filter((s) => s.trim());
    const notesName = `ppt/notesSlides/notesSlide${name.match(/\d+/)[0]}.xml`;
    let notes = "";
    if (zip.file(notesName)) notes = [...(await zip.file(notesName).async("string")).matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decode(m[1])).join(" ").trim();
    if (!paras.length && !notes) continue;
    out.push(`### Diapo ${i + 1}${paras[0] ? " : " + paras[0] : ""}\n\n` + paras.slice(1).map((p) => `- ${p}`).join("\n") + (notes ? `\n\n> Notes : ${notes}` : ""));
  }
  return out.join("\n\n");
}

async function sheet(file) {
  const XLSX = (await import("xlsx")).default;
  const wb = XLSX.read(await fs.readFile(file), { type: "buffer" });
  const out = [];
  for (const name of wb.SheetNames.slice(0, 20)) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: "" }).slice(0, 300);
    if (!rows.length) continue;
    const width = Math.min(Math.max(...rows.map((r) => r.length)), 20);
    const cell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    const row = (r) => "| " + Array.from({ length: width }, (_, i) => cell(r[i])).join(" | ") + " |";
    out.push(`### Feuille « ${name} »\n\n` + [row(rows[0]), "|" + " --- |".repeat(width), ...rows.slice(1).map(row)].join("\n"));
  }
  return out.join("\n\n");
}

function decode(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export function docSection(r) {
  if (!r) return "";
  return `\n## Texte extrait\n\n*Converti automatiquement en Markdown (${r.chars.toLocaleString("fr-FR")} caractères${r.truncated ? ", tronqué" : ""}).*\n\n${r.markdown}\n`;
}
