/**
 * Messages: the household's board on the home network. One shared place, like a board on
 * the kitchen wall: everyone's latest check-in at the top, the history beneath with the
 * newest at the bottom, then somewhere to write and a way to send a file to another device.
 *
 * Not a messenger: no private messages, read receipts, typing indicators or reactions.
 * New messages arrive by the live-events stream (`board.changed` refreshes every "board"
 * query); nothing polls, and a hidden tab fetches nothing until it is shown.
 */
import { BOARD_CHANNEL, type BoardCheckInInput, type BoardMessage, type MeshChannel, meshTransportOf } from "@outpost/shared";
import { RadioTower } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Page, PageHeader, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { setBoardChannel, useMesh, useStoredBoardChannel } from "@/features/mesh/data";
import { CHANNEL_WARNING } from "@/features/mesh/words";
import { ApiError, errorMessage } from "@/lib/api";
import { useClockStyle } from "@/lib/clock";
import { notify } from "@/lib/notify";
import { usePageVisible } from "@/lib/page-visible";
import { CheckInControls, CheckInStrip } from "./check-ins";
import { ChooseName, SendFile, WriteMessage } from "./compose";
import { allMessages, markSeen, useAddToLibrary, useBoardMessages, useBoardSummary, useDeviceName, useEdit, useRemove } from "./data";
import { MessageRow } from "./message-row";

export default function BoardPage() {
  useClockStyle();
  const name = useDeviceName();
  const [renaming, setRenaming] = useState(false);
  const summary = useBoardSummary();
  // The radio channels carried, beside Home; none when no radio link is set up (or the server has none to say).
  const mesh = useMesh();
  const radioChannels = mesh.data?.channels ?? [];
  const stored = useStoredBoardChannel();
  const channel = radioChannels.find((entry) => entry.id === stored) ?? null;
  const messages = useBoardMessages(channel?.id ?? BOARD_CHANNEL);
  const list = allMessages(messages.data);
  const shown = usePageVisible();
  const [editing, setEditing] = useState<BoardMessage | null>(null);
  const [removing, setRemoving] = useState<BoardMessage | null>(null);
  const [adding, setAdding] = useState<BoardMessage | null>(null);
  const remove = useRemove();
  const addToLibrary = useAddToLibrary();
  const navigate = useNavigate();

  // What is on screen while the page is in view has been seen on this device (the line on Home counts from it).
  // Only Home's: the line on Home counts the household's board, not a radio channel.
  const newest = channel ? undefined : list.at(-1)?.createdAt;
  useEffect(() => {
    if (shown && newest) markSeen(newest);
  }, [shown, newest]);

  const people = summary.data?.people ?? [];

  return (
    <Page width="reading">
      <PageHeader
        title="Messages"
        description="The household's board. There are no accounts: anyone on the home network can read everything here, post under any name, and change or remove any message. It does not wake a locked phone."
      />

      {name === null || renaming ? (
        <Section
          title={name === null ? "Who is using this device?" : "Change the name on this device"}
          description="Kept on this device only, and shown beside what you post."
        >
          <ChooseName people={people} current={name} onDone={name === null ? undefined : () => setRenaming(false)} />
        </Section>
      ) : (
        <p className="-mt-4 mb-6 flex flex-wrap items-center gap-x-2 text-small text-ink-muted">
          Posting from this device as <span className="font-semibold text-ink">{name}</span>
          <Button variant="link" size="sm" onClick={() => setRenaming(true)}>
            Change
          </Button>
        </p>
      )}

      {radioChannels.length > 0 ? <ChannelSwitch channels={radioChannels} current={channel} /> : null}

      {channel ? (
        <Section
          title="Check in by radio"
          description={`Goes out on ${channel.label} as a message, with your name in front. The household's check-ins are under Home.`}
        >
          {name ? (
            <CheckInControls key={channel.id} name={name} channel={channel} />
          ) : (
            <p className="text-small text-ink-muted">Choose a name above to check in.</p>
          )}
        </Section>
      ) : (
        <Section title="Check-ins" description="Each person's latest, so you can see at a glance that everyone is all right.">
          <CheckInStrip summary={summary.data} />
          {summary.isError ? <ErrorState error={summary.error} onRetry={() => void summary.refetch()} /> : null}
          {name ? <CheckInControls name={name} /> : <p className="mt-3 text-small text-ink-muted">Choose a name above to check in.</p>}
        </Section>
      )}

      <Section
        title={channel ? channel.label : "The board"}
        description={
          channel ? "Heard by the radio on this channel, and written here for it. Newest at the bottom." : "Newest at the bottom."
        }
      >
        {messages.isPending ? (
          <div className="grid gap-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-20" />
          </div>
        ) : messages.isError ? (
          <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
        ) : list.length === 0 ? (
          channel ? (
            <EmptyState title={`Nothing on ${channel.label} yet`} compact>
              A message the radio hears on this channel, or one written here for it, shows here.
            </EmptyState>
          ) : (
            <EmptyState title="Nothing on the board yet" compact>
              A message written here, a check-in or a file sent from a phone shows here for everyone in the household.
            </EmptyState>
          )
        ) : (
          <>
            {messages.hasNextPage ? (
              <Button variant="ghost" className="mb-2" loading={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>
                Show earlier messages
              </Button>
            ) : null}
            <ol aria-label="Messages, oldest first" className="divide-y divide-border border-y border-border">
              {list.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  name={name}
                  onEdit={() => setEditing(message)}
                  onRemove={() => setRemoving(message)}
                  onAddToLibrary={() => setAdding(message)}
                />
              ))}
            </ol>
          </>
        )}
      </Section>

      {name ? (
        <>
          <Section title={channel ? "Write by radio" : "Write"} className="mt-8">
            <WriteMessage key={channel?.id ?? BOARD_CHANNEL} name={name} channel={channel} />
          </Section>
          {/* A file cannot go by radio. */}
          {channel ? null : (
            <Section title="Send a file">
              <SendFile name={name} summary={summary.data} />
            </Section>
          )}
        </>
      ) : null}

      {editing && name ? <EditDialog key={editing.id} message={editing} name={name} onClose={() => setEditing(null)} /> : null}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing?.kind === "checkin" ? `Remove ${removing.author}'s check-in?` : `Remove ${removing?.author ?? ""}'s message?`}
        description={
          removing && meshTransportOf(removing.channel) ? (
            <>
              It is removed from the board here only: what went out by radio cannot be called back. The board keeps a line in its place
              saying that {name ?? "you"} removed it, and when.
            </>
          ) : (
            <>
              It is removed for everyone{removing?.file && !removing.file.gone ? `, and “${removing.file.name}” with it` : ""}. The board
              keeps a line in its place saying that {name ?? "you"} removed it, and when.
            </>
          )
        }
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() =>
          removing &&
          name &&
          remove.mutate(
            { id: removing.id, by: name },
            { onSuccess: () => setRemoving(null), onError: (error) => notify.error(errorMessage(error)) },
          )
        }
      />

      <ConfirmDialog
        open={adding !== null}
        onOpenChange={(open) => !open && setAdding(null)}
        title={`Add “${adding?.file?.name ?? ""}” to the library?`}
        description={
          <>
            A copy goes into the library, where it is kept, searched and backed up like any document, and anyone using Outpost can open it.
            Do this only if the file is fit for that: other people's details and anything private are better saved to your own device. The
            file on the board is left as it is.
          </>
        }
        confirmLabel="Add to library"
        confirmVariant="primary"
        loading={addToLibrary.isPending}
        onConfirm={() =>
          adding?.file &&
          addToLibrary.mutate(adding.file.id, {
            onSuccess: (outcome) => {
              setAdding(null);
              toast.success(
                outcome.status === "duplicate"
                  ? `Already in the library as “${outcome.document.title}”`
                  : `Added to the library as “${outcome.document.title}”`,
                {
                  action: { label: "Open", onClick: () => navigate(`/library/documents/${outcome.document.id}`) },
                },
              );
            },
            onError: (error) => notify.error(errorMessage(error)),
          })
        }
      />
      <p className="mt-10 text-small text-ink-muted">
        Messages are not added to search and are never sent to a model server. Files are kept in Outpost's own data folder.{" "}
        <Link to="/storage/manage" className="text-primary underline underline-offset-2">
          Manage and clean up
        </Link>{" "}
        empties the board.
      </p>
    </Page>
  );
}

