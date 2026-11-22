/**
 * The safe-cooking sheet's drawing: the FSA's and FSS's temperatures on one scale, and
 * nothing else. The Danger Zone ("between 8 - 63°C", FSA), the FSA's five temperatures
 * for the middle of the food with the time each must be held, and FSS's 75°C in the
 * thickest part of a bird. Every figure is one safety.ts quotes.
 */
import { PRINT_COLOURS as C, type Drawing, drawing, round, svgLeader, svgText } from "@/features/print-kit";
import { FSA_TIME_TEMPERATURE } from "./safety";

/** The Danger Zone's ends, from the FSA's words quoted in safety.ts. */
export const DANGER_ZONE = { from: 8, to: 63 } as const;
/** FSS: "Check the thickest part of the bird (between the breast and the thigh) reaches 75°C or above". */
export const BIRD_CELSIUS = 75;

export function temperatureScale(width: number): Drawing {
  const left = 14;
  const right = width - 14;
  const x = (celsius: number) => left + (celsius / 100) * (right - left);
  const tubeTop = 52;
  const tubeHeight = 16;
  const mid = tubeTop + tubeHeight / 2;
  let body = "";

  // The tube, the Danger Zone in it, and the bulb.
  body += `<rect x="${left}" y="${tubeTop}" width="${round(right - left)}" height="${tubeHeight}" rx="8" fill="#ffffff" stroke="${C.ink}" stroke-width="1"/>`;
  body += `<rect x="${round(x(DANGER_ZONE.from))}" y="${tubeTop + 1}" width="${round(x(DANGER_ZONE.to) - x(DANGER_ZONE.from))}" height="${tubeHeight - 2}" fill="${C.warnSoft}"/>`;
  for (let at = x(DANGER_ZONE.from) + 4; at < x(DANGER_ZONE.to); at += 6)
    body += `<line x1="${round(at)}" y1="${tubeTop + 2}" x2="${round(at - 5)}" y2="${tubeTop + tubeHeight - 2}" stroke="${C.warn}" stroke-width="0.6"/>`;
  for (const end of [DANGER_ZONE.from, DANGER_ZONE.to])
    body += `<line x1="${round(x(end))}" y1="${tubeTop - 4}" x2="${round(x(end))}" y2="${tubeTop + tubeHeight + 4}" stroke="${C.warnInk}" stroke-width="1.2"/>`;

  // The Danger Zone's words above it.
  body += svgText(
    (x(DANGER_ZONE.from) + x(DANGER_ZONE.to)) / 2,
    tubeTop - 8,
    `The Danger Zone: between ${DANGER_ZONE.from} - ${DANGER_ZONE.to}°C (FSA)`,
    {
      anchor: "middle",
      bold: true,
      size: 7.5,
      fill: C.warnInk,
    },
  );
  // The bird's figure above, at its own height.
  body += `<line x1="${round(x(BIRD_CELSIUS))}" y1="22" x2="${round(x(BIRD_CELSIUS))}" y2="${tubeTop}" stroke="${C.act}" stroke-width="1.2"/>`;
  body += `<circle cx="${round(x(BIRD_CELSIUS))}" cy="${mid}" r="3.4" fill="${C.act}"/>`;
  body += svgText(x(BIRD_CELSIUS) + 4, 18, `${BIRD_CELSIUS}°C or above in the thickest part of a bird (FSS)`, {
    anchor: "end",
    bold: true,
    size: 7.5,
    fill: C.act,
  });

  // The scale under the tube.
  for (let celsius = 0; celsius <= 100; celsius += 10) {
    const at = round(x(celsius));
    body += `<line x1="${at}" y1="${tubeTop + tubeHeight}" x2="${at}" y2="${tubeTop + tubeHeight + 3}" stroke="${C.muted}" stroke-width="0.6"/>`;
    if (celsius < 50 || celsius > 80)
      body += svgText(at, tubeTop + tubeHeight + 11, `${celsius}°C`, { anchor: "middle", size: 6.5, fill: C.muted });
  }

  // The FSA's five pairs: each temperature's tick, led down to its time.
  const labelLeft = x(28);
  const step = (right - 22 - labelLeft) / (FSA_TIME_TEMPERATURE.length - 1);
  FSA_TIME_TEMPERATURE.forEach((row, index) => {
    const at = x(row.celsius);
    const labelX = labelLeft + index * step;
    const main = row.celsius === 70;
    body += `<line x1="${round(at)}" y1="${tubeTop}" x2="${round(at)}" y2="${tubeTop + tubeHeight}" stroke="${C.accent}" stroke-width="${main ? 2 : 1.1}"/>`;
    body += svgLeader(at, tubeTop + tubeHeight + 2, labelX, tubeTop + tubeHeight + 26, C.accent);
    body += svgText(labelX, tubeTop + tubeHeight + 36, `${row.celsius}°C`, {
      anchor: "middle",
      bold: true,
      size: main ? 9 : 8,
      fill: C.accent,
    });
    body += svgText(labelX, tubeTop + tubeHeight + 46, `for ${row.time}`, { anchor: "middle", size: 7, fill: C.ink });
  });
  body += svgText(left, tubeTop + tubeHeight + 64, "In the middle of the food, the FSA's temperature and the time it must be held there.", {
    size: 7,
    fill: C.muted,
  });
  return drawing(width, tubeTop + tubeHeight + 70, body);
}
