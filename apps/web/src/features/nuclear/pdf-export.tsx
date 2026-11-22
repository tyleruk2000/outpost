/**
 * The scenarios shown, on paper: a PDF (Save as PDF, Add to library, Share) and
 * Markdown, made on this device.
 *
 * With maps (the usual), each scenario's PDF section has a picture of the offline map
 * under its rings, and several scenarios an overview first. Drawing them takes a few
 * seconds on a computer and longer on a phone, so nothing is drawn until "Make the PDF"
 * is pressed; the page stays usable meanwhile, says in words which map is being drawn,
 * and can be stopped. Without maps the PDF is the words-only one (the rings to scale
 * with no map under them), made at once. Both are laid out with the print kit (print.ts).
 *
 * The household's saved places are on the maps only if ticked here: the PDF may be
 * shared, and a place called Home is not something to put on a shared page by default.
 * When they are, "Add to library" asks first. The Markdown is words only, and says so.
 */
import { formatBytes, type InstalledRegion, type MapSources, type MarkerDto } from "@outpost/shared";
import { FileDown, FileText } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Checkbox, Switch } from "@/components/ui/misc";
import { type MadePdf, madePdf } from "@/features/library/made/made-pdf";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { regionsCacheKey } from "@/features/maps/lib/tiles";
import { PAPERS } from "@/features/maps/print/paper";
import { pdfFileName } from "@/features/maps/print/pdf";
import { kitPdfOf, useKitPdf } from "@/features/print-kit/use-kit-pdf";
import { saveFile } from "@/features/propagation/plans/document";
import { PaperChoice, usePaper } from "@/features/propagation/prediction-export";
import { errorMessage } from "@/lib/api";
import { cn, plural } from "@/lib/utils";
import { scenarioMarkdown, scenarioTitle, type Written } from "./document";
import { scenarioPrint } from "./print";

const PATH = "/prepare/nuclear";
const KIND = "Nuclear effects scenario";
const FROM = { what: "the nuclear preparedness workspace", path: PATH };
/** Whether maps are wanted is kept on this device: a phone that struggles is asked once. */
const MAPS_KEY = "outpost.nuclear.pdfMaps";

function readMaps(): boolean {
  try {
    return localStorage.getItem(MAPS_KEY) !== "off";
  } catch {
    return true;
  }
}
function writeMaps(on: boolean): void {
  try {
    if (on) localStorage.removeItem(MAPS_KEY);
    else localStorage.setItem(MAPS_KEY, "off");
  } catch {
    // Not remembered where storage is switched off: maps are on again next time.
  }
}

/** What "Add to library" asks first when the PDF shows where the household's places are. */
export const PLACES_CONFIRM = {
  title: "Add a PDF that shows your saved places?",
  description:
    "Its maps show where your saved places are, a place called Home among them. In the library, anyone who can open Outpost on this network can read it, and it goes into backups.",
};

type Made =
  | { status: "idle" }
  | { status: "making"; words: string; step: number; of: number }
  | { status: "error"; message: string }
  | { status: "ready"; pdf: MadePdf; pages: number; maps: number; missing: string[] };

