#!/usr/bin/env node
/**
 * Writes packages/shared/src/sky/stars.gen.ts from the Yale Bright Star Catalogue, 5th
 * revised edition (Hoffleit and Warren, 1991; NASA Astronomical Data Center catalogue
 * V/50), in its plain-text form ("catalog", 197 characters a line).
 *
 * Kept: every star of visual magnitude 4.5 or brighter, and any fainter star a
 * constellation figure below joins. For each, the J2000 position, the magnitude and the
 * proper motion. The constellation figures are Outpost's own: the usual stick figures,
 * written here by the stars' Bayer letters, and checked against the catalogue (a figure
 * that names a star the catalogue does not hold stops the script).
 *
 * Usage: node scripts/write-star-catalogue.mjs <path to the catalogue file>
 * The catalogue was read from http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz on
 * 21 November 2026 (the same file as the ADC's V/50 "catalog").
 */
import fs from "node:fs";
import path from "node:path";

const source = process.argv[2];
if (!source) {
  console.error("Usage: node scripts/write-star-catalogue.mjs <bsc5 catalogue file>");
  process.exit(1);
}

const LIMIT = 4.5;

/** The navigational stars, numbered as the Nautical Almanac numbers them, and Polaris. */
const NAVIGATIONAL = [
  [1, "Alpheratz", "Alp And"],
  [2, "Ankaa", "Alp Phe"],
  [3, "Schedar", "Alp Cas"],
  [4, "Diphda", "Bet Cet"],
  [5, "Achernar", "Alp Eri"],
  [6, "Hamal", "Alp Ari"],
  [7, "Acamar", "The1Eri"],
  [8, "Menkar", "Alp Cet"],
  [9, "Mirfak", "Alp Per"],
  [10, "Aldebaran", "Alp Tau"],
  [11, "Rigel", "Bet Ori"],
  [12, "Capella", "Alp Aur"],
  [13, "Bellatrix", "Gam Ori"],
  [14, "Elnath", "Bet Tau"],
  [15, "Alnilam", "Eps Ori"],
  [16, "Betelgeuse", "Alp Ori"],
  [17, "Canopus", "Alp Car"],
  [18, "Sirius", "Alp CMa"],
  [19, "Adhara", "Eps CMa"],
  [20, "Procyon", "Alp CMi"],
  [21, "Pollux", "Bet Gem"],
  [22, "Avior", "Eps Car"],
  [23, "Suhail", "Lam Vel"],
  [24, "Miaplacidus", "Bet Car"],
  [25, "Alphard", "Alp Hya"],
  [26, "Regulus", "Alp Leo"],
  [27, "Dubhe", "Alp UMa"],
  [28, "Denebola", "Bet Leo"],
  [29, "Gienah", "Gam Crv"],
  [30, "Acrux", "Alp1Cru"],
  [31, "Gacrux", "Gam Cru"],
  [32, "Alioth", "Eps UMa"],
  [33, "Spica", "Alp Vir"],
  [34, "Alkaid", "Eta UMa"],
  [35, "Hadar", "Bet Cen"],
  [36, "Menkent", "The Cen"],
  [37, "Arcturus", "Alp Boo"],
  [38, "Rigil Kentaurus", "Alp1Cen"],
  [39, "Zubenelgenubi", "Alp2Lib"],
  [40, "Kochab", "Bet UMi"],
  [41, "Alphecca", "Alp CrB"],
  [42, "Antares", "Alp Sco"],
  [43, "Atria", "Alp TrA"],
  [44, "Sabik", "Eta Oph"],
  [45, "Shaula", "Lam Sco"],
  [46, "Rasalhague", "Alp Oph"],
  [47, "Eltanin", "Gam Dra"],
  [48, "Kaus Australis", "Eps Sgr"],
  [49, "Vega", "Alp Lyr"],
  [50, "Nunki", "Sig Sgr"],
  [51, "Altair", "Alp Aql"],
  [52, "Peacock", "Alp Pav"],
  [53, "Deneb", "Alp Cyg"],
  [54, "Enif", "Eps Peg"],
  [55, "Alnair", "Alp Gru"],
  [56, "Fomalhaut", "Alp PsA"],
  [57, "Markab", "Alp Peg"],
  [0, "Polaris", "Alp UMi"],
];

