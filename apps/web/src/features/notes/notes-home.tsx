/**
 * The notes home: the way back into pages you were working on, the ones you starred,
 * and a few starting points for a new one. On phones, where the sidebar is not on
 * screen, the whole page tree is here too.
 */
import type { NoteListItem, NoteTemplate } from "@outpost/shared";
import { ArrowRight, Ellipsis, LayoutTemplate, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { EmptyState, ErrorState, Page, PageHeader, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/misc";
import { timeAgo } from "@/lib/utils";
import { displayTitle, useNoteActions, useNoteTree, useRecentNotes, useTemplates } from "./notes-data";
import { WorkspaceMenuItems } from "./notes-tree";
import { PageIcon } from "./page-bits";
import { PageTree } from "./page-tree";
import type { TreeIndex } from "./tree-model";

const sideLink =
  "inline-flex min-h-9 items-center gap-1.5 rounded-control text-ink-muted underline-offset-[0.2em] hover:text-ink hover:underline max-md:min-h-11";

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy className="divide-y divide-border border-y border-border">
      {Array.from({ length: rows }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders with no identity
        <div key={index} className="flex items-center gap-3 py-3">
          <Skeleton className="size-4" />
          <Skeleton className="h-4 flex-1" style={{ maxWidth: `${14 + ((index * 7) % 12)}rem` }} />
        </div>
      ))}
    </div>
  );
}

function PageRow({
  page,
  index,
  meta,
}: {
  page: Pick<NoteListItem, "id" | "title" | "icon" | "parentId">;
  index: TreeIndex | undefined;
  meta?: string;
}) {
  const parent = page.parentId ? index?.byId.get(page.parentId) : undefined;
  return (
    <li>
      {/* The title has the room first: the parent's name gives way to it, and the time moves under it when both do not fit. A long title takes two lines. */}
      <Link to={`/notes/${page.id}`} className="group flex items-start gap-3 py-2.5 text-ink max-md:py-3">
        <PageIcon icon={page.icon} className="mt-1 text-ink-muted" />
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
          <span className="flex min-w-0 grow basis-36 items-baseline gap-2.5">
            <span className="line-clamp-2 max-w-full shrink-0 font-title text-body [overflow-wrap:anywhere] decoration-primary decoration-1 underline-offset-[0.22em] group-hover:underline">
              {displayTitle(page.title)}
            </span>
            {parent ? (
              <span className="hidden min-w-0 truncate text-small text-ink-muted sm:block">in {displayTitle(parent.title)}</span>
            ) : null}
          </span>
          {meta ? <span className="tabular min-w-0 text-small text-ink-muted">{meta}</span> : null}
        </span>
      </Link>
    </li>
  );
}

