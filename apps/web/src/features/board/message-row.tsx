/**
 * One entry in the board's history, set like a logbook rather than a messenger: who and
 * when in the margin (above the words on a phone), the words beneath, a hairline to the
 * next. No bubbles, no avatars.
 *
 * Words are drawn as text, never as markup: web addresses in them become links (only
 * http and https, opened in a new tab without telling the other site where from), and
 * nothing else. A removed message keeps its place and says who removed it and when.
 */
import { type BoardMessage, formatBytes, type MeshMeta, meshTransportOf } from "@outpost/shared";
import {
  CircleAlert,
  Copy,
  Download,
  FileText,
  LibraryBig,
  MapPin,
  MoreHorizontal,
  Pencil,
  RadioTower,
  ShieldCheck,
  TextSelect,
  Trash2,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Joined } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { deliveryWords, nodeName } from "@/features/mesh/words";
import { copyText } from "@/lib/clipboard";
import { formatTimeOfDay } from "@/lib/clock";
import { cn, formatDate } from "@/lib/utils";
import { isLong, linkPieces, whenWritten } from "./words";

export function MessageWords({ text, className, id }: { text: string; className?: string; id?: string }) {
  return (
    <p id={id} className={cn("max-w-[68ch] whitespace-pre-wrap text-ink [overflow-wrap:anywhere]", className)}>
      {linkPieces(text).map((piece, index) =>
        "href" in piece ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: the pieces of one text, in order, never reordered
            key={index}
            href={piece.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2"
          >
            {piece.text}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above
          <span key={index}>{piece.text}</span>
        ),
      )}
    </p>
  );
}

const STATUS = {
  safe: { icon: ShieldCheck, words: "Safe", tone: "text-success" },
  help: { icon: CircleAlert, words: "Needs help", tone: "text-danger" },
  other: { icon: MapPin, words: "Checked in", tone: "text-ink" },
} as const;

function CheckInHead({ message }: { message: BoardMessage }) {
  const status = STATUS[message.status ?? "other"];
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-1.5 font-medium", status.tone)}>
      <status.icon aria-hidden className="size-4 shrink-0 translate-y-0.5" />
      <Joined parts={[<span key="status">{status.words}</span>, message.place ? <span className="font-normal text-ink">{message.place}</span> : null]} />
    </p>
  );
}

function Position({ message }: { message: BoardMessage }) {
  if (!message.position) return null;
  const { lat, lon, accuracyM } = message.position;
  return (
    <p className="mt-1 text-small text-ink-muted">
      Position{" "}
      <Link
        to={`/maps?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&z=15`}
        className="font-mono text-[0.8125rem] text-primary underline decoration-1 underline-offset-[0.2em]"
      >
        {lat.toFixed(5)}, {lon.toFixed(5)}
      </Link>
      {accuracyM !== null ? `, to within ${accuracyM.toLocaleString("en-GB")} m` : ""}
    </p>
  );
}

