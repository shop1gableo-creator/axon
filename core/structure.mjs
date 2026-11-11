// =====================================================================================
// LA STRUCTURE d'un cerveau Axon — source unique de vérité (le code, les skills et les docs en dépendent).
//
//  00-Inbox/                 tout ce qui arrive en vrac (trié ensuite) · _archive/ = « corbeille » récupérable
//  01-Journal/AAAA/          une note par jour ET par personne : « 2026-11-11 Alex.md » (pas de conflit à deux)
//  05-Noyau/                 qui je suis / qui nous sommes : objectifs, valeurs, mémoire des IA, registres
//  10-… 60-                  les DOMAINES de vie (École, Business, Finance, Trading…) — tous bâtis sur le même moule
//  70-Savoir/                concepts transverses, utiles à plusieurs domaines (une idée = une note)
//  75-Personnes/             une note par personne (qui, contexte, liens)
//  80-Sources/               vidéos, articles, livres, cours : le brut extérieur, avec le lien d'origine
//  90-Fichiers/              fichiers importés sans place précise (rangés par mois) — sinon ils vivent DANS leur neurone
//  95-Flux/                  données mises à jour automatiquement par du code
//  99-Systeme/               règles, index, log (par personne et par mois), régions, modèles, membres
//
// Le MOULE d'un domaine (fractal : même forme partout → l'IA sait toujours où ranger) :
//  20-Business/
//    Business.md             le HUB du domaine (carte : objectifs, projets en cours, savoir clé, décisions)
//    Projets/<Projet>/       un dossier = un neurone : <Projet>.md + ses fichiers (Excel, Word, PDF…) à côté
//    Savoir/                 ce qu'on apprend dans ce domaine (notes atomiques)
//    Decisions/              une note par décision (contexte, choix, pourquoi, date)
//    Ressources/             documents de référence, modèles, fichiers utiles en continu
//    Archives/               projets finis, vieilles notes (rien n'est supprimé)
// =====================================================================================

export const P = {
  inbox: "00-Inbox",
  archive: "00-Inbox/_archive",
  journal: "01-Journal",
  noyau: "05-Noyau",
  memoire: "05-Noyau/Ce que les IA savent de nous.md",
  registres: "05-Noyau/Registres",
  savoir: "70-Savoir",
  personnes: "75-Personnes",
  sources: "80-Sources",
  fichiers: "90-Fichiers",
  flux: "95-Flux",
  systeme: "99-Systeme",
  logDir: "99-Systeme/Log",
  regions: "99-Systeme/Regions du cerveau.md",
  carte: "99-Systeme/carte-auto.md",
  sante: "99-Systeme/Sante du cerveau.md",
  membres: "99-Systeme/Membres.md",
  ame: "99-Systeme/Ame du cerveau.md",
  templates: "99-Systeme/Templates",
  banques: "Banques", // sous-dossier possible d'un domaine : 20-Business/Banques/<Banque>/
};

/** Les sous-dossiers du moule d'un domaine. */
export const MOULE = ["Projets", "Savoir", "Decisions", "Ressources", "Archives"];

/** Domaines par défaut d'un cerveau « de vie ». Chacun : nom, numéro (dossier), position 3D, couleur, description. */
export const DOMAINES_DEFAUT = [
  { nom: "Ecole", num: 10, position: "haut-gauche", couleur: "#7cc4ff", description: "Cours, examens, travaux, ce que j'apprends à l'école." },
  { nom: "Business", num: 20, position: "haut-avant", couleur: "#ff7a45", description: "Entreprises, clients, produits, marketing, ventes." },
  { nom: "Finance", num: 30, position: "haut-arriere", couleur: "#4ade9b", description: "Budget, épargne, impôts, investissements long terme." },
  { nom: "Trading", num: 40, position: "haut-droite", couleur: "#f5c542", description: "Stratégies, journal de trades, backtests, marchés." },
];

/** Positions libres pour les domaines suivants (ajoutés par l'IA ou l'humain). */
export const POSITIONS_LIBRES = ["avant-gauche", "avant-droite", "droite", "gauche", "arriere-gauche", "avant", "bas"];
export const COULEURS_LIBRES = ["#c08bff", "#f472b6", "#34d399", "#fb923c", "#60a5fa", "#e879f9", "#a3e635"];

/** Nom de dossier d'un domaine : « 20-Business ». */
export const dossierDomaine = (d) => `${String(d.num).padStart(2, "0")}-${d.nom}`;

/** Les régions fixes (hors domaines) du cerveau 3D. */
export const REGIONS_FIXES = [
  { nom: "Noyau", position: "centre", couleur: "#ffd166", dossiers: ["05-Noyau", "01-Journal"], description: "Qui je suis, mes objectifs, la mémoire des IA, le journal." },
  { nom: "Savoir", position: "gauche", couleur: "#9fb4ff", dossiers: ["70-Savoir", "75-Personnes", "80-Sources"], description: "Concepts transverses, personnes, sources." },
  { nom: "Arrivées", position: "avant", couleur: "#cbd5e1", dossiers: ["00-Inbox", "90-Fichiers"], description: "Ce qui arrive en vrac, avant d'être rangé." },
  { nom: "Système", position: "arriere-droite", couleur: "#9096a8", dossiers: ["99-Systeme", "95-Flux", "racine"], description: "Règles, index, log, flux automatiques." },
];

/** Chemin du journal du jour d'une personne. */
export const journalDuJour = (qui, d = new Date()) => {
  const day = d.toISOString().slice(0, 10);
  return `${P.journal}/${day.slice(0, 4)}/${day}${qui ? " " + qui : ""}.md`;
};
/** Fichier de log du mois d'une personne (un fichier par personne → pas de conflit dans un Drive partagé). */
export const logDuMois = (qui, d = new Date()) => `${P.logDir}/${d.toISOString().slice(0, 7)}${qui ? " " + qui : ""}.md`;
