export const DAY = 86400000;
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const fmtDate = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

export const PHASE_META = {
  1: { label: "Phase 1 · Première couche", note: "Un bloc à la fois, bio → clinique → QCM." },
  2: { label: "Phase 2 · Consolidation", note: "Résumés, annales par thème, zones faibles." },
  3: { label: "Phase 3 · Simulations", note: "Épreuves chronométrées + biologie de rappel." },
};

// Phase 1 ~62% (first pass), Phase 2 ~24% (consolidation), Phase 3 ~14% (simulations)
export function buildPlan(startISO, examISO, blocks) {
  const start = startOfDay(startISO), exam = startOfDay(examISO);
  const total = Math.max(daysBetween(start, exam), 7);
  const p1End = Math.round(total * 0.62), p2End = Math.round(total * 0.86);
  const ordered = [...blocks].sort((a, b) => a.tier - b.tier);
  const perBlock = Math.max(3, Math.floor(p1End / ordered.length));
  const days = [];
  for (let d = 0; d < total; d++) {
    const date = new Date(+start + d * DAY);
    let phase, block = null, tasks = [];
    if (d < p1End) {
      phase = 1;
      const idx = Math.min(ordered.length - 1, Math.floor(d / perBlock));
      block = ordered[idx];
      const dayInBlock = d - idx * perBlock;
      if (dayInBlock === 0) tasks = [`Sciences fondamentales — ${block.fond.slice(0, 2).join(", ") || "révision"}`, `Poser le squelette du bloc ${block.name} (max 2 sources)`];
      else if (dayInBlock < perBlock - 1) tasks = [`Clinique — ${block.clin[(dayInBlock - 1) % Math.max(1, block.clin.length)] || block.fond[0]}`, "Fiches + schémas", "Algorithme diagnostic & PEC du cours du jour"];
      else tasks = [`QCM ciblés — bloc ${block.name}`, "Corriger : raisonnement > mémoire, noter les pièges"];
    } else if (d < p2End) {
      phase = 2;
      const idx = (d - p1End) % ordered.length;
      block = ordered[idx];
      tasks = [`2e passe (résumés) — ${block.name}`, `Annales par thème — ${block.clin[0] || block.fond[0]}`, "Reprendre les zones faibles", "Peu et régulier : ¼ de programme de jour"];
    } else {
      phase = 3;
      const sims = ["Simulation Blida — 150 QCM / 4h (chrono)", "Simulation — Sciences fondamentales (chrono)", "Simulation — Dossiers & cas cliniques (chrono)"];
      tasks = [sims[(d - p2End) % 3], "Débrief : erreurs → fiches & algorithmes", "Re-passe biologie (elle s'oublie vite)"];
    }
    days.push({ d, date: +date, phase, block: block ? block.id : null, blockName: block ? block.name : "Simulations", tasks });
  }
  return { total, p1End, p2End, days };
}

export function flattenModules(blocks) {
  const out = [];
  blocks.forEach((b) => {
    b.fond.forEach((m) => out.push({ block: b.id, blockName: b.name, tier: b.tier, kind: "fond", name: m }));
    b.clin.forEach((m) => out.push({ block: b.id, blockName: b.name, tier: b.tier, kind: "clin", name: m }));
  });
  return out;
}

// Real annales included in the app (bundled PDFs served from /materials)
export const ANNALES = [
  { year: "2024", fac: "Université Blida 1 — Saad Dahleb", parts: ["150 QCM / 4h", "Sciences fondamentales (50)", "Pathologie", "Dossiers & cas cliniques"], pdf: "/materials/residanat-blida-2024.pdf", official: true },
  { year: "2023", fac: "Université Blida 1 — Saad Dahleb", parts: ["Épreuve fondamentale", "Épreuve médico-chirurgicale", "Corrigé surligné"], pdf: "/materials/residanat-blida-2023.pdf", official: true },
];

// Study-guide document (your uploaded revision guide) bundled as a PDF
export const GUIDE_PDF = "/materials/guide-revision.pdf";

export const RESOURCES = [
  { name: "E-learning Faculté de Médecine Blida 1", note: "Plateforme officielle de cours de la Faculté (Université Saad Dahlab de Blida).", url: "https://jfmb-dz.com/plateforme/course/index.php", tag: "Officiel · Blida" },
  { name: "Cours externat 2ᵉ année (Drive)", note: "Dossier Google Drive des cours d'externat 2018/2019 — 2ᵉ année (recommandé par le guide).", url: "https://drive.google.com/drive/folders/0B_dp8bdQlHsbeFZBZjJWWkN6SWs", tag: "Drive · Cours" },
  { name: "Cours externat 3ᵉ année (Drive)", note: "Dossier Google Drive des cours d'externat 2018/2019 — 3ᵉ année.", url: "https://drive.google.com/drive/folders/1Ep8Y0sPQpfrqNLHoghUQiQqqYsq6Pcy", tag: "Drive · Cours" },
  { name: "Sujets d'externat de l'année (Drive)", note: "Dossier d'une collègue : sujets d'externat — à faire à la fin de chaque module.", url: "https://drive.google.com/drive/folders/1I6u96m9I3wivyrzDn8KMv5d4ecae9Wek", tag: "Drive · Sujets" },
  { name: "ency-education — Résidanat", note: "Sujets de concours, cours, résumés & QCM classés par module.", url: "https://univ.ency-education.com/medecine-residanat.html", tag: "Annales + cours" },
  { name: "residanat-dz (officiel)", note: "Pré-inscription, convocations, dates & résultats officiels.", url: "https://residanat-dz.com/", tag: "Officiel" },
];