function FileLine({ message, onAddToLibrary }: { message: BoardMessage; onAddToLibrary: () => void }) {
  const file = message.file!;
  if (file.gone) {
    return (
      <p className="flex items-center gap-2 text-small text-ink-muted">
        <FileText aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0 break-words">
          {file.name}, {formatBytes(file.sizeBytes)}:{" "}
          {file.gone.reason === "expired" ? "no longer kept, its days on the board were up" : "removed"}
        </span>
      </p>
    );
  }
  return (
    <div className="max-w-[34rem]">
      {file.picture && file.url ? (
        <img
          src={file.url}
          alt={`Sent by ${message.author}: ${file.name}`}
          loading="lazy"
          className="mb-2 max-h-72 max-w-full rounded-panel border border-border bg-surface object-contain"
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-panel border border-border px-3 py-2">
        <FileText aria-hidden className="size-4 shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 font-medium break-words text-ink">{file.name}</span>
        <span className="tabular text-small text-ink-muted">{formatBytes(file.sizeBytes)}</span>
        <span className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button asChild size="sm" variant="secondary">
            <a href={file.url ?? undefined} download={file.name}>
              <Download aria-hidden /> Save
            </a>
          </Button>
          <Button size="sm" variant="ghost" onClick={onAddToLibrary}>
            <LibraryBig aria-hidden /> Add to library
          </Button>
        </span>
      </div>
      <p className="mt-1 text-micro text-ink-muted">
        {file.expiresAt
          ? `Kept until ${formatDate(file.expiresAt)}, ${formatTimeOfDay(file.expiresAt)}.`
          : "Kept until someone removes it."}
      </p>
    </div>
  );
}

/** Selects a message's words, for a device that cannot copy from a script (a plain http page has no clipboard). */
function selectText(element: HTMLElement | null) {
  if (!element) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Copies the words with the shared helper; where a browser will not, selects them for the device's own Copy. */
async function copyWords(text: string, element: HTMLElement | null) {
  if (await copyText(text)) {
    toast.success("Copied");
    return;
  }
  selectText(element);
  toast("The words are selected. Use your device's own Copy.");
}

export function MessageRow({
  message,
  name,
  onEdit,
  onRemove,
  onAddToLibrary,
}: {
  message: BoardMessage;
  /** This device's name; without one, nothing can be changed. */
  name: string | null;
  onEdit: () => void;
  onRemove: () => void;
  onAddToLibrary: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wordsId = useId();
  const long = isLong(message.body);
  const time = <time dateTime={new Date(message.createdAt).toISOString()}>{whenWritten(message.createdAt)}</time>;
  const canCopy = message.body.length > 0;
  // A radio channel's message: heard by radio, or written here to go out by it. It cannot be changed once sent; removing it removes it here only.
  const radio = meshTransportOf(message.channel) !== null;
  const meta = message.meta as MeshMeta | null;
  const heard = message.source !== "here";
  const node = heard ? nodeName(meta) : null;
  const delivery = radio && !heard && !message.removed ? deliveryWords(meta) : null;

  let content: ReactNode;
  if (message.removed) {
    content = (
      <p className="text-small text-ink-muted italic">
        {message.kind === "checkin" ? "Check-in" : message.file ? "Message and file" : "Message"} removed by {message.removed.by} at{" "}
        {whenWritten(message.removed.at)}.
      </p>
    );
  } else {
    content = (
      <>
        {message.kind === "checkin" ? <CheckInHead message={message} /> : null}
        {message.body ? (
          <div className={cn(message.kind === "checkin" && "mt-0.5")}>
            <div className={cn(long && !open && "line-clamp-[8]")}>
              <MessageWords id={wordsId} text={message.body} />
            </div>
            {long ? (
              <div className="mt-1 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded={open}
                  aria-controls={wordsId}
                  onClick={() => setOpen(!open)}
                  className="-ml-2.5"
                >
                  {open ? "Show less" : "Show all of it"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void copyWords(message.body, document.getElementById(wordsId))}>
                  <Copy aria-hidden /> Copy the words
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {message.kind === "checkin" ? <Position message={message} /> : null}
        {message.file ? (
          <div className="mt-1.5">
            <FileLine message={message} onAddToLibrary={onAddToLibrary} />
          </div>
        ) : null}
        {delivery ? (
          <p className={cn("mt-1 flex items-baseline gap-1.5 text-micro", delivery.failed ? "text-danger" : "text-ink-muted")}>
            {delivery.failed ? <CircleAlert aria-hidden className="size-3.5 shrink-0 translate-y-0.5" /> : null}
            {delivery.text}
          </p>
        ) : null}
        {message.edited ? (
          <p className="mt-1 text-micro text-ink-muted">
            Changed by {message.edited.by} at {whenWritten(message.edited.at)}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-3 md:grid-cols-[9.5rem_minmax(0,1fr)_auto] md:gap-x-5">
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-small md:block">
        <span className="font-semibold break-words text-ink">{node?.name ?? message.author}</span>
        {node?.short ? (
          <span className="rounded-full bg-surface-strong px-1.5 font-mono text-micro text-ink-muted" title="Short name on the radio">
            {node.short}
          </span>
        ) : null}
        {heard ? (
          <span className="inline-flex items-center gap-1 text-micro text-ink-muted md:flex">
            <RadioTower aria-hidden className="size-3.5 shrink-0" />
            by radio
          </span>
        ) : null}
        <span className="tabular text-micro text-ink-muted md:block">{time}</span>
      </header>
      <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1">{content}</div>
      {message.removed ? (
        <span />
      ) : (
        <Menu>
          <MenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`What to do with ${node?.name ?? message.author}'s ${message.kind === "checkin" ? "check-in" : "message"}`}
              className="-my-1 col-start-2 row-start-1 md:col-start-3"
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </MenuTrigger>
          <MenuContent>
            {canCopy ? (
              <MenuItem onSelect={() => void copyWords(message.body, document.getElementById(wordsId))}>
                {navigator.clipboard && window.isSecureContext ? <Copy aria-hidden /> : <TextSelect aria-hidden />}
                {navigator.clipboard && window.isSecureContext ? "Copy the words" : "Select the words"}
              </MenuItem>
            ) : null}
            {radio ? null : (
              <MenuItem disabled={!name} onSelect={onEdit}>
                <Pencil aria-hidden /> Change
              </MenuItem>
            )}
            <MenuItem danger disabled={!name} onSelect={onRemove}>
              <Trash2 aria-hidden /> Remove
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
    </li>
  );
}
