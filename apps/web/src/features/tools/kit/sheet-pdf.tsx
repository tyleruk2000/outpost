/**
 * A guidance sheet made into a PDF on the screen that offers it: the paper this device's
 * region is likely to use, the shared actions (Save as PDF, Add to library, Share), and
 * what is happening while it is made or if it could not be.
 */
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { useCallback } from "react";
import { PdfActions } from "@/features/library/made/pdf-actions";
import type { PrintPaper } from "@/features/print-kit";
import { type KitPdfMeta, kitPdfOf, useKitPdf } from "@/features/print-kit/use-kit-pdf";
import { deviceRegion, likelyPaperFor } from "@/lib/region";

/**
 * `make` is given the paper; it must keep its identity between renders (a module
 * function, or `useCallback`), or null while there is nothing to make.
 */
export function useSheetPdf(make: ((paper: PrintPaper) => TDocumentDefinitions) | null, meta: KitPdfMeta) {
  const paper = likelyPaperFor(deviceRegion());
  const bound = useCallback(() => make!(paper), [make, paper]);
  return useKitPdf(make ? bound : null, meta);
}

/** The shared actions for a made sheet, with a line while it is made and a notice if it failed. Null: nothing to make yet. */
export function SheetPdfActions({ made, className }: { made: ReturnType<typeof useSheetPdf> | null; className?: string }) {
  return (
    <div className={className}>
      <PdfActions pdf={made ? kitPdfOf(made) : null} />
      {!made ? null : made.status === "making" ? (
        <p className="mt-2 text-small text-ink-muted" role="status">
          Making the PDF…
        </p>
      ) : made.status === "failed" ? (
        <p className="mt-2 text-small text-danger" role="alert">
          The PDF could not be made: {made.error}
        </p>
      ) : null}
    </div>
  );
}