export function ScenarioExport({
  written,
  dated,
  places,
  sources,
  regions,
}: {
  /** The scenarios shown on the map, hidden ones left out. */
  written: Written[];
  dated: number;
  places: MarkerDto[];
  sources: MapSources | undefined;
  regions: InstalledRegion[] | undefined;
}) {
  const [paper, setPaper] = usePaper();
  const [maps, setMaps] = useState(readMaps);
  const [withPlaces, setWithPlaces] = useState(false);
  const [made, setMade] = useState<Made>({ status: "idle" });
  const making = useRef<AbortController | null>(null);
  const id = useId();
  const title = scenarioTitle(written);

  // Anything that changes the pages makes a file already made out of date.
  // biome-ignore lint/correctness/useExhaustiveDependencies: listed because the pages are made from them, not because they are read here
  useEffect(() => {
    setMade({ status: "idle" });
    return () => {
      making.current?.abort();
      making.current = null;
    };
  }, [written, dated, paper, maps, withPlaces, places]);

  // Words only: quick, so made as soon as the scenarios are, as before there were maps.
  const makeWords = useCallback(() => scenarioPrint({ written, dated, paper }), [written, dated, paper]);
  const wordsOnly = useKitPdf(maps ? null : makeWords, { title, kind: KIND, from: FROM });

  const make = async () => {
    const stop = new AbortController();
    making.current?.abort();
    making.current = stop;
    setMade({ status: "making", words: "Getting the map ready", step: 0, of: 0 });
    try {
      const { makeScenarioPdf } = await import("./print-maps");
      const file = await makeScenarioPdf({
        written,
        dated,
        paper,
        sources,
        regions: regions ?? [],
        cacheKey: regionsCacheKey(regions ?? []),
        origin: window.location.origin,
        places: withPlaces ? places : null,
        signal: stop.signal,
        onProgress: (words, step, of) => {
          if (!stop.signal.aborted) setMade({ status: "making", words, step, of });
        },
      });
      if (stop.signal.aborted) return;
      setMade({
        status: "ready",
        pdf: madePdf(file.bytes, title, KIND, FROM),
        pages: file.pages,
        maps: file.maps,
        missing: file.missing,
      });
    } catch (error) {
      if (stop.signal.aborted) return;
      setMade({ status: "error", message: errorMessage(error) });
    } finally {
      if (making.current === stop) making.current = null;
    }
  };

  const markdown = (
    <Button onClick={() => saveFile(pdfFileName(title).replace(/\.pdf$/, ".md"), "text/markdown;charset=utf-8", scenarioMarkdown(written))}>
      <FileDown aria-hidden />
      Export as Markdown
    </Button>
  );
  const several = written.length > 1;
  const describe = (pages: number, bytes: number, mapCount: number | null) =>
    `${plural(pages, "page")} of ${PAPERS[paper].label}, ${formatBytes(bytes)}${mapCount === null ? ", words only" : `, ${plural(mapCount, "map")}`}.`;

  return (
    <section
      aria-label="On paper"
      className="grid grid-cols-[minmax(0,1fr)] gap-3 border-y border-border py-4"
      data-testid="scenario-export"
    >
      <div>
        <h2 className="text-body font-semibold text-ink">
          {several ? `The ${written.length} scenarios shown, on paper` : "This scenario on paper"}
        </h2>
        <p className="mt-0.5 text-small text-ink-muted">
          A PDF made on this device with every figure, what each level means, the key to the colours, the assumptions, the limits and the
          source{several ? ", each scenario under its own letter with its own caveat" : ""}
          {maps
            ? several
              ? ", a map of all of them first, and a map of each with its rings and any fallout pattern"
              : ", and a map of the rings and any fallout pattern"
            : ""}
          . The Markdown has the words only.
        </p>
      </div>

      <ul className="grid grid-cols-[minmax(0,1fr)]" aria-label="What goes in the PDF">
        {/* Each row is its control's label, so that the whole row is the target a finger presses. */}
        <li>
          <label htmlFor={`${id}-maps-switch`} className="flex min-h-11 cursor-pointer items-center gap-3 py-1.5">
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span id={`${id}-maps`} className="text-body text-ink">
                Maps in the PDF
              </span>
              <span id={`${id}-maps-hint`} className="text-small text-ink-muted">
                {maps
                  ? "Drawn from the offline map when you press Make the PDF, which takes a while on a phone."
                  : "Off: the words-only PDF, made at once."}
              </span>
            </span>
            <Switch
              id={`${id}-maps-switch`}
              aria-labelledby={`${id}-maps`}
              aria-describedby={`${id}-maps-hint`}
              checked={maps}
              disabled={made.status === "making"}
              onCheckedChange={(on) => {
                setMaps(on);
                writeMaps(on);
              }}
            />
          </label>
        </li>
        {maps ? (
          <li>
            <label
              htmlFor={`${id}-places-box`}
              className={cn("flex min-h-11 items-start gap-3 py-1.5", places.length > 0 && "cursor-pointer")}
            >
              <Checkbox
                id={`${id}-places-box`}
                className="mt-0.5"
                aria-labelledby={`${id}-places`}
                aria-describedby={`${id}-places-hint`}
                checked={withPlaces}
                disabled={made.status === "making" || places.length === 0}
                onCheckedChange={(checked) => setWithPlaces(checked === true)}
              />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span id={`${id}-places`} className="text-body text-ink">
                  Show my saved places on the maps
                </span>
                <span id={`${id}-places-hint`} className="text-small text-ink-muted">
                  {places.length === 0
                    ? "You have no saved places."
                    : "The PDF will then show where your places are, and “Add to library” will ask first. Off unless you tick it."}
                </span>
              </span>
            </label>
          </li>
        ) : null}
      </ul>
      <PaperChoice paper={paper} onChange={setPaper} />

      {!maps ? (
        wordsOnly.status === "failed" ? (
          <Notice tone="danger" title="The PDF could not be made">
            {wordsOnly.error}
          </Notice>
        ) : wordsOnly.status === "made" ? (
          <>
            <p className="text-small text-ink-muted">{describe(wordsOnly.pages, wordsOnly.pdf.file.size, null)}</p>
            <PdfActions pdf={kitPdfOf(wordsOnly)}>{markdown}</PdfActions>
          </>
        ) : (
          <p role="status" className="text-small text-ink-muted">
            Making the PDF…
          </p>
        )
      ) : made.status === "ready" ? (
        <>
          {made.missing.length > 0 ? (
            <Notice tone="warning" title={made.maps === 0 ? "The PDF has no maps" : "The PDF lacks some of its maps"}>
              {made.missing.join(" ")}
            </Notice>
          ) : null}
          <p className="text-small text-ink-muted">{describe(made.pages, made.pdf.file.size, made.maps)}</p>
          <PdfActions pdf={made.pdf} confirm={withPlaces ? PLACES_CONFIRM : undefined}>
            {markdown}
          </PdfActions>
        </>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" loading={made.status === "making"} onClick={() => void make()}>
              {made.status === "making" ? null : <FileText aria-hidden />}
              {made.status === "making" ? "Making the PDF" : made.status === "error" ? "Try again" : "Make the PDF"}
            </Button>
            {made.status === "making" ? (
              <Button
                onClick={() => {
                  making.current?.abort();
                  making.current = null;
                  setMade({ status: "idle" });
                }}
              >
                Stop
              </Button>
            ) : (
              markdown
            )}
          </div>
          {made.status === "making" ? (
            <p role="status" className="text-small text-ink-muted tabular" data-testid="pdf-progress">
              {made.words}
              {made.of > 0 ? ` (${Math.min(made.step, made.of)} of ${made.of})` : ""}…
            </p>
          ) : null}
          {made.status === "error" ? (
            <Notice tone="danger" title="The PDF was not made">
              {made.message}
            </Notice>
          ) : null}
        </div>
      )}
    </section>
  );
}
