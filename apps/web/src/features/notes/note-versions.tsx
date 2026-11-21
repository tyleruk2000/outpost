/**
 * `/notes/:id/versions`: what a page said before, listed by time, one shown beside the
 * page as it is now, and put back as the newest version. Restoring keeps what the page
 * says now as a version of its own, so nothing is lost by it.
 */
import {
  formatBytes,
  type NoteDoc,
  type NoteResponse,
  type NoteSaveResponse,
  type NoteVersionDetail,
  type NoteVersionItem,
  type NoteVersionsResponse,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice, Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn, formatDateTime, plural, timeAgo } from "@/lib/utils";
import { NoteEditor } from "./editor/note-editor";
import { displayTitle, noteKeys } from "./notes-data";

export const versionKeys = {
  list: (id: string) => ["notes", "versions", id] as const,
  one: (id: string, versionId: string) => ["notes", "version", id, versionId] as const,
};

const nothing = () => {};
const noSubPage = async () => undefined;

/** A page's words, read only. Keyed by the caller, since the editor takes its content once. */
function ReadOnlyPage({ noteId, title, content }: { noteId: string; title: string; content: NoteDoc }) {
  return (
    <div className="min-w-0">
      <h3 className="font-title text-heading text-ink">{displayTitle(title)}</h3>
      <div className="mt-4">
        <NoteEditor
          noteId={noteId}
          content={content}
          editable={false}
          onChange={nothing}
          onBlur={nothing}
          onEditor={nothing}
          createSubPage={noSubPage}
        />
      </div>
    </div>
  );
}

function EncryptedVersion() {
  return (
    <Notice icon={<LockKeyhole />} title="This version is encrypted">
      An encrypted page keeps only encrypted versions, which Outpost cannot read. Restore it to open it with its passphrase on the page;
      what the page says now is kept as a version first.
    </Notice>
  );
}

function VersionRow({ version, selected, onSelect }: { version: NoteVersionItem; selected: boolean; onSelect(): void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex min-h-11 w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left hover:bg-surface",
          selected && "bg-primary-soft text-primary-soft-ink hover:bg-primary-soft",
        )}
      >
        <span className="tabular text-small font-medium text-ink">{formatDateTime(version.savedAt)}</span>
        <span className="text-small text-ink-muted">
          {timeAgo(version.savedAt)}
          {version.encrypted ? " · encrypted" : ""}
        </span>
      </button>
    </li>
  );
}

function Comparison({ id, version, now }: { id: string; version: NoteVersionDetail; now: NoteResponse["note"] }) {
  const [shown, setShown] = useState<"then" | "now">("then");
  const then = (
    <section aria-label={`As it was on ${formatDateTime(version.savedAt)}`} className={cn("min-w-0", shown !== "then" && "max-lg:hidden")}>
      <p className="mb-3 text-small text-ink-muted max-lg:hidden">As it was on {formatDateTime(version.savedAt)}</p>
      {version.encrypted ? (
        <EncryptedVersion />
      ) : (
        <ReadOnlyPage key={version.id} noteId={id} title={version.title} content={version.content} />
      )}
    </section>
  );
  const current = (
    <section aria-label="As it is now" className={cn("min-w-0 lg:border-l lg:border-border lg:pl-8", shown !== "now" && "max-lg:hidden")}>
      <p className="mb-3 text-small text-ink-muted max-lg:hidden">As it is now</p>
      {now.encrypted ? (
        <Notice icon={<LockKeyhole />}>The page is encrypted now. Open it to read it.</Notice>
      ) : (
        <ReadOnlyPage key={now.updatedAt} noteId={id} title={now.title} content={now.content} />
      )}
    </section>
  );
  return (
    <>
      <Segmented
        label="Which to show"
        value={shown}
        onChange={setShown}
        options={[
          { value: "then", label: "This version" },
          { value: "now", label: "Now" },
        ]}
        className="mb-5 lg:hidden"
      />
      <div className="grid gap-8 lg:grid-cols-2">
        {then}
        {current}
      </div>
    </>
  );
}

