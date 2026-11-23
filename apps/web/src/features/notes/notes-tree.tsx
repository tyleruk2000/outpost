/** The notes part of the spine: favourites, then the page tree. */
import type { NoteTreeItem } from "@outpost/shared";
import { Download, Ellipsis, LayoutTemplate, Plus, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useMatch } from "react-router";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { MoveDialog } from "./move-dialog";
import { displayTitle, EXPORT_ALL_URL, useNoteActions, useNoteTree } from "./notes-data";
import { PageIcon } from "./page-bits";
import { type MenuState, PageTree, RowMenu } from "./page-tree";
import type { TreeIndex } from "./tree-model";

const spineButton =
  "grid size-6 place-content-center rounded-[4px] pointer-coarse:size-11 text-spine-ink-muted hover:bg-spine-raised hover:text-spine-ink focus-visible:outline-spine-ink data-[state=open]:bg-spine-raised data-[state=open]:text-spine-ink";
const groupLabel = "flex h-8 pointer-coarse:h-11 items-center pl-2.5 pr-1 text-micro font-medium text-spine-ink-muted/85";

/** Links for the whole workspace: bringing pages in, taking them out, templates and the trash. */
export function WorkspaceMenuItems() {
  return (
    <>
      <MenuItem asChild>
        <Link to="/import">
          <Upload /> Import…
        </Link>
      </MenuItem>
      <MenuItem asChild>
        <a href={EXPORT_ALL_URL} download>
          <Download /> Export all as Markdown
        </a>
      </MenuItem>
      <MenuSeparator />
      <MenuItem asChild>
        <Link to="/notes?view=templates">
          <LayoutTemplate /> Templates
        </Link>
      </MenuItem>
      <MenuItem asChild>
        <Link to="/notes?view=trash">
          <Trash2 /> Trash
        </Link>
      </MenuItem>
    </>
  );
}

function Favourites({ index, currentId }: { index: TreeIndex; currentId: string | undefined }) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [moving, setMoving] = useState<NoteTreeItem | null>(null);
  const favourites = useMemo(
    () =>
      [...index.byId.values()].filter((item) => item.isFavorite).sort((a, b) => displayTitle(a.title).localeCompare(displayTitle(b.title))),
    [index],
  );
  if (favourites.length === 0) return null;

  return (
    <section aria-label="Favourites" className="mb-2">
      <h2 className={groupLabel}>Favourites</h2>
      <ul className="flex flex-col gap-px">
        {favourites.map((item) => (
          <li
            key={item.id}
            className={cn(
              "group/row flex h-[1.875rem] items-center rounded-control pointer-coarse:h-11 pointer-coarse:text-body pr-1 text-small text-spine-ink-muted transition-colors duration-(--duration-fast) hover:bg-spine-raised hover:text-spine-ink",
              item.id === currentId && "text-spine-ink",
            )}
          >
            <Link
              to={`/notes/${item.id}`}
              aria-current={item.id === currentId ? "page" : undefined}
              className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-control pl-2.5 focus-visible:outline-spine-ink focus-visible:-outline-offset-2"
            >
              <PageIcon icon={item.icon} />
              <span className="truncate">{displayTitle(item.title)}</span>
            </Link>
            <button
              type="button"
              aria-label={`Actions for ${displayTitle(item.title)}`}
              aria-haspopup="menu"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setMenu({ item, anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } });
              }}
              className={cn(
                spineButton,
                "shrink-0 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:bg-spine-active [@media(hover:none)]:opacity-100",
                menu?.item.id === item.id && "opacity-100",
              )}
            >
              <Ellipsis aria-hidden className="size-[15px]" />
            </button>
          </li>
        ))}
      </ul>
      <RowMenu menu={menu} onClose={() => setMenu(null)} onMove={setMoving} currentId={currentId} />
      {moving ? <MoveDialog page={moving} index={index} onClose={() => setMoving(null)} /> : null}
    </section>
  );
}

export function NotesTree() {
  const tree = useNoteTree();
  const actions = useNoteActions();
  const currentId = useMatch("/notes/:id")?.params.id;
  const [creating, setCreating] = useState(false);

  const newPage = async () => {
    setCreating(true);
    await actions.create();
    setCreating(false);
  };

  return (
    <div className="pt-3">
      {tree.data ? <Favourites index={tree.data} currentId={currentId} /> : null}

      <div className={groupLabel}>
        <h2 className="flex-1">Pages</h2>
        <button type="button" onClick={newPage} disabled={creating} aria-label="New page" className={spineButton}>
          <Plus aria-hidden className="size-[15px]" />
        </button>
        <Menu>
          <MenuTrigger asChild>
            <button type="button" aria-label="More for pages" className={spineButton}>
              <Ellipsis aria-hidden className="size-[15px]" />
            </button>
          </MenuTrigger>
          <MenuContent align="start">
            <WorkspaceMenuItems />
          </MenuContent>
        </Menu>
      </div>

      {tree.isPending ? (
        <div aria-busy className="grid gap-2.5 px-2.5 pt-2">
          {[70, 52, 84, 60].map((width) => (
            <div key={width} aria-hidden className="h-2.5 animate-pulse rounded-full bg-spine-raised" style={{ width: `${width}%` }} />
          ))}
        </div>
      ) : tree.isError ? (
        <div className="px-2.5 pt-1 text-small text-spine-ink-muted">
          <p>The pages could not be loaded.</p>
          <button
            type="button"
            onClick={() => tree.refetch()}
            className="mt-1 rounded-control text-spine-ink underline underline-offset-2 focus-visible:outline-spine-ink"
          >
            Try again
          </button>
        </div>
      ) : tree.data.byId.size === 0 ? (
        <div className="px-2.5 pt-1 text-small text-spine-ink-muted">
          <p>No pages yet.</p>
          <button
            type="button"
            onClick={newPage}
            disabled={creating}
            className="mt-1 rounded-control text-spine-ink underline decoration-spine-ink-muted underline-offset-[0.2em] hover:decoration-spine-ink focus-visible:outline-spine-ink"
          >
            New page
          </button>
        </div>
      ) : (
        <PageTree index={tree.data} tone="spine" currentId={currentId} label="Pages" />
      )}
    </div>
  );
}