// Per-module source recommendations transcribed from the revision guide (cours + questions)
export const MODULE_SOURCES = {
  cardio: { cours: "ENC cardiologie (urgences+++ : SCA, péricardite, endocardite, dissection aortique, EP/TVP, ACFA) + thérapeutique + IC/HTA/valvulopathies.", questions: "Série verte + GM cardio. Ont été posés : signes cliniques IC, associations médicamenteuses dans l'HTA, stratification du risque ischémique, indications des AVK." },
  pneumo: { cours: "Cours d'externat + ENC pour bien comprendre.", questions: "Série verte + GM pneumo. Ont été posés : pneumoconioses, test à l'acétylcholine, hyperréactivité bronchique." },
  neuro: { cours: "Cours d'externat + ENC (myasthénie, sd de Guillain-Barré, maladie d'Alzheimer).", questions: "Série verte + GM neuro. A été posé : épilepsie occipitale." },
  infectieux: { cours: "Cours d'externat (maladies infectieuses).", questions: "GM maladies infectieuses. + microbiologie (série verte GM), immunologie IILA, parasitologie (série jaune + série verte)." },
  digestif: { cours: "ENC HGE. Biochimie hépatique : cours d'externat Pr Abdi.", questions: "Série verte – GM HGE. Biochimie surtout métabolique (hyperlipidémie type IV, diabète)." },
  endoc: { cours: "Cours d'externat + biochimie métabolique (Pr Abdi).", questions: "GM endocrino + GM biochimie." },
  nephro: { cours: "Cours d'externat (surtout sd néphrotique / sd néphritique / IRA et IRC). Urologie : cours d'externat.", questions: "GM urologie. Physiopathologie : troubles de l'hydratation, dyskaliémies, dysmagnésémies." },
  hemato: { cours: "Cours d'externat.", questions: "GM hémato." },
  "mere-enfant": { cours: "Pédiatrie & gynéco : cours d'externat (+ ENC gynéco). Embryologie/histologie en parallèle de l'anapath.", questions: "Série verte – GM pédiatrie ; HyperQCM + GM gynéco." },
  locomoteur: { cours: "ENC rhumato (PR, SPA, LED, tumeurs osseuses, ostéoporose, ostéomalacie). Traumato : série jaune.", questions: "Série verte + GM." },
  sensoriel: { cours: "Dermato / ophtalmo / ORL : cours d'externat.", questions: "GM dermato, GM ophtalmo, GM ORL." },
  "sante-pub": { cours: "Médecine légale (Dc de la mort, sévices à enfant, asphyxies), médecine du travail (accident de travail, mld professionnelle), épidémiologie, droit médical : cours d'externat.", questions: "GM med légale, GM med du travail, GM épidémio." },
  transversal: { cours: "Anatomie pathologique : cours d'externat (pathologies vasculaires, tumorales, métastases). Histologie-embryologie-cytologie en parallèle de l'anapath. Pharmacologie : livre OPU + externat (nouvelle classification des effets secondaires). Radiologie : cours d'externat + samedis pédagogiques.", questions: "GM anapath, PCEM + GM physio, GM biochimie, GM radio (intérêt du TDM, séquences AVC I/H, classification de Fisher, AAST des trauma de la rate)." },
};

// The 11 preparation principles from the guide, condensed
export const METHOD_PRINCIPLES = [
  "Commencer tôt aide, mais le résidanat est cumulatif : c'est la somme de tout votre cursus, pas le nombre de couches de révision.",
  "Ne jamais choisir plus de deux sources par module ou par type de questions.",
  "Ne pas se comparer aux autres : chacun a sa méthode. C'est la qualité du cours qui compte, pas le nombre de couches.",
  "Dès le premier jour, faire un programme de révision, à ajuster au fil de l'eau — viser ¼ de programme de jour. L'essentiel est la continuité : « peu et régulier ≫≫ beaucoup et occasionnel ».",
  "Se baser d'abord sur la compréhension des cours : elle conditionne le raisonnement dans les questions.",
  "« Un bon raisonnement vaut 1000 fois mieux qu'une dizaine de couches. »",
  "Avant chaque module, lister les cours à faire — priorité aux cours à maîtriser en tant que médecin généraliste et aux cours des samedis pédagogiques.",
  "Faire les questions pour deux objectifs : fixer les informations, et acquérir le réflexe. Ne pas fixer comme objectif les questions déjà vues.",
  "Devant chaque QCM, même simple, se concentrer sur chaque proposition : le raisonnement +++ prime sur la mémoire.",
  "Commencer par la biologie avant la clinique pour prendre un rythme ; pour la clinique, faire des algorithmes de diagnostic et de prise en charge après chaque cours (utile pour les dossiers et cas cliniques).",
  "Foncer jusqu'à la dernière seconde : la sensation d'être dépassé est normale en fin de préparation. Persévérance et endurance font la différence.",
];

