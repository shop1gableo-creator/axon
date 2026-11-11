// Test de bout en bout des fichiers Office via le vrai serveur MCP (npm run test:office) :
// crée un cerveau jetable, un Excel stylé avec formule et un Word avec un mot en gras à cheval sur deux « runs »,
// les modifie avec brain_office, puis vérifie que les valeurs ont changé ET que la mise en forme est intacte.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { createEmptyBrain } from "../core/scaffold.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axon-test-"));
await createEmptyBrain(tmp, { utilisateur: "Test" });
const dir = path.join(tmp, "30-Finance/Projets/Budget");
fs.mkdirSync(dir, { recursive: true });

// Excel de départ
const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Budget");
ws.addRow(["Poste", "Montant"]); ws.getRow(1).font = { bold: true }; ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
ws.addRow(["Loyer", 900]); ws.addRow(["Courses", 320]); ws.getCell("B4").value = { formula: "SUM(B2:B3)" }; ws.getColumn(1).width = 24;
await wb.xlsx.writeFile(path.join(dir, "Budget.xlsx"));
// Word de départ : « micro » en gras au milieu d'une phrase (3 runs)
const zip = new JSZip();
zip.file("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file("word/document.xml", '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">Examen de </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>micro</w:t></w:r><w:r><w:t>économie le 12 mars.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>');
fs.writeFileSync(path.join(dir, "Plan.docx"), await zip.generateAsync({ type: "nodebuffer" }));

// Appels MCP
const p = spawn(process.execPath, [path.join(app, "mcp/server.mjs")], { env: { ...process.env, BRAIN_VAULT: tmp, AXON_USER: "Test" }, stdio: ["pipe", "pipe", "inherit"] });
let buf = ""; const pending = new Map(); let id = 0;
p.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(l); pending.get(m.id)?.(m); } catch { /* */ } } });
const rpc = (method, params) => new Promise((res) => { const k = ++id; pending.set(k, res); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: k, method, params }) + "\n"); });
const call = async (name, args) => (await rpc("tools/call", { name, arguments: args })).result.content[0].text;
await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
await call("brain_office", { fichier: "Budget.xlsx", action: "ecrire", cellules: { B3: 350 }, lignes: [["Abonnements", 45]] });
await call("brain_office", { fichier: "Plan.docx", action: "modifier", remplacements: [{ chercher: "microéconomie le 12 mars", remplacer: "macroéconomie le 19 mars" }] });
const versions = await call("brain_versions", { fichier: "30-Finance/Projets/Budget/Budget.xlsx" });
p.kill();

// Vérifications
const ok = []; const ko = [];
const check = (cond, label) => (cond ? ok : ko).push(label);
const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.readFile(path.join(dir, "Budget.xlsx")); const w2 = wb2.getWorksheet("Budget");
check(w2.getCell("B3").value === 350, "Excel : valeur modifiée");
check(w2.getCell("A5").value === "Abonnements", "Excel : ligne ajoutée");
check(w2.getCell("B4").value?.formula === "SUM(B2:B3)", "Excel : formule gardée");
check(w2.getCell("A1").font?.bold === true && w2.getCell("A1").fill?.fgColor?.argb === "FF1F2937", "Excel : style gardé");
check(w2.getColumn(1).width === 24, "Excel : largeur gardée");
const xml = await (await JSZip.loadAsync(fs.readFileSync(path.join(dir, "Plan.docx")))).file("word/document.xml").async("string");
check(xml.includes("macroéconomie le 19 mars"), "Word : texte remplacé (à cheval sur 2 runs)");
check(/<w:b\/><\/w:rPr><w:t[^>]*>macroéconomie/.test(xml), "Word : gras gardé");
check(/\d{4}-\d\d-\d\dT/.test(versions), "Versions : ancienne version gardée");
fs.rmSync(tmp, { recursive: true, force: true });
for (const x of ok) console.log("OK   " + x);
for (const x of ko) console.log("ÉCHEC " + x);
process.exit(ko.length ? 1 : 0);
