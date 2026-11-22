/**
 * Drawings for the templates' page of instructions, each showing what its steps say and
 * no more: the gnomon standing on the dial at the latitude's angle (the gnomon's sloping
 * edge points to the pole of the sky), finding true north from a stick's shadow (the
 * shortest shadow, through the middle of the day), and sighting the nocturnal (Polaris
 * through the centre, the arm through the Plough's two pointer stars). Schematic: the
 * gnomon's angle is the latitude; nothing else is to scale.
 */
import { PRINT_COLOURS as C, type Drawing, drawing, round, svgArrowHead, svgLeader, svgText } from "@/features/print-kit";

const DEG = Math.PI / 180;

/** The gnomon seen from the side, standing on the level dial, its edge rising at the latitude towards the pole. */
export function gnomonSide(latitude: number, width = 240, height = 160): Drawing {
  const lat = Math.min(80, Math.max(5, Math.abs(latitude)));
  const pole = latitude >= 0 ? "north" : "south";
  const ground = height - 34;
  const left = 46;
  const base = Math.min(124, (ground - 30) / Math.tan(lat * DEG));
  const rise = base * Math.tan(lat * DEG);
  const tipX = left + base;
  const tipY = ground - rise;
  let body = "";
  // The dial plate.
  body += `<rect x="16" y="${ground}" width="${width - 32}" height="7" fill="${C.accentSoft}" stroke="${C.accent}" stroke-width="0.8"/>`;
  body += svgText(20, ground + 18, "Dial plate, level", { size: 7, fill: C.muted });
  // The gnomon.
  body += `<path d="M${left},${ground} L${round(tipX)},${ground} L${round(tipX)},${round(tipY)} Z" fill="${C.accentSoft}" stroke="${C.ink}" stroke-width="0.8"/>`;
  body += `<line x1="${left}" y1="${ground}" x2="${round(tipX)}" y2="${round(tipY)}" stroke="${C.accent}" stroke-width="2"/>`;
  // On along the edge to the pole of the sky.
  const reach = Math.min(70, (tipY - 26) / Math.sin(lat * DEG), (width - 10 - tipX) / Math.cos(lat * DEG));
  const endX = tipX + Math.cos(lat * DEG) * reach;
  const endY = tipY - Math.sin(lat * DEG) * reach;
  body += `<line x1="${round(tipX)}" y1="${round(tipY)}" x2="${round(endX)}" y2="${round(endY)}" stroke="${C.accent}" stroke-width="0.9" stroke-dasharray="3 2"/>`;
  body += svgArrowHead(endX, endY, -lat, C.accent, 6);
  body += svgText(width - 4, 10, `Towards the ${pole}`, { size: 7, fill: C.accent, anchor: "end", bold: true });
  body += svgText(width - 4, 19, "pole of the sky", { size: 7, fill: C.accent, anchor: "end", bold: true });
  // The angle at the low corner.
  const arc = 26;
  body += `<path d="M${left + arc},${ground} A${arc},${arc} 0 0 0 ${round(left + arc * Math.cos(lat * DEG))},${round(ground - arc * Math.sin(lat * DEG))}" fill="none" stroke="${C.act}" stroke-width="1"/>`;
  body += svgText(left + arc + 3, ground - 4, `${Math.abs(latitude).toFixed(1)}°`, { size: 7.5, bold: true, fill: C.act });
  body += svgText(left - 4, ground - 3, "Centre", { size: 6.5, fill: C.muted, anchor: "end" });
  // Which way.
  body += `<line x1="${width - 80}" y1="${ground + 22}" x2="${width - 22}" y2="${ground + 22}" stroke="${C.ink}" stroke-width="0.9"/>`;
  body += svgArrowHead(width - 18, ground + 22, 0, C.ink, 5);
  body += svgText(width - 22, ground + 31, `True ${pole}`, { size: 7, anchor: "end", bold: true });
  return drawing(width, height, body);
}

