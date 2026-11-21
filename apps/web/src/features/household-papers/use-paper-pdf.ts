/**
 * One of the household's papers made into a PDF on this device: the pages lettered
 * (maps/print/lettering.ts) and written, again whenever they change. The screens offer
 * the result with the shared `PdfActions` and show it with `PaperPreview`.
 */
import { useEffect, useState } from "react";
import { type MadeFrom, type MadePdf, madePdf } from "@/features/library/made/made-pdf";
import { type DrawLine, writeLettered } from "@/features/maps/print/lettering";
import type { Sheet } from "@/features/maps/print/sheet";
import { errorMessage } from "@/lib/api";

export type PaperMade = { pdf: MadePdf; pages: Sheet[]; drawn: number; marked: number } | { error: string } | null;

/**
 * The pages lettered and written as a PDF, again whenever they change. `created` dates it
 * by its content where it can be, so that the same paper written out twice is the same
 * file. Give it pages, a `from` and a date that keep their identity between renders.
 */
export function usePaperPdf(
  pages: Sheet[] | null,
  paper: { title: string; kind: string; from: MadeFrom; created: Date; draw?: DrawLine },
): PaperMade {
  const [made, setMade] = useState<PaperMade>(null);
  const { title, kind, from, created, draw } = paper;
  useEffect(() => {
    let live = true;
    setMade(null);
    if (!pages) return;
    writeLettered(pages, title, created, draw)
      .then((written) => ({ pdf: madePdf(written.bytes, title, kind, from), pages, drawn: written.drawn, marked: written.marked }))
      .catch((error: unknown) => ({ error: errorMessage(error) }))
      .then((result) => {
        if (live) setMade(result);
      });
    return () => {
      live = false;
    };
  }, [pages, title, kind, from, created, draw]);
  return made;
}

export const pdfOf = (made: PaperMade): MadePdf | null => (made && "pdf" in made ? made.pdf : null);
