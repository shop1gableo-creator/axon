# Développer Axon : recettes pas à pas

Prérequis : Node.js ≥ 20, Git, Windows / macOS / Linux. `npm install` puis `npm run build`.

## Construire l'installateur Windows
`npm run dist` → `dist-installer/Axon-Setup-<version>.exe` (electron-builder, NSIS : assistant, choix du dossier, raccourcis, désinstallation propre qui débranche Claude via `Axon.exe --debrancher`). Seules les dépendances utilisées côté Node sont dans `dependencies` (l'interface est empaquetée par esbuild : ses librairies sont en `devDependencies`). Publier : `gh release create vX.Y.Z dist-installer/Axon-Setup-X.Y.Z.exe`. Le script sans installateur (`setup/sans-installateur/`) reste pour les développeurs.

## Boucle de travail
1. Créer un cerveau jetable : `node cli/brain.mjs init "%TEMP%/axon-test"`.
2. Pointer dessus : `BRAIN_VAULT=<dossier>` (CLI, MCP, app). L'app ne mémorise pas un cerveau imposé par `BRAIN_VAULT`.
3. Modifier, puis : `node --check <fichier>` ; `npm run build` (interface) ; `npm start`.
4. Captures automatiques de l'app : variable `BRAIN_STEPS='[{"js":"…","wait":2000,"out":"capture.png"}]'` (voir `main.mjs`).
5. Après un changement du serveur MCP : `node tools/doc-outils.mjs` (doc des outils) et `npm run connector` (Axon.mcpb).

## Ajouter un outil MCP
Dans `mcp/server.mjs` :
```js
server.registerTool("brain_mon_outil", {
  description: "Ce qu'il fait, QUAND l'utiliser, ce qu'il renvoie. Écrite pour une IA : précise et courte.",
  inputSchema: { note: z.string().describe("Nom ou chemin de la note"), max: z.number().optional() },
}, async ({ note, max = 10 }) => {
  await refresh();                       // relire le cerveau si besoin
  const rel = find(note);                // nom → chemin
  if (!rel) return text(`Note introuvable « ${note} ». Essaie brain_chercher.`); // erreur qui dit quoi faire
  return text("résultat compact");       // jamais de pavé : l'IA paie chaque mot
});
```
Règles : un outil = un geste utile complet (pas une API brute) ; réponses courtes ; erreurs actionnables ; jamais de suppression ; garder < ~30 outils (regrouper plutôt qu'ajouter).

## Tester sans Claude
`BRAIN_VAULT=<cerveau> node tools/mcp-call.mjs @appels.json` (appels = `[["brain_office",{"fichier":"Budget.xlsx","action":"lire"}]]`) · `npm run test:office` (Excel + Word de bout en bout).

## Ajouter un skill
`skills/axon-<nom>/SKILL.md` avec frontmatter `name` (= nom du dossier) et `description` (ce qu'il fait **et quand** l'utiliser : c'est ce texte qui déclenche le skill). Corps court (< 100 lignes) ; détails dans des fichiers à côté, lus seulement si besoin. Il apparaît tout seul : prompt MCP, outil `brain_skill`, copié dans les nouveaux cerveaux.

## Ajouter un connecteur de données (flux)
`core/connectors.mjs` : un objet dans `CONNECTORS` (`id`, `nom`, `region`, `everyMin`, `fetch()` → lignes) ; il écrit `95-Flux/<Région>/<Nom>.md` (état + historique daté). API publiques sans clé uniquement (catalogue : page « API » de l'app).

## Ajouter un widget à l'accueil
`renderer/src/home.js` : une entrée dans `WIDGETS` (`titre`, `tailles`, `render(data)`) et dans `DEFAULT_LAYOUT`. Données en direct : `core/live.mjs` (`snapshot()` + `live:tick`), mises à jour sans tout redessiner (`patchLive`).

## Toucher au cerveau 3D
`renderer/src/brain3d.js`. À respecter : réutiliser les objets nœuds/liens dans `setData` (sinon tout saute) ; ne pas réchauffer la simulation au clic ; positions figées (`fx/fy/fz`) après placement ; nouvelle forme = une entrée dans `SHAPES` + une fonction cible.

## Pièges connus
- `String.replace(x, chaîne)` : `$$` devient `$` dans la chaîne de remplacement → passer une fonction.
- Fichiers en CRLF : normaliser avant de chercher/remplacer dans un script.
- Tesseract ne tourne pas dans Electron → `core/ocr-cli.mjs` en processus Node.
- Claude Desktop (version Store) lit sa config dans `%LOCALAPPDATA%\Claude-Data\…\claude_desktop_config.json` ; il faut le quitter complètement pour recharger.
- Les noms de fichiers Windows n'acceptent pas `: * ? " < > |` → `safeName`.
