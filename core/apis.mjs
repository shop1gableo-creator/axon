// Catalogue des API publiques : lit le README du dépôt public-apis (≈ 1 400 API gratuites)
// et le transforme en liste structurée (catégorie, nom, description, clé requise, HTTPS, CORS).
import fs from "node:fs/promises";

export async function parsePublicApis(readmePath) {
  const md = await fs.readFile(readmePath, "utf8").catch(() => "");
  const apis = [];
  let category = null;
  for (const line of md.split("\n")) {
    const h = line.match(/^###\s+(.+?)\s*$/);
    if (h) { category = h[1].trim(); continue; }
    const row = line.match(/^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|/);
    if (!row || !category) continue;
    const auth = row[4].replace(/`/g, "").trim();
    apis.push({ category, name: row[1], url: row[2], description: row[3], auth: /^no$/i.test(auth) ? "" : auth, https: /yes/i.test(row[5]), cors: row[6].toLowerCase() });
  }
  return apis;
}
