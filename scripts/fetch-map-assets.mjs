#!/usr/bin/env node
/**
 * Fetches the static files the offline map needs besides tiles, so that the built web
 * app carries them and never asks the internet for a font:
 *
 *   apps/web/public/map-assets/fonts/<Font Name>/<range>.pbf   label glyphs (Noto Sans)
 *   apps/web/public/map-assets/sprites/v4/<flavour>[@2x].*     map icons
 *   apps/web/public/map-assets/SOURCE.json                     where it all came from
 *   apps/web/public/world/land.json, countries.json            a tiny world outline
 *
 * Fonts and sprites come from protomaps/basemaps-assets at one pinned commit, as a
 * single tarball. They are a build-time download and are not committed. The two world
 * files are small, derived from Natural Earth (public domain), and are committed.
 *
 *   node scripts/fetch-map-assets.mjs            fetch whatever is missing
 *   node scripts/fetch-map-assets.mjs --force    fetch and overwrite everything
 *
 * Plain Node, no dependencies. Files that already exist are left alone.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ASSETS_REPOSITORY = "protomaps/basemaps-assets";
/** Head of `main` on 2026-11-15. Change it deliberately, then run with --force. */
const ASSETS_COMMIT = "028c18f713baecad011301ff7a69acc39bcc2ae7";
const ASSETS_TARBALL = `https://codeload.github.com/${ASSETS_REPOSITORY}/tar.gz/${ASSETS_COMMIT}`;

const FONTS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic", "Noto Sans Devanagari Regular v1"];
const SPRITE_FLAVOURS = ["light", "dark", "white", "grayscale", "black"];
const SPRITE_VERSION = "v4";
const FONT_LICENSE = "fonts/OFL.txt";

const NATURAL_EARTH_REPOSITORY = "nvkelso/natural-earth-vector";
const NATURAL_EARTH_TAG = "v5.1.2";
const naturalEarthUrl = (name) =>
  `https://raw.githubusercontent.com/${NATURAL_EARTH_REPOSITORY}/${NATURAL_EARTH_TAG}/geojson/${name}.geojson`;

const root = path.resolve(import.meta.dirname, "..");
const assetsDir = path.join(root, "apps/web/public/map-assets");
const worldDir = path.join(root, "apps/web/public/world");
const force = process.argv.includes("--force");

const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Every file expected under map-assets, relative to it. Glyph ranges are 256 code points each. */
function expectedAssets() {
  const files = [];
  for (const font of FONTS) {
    for (let start = 0; start < 65536; start += 256) files.push(`fonts/${font}/${start}-${start + 255}.pbf`);
  }
  // The Open Font License asks that its text travels with the fonts.
  files.push(FONT_LICENSE);
  for (const flavour of SPRITE_FLAVOURS) {
    for (const suffix of ["", "@2x"])
      for (const extension of ["json", "png"]) files.push(`sprites/${SPRITE_VERSION}/${flavour}${suffix}.${extension}`);
  }
  return files;
}

const isPresent = (file) => {
  try {
    return fs.statSync(file).size > 0;
  } catch {
    return false;
  }
};

async function download(url) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Reads an uncompressed tar archive into a map of path → bytes for its regular files.
 * Understands the two ways long paths are stored (the ustar prefix field and pax
 * extended headers), and symbolic links to other files in the archive: the repository
 * links most Devanagari glyph ranges to the Regular font's, and a web server needs
 * real files, so a link is read as a copy of what it points at.
 */
