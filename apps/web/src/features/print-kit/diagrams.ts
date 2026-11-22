/**
 * Line drawings for printed pages, drawn by code as SVG. Each draws what the words it
 * stands beside say, and no more: a drawing never adds advice. Where a drawing must show
 * something the words leave open (an order, a container), its caption says so.
 *
 * Labels are set in the book's typeface. Every shade used also differs in grey, and the
 * parts are told apart by texture and label, not by colour alone.
 */
import { PRINT_COLOURS as C, PRINT_FONT } from "./tokens";

export interface Drawing {
  svg: string;
  /** The drawing's own size, in points. */
  width: number;
  height: number;
}

const INK = C.ink;
const LINE = 1.2;

const svg = (width: number, height: number, body: string): Drawing => ({
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`,
  width,
  height,
});

const text = (
  x: number,
  y: number,
  words: string,
  options: { anchor?: "start" | "middle" | "end"; bold?: boolean; size?: number; fill?: string } = {},
) =>
  `<text x="${x}" y="${y}" font-family="${PRINT_FONT}" font-size="${options.size ?? 7.5}"${options.bold ? ' font-weight="bold"' : ""} fill="${
    options.fill ?? INK
  }" text-anchor="${options.anchor ?? "start"}">${words.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;

/** A thin line from a part to its label. */
const leader = (x1: number, y1: number, x2: number, y2: number) =>
  `<polyline points="${x1},${y1} ${x2},${y2}" fill="none" stroke="${C.muted}" stroke-width="0.6"/><circle cx="${x1}" cy="${y1}" r="1.3" fill="${C.muted}"/>`;

const arrowHead = (x: number, y: number, angle: number, colour: string = INK) =>
  `<path d="M0,0 L-5,-2.6 L-5,2.6 Z" fill="${colour}" transform="translate(${x} ${y}) rotate(${angle})"/>`;

// ── Water ───────────────────────────────────────────────────────────────────

/**
 * FM 21-76's filter: "several centimeters or layers of filtering material such as sand,
 * crushed rock, charcoal, or cloth", which only clears water. It names no order and its
 * containers are bamboo, a hollow log or a piece of clothing; here a cut-off bottle,
 * upside down, holds the layers, and the caption says so.
 */
export function bottleFilter(): Drawing {
  const left = 62;
  const right = 138;
  const layers = [
    { top: 44, bottom: 78, fill: C.water, name: "water poured in", pattern: "" },
    { top: 78, bottom: 108, fill: "#d9d4ca", name: "crushed rock", pattern: "rock" },
    { top: 108, bottom: 136, fill: "#33383b", name: "charcoal", pattern: "" },
    { top: 136, bottom: 164, fill: "#ecdcb4", name: "sand", pattern: "sand" },
  ];
  let body = "";
  // The layers, clipped to the bottle's inside.
  body += `<clipPath id="inside"><path d="M${left},40 L${right},40 L${right},166 Q${right},186 112,194 L108,214 L92,214 L88,194 Q${left},186 ${left},166 Z"/></clipPath>`;
  body += `<g clip-path="url(#inside)">`;
  for (const layer of layers)
    body += `<rect x="${left}" y="${layer.top}" width="${right - left}" height="${layer.bottom - layer.top}" fill="${layer.fill}"/>`;
  // Cloth in the neck and shoulders.
  body += `<rect x="${left}" y="164" width="${right - left}" height="52" fill="#ffffff"/>`;
  body += `<path d="M${left},170 Q100,160 ${right},170 M${left},178 Q100,168 ${right},178 M${left},186 Q100,176 ${right},186 M80,196 Q100,190 120,196 M86,204 Q100,199 114,204" fill="none" stroke="${C.muted}" stroke-width="0.6"/>`;
  // Texture: stones and grains, so the layers part in grey too.
  // Stones in staggered rows, grains scattered: the same every time it is drawn.
  for (let row = 0; row < 3; row += 1)
    for (let column = 0; column < 7; column += 1) {
      const x = left + 6 + column * 11 + (row % 2) * 5.5;
      const y = 84 + row * 9;
      body += `<ellipse cx="${x}" cy="${y}" rx="${4.4 - ((row + column) % 3) * 0.6}" ry="3.2" fill="#b5ada0" stroke="${C.muted}" stroke-width="0.4"/>`;
    }
  let seed = 7;
  const next = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let index = 0; index < 70; index += 1)
    body += `<circle cx="${(left + 3 + next() * (right - left - 6)).toFixed(1)}" cy="${(139 + next() * 23).toFixed(1)}" r="0.75" fill="#a68d55"/>`;
  body += `<path d="M${left + 8},58 q6,-4 12,0 t12,0 t12,0 t12,0 t12,0" fill="none" stroke="#ffffff" stroke-width="0.9"/>`;
  body += `</g>`;
  // The bottle.
  body += `<path d="M${left},36 L${left},166 Q${left},186 88,194 L92,214 L108,214 L112,194 Q${right},186 ${right},166 L${right},36" fill="none" stroke="${INK}" stroke-width="${LINE + 0.2}" stroke-linejoin="round"/>`;
  body += `<path d="M${left - 4},36 L${left + 4},36 M${right - 4},36 L${right + 4},36" stroke="${INK}" stroke-width="${LINE}"/>`;
  // Water poured in from a jug, at the top.
  body += `<path d="M98,6 L98,32" stroke="${C.water}" stroke-width="3" stroke-linecap="round"/>${arrowHead(98, 36, 90, C.know)}`;
  // Drips into a cup.
  body += `<path d="M100,218 L100,236" stroke="${C.know}" stroke-width="1" stroke-dasharray="2 3"/>${arrowHead(100, 240, 90, C.know)}`;
  body += `<path d="M82,244 L84,270 L116,270 L118,244" fill="none" stroke="${INK}" stroke-width="${LINE}" stroke-linejoin="round"/><rect x="84.5" y="254" width="31" height="15.5" fill="${C.water}"/>`;
  // Labels.
  const labels: Array<[number, number, string]> = [
    [layers[0]!.top + 18, 0, "water poured in"],
    [93, 1, "crushed rock"],
    [122, 2, "charcoal"],
    [150, 3, "sand"],
    [186, 4, "cloth"],
  ];
  for (const [y, , words] of labels) body += leader(right - 6, y, right + 18, y) + text(right + 21, y + 2.5, words);
  body += text(78, 262, "clearer, not yet safe", { anchor: "end" }) + text(78, 271, "now boil or treat it", { anchor: "end", bold: true });
  body +=
    text(left - 6, 50, "a bottle, its", { anchor: "end", fill: C.muted }) +
    text(left - 6, 59, "bottom cut off,", { anchor: "end", fill: C.muted }) +
    text(left - 6, 68, "upside down", { anchor: "end", fill: C.muted });
  return svg(236, 276, body);
}

