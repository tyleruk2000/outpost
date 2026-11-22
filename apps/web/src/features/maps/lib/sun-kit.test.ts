/** Sun times on paper with the print kit: the same rows as the old sheet, and a chart of the light through the span. */
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { contentText, renderPdf } from "@/features/print-kit";
import { writeSample } from "@/features/print-kit/samples";
import { sunDay } from "./sun";
import { dayCells, type SunSheetInput } from "./sun-document";
import { lightChart, sunKitDocument } from "./sun-kit";

const observatory: SunSheetInput = {
  place: { name: "Royal Observatory", lat: 51.4769, lon: -0.0005, coordinates: "51°28′37″N 0°00′02″W" },
  date: "2026-11-16",
  span: "month",
  zone: "Europe/London",
  utc: false,
  style: "24",
  made: "2026-11-16",
};

const pdfText = async (bytes: Uint8Array) => {
  const pdf = await getDocument({ data: bytes.slice() }).promise;
  let text = "";
  for (let page = 1; page <= pdf.numPages; page += 1)
    text += `${(await (await pdf.getPage(page)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join(" ")}\n`;
  return text;
};

describe("sun times sheet on the print kit", () => {
  it("writes the same day's times as the old sheet, with the chart and what the times assume", () => {
    const words = contentText(sunKitDocument(observatory, "a4").content);
    const cells = dayCells(sunDay(51.4769, -0.0005, "2026-11-16"), "Europe/London", { style: "24" });
    expect(words).toContain(`Mon 16 Nov ${cells.join(" ")}`);
    expect(words).toContain("Royal Observatory");
    expect(words).toContain("51°28'37\"N"); // the primes as the typeface writes them
    expect(words).toContain("Light through the days");
    expect(words).toContain("Sunrise to sunset");
    expect(words).toContain("Before relying on them");
    expect(words).toMatch(/Longest day 9 h \d+ min on 1 Nov; shortest 8 h \d+ min on 30 Nov\./);
  });

  it("marks midnight, 6, noon and 18 on the chart's clock, and the months through a year", () => {
    const svg = lightChart({ ...observatory, span: "year" }, 500);
    for (const time of ["00:00", "06:00", "12:00", "18:00"]) expect(svg).toContain(`>${time}<`);
    for (const month of ["Jan", "Jun", "Dec"]) expect(svg).toContain(`>${month}<`);
    expect(lightChart({ ...observatory, style: "12" }, 500)).toContain(">6:00 am<");
  });

  it("says where the clock changes, writes UTC as UTC, warns when the place keeps another zone's time, and explains the words", () => {
    const words = (input: Partial<SunSheetInput>) => contentText(sunKitDocument({ ...observatory, ...input }, "a4").content);
    expect(words({ date: "2026-03-10" })).toContain("time zone Europe/London, UTC+0, then UTC+1 from 29 Mar 2026, on the 24-hour clock.");
    const utc = words({ utc: true, style: "12" });
    expect(utc).toContain("Times are in UTC, on the 24-hour clock.");
    expect(utc).not.toMatch(/\d (am|pm)\b/);
    expect(words({ place: { lat: -41.2865, lon: 174.7762 } })).toContain(
      "By the sun, this place runs about 12 hours ahead of that time zone",
    );
    expect(words({})).toContain("0.833°");
  });

  it("prints a place named in Greek, Cyrillic or Chinese as words a reader finds", async () => {
    for (const [name, sample] of [
      ["Αθήνα", "sun-names-after"],
      ["Москва", null],
      ["北京", null],
    ] as const) {
      const printed = await renderPdf(sunKitDocument({ ...observatory, span: "fortnight", place: { ...observatory.place, name } }, "a4"));
      if (sample) writeSample(sample, printed.bytes);
      expect((await pdfText(printed.bytes)).replace(/\s/g, "")).toContain(name);
    }
  }, 60_000);

  it("is a PDF whose words can be found, the same each time it is made", async () => {
    for (const span of ["month", "year", "fortnight"] as const) {
      const printed = await renderPdf(sunKitDocument({ ...observatory, span }, "a4"));
      writeSample(`sun-${span}-after`, printed.bytes);
      const text = await pdfText(printed.bytes);
      expect(text).toContain("Royal Observatory");
      expect(text).toContain("Solar noon");
      if (span === "year") {
        expect(printed.pages).toBeGreaterThan(3);
        expect(printed.pages).toBeLessThanOrEqual(13);
      } else expect(printed.pages).toBeLessThanOrEqual(2);
    }
    const one = await renderPdf(sunKitDocument(observatory, "letter"));
    const two = await renderPdf(sunKitDocument(observatory, "letter"));
    expect(two.bytes).toEqual(one.bytes);
  }, 60_000);
});