function readTar(tar) {
  const text = (start, length) => {
    const slice = tar.subarray(start, start + length);
    const end = slice.indexOf(0);
    return slice.subarray(0, end === -1 ? length : end).toString("utf8");
  };
  const files = new Map();
  const links = [];
  let offset = 0;
  let pendingPath;
  while (offset + 512 <= tar.length) {
    const name = text(offset, 100);
    if (!name && tar.subarray(offset, offset + 512).every((byte) => byte === 0)) break;
    const size = Number.parseInt(text(offset + 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(tar[offset + 156] || 48);
    const prefix = text(offset + 345, 155);
    const body = tar.subarray(offset + 512, offset + 512 + size);
    const entryPath = pendingPath ?? (prefix ? `${prefix}/${name}` : name);
    if (type === "x") {
      // pax records look like "<length> path=<value>\n".
      const match = /\d+ path=([^\n]*)\n/.exec(body.toString("utf8"));
      pendingPath = match ? match[1] : undefined;
    } else if (type === "L") {
      pendingPath = body.toString("utf8").replace(/\0+$/, "");
    } else {
      if (type === "0") files.set(entryPath, body);
      // Resolved against the link's own folder; path.posix.join also folds any "..".
      else if (type === "2") links.push([entryPath, path.posix.join(path.posix.dirname(entryPath), text(offset + 157, 100))]);
      if (type !== "g") pendingPath = undefined;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  // A link is only followed to a regular file inside the archive; anything else is ignored.
  for (const [from, to] of links) if (!files.has(from) && files.has(to)) files.set(from, files.get(to));
  return files;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Checks that a file is what its name says. Returns a complaint, or undefined if it is fine. */
function problemWith(relative, bytes) {
  if (bytes.length === 0) return "is empty";
  // A glyph range is a protobuf message whose first field is tag 1, length-delimited.
  if (relative.endsWith(".pbf") && bytes[0] !== 0x0a) return "does not look like a glyph file";
  if (relative.endsWith(".png") && !bytes.subarray(0, 8).equals(PNG_MAGIC)) return "is not a PNG image";
  if (relative === FONT_LICENSE && !bytes.toString("utf8").includes("SIL OPEN FONT LICENSE")) return "is not the Open Font License";
  if (relative.endsWith(".json")) {
    try {
      if (Object.keys(JSON.parse(bytes.toString("utf8"))).length === 0) return "lists no icons";
    } catch {
      return "is not valid JSON";
    }
  }
  return undefined;
}

async function fetchAssets() {
  const expected = expectedAssets();
  const wanted = new Set(expected);
  const missing = expected.filter((relative) => force || !isPresent(path.join(assetsDir, relative)));
  if (missing.length === 0) {
    console.log(`map-assets: all ${expected.length} files are already there.`);
  } else {
    console.log(
      `map-assets: fetching ${missing.length} of ${expected.length} files from ${ASSETS_REPOSITORY}@${ASSETS_COMMIT.slice(0, 12)} …`,
    );
    const archive = readTar(zlib.gunzipSync(await download(ASSETS_TARBALL)));
    const needed = new Set(missing);
    let written = 0;
    for (const [entry, bytes] of archive) {
      // Entries are "<repository>-<commit>/<path>". Only paths on the expected list are
      // ever written, so nothing in the archive can choose where it lands.
      const relative = entry.slice(entry.indexOf("/") + 1);
      if (!wanted.has(relative) || !needed.has(relative)) continue;
      const target = path.join(assetsDir, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
      written += 1;
    }
    console.log(`map-assets: wrote ${written} files.`);
  }

  // Verify everything, including what was there before: a half-written file from an
  // interrupted run should fail here, not as a blank label on the map.
  const problems = [];
  let totalBytes = 0;
  const counts = { glyphs: 0, sprites: 0 };
  for (const relative of expected) {
    const file = path.join(assetsDir, relative);
    if (!fs.existsSync(file)) {
      problems.push(`${relative} is missing`);
      continue;
    }
    const bytes = fs.readFileSync(file);
    const problem = problemWith(relative, bytes);
    if (problem) problems.push(`${relative} ${problem}`);
    totalBytes += bytes.length;
    if (relative.endsWith(".pbf")) counts.glyphs += 1;
    else if (relative.startsWith("sprites/")) counts.sprites += 1;
  }
  if (problems.length > 0) {
    throw new Error(
      `map-assets: ${problems.length} files are wrong:\n  ${problems.slice(0, 20).join("\n  ")}\nRun again with --force to fetch them afresh.`,
    );
  }

  const source = {
    description: "Fonts and icons for the offline map. Fetched by scripts/fetch-map-assets.mjs; do not edit.",
    assets: {
      repository: `https://github.com/${ASSETS_REPOSITORY}`,
      commit: ASSETS_COMMIT,
      tarball: ASSETS_TARBALL,
      fonts: FONTS,
      sprites: { version: SPRITE_VERSION, flavours: SPRITE_FLAVOURS },
      files: counts,
      bytes: totalBytes,
    },
    licenses: {
      fonts: "Noto Sans, © The Noto Project Authors, SIL Open Font License 1.1. The licence text is in fonts/OFL.txt.",
      sprites:
        "Icons of the Protomaps basemaps project, from protomaps/basemaps-assets. That repository has no separate licence file for them at this commit; see https://github.com/protomaps/basemaps before redistributing them on their own.",
    },
    world: {
      repository: `https://github.com/${NATURAL_EARTH_REPOSITORY}`,
      tag: NATURAL_EARTH_TAG,
      files: ["ne_110m_land.geojson", "ne_110m_admin_0_countries.geojson"],
      license: "Natural Earth, public domain (https://www.naturalearthdata.com/about/terms-of-use/)",
    },
  };
  fs.writeFileSync(path.join(assetsDir, "SOURCE.json"), `${JSON.stringify(source, null, 2)}\n`);
  console.log(`map-assets: verified ${counts.glyphs} glyph files and ${counts.sprites} sprite files, ${megabytes(totalBytes)}.`);
}

// ── World outline ────────────────────────────────────────────────────────────

/** Rounds a ring to three decimals (about 100 m) and drops points that collapse together. */
function simplifyRing(ring) {
  const out = [];
  for (const [lon, lat] of ring) {
    const point = [Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000];
    const last = out[out.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) out.push(point);
  }
  // A ring needs four points (the first repeated at the end) to enclose anything.
  return out.length >= 4 ? out : undefined;
}

function simplifyGeometry(geometry) {
  const polygon = (rings) => {
    const kept = rings.map(simplifyRing);
    // Without its outer ring a polygon is nothing; holes that vanished are simply dropped.
    return kept[0] ? kept.filter(Boolean) : undefined;
  };
  if (geometry.type === "Polygon") {
    const coordinates = polygon(geometry.coordinates);
    return coordinates ? { type: "Polygon", coordinates } : undefined;
  }
  if (geometry.type === "MultiPolygon") {
    const coordinates = geometry.coordinates.map(polygon).filter(Boolean);
    return coordinates.length > 0 ? { type: "MultiPolygon", coordinates } : undefined;
  }
  return undefined;
}

async function buildWorldFile(sourceName, targetName, toProperties) {
  const target = path.join(worldDir, targetName);
  if (!force && isPresent(target)) {
    console.log(`world: ${targetName} is already there (${(fs.statSync(target).size / 1024).toFixed(0)} KB).`);
    return;
  }
  const source = JSON.parse((await download(naturalEarthUrl(sourceName))).toString("utf8"));
  if (source.type !== "FeatureCollection" || !Array.isArray(source.features) || source.features.length === 0) {
    throw new Error(`world: ${sourceName} is not the GeoJSON that was expected.`);
  }
  const features = [];
  for (const feature of source.features) {
    const geometry = simplifyGeometry(feature.geometry);
    if (geometry) features.push({ type: "Feature", properties: toProperties(feature.properties ?? {}), geometry });
  }
  if (features.length !== source.features.length) {
    throw new Error(`world: ${source.features.length - features.length} features of ${sourceName} vanished when simplified.`);
  }
  fs.mkdirSync(worldDir, { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ type: "FeatureCollection", features })}\n`);
  console.log(`world: wrote ${targetName}, ${features.length} features, ${(fs.statSync(target).size / 1024).toFixed(0)} KB.`);
}

await fetchAssets();
await buildWorldFile("ne_110m_land", "land.json", () => ({}));
await buildWorldFile("ne_110m_admin_0_countries", "countries.json", (properties) => ({
  name: properties.ADMIN ?? properties.NAME,
  // Natural Earth marks "no code" as -99 (Northern Cyprus, Somaliland).
  iso: properties.ISO_A2_EH && properties.ISO_A2_EH !== "-99" ? properties.ISO_A2_EH : null,
}));