/** FM 21-76: "Catch rain in tarps or in other water-holding material or containers." */
export function rainCatch(): Drawing {
  let body = "";
  // Rain.
  for (let index = 0; index < 13; index += 1) {
    const x = 22 + index * 17 + (index % 2) * 6;
    const y = 8 + (index % 3) * 9;
    body += `<path d="M${x},${y} l-4,10" stroke="${C.know}" stroke-width="1.1" stroke-linecap="round"/>`;
  }
  // Posts and the sheet, sagging to a low point.
  body += `<path d="M24,58 L24,132 M226,58 L226,132" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
  body += `<path d="M24,60 Q125,112 226,60 L226,64 Q125,118 24,64 Z" fill="#eef4f9" stroke="${INK}" stroke-width="${LINE}" stroke-linejoin="round"/>`;
  // Cords to the posts.
  body += `<circle cx="24" cy="61" r="2.4" fill="${INK}"/><circle cx="226" cy="61" r="2.4" fill="${INK}"/>`;
  // Water running to the low point and dripping.
  body += `<path d="M125,92 L125,108" stroke="${C.know}" stroke-width="1.1" stroke-dasharray="2 2.5"/>`;
  body += `<path d="M107,112 L109,136 L141,136 L143,112" fill="none" stroke="${INK}" stroke-width="${LINE}" stroke-linejoin="round"/><rect x="109.6" y="122" width="31" height="13.5" fill="${C.water}"/>`;
  body += `<path d="M10,137 L240,137" stroke="${C.rule}" stroke-width="1"/>`;
  body += leader(78, 83, 78, 100) + text(78, 109, "tarp or sheet", { anchor: "middle" });
  body += leader(143, 125, 166, 125) + text(169, 127.5, "clean container");
  body += text(238, 26, "rain", { anchor: "end", fill: C.know, bold: true });
  return svg(250, 144, body);
}

/** CDC, EPA, WHO and the DWI, quoted beside it: a rolling boil, off the heat to cool on its own, kept clean and covered. */
export function boiling(): Drawing {
  const pot = (x: number, lid: boolean) =>
    `<path d="M${x},40 L${x + 4},78 Q${x + 4},84 ${x + 10},84 L${x + 50},84 Q${x + 56},84 ${x + 56},78 L${x + 60},40" fill="#ffffff" stroke="${INK}" stroke-width="${LINE}" stroke-linejoin="round"/>` +
    `<path d="M${x - 6},44 L${x},44 M${x + 60},44 L${x + 66},44" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>` +
    (lid
      ? `<path d="M${x - 2},38 Q${x + 30},28 ${x + 62},38 Z" fill="#ffffff" stroke="${INK}" stroke-width="${LINE}"/><circle cx="${x + 30}" cy="30" r="2.2" fill="${INK}"/>`
      : "");
  let body = "";
  // 1. Rolling boil.
  body += pot(14, false);
  body += `<rect x="18.5" y="52" width="51" height="31" fill="${C.water}"/>`;
  for (const [cx, cy, r] of [
    [28, 66, 4],
    [40, 58, 5],
    [53, 70, 3.5],
    [61, 60, 4],
    [34, 76, 3],
    [47, 79, 2.5],
  ] as const)
    body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" stroke="${C.know}" stroke-width="0.8"/>`;
  body += `<path d="M24,52 q5,-6 10,0 t10,0 t10,0 t10,0 t10,0" fill="none" stroke="${C.know}" stroke-width="1"/>`;
  for (const x of [26, 44, 62])
    body += `<path d="M${x},96 q-5,-6 0,-10 q5,-4 0,-10" fill="${C.warn}" stroke="${C.warnInk}" stroke-width="0.6" transform="translate(0 4)"/>`;
  body += `<path d="M12,104 L76,104" stroke="${INK}" stroke-width="1.6"/>`;
  // 2. Off the heat, cooling.
  body += pot(122, true);
  body += `<rect x="126.5" y="56" width="51" height="27" fill="${C.water}"/>`;
  for (const x of [140, 152, 164])
    body += `<path d="M${x},24 q-4,-6 0,-11 q4,-5 0,-11" fill="none" stroke="${C.muted}" stroke-width="0.8"/>`;
  body += `<path d="M118,104 L186,104" stroke="${INK}" stroke-width="1.6"/>`;
  // 3. Kept in a clean, covered container.
  body += `<rect x="236" y="38" width="44" height="64" rx="5" fill="#ffffff" stroke="${INK}" stroke-width="${LINE}"/><rect x="242" y="30" width="32" height="9" rx="2" fill="${INK}"/><rect x="237" y="56" width="42" height="45" rx="3" fill="${C.water}"/>`;
  body += `<path d="M228,104 L288,104" stroke="${INK}" stroke-width="1.6"/>`;
  // Arrows between.
  body += `<path d="M86,64 L106,64" stroke="${C.muted}" stroke-width="1"/>${arrowHead(110, 64, 0, C.muted)}`;
  body += `<path d="M198,64 L218,64" stroke="${C.muted}" stroke-width="1"/>${arrowHead(222, 64, 0, C.muted)}`;
  // Labels.
  body += text(44, 120, "1  Rolling boil", { anchor: "middle", bold: true }) + text(44, 130, "at least 1 minute", { anchor: "middle" });
  body +=
    text(152, 120, "2  Off the heat", { anchor: "middle", bold: true }) + text(152, 130, "cool on its own, no ice", { anchor: "middle" });
  body +=
    text(258, 120, "3  Keep it clean", { anchor: "middle", bold: true }) + text(258, 130, "clean, covered container", { anchor: "middle" });
  return svg(300, 136, body);
}

