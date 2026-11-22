/**
 * A communication plan's PDF, with the three things every PDF made in Outpost offers
 * (pdf-actions.tsx): save it, add it to the library, share it.
 *
 * The file is laid out with the print kit (../print/plan-print.ts) as soon as the plan has
 * been worked out, and again when the plan or its figures change. Its pages say the day they were written out and nothing finer,
 * and the file's own date is that day too; so the same plan written out twice in a day
 * is the same file, and the library says it already has it instead of keeping two.
 */
import type { CommunicationPlan, PlanResult } from "@outpost/shared";
import { useMemo } from "react";
import { Notice } from "@/components/page";
import { type MadePdfHandle, PdfStatus, useMadePdf } from "@/features/library/made/pdf-actions";
import { kitPdfOf, useKitPdf } from "@/features/print-kit/use-kit-pdf";
import { appLocale } from "@/lib/region";
import { cn } from "@/lib/utils";
import { usePaper } from "../prediction-export";
import { planPrint } from "../print/plan-print";
import { useLand } from "../print/use-land";

const shortDate = new Intl.DateTimeFormat(appLocale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "Communication plan, Family net, for 16 Nov 2026" */
export const planTitle = (plan: CommunicationPlan): string =>
  `Communication plan, ${plan.name}, for ${shortDate.format(new Date(`${plan.date}T00:00:00Z`))}`;

export interface PlanPdf {
  made: MadePdfHandle;
  /** Why the file could not be made, when it could not. */
  problem: string | null;
}

export function usePlanPdf(plan: CommunicationPlan | null | undefined, result: PlanResult | null): PlanPdf {
  const [paper] = usePaper();
  const { land, settled } = useLand();
  // Dated by the day, so that the same plan written out twice in a day is the same file.
  const today = useMemo(() => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    return day.getTime();
  }, []);
  const make = useMemo(
    () => (plan && result && settled ? () => planPrint(plan, result, new Date(today), { land, paper }) : null),
    [plan, result, today, land, paper, settled],
  );
  const kit = useKitPdf(make, {
    title: plan ? planTitle(plan) : "",
    kind: "Communication plan",
    from: {
      what: plan ? `the communication plan “${plan.name}”` : "a communication plan",
      path: plan ? `/radio/plans/${plan.id}` : undefined,
    },
  });
  const made = useMadePdf(kitPdfOf(kit));
  return { made, problem: kit.status === "failed" ? kit.error : null };
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
    </div>
  );
}
