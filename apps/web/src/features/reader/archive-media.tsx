/**
 * A recording or a film inside a reference collection, played over the list that named it.
 *
 * The browser plays it with its own player, straight out of the collection. Which kinds
 * it can play is the browser's business (a WAV recording and a WebM film were tried in
 * Chromium). When it cannot, this says so and offers the file itself, which opens
 * apart from Outpost, in the same sandbox as any page of the collection.
 */
import { archiveFileKind } from "@outpost/shared";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";

export function ArchiveMedia({
  url,
  path,
  label,
  backLabel = "Back to the page",
  onClose,
}: {
  /** Address of the file as the collection serves it. */
  url: string;
  /** Path of the file inside the book. */
  path: string;
  label: string;
  backLabel?: string;
  onClose(): void;
}) {
  const [failed, setFailed] = useState(false);
  const isVideo = archiveFileKind(path) === "video";
  const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toUpperCase();

  return (
    <div className="absolute inset-0 flex flex-col bg-page">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-2 py-1.5 md:px-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft /> {backLabel}
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-small font-medium text-ink" title={label}>
          {label}
        </h2>
        <Button asChild size="sm" variant="ghost">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink /> Open the file
          </a>
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto bg-surface p-4 md:p-8">
        {failed ? (
          <Notice tone="warning" title="This file cannot be played here" className="max-w-[34rem]">
            The browser could not play it. It may be of a kind the browser has no player for{extension ? ` (${extension})` : ""}, or the
            collection may not hold it. “Open the file” hands it to the browser, which can save it for another program to play.
          </Notice>
        ) : isVideo ? (
          // biome-ignore lint/a11y/useMediaCaption: the collection holds the film and nothing else; there are no captions to offer
          <video
            key={url}
            src={url}
            controls
            preload="metadata"
            playsInline
            onError={() => setFailed(true)}
            className="max-h-full max-w-full rounded-panel"
            aria-label={label}
          />
        ) : (
          <>
            <p className="max-w-[34rem] text-center font-title text-heading text-ink">{label}</p>
            {/* biome-ignore lint/a11y/useMediaCaption: the collection holds the recording and nothing else; there is no transcript to offer */}
            <audio
              key={url}
              src={url}
              controls
              preload="metadata"
              onError={() => setFailed(true)}
              className="w-full max-w-[34rem]"
              aria-label={label}
            />
          </>
        )}
      </div>
    </div>
  );
}