// ── First aid ───────────────────────────────────────────────────────────────

/**
 * FEMA's CERT Basic Training (2019), unit 3: "Body: Laid on its side; Bottom Arm:
 * Reached outward; Top Arm: Rest hand on bicep of bottom arm; Head: Rest on hand; Legs:
 * Bent slightly; Chin: Raised forward; and Mouth: Pointed downward." Drawn as a
 * pictogram, a person lying on their side seen from the front, each part labelled with
 * the source's own words.
 */
export function recoveryPosition(): Drawing {
  const near = "#d3dde0";
  const far = "#9fb3b8";
  /** A limb: a thick rounded stroke with an ink outline, so that it reads in grey. */
  const limb = (points: string, width: number, fill: string) =>
    `<polyline points="${points}" fill="none" stroke="${INK}" stroke-width="${width + 2.2}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<polyline points="${points}" fill="none" stroke="${fill}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  let body = "";
  body += `<path d="M8,151 L372,151" stroke="${C.rule}" stroke-width="1.4"/>`;
  // The far side first: the bottom leg, nearly straight, and the bottom arm, reached outward along the ground.
  body += limb("232,141 286,144 336,144", 13, far);
  body += limb("118,141 70,144 26,144", 10, far);
  // The body, laid on its side: shoulders stacked, seen from the front.
  body += `<path d="M112,112 Q112,104 122,104 L222,110 Q238,112 238,126 Q238,146 222,146 L122,146 Q110,146 110,134 Z" fill="${near}" stroke="${INK}" stroke-width="${LINE}" stroke-linejoin="round"/>`;
  // The near side: the top leg, bent slightly, in front.
  body += limb("230,120 280,112 318,141", 14, near);
  // The head rests on the hand; chin forward, mouth down.
  body += `<ellipse cx="84" cy="128" rx="18" ry="16" fill="${near}" stroke="${INK}" stroke-width="${LINE}"/>`;
  body += `<path d="M69,138 q4,3 9,1.5" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/><circle cx="74" cy="124" r="1.4" fill="${INK}"/>`;
  // The top arm, across the front, its hand on the bicep of the bottom arm.
  body += limb("128,116 120,102 100,140", 9, "#e8eef0");
  // Arrows: chin forward, mouth down.
  body += `<path d="M64,122 L50,117" stroke="${C.act}" stroke-width="1.2"/>${arrowHead(46, 115.5, 200, C.act)}`;
  body += `<path d="M72,142 L70,150" stroke="${C.act}" stroke-width="1.2"/>${arrowHead(69.4, 154, 100, C.act)}`;
  // Labels, in the source's words.
  const label = (x1: number, y1: number, x2: number, y2: number, words: string, anchor: "start" | "end" = "start") =>
    leader(x1, y1, x2, y2) + text(anchor === "start" ? x2 + 3 : x2 - 3, y2 + 2.6, words, { anchor });
  body += label(180, 106, 180, 70, "Body: laid on its side");
  body += label(286, 113, 300, 86, "Legs: bent slightly");
  body += label(88, 112, 96, 56, "Head: rests on hand");
  body += label(44, 115, 30, 92, "Chin: raised forward");
  body += label(30, 145, 22, 172, "Bottom arm: reached outward");
  body += label(70, 153, 92, 186, "Mouth: pointed downward");
  body += label(110, 128, 150, 172, "Top arm: hand on bicep of bottom arm");
  return svg(380, 194, body);
}

/**
 * The NHS website's words on chest compressions for a child: "Place the heel of 1 hand
 * over the lower third of the breastbone"; for a baby under 1, "the tips of 2 fingers"
 * on the breastbone; "approximately one-third of the chest depth". Two chests, front on.
 */
export function chestCompressions(): Drawing {
  const chest = (x: number, scale: number) => {
    const w = 104 * scale;
    const h = 120 * scale;
    const cx = x + w / 2;
    const top = 14;
    // A torso from the front: neck, shoulders sloping out, sides narrowing a little to the waist.
    const neck = 13 * scale;
    let out = `<path d="M${cx - neck},${top} Q${cx - neck},${top + 10 * scale} ${x + 10 * scale},${top + 14 * scale} Q${x},${top + 18 * scale} ${x + 2 * scale},${top + 34 * scale} L${x + 10 * scale},${top + h} L${x + w - 10 * scale},${top + h} L${x + w - 2 * scale},${top + 34 * scale} Q${x + w},${top + 18 * scale} ${x + w - 10 * scale},${top + 14 * scale} Q${cx + neck},${top + 10 * scale} ${cx + neck},${top}" fill="#f2f5f6" stroke="${INK}" stroke-width="${LINE}" stroke-linejoin="round"/>`;
    // Ribs, faint, curving out and down from the breastbone.
    for (let index = 0; index < 5; index += 1) {
      const y = top + 30 * scale + index * 13 * scale;
      out += `<path d="M${cx - 7},${y} Q${cx - 30 * scale},${y - 2 * scale} ${x + 12 * scale},${y + 10 * scale}" fill="none" stroke="${C.rule}" stroke-width="0.9"/>`;
      out += `<path d="M${cx + 7},${y} Q${cx + 30 * scale},${y - 2 * scale} ${x + w - 12 * scale},${y + 10 * scale}" fill="none" stroke="${C.rule}" stroke-width="0.9"/>`;
    }
    // The breastbone in thirds, the lower third marked.
    const length = 70 * scale;
    const bone = top + 22 * scale;
    out += `<rect x="${cx - 5}" y="${bone}" width="10" height="${length}" rx="3" fill="#ffffff" stroke="${INK}" stroke-width="0.9"/>`;
    out += `<rect x="${cx - 5}" y="${bone + (length * 2) / 3}" width="10" height="${length / 3}" rx="2" fill="${C.act}"/>`;
    out += `<path d="M${cx - 7},${bone + length / 3} L${cx + 7},${bone + length / 3} M${cx - 7},${bone + (length * 2) / 3} L${cx + 7},${bone + (length * 2) / 3}" stroke="${INK}" stroke-width="0.6"/>`;
    return { out, cx, lower: bone + (length * 5) / 6, upper: bone + length / 6, w };
  };
  let body = "";
  const child = chest(14, 1.1);
  body += child.out;
  // The heel of one hand, over the lower third.
  body += `<ellipse cx="${child.cx}" cy="${child.lower}" rx="16" ry="11" fill="none" stroke="${C.act}" stroke-width="1.4" stroke-dasharray="3 2"/>`;
  body +=
    leader(child.cx + 16, child.lower, 150, child.lower) +
    text(153, child.lower - 4, "heel of 1 hand,", { bold: true }) +
    text(153, child.lower + 5.5, "lower third of the breastbone");
  body += leader(child.cx + 5, child.upper, 150, child.upper) + text(153, child.upper + 2.5, "breastbone");
  body +=
    text(child.cx, 160, "Child over 1", { anchor: "middle", bold: true }) + text(child.cx, 170, "push down 5 cm", { anchor: "middle" });
  const baby = chest(262, 0.74);
  body += baby.out;
  body += `<circle cx="${baby.cx - 3.4}" cy="${baby.lower}" r="3.2" fill="none" stroke="${C.act}" stroke-width="1.3"/><circle cx="${baby.cx + 3.4}" cy="${baby.lower}" r="3.2" fill="none" stroke="${C.act}" stroke-width="1.3"/>`;
  body +=
    leader(baby.cx + 7, baby.lower, 346, baby.lower) +
    text(349, baby.lower - 4, "tips of 2 fingers", { bold: true }) +
    text(349, baby.lower + 5.5, "on the breastbone");
  body += text(baby.cx, 160, "Baby under 1", { anchor: "middle", bold: true }) + text(baby.cx, 170, "push down 4 cm", { anchor: "middle" });
  body += text(212, 184, "Both: about one-third of the chest depth, 100 to 120 a minute", { anchor: "middle", fill: C.muted });
  return svg(424, 190, body);
}
