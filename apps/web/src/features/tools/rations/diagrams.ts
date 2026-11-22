/**
 * The ration sheet's drawing: each person's daily share of the stock against their need,
 * as `shareByNeed` works them out. A bar the length of the need, filled as far as the
 * share goes; those kept on a full ration marked. Nothing but the sheet's own figures.
 */
import type { ShareLine } from "@outpost/shared";
import { PRINT_COLOURS as C, type Drawing, drawing, round, svgText } from "@/features/print-kit";

const whole = (value: number) => Math.round(value).toLocaleString("en-GB");

export function shareBars(lines: Array<ShareLine & { kept: boolean }>, width: number): Drawing {
  const nameWidth = 96;
  const figureWidth = 110;
  const barLeft = nameWidth;
  const barRight = width - figureWidth;
  const most = Math.max(1, ...lines.map((line) => line.need));
  const scale = (kcal: number) => ((barRight - barLeft) * kcal) / most;
  const pitch = 24;
  let body = "";
  lines.forEach((line, index) => {
    const y = 6 + index * pitch;
    const name = line.name || "Someone";
    body += svgText(0, y + 11, name.length > 18 ? `${name.slice(0, 17)}.` : name, { bold: true, size: 8 });
    if (line.kept) body += svgText(0, y + 19, "kept on full", { size: 6.5, fill: C.accent });
    // The need, outlined; the share, filled.
    body += `<rect x="${barLeft}" y="${y + 2}" width="${round(scale(line.need))}" height="14" fill="#ffffff" stroke="${C.muted}" stroke-width="0.8" stroke-dasharray="3 2"/>`;
    const short = line.ofNeed < 0.999;
    body += `<rect x="${barLeft}" y="${y + 2}" width="${round(scale(line.kcal))}" height="14" fill="${short ? C.warn : C.accent}"/>`;
    body += svgText(barRight + 8, y + 9, `${whole(line.kcal)} of ${whole(line.need)} kcal`, { size: 7.5 });
    body += svgText(barRight + 8, y + 18, `${Math.round(line.ofNeed * 100)}% of their need`, {
      size: 6.8,
      fill: short ? C.warnInk : C.muted,
      bold: short,
    });
  });
  const keyY = 6 + lines.length * pitch + 12;
  body += `<rect x="${barLeft}" y="${keyY - 7}" width="12" height="8" fill="${C.accent}"/>`;
  body += svgText(barLeft + 16, keyY, "Their whole need", { size: 7 });
  body += `<rect x="${barLeft + 92}" y="${keyY - 7}" width="12" height="8" fill="${C.warn}"/>`;
  body += svgText(barLeft + 108, keyY, "Less than their need", { size: 7 });
  body += `<rect x="${barLeft + 196}" y="${keyY - 7}" width="12" height="8" fill="#ffffff" stroke="${C.muted}" stroke-width="0.8" stroke-dasharray="3 2"/>`;
  body += svgText(barLeft + 212, keyY, "Their need a day", { size: 7 });
  return drawing(width, keyY + 4, body);
}
