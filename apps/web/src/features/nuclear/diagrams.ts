/**
 * Drawings for a scenario's printed pages, each showing only what the words it stands
 * beside already say:
 *
 * - `shelterDiagram`: where to shelter, in the UK Health Security Agency's words that
 *   the radiation emergency template carries (the workspace's planning section makes
 *   plans from it). Its order is theirs: vehicles and tents "do not provide sufficient
 *   shelter", "being inside any building is better than being outside", brick, stone or
 *   concrete "provide the best protection", and "the middle of the building away from
 *   external doors, windows and walls". It draws no protection factor: none is cited.
 * - `decayDiagram`: Glasstone and Dolan's rule as the workspace states it, dose rates
 *   falling "roughly tenfold for every sevenfold increase in time after the burst"
 *   (§ 9.16): at 1, 7, 49 and 343 hours after the burst.
 * - `reachDiagram`: how far upwind and downwind each idealised contour reaches (Table
 *   9.93, scaled for the wind), the figures in the scenario's own table.
 *
 * When fallout arrives is not drawn: the workspace cites no figure for it.
 */
import { type FalloutContour, templateStep } from "@outpost/shared";
import { PRINT_COLOURS as C, type Drawing, drawing, round, svgArrowHead, svgText } from "@/features/print-kit";
import { distanceText } from "./words";

/** The template's words each part of the shelter drawing shows, by step. */
export const SHELTER_STEPS = {
  vehicles: "radiation.during.4",
  buildings: "radiation.during.2",
  middle: "radiation.during.6",
} as const;

export const shelterQuote = (key: keyof typeof SHELTER_STEPS): string => templateStep(SHELTER_STEPS[key])?.step.quote ?? "";

