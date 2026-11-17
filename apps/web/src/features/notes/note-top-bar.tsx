/** The slim bar above a page: where it sits, whether it is saved, and the page's own actions. */
import type { NoteDetail } from "@outpost/shared";
import {
  ChevronLeft,
  CloudOff,
  Download,
  Ellipsis,
  ImageOff,
  ImagePlus,
  LayoutTemplate,
  LockKeyhole,
  SmilePlus,
  Star,
  Trash2,
} from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/misc";
import { AskAboutMenuItem } from "@/features/chat/ask-about";
import { KeepNoteMenuItem } from "@/features/kept/keep-controls";
import { cn } from "@/lib/utils";
import type { AutosaveStatus } from "./autosave";
import { displayTitle, exportUrl, type NoteActions } from "./notes-data";
import { PageMenuItems } from "./page-bits";

const saveText: Record<AutosaveStatus["kind"], string> = {
  saved: "Saved",
  saving: "Saving…",
  offline: "Offline, changes kept here",
  conflict: "Not saved, changed elsewhere",
  error: "Not saved",
};

/**
 * Whether the page is saved, in words. A screen reader hears only what needs attention
 * (offline, refused, failed) and the first save after it: "Saving…" and "Saved" come
 * round every few seconds while someone types, and would talk over the writing.
 */
export function SaveState({ status, className }: { status: AutosaveStatus; className?: string }) {
  const quiet = status.kind === "saving" || status.kind === "saved";
  const troubled = useRef(false);
  const spoken = !quiet ? saveText[status.kind] : status.kind === "saved" && troubled.current ? saveText.saved : "";
  useEffect(() => {
    if (!quiet) troubled.current = true;
    else if (status.kind === "saved") troubled.current = false;
  });
  return (
    <>
      <p className={cn("flex shrink-0 items-center gap-1.5 text-small text-ink-muted", className)}>
        {status.kind === "offline" ? <CloudOff aria-hidden className="size-4" strokeWidth={1.6} /> : null}
        {saveText[status.kind]}
      </p>
      <span role="status" className="sr-only">
        {spoken}
      </span>
    </>
  );
}

export function Breadcrumbs({ note }: { note: NoteDetail }) {
  const parent = note.breadcrumbs.at(-1);
  const crumb = "truncate rounded-control text-ink-muted hover:text-ink hover:underline underline-offset-[0.2em] decoration-1";
  return (
    <nav aria-label="Where this page is" className="min-w-[min(100%,7em)] flex-1 text-small">
      {/* Phones get the one step that matters: back up to the parent. */}
      <Link
        to={parent ? `/notes/${parent.id}` : "/notes"}
        className="-ml-1.5 flex h-10 min-w-0 items-center gap-1 text-ink-muted md:hidden"
      >
        <ChevronLeft aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{parent ? displayTitle(parent.title) : note.isTemplate ? "Templates" : "Notes"}</span>
      </Link>
      <ol className="hidden min-w-0 items-center gap-1.5 md:flex">
        <li className="shrink-0">
          <Link to={note.isTemplate ? "/notes?view=templates" : "/notes"} className={crumb}>
            {note.isTemplate ? "Templates" : "Notes"}
          </Link>
        </li>
        {note.breadcrumbs.map((ancestor) => (
          <Fragment key={ancestor.id}>
            <li aria-hidden className="shrink-0 text-border-strong">
              /
            </li>
            <li className="flex min-w-0">
              <Link to={`/notes/${ancestor.id}`} className={crumb}>
                {displayTitle(ancestor.title)}
              </Link>
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

export function NoteTopBar({
  note,
  status,
  actions,
  hasIcon,
  hasCover,
  onMove,
  onAddIcon,
  onAddCover,
  onRemoveCover,
  onTemplate,
  onEncrypt,
}: {
  note: NoteDetail;
  status: AutosaveStatus;
  actions: NoteActions;
  hasIcon: boolean;
  hasCover: boolean;
  onMove(): void;
  onAddIcon(): void;
  /** Opens the file picker for a cover, whether or not there is one already. */
  onAddCover(): void;
  onRemoveCover(): void;
  onTemplate(isTemplate: boolean): void;
  /** Opens the dialog that encrypts this page. Not offered for a template. */
  onEncrypt(): void;
}) {
  const trashed = note.trashedAt !== null;
  return (
    // With large text on a phone the way back keeps room for a word or two, and what follows it goes on to a second line.
    <div className="sticky top-0 z-(--z-sticky) flex min-h-12 flex-wrap items-center gap-x-2 bg-page px-5 max-md:top-13 md:px-6">
      <Breadcrumbs note={note} />
      {trashed ? <p className="shrink-0 text-small text-ink-muted">In the trash</p> : <SaveState status={status} />}
      {trashed ? null : (
        <div className="-mr-2 ml-auto flex shrink-0 items-center">
          {note.isTemplate ? null : (
            <Tooltip label={note.isFavorite ? "Remove from favourites" : "Add to favourites"}>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Favourite"
                aria-pressed={note.isFavorite}
                onClick={() => void actions.setFavorite(note, !note.isFavorite)}
                className={cn(note.isFavorite && "text-lamp hover:text-lamp")}
              >
                <Star fill={note.isFavorite ? "currentColor" : "none"} />
              </Button>
            </Tooltip>
          )}
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Page actions">
                <Ellipsis />
              </Button>
            </MenuTrigger>
            <MenuContent>
              {hasIcon ? null : (
                <MenuItem onSelect={onAddIcon}>
                  <SmilePlus /> Add icon
                </MenuItem>
              )}
              <MenuItem onSelect={onAddCover}>
                <ImagePlus /> {hasCover ? "Change cover" : "Add cover"}
              </MenuItem>
              {hasCover ? (
                <MenuItem onSelect={onRemoveCover}>
                  <ImageOff /> Remove cover
                </MenuItem>
              ) : null}
              <MenuSeparator />
              {note.isTemplate ? (
                <>
                  <MenuItem asChild>
                    <a href={exportUrl(note.id)} download>
                      <Download /> Export as Markdown
                    </a>
                  </MenuItem>
                  <MenuItem onSelect={() => onTemplate(false)}>
                    <LayoutTemplate /> Stop using as template
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => void actions.trash(note, { openId: note.id })}>
                    <Trash2 /> Move to trash
                  </MenuItem>
                </>
              ) : (
                <PageMenuItems
                  page={note}
                  isFavorite={note.isFavorite}
                  actions={actions}
                  onMove={onMove}
                  openId={note.id}
                  favourite={false}
                >
                  <KeepNoteMenuItem note={note} />
                  <AskAboutMenuItem kind="note" id={note.id} title={displayTitle(note.title)} />
                  <MenuItem onSelect={() => onTemplate(true)}>
                    <LayoutTemplate /> Use as template
                  </MenuItem>
                  <MenuItem onSelect={onEncrypt}>
                    <LockKeyhole /> Encrypt this page…
                  </MenuItem>
                </PageMenuItems>
              )}
            </MenuContent>
          </Menu>
        </div>
      )}
    </div>
  );
}
