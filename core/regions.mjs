// Régions du cerveau : de grandes zones (Noyau, E-com, Finance, Savoir…) placées à un endroit précis
// du cerveau 3D. Chaque région regroupe des dossiers. La configuration vit dans le coffre :
// la note « 99-Systeme/Regions du cerveau.md » (frontmatter `regions:`), donc extensible sans code.
export const POSITIONS = {
  centre: [0, 0, 0], haut: [0, 1, 0], "haut-avant": [0, 0.75, 0.66], "haut-arriere": [0, 0.75, -0.66],
  avant: [0, 0, 1], arriere: [0, 0, -1], gauche: [-1, 0.1, 0], droite: [1, 0.1, 0],
  "avant-gauche": [-0.7, 0.1, 0.7], "avant-droite": [0.7, 0.1, 0.7], "arriere-gauche": [-0.7, 0.1, -0.7], "arriere-droite": [0.7, 0.1, -0.7],
  "haut-gauche": [-0.66, 0.75, 0], "haut-droite": [0.66, 0.75, 0], bas: [0, -0.8, 0],
};

import { REGIONS_FIXES, DOMAINES_DEFAUT, dossierDomaine, P } from "./structure.mjs";
// Régions par défaut (si la note des régions n'existe pas) : régions fixes + domaines par défaut.
export const DEFAULT_REGIONS = [...REGIONS_FIXES, ...DOMAINES_DEFAUT.map((d) => ({ nom: d.nom, position: d.position, couleur: d.couleur, dossiers: [dossierDomaine(d)], description: d.description }))];

export async function loadRegions(vault) {
  const n = vault.notes.get("99-Systeme/Regions du cerveau.md");
  const list = Array.isArray(n?.fm?.regions) && n.fm.regions.length ? n.fm.regions : DEFAULT_REGIONS;
  return list.map((r) => ({ ...r, dossiers: [].concat(r.dossiers || []), dir: POSITIONS[r.position] || POSITIONS.centre }));
}

// 95-Flux/<Région>/… appartient à <Région> ; sinon on cherche le dossier de premier niveau.
export function regionOf(rel, regions) {
  const parts = rel.split("/");
  if (parts[0] === P.flux && parts.length > 2) return parts[1];
  const top = parts.length > 1 ? parts[0] : "racine";
  return regions.find((r) => r.dossiers.includes(top))?.nom || "Autres";
}