const person = (x: number, ground: number, colour: string = C.ink) =>
  `<circle cx="${round(x)}" cy="${round(ground - 25)}" r="3.6" fill="${colour}"/><path d="M${round(x)},${round(ground - 21)} L${round(x)},${round(ground - 10)} M${round(x - 5)},${round(ground - 17)} L${round(x + 5)},${round(ground - 17)} M${round(x)},${round(ground - 10)} L${round(x - 4)},${round(ground)} M${round(x)},${round(ground - 10)} L${round(x + 4)},${round(ground)}" stroke="${colour}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;

/** Where to shelter: not enough, better than outside, the best protection. */
export function shelterDiagram(width: number): Drawing {
  const ground = 112;
  const height = 168;
  const third = width / 3;
  let body = "";
  // Fallout falling across the top, faint, on all three.
  for (let index = 0; index < 34; index += 1) {
    const x = 8 + ((index * 37) % Math.round(width - 16));
    const y = 6 + ((index * 23) % 26);
    body += `<circle cx="${x}" cy="${y}" r="1.1" fill="${C.muted}"/>`;
  }
  body += `<line x1="0" y1="${ground}" x2="${width}" y2="${ground}" stroke="${C.ink}" stroke-width="1.4"/>`;

  // 1. Not enough: in the open, a car, a tent.
  const a = 0;
  body += person(a + 22, ground);
  body += `<path d="M${a + 44},${ground - 4} L${a + 48},${ground - 16} L${a + 62},${ground - 24} L${a + 88},${ground - 24} L${a + 98},${ground - 16} L${a + 104},${ground - 14} L${a + 104},${ground - 4} Z" fill="#ffffff" stroke="${C.ink}" stroke-width="1.2" stroke-linejoin="round"/>`;
  body += `<circle cx="${a + 58}" cy="${ground - 4}" r="5" fill="${C.ink}"/><circle cx="${a + 92}" cy="${ground - 4}" r="5" fill="${C.ink}"/>`;
  body += `<path d="M${a + 112},${ground} L${a + 132},${ground - 30} L${a + 152},${ground} Z" fill="#ffffff" stroke="${C.ink}" stroke-width="1.2" stroke-linejoin="round"/><path d="M${a + 132},${ground - 30} L${a + 132},${ground}" stroke="${C.ink}" stroke-width="0.8"/>`;
  body += `<rect x="${a + 4}" y="${ground + 8}" width="${round(third - 12)}" height="20" rx="3" fill="${C.actSoft}" stroke="${C.act}" stroke-width="1"/>`;
  body += svgText(a + 4 + (third - 12) / 2, ground + 21.5, "Not enough shelter", { anchor: "middle", bold: true, size: 8, fill: C.act });
  body += svgText(a + 4, ground + 40, "Outside, in a vehicle or a tent", { size: 7, fill: C.ink });

  // 2. Any building: a plain house outline, someone inside.
  const b = third;
  body += `<path d="M${b + 30},${ground} L${b + 30},${ground - 44} L${b + 70},${ground - 74} L${b + 110},${ground - 44} L${b + 110},${ground} Z" fill="#ffffff" stroke="${C.ink}" stroke-width="1.2" stroke-linejoin="round"/>`;
  body += `<rect x="${b + 37}" y="${ground - 41}" width="12" height="10" fill="${C.knowSoft}" stroke="${C.ink}" stroke-width="0.8"/><rect x="${b + 91}" y="${ground - 26}" width="12" height="26" fill="#ffffff" stroke="${C.ink}" stroke-width="0.8"/>`;
  body += person(b + 68, ground);
  body += `<rect x="${b + 4}" y="${ground + 8}" width="${round(third - 12)}" height="20" rx="3" fill="${C.warnSoft}" stroke="${C.warn}" stroke-width="1"/>`;
  body += svgText(b + 4 + (third - 12) / 2, ground + 21.5, "Better than outside", {
    anchor: "middle",
    bold: true,
    size: 8,
    fill: C.warnInk,
  });
  body += svgText(b + 4, ground + 40, "Inside any building", { size: 7, fill: C.ink });

  // 3. Brick, stone or concrete, in the middle, away from doors, windows and walls.
  const c = third * 2;
  const left = c + 14;
  const right = c + third - 14;
  const top = ground - 78;
  body += `<rect x="${round(left)}" y="${top}" width="${round(right - left)}" height="78" fill="#efe3d6" stroke="${C.ink}" stroke-width="1.2"/>`;
  // Brick courses in the walls.
  for (let row = 0; row < 13; row += 1) {
    const y = top + 3 + row * 6;
    body += `<line x1="${round(left)}" y1="${y}" x2="${round(left + 12)}" y2="${y}" stroke="#b9876b" stroke-width="0.6"/><line x1="${round(right - 12)}" y1="${y}" x2="${round(right)}" y2="${y}" stroke="#b9876b" stroke-width="0.6"/>`;
  }
  body += `<rect x="${round(left + 12)}" y="${top + 8}" width="${round(right - left - 24)}" height="70" fill="#ffffff"/>`;
  // Windows in the outer walls.
  body += `<rect x="${round(left - 1)}" y="${top + 22}" width="13" height="16" fill="${C.knowSoft}" stroke="${C.ink}" stroke-width="0.8"/><rect x="${round(right - 12)}" y="${top + 22}" width="13" height="16" fill="${C.knowSoft}" stroke="${C.ink}" stroke-width="0.8"/>`;
  // The middle, shaded, with a person in it.
  const mid = (left + right) / 2;
  body += `<rect x="${round(mid - 26)}" y="${top + 24}" width="52" height="54" fill="${C.accentSoft}" stroke="${C.accent}" stroke-width="1" stroke-dasharray="3 2"/>`;
  body += person(mid, ground, C.accent);
  body += `<rect x="${round(c + 4)}" y="${ground + 8}" width="${round(third - 8)}" height="20" rx="3" fill="${C.accentSoft}" stroke="${C.accent}" stroke-width="1"/>`;
  body += svgText(c + 4 + (third - 8) / 2, ground + 21.5, "The best protection", { anchor: "middle", bold: true, size: 8, fill: C.accent });
  body += svgText(c + 4, ground + 40, "Brick, stone or concrete; in the middle,", { size: 7, fill: C.ink });
  body += svgText(c + 4, ground + 49, "away from doors, windows and walls", { size: 7, fill: C.ink });

  // Less to more, along the bottom.
  body += `<line x1="8" y1="${height - 6}" x2="${round(width - 14)}" y2="${height - 6}" stroke="${C.muted}" stroke-width="1"/>${svgArrowHead(width - 8, height - 6, 0, C.muted)}`;
  return drawing(width, height, body);
}

const hourWords = [
  { hours: 1, words: "1 hour", share: "the rate at 1 hour" },
  { hours: 7, words: "7 hours", share: "about a tenth" },
  { hours: 49, words: "49 hours (2 days)", share: "about a hundredth" },
  { hours: 343, words: "343 hours (2 weeks)", share: "about a thousandth" },
];

/** The rule of seven and ten: each sevenfold step in time, the dose rate about a tenth. `rate` puts a contour's figures beside it. */
export function decayDiagram(width: number, rate: number | null): Drawing {
  const height = 150;
  const baseline = 112;
  const left = 2;
  const pitch = (width - left) / hourWords.length;
  const barWidth = Math.min(64, pitch * 0.55);
  let body = "";
  hourWords.forEach((step, index) => {
    // A step down of the same height for each tenth: the scale is of tens, and says so.
    const barHeight = 78 - index * 22;
    const x = left + index * pitch;
    const top = baseline - barHeight;
    body += `<rect x="${round(x)}" y="${top}" width="${round(barWidth)}" height="${barHeight}" fill="${C.warn}" fill-opacity="${round(1 - index * 0.2)}"/>`;
    body += svgText(x, top - (rate !== null ? 14 : 5), step.share, { size: 7.5, bold: index === 0 });
    if (rate !== null) body += svgText(x, top - 5, `${(rate / 10 ** index).toLocaleString("en-GB")} rads/h`, { size: 7, fill: C.warnInk });
    body += svgText(x, baseline + 12, step.words, { size: 7.5, bold: true });
    body += svgText(x, baseline + 21, "after the burst", { size: 6.5, fill: C.muted });
  });
  body += `<line x1="0" y1="${baseline}" x2="${width}" y2="${baseline}" stroke="${C.ink}" stroke-width="1"/>`;
  body += svgText(0, height - 4, "Each step down is a tenth: the bars are drawn on a scale of tens, not to scale.", {
    size: 6.8,
    fill: C.muted,
  });
  return drawing(width, height, body);
}

/** How far each contour reaches upwind and downwind of ground zero, to one scale. */
export function reachDiagram(contours: FalloutContour[], width: number): Drawing {
  const sorted = [...contours].sort((a, b) => b.rate - a.rate);
  const labelWidth = 88;
  const plotLeft = labelWidth;
  const plotRight = width - 10;
  const most = Math.max(1, ...sorted.map((contour) => contour.downwindM));
  const upMost = Math.max(0, ...sorted.map((contour) => contour.upwindM));
  const span = most + upMost;
  const x = (metres: number) => plotLeft + ((metres + upMost) / span) * (plotRight - plotLeft);
  const pitch = 22;
  const top = 18;
  let body = "";
  body += svgText(x(0), 9, "Ground zero", { anchor: "middle", size: 7, bold: true });
  body += svgText(plotRight, 9, "Downwind", { anchor: "end", size: 7, fill: C.muted });
  sorted.forEach((contour, index) => {
    const y = top + index * pitch;
    const shade = round(0.85 - index * (0.6 / Math.max(1, sorted.length - 1)));
    body += svgText(0, y + 10, `${contour.rate.toLocaleString("en-GB")} rads/h`, { size: 7.5, bold: true });
    body += `<rect x="${round(x(-contour.upwindM))}" y="${y + 2}" width="${round(x(contour.downwindM) - x(-contour.upwindM))}" height="11" rx="5.5" fill="${C.warn}" fill-opacity="${shade}"/>`;
    const words = distanceText(contour.downwindM);
    const end = x(contour.downwindM);
    const inside = end - x(0) > words.length * 3.8 + 10;
    body += svgText(inside ? end - 6 : end + 4, y + 10.5, words, {
      anchor: inside ? "end" : "start",
      size: 6.8,
      fill: inside ? "#ffffff" : C.ink,
      bold: inside,
    });
  });
  const bottom = top + sorted.length * pitch;
  body += `<line x1="${round(x(0))}" y1="${top - 4}" x2="${round(x(0))}" y2="${bottom}" stroke="${C.ink}" stroke-width="1" stroke-dasharray="2 2"/>`;
  return drawing(width, bottom + 4, body);
}
