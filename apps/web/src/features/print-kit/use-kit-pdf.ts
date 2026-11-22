/**
 * A paper laid out with the print kit, made into a PDF on this device whenever what it is
 * made from changes. The maker stays pure (data in, document out); this hook calls
 * `renderPdf`, which is asynchronous because pdfmake and the typeface load on the first
 * PDF made, and hands back what the shared `PdfActions` need.
 *
 * `make` is called inside an effect, so give it with `useCallback` (or as a value that
 * keeps its identity between renders) and it runs again only when its inputs change.
 */
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { useEffect, useState } from "react";
import { type MadeFrom, type MadePdf, madePdf } from "@/features/library/made/made-pdf";
import { renderPdf } from "./render";

export type KitPdf =
  | { status: "making" }
  | { status: "made"; pdf: MadePdf; bytes: Uint8Array; pages: number }
  | { status: "failed"; error: string };

export interface KitPdfMeta {
  title: string;
  /** What kind of paper it is, as the library files it: "HF prediction". */
  kind: string;
  from: MadeFrom;
}

const messageOf = (error: unknown) => (error instanceof Error && error.message ? error.message : "Something went wrong.");

/** Null `make` makes nothing and answers "making" (there is nothing to make yet). */
export function useKitPdf(make: (() => TDocumentDefinitions) | null, meta: KitPdfMeta): KitPdf {
  const [state, setState] = useState<KitPdf>({ status: "making" });
  const { title, kind, from } = meta;
  const fromWhat = from.what;
  const fromPath = from.path;
  useEffect(() => {
    let live = true;
    setState({ status: "making" });
    if (!make) return;
    (async () => {
      const printed = await renderPdf(make());
      return printed;
    })()
      .then((printed) => {
        if (live)
          setState({
            status: "made",
            pdf: madePdf(printed.bytes, title, kind, { what: fromWhat, path: fromPath }),
            bytes: printed.bytes,
            pages: printed.pages,
          });
      })
      .catch((error: unknown) => {
        if (live) setState({ status: "failed", error: messageOf(error) });
      });
    return () => {
      live = false;
    };
  }, [make, title, kind, fromWhat, fromPath]);
  return state;
}

/** The made PDF, or null while it is being made or when it failed. */
export const kitPdfOf = (made: KitPdf): MadePdf | null => (made.status === "made" ? made.pdf : null);
