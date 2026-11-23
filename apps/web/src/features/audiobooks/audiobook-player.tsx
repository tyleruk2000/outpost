/**
 * The player: where you are in the book, the controls, and the chapters.
 *
 * It shows on an audiobook's page (a book of several files, under Library →
 * Collections) and on an audio document's page (one file, or a chapter opened from
 * search, which plays its book from that chapter). See `player.ts` for how it plays.
 */
import type { AudiobookDto } from "@outpost/shared";
import { CircleAlert, Download, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward, Unplug } from "lucide-react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { byline, clockTime, factsLine, runningTime, spokenTime } from "./audiobook-data";
import { SPEEDS } from "./place";
import { SKIP_SECONDS, useAudiobookPlayer } from "./player";

const speedLabel = (speed: number) => `${speed}×`;

/** What LibriVox says about where its recordings are free to use, on every book from it. */
export function LicenceLine({ licence, note, className }: { licence: string | null; note: string | null; className?: string }) {
  if (!licence) return null;
  return (
    <p className={cn("text-small text-ink-muted", className)}>
      <span className="font-medium text-ink">{licence}.</span> Elsewhere it depends on the country.
      {note ? <span className="mt-1 block">{note}</span> : null}
    </p>
  );
}

export function AudiobookPlayer({
  book,
  startAt,
  showTitle = true,
  showByline = true,
  showLicenceNote = true,
}: {
  book: AudiobookDto;
  /** A chapter to begin with, by its document. */
  startAt?: string;
  /** False where the page's own heading already names the book. */
  showTitle?: boolean;
  /** False where the page already says who wrote and reads it. */
  showByline?: boolean;
  /** False where the page's details already quote the publisher's licence note. */
  showLicenceNote?: boolean;
}) {
  const player = useAudiobookPlayer(book, startAt);
  const { chapter, index, time, duration, playing, problem } = player;
  const count = book.chapters.length;
  const many = count > 1;
  const length = duration ?? chapter.seconds ?? 0;
  const left = length > 0 ? Math.max(0, length - time) : null;
  const away = !book.locationAvailable;
  const by = byline(book);
  const resumedHere = player.start.resumed && index === player.start.index && !playing && Math.abs(time - player.start.seconds) < 1;

  return (
    <section aria-label="Player" className="min-w-0">
      {showTitle ? <h2 className="font-title text-heading text-ink">{book.title}</h2> : null}
      {by && showByline ? <p className={cn("text-body text-ink-muted", showTitle && "mt-1")}>{by}</p> : null}
      <p className="tabular mt-1 text-small text-ink-muted">
        {factsLine({ chapterCount: count, totalSeconds: book.totalSeconds, sizeBytes: book.sizeBytes })}
      </p>

      {away ? (
        <Notice tone="warning" icon={<Unplug />} title="The storage holding this book is not connected" className="mt-4">
          Reconnect it and the book plays here again; your place is kept.{" "}
          <Link to="/storage" className="font-medium text-primary underline underline-offset-2">
            See storage locations
          </Link>
        </Notice>
      ) : null}

      <div className="mt-5 border-y border-border py-5">
        <p className="text-small text-ink-muted" aria-live="polite">
          {many ? `Chapter ${index + 1} of ${count}` : "Playing"}
          {player.finished ? ". Finished: play to hear it again from the start." : resumedHere ? `. Picks up where you left off.` : ""}
        </p>
        <p className="mt-0.5 font-title text-lead text-ink">{chapter.title}</p>

        <div className="mt-4">
          <input
            type="range"
            min={0}
            max={Math.max(length, 1)}
            step={1}
            value={Math.min(time, Math.max(length, 1))}
            onChange={(event) => player.seek(Number(event.target.value))}
            disabled={Boolean(problem) || away}
            aria-label="Position in this chapter"
            aria-valuetext={length ? `${spokenTime(time)} of ${spokenTime(length)}` : spokenTime(time)}
            className="block h-11 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="tabular -mt-1 flex justify-between text-small text-ink-muted">
            <span>{clockTime(time)}</span>
            <span>{left !== null ? `−${clockTime(left)}` : ""}</span>
          </div>
        </div>

        {problem ? (
          <Notice
            tone={problem.kind === "unplayable" ? "warning" : "danger"}
            icon={<CircleAlert />}
            title={problem.message}
            className="mt-3"
          >
            <a
              href={`${chapter.fileUrl}?download=1`}
              className="inline-flex items-center gap-1.5 font-medium text-primary underline underline-offset-2"
            >
              <Download aria-hidden className="size-4" /> Download this chapter
            </a>
          </Notice>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <Button size="lg" onClick={() => player.skip(-SKIP_SECONDS)} disabled={away} aria-label={`Back ${SKIP_SECONDS} seconds`}>
            <RotateCcw /> <span className="tabular">{SKIP_SECONDS}</span>
          </Button>
          <Button
            size="lg"
            variant="primary"
            className="sm:min-w-32"
            onClick={player.toggle}
            disabled={away || problem?.kind === "unplayable"}
            loading={playing && player.waiting}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause /> : <Play />} {playing ? "Pause" : resumedHere ? "Resume" : "Play"}
          </Button>
          <Button size="lg" onClick={() => player.skip(SKIP_SECONDS)} disabled={away} aria-label={`Forward ${SKIP_SECONDS} seconds`}>
            <span className="tabular">{SKIP_SECONDS}</span> <RotateCw />
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {many ? (
            <Button variant="ghost" onClick={() => player.goTo(index - 1)} disabled={index === 0}>
              <SkipBack /> Previous
            </Button>
          ) : (
            <span />
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-small text-ink-muted">
            <span aria-hidden>Speed</span>
            <Select
              aria-label="Playing speed"
              value={String(player.speed)}
              onChange={(value) => player.setSpeed(Number(value))}
              options={SPEEDS.map((speed) => ({ value: String(speed), label: speedLabel(speed) }))}
              className="w-[min(6rem,100%)]"
            />
          </div>
          {many ? (
            <Button variant="ghost" onClick={() => player.goTo(index + 1)} disabled={index === count - 1}>
              Next <SkipForward />
            </Button>
          ) : (
            <span />
          )}
        </div>
      </div>

      {/* The element itself has no controls of its own: the ones above are its controls. */}
      {/* biome-ignore lint/a11y/useMediaCaption: a spoken book has no captions to give; its text is not transcribed */}
      <audio ref={player.audioRef} preload="metadata" className="hidden" />

      {many ? (
        <section className="mt-8" aria-labelledby="audiobook-chapters">
          <h2 id="audiobook-chapters" className="text-lead font-semibold text-ink">
            Chapters
          </h2>
          <ol className="mt-2">
            {book.chapters.map((item, position) => {
              const current = position === index;
              const time = runningTime(item.seconds);
              return (
                <li key={item.documentId}>
                  <button
                    type="button"
                    onClick={() => player.goTo(position, { play: true })}
                    disabled={away}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "group -mx-3 flex min-h-11 w-[calc(100%+1.5rem)] items-baseline gap-3 rounded-control px-3 py-2.5 text-left transition-colors duration-(--duration-fast) hover:bg-surface disabled:cursor-not-allowed",
                      current && "bg-primary-soft hover:bg-primary-soft",
                    )}
                  >
                    <span aria-hidden className="tabular w-8 shrink-0 font-mono text-small text-ink-muted">
                      {String(position + 1).padStart(2, "0")}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 font-title text-body text-ink decoration-primary decoration-1 underline-offset-[0.22em] group-hover:underline",
                        current && "text-primary-soft-ink",
                      )}
                    >
                      {item.title}
                      {current ? <span className="sr-only"> (the chapter in the player)</span> : null}
                    </span>
                    {time ? <span className="tabular max-w-[40%] text-right text-small text-ink-muted">{time}</span> : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <LicenceLine licence={book.licence} note={showLicenceNote ? book.licenceNote : null} className="mt-8" />
      {book.sourceUrl ? (
        <p className="mt-2 text-small text-ink-muted">
          From{" "}
          <a href={book.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2">
            its page on LibriVox
          </a>
          . Your place is kept on this device only.
        </p>
      ) : (
        <p className="mt-2 text-small text-ink-muted">Your place is kept on this device only.</p>
      )}
    </section>
  );
}
