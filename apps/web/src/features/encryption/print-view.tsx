/**
 * A paper aid as it will print, filling the screen: the sheet on white paper, with
 * the ways to get it onto real paper above it.
 *
 * There are two ways, because no one of them works on every phone. "Print" asks the
 * browser, which prints the sheet and nothing round it (encryption.css). "Save as PDF"
 * makes the same sheet as a file on this device, which any phone can open, share and
 * print; it is made here, in the page, and is never sent anywhere. Where the browser's
 * print cannot be counted on, the file is put first and the screen says why
 * (lib/printing.ts). The sheet being on the screen is itself a third way: the
 * browser's own Share menu prints it, and a screenshot keeps it.
 *
 * The view is a child of the page's body, which is what the print rules look for.
 */
import { Download, Printer, Share2, TriangleAlert, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { PrintNotice } from "@/components/print-notice";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { readStored, writeStored } from "@/features/maps/lib/view";
import { PAPERS } from "@/features/maps/print/paper";
import { pdfFileName } from "@/features/maps/print/pdf";
import type { Sheet } from "@/features/maps/print/sheet";
import { errorMessage } from "@/lib/api";
import { usePrinting } from "@/lib/printing";
import { plural } from "@/lib/utils";
import { AID_PAPERS, type AidPaper, aidPdf, isAidPaper, likelyPaper } from "./paper-aids";
import "./encryption.css";

/** Which paper the PDF was last made for. The only thing this view remembers. */
const PAPER_KEY = "outpost.encryption.paper";

/** The paper on screen is as wide as A4, and drawn smaller where the screen is narrower than that. */
const PAPER_WIDTH_PX = (210 / 25.4) * 96;

type Made = { file: File; pages: number } | { error: string };

export function PrintView({
  title,
  summary,
  secret,
  pages,
  onClose,
  children,
}: {
  /** What the sheet is: the heading here, the title in the file and the file's name. */
  title: string;
  /** How much of it there is, in a line. */
  summary: string;
  /** The sheet is a secret (a one-time pad), so a saved file is a copy that has to be destroyed like the paper. */
  secret?: boolean;
  /** The sheet as pages for the PDF (paper-aids.ts). The file is made again whenever this function is a new one, so it has to keep its identity between renders. */
  pages: (paper: AidPaper) => Sheet[];
  onClose: () => void;
  /** The sheet itself, as the browser prints it. */
  children: ReactNode;
}) {
  const printing = usePrinting();
  const [paper, setPaper] = useState<AidPaper>(() => readStored(PAPER_KEY, isAidPaper, likelyPaper(navigator.language)));
  const choosePaper = (next: AidPaper) => {
    setPaper(next);
    writeStored(PAPER_KEY, next);
  };

  // The file is a few thousand bytes of text, so it is made as the view opens and "Save as PDF" is a plain link to it.
  const made = useMemo<Made>(() => {
    try {
      const sheets = pages(paper);
      const bytes = aidPdf(sheets, title);
      return { file: new File([bytes as BlobPart], pdfFileName(title), { type: "application/pdf" }), pages: sheets.length };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [pages, paper, title]);
  const file = "file" in made ? made.file : null;

  // The address is given back when the paper changes or the view closes; the browser then lets the bytes go.
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file) return;
    const address = URL.createObjectURL(file);
    setUrl(address);
    return () => {
      URL.revokeObjectURL(address);
      setUrl(undefined);
    };
  }, [file]);

  const canShare = file !== null && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title });
    } catch (error) {
      // Closing the share sheet without choosing is not a failure.
      if (!(error instanceof DOMException && error.name === "AbortError"))
        toast.error("This device would not share the file. Save it instead.");
    }
  };

  // The paper is fitted to the width of the screen, before it is first shown.
  const [room, setRoom] = useState<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    if (!room) return;
    const measure = () => {
      if (room.clientWidth > 0) setZoom(Math.min(1, room.clientWidth / PAPER_WIDTH_PX));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(room);
    return () => observer.disconnect();
  }, [room]);

  const leadWithFile = printing.lead === "other";
  const save =
    file && url ? (
      <Button asChild variant={leadWithFile ? "primary" : "secondary"}>
        <a href={url} download={file.name}>
          <Download /> Save as PDF
        </a>
      </Button>
    ) : null;
  const print = printing.canPrint ? (
    <Button variant={leadWithFile ? "secondary" : "primary"} onClick={printing.print}>
      <Printer /> Print
    </Button>
  ) : null;

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="print-sheet fixed inset-0 z-(--z-dialog) flex flex-col bg-surface-strong pt-[env(safe-area-inset-top)] focus:outline-none data-[state=open]:animate-fade"
          data-testid="print-view"
        >
          <header className="print-chrome shrink-0 border-b border-border bg-page">
            <div className="mx-auto flex max-w-[70rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <DialogPrimitive.Title className="text-lead font-semibold text-ink">{title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-small text-ink-muted">{summary}</DialogPrimitive.Description>
              </div>
              <div className="flex flex-wrap items-center gap-2" data-testid="print-ways">
                {leadWithFile ? save : print}
                {leadWithFile ? print : save}
                {canShare ? (
                  <Button onClick={share}>
                    <Share2 /> Share the PDF
                  </Button>
                ) : null}
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost">
                    <X /> Close
                  </Button>
                </DialogPrimitive.Close>
              </div>
            </div>
          </header>

          <div className="print-scroll scroll-quiet min-h-0 flex-1 overflow-auto overscroll-contain px-3 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-6 md:pt-5">
            <div className="print-chrome mx-auto mb-3 grid max-w-[210mm] gap-3">
              <PrintNotice
                printing={printing}
                instead="Save the PDF and print that. The browser’s own Share menu, then Print, prints this sheet too."
              />
              {"error" in made ? (
                <Notice tone="danger" title="The PDF could not be made">
                  {made.error}
                </Notice>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Segmented<AidPaper>
                    label="Paper for the PDF"
                    value={paper}
                    onChange={choosePaper}
                    options={AID_PAPERS.map((id) => ({ value: id, label: PAPERS[id].label }))}
                  />
                  <p className="text-small text-ink-muted" data-testid="pdf-summary">
                    The PDF is {plural(made.pages, "page")} of {PAPERS[paper].label}
                    {secret ? "." : ", made on this device and sent nowhere."}
                  </p>
                </div>
              )}
              {secret ? (
                <Notice tone="warning" icon={<TriangleAlert />} title="A saved PDF is another copy of the pads">
                  It is made on this device and sent nowhere, and Outpost keeps nothing once this screen is left. The file you save stays:
                  delete it when it is printed, here and anywhere it was shared or backed up, as you would burn the paper.
                </Notice>
              ) : null}
            </div>

            <div ref={setRoom} className="print-room mx-auto max-w-[210mm]">
              <div className="print-paper" style={{ "--sheet-zoom": zoom } as CSSProperties} data-testid="print-paper">
                {children}
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
