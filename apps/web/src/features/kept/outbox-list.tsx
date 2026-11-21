/**
 * What was written on this phone and is waiting to be sent: shown on the out-of-reach
 * writing screen and on "On this device", with a way to send it now (when the server is
 * in reach) or take it off the phone.
 */
import { ClipboardCheck, FileText, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Joined, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { STATUS_WORDS } from "@/features/board/words";
import { notify } from "@/lib/notify";
import { formatDateTime, plural } from "@/lib/utils";
import { DEVICE } from "./device";
import { type OutboxItem, removeFromOutbox, type SentFromPhone, sendOutbox, tryAgain, useOutbox } from "./outbox";

/** "Sent 1 check-in and 2 pages written on this phone." */
export function sentWords(sent: SentFromPhone): string | null {
  const parts = [
    sent.checkIns > 0 ? plural(sent.checkIns, "check-in") : null,
    sent.pages.length > 0 ? plural(sent.pages.length, "page") : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return `Sent ${parts.join(" and ")} written on this ${DEVICE} while Outpost was out of reach.`;
}

const itemWords = (item: OutboxItem) =>
  item.kind === "checkin"
    ? `${item.author}: ${STATUS_WORDS[item.status]}${item.body ? `: ${item.body.split("\n")[0]}` : ""}${item.place ? ` · ${item.place}` : ""}`
    : item.title.trim() || "A page with no title";

export function OutboxList({ canSend = false }: { canSend?: boolean }) {
  const items = useOutbox();
  const [removing, setRemoving] = useState<OutboxItem | null>(null);
  const [sending, setSending] = useState(false);
  if (!items) return null;
  if (items.length === 0) return <p className="text-small text-ink-muted">Nothing is waiting.</p>;

  const send = async (run: () => Promise<SentFromPhone>) => {
    setSending(true);
    try {
      const sent = await run();
      const words = sentWords(sent);
      if (words) toast.success(words);
      else if (sent.refused === 0) notify.error("Outpost could not be reached. It is all still on this phone.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Rows aria-label="Waiting to be sent">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 py-2.5">
            {item.kind === "checkin" ? (
              <ClipboardCheck aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
            ) : (
              <FileText aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="break-words text-ink">{itemWords(item)}</p>
              <p className="text-small text-ink-muted">
                <Joined parts={[item.kind === "checkin" ? "Check-in" : "New page", `written ${formatDateTime(item.writtenAt)}`]} />
              </p>
              {item.refused ? (
                <p className="text-small text-danger">
                  Outpost refused it: {item.refused}{" "}
                  {canSend ? (
                    <Button variant="link" size="sm" onClick={() => void send(() => tryAgain(item))}>
                      Try again
                    </Button>
                  ) : null}
                </p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Take “${itemWords(item)}” off this ${DEVICE}`}
              onClick={() => setRemoving(item)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </Rows>
      {canSend ? (
        <Button className="mt-3" onClick={() => void send(sendOutbox)} loading={sending}>
          Send now
        </Button>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Take this off the ${DEVICE}?`}
        description={removing ? `“${itemWords(removing)}” has not been sent, and will be lost.` : ""}
        confirmLabel="Take it off"
        onConfirm={() => {
          if (removing) void removeFromOutbox(removing.id);
          setRemoving(null);
        }}
      />
    </>
  );
}
