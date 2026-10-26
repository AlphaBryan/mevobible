// Les 66 livres dans l'ordre : [nom affiché, nombre de chapitres, code USFM].
// Partagé par l'application, le convertisseur et le générateur audio.
export const LIVRES = [
  ["Genèse", 50, "GEN"], ["Exode", 40, "EXO"], ["Lévitique", 27, "LEV"], ["Nombres", 36, "NUM"],
  ["Deutéronome", 34, "DEU"], ["Josué", 24, "JOS"], ["Juges", 21, "JDG"], ["Ruth", 4, "RUT"],
  ["1 Samuel", 31, "1SA"], ["2 Samuel", 24, "2SA"], ["1 Rois", 22, "1KI"], ["2 Rois", 25, "2KI"],
  ["1 Chroniques", 29, "1CH"], ["2 Chroniques", 36, "2CH"], ["Esdras", 10, "EZR"], ["Néhémie", 13, "NEH"],
  ["Esther", 10, "EST"], ["Job", 42, "JOB"], ["Psaumes", 150, "PSA"], ["Proverbes", 31, "PRO"],
  ["Ecclésiaste", 12, "ECC"], ["Cantique des cantiques", 8, "SNG"], ["Ésaïe", 66, "ISA"], ["Jérémie", 52, "JER"],
  ["Lamentations", 5, "LAM"], ["Ézéchiel", 48, "EZK"], ["Daniel", 12, "DAN"], ["Osée", 14, "HOS"],
  ["Joël", 3, "JOL"], ["Amos", 9, "AMO"], ["Abdias", 1, "OBA"], ["Jonas", 4, "JON"],
  ["Michée", 7, "MIC"], ["Nahum", 3, "NAM"], ["Habacuc", 3, "HAB"], ["Sophonie", 3, "ZEP"],
  ["Aggée", 2, "HAG"], ["Zacharie", 14, "ZEC"], ["Malachie", 4, "MAL"], ["Matthieu", 28, "MAT"],
  ["Marc", 16, "MRK"], ["Luc", 24, "LUK"], ["Jean", 21, "JHN"], ["Actes", 28, "ACT"],
  ["Romains", 16, "ROM"], ["1 Corinthiens", 16, "1CO"], ["2 Corinthiens", 13, "2CO"], ["Galates", 6, "GAL"],
  ["Éphésiens", 6, "EPH"], ["Philippiens", 4, "PHP"], ["Colossiens", 4, "COL"], ["1 Thessaloniciens", 5, "1TH"],
  ["2 Thessaloniciens", 3, "2TH"], ["1 Timothée", 6, "1TI"], ["2 Timothée", 4, "2TI"], ["Tite", 3, "TIT"],
  ["Philémon", 1, "PHM"], ["Hébreux", 13, "HEB"], ["Jacques", 5, "JAS"], ["1 Pierre", 5, "1PE"],
  ["2 Pierre", 3, "2PE"], ["1 Jean", 5, "1JN"], ["2 Jean", 1, "2JN"], ["3 Jean", 1, "3JN"],
  ["Jude", 1, "JUD"], ["Apocalypse", 22, "REV"],
];

export const TOTAL_CHAPITRES = LIVRES.reduce((s, b) => s + b[1], 0);

// "03" pour Lévitique : nom de fichier des JSON et dossiers audio.
export const codeLivre = (l) => String(l).padStart(2, "0");
