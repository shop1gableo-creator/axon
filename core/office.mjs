// Fichiers OFFICE dans le cerveau : lire et modifier SUR PLACE un Excel, un Word ou un PowerPoint,
// sans casser la mise en forme (on ne touche qu'aux valeurs / au texte visé).
//  - Excel (.xlsx) : ExcelJS (garde styles, formules, largeurs) — lire une plage, écrire des cellules, ajouter des lignes, créer une feuille.
//  - Word (.docx) et PowerPoint (.pptx) : on ouvre le paquet (zip) et on modifie le XML du texte. Un remplacement
//    peut traverser plusieurs « runs » (morceaux de mise en forme) d'un même paragraphe : il est appliqué dans le
//    premier run concerné, les suivants sont raccourcis → la mise en forme du début du passage est conservée.
// L'appelant (serveur MCP) garde une copie de l'ancienne version AVANT toute écriture.
import fs from "node:fs/promises";
import ExcelJS from "exceljs";
import JSZip from "jszip";

// ------------------------------------------------------------------ Excel
const cellText = (v) => {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.formula || v.sharedFormula) return `=${v.formula || v.sharedFormula}${v.result !== undefined ? ` → ${cellText(v.result)}` : ""}`;
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if (v.text) return String(v.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.error) return String(v.error);
  }
  return String(v);
};

export async function excelLire(file, { feuille, plage, max = 60 } = {}) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
  const names = wb.worksheets.map((w) => `${w.name} (${w.rowCount} lignes × ${w.columnCount} colonnes)`);
  const ws = feuille ? wb.getWorksheet(feuille) : wb.worksheets[0];
  if (!ws) return `Feuilles : ${names.join(" · ")}\nFeuille « ${feuille} » introuvable.`;
  let r1 = 1, r2 = Math.min(ws.rowCount, max), c1 = 1, c2 = Math.min(ws.columnCount, 26);
  if (plage) {
    const m = plage.toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (m) { c1 = ws.getColumn(m[1]).number; r1 = +m[2]; c2 = ws.getColumn(m[3]).number; r2 = +m[4]; }
  }
  const col = (n) => ws.getColumn(n).letter;
  const lines = [`| | ${Array.from({ length: c2 - c1 + 1 }, (_, i) => col(c1 + i)).join(" | ")} |`, `|---|${"---|".repeat(c2 - c1 + 1)}`];
  for (let r = r1; r <= r2; r++) {
    const row = ws.getRow(r);
    lines.push(`| ${r} | ${Array.from({ length: c2 - c1 + 1 }, (_, i) => cellText(row.getCell(c1 + i).value).replace(/\|/g, "/").replace(/\n/g, " ")).join(" | ")} |`);
  }
  const more = ws.rowCount > r2 ? `\n… ${ws.rowCount - r2} ligne(s) de plus (demande une plage, ex. A${r2 + 1}:H${Math.min(ws.rowCount, r2 + 60)}).` : "";
  return `Feuilles : ${names.join(" · ")}\n\n## ${ws.name}\n${lines.join("\n")}${more}`;
}

/** cellules : { "B3": 120, "C3": "=B3*2", "A10": "Total" } · lignes : [[...], [...]] ajoutées à la fin · nouvelle_feuille : nom */
export async function excelEcrire(file, { feuille, cellules = {}, lignes = [], nouvelle_feuille } = {}) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
  let ws = nouvelle_feuille ? (wb.getWorksheet(nouvelle_feuille) || wb.addWorksheet(nouvelle_feuille)) : feuille ? wb.getWorksheet(feuille) : wb.worksheets[0];
  if (!ws) throw new Error(`Feuille « ${feuille} » introuvable. Feuilles : ${wb.worksheets.map((w) => w.name).join(", ")}`);
  let n = 0;
  const conv = (v) => (typeof v === "string" && v.startsWith("=") ? { formula: v.slice(1) } : typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v) ? new Date(v) : v);
  for (const [addr, v] of Object.entries(cellules)) { ws.getCell(addr).value = conv(v); n++; }
  for (const row of lignes) { ws.addRow(row.map(conv)); n += row.length; }
  await wb.xlsx.writeFile(file);
  return `${n} cellule(s) écrite(s) dans « ${ws.name} ». Les formules sont recalculées à l'ouverture dans Excel.`;
}

// ------------------------------------------------------------------ Word / PowerPoint
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unesc = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function partsOf(zip, kind) {
  const all = Object.keys(zip.files);
  if (kind === "docx") return all.filter((f) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(f));
  return all.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => +a.match(/(\d+)\.xml/)[1] - +b.match(/(\d+)\.xml/)[1]);
}
const P_RE = { docx: /<w:p[ >][\s\S]*?<\/w:p>/g, pptx: /<a:p>[\s\S]*?<\/a:p>/g };
const T_RE = { docx: /(<w:t(?: [^>]*)?>)([\s\S]*?)(<\/w:t>)/g, pptx: /(<a:t>)([\s\S]*?)(<\/a:t>)/g };

function paraText(p, kind) { return [...p.matchAll(T_RE[kind])].map((m) => unesc(m[2])).join(""); }

