/**
 * A communication plan's PDF, with the three things every PDF made in Outpost offers
 * (pdf-actions.tsx): save it, add it to the library, share it.
 *
 * The file is made as soon as the plan has been worked out, and again when the plan or
 * its figures change. Its pages say the day they were written out and nothing finer,
 * and the file's own date is that day too; so the same plan written out twice in a day
 * is the same file, and the library says it already has it instead of keeping two.
 */
import type { CommunicationPlan, PlanResult } from "@outpost/shared";
import { useMemo } from "react";
import { Notice } from "@/components/page";
import { type MadePdf, madePdf } from "@/features/library/made/made-pdf";
import { type MadePdfHandle, PdfStatus, useMadePdf } from "@/features/library/made/pdf-actions";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { planDocument, planPdf, unwritable } from "./document";

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "Communication plan, Family net, for 16 Nov 2026" */
export const planTitle = (plan: CommunicationPlan): string =>
  `Communication plan, ${plan.name}, for ${shortDate.format(new Date(`${plan.date}T00:00:00Z`))}`;

export interface PlanPdf {
  made: MadePdfHandle;
  /** Characters of the plan that the PDF's typeface cannot write; they are printed as "?". */
  lost: string[];
  /** Why the file could not be made, when it could not. */
  problem: string | null;
}

export function usePlanPdf(plan: CommunicationPlan | null | undefined, result: PlanResult | null): PlanPdf {
  const file = useMemo<{ pdf: MadePdf; lost: string[] } | { problem: string } | null>(() => {
    if (!plan || !result) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    try {
      return {
        pdf: madePdf(planPdf(plan, result, today), planTitle(plan), "Communication plan", {
          what: `the communication plan “${plan.name}”`,
          path: `/radio/plans/${plan.id}`,
        }),
        lost: unwritable(planDocument(plan, result, today)),
      };
    } catch (error) {
      return { problem: errorMessage(error) };
    }
  }, [plan, result]);
  const ready = file && "pdf" in file ? file : null;
  const made = useMadePdf(ready?.pdf ?? null);
  return { made, lost: ready?.lost ?? [], problem: file && "problem" in file ? file.problem : null };
}

/** Under the plan's heading: what became of the PDF, and what it could not write. */
export function PlanPdfStatus({ file, className }: { file: PlanPdf; className?: string }) {
  if (file.problem) {
    return (
      <Notice tone="danger" title="The PDF could not be made" className={className}>
        {file.problem}
      </Notice>
    );
  }
  if (!file.made.pdf) return null;
  return (
    <div className={cn("grid gap-2", className)}>
      <PdfStatus made={file.made} />
      {file.lost.length > 0 ? (
        <p className="text-small text-ink-muted">
          The PDF’s typeface cannot write {file.lost.slice(0, 8).join(" ")}; they are printed as “?”. The Markdown export keeps them.
        </p>
      ) : null}
    </div>
  );
}
