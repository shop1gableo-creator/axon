// OCR en processus Node pur (Tesseract se bloque s'il tourne dans Electron, qu'il prend pour un navigateur).
// Usage : node ocr-cli.mjs <image> <dossier-cache>  → écrit le texte reconnu sur la sortie standard.
import { ocr } from "./enrich.mjs";

const [file, cacheDir] = process.argv.slice(2);
try {
  process.stdout.write(await ocr(file, cacheDir));
  process.exit(0);
} catch (e) {
  process.stderr.write(String(e?.message || e));
  process.exit(1);
}
