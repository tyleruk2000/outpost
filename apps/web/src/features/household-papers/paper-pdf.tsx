/**
 * One of the household's papers as a PDF: laid out with the print kit (kit-papers.ts),
 * made on this device (`useKitPdf`) and shown as it prints (`PaperPreview`). Each screen
 * offers it with the shared `PdfActions` (Save as PDF, Add to library, Share). Adding it
 * to the library asks first (`libraryQuestion`): these papers hold people's names,
 * numbers, where they will be and, for some, their medicines.
 */
import type { ReactNode } from "react";
import { Notice } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { PdfPagesPreview } from "@/features/print-kit/preview";
import type { KitPdf } from "@/features/print-kit/use-kit-pdf";

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

/** What went wrong, anything the screen adds, and the pages as they print. */
export function PaperPreview({ made, children }: { made: KitPdf; children?: ReactNode }) {
  return (
    <div className="grid gap-4">
      {made.status === "failed" ? (
        <Notice tone="danger" title="The PDF could not be made">
          {made.error}
        </Notice>
      ) : null}
      {children}
      {made.status === "made" ? (
        <PdfPagesPreview bytes={made.bytes} pages={made.pages} label={(page, of) => `Page ${page} of ${of} as it prints`} />
      ) : made.status === "making" ? (
        <Skeleton className="aspect-[1/1.41] w-full" />
      ) : null}
    </div>
  );
}
