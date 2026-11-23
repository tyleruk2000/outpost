/**
 * An EPUB book, read in the app.
 *
 * The book's front page is its contents: cover, title, author, where to start (or carry
 * on), and its table of contents. A chapter is drawn from the plain values the server
 * sends (`document-markdown.tsx`), in Outpost's own type; nothing of the book's own
 * markup, styling or scripts is ever put in the page. Finding your way round is the same
 * as in a book from the catalogue (`chapter-nav.tsx`).
 *
 * The address says where you are: `?chapter=3` is the third document of the reading
 * order, `#h-…` a place inside it. How far down a chapter you had read is kept on this
 * device.
 */
import type { DocumentDto, DocumentEpubResponse, EpubContentsEntry } from "@outpost/shared";
import { BookOpen, FileWarning, Lock } from "lucide-react";
import { type ReactNode, type Ref, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { ErrorState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { BookPlace, BookTurn, type TurnTo } from "./chapter-nav";
import { type BookLinks, BookLinksContext, MarkdownDocument } from "./document-markdown";
import { TextViewer } from "./document-text";
import { ViewerMessage } from "./document-viewer-message";
import {
  chapterForHeading,
  chapterInAddress,
  chapterTo,
  goToPlace,
  pictureUrl,
  placeIn,
  readPlace,
  savePlace,
  useEpubBook,
  useEpubChapter,
} from "./epub-data";

const LINK = "font-medium text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";

/** Why the server would not show a book or a chapter, when it said. */
const reasonOf = (error: unknown) => (error instanceof ApiError ? (error.details?.reason as string | undefined) : undefined);

/** The scrolling region a book is read in. It fills the viewer, like the text of any other document. */
function Scroller({ label, children, ref }: { label: string; children: ReactNode; ref?: Ref<HTMLElement> }) {
  return (
    <section
      ref={ref}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must be reachable by keyboard
      tabIndex={0}
      aria-label={label}
      className="scroll-quiet min-h-0 flex-1 overflow-y-auto bg-page focus-visible:outline-offset-[-2px]"
    >
      <div className="max-w-[68rem] px-5 pt-6 pb-16 md:px-10 md:pt-8">{children}</div>
    </section>
  );
}

function TextSkeleton() {
  return (
    <div className="grid max-w-[48rem] gap-3" aria-busy>
      <Skeleton className="h-7 w-64 max-w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}

// ── The front of the book ────────────────────────────────────────────────────

/** Indent for a line of the contents, by how far beneath a top-level line it sits. */
const INDENT = ["", "pl-5", "pl-10", "pl-14", "pl-16", "pl-16"];

function ContentsLine({ entry, documentId }: { entry: EpubContentsEntry; documentId: string }) {
  const to = entry.chapter === null ? null : chapterTo(documentId, entry.chapter, entry.anchor);
  const nested = entry.depth > 0;
  if (!to) {
    // A line that opens nothing names a part of the book: it heads the lines beneath it.
    return (
      <li className={INDENT[entry.depth] ?? "pl-16"}>
        <p className={cn("border-b border-border pb-1.5 text-small font-semibold text-ink", nested ? "pt-3" : "pt-5")}>{entry.title}</p>
      </li>
    );
  }
  return (
    <li className={INDENT[entry.depth] ?? "pl-16"}>
      <Link
        to={to}
        className={cn(
          "group -mx-3 flex items-center rounded-control px-3 transition-colors duration-(--duration-fast) hover:bg-surface max-md:min-h-11 md:pointer-coarse:min-h-11",
          nested ? "py-1.5" : "py-2.5",
        )}
      >
        <span
          className={cn(
            "font-title decoration-primary decoration-1 underline-offset-[0.22em] group-hover:underline",
            nested ? "text-small text-ink-muted group-hover:text-ink" : "text-body text-ink",
          )}
        >
          {entry.title}
        </span>
      </Link>
    </li>
  );
}

function Front({ document, book, downloadUrl }: { document: DocumentDto; book: DocumentEpubResponse; downloadUrl: string }) {
  const place = readPlace(document.id);
  const resume = place ? book.chapters.find((chapter) => chapter.position === place.chapter) : undefined;
  const first = book.chapters[0];
  const start = resume ?? first;
  const startTo = start ? chapterTo(document.id, start.position) : null;
  const cover = book.cover ? pictureUrl(document.id, book.cover) : null;
  const [coverFailed, setCoverFailed] = useState(false);
  const title = book.title ?? document.title;
  // A book with no table of contents is read by its documents in order.
  const lines: EpubContentsEntry[] =
    book.contents.length > 0
      ? book.contents
      : book.chapters.map((chapter) => ({ title: chapter.title, chapter: chapter.position, depth: 0 }));

  return (
    <Scroller label={title}>
      <div className="max-w-[46rem]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
          {cover && !coverFailed ? (
            <img
              src={cover}
              alt={`Cover of ${title}`}
              draggable={false}
              onError={() => setCoverFailed(true)}
              className="h-auto max-h-64 w-28 shrink-0 self-start bg-surface object-contain object-left-top outline outline-1 outline-border sm:w-40"
            />
          ) : null}
          <div className="min-w-0">
            <h2 className="font-title text-title text-balance text-ink">{title}</h2>
            {book.author ? <p className="mt-1.5 text-body text-ink-muted">{book.author}</p> : null}
            {startTo ? (
              <div className="mt-5">
                <Button asChild variant="primary">
                  <Link to={startTo}>
                    <BookOpen /> {resume ? "Continue reading" : "Start reading"}
                  </Link>
                </Button>
                {resume ? (
                  <p className="tabular mt-2 text-small text-ink-muted">
                    You were in “{resume.title}”, {resume.position} of {book.chapters.length}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-8 border-b border-border pb-4 text-small text-ink-muted">
          <p>
            This is the book as Outpost reads it: its words and pictures, set in Outpost’s own type. The book’s own fonts and layout are
            left out, and so are audio, video and anything interactive.{" "}
            <a href={downloadUrl} className={LINK}>
              Download the original
            </a>
          </p>
          {book.notes.map((note) => (
            <p key={note} className="mt-2 text-ink">
              {note}
            </p>
          ))}
        </div>

        <section className="mt-8" aria-labelledby="epub-contents">
          <h2 id="epub-contents" className="text-lead font-semibold text-ink">
            Contents
          </h2>
          <ol className="mt-1">
            {lines.map((entry, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines of a table of contents in their fixed order; titles may repeat
              <ContentsLine key={index} entry={entry} documentId={document.id} />
            ))}
          </ol>
        </section>
      </div>
    </Scroller>
  );
}

// ── A chapter ────────────────────────────────────────────────────────────────

function Chapter({
  document,
  book,
  position,
  downloadUrl,
}: {
  document: DocumentDto;
  book: DocumentEpubResponse;
  position: number;
  downloadUrl: string;
}) {
  const chapter = useEpubChapter(document.id, position);
  const location = useLocation();
  const navigate = useNavigate();
  const scroller = useRef<HTMLElement>(null);
  const total = book.chapters.length;
  const bookTitle = book.title ?? document.title;
  const turn = (to: number): TurnTo | null => {
    const target = book.chapters[to - 1];
    const address = target ? chapterTo(document.id, target.position) : null;
    return target && address ? { to: address, title: target.title } : null;
  };
  const contents: TurnTo = { to: { pathname: `/library/documents/${document.id}` }, title: bookTitle };
  // The top of the screen carries the chapter's name; this line says which book, and how far through it.
  const where = `${position} of ${total}`;

  const links = useMemo<BookLinks>(
    () => ({ picture: (src) => pictureUrl(document.id, src), chapter: (to, anchor) => chapterTo(document.id, to, anchor) }),
    [document.id],
  );

  // ── The place being read ──
  const drawn = Boolean(chapter.data);
  const hash = useRef(location.hash);
  hash.current = location.hash;
  const state = useRef<unknown>(location.state);
  state.current = location.state;
  useEffect(() => {
    const region = scroller.current;
    if (!drawn || !region) return;
    let timer: number | undefined;
    let moved = false;
    // Nothing is kept until the reader has been put back where they were: the top of the chapter is not a place they chose.
    let settled = false;
    const keep = () => savePlace(document.id, { chapter: position, ...(placeIn(region) ?? { section: 0, block: 0, offset: 0 }) });

    // An address that names a place in the chapter goes there (the text does that itself); otherwise back to where reading stopped.
    const kept = hash.current ? null : readPlace(document.id);
    const place = kept?.chapter === position ? kept : null;
    // The browser lays out only the parts of a long text near the window, and decides which on the first frame.
    // Going back before then lands on a guess, so it is done after that frame, and once more after the next.
    let frames = place ? 2 : 0;
    let frame = 0;
    const settle = () => {
      if (place) goToPlace(region, place);
      frames -= 1;
      if (frames > 0) frame = requestAnimationFrame(settle);
      else {
        settled = true;
        keep();
      }
    };
    if (place) frame = requestAnimationFrame(settle);
    else settle();

    const byHand = () => {
      moved = true;
    };
    const onScroll = () => {
      if (!settled) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        keep();
        // Once the reader has moved on from the place a link named, the address stops naming it,
        // so that reloading returns to where they are and not to where the link went.
        if (moved && hash.current) navigate({ search: window.location.search, hash: "" }, { replace: true, state: state.current });
        moved = false;
      }, 250);
    };
    const hands = ["wheel", "touchmove", "keydown", "pointerdown"] as const;
    region.addEventListener("scroll", onScroll, { passive: true });
    for (const event of hands) region.addEventListener(event, byHand, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      region.removeEventListener("scroll", onScroll);
      for (const event of hands) region.removeEventListener(event, byHand);
    };
  }, [drawn, document.id, position, navigate]);

  const reason = reasonOf(chapter.error);
  const refused = chapter.error instanceof ApiError && (reason !== undefined || chapter.error.status === 404);

  return (
    <Scroller ref={scroller} label={`Text of ${bookTitle}`}>
      <BookPlace contents={contents} where={where} />
      {chapter.isPending ? (
        <TextSkeleton />
      ) : chapter.isError ? (
        refused ? (
          // The server's reason, where the chapter would be; the rest of the book is still a link away.
          <div className="max-w-[34rem] py-6">
            <span aria-hidden className="mb-4 block text-ink-muted [&_svg]:size-6">
              <FileWarning />
            </span>
            <h2 className="font-title text-heading text-ink">This chapter cannot be shown</h2>
            <p className="mt-2 text-body text-ink-muted">{chapter.error.message}</p>
            <div className="mt-6">
              <Button asChild>
                <a href={downloadUrl}>Download original</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-w-[46rem]">
            <ErrorState error={chapter.error} onRetry={() => chapter.refetch()} />
          </div>
        )
      ) : (
        <>
          {chapter.data.notes.length > 0 ? (
            <div className="mb-8 max-w-[48rem] border-b border-border pb-4 text-small text-ink-muted">
              {chapter.data.notes.map((note) => (
                <p key={note} className="[&+p]:mt-1">
                  {note}
                </p>
              ))}
            </div>
          ) : null}
          <BookLinksContext value={links}>
            <MarkdownDocument blocks={chapter.data.blocks} title="" empty="This part of the book has no words or pictures." />
          </BookLinksContext>
        </>
      )}
      {chapter.isPending ? null : <BookTurn previous={turn(position - 1)} next={turn(position + 1)} contents={contents} />}
    </Scroller>
  );
}

// ── The reader ───────────────────────────────────────────────────────────────

export function EpubReader({ document, downloadUrl }: { document: DocumentDto; downloadUrl: string }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const book = useEpubBook(document.id);
  const [plain, setPlain] = useState(false);
  const position = chapterInAddress(params);
  const heading = params.get("heading");

  // A search result names a chapter by its heading. Once the book is known, the address says the chapter instead.
  const chapters = book.data?.chapters;
  useEffect(() => {
    if (heading === null || !chapters) return;
    const next = new URLSearchParams(params);
    next.delete("heading");
    const found = position === null ? chapterForHeading(chapters, heading) : null;
    if (found !== null) next.set("chapter", String(found));
    const search = next.toString();
    navigate({ search: search ? `?${search}` : "", hash: location.hash }, { replace: true, state: location.state });
  }, [heading, chapters, position, params, navigate, location.hash, location.state]);

  const download = (
    <Button asChild>
      <a href={downloadUrl}>Download original</a>
    </Button>
  );

  // The text read for search, when the book itself cannot be shown and the person asks for it.
  if (plain) return <TextViewer document={document} downloadUrl={downloadUrl} />;

  if (book.isPending || (heading !== null && !book.isError)) {
    return (
      <Scroller label={document.title}>
        <TextSkeleton />
      </Scroller>
    );
  }

  if (book.isError) {
    const reason = reasonOf(book.error);
    if (reason === "protected") {
      return (
        <ViewerMessage icon={<Lock />} title="This book is copy-protected" actions={download}>
          <p>
            It is locked by a rights scheme (DRM), so Outpost cannot read it, and Outpost does not remove copy protection. The file is kept
            exactly as it was added.
          </p>
          <p>Download it to read it in the program it was bought for.</p>
        </ViewerMessage>
      );
    }
    if (reason !== undefined) {
      return (
        <ViewerMessage
          icon={<FileWarning />}
          title="This book could not be opened"
          actions={
            <>
              {download}
              {document.extraction === "done" && document.textChars > 0 ? (
                <Button variant="ghost" onClick={() => setPlain(true)}>
                  Show its plain text
                </Button>
              ) : null}
            </>
          }
        >
          <p className="text-ink">{book.error.message}</p>
          <p>The original file is safe. Download it to open it in another program.</p>
        </ViewerMessage>
      );
    }
    return (
      <Scroller label={document.title}>
        <div className="max-w-[46rem]">
          <ErrorState error={book.error} onRetry={() => book.refetch()} />
        </div>
      </Scroller>
    );
  }

  if (position === null) return <Front document={document} book={book.data} downloadUrl={downloadUrl} />;
  // Keyed, so that turning to another chapter starts at the top of it.
  return <Chapter key={position} document={document} book={book.data} position={position} downloadUrl={downloadUrl} />;
}
