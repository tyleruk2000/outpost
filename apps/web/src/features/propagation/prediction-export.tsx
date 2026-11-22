/**
 * A prediction, or the comparison under it, to print and carry: the PDF with the three
 * things every PDF made in Outpost offers (save it, add it to the library, share it),
 * the choice of paper, and the same content as Markdown.
 *
 * The file is laid out with the print kit (print/) as soon as there is an answer, and
 * "Save as PDF" is a plain link to it once it is made.
 */
import type { CompareResult, PredictionResult } from "@outpost/shared";
import { FileDown } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { AID_PAPER_KEY, isAidPaper, likelyPaper } from "@/features/encryption/paper-aids";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { readStored, writeStored } from "@/features/maps/lib/view";
import { PAPERS } from "@/features/maps/print/paper";
import { pdfFileName } from "@/features/maps/print/pdf";
import { kitPdfOf, useKitPdf } from "@/features/print-kit/use-kit-pdf";
import { plural } from "@/lib/utils";
import { comparisonMarkdown, comparisonTitle } from "./comparison-document";
import { saveFile } from "./plans/document";
import { type PredictionPaper, predictionMarkdown, predictionTitle, predictionUnwritable } from "./prediction-document";
import { comparisonPrint } from "./print/comparison-print";
import { predictionPrint } from "./print/prediction-print";
import { useLand } from "./print/use-land";

const PLANNER = "/radio/propagation";

/** The paper last chosen for a sheet made for a home printer: the same choice as the paper aids on the Encryption screen. */
export function usePaper(): [PredictionPaper, (paper: PredictionPaper) => void] {
  const [paper, setPaper] = useState<PredictionPaper>(() => readStored(AID_PAPER_KEY, isAidPaper, likelyPaper(navigator.language)));
  return [
    paper,
    (next) => {
      setPaper(next);
      writeStored(AID_PAPER_KEY, next);
    },
  ];
}

export function PaperChoice({ paper, onChange }: { paper: PredictionPaper; onChange: (paper: PredictionPaper) => void }) {
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
  const { land, settled } = useLand();
  // Made once the world's outline has been read (or could not be), so that it is made once.
  const make = useCallback(() => predictionPrint(result, paper, { land }), [result, paper, land]);
  const made = useKitPdf(settled ? make : null, {
    title: predictionTitle(result),
    kind: "HF prediction",
    from: { what: savedName ? `the saved HF prediction “${savedName}”` : "the HF propagation planner", path: PLANNER },
  });
  const lost = useMemo(() => predictionUnwritable(result), [result]);

  return (
    <section aria-label="This prediction as a PDF" className="mb-6 grid gap-3 border-y border-border py-4" data-testid="prediction-export">
      <div>
        <h2 className="text-body font-semibold text-ink">This prediction on paper</h2>
        <p className="mt-0.5 max-w-[70ch] text-small text-ink-muted">
          {made.status === "made" ? `${plural(made.pages, "page")} of ${PAPERS[paper].label}` : "A PDF"}, made on this device: the path,
          both stations as the engine ran them, where the sunspot number came from, the usable frequencies through the day, the path drawn
          at its best hour with day and night on the world, this frequency and every band hour by hour, how HF travels, and what to know
          before relying on it.
        </p>
      </div>
      {made.status === "failed" ? (
        <Failed message={made.error} />
      ) : (
        <>
          <PdfActions pdf={kitPdfOf(made)}>
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
          {lost.length > 0 ? (
            <p className="text-small text-ink-muted">
              The PDF’s typeface cannot write {lost.slice(0, 8).join(" ")}; they are printed as “?”. The Markdown export keeps them.
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
  const make = useCallback(() => comparisonPrint(result, comparison, paper), [result, comparison, paper]);
  const made = useKitPdf(make, {
    title: comparisonTitle(result, comparison),
    kind: "HF comparison",
    from: { what: "the HF propagation planner", path: PLANNER },
  });
  if (made.status === "failed") return <Failed message={made.error} />;
  return (
    <section aria-label="This comparison as a PDF" className="mt-4 grid gap-2" data-testid="comparison-export">
      <p className="text-small text-ink-muted">This comparison on {PAPERS[paper].label}: every row above with its figures, hour by hour.</p>
      <PdfActions pdf={kitPdfOf(made)} lead="none">
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
