/**
 * Import from Calibre: choose the library's folder on a storage location, see how many
 * books and how much space, choose copy or in place, and read the report.
 *
 * The import being worked on is named in the address (`/library/calibre?id=…`), so a
 * reload lands on the right step. The step shown follows the import's state on the server.
 */
import { type CalibreImportDto, type CalibreOptions, type CalibrePlan, formatBytes } from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, CircleCheck } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Disclosure, EmptyState, ErrorState, Joined, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useStorage } from "@/lib/queries";
import { cn, formatDateTime, formatNumber, plural } from "@/lib/utils";
import { ChoiceList } from "../../downloads/choice-list";
import { LocationPicker, preferredLocation } from "../../downloads/location-picker";
import { FolderPicker, type PickedFolder } from "../../storage/folder-picker";
import { calibreKeys, useCalibreActions, useCalibreImport, useCalibreImports, useStartCalibre } from "./calibre-data";
import { bookLine, placeOf } from "./calibre-model";

const STEPS = ["Choose the library", "Check what is in it", "Bring it in"] as const;

function stepOf(dto: CalibreImportDto | undefined): number {
  if (!dto || dto.state === "reading") return 0;
  if (dto.state === "ready") return 1;
  if ((dto.state === "failed" || dto.state === "discarded") && !dto.report) return dto.plan ? 1 : 0;
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

const STATE_WORDS: Record<CalibreImportDto["state"], string> = {
  reading: "Being read",
  ready: "Waiting for your choice",
  importing: "Being brought in",
  completed: "Brought in",
  failed: "Not finished",
  discarded: "Set aside",
};

const placeName = (dto: Pick<CalibreImportDto, "locationName" | "relPath">) =>
  [dto.locationName ?? "A location no longer known", dto.relPath].filter(Boolean).join(" / ");

function ChooseStep({ onStarted }: { onStarted: (dto: CalibreImportDto) => void }) {
  const [folder, setFolder] = useState<PickedFolder>({ path: undefined, writable: false });
  const storage = useStorage();
  const start = useStartCalibre();
  const earlier = useCalibreImports();
  const place = folder.path && storage.data ? placeOf(folder.path, storage.data.locations) : null;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-x-14">
      <div className="grid content-start gap-5">
        <div>
          <h2 className="font-title text-heading text-ink">Where is the library?</h2>
          <p className="mt-1 text-body text-ink-muted">
            Open the folder Calibre keeps its books in, the one that holds metadata.db. A folder of one author works too.
          </p>
        </div>
        <FolderPicker label="Calibre library folder" onChange={setFolder} pickOnly />
        <div aria-live="polite" className="grid gap-4">
          {folder.path && storage.data && !place ? (
            <Notice tone="info">
              This folder is not on a storage location. Add the drive or folder that holds it in{" "}
              <Link to="/storage" className="text-primary underline underline-offset-2">
                Storage
              </Link>{" "}
              first.
            </Notice>
          ) : null}
          {start.isError ? (
            <Notice tone="danger" icon={<CircleAlert />}>
              {errorMessage(start.error)}
            </Notice>
          ) : null}
        </div>
        <div>
          <Button
            variant="primary"
            size="lg"
            disabled={!place}
            loading={start.isPending}
            onClick={() => place && start.mutate(place, { onSuccess: onStarted })}
            className="max-sm:w-full"
          >
            Read this library
          </Button>
          <p className="mt-3 text-small text-ink-muted">
            Reading adds nothing yet. Outpost counts the books and their size first, and never writes to the Calibre folder.
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <Section title="Earlier imports">
          {earlier.isPending ? (
            <div className="grid gap-2" aria-busy>
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : earlier.isError ? (
            <ErrorState error={earlier.error} onRetry={() => earlier.refetch()} />
          ) : earlier.data.length === 0 ? (
            <EmptyState title="No Calibre imports yet" compact level={3} seed={6}>
              Each library you read is listed here with what became of it.
            </EmptyState>
          ) : (
            <Rows>
              {earlier.data.map((entry) => (
                <li key={entry.id}>
                  <Link
                    to={`/library/calibre?id=${entry.id}`}
                    className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 hover:text-primary"
                  >
                    <span className="min-w-0 font-mono text-[0.8125rem] break-all text-ink">{placeName(entry)}</span>
                    <span className="text-small text-ink-muted">
                      {STATE_WORDS[entry.state]}, {formatDateTime(entry.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </Rows>
          )}
        </Section>
      </div>
    </div>
  );
}

function WorkingStep({ dto, onLeave }: { dto: CalibreImportDto; onLeave: () => void }) {
  const actions = useCalibreActions(dto.id);
  const importing = dto.state === "importing";
  const progress = dto.job?.progress;
  const known = progress?.total != null && progress.total > 0;
  const paused = dto.job?.state === "paused";
  const title = importing ? `Bringing in ${plural(dto.plan?.bookCount ?? 0, "book")}` : `Reading ${placeName(dto)}`;
  return (
    <section className="max-w-[40rem]" aria-live="polite">
      <h2 className="font-title text-heading break-words text-ink">{title}</h2>
      <div className="mt-5 flex items-baseline justify-between gap-4">
        <p className="min-w-0 text-small font-medium break-words text-ink">
          {paused ? "Paused" : (progress?.message ?? "Waiting to start")}
        </p>
        {known ? (
          <p className="tabular shrink-0 text-small text-ink-muted">
            {formatNumber(progress.current)} of {formatNumber(progress.total!)}
          </p>
        ) : null}
      </div>
      <Progress
        value={known ? progress.current / progress.total! : undefined}
        tone={paused ? "muted" : "lamp"}
        label={title}
        className="mt-2"
      />
      <p className="mt-4 text-small text-ink-muted">
        {importing
          ? "Keep the drive connected. You can leave this page; the work carries on. If you stop it, the books added so far stay, and trying again adds the rest without adding any twice."
          : "Nothing is added yet. Outpost is reading each book's metadata.opf to tell you what is there."}
      </p>
      {actions.stop.isError ? (
        <Notice tone="danger" icon={<CircleAlert />} className="mt-4">
          {errorMessage(actions.stop.error)}
        </Notice>
      ) : null}
      <div className="mt-6">
        <Button
          onClick={() => actions.stop.mutate(undefined, { onSuccess: importing ? undefined : onLeave })}
          loading={actions.stop.isPending}
        >
          {importing ? "Stop" : "Cancel"}
        </Button>
      </div>
    </section>
  );
}

function PlanSummary({ dto, plan }: { dto: CalibreImportDto; plan: CalibrePlan }) {
  const listedAll = plan.books.length >= plan.bookCount;
  return (
    <div className="grid gap-5">
      <div>
        <h2 className="font-title text-heading text-ink">
          <span className="tabular">{plural(plan.bookCount, "book")}</span>, <span className="tabular">{formatBytes(plan.totalBytes)}</span>
        </h2>
        <p className="mt-1 text-body text-ink-muted">
          In <span className="font-mono text-[0.9375rem] break-all">{placeName(dto)}</span>.{" "}
          {plan.coverCount === plan.bookCount ? "Every book has a cover." : `${plural(plan.coverCount, "book")} with a cover.`}
        </p>
      </div>
      {!plan.hasCalibreDatabase ? (
        <Notice tone="info">
          There is no metadata.db at the top of this folder, so it may be part of a library rather than all of it. The books found are
          listed below.
        </Notice>
      ) : null}
      {plan.beyondLimit > 0 ? (
        <Notice tone="warning" icon={<CircleAlert />}>
          {plural(plan.beyondLimit, "more book")} {plan.beyondLimit === 1 ? "is" : "are"} beyond what one import takes. Bring the library in
          a folder of authors at a time.
        </Notice>
      ) : null}
      <div>
        <Rows aria-label="Books found">
          {plan.books.map((book) => (
            <li key={book.folder} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
              <span className="min-w-0">
                <span className="block font-title text-body text-ink">{book.title}</span>
                <span className="block text-small text-ink-muted">
                  <Joined parts={bookLine(book)} />
                </span>
              </span>
              <span className="tabular shrink-0 text-small text-ink-muted">
                <Joined parts={[book.file.ext.toUpperCase(), formatBytes(book.file.sizeBytes)]} />
              </span>
            </li>
          ))}
        </Rows>
        {!listedAll ? (
          <p className="mt-2 text-small text-ink-muted">
            The first {formatNumber(plan.books.length)} are listed; all {formatNumber(plan.bookCount)} are brought in.
          </p>
        ) : null}
      </div>
      {plan.leftOut.length > 0 ? (
        <Disclosure summary={`${plural(plan.leftOut.length, "book")} will be left out`}>
          <ul className="grid gap-2">
            {plan.leftOut.map((entry) => (
              <li key={entry.folder}>
                <span className="font-medium">{entry.title ?? entry.folder}</span>
                <span className="block text-ink-muted">{entry.reason}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </div>
  );
}

function PreviewStep({ dto, plan, onDiscarded }: { dto: CalibreImportDto; plan: CalibrePlan; onDiscarded: () => void }) {
  const storage = useStorage();
  const actions = useCalibreActions(dto.id);
  const [mode, setMode] = useState<CalibreOptions["mode"]>("copy");
  const [chosen, setChosen] = useState<string>();
  const locations = storage.data?.locations ?? [];
  const destination = chosen ?? preferredLocation(locations, plan.totalBytes);
  const ready = mode === "in-place" || destination !== undefined;
  const failed = actions.commit.error ?? actions.discard.error;

  return (
    <div className="grid max-w-[46rem] gap-8">
      <PlanSummary dto={dto} plan={plan} />
      <div className="grid gap-4">
        <h3 className="text-lead font-semibold text-ink">How to bring them in</h3>
        <ChoiceList
          label="How to bring them in"
          value={mode}
          onChange={setMode}
          choices={[
            {
              value: "copy",
              title: "Copy them into Outpost",
              detail:
                "Each book's file is copied into the library. The Calibre folder and Outpost's copies are then separate: a change in one does not reach the other.",
              trailing: formatBytes(plan.totalBytes),
            },
            {
              value: "in-place",
              title: "Use them where they are",
              detail: `Outpost records each book where it lies on ${dto.locationName ?? "its drive"} and reads it from there. While the drive is disconnected the books cannot be opened.`,
              trailing: "No space",
            },
          ]}
        />
        {mode === "copy" ? (
          storage.isPending ? (
            <Skeleton className="h-20" />
          ) : storage.isError ? (
            <ErrorState error={storage.error} onRetry={() => storage.refetch()} />
          ) : (
            <div>
              <p className="mb-1.5 text-small font-semibold text-ink">Where to keep it</p>
              <LocationPicker
                label="Where to keep it"
                locations={locations}
                value={destination}
                onChange={setChosen}
                requiredBytes={plan.totalBytes}
              />
              {destination ? null : <p className="mt-2 text-small text-warning">No connected location has room for these books.</p>}
            </div>
          )
        ) : null}
        <p className="text-small text-ink-muted">
          Either way the Calibre folder is only read. Authors, series, tags and the description come from each book's metadata.opf, and the
          cover is kept by Outpost. A book already in the library is recognised by its contents and left as it is.
        </p>
      </div>
      {failed ? (
        <Notice tone="danger" icon={<CircleAlert />}>
          {errorMessage(failed)}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="lg"
          disabled={!ready}
          loading={actions.commit.isPending}
          onClick={() => actions.commit.mutate(mode === "copy" ? { mode, locationId: destination } : { mode })}
        >
          Add {plural(plan.bookCount, "book")}
        </Button>
        <Button size="lg" loading={actions.discard.isPending} onClick={() => actions.discard.mutate(undefined, { onSuccess: onDiscarded })}>
          Discard
        </Button>
      </div>
    </div>
  );
}

function ReportStep({ dto }: { dto: CalibreImportDto }) {
  const report = dto.report!;
  const actions = useCalibreActions(dto.id);
  const unfinished = dto.state === "failed";
  return (
    <div className="grid max-w-[46rem] gap-6">
      {unfinished ? (
        <Notice tone="danger" icon={<CircleAlert />} title="Not every book was added">
          {dto.error}
        </Notice>
      ) : (
        <Notice tone="success" icon={<CircleCheck />} title="The library is in">
          {plural(report.added, "book")} added
          {report.alreadyThere > 0 ? `, ${plural(report.alreadyThere, "book")} already there and left as they were` : ""}.
        </Notice>
      )}
      {unfinished ? (
        <p className="text-body text-ink">
          {plural(report.added, "book")} added
          {report.alreadyThere > 0 ? `, ${plural(report.alreadyThere, "book")} already there` : ""}.
        </p>
      ) : null}
      {report.failed.length > 0 ? (
        <Section title="Not added">
          <Rows>
            {report.failed.map((entry) => (
              <li key={entry.title} className="py-2.5">
                <span className="block font-title text-body text-ink">{entry.title}</span>
                <span className="block text-small text-ink-muted">{entry.reason}</span>
              </li>
            ))}
          </Rows>
        </Section>
      ) : null}
      {actions.commit.isError ? (
        <Notice tone="danger" icon={<CircleAlert />}>
          {errorMessage(actions.commit.error)}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="primary">
          <Link to="/library">Open the library</Link>
        </Button>
        {unfinished && dto.options ? (
          <Button loading={actions.commit.isPending} onClick={() => dto.options && actions.commit.mutate(dto.options)}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

const startAgain = (
  <Button asChild variant="primary">
    <Link to="/library/calibre">Choose a library</Link>
  </Button>
);

function ImportBody({ dto, onLeave }: { dto: CalibreImportDto; onLeave: () => void }) {
  if (dto.state === "reading" || dto.state === "importing") return <WorkingStep dto={dto} onLeave={onLeave} />;
  if (dto.state === "ready" && dto.plan) return <PreviewStep dto={dto} plan={dto.plan} onDiscarded={onLeave} />;
  if (dto.report && (dto.state === "completed" || dto.state === "failed")) return <ReportStep dto={dto} />;
  if (dto.state === "failed" && dto.plan) {
    return (
      <div className="grid gap-5">
        <Notice tone="danger" icon={<CircleAlert />} className="max-w-[46rem]">
          {dto.error}
        </Notice>
        <PreviewStep dto={dto} plan={dto.plan} onDiscarded={onLeave} />
      </div>
    );
  }
  return (
    <div className="grid max-w-[40rem] gap-5">
      {dto.state === "discarded" ? (
        <Notice title="This library was set aside">Nothing was added. Read it again to bring it in.</Notice>
      ) : (
        <Notice tone="danger" icon={<CircleAlert />} title="This library could not be read">
          {dto.error ?? "Something went wrong on the server."} Nothing was added.
        </Notice>
      )}
      <div>{startAgain}</div>
    </div>
  );
}

export default function CalibrePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const id = params.get("id") ?? undefined;
  const current = useCalibreImport(id);
  const toStart = () => navigate("/library/calibre");

  const onStarted = (dto: CalibreImportDto) => {
    client.setQueryData(calibreKeys.detail(dto.id), dto);
    void client.invalidateQueries({ queryKey: calibreKeys.list });
    navigate(`/library/calibre?id=${dto.id}`);
  };

  return (
    <Page>
      <PageHeader
        back={id ? { to: "/library/calibre", label: "All Calibre imports" } : undefined}
        title="Import from Calibre"
        description="Bring the books you keep in Calibre into the library, with their authors, series, tags and covers. You see how many and how much space first, and the Calibre folder is never changed."
      />
      <StepList current={stepOf(id ? current.data : undefined)} />
      {!id ? (
        <ChooseStep onStarted={onStarted} />
      ) : current.isPending ? (
        <div className="grid max-w-[40rem] gap-4" aria-busy>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4" />
          <Skeleton className="h-24" />
        </div>
      ) : current.isError ? (
        <div className="grid max-w-[40rem] gap-5">
          <ErrorState error={current.error} onRetry={() => current.refetch()} />
          <div>{startAgain}</div>
        </div>
      ) : (
        <ImportBody key={`${current.data.id}:${current.data.state}`} dto={current.data} onLeave={toStart} />
      )}
    </Page>
  );
}
