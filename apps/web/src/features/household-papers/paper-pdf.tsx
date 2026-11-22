/**
 * One of the household's papers as a PDF: made on this device from its pages
 * (`usePaperPdf`) and shown as it will print (`PaperPreview`). Each screen offers it with
 * the shared `PdfActions` (Save as PDF, Add to library, Share). Adding it to the library
 * asks first (`libraryQuestion`): these papers hold people's names, numbers, where they
 * will be and, for some, their medicines.
 */
import type { ReactNode } from "react";
import { Notice } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { SheetView } from "@/features/maps/print/sheet-view";
import type { PaperMade } from "./use-paper-pdf";

export function libraryQuestion(medical: boolean) {
  return {
    title: medical ? "Put medical details in the library?" : "Put the household's details in the library?",
    description: (
      <>
        <span className="block">
          This holds names and phone numbers{medical ? ", medicines, allergies and conditions" : " and where your household will meet"}. In
          the library everyone who can reach Outpost on your network can read it and find it by search, whatever the medical sheets' own
          switches say, and it goes into every backup.
          {medical ? " A sheet kept encrypted is in the clear in this copy." : ""}
        </span>
        <span className="mt-2 block">
          It is a copy: it does not change when the sheet or plan does, and stays in the library until you delete it there.
        </span>
      </>
    ),
  };
}

/** What went wrong, what could not be lettered, and the pages as they print. */
export function PaperPreview({ made, children }: { made: PaperMade; children?: ReactNode }) {
  return (
    <div className="grid gap-4">
      {made && "error" in made ? (
        <Notice tone="danger" title="The PDF could not be made">
          {made.error}
        </Notice>
      ) : null}
      {children}
      {made && "pdf" in made && made.marked > 0 ? (
        <p className="text-small text-ink">
          This device could not put some letters on the page, so each place they belong is marked [?]. The screen has them in full.
        </p>
      ) : null}
      {made && "pdf" in made ? (
        <div className="grid gap-4" data-testid="paper-preview">
          {made.pages.map((page, index) => (
            <SheetView
              // biome-ignore lint/suspicious/noArrayIndexKey: pages are in order
              key={index}
              sheet={page}
              pictures={made.previews}
              label={`Page ${index + 1} of ${made.pages.length} as it prints`}
              className="h-auto w-full rounded-panel border border-border-strong"
            />
          ))}
        </div>
      ) : made ? null : (
        <Skeleton className="aspect-[1/1.41] w-full" />
      )}
    </div>
  );
}