// The 3 clinical dossiers that appeared (from the guide) — used to frame case-based practice
export const DOSSIERS = [
  "Dossier 1 : listériose chez une femme enceinte → nouveau-né prématuré → pneumonie à pneumocoque puis coqueluche.",
  "Dossier 2 : ictère néonatal par incompatibilité ABO.",
  "Dossier 3 : pancréatite aiguë lithiasique.",
];

export const BOOKS = [
  { title: "Série verte (Externat)", scope: "QCM d'externat par module.", why: "Base large pour balayer un module. Piocher par module.", best: "Balayage QCM" },
  { title: "Série jaune", scope: "QCM avec explications (microbiologie, traumatologie).", why: "Recommandée par le guide pour la microbiologie (série jaune++) et la traumatologie.", best: "Microbio · Traumato" },
  { title: "GM (Groupe Médical) par module", scope: "Banque de questions par module citée dans le guide.", why: "Référence « questions » de presque chaque module (GM cardio, pneumo, HGE, etc.).", best: "Questions par module" },
  { title: "ENC (Éditions)", scope: "Référentiels de clinique.", why: "Recommandé pour cardio (urgences+++), HGE, rhumato, gynéco, neuro.", best: "Clinique tier 1" },
  { title: "HyperQCM", scope: "QCM de spécialité.", why: "Cité en complément pour la gynécologie.", best: "Gynécologie" },
  { title: "Livre OPU — Pharmacologie", scope: "Cours de pharmacologie.", why: "Vérifier la nouvelle classification des effets secondaires (posée cette année).", best: "Pharmacologie" },
];

// Maps each curriculum block to its best learning resource (used by the daily objective card link)
export const BLOCK_MATERIAL = {
  cardio: { label: "Cours externat 3ᵉ année (Drive)", url: "https://drive.google.com/drive/folders/1Ep8Y0sPQpfrqNLHoghUQiQqqYsq6Pcy" },
  pneumo: { label: "Cours externat 3ᵉ année (Drive)", url: "https://drive.google.com/drive/folders/1Ep8Y0sPQpfrqNLHoghUQiQqqYsq6Pcy" },
  nephro: { label: "Cours externat 3ᵉ année (Drive)", url: "https://drive.google.com/drive/folders/1Ep8Y0sPQpfrqNLHoghUQiQqqYsq6Pcy" },
  digestif: { label: "Cours externat 3ᵉ année (Drive)", url: "https://drive.google.com/drive/folders/1Ep8Y0sPQpfrqNLHoghUQiQqqYsq6Pcy" },
  infectieux: { label: "ency-education — Infectieux/Microbio", url: "https://univ.ency-education.com/medecine-residanat.html" },
  endoc: { label: "Cours externat 3ᵉ année (Drive)", url: "https://drive.google.com/drive/folders/1Ep8Y0sPQpfrqNLHoghUQiQqqYsq6Pcy" },
  hemato: { label: "Cours externat 3ᵉ année (Drive)", url: "https://drive.google.com/drive/folders/1Ep8Y0sPQpfrqNLHoghUQiQqqYsq6Pcy" },
  neuro: { label: "Cours externat 3ᵉ année (Drive)", url: "https://drive.google.com/drive/folders/1Ep8Y0sPQpfrqNLHoghUQiQqqYsq6Pcy" },
  "mere-enfant": { label: "Cours externat 3ᵉ année (Drive)", url: "https://drive.google.com/drive/folders/1Ep8Y0sPQpfrqNLHoghUQiQqqYsq6Pcy" },
  locomoteur: { label: "Cours externat 3ᵉ année (Drive)", url: "https://drive.google.com/drive/folders/1Ep8Y0sPQpfrqNLHoghUQiQqqYsq6Pcy" },
  sensoriel: { label: "Cours externat 3ᵉ année (Drive)", url: "https://drive.google.com/drive/folders/1Ep8Y0sPQpfrqNLHoghUQiQqqYsq6Pcy" },
  "sante-pub": { label: "E-learning Faculté Blida 1", url: "https://jfmb-dz.com/plateforme/course/index.php" },
  transversal: { label: "Cours externat 2ᵉ année (Drive)", url: "https://drive.google.com/drive/folders/0B_dp8bdQlHsbeFZBZjJWWkN6SWs" },
};
