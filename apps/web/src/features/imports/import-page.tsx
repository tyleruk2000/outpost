/**
 * Import: bring notes that already exist into Outpost, in three steps. Choose the
 * files, check the plan Outpost makes from them, then import and read the report.
 *
 * The import being worked on is named in the address (`/import?id=…`), so a reload or
 * a link from the list of recent imports lands on the right step. The step shown is
 * decided by the import's state on the server, never by what this tab remembers.
 */
import type { ImportDto } from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleAlert } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ErrorState, Notice, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { ChooseStep } from "./choose-step";
import { importKeys, useImport } from "./import-data";
import { PreviewStep } from "./preview-step";
import { ReportStep } from "./report-step";
import { WorkingStep } from "./working-step";

const STEPS = ["Choose files", "Check the plan", "Import"] as const;

/** Which of the three steps an import is at. */
function stepOf(dto: ImportDto | undefined): number {
  if (!dto || dto.state === "uploaded" || dto.state === "analysing") return 0;
  if (dto.state === "ready") return 1;
  // A failed read has no plan and no report: the person is back at choosing files.
  if ((dto.state === "failed" || dto.state === "discarded") && !dto.report) return dto.analysis ? 1 : 0;
  return 2;
}

function StepList({ current }: { current: number }) {
  return (
    <ol className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-border py-3 text-small">
      {STEPS.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? "step" : undefined}
          className={cn("flex items-center gap-2", index === current ? "font-semibold text-ink" : "text-ink-muted")}
        >
          <span
            className={cn(
              "tabular grid size-5 place-content-center rounded-full text-micro",
              index < current ? "bg-primary text-primary-ink" : index === current ? "bg-ink text-page" : "border border-border-strong",
            )}
          >
            {index < current ? <Check aria-hidden className="size-3" strokeWidth={3} /> : index + 1}
          </span>
          {label}
          {index < current ? <span className="sr-only">(done)</span> : null}
        </li>
      ))}
    </ol>
  );
}

const startAgain = (
  <Button asChild variant="primary">
    <Link to="/import">Import something else</Link>
  </Button>
);

/** The body for one import, by its state. */
function ImportBody({ dto, onLeave }: { dto: ImportDto; onLeave: () => void }) {
  if (dto.state === "uploaded" || dto.state === "analysing" || dto.state === "importing")
    return <WorkingStep dto={dto} onLeave={onLeave} />;
  if (dto.report && (dto.state === "completed" || dto.state === "failed")) return <ReportStep dto={dto} report={dto.report} />;
  if (dto.state === "ready" && dto.analysis) return <PreviewStep dto={dto} analysis={dto.analysis} onDiscarded={onLeave} />;

  if (dto.state === "discarded") {
    return (
      <div className="grid max-w-[40rem] gap-5">
        <Notice title={`“${dto.originalName}” was discarded`}>
          Its uploaded files were removed and nothing was added to your notes. Upload it again to import it.
        </Notice>
        <div>{startAgain}</div>
      </div>
    );
  }
  // What is left: a read or an import that failed before it produced a report.
  return (
    <div className="grid max-w-[40rem] gap-5">
      <Notice
        tone="danger"
        icon={<CircleAlert />}
        title={dto.analysis ? "This import could not be carried out" : "This upload could not be read"}
      >
        {dto.error ?? "Something went wrong on the server."}
        {dto.analysis ? "" : " Nothing was added to your notes."}
      </Notice>
      <div>{startAgain}</div>
    </div>
  );
}

export default function ImportPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const id = params.get("id") ?? undefined;
  const current = useImport(id);
  const toList = () => navigate("/import");

  const onUploaded = (dto: ImportDto) => {
    client.setQueryData(importKeys.detail(dto.id), dto);
    void client.invalidateQueries({ queryKey: importKeys.list });
    navigate(`/import?id=${dto.id}`);
  };

  return (
    <Page>
      <PageHeader
        title="Import"
        description="Bring in notes you already have, from Markdown files, a Notion export or other files. You see exactly what would be created before anything is added."
        actions={
          id ? (
            // On a phone the link sits under the words; its arrow lines up with them.
            <Button asChild variant="ghost" className="max-md:-ml-3.5">
              <Link to="/import">
                <ArrowLeft /> All imports
              </Link>
            </Button>
          ) : null
        }
      />
      <StepList current={stepOf(id ? current.data : undefined)} />

      {!id ? (
        <ChooseStep onUploaded={onUploaded} />
      ) : current.isPending ? (
        <div className="grid max-w-[40rem] gap-4" aria-busy>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-24" />
        </div>
      ) : current.isError ? (
        <div className="grid max-w-[40rem] gap-5">
          <ErrorState error={current.error} onRetry={() => current.refetch()} />
          <div>{startAgain}</div>
        </div>
      ) : (
        <ImportBody key={`${current.data.id}:${current.data.state}`} dto={current.data} onLeave={toList} />
      )}
    </Page>
  );
}
