/**
 * One of the household's papers made into a PDF on this device: the pages lettered
 * (maps/print/lettering.ts) and written, again whenever they change. The screens offer
 * the result with the shared `PdfActions` and show it with `PaperPreview`.
 */
import { useEffect, useState } from "react";
import { type MadeFrom, type MadePdf, madePdf } from "@/features/library/made/made-pdf";
import { type DrawLine, writeLettered } from "@/features/maps/print/lettering";
import type { PdfPicture } from "@/features/maps/print/pdf";
import type { Sheet } from "@/features/maps/print/sheet";
import { errorMessage } from "@/lib/api";

export type PaperMade =
  | {
      pdf: MadePdf;
      pages: Sheet[];
      drawn: number;
      marked: number;
      /** The pages' own pictures (a map) as addresses this page can show, by id. */
      previews: Readonly<Record<string, string>>;
    }
  | { error: string }
  | null;

/**
 * The pages lettered and written as a PDF, again whenever they change. `created` dates it
 * by its content where it can be, so that the same paper written out twice is the same
 * file. Give it pages, a `from` and a date that keep their identity between renders.
 */
export function usePaperPdf(
  pages: Sheet[] | null,
  paper: { title: string; kind: string; from: MadeFrom; created: Date; draw?: DrawLine; pictures?: ReadonlyMap<string, PdfPicture> },
): PaperMade {
  const [made, setMade] = useState<PaperMade>(null);
  const { title, kind, from, created, draw, pictures } = paper;
  useEffect(() => {
    let live = true;
    setMade(null);
    if (!pages) return;
    const previews: Record<string, string> = {};
    for (const [id, picture] of pictures ?? []) {
      previews[id] = URL.createObjectURL(new Blob([picture.jpeg as BlobPart], { type: "image/jpeg" }));
    }
    writeLettered(pages, title, created, draw, pictures)
      .then((written) => ({
        pdf: madePdf(written.bytes, title, kind, from),
        pages,
        drawn: written.drawn,
        marked: written.marked,
        previews,
      }))
      .catch((error: unknown) => ({ error: errorMessage(error) }))
      .then((result) => {
        if (live) setMade(result);
      });
    return () => {
      live = false;
      for (const url of Object.values(previews)) URL.revokeObjectURL(url);
    };
  }, [pages, title, kind, from, created, draw, pictures]);
  return made;
}

export const pdfOf = (made: PaperMade): MadePdf | null => (made && "pdf" in made ? made.pdf : null);
