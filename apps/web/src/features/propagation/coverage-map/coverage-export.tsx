/**
 * Under a coverage map's legend: the map as it is shown (what it shades by, and the
 * hour) as a PDF, with the three things every PDF made in Outpost offers.
 *
 * The picture has to be drawn, which takes a moment and a second map, so the file is
 * made when it is asked for and not before. Changing what the map shows makes a file
 * already made out of date, and it is taken down.
 */
import { type CoverageQuantity, type CoverageResult, utcLabel } from "@outpost/shared";
import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { type MadePdf, madePdf } from "@/features/library/made/made-pdf";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { useMapOverview, useMapSources } from "@/features/maps/data";
import { regionsCacheKey } from "@/features/maps/lib/tiles";
import { PAPERS } from "@/features/maps/print/paper";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { PaperChoice, usePaper } from "../prediction-export";
import { coverageTitle } from "./coverage-document";

type Made =
  | { status: "idle" }
  | { status: "making" }
  | { status: "error"; message: string }
  | { status: "ready"; pdf: MadePdf; pages: number; pictureProblem: string | null };

export function CoverageExport({ result, quantity, utcHour }: { result: CoverageResult; quantity: CoverageQuantity; utcHour: number }) {
  const sources = useMapSources();
  const overview = useMapOverview();
  const [paper, setPaper] = usePaper();
  const [made, setMade] = useState<Made>({ status: "idle" });
  const making = useRef<AbortController | null>(null);

  // Anything that changes the page makes a file already made out of date.
  // biome-ignore lint/correctness/useExhaustiveDependencies: listed because the page is made from them, not because they are read here
  useEffect(() => {
    setMade({ status: "idle" });
    return () => {
      making.current?.abort();
      making.current = null;
    };
  }, [result, quantity, utcHour, paper]);

  const make = async () => {
    const stop = new AbortController();
    making.current = stop;
    setMade({ status: "making" });
    try {
      const { makeCoveragePdf } = await import("./coverage-picture");
      const file = await makeCoveragePdf({
        result,
        quantity,
        utcHour,
        paper,
        sources: sources.data,
        cacheKey: regionsCacheKey(overview.data?.regions ?? []),
        signal: stop.signal,
      });
      if (stop.signal.aborted) return;
      setMade({
        status: "ready",
        pdf: madePdf(file.bytes, coverageTitle(result, quantity, utcHour), "HF coverage map", {
          what: "the HF coverage map screen",
          path: "/radio/coverage",
        }),
        pages: file.pages,
        pictureProblem: file.pictureProblem,
      });
    } catch (error) {
      if (stop.signal.aborted) return;
      setMade({ status: "error", message: errorMessage(error) });
    } finally {
      if (making.current === stop) making.current = null;
    }
  };

  return (
    <section aria-label="This map as a PDF" className="mt-6 grid gap-3 border-y border-border py-4" data-testid="coverage-export">
      <div>
        <h2 className="text-body font-semibold text-ink">This map on paper</h2>
        <p className="mt-0.5 max-w-[70ch] text-small text-ink-muted">
          {made.status === "ready" ? `${plural(made.pages, "page")} of ${PAPERS[paper].label}` : "A PDF"}: the map as it is shown now, at{" "}
          {utcLabel(utcHour)} UTC, with its legend, the grid again in figures so that it reads when printed in grey, what was asked, and
          what to know before relying on it.
        </p>
      </div>
      {made.status === "ready" ? (
        <>
          {made.pictureProblem ? (
            <Notice tone="warning" title="The PDF has the figures but not the picture of the map">
              {made.pictureProblem}
            </Notice>
          ) : null}
          <PdfActions pdf={made.pdf} />
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            loading={made.status === "making"}
            // The basemap's sources say what the picture can be drawn from; not before they are known.
            disabled={sources.isPending || overview.isPending}
            onClick={() => void make()}
          >
            {made.status === "making" ? null : <FileText aria-hidden />}
            {made.status === "making" ? "Drawing the map" : made.status === "error" ? "Try again" : "Make the PDF"}
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
          ) : null}
        </div>
      )}
      {made.status === "error" ? (
        <Notice tone="danger" title="The PDF was not made">
          {made.message}
        </Notice>
      ) : null}
      <PaperChoice paper={paper} onChange={setPaper} />
    </section>
  );
}
