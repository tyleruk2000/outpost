/**
 * A prediction, or the comparison under it, to print and carry: the PDF with the three
 * things every PDF made in Outpost offers (save it, add it to the library, share it),
 * the choice of paper, and the same content as Markdown.
 *
 * The file is a few thousand bytes of text, so it is made as soon as there is an
 * answer and "Save as PDF" is a plain link to it.
 */
import type { CompareResult, PredictionResult } from "@outpost/shared";
import { FileDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { AID_PAPER_KEY, isAidPaper, likelyPaper } from "@/features/encryption/paper-aids";
import { type MadePdf, madePdf } from "@/features/library/made/made-pdf";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { readStored, writeStored } from "@/features/maps/lib/view";
import { PAPERS } from "@/features/maps/print/paper";
import { pdfFileName } from "@/features/maps/print/pdf";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { comparisonMarkdown, comparisonPdf, comparisonTitle } from "./comparison-document";
import { saveFile } from "./plans/document";
import {
  type PredictionPaper,
  predictionMarkdown,
  predictionPdf,
  predictionSheets,
  predictionTitle,
  predictionUnwritable,
} from "./prediction-document";

const PLANNER = "/radio/propagation";

/** The paper last chosen for a sheet made for a home printer: the same choice as the paper aids on the Encryption screen. */
function usePaper(): [PredictionPaper, (paper: PredictionPaper) => void] {
  const [paper, setPaper] = useState<PredictionPaper>(() => readStored(AID_PAPER_KEY, isAidPaper, likelyPaper(navigator.language)));
  return [
    paper,
    (next) => {
      setPaper(next);
      writeStored(AID_PAPER_KEY, next);
    },
  ];
}

function PaperChoice({ paper, onChange }: { paper: PredictionPaper; onChange: (paper: PredictionPaper) => void }) {
  return (
    <Segmented<PredictionPaper>
      label="Paper for the PDF"
      value={paper}
      onChange={onChange}
      options={(["a4", "letter"] as const).map((id) => ({ value: id, label: PAPERS[id].label }))}
      className="justify-self-start"
    />
  );
}

type Made = { pdf: MadePdf; pages: number; lost: string[] } | { error: string };

function Failed({ message }: { message: string }) {
  return (
    <Notice tone="danger" title="The PDF could not be made">
      {message}
    </Notice>
  );
}

export function PredictionExport({
  result,
  savedName,
}: {
  result: PredictionResult;
  /** The name it is saved under, when what is on screen is a saved prediction opened again. */
  savedName?: string;
}) {
  const [paper, setPaper] = usePaper();
  const made = useMemo<Made>(() => {
    try {
      const from = savedName ? `the saved HF prediction “${savedName}”` : "the HF propagation planner";
      return {
        pdf: madePdf(predictionPdf(result, paper), predictionTitle(result), "HF prediction", { what: from, path: PLANNER }),
        pages: predictionSheets(result, paper).length,
        lost: predictionUnwritable(result),
      };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [result, paper, savedName]);

  return (
    <section aria-label="This prediction as a PDF" className="mb-6 grid gap-3 border-y border-border py-4" data-testid="prediction-export">
      <div>
        <h2 className="text-body font-semibold text-ink">This prediction on paper</h2>
        <p className="mt-0.5 max-w-[70ch] text-small text-ink-muted">
          {"pdf" in made ? `${plural(made.pages, "page")} of ${PAPERS[paper].label}` : "A PDF"}, made on this device: the path, both
          stations as the engine ran them, where the sunspot number came from, this frequency and every band hour by hour, and what to know
          before relying on it.
        </p>
      </div>
      {"error" in made ? (
        <Failed message={made.error} />
      ) : (
        <>
          <PdfActions pdf={made.pdf}>
            <Button
              onClick={() =>
                saveFile(
                  pdfFileName(predictionTitle(result)).replace(/\.pdf$/, ".md"),
                  "text/markdown;charset=utf-8",
                  predictionMarkdown(result),
                )
              }
            >
              <FileDown aria-hidden />
              Export as Markdown
            </Button>
          </PdfActions>
          {made.lost.length > 0 ? (
            <p className="text-small text-ink-muted">
              The PDF’s typeface cannot write {made.lost.slice(0, 8).join(" ")}; they are printed as “?”. The Markdown export keeps them.
            </p>
          ) : null}
        </>
      )}
      <PaperChoice paper={paper} onChange={setPaper} />
    </section>
  );
}

/** Under the planner's "one thing changed" chart: the comparison on screen as a PDF. */
export function ComparisonExport({ result, comparison }: { result: PredictionResult; comparison: CompareResult }) {
  const [paper] = usePaper();
  const made = useMemo<{ pdf: MadePdf } | { error: string }>(() => {
    try {
      return {
        pdf: madePdf(comparisonPdf(result, comparison, paper), comparisonTitle(result, comparison), "HF comparison", {
          what: "the HF propagation planner",
          path: PLANNER,
        }),
      };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [result, comparison, paper]);
  if ("error" in made) return <Failed message={made.error} />;
  return (
    <section aria-label="This comparison as a PDF" className="mt-4 grid gap-2" data-testid="comparison-export">
      <p className="text-small text-ink-muted">This comparison on {PAPERS[paper].label}: every row above with its figures, hour by hour.</p>
      <PdfActions pdf={made.pdf} lead="none">
        <Button
          onClick={() =>
            saveFile(
              pdfFileName(comparisonTitle(result, comparison)).replace(/\.pdf$/, ".md"),
              "text/markdown;charset=utf-8",
              comparisonMarkdown(result, comparison),
            )
          }
        >
          <FileDown aria-hidden />
          Export as Markdown
        </Button>
      </PdfActions>
    </section>
  );
}
