/**
 * Step three, afterwards: what the import did, in full. What was created (with links
 * to it), what was left alone and why, and what failed with a reason to act on. A
 * partly finished import can be tried again; that only brings in what is missing.
 */
import { formatDuration, type ImportDto, type ImportReport } from "@outpost/shared";
import { CircleAlert, CircleCheck, File as FileIcon, FileText, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { Notice, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { cn, formatNumber, plural } from "@/lib/utils";
import { useImportActions } from "./import-data";
import { Disclosure, Losses, PathText } from "./plan-parts";
import { groupByReason } from "./preview-model";

const LISTED = 30;

function Fact({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border py-2 last:border-b-0">
      <dt className="text-small text-ink-muted">{label}</dt>
      <dd className={cn("tabular text-right text-small font-medium", tone === "danger" ? "text-danger" : "text-ink")}>{value}</dd>
    </div>
  );
}

function Outcome({ dto, report }: { dto: ImportDto; report: ImportReport }) {
  const brought = report.created.length + report.updated.length;
  if (dto.state === "completed" && report.failed.length === 0) {
    const nothingNew = brought + report.documents.length === 0;
    return (
      <Notice tone="success" icon={<CircleCheck />} title={nothingNew ? "Nothing needed importing" : "The import is finished"}>
        {nothingNew
          ? "Everything in this upload was already in your notes, and was left as it is."
          : [
              brought > 0 ? `${plural(brought, "page")} ${brought === 1 ? "is" : "are"} in your notes` : "",
              report.documents.length > 0
                ? `${plural(report.documents.length, "PDF")} ${report.documents.length === 1 ? "is" : "are"} in the library`
                : "",
            ]
              .filter(Boolean)
              .join(" and ")
              .concat(".")}
      </Notice>
    );
  }
  if (report.stopped) {
    return (
      <Notice tone="warning" icon={<TriangleAlert />} title="The import was stopped part-way">
        {plural(brought, "page")} had been imported and {brought === 1 ? "is" : "are"} still there.
        {dto.canRetry ? " Try again to bring in the rest; nothing is imported twice." : ""}
      </Notice>
    );
  }
  return (
    <Notice
      tone={dto.state === "completed" ? "warning" : "danger"}
      icon={<CircleAlert />}
      title={`${plural(report.failed.length, "item")} could not be imported`}
    >
      Everything else is in place.
      {dto.canRetry ? ` Try again to import only what is missing, or finish without ${report.failed.length === 1 ? "it" : "them"}.` : ""}
    </Notice>
  );
}

function PageLinks({ pages }: { pages: Array<{ noteId: string; title: string }> }) {
  return (
    <>
      <Rows>
        {pages.slice(0, LISTED).map((page) => (
          <li key={page.noteId}>
            <Link to={`/notes/${page.noteId}`} className="group flex min-h-11 items-center gap-3 py-2 text-small text-ink">
              <FileText aria-hidden className="size-4 shrink-0 text-ink-muted" strokeWidth={1.6} />
              <span className="min-w-0 break-words font-medium underline-offset-2 group-hover:underline">
                {page.title.trim() || "Untitled"}
              </span>
            </Link>
          </li>
        ))}
      </Rows>
      {pages.length > LISTED ? <p className="mt-2 text-small text-ink-muted">And {plural(pages.length - LISTED, "more page")}.</p> : null}
    </>
  );
}

export function ReportStep({ dto, report }: { dto: ImportDto; report: ImportReport }) {
  const actions = useImportActions(dto.id);
  const top = report.created.filter((page) => page.topLevel);
  // When every new page went under a page that was kept, there is no "top" to offer; list the new pages themselves.
  const entry = top.length > 0 ? top : report.created;
  const under = report.created.length - top.length;
  const skippedGroups = groupByReason(report.skipped);
  const failure = actions.commit.error ?? actions.discard.error;

  return (
    <div className="max-w-[46rem]">
      <h2 className="font-title text-heading break-words text-ink">{dto.originalName}</h2>
      <div className="mt-4">
        <Outcome dto={dto} report={report} />
      </div>

      <dl className="mt-6 border-y border-border">
        <Fact label="Pages created" value={formatNumber(report.created.length)} />
        {report.updated.length > 0 ? <Fact label="Pages replaced" value={formatNumber(report.updated.length)} /> : null}
        {report.attachments > 0 ? <Fact label="Pictures and files attached" value={formatNumber(report.attachments)} /> : null}
        {report.documents.length > 0 ? <Fact label="PDFs in the library" value={formatNumber(report.documents.length)} /> : null}
        {report.skipped.length > 0 ? <Fact label="Left out or left as they were" value={formatNumber(report.skipped.length)} /> : null}
        {report.failed.length > 0 ? <Fact label="Could not be imported" value={formatNumber(report.failed.length)} tone="danger" /> : null}
        {report.warnings > 0 ? <Fact label="Warnings" value={formatNumber(report.warnings)} /> : null}
        <Fact label="Time taken" value={report.durationMs < 1000 ? "Under a second" : formatDuration(report.durationMs / 1000)} />
      </dl>

      {failure ? (
        <Notice tone="danger" icon={<CircleAlert />} className="mt-5">
          {errorMessage(failure)}
        </Notice>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {dto.canRetry && dto.options ? (
          <>
            <Button variant="primary" onClick={() => actions.commit.mutate(dto.options!)} loading={actions.commit.isPending}>
              Try again
            </Button>
            <Button onClick={() => actions.discard.mutate()} loading={actions.discard.isPending}>
              Finish without {report.stopped ? "the rest" : report.failed.length === 1 ? "it" : "them"}
            </Button>
          </>
        ) : null}
        <Button asChild variant={dto.canRetry ? "ghost" : "secondary"}>
          <Link to="/import">Import something else</Link>
        </Button>
      </div>

      {report.failed.length > 0 ? (
        <Section title="Could not be imported">
          <Rows>
            {report.failed.slice(0, LISTED).map((item) => (
              <li key={item.path} className="py-3">
                <p className="text-small font-medium text-ink">{item.title}</p>
                <p className="text-small text-ink-muted">{item.reason}</p>
                <p className="mt-0.5">
                  <PathText path={item.path} />
                </p>
              </li>
            ))}
          </Rows>
          {report.failed.length > LISTED ? (
            <p className="mt-2 text-small text-ink-muted">And {plural(report.failed.length - LISTED, "more item")}.</p>
          ) : null}
        </Section>
      ) : null}

      {entry.length > 0 ? (
        <Section
          title="Open what was imported"
          description={
            top.length > 0 && under > 0
              ? `${plural(under, "more page")} ${under === 1 ? "is" : "are"} inside ${top.length === 1 ? "this one" : "these"}.`
              : undefined
          }
        >
          <PageLinks pages={entry} />
        </Section>
      ) : null}

      {report.updated.length > 0 ? (
        <Section title="Replaced with the imported version">
          <Disclosure summary={plural(report.updated.length, "page")}>
            <PageLinks pages={report.updated} />
          </Disclosure>
        </Section>
      ) : null}

      {report.documents.length > 0 ? (
        <Section title="PDFs in the library">
          <Rows>
            {report.documents.slice(0, LISTED).map((document) => (
              <li key={document.documentId}>
                <Link
                  to={`/library/documents/${document.documentId}`}
                  className="group flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-small text-ink"
                >
                  <FileIcon aria-hidden className="size-4 shrink-0 text-ink-muted" strokeWidth={1.6} />
                  <span className="min-w-0 break-words font-medium underline-offset-2 group-hover:underline">{document.title}</span>
                  {document.alreadyInLibrary ? <span className="text-ink-muted">was already in the library</span> : null}
                </Link>
              </li>
            ))}
          </Rows>
          {report.documents.length > LISTED ? (
            <p className="mt-2 text-small text-ink-muted">And {plural(report.documents.length - LISTED, "more PDF")}.</p>
          ) : null}
        </Section>
      ) : null}

      {report.skipped.length > 0 ? (
        <Section title="Left out or left as they were">
          <Disclosure summary={plural(report.skipped.length, "item")}>
            <ul className="grid gap-3">
              {skippedGroups.map((group) => (
                <li key={group.reason}>
                  <p className="text-small text-ink">{group.reason}</p>
                  <p className="mt-0.5 text-small text-ink-muted">
                    {group.entries
                      .slice(0, 12)
                      .map((item) => item.title)
                      .join(", ")}
                    {group.entries.length > 12 ? ` and ${group.entries.length - 12} more` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </Disclosure>
        </Section>
      ) : null}

      <Losses title="What did not come across exactly" unsupported={report.unsupported} />
    </div>
  );
}