export function NoteVersionsScreen({ id }: { id: string }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const note = useQuery({ queryKey: noteKeys.detail(id), queryFn: () => api.get<NoteResponse>(`/api/notes/${id}`) });
  const list = useQuery({ queryKey: versionKeys.list(id), queryFn: () => api.get<NoteVersionsResponse>(`/api/notes/${id}/versions`) });
  const [chosen, setChosen] = useState<string | null>(null);
  const versions = list.data?.versions ?? [];
  const selectedId = chosen && versions.some((entry) => entry.id === chosen) ? chosen : (versions[0]?.id ?? null);
  const version = useQuery({
    queryKey: versionKeys.one(id, selectedId ?? ""),
    queryFn: () => api.get<{ version: NoteVersionDetail }>(`/api/notes/${id}/versions/${selectedId}`),
    enabled: selectedId !== null,
    // A version never changes once kept.
    staleTime: Number.POSITIVE_INFINITY,
  });

  const restore = useMutation({
    mutationFn: (versionId: string) =>
      api.post<NoteSaveResponse>(`/api/notes/${id}/versions/${versionId}/restore`, { baseUpdatedAt: note.data?.note.updatedAt }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: noteKeys.detail(id) });
      toast.success("Restored. What the page said before is kept as an earlier version.");
      navigate(`/notes/${id}`);
    },
    onError: (error) => notify.error(errorMessage(error)),
  });

  const title = note.data ? displayTitle(note.data.note.title) : "the page";
  const header = (
    <PageHeader
      title="Earlier versions"
      description={
        note.data
          ? `Of ${title}. Every save is kept for an hour, then the last of each hour for a day, then the last of each day.`
          : undefined
      }
      back={{ to: `/notes/${id}`, label: title }}
    />
  );

  if (note.isError || list.isError) {
    return (
      <Page>
        {header}
        <ErrorState
          error={note.error ?? list.error}
          onRetry={() => {
            void note.refetch();
            void list.refetch();
          }}
        />
      </Page>
    );
  }
  if (note.isPending || list.isPending) {
    return (
      <Page aria-busy>
        {header}
        <div className="grid gap-8 md:grid-cols-[15rem_minmax(0,1fr)]">
          <Skeleton className="h-48" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </Page>
    );
  }
  if (versions.length === 0) {
    return (
      <Page>
        {header}
        <EmptyState
          title="No earlier versions yet"
          action={
            <Button variant="primary" onClick={() => navigate(`/notes/${id}`)}>
              Back to the page
            </Button>
          }
        >
          A version is kept each time a change to the page is saved. Edit the page and its earlier versions will be listed here.
        </EmptyState>
      </Page>
    );
  }

  const selected = versions.find((entry) => entry.id === selectedId);
  return (
    <Page width="full" className="max-w-[90rem]">
      {header}
      <div className="grid gap-8 md:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Versions">
          <ul className="divide-y divide-border border-y border-border">
            {versions.map((entry) => (
              <VersionRow key={entry.id} version={entry} selected={entry.id === selectedId} onSelect={() => setChosen(entry.id)} />
            ))}
          </ul>
          <p className="mt-3 text-small text-ink-muted">
            {plural(versions.length, "version")}, {formatBytes(versions.reduce((sum, entry) => sum + entry.sizeBytes, 0))}
          </p>
        </nav>
        <div className="min-w-0">
          {selected ? (
            <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button variant="primary" onClick={() => restore.mutate(selected.id)} loading={restore.isPending}>
                Restore this version
              </Button>
              <p className="text-small text-ink-muted">It becomes the newest; what the page says now is kept.</p>
            </div>
          ) : null}
          {version.isError ? (
            <ErrorState error={version.error} onRetry={() => version.refetch()} />
          ) : version.data ? (
            <Comparison id={id} version={version.data.version} now={note.data.note} />
          ) : (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-4 w-full" />
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