/** Other stars named on the chart and in the finding-north plates. */
const OTHER_NAMES = [
  ["Merak", "Bet UMa"],
  ["Phecda", "Gam UMa"],
  ["Megrez", "Del UMa"],
  ["Mizar", "Zet UMa"],
  ["Castor", "Alp Gem"],
  ["Mimosa", "Bet Cru"],
  ["Algol", "Bet Per"],
  ["Mintaka", "Del Ori"],
  ["Alnitak", "Zet Ori"],
  ["Saiph", "Kap Ori"],
  ["Albireo", "Bet1Cyg"],
  ["Mirach", "Bet And"],
  ["Caph", "Bet Cas"],
];

/**
 * The figures: IAU abbreviation, the name, and chains of stars joined in order. A star
 * of another constellation is written "Alp:And".
 */
const FIGURES = [
  ["UMa", "Ursa Major (the Plough)", ["Eta-Zet-Eps-Del-Alp-Bet-Gam-Del"]],
  ["UMi", "Ursa Minor", ["Alp-Del-Eps-Zet-Eta-Gam-Bet-Zet"]],
  ["Cas", "Cassiopeia", ["Eps-Del-Gam-Alp-Bet"]],
  ["Ori", "Orion", ["Alp-Zet-Eps-Del-Gam-Alp", "Zet-Kap-Bet-Del", "Alp-Lam-Gam"]],
  ["Tau", "Taurus", ["Bet-Eps-Del1-Gam-The2-Alp-Zet"]],
  ["Gem", "Gemini", ["Alp-Bet", "Alp-Eps-Mu", "Bet-Del-Gam"]],
  ["CMa", "Canis Major", ["Bet-Alp-Del-Eta", "Del-Eps"]],
  ["CMi", "Canis Minor", ["Alp-Bet"]],
  ["Aur", "Auriga", ["Alp-Bet-The-Bet:Tau-Iot-Alp"]],
  ["Leo", "Leo", ["Eps-Mu-Zet-Gam1-Eta-Alp-The-Bet-Del-Gam1"]],
  ["Boo", "Boötes", ["Alp-Eps-Del-Bet-Gam-Rho-Alp"]],
  ["CrB", "Corona Borealis", ["The-Bet-Alp-Gam-Del-Eps"]],
  ["Her", "Hercules", ["Eps-Zet-Eta-Pi-Eps"]],
  ["Lyr", "Lyra", ["Alp-Zet1-Del2-Gam-Bet-Zet1"]],
  ["Cyg", "Cygnus", ["Alp-Gam-Eta-Bet1", "Del-Gam-Eps"]],
  ["Aql", "Aquila", ["Gam-Alp-Bet", "Alp-Del-Lam", "Del-Zet"]],
  ["Peg", "Pegasus", ["Alp-Bet-Alp:And-Gam-Alp", "Alp-Zet-The-Eps"]],
  ["And", "Andromeda", ["Alp-Del-Bet-Gam1"]],
  ["Per", "Perseus", ["Gam-Alp-Del-Eps-Zet", "Alp-Bet"]],
  ["Ari", "Aries", ["Bet-Alp"]],
  ["Vir", "Virgo", ["Alp-Gam-Del-Eps"]],
  ["Sco", "Scorpius", ["Bet1-Del-Pi", "Del-Sig-Alp-Tau-Eps-Mu1-Zet2-Eta-The-Iot1-Kap-Lam"]],
  ["Sgr", "Sagittarius", ["Eps-Del-Gam2-Eps-Zet-Phi-Del-Lam-Phi-Sig-Tau-Zet"]],
  ["Crv", "Corvus", ["Gam-Del-Bet-Eps-Gam"]],
  ["Cru", "Crux (the Southern Cross)", ["Alp1-Gam", "Bet-Del"]],
  ["Cen", "Centaurus (the Pointers)", ["Alp1-Bet"]],
  ["TrA", "Triangulum Australe", ["Alp-Bet-Gam-Alp"]],
];

