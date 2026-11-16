/**
 * A recording as GPX 1.1, built on the device. It is what is sent to Outpost when the
 * recording is saved, and what "Download GPX" hands over when Outpost cannot be
 * reached, so the same file serves both and the walk can always be got off the phone.
 *
 * One track; one segment for each stretch between pauses or interruptions, which is
 * what a segment is for in GPX. A stretch of a single point is left out: one point is
 * not a line, and the server would drop it.
 */
import type { RecordedPoint } from "./track-log";

/** Text made safe inside an XML element. Characters XML 1.0 forbids are dropped. */
export function escapeXml(value: string): string {
  return (
    value
      // biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the point
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  );
}

/** The instant as GPX writes it: UTC, to the second, or to the millisecond when there are any. */
export function gpxTime(time: number): string {
  return new Date(time).toISOString().replace(".000Z", "Z");
}

export interface BuiltGpx {
  gpx: string;
  /** Points written, which leaves out any stretch of a single point. */
  points: number;
  segments: number;
}

export function buildRecordingGpx(name: string, points: Iterable<RecordedPoint>): BuiltGpx {
  const segments: RecordedPoint[][] = [];
  let current: RecordedPoint[] | undefined;
  let segment: number | undefined;
  for (const point of points) {
    if (!current || point.segment !== segment) {
      current = [];
      segment = point.segment;
      segments.push(current);
    }
    current.push(point);
  }
  const lines = segments.filter((line) => line.length >= 2);
  const first = lines[0]?.[0];
  const safeName = escapeXml(name);

  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<gpx version="1.1" creator="Outpost" xmlns="http://www.topografix.com/GPX/1/1">\n',
    `  <metadata>\n    <name>${safeName}</name>\n${first ? `    <time>${gpxTime(first.time)}</time>\n` : ""}  </metadata>\n`,
  ];
  let written = 0;
  if (lines.length > 0) {
    parts.push(`  <trk>\n    <name>${safeName}</name>\n`);
    for (const line of lines) {
      parts.push("    <trkseg>\n");
      for (const point of line) {
        // toFixed never writes an exponent for numbers this size, which GPX does not allow.
        const height = point.ele === null ? "" : `<ele>${point.ele.toFixed(1)}</ele>`;
        parts.push(
          `      <trkpt lat="${point.lat.toFixed(6)}" lon="${point.lon.toFixed(6)}">${height}<time>${gpxTime(point.time)}</time></trkpt>\n`,
        );
        written += 1;
      }
      parts.push("    </trkseg>\n");
    }
    parts.push("  </trk>\n");
  }
  parts.push("</gpx>\n");
  return { gpx: parts.join(""), points: written, segments: lines.length };
}

/** A name fit for a downloaded file. */
export function gpxFileName(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N} _.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${cleaned || "recording"}.gpx`;
}
