/** The two side rooms of the notes workspace: the trash and the full list of templates. */
import type { TrashedNote } from "@outpost/shared";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Page, PageHeader, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { useIsAdmin } from "@/lib/queries";
import { plural, timeAgo } from "@/lib/utils";
import { displayTitle, useNoteActions, useTemplates, useTrash } from "./notes-data";
import { TemplateList, useTemplateStarter } from "./notes-home";
import { PageIcon } from "./page-bits";

function BackToNotes() {
  return (
    <Link
      to="/notes"
      className="-ml-1 mb-3 inline-flex h-8 items-center gap-1 rounded-control text-small text-ink-muted hover:text-ink max-md:h-10"
    >
      <ChevronLeft aria-hidden className="size-4" /> Notes
    </Link>
  );
}

function RowsSkeleton() {
  return (
    <div aria-busy className="divide-y divide-border border-y border-border">
      {[18, 26, 14].map((width) => (
        <div key={width} className="flex items-center gap-3 py-4">
          <Skeleton className="size-4" />
          <Skeleton className="h-4" style={{ width: `${width}rem`, maxWidth: "60%" }} />
        </div>
      ))}
    </div>
  );
}

function TrashRow({ page, canDelete, onDelete }: { page: TrashedNote; canDelete: boolean; onDelete(page: TrashedNote): void }) {
  const actions = useNoteActions();
  const [restoring, setRestoring] = useState(false);
  const title = displayTitle(page.title);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <PageIcon icon={page.icon} className="text-ink-muted" />
      <div className="min-w-0 flex-1 basis-56">
        <Link
          to={`/notes/${page.id}`}
          className="font-title text-body text-ink decoration-primary decoration-1 underline-offset-[0.22em] hover:underline"
        >
          {title}
        </Link>
        <p className="text-small text-ink-muted">
          Moved to the trash {timeAgo(page.trashedAt)}
          {page.descendantCount > 0 ? `, with ${plural(page.descendantCount, "sub-page")}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="sm"
          loading={restoring}
          onClick={async () => {
            setRestoring(true);
            const restored = await actions.restore(page);
            setRestoring(false);
            if (restored) toast.success(`Restored “${title}”.`);
          }}
        >
          Restore
        </Button>
        {canDelete ? (
          <Button size="sm" variant="danger-ghost" onClick={() => onDelete(page)}>
            Delete for good
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function TrashView() {
  const trash = useTrash();
  const actions = useNoteActions();
  const isAdmin = useIsAdmin();
  const [deleting, setDeleting] = useState<TrashedNote | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Page width="reading">
      <BackToNotes />
      <PageHeader
        title="Trash"
        description={
          isAdmin
            ? "Pages you moved to the trash stay here, with their sub-pages, until they are restored or deleted for good."
            : "Pages you moved to the trash stay here, with their sub-pages, until they are restored. Only an administrator can delete them for good."
        }
      />
      {trash.isPending ? (
        <RowsSkeleton />
      ) : trash.isError ? (
        <ErrorState error={trash.error} onRetry={() => trash.refetch()} />
      ) : trash.data.length === 0 ? (
        <EmptyState title="The trash is empty" seed={7} compact>
          A page moved to the trash can be brought back from here, to where it was.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {trash.data.map((page) => (
            <TrashRow key={page.id} page={page} canDelete={isAdmin} onDelete={setDeleting} />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && !busy && setDeleting(null)}
        title={`Delete “${displayTitle(deleting?.title)}” for good?`}
        description={
          <>
            The page{deleting && deleting.descendantCount > 0 ? `, its ${plural(deleting.descendantCount, "sub-page")}` : ""} and any
            pictures used only there will be removed from this Outpost. This cannot be undone. Links to it from other pages will show as
            “page not found”.
          </>
        }
        confirmLabel="Delete for good"
        loading={busy}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          const done = await actions.deleteForGood(deleting);
          setBusy(false);
          if (done) {
            toast.success(`Deleted “${displayTitle(deleting.title)}”.`);
            setDeleting(null);
          }
        }}
      />
    </Page>
  );
}

export function TemplatesView() {
  const templates = useTemplates();
  const starter = useTemplateStarter();
  const own = templates.data?.filter((template) => !template.builtin) ?? [];
  const builtin = templates.data?.filter((template) => template.builtin) ?? [];

  return (
    <Page width="reading">
      <BackToNotes />
      <PageHeader
        title="Templates"
        description="A template is a page to start from. Using one makes a new page with its title, icon and text; the template itself is left as it is."
      />
      {templates.isPending ? (
        <RowsSkeleton />
      ) : templates.isError ? (
        <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
      ) : (
        <>
          <Section title="Your templates">
            {own.length > 0 ? (
              <TemplateList templates={own} onUse={(template) => void starter.use(template)} busyId={starter.busyId} />
            ) : (
              <p className="border-t border-border pt-3 text-small text-ink-muted">
                None yet. To make one, open a page and choose “Use as template” from its menu. The page moves out of your page tree and is
                listed here.
              </p>
            )}
          </Section>
          <Section title="Templates that come with Outpost">
            <TemplateList templates={builtin} onUse={(template) => void starter.use(template)} busyId={starter.busyId} />
          </Section>
        </>
      )}
    </Page>
  );
}