const lines = fs.readFileSync(source, "latin1").split(/\r?\n/);
const byBayer = new Map();
const rows = new Map();
for (const line of lines) {
  if (line.length < 110) continue;
  const hr = Number(line.slice(0, 4));
  const raH = line.slice(75, 77).trim();
  const mag = line.slice(102, 107).trim();
  if (!raH || !mag) continue;
  const ra = (Number(raH) + Number(line.slice(77, 79)) / 60 + Number(line.slice(79, 83)) / 3600) * 15;
  const sign = line[83] === "-" ? -1 : 1;
  const dec = sign * (Number(line.slice(84, 86)) + Number(line.slice(86, 88)) / 60 + Number(line.slice(88, 90)) / 3600);
  const pmRa = Number(line.slice(148, 154).trim() || 0);
  const pmDec = Number(line.slice(154, 160).trim() || 0);
  rows.set(hr, { hr, ra, dec, mag: Number(mag), pmRa, pmDec });
  const bayer = line.slice(7, 14);
  // Where two entries share a Bayer letter (a star and its faint companion), the brighter one is meant.
  const key = bayer.replace(/\s+$/, "");
  if (key && !(byBayer.has(key) && rows.get(byBayer.get(key)).mag <= Number(mag))) byBayer.set(key, hr);
}

function find(token, constellation) {
  const [letters, other] = token.split(":");
  const con = other ?? constellation;
  const [, greekLetters, superscript] = /^([A-Za-z]+)(\d?)$/.exec(letters) ?? [];
  const greek = (greekLetters ?? letters).padEnd(3, " ");
  const key = `${greek}${superscript || " "}${con}`;
  const hr = byBayer.get(key) ?? (superscript ? undefined : byBayer.get(`${greek}1${con}`));
  if (!hr) throw new Error(`The catalogue holds no star ${key.trim()}.`);
  return hr;
}

const keep = new Set();
for (const row of rows.values()) if (row.mag <= LIMIT) keep.add(row.hr);

const names = [];
for (const [number, name, bayer] of NAVIGATIONAL) {
  const hr = find(bayer.slice(0, 4).trim(), bayer.slice(4));
  keep.add(hr);
  names.push({ hr, name, number });
}
for (const [name, bayer] of OTHER_NAMES) {
  const hr = find(bayer.slice(0, 4).trim(), bayer.slice(4));
  keep.add(hr);
  names.push({ hr, name, number: null });
}

const figures = FIGURES.map(([abbr, name, chains]) => {
  const pairs = [];
  for (const chain of chains) {
    const hrs = chain.split("-").map((token) => find(token, abbr));
    for (let i = 1; i < hrs.length; i++) pairs.push([hrs[i - 1], hrs[i]]);
  }
  for (const pair of pairs) for (const hr of pair) keep.add(hr);
  return { abbr, name, pairs };
});

const kept = [...keep].sort((a, b) => a - b).map((hr) => rows.get(hr));
const round = (value, places) => Number(value.toFixed(places));
const out = `// Written by scripts/write-star-catalogue.mjs from the Yale Bright Star Catalogue, 5th revised edition
// (Hoffleit and Warren, 1991; NASA ADC V/50). Do not edit by hand.

/** HR number, right ascension and declination (J2000, degrees), visual magnitude, proper motion in right ascension (times cos dec) and declination (arcseconds a year). */
export const STAR_ROWS: ReadonlyArray<readonly [number, number, number, number, number, number]> = ${JSON.stringify(
  kept.map((s) => [s.hr, round(s.ra, 5), round(s.dec, 5), s.mag, s.pmRa, s.pmDec]),
)};

/** Named stars: HR number, name, and the Nautical Almanac's number for a navigational star (0 for Polaris, null for others). */
export const STAR_NAMES: ReadonlyArray<readonly [number, string, number | null]> = ${JSON.stringify(names.map((n) => [n.hr, n.name, n.number]))};

/** Constellation figures: IAU abbreviation, name, and the pairs of stars (HR numbers) joined. */
export const FIGURES: ReadonlyArray<readonly [string, string, ReadonlyArray<readonly [number, number]>]> = ${JSON.stringify(
  figures.map((f) => [f.abbr, f.name, f.pairs]),
)};
`;
const target = path.join(import.meta.dirname, "../packages/shared/src/sky/stars.gen.ts");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out);
console.log(`${kept.length} stars, ${names.length} names, ${figures.length} figures; ${out.length} bytes written to ${target}`);