/** A stick's shadow through the middle of the day: the tip marked every 15 minutes, the shortest pointing to the pole. */
export function findNorth(latitude: number, width = 240, height = 160): Drawing {
  const pole = latitude >= 0 ? "north" : "south";
  const footX = width / 2;
  const footY = height - 28;
  let body = "";
  const marks: Array<[number, number]> = [];
  for (let step = -4; step <= 4; step += 1) {
    const dx = step * 22;
    marks.push([footX + dx, 70 - 0.0055 * dx * dx]);
  }
  for (const [x, y] of marks)
    body += `<line x1="${footX}" y1="${footY}" x2="${round(x)}" y2="${round(y)}" stroke="${C.rule}" stroke-width="0.7"/>`;
  body += `<polyline points="${marks.map(([x, y]) => `${round(x)},${round(y)}`).join(" ")}" fill="none" stroke="${C.muted}" stroke-width="0.6" stroke-dasharray="2 2"/>`;
  for (const [x, y] of marks) body += `<circle cx="${round(x)}" cy="${round(y)}" r="2.2" fill="${C.warn}"/>`;
  // The shortest shadow, to the nearest mark.
  const [nx, ny] = marks[4]!;
  body += `<line x1="${footX}" y1="${footY}" x2="${round(nx)}" y2="${round(ny + 4)}" stroke="${C.accent}" stroke-width="2"/>`;
  body += svgArrowHead(nx, ny + 2, -90, C.accent, 6);
  body += `<rect x="${round(nx + 5)}" y="${round(ny + 22)}" width="96" height="11" fill="#ffffff"/>`;
  body += svgText(nx + 7, ny + 30, `Nearest mark: true ${pole}`, { size: 7.5, bold: true, fill: C.accent });
  body += svgText(width / 2, 10, "The tip of the shadow, every 15 minutes", { size: 7, fill: C.warnInk, anchor: "middle" });
  body += `<circle cx="${footX}" cy="${footY}" r="3" fill="${C.ink}"/>`;
  body += svgText(footX, footY + 14, "Foot of the upright stick", { size: 7, anchor: "middle", fill: C.muted });
  return drawing(width, height, body);
}

/** The nocturnal held up by its handle: Polaris through the centre, the arm through the Plough's pointer stars. */
export function nocturnalSighting(width = 240, height = 190): Drawing {
  const cx = 86;
  const cy = 104;
  let body = "";
  // The handle, straight down, then the date disc and the hour disc on it.
  body += `<rect x="${cx - 10}" y="${cy + 44}" width="20" height="${height - cy - 52}" fill="${C.shade}" stroke="${C.muted}" stroke-width="0.8"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="50" fill="${C.shade}" stroke="${C.muted}" stroke-width="0.8"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="37" fill="${C.accentSoft}" stroke="${C.accent}" stroke-width="0.8"/>`;
  // The arm, from the centre out to the pointers in the sky beyond.
  const angle = -36;
  const along = (distance: number): [number, number] => [cx + Math.sin(angle * DEG) * distance, cy - Math.cos(angle * DEG) * distance];
  const [ex, ey] = along(58);
  body += `<line x1="${cx}" y1="${cy}" x2="${round(ex)}" y2="${round(ey)}" stroke="${C.ink}" stroke-width="7" stroke-linecap="round" stroke-opacity="0.18"/>`;
  const [ax, ay] = along(112);
  body += `<line x1="${cx}" y1="${cy}" x2="${round(ax)}" y2="${round(ay)}" stroke="${C.act}" stroke-width="1"/>`;
  const star = (x: number, y: number, r: number) =>
    `<circle cx="${round(x)}" cy="${round(y)}" r="${r}" fill="${C.warn}" stroke="${C.warnInk}" stroke-width="0.6"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="#ffffff" stroke="${C.ink}" stroke-width="0.8"/>`;
  body += star(cx, cy, 2.4);
  const [dx, dy] = along(80);
  const [mx, my] = along(100);
  body += star(dx, dy, 3);
  body += star(mx, my, 3);
  body += svgText(dx + 7, dy + 3, "Dubhe", { size: 7.5, bold: true, fill: C.warnInk });
  body += svgText(mx + 7, my + 3, "Merak", { size: 7.5, bold: true, fill: C.warnInk });
  body += svgText(4, 9, "The arm's centre line, through the pointers", { size: 7, fill: C.act, bold: true });
  // Leaders out to the right for the rest.
  const right = cx + 62;
  body += svgLeader(cx + 3, cy - 2, right - 3, cy - 14, C.ink);
  body += svgText(right, cy - 16, "Polaris, through", { size: 7, bold: true });
  body += svgText(right, cy - 7, "the centre hole", { size: 7, bold: true });
  body += svgLeader(cx + 26, cy + 26, right - 3, cy + 22, C.accent);
  body += svgText(right, cy + 25, "Hour disc", { size: 7, fill: C.accent });
  body += svgLeader(cx + 40, cy + 30, right - 3, cy + 38, C.muted);
  body += svgText(right, cy + 41, "Date disc", { size: 7, fill: C.muted });
  body += svgLeader(cx + 8, height - 16, right - 3, height - 16, C.muted);
  body += svgText(right, height - 13, "Handle, held", { size: 7, fill: C.muted });
  body += svgText(right, height - 4, "straight down", { size: 7, fill: C.muted });
  return drawing(width, height, body);
}
