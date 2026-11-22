/** A template made on this device with the print kit, and the three things every PDF made in Outpost offers. */
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { Notice } from "@/components/page";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { kitPdfOf, useKitPdf } from "@/features/print-kit/use-kit-pdf";

export function TemplatePdf({
  make,
  title,
  kind,
  path,
}: {
  /** Kept with useMemo or useCallback, so that it is made again only when what it is made from changes. */
  make: () => TDocumentDefinitions;
  title: string;
  kind: string;
  path: string;
}) {
  const made = useKitPdf(make, { title, kind, from: { what: "the solar clock", path } });
  return (
    <div className="grid gap-3">
      {made.status === "making" ? <p className="text-small text-ink-muted">Making the PDF…</p> : null}
      {made.status === "failed" ? <Notice tone="danger">The PDF could not be made: {made.error}</Notice> : null}
      <PdfActions pdf={kitPdfOf(made)} />
    </div>
  );
}