/** Remplace `chercher` par `remplacer` dans un paragraphe XML, même à cheval sur plusieurs runs. */
function replaceInPara(p, kind, chercher, remplacer) {
  const runs = [...p.matchAll(T_RE[kind])];
  if (!runs.length) return { p, n: 0 };
  let texts = runs.map((m) => unesc(m[2]));
  let n = 0, guard = 0;
  while (guard++ < 200) {
    const full = texts.join("");
    const at = full.indexOf(chercher);
    if (at < 0) break;
    // trouver le run de début et de fin
    let pos = 0, i0 = -1, off0 = 0, i1 = -1, off1 = 0;
    for (let i = 0; i < texts.length; i++) {
      const len = texts[i].length;
      if (i0 < 0 && at < pos + len) { i0 = i; off0 = at - pos; }
      if (i0 >= 0 && at + chercher.length <= pos + len) { i1 = i; off1 = at + chercher.length - pos; break; }
      pos += len;
    }
    if (i0 < 0 || i1 < 0) break;
    if (i0 === i1) texts[i0] = texts[i0].slice(0, off0) + remplacer + texts[i0].slice(off1);
    else {
      texts[i0] = texts[i0].slice(0, off0) + remplacer;
      for (let i = i0 + 1; i < i1; i++) texts[i] = "";
      texts[i1] = texts[i1].slice(off1);
    }
    n++;
    if (remplacer.includes(chercher)) break; // évite une boucle infinie
  }
  if (!n) return { p, n: 0 };
  let k = 0;
  const out = p.replace(T_RE[kind], (_m, a, _t, c) => {
    const t = texts[k++];
    const open = kind === "docx" && /^\s|\s$/.test(t) && !a.includes("xml:space") ? a.replace("<w:t", '<w:t xml:space="preserve"') : a;
    return open + esc(t) + c;
  });
  return { p: out, n };
}

export async function docLire(file, kind) {
  const zip = await JSZip.loadAsync(await fs.readFile(file));
  const out = [];
  for (const part of partsOf(zip, kind)) {
    const xml = await zip.file(part).async("string");
    const paras = (xml.match(P_RE[kind]) || []).map((p) => paraText(p, kind)).filter((t) => t.trim());
    if (!paras.length) continue;
    out.push(kind === "pptx" ? `## Diapo ${part.match(/(\d+)\.xml/)[1]}\n${paras.map((t) => `- ${t}`).join("\n")}` : `## ${part.replace(/^word\/|\.xml$/g, "")}\n${paras.join("\n\n")}`);
  }
  return out.join("\n\n") || "(aucun texte)";
}

/** remplacements : [{ chercher, remplacer }] · ajouter : paragraphes ajoutés à la fin (Word) ou à la diapo `diapo` (PowerPoint, dans la dernière zone de texte). */
export async function docModifier(file, kind, { remplacements = [], ajouter = [], diapo } = {}) {
  const zip = await JSZip.loadAsync(await fs.readFile(file));
  const report = [];
  for (const { chercher, remplacer } of remplacements) {
    let total = 0;
    for (const part of partsOf(zip, kind)) {
      let xml = await zip.file(part).async("string");
      let changed = false;
      xml = xml.replace(P_RE[kind], (p) => { const r = replaceInPara(p, kind, chercher, remplacer); if (r.n) { total += r.n; changed = true; } return r.p; });
      if (changed) zip.file(part, xml);
    }
    report.push(total ? `« ${chercher.slice(0, 40)} » → ${total} remplacement(s)` : `« ${chercher.slice(0, 40)} » introuvable (vérifie le texte exact avec l'action lire)`);
  }
  if (ajouter.length && kind === "docx") {
    let xml = await zip.file("word/document.xml").async("string");
    const paras = ajouter.map((t) => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`).join("");
    xml = xml.includes("<w:sectPr") ? xml.replace(/(<w:sectPr[\s\S]*?<\/w:sectPr>\s*<\/w:body>)/, paras + "$1") : xml.replace("</w:body>", paras + "</w:body>");
    zip.file("word/document.xml", xml);
    report.push(`${ajouter.length} paragraphe(s) ajouté(s) à la fin`);
  }
  if (ajouter.length && kind === "pptx") {
    const parts = partsOf(zip, "pptx");
    const part = diapo ? `ppt/slides/slide${diapo}.xml` : parts[parts.length - 1];
    if (!zip.file(part)) throw new Error(`Diapo ${diapo} introuvable (${parts.length} diapos).`);
    let xml = await zip.file(part).async("string");
    const bodies = [...xml.matchAll(/<p:txBody>[\s\S]*?<\/p:txBody>/g)];
    if (!bodies.length) throw new Error("Cette diapo n'a pas de zone de texte où ajouter.");
    const last = bodies[bodies.length - 1];
    const paras = ajouter.map((t) => `<a:p><a:r><a:t>${esc(t)}</a:t></a:r></a:p>`).join("");
    xml = xml.slice(0, last.index) + last[0].replace("</p:txBody>", paras + "</p:txBody>") + xml.slice(last.index + last[0].length);
    zip.file(part, xml);
    report.push(`${ajouter.length} ligne(s) ajoutée(s) dans la diapo ${part.match(/(\d+)\.xml/)[1]}`);
  }
  await fs.writeFile(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return report.join("\n");
}

export const officeKind = (f) => (/\.xlsx$/i.test(f) ? "xlsx" : /\.docx$/i.test(f) ? "docx" : /\.pptx$/i.test(f) ? "pptx" : null);
