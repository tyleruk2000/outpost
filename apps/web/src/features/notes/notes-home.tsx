/**
 * The notes home: the way back into pages you were working on, the ones you starred,
 * and a few starting points for a new one. On phones, where the sidebar is not on
 * screen, the whole page tree is here too.
 */
import type { NoteListItem, NoteTemplate } from "@outpost/shared";
import { ArrowRight, Ellipsis, Plus, Star } from "lucide-react";
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
      <Link to={`/notes/${page.id}`} className="group flex items-center gap-3 py-2.5 text-ink max-md:py-3">
        <PageIcon icon={page.icon} className="text-ink-muted" />
        <span className="flex min-w-0 flex-1 items-baseline gap-2.5">
          <span className="truncate font-title text-body decoration-primary decoration-1 underline-offset-[0.22em] group-hover:underline">
            {displayTitle(page.title)}
          </span>
          {parent ? (
            <span className="hidden shrink truncate text-small text-ink-muted sm:block">in {displayTitle(parent.title)}</span>
          ) : null}
        </span>
        {meta ? <span className="tabular shrink-0 text-small text-ink-muted">{meta}</span> : null}
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
        <li key={template.id} className="flex items-start gap-3 py-3">
          <PageIcon icon={template.icon} className="mt-1 text-ink-muted" />
          <div className="min-w-0 flex-1">
            <h3 className="font-title text-body text-ink">{displayTitle(template.title)}</h3>
            <p className="mt-0.5 text-small text-ink-muted">{template.description || "One of your own pages, kept as a template."}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
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
            {newPageButton}
          </>
        }
      />

      {tree.isError ? (
        <ErrorState error={tree.error} onRetry={() => tree.refetch()} />
      ) : tree.isPending ? (
        <ListSkeleton rows={6} />
      ) : (
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
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
                    <div className="-mx-2 border-y border-border py-1.5">
                      <PageTree index={index} tone="page" currentId={undefined} label="Pages" />
                    </div>
                  </Section>
                ) : null}

                <Section title="Recently opened">
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