/** Home and each radio channel carried. The choice is kept on this device. */
function ChannelSwitch({ channels, current }: { channels: MeshChannel[]; current: MeshChannel | null }) {
  // Two channels of the same name on the two firmwares are told apart by which.
  const label = (entry: MeshChannel) =>
    channels.some((other) => other !== entry && other.label === entry.label)
      ? `${entry.label} (${entry.transport === "meshtastic" ? "Meshtastic" : "MeshCore"})`
      : entry.label;
  return (
    <div className="mb-8 grid gap-2">
      <Segmented
        label="Which board to read and write"
        value={current?.id ?? BOARD_CHANNEL}
        onChange={setBoardChannel}
        options={[
          { value: BOARD_CHANNEL, label: "Home" },
          ...channels.map((entry) => ({ value: entry.id, label: label(entry), icon: <RadioTower aria-hidden /> })),
        ]}
      />
      {current ? (
        <>
          <p className="text-small text-ink-muted">{CHANNEL_WARNING}</p>
          {current.linkUp ? null : (
            <p className="text-small text-warning">The radio link is not up. What is written now is kept here and marked as not gone.</p>
          )}
        </>
      ) : null}
    </div>
  );
}

function EditDialog({ message, name, onClose }: { message: BoardMessage; name: string; onClose: () => void }) {
  const edit = useEdit();
  const [body, setBody] = useState(message.body);
  const [place, setPlace] = useState(message.place ?? "");
  const [status, setStatus] = useState<NonNullable<BoardCheckInInput["status"]>>(message.status ?? "other");
  const checkIn = message.kind === "checkin";
  const save = () =>
    edit.mutate(
      {
        id: message.id,
        by: name,
        body,
        baseUpdatedAt: message.updatedAt,
        ...(checkIn ? { place: place.trim() || null, status } : {}),
      },
      {
        onSuccess: onClose,
        onError: (error) => {
          notify.error(errorMessage(error));
          if (error instanceof ApiError && error.status === 409) onClose();
        },
      },
    );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={checkIn ? `Change ${message.author}'s check-in` : `Change ${message.author}'s message`}
        description={`It will say it was changed by ${name}.`}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <DialogBody className="grid gap-4">
            {checkIn ? (
              <Segmented
                label="How they are"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "safe", label: "Safe" },
                  { value: "help", label: "Need help" },
                  { value: "other", label: "Just words" },
                ]}
              />
            ) : null}
            <Field label="Words" optional={checkIn || message.file !== null}>
              {(ids) => <Textarea {...ids} value={body} rows={5} maxLength={10_000} onChange={(event) => setBody(event.target.value)} />}
            </Field>
            {checkIn ? (
              <Field label="Where, in a few words" optional>
                {(ids) => <Input {...ids} value={place} maxLength={120} onChange={(event) => setPlace(event.target.value)} />}
              </Field>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={edit.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
