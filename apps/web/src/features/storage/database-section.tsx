/**
 * The database on the Storage screen: where Outpost's one SQLite file is, what is in it,
 * the state it is in, and the two ways of looking after it. See modules/database.
 */
import { type DatabaseJobResponse, type DatabaseStatus, formatBytes, localByReason } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CircleAlert, CircleCheck, RefreshCw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { ErrorState, Notice, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { Table } from "@/components/ui/table";
import { api, errorMessage } from "@/lib/api";
import { useServerConnection } from "@/lib/events";
import { notify } from "@/lib/notify";
import { usePageVisible } from "@/lib/page-visible";
import { formatDateTime, formatNumber, timeAgo } from "@/lib/utils";
import { countWords, duration, GROUP_WORDS, reclaimBlocked, schemaWords } from "./database-text";

export function useDatabase() {
  const shown = usePageVisible();
  const connected = useServerConnection();
  return useQuery({
    queryKey: ["database"],
    queryFn: () => api.get<DatabaseStatus>("/api/database"),
    // The server says when what was being worked out is done (`database.changed`). Asked on a
    // timer only while that word cannot arrive, and never while the page is hidden.
    refetchInterval: (query) => (shown && !connected && (query.state.data?.measuring || query.state.data?.active) ? 1500 : false),
  });
}

/** One fact: its name in the margin on a wide screen, above it on a phone. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-8 gap-y-1 py-4 md:grid-cols-[11rem_minmax(0,1fr)]">
      <dt className="text-small font-medium text-ink">{label}</dt>
      <dd className="min-w-0 text-small text-ink-muted">{children}</dd>
    </div>
  );
}

function Live({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-small text-ink" role="status">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-lamp" />
      {children}
    </p>
  );
}

function Contents({ status, onAgain, again }: { status: DatabaseStatus; onAgain: () => void; again: boolean }) {
  const { contents } = status;
  if (!contents) {
    return status.measuring ? (
      <div className="space-y-2" aria-busy>
        <Live>Working out what is in it, on a connection of its own. The rest of Outpost carries on.</Live>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-24 max-w-xl" />
      </div>
    ) : (
      <p>
        What is in it could not be worked out.{" "}
        <button type="button" onClick={onAgain} className="min-h-11 font-medium text-primary underline underline-offset-2 md:min-h-0">
          Try again
        </button>
      </p>
    );
  }
  const counted = countWords(contents.counts);
  return (
    <div className="space-y-4">
      <p className="max-w-[70ch] text-ink">
        {counted.length === 0
          ? "Nothing has been added yet. The file holds only the tables Outpost keeps for itself."
          : `${counted.join(", ").replace(/, ([^,]*)$/, " and $1")}.`}
      </p>
      {contents.groups ? (
        <Table label="Where the bytes of the database go" className="max-w-xl">
          <thead className="sr-only">
            <tr>
              <th>Part</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border border-y border-border">
            {contents.groups
              .filter((group) => group.bytes > 0)
              .map((group) => (
                <tr key={group.id}>
                  <td className="py-2.5 pr-4">
                    <span className="block text-ink">{GROUP_WORDS[group.id].label}</span>
                    <span className="block text-ink-muted">{GROUP_WORDS[group.id].detail}</span>
                  </td>
                  <td className="tabular py-2.5 text-right align-top font-medium whitespace-nowrap text-ink">{formatBytes(group.bytes)}</td>
                </tr>
              ))}
            <tr>
              <td className="py-2.5 pr-4">
                <span className="block text-ink">Unused</span>
                <span className="block text-ink-muted">Left by things removed; reclaiming gives it back</span>
              </td>
              <td className="tabular py-2.5 text-right align-top font-medium whitespace-nowrap text-ink">
                {formatBytes(contents.unusedBytes)}
              </td>
            </tr>
          </tbody>
        </Table>
      ) : (
        <p>The database software here cannot say how much room each part takes, so only the counts are shown.</p>
      )}
      <div className="flex max-w-[70ch] flex-wrap items-center gap-x-4 gap-y-2">
        <p>
          Worked out {timeAgo(contents.workedOutAt)}, in {duration(contents.milliseconds)},{" "}
          {contents.method === "dbstat"
            ? `by reading every part of the ${formatBytes(contents.fileBytes)} file. The parts add up to the file exactly.`
            : "by counting what is in each part."}
        </p>
        <Button size="sm" onClick={onAgain} loading={again || status.measuring} className="max-md:min-h-11 md:pointer-coarse:min-h-11">
          {again || status.measuring ? null : <RefreshCw />} Work out again
        </Button>
      </div>
    </div>
  );
}

function CheckRow({ status }: { status: DatabaseStatus }) {
  const client = useQueryClient();
  const check = useMutation({
    mutationFn: (kind: "quick" | "full") => api.post<DatabaseJobResponse>("/api/database/check", { kind }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["database"] }),
    onError: (error) => notify.error(errorMessage(error)),
  });
  const last = status.lastCheck;
  const running = status.active?.type === "database.check" ? status.active : null;
  const busy = status.active !== null || check.isPending;
  return (
    <div className="space-y-3">
      <p className="max-w-[70ch]">
        Outpost reads every part of the file and confirms each is sound. It only reads, so everything carries on as usual. The full check
        also confirms that the lists Outpost uses to find things quickly match what they list, and takes a little longer.
      </p>
      {running ? (
        <Live>{running.title === "Check the database fully" ? "Checking every part and every list now." : "Checking every part now."}</Live>
      ) : last ? (
        last.ok ? (
          <p className="flex items-start gap-2 text-ink">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            <span>
              No problems found by the {last.kind === "quick" ? "quick" : "full"} check {timeAgo(last.at)} ({formatDateTime(last.at)}),
              which took {duration(last.milliseconds)}.
            </span>
          </p>
        ) : (
          <Notice tone="danger" icon={<CircleAlert />} title={`The ${last.kind} check ${timeAgo(last.at)} found problems`}>
            <p>The database software reported, in its own words:</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[0.8125rem] break-all">
              {last.problems.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-2">
              Make no large changes until this is resolved. Restoring the most recent backup that passed its check (under{" "}
              <Link to="/settings#backup" className="font-medium underline underline-offset-2">
                Settings, Backup
              </Link>
              ) puts back a sound copy; what changed since that backup would be lost.
            </p>
          </Notice>
        )
      ) : (
        <p>Not checked yet, or not since the history of work was last cleared.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => check.mutate("quick")} disabled={busy} loading={check.isPending && check.variables === "quick"}>
          Check the database
        </Button>
        <Button
          variant="ghost"
          onClick={() => check.mutate("full")}
          disabled={busy}
          loading={check.isPending && check.variables === "full"}
        >
          Run the full check
        </Button>
      </div>
    </div>
  );
}

function ReclaimRow({ status }: { status: DatabaseStatus }) {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const reclaim = useMutation({
    mutationFn: () => api.post<DatabaseJobResponse>("/api/database/reclaim"),
    onSuccess: () => {
      setConfirming(false);
      return client.invalidateQueries({ queryKey: ["database"] });
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
  const running = status.active?.type === "database.vacuum" ? status.active : null;
  const blocked = reclaimBlocked(status, formatBytes);
  const unused = formatBytes(status.file.unusedBytes);
  const took = status.lastVacuum ? ` Last time it took ${duration(status.lastVacuum.milliseconds)}.` : "";
  return (
    <div className="space-y-3">
      <p className="max-w-[70ch]">
        {status.file.unusedPages === 0 ? (
          "No space in the file is unused."
        ) : (
          <>
            <span className="tabular font-medium text-ink">{unused}</span> of the file is unused, left by things that were removed.
            Reclaiming rewrites the whole file without it.
          </>
        )}{" "}
        While it runs, Outpost can be read but nothing can be saved, and backups, imports, downloads and index builds wait. It needs up to{" "}
        <span className="tabular">{formatBytes(status.reclaim.neededBytes)}</span> free on this drive.{took}
      </p>
      {running ? (
        <Live>Reclaiming unused space now. Nothing can be saved until it has finished.</Live>
      ) : blocked ? (
        <p className="max-w-[70ch] text-ink">{blocked}</p>
      ) : (
        <div>
          <Button onClick={() => setConfirming(true)} disabled={status.active !== null}>
            Reclaim unused space
          </Button>
          {status.reclaim.right.reason === "local" ? (
            <p className="mt-2 text-small text-ink-muted">Offered here because {localByReason(status.reclaim.right.localBy)}.</p>
          ) : null}
        </div>
      )}
      {status.lastVacuum && !running ? (
        <p>
          Last reclaimed {timeAgo(status.lastVacuum.at)}: {formatBytes(status.lastVacuum.beforeBytes)} became{" "}
          {formatBytes(status.lastVacuum.afterBytes)}.
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Reclaim unused space?"
        description={`Outpost rewrites its database without the ${unused} that is unused. Until that has finished, nobody can save anything: notes, places and settings are refused with a message, and backups, imports and downloads wait. It reads and writes the whole ${formatBytes(status.file.bytes)} file, so it takes a few times as long as a full check.${took} Nothing in the database is changed or lost, and if Outpost stops part way, the file is left as it was.`}
        confirmLabel="Reclaim space"
        confirmVariant="primary"
        onConfirm={() => reclaim.mutate()}
        loading={reclaim.isPending}
      />
    </div>
  );
}

/** The database's own terms, for those who want them: kept out of the sentences above. */
function TechnicalDetails({ status }: { status: DatabaseStatus }) {
  return (
    <details className="group mt-2">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-primary md:min-h-8 md:pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
        Technical details
      </summary>
      <ul className="mt-1 max-w-[70ch] space-y-1 pl-5.5">
        <li>
          An SQLite {status.sqlite.version} database, in journal mode {status.sqlite.journalMode}
          {status.sqlite.journalMode === "wal"
            ? `: changes are written first to the write-ahead log beside it (${formatBytes(status.file.walBytes)} now) and checkpointed into the file.`
            : "."}
        </li>
        <li>
          {status.contents?.method === "dbstat"
            ? "What is in it is measured with SQLite's dbstat table, page by page."
            : status.sqlite.dbstat
              ? "What is in it is measured by counting the rows of each table."
              : "This build of SQLite has no dbstat table, so what is in it is measured by counting the rows of each table."}
        </li>
        <li>
          Schema: {status.schema.applied} of {status.schema.known} migrations applied. Unused: {formatNumber(status.file.unusedPages)} free
          pages. The checks are PRAGMA quick_check and integrity_check; reclaiming is VACUUM.
        </li>
      </ul>
    </details>
  );
}

export function DatabaseSection() {
  const database = useDatabase();
  const client = useQueryClient();
  const again = useMutation({
    mutationFn: () => api.post<DatabaseStatus>("/api/database/contents"),
    onSuccess: (data) => client.setQueryData(["database"], data),
    onError: (error) => notify.error(errorMessage(error)),
  });
  const status = database.data;

  return (
    <Section
      title="Database"
      description="Notes, library records, the search index and everything else that is not a file, kept together in one file on this device."
    >
      {database.isPending ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-24" />
        </div>
      ) : database.isError ? (
        <ErrorState error={database.error} onRetry={() => database.refetch()} />
      ) : status ? (
        <dl className="divide-y divide-border border-y border-border">
          <Fact label="Where">
            <span className="block font-mono text-[0.8125rem] break-all text-ink">{status.file.path}</span>
            <span className="tabular mt-1 block">
              {status.disk.freeBytes === null
                ? "The system did not say how much room the drive has."
                : `${formatBytes(status.disk.freeBytes)} free of ${formatBytes(status.disk.totalBytes)} on this drive.`}
            </span>
            {status.disk.low ? (
              <Notice tone="warning" icon={<CircleAlert />} title="This drive is nearly full" className="mt-2">
                It has less free than the {formatBytes(status.disk.reserveBytes)} Outpost keeps free on every storage location. When it
                fills, nothing new can be saved. Free some space on it.
              </Notice>
            ) : null}
          </Fact>
          <Fact label="Size">
            <span className="tabular">
              <span className="font-medium text-ink">{formatBytes(status.file.bytes)}</span>, and {formatBytes(status.file.walBytes)} of
              recent changes kept beside it, which are folded into the file as it goes.
            </span>
          </Fact>
          <Fact label="What is in it">
            <Contents status={status} onAgain={() => again.mutate()} again={again.isPending} />
          </Fact>
          <Fact label="State">
            <ul className="space-y-1">
              <li>{schemaWords(status.schema)}</li>
              <li>
                {status.backup.lastAt
                  ? `Last backed up ${timeAgo(status.backup.lastAt)} (${formatDateTime(status.backup.lastAt)}), ${status.backup.kind === "scheduled" ? "on the schedule" : "started by hand"}.`
                  : status.backup.scheduled
                    ? "Not backed up to a storage location yet; the first scheduled backup has not run."
                    : "Not backed up to a storage location. Backups downloaded from Settings are not recorded here."}{" "}
                <Link to="/settings#backup" className="text-primary underline underline-offset-2">
                  Backup settings
                </Link>
              </li>
            </ul>
            <TechnicalDetails status={status} />
          </Fact>
          <Fact label="Check">
            <CheckRow status={status} />
          </Fact>
          <Fact label="Reclaim space">
            <ReclaimRow status={status} />
          </Fact>
        </dl>
      ) : null}
    </Section>
  );
}