export function TemplateList({
  templates,
  onUse,
  busyId,
}: {
  templates: readonly NoteTemplate[];
  onUse(template: NoteTemplate): void;
  busyId: string | null;
}) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {templates.map((template) => (
        <li key={template.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 py-3">
          <PageIcon icon={template.icon} className="mt-1 text-ink-muted" />
          {/* With large text the button goes under the words rather than squeezing them into a column. */}
          <div className="min-w-0 flex-1 basis-48">
            <h3 className="font-title text-body text-ink">{displayTitle(template.title)}</h3>
            <p className="mt-0.5 text-small text-ink-muted">{template.description || "One of your own pages, kept as a template."}</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {template.builtin ? null : (
              <Button asChild variant="ghost" size="sm">
                <Link to={`/notes/${template.id}`}>Edit</Link>
              </Button>
            )}
            <Button
              size="sm"
              loading={busyId === template.id}
              disabled={busyId !== null && busyId !== template.id}
              onClick={() => onUse(template)}
              aria-label={`Use the template ${displayTitle(template.title)}`}
            >
              Use
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Starting a page from a template, with the one-at-a-time bookkeeping the buttons need. */
export function useTemplateStarter() {
  const actions = useNoteActions();
  const [busyId, setBusyId] = useState<string | null>(null);
  const use = async (template: NoteTemplate) => {
    setBusyId(template.id);
    await actions.create({ templateId: template.id });
    setBusyId(null);
  };
  return { busyId, use };
}

export function NotesHome() {
  const tree = useNoteTree();
  const recent = useRecentNotes(10);
  const templates = useTemplates();
  const actions = useNoteActions();
  const starter = useTemplateStarter();
  const [creating, setCreating] = useState(false);

  const newPage = async () => {
    setCreating(true);
    await actions.create();
    setCreating(false);
  };

  const index = tree.data;
  const pageCount = index?.byId.size ?? 0;
  const favourites = index
    ? [...index.byId.values()].filter((item) => item.isFavorite).sort((a, b) => displayTitle(a.title).localeCompare(displayTitle(b.title)))
    : [];
  const shown = templates.data?.slice(0, 6) ?? [];

  const newPageButton = (
    <Button variant="primary" onClick={newPage} loading={creating}>
      {creating ? null : <Plus />} New page
    </Button>
  );

  return (
    <Page>
      <PageHeader
        title="Notes"
        under="/notes"
        description="Pages you write and keep here: plans, lists, things learned. They link to each other and to your library, and they are searched with everything else."
        actions={
          <>
            {newPageButton}
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Import, export, templates and trash">
                  <Ellipsis />
                </Button>
              </MenuTrigger>
              <MenuContent>
                <WorkspaceMenuItems />
              </MenuContent>
            </Menu>
          </>
        }
      />

      {tree.isError ? (
        <ErrorState error={tree.error} onRetry={() => tree.refetch()} />
      ) : tree.isPending ? (
        <ListSkeleton rows={6} />
      ) : (
        // The side column keeps to under half the width, so that with large text the main one is not squeezed to nothing.
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,min(24rem,45%))]">
          <div className="min-w-0">
            {pageCount === 0 ? (
              <EmptyState
                title="No pages yet"
                seed={11}
                action={
                  <>
                    {newPageButton}
                    <Button asChild>
                      <Link to="/import">Import pages</Link>
                    </Button>
                  </>
                }
              >
                Start with an empty page or one of the templates. If you already keep notes in Markdown, Notion or Obsidian, they can be
                imported.
              </EmptyState>
            ) : (
              <>
                {index ? (
                  <Section title="Pages" className="md:hidden">
                    {/* The hairlines line up with the other lists; the rows reach a little wider, for their hover. */}
                    <div className="border-y border-border py-1.5">
                      <div className="-mx-2">
                        <PageTree index={index} tone="page" currentId={undefined} label="Pages" />
                      </div>
                    </div>
                  </Section>
                ) : null}

                <Section title="Recently opened" className="md:mt-0">
                  {recent.isPending ? (
                    <ListSkeleton />
                  ) : recent.isError ? (
                    <ErrorState error={recent.error} onRetry={() => recent.refetch()} />
                  ) : recent.data.length === 0 ? (
                    <p className="border-t border-border pt-3 text-small text-ink-muted">
                      Pages you open are listed here, most recent first.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border border-y border-border">
                      {recent.data.map((page) => (
                        <PageRow key={page.id} page={page} index={index} meta={timeAgo(page.lastViewedAt)} />
                      ))}
                    </ul>
                  )}
                </Section>

                {favourites.length > 0 ? (
                  <Section
                    title={
                      <span className="flex items-center gap-2">
                        Favourites <Star aria-hidden className="size-4 text-lamp" fill="currentColor" />
                      </span>
                    }
                  >
                    <ul className="divide-y divide-border border-y border-border">
                      {favourites.map((page) => (
                        <PageRow key={page.id} page={page} index={index} meta={`Edited ${timeAgo(page.updatedAt)}`} />
                      ))}
                    </ul>
                  </Section>
                ) : null}
              </>
            )}
            {/* Also in the "…" menu, but a page someone has just deleted is looked for here. */}
            <nav aria-label="More in notes" className="mt-8 flex flex-wrap gap-x-6 text-small">
              <Link to="/notes?view=trash" className={sideLink}>
                <Trash2 aria-hidden className="size-4" strokeWidth={1.6} /> Trash
              </Link>
              <Link to="/notes?view=templates" className={sideLink}>
                <LayoutTemplate aria-hidden className="size-4" strokeWidth={1.6} /> All templates
              </Link>
            </nav>
          </div>

          <aside className="min-w-0">
            <Section
              title="Start from a template"
              actions={
                templates.data && templates.data.length > shown.length ? (
                  <Link to="/notes?view=templates" className="flex items-center gap-1 text-small text-primary hover:underline">
                    All templates <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                ) : null
              }
            >
              {templates.isPending ? (
                <ListSkeleton rows={3} />
              ) : templates.isError ? (
                <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
              ) : (
                <TemplateList templates={shown} onUse={(template) => void starter.use(template)} busyId={starter.busyId} />
              )}
            </Section>
          </aside>
        </div>
      )}
    </Page>
  );
}
