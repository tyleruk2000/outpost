/**
 * Sun times on paper: under the times in the Sun tab and a place's Sun section, a
 * sheet of the days around the one shown (two weeks, the month or the year), with the
 * three things every PDF made in Outpost offers: save it, add it to the library, share it.
 *
 * Folded away to one button until asked for, so that on a phone it takes one line
 * under the times. Once open, the file is made on this device whenever the place, the
 * day, the clock or the span changes, laid out with the print kit with a chart of the
 * light through the days. A place named in another script is set in the kit's fallback
 * typefaces.
 */
import { FileText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { AID_PAPER_KEY, type AidPaper, isAidPaper, likelyPaper } from "@/features/encryption/paper-aids";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { kitPdfOf, useKitPdf } from "@/features/print-kit/use-kit-pdf";
import type { ClockStyle } from "@/lib/clock";
import { plural } from "@/lib/utils";
import type { IsoDate } from "../lib/sun";
import { isSunSpan, type SunSheetInput, type SunSheetPlace, type SunSpan, spanWords, sunTitle } from "../lib/sun-document";
import { sunKitDocument } from "../lib/sun-kit";
import { dateIn } from "../lib/sun-text";
import { readStored, writeStored } from "../lib/view";
import { PAPERS } from "../print/paper";

const SPAN_KEY = "outpost.maps.sun.span";
const SPAN_LABEL: Record<SunSpan, string> = { fortnight: "2 weeks", month: "Month", year: "Year" };

/** Where the sheet leads back to: the same ground on the map. */
const mapPath = (place: Pick<SunSheetPlace, "lat" | "lon">) => `/maps?lat=${place.lat.toFixed(4)}&lon=${place.lon.toFixed(4)}&z=12.0`;

export function SunPdf({
  place,
  date,
  zone,
  utc,
  style,
}: {
  place: SunSheetPlace;
  date: IsoDate;
  /** The device's time zone. */
  zone: string;
  utc: boolean;
  style: ClockStyle;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        size="sm"
        variant="secondary"
        // Its words wrap rather than run past the panel on a narrow phone with large text.
        className="h-auto min-h-8 max-w-full justify-self-start py-1 text-left whitespace-normal max-md:h-auto max-md:min-h-11"
        onClick={() => setOpen(true)}
      >
        <FileText aria-hidden /> A PDF of sun times, day by day
      </Button>
    );
  }
  return <SunPdfOpen place={place} date={date} zone={zone} utc={utc} style={style} />;
}

function SunPdfOpen({
  place,
  date,
  zone,
  utc,
  style,
}: {
  place: SunSheetPlace;
  date: IsoDate;
  zone: string;
  utc: boolean;
  style: ClockStyle;
}) {
  const [span, setSpan] = useState<SunSpan>(() => readStored(SPAN_KEY, isSunSpan, "fortnight"));
  const [paper, setPaper] = useState<AidPaper>(() => readStored(AID_PAPER_KEY, isAidPaper, likelyPaper(navigator.language)));
  const { name, lat, lon, coordinates } = place;
  // The button that opened this is gone: its heading has the keyboard, so that focus is not dropped on the page.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  // Dated by the day it is made, so the same sheet made twice in a day is the same file, and the library knows it has it.
  const madeOn = dateIn(zone, Date.now());
  const input = useMemo<SunSheetInput>(
    () => ({ place: { name, lat, lon, coordinates }, date, span, zone, utc, style, made: madeOn }),
    [name, lat, lon, coordinates, date, span, zone, utc, style, madeOn],
  );
  const make = useCallback(() => sunKitDocument(input, paper), [input, paper]);
  const made = useKitPdf(make, {
    title: sunTitle(input),
    kind: "Sun times",
    from: { what: name ? `the saved place “${name}” on the map` : "the map", path: mapPath({ lat, lon }) },
  });

  return (
    <section aria-label="Sun times as a PDF" className="grid gap-3 border-t border-border pt-3" data-testid="sun-pdf">
      <div>
        <h4 ref={heading} tabIndex={-1} className="text-small font-medium text-ink focus:outline-none">
          Sun times on paper
        </h4>
        <p className="mt-0.5 text-small text-ink-muted">
          {spanWords(date, span)}, a day to a line, on the clock shown above
          {made.status === "made" ? `: ${plural(made.pages, "page")} of ${PAPERS[paper].label}` : ""}. Made on this device.
        </p>
      </div>
      <Segmented<SunSpan>
        label="Days on the sheet"
        value={span}
        onChange={(next) => {
          setSpan(next);
          writeStored(SPAN_KEY, next);
        }}
        options={(["fortnight", "month", "year"] as const).map((id) => ({ value: id, label: SPAN_LABEL[id] }))}
        className="justify-self-start"
      />
      {made.status === "failed" ? (
        <Notice tone="danger" title="The PDF could not be made">
          {made.error}
        </Notice>
      ) : (
        <PdfActions pdf={kitPdfOf(made)} />
      )}
      <Segmented<AidPaper>
        label="Paper for the PDF"
        value={paper}
        onChange={(next) => {
          setPaper(next);
          writeStored(AID_PAPER_KEY, next);
        }}
        options={(["a4", "letter"] as const).map((id) => ({ value: id, label: PAPERS[id].label }))}
        className="justify-self-start"
      />
    </section>
  );
}
