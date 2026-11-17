/**
 * Where Tesseract's language data is, and which languages this installation has.
 *
 * English ships with Outpost: from source it is the `@tesseract.js-data/eng` package,
 * and in the packaged app `scripts/build-app.mjs` copies the same file to
 * `server/ocr/`. Other languages are files a person puts in
 * `<data directory>/ocr/tessdata/` themselves. Nothing here, or anywhere else in OCR,
 * downloads anything.
 *
 * Runs in the server thread; the worker is handed the paths it should read.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appRoot, isBundled, workerUrl } from "../../core/paths.ts";
import type { OcrLanguageFile } from "./types.ts";

/** Language codes as Tesseract names its files: "eng", "deu", "chi_sim", "deu_latf". */
export const LANGUAGE_CODE = /^[a-z]{3,4}(_[a-z]{3,8})?$/;

const DATA_FILE = /^([a-z]{3,4}(?:_[a-z]{3,8})?)\.traineddata(\.gz)?$/;

/** Folder inside the data directory where a person adds languages. */
export const LANGUAGE_FOLDER = "ocr/tessdata";

export interface InstalledLanguage extends OcrLanguageFile {
  /** True for the English data that ships with Outpost. */
  builtIn: boolean;
}

let engine: boolean | undefined;
let english: Promise<string | undefined> | undefined;

/**
 * Whether the engine itself is here. Packaged, it is part of the OCR worker's bundle;
 * from source it is the `tesseract.js-core` package. Neither changes while the server runs.
 */
export function engineInstalled(): boolean {
  if (engine === undefined) {
    try {
      if (isBundled) engine = fs.statSync(fileURLToPath(workerUrl(new URL("./ocr.worker.ts", import.meta.url), "ocr"))).isFile();
      else {
        createRequire(import.meta.url).resolve("tesseract.js-core/package.json");
        engine = true;
      }
    } catch {
      engine = false;
    }
  }
  return engine;
}

/** The English data that ships with Outpost. Part of the installation, so looked for once. */
function builtInEnglish(): Promise<string | undefined> {
  english ??= (async () => {
    try {
      const file = isBundled
        ? path.join(appRoot, "server/ocr/eng.traineddata.gz")
        : createRequire(import.meta.url).resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz");
      return (await fs.promises.stat(file)).isFile() ? file : undefined;
    } catch {
      return undefined;
    }
  })();
  return english;
}

/**
 * Every language whose data is on this machine, English first. A file a person added
 * takes the place of the built-in one with the same code.
 */
export async function installedLanguages(dataDir: string): Promise<InstalledLanguage[]> {
  const found = new Map<string, InstalledLanguage>();
  const builtIn = await builtInEnglish();
  if (builtIn) found.set("eng", { code: "eng", path: builtIn, builtIn: true });

  const folder = path.join(dataDir, LANGUAGE_FOLDER);
  // The folder exists only once somebody has added a language.
  const names = (await fs.promises.readdir(folder).catch(() => [] as string[])).sort();
  for (const name of names) {
    const match = DATA_FILE.exec(name);
    if (!match?.[1]) continue;
    const file = path.join(folder, name);
    // A file removed between listing and looking is simply not there.
    const stat = await fs.promises.stat(file).catch(() => undefined);
    if (stat?.isFile()) found.set(match[1], { code: match[1], path: file, builtIn: false });
  }
  return [...found.values()].sort((a, b) => Number(b.code === "eng") - Number(a.code === "eng") || a.code.localeCompare(b.code));
}

/** The codes in a setting such as "eng+deu", in order, without repeats or anything malformed. */
export function parseLanguages(setting: string): string[] {
  const codes: string[] = [];
  for (const part of setting.split(/[+,\s]+/)) {
    const code = part.trim().toLowerCase();
    if (LANGUAGE_CODE.test(code) && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

const NAMES: Record<string, string> = {
  afr: "Afrikaans",
  ara: "Arabic",
  ben: "Bengali",
  bul: "Bulgarian",
  cat: "Catalan",
  ces: "Czech",
  chi_sim: "Chinese (simplified)",
  chi_tra: "Chinese (traditional)",
  cym: "Welsh",
  dan: "Danish",
  deu: "German",
  ell: "Greek",
  eng: "English",
  est: "Estonian",
  fas: "Persian",
  fin: "Finnish",
  fra: "French",
  gle: "Irish",
  heb: "Hebrew",
  hin: "Hindi",
  hrv: "Croatian",
  hun: "Hungarian",
  ind: "Indonesian",
  isl: "Icelandic",
  ita: "Italian",
  jpn: "Japanese",
  kor: "Korean",
  lav: "Latvian",
  lit: "Lithuanian",
  nld: "Dutch",
  nor: "Norwegian",
  pol: "Polish",
  por: "Portuguese",
  ron: "Romanian",
  rus: "Russian",
  slk: "Slovak",
  slv: "Slovenian",
  spa: "Spanish",
  srp: "Serbian",
  swa: "Swahili",
  swe: "Swedish",
  tha: "Thai",
  tur: "Turkish",
  ukr: "Ukrainian",
  urd: "Urdu",
  vie: "Vietnamese",
};

/** "German" for "deu"; the code itself for a language this short list does not know. */
export const languageName = (code: string) => NAMES[code] ?? code;
