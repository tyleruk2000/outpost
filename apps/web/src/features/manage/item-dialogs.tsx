/** Removing and moving a selection: each shows what the selection adds up to before anything happens. */
import { formatBytes, type ManagedItem, type ManageMoveResponse } from "@outpost/shared";
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { useStorage } from "@/lib/queries";
import { plural } from "@/lib/utils";
import { ChoiceList } from "../downloads/choice-list";
import { LocationPicker, locationProblem, preferredLocation } from "../downloads/location-picker";
import { useCleanup, useMoveItems, usePlan, useRemoveItems } from "./manage-data";
import { planSentences, tallyOf, tallyText } from "./manage-text";
import { FileList, PlanSkeleton, PlanTables, RefusedNotice } from "./plan-summary";

function RemoveSteps({ items, onClose, onStarted }: { items: ManagedItem[]; onClose: () => void; onStarted: () => void }) {
  const [files, setFiles] = useState<"delete" | "keep">("delete");
  const [forget, setForget] = useState(false);
  const keys = items.map((item) => item.key);
  const disconnected = forget ? "forget" : "leave";
  const plan = usePlan({ scope: "items", keys, files, disconnected });
  const remove = useRemoveItems();
  const data = plan.data;
  const acts = data?.changes ?? 0;
  // A person's own files cannot be fetched again: deleting several at once is erasing, and
  // from another device the server refuses it. Said here, before the button is pressed.
  const erase = useCleanup().data?.erase;
  const own = items.filter((item) => item.origin === "own").length;
  const onlyOneByOne = files === "delete" && erase?.allowed === false && own > 1;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        remove.mutate({ keys, files, disconnected }, { onSuccess: onStarted });
      }}
    >
      <DialogBody className="grid gap-4">
        <ChoiceList
          label="What to remove"
          value={files}
          onChange={setFiles}
          choices={[
            {
              value: "delete",
              title: "Delete the files",
              detail: "They are removed from Outpost and deleted from their storage location.",
            },
            {
              value: "keep",
              title: "Keep the files, remove only Outpost's records",
              detail: "They leave the library and search. The files stay where they are.",
            },
          ]}
        />
        {plan.isPending ? (
          <PlanSkeleton />
        ) : plan.isError ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {errorMessage(plan.error)}
          </Notice>
        ) : data ? (
          <>
            <div className="grid gap-1.5 text-small text-ink">
              {planSentences(data, { files, disconnected }).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            {files === "delete" ? <PlanTables plan={data} /> : null}
            {files === "delete" && data.disconnected.count > 0 ? (
              <div className="rounded-panel bg-warning-soft px-4 py-3 text-small">
                <p className="font-semibold text-warning">
                  {plural(data.disconnected.count, "item")} {data.disconnected.count === 1 ? "is" : "are"} on a location that is not
                  connected
                </p>
                <p className="mt-0.5 text-ink">
                  {data.disconnected.count === 1 ? "Its file" : "Their files"} cannot be deleted from here. Left alone,{" "}
                  {data.disconnected.count === 1 ? "it stays" : "they stay"} in your library until the drive is back.
                </p>
                <FileList
                  files={data.disconnected.files.slice(0, 5)}
                  more={data.disconnected.count - Math.min(5, data.disconnected.files.length)}
                />
                <label htmlFor="forget-disconnected" className="mt-3 flex cursor-pointer items-start gap-2.5 text-ink">
                  <Checkbox
                    id="forget-disconnected"
                    checked={forget}
                    onCheckedChange={(checked) => setForget(checked === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Forget {data.disconnected.count === 1 ? "it" : "them"} anyway. Outpost's{" "}
                    {data.disconnected.count === 1 ? "record is" : "records are"} removed; the{" "}
                    {data.disconnected.count === 1 ? "file stays" : "files stay"} on the drive.
                  </span>
                </label>
              </div>
            ) : null}
            <RefusedNotice refused={data.refused} />
            {items
              .filter((item) => item.warning)
              .map((item) => (
                <Notice key={item.key} tone="warning" icon={<CircleAlert />} title={`Without ${item.title}`}>
                  {item.warning}
                </Notice>
              ))}
          </>
        ) : null}
        {onlyOneByOne ? (
          <Notice tone="warning" icon={<CircleAlert />} title="Not from this device, all at once">
            {plural(own, "of the chosen items is", "of the chosen items are")} your own, and their files cannot be fetched again. Deleting
            several of them in one step can only be done on the computer Outpost runs on. From here, remove them one at a time, or choose to
            keep the files.
          </Notice>
        ) : null}
        {remove.isError ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {errorMessage(remove.error)}
          </Notice>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="danger" loading={remove.isPending} disabled={!data || acts === 0 || onlyOneByOne}>
          {files === "keep" ? `Forget ${plural(acts, "item")}` : `Remove ${plural(acts, "item")}`}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RemoveItemsDialog({
  items,
  open,
  onOpenChange,
  onStarted,
}: {
  items: ManagedItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={items.length === 1 ? `Remove “${items[0]!.title}”` : `Remove ${plural(items.length, "item")}`}
        description="Read what will happen, then confirm. Nothing is removed until you do."
      >
        {/* Mounted only while open, so every opening asks the server afresh. */}
        {open ? <RemoveSteps items={items} onClose={() => onOpenChange(false)} onStarted={onStarted} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MoveSteps({ items, onClose }: { items: ManagedItem[]; onClose: () => void }) {
  const storage = useStorage();
  const move = useMoveItems();
  const [chosen, setChosen] = useState<string>();
  const [outcome, setOutcome] = useState<ManageMoveResponse>();
  const selection = tallyOf(items);

  if (outcome) {
    const moving = outcome.jobs.length;
    return (
      <>
        <DialogBody className="grid gap-3 text-small text-ink">
          <p>
            {moving > 0
              ? `The move has started as ${plural(moving, "job")}. Each copy is checked before its original is removed, and the items stay readable throughout.`
              : "Nothing could be moved."}{" "}
            {moving > 0 ? (
              <Link to="/downloads" className="text-primary underline underline-offset-2">
                Follow it under Downloads and tasks
              </Link>
            ) : null}
          </p>
          <RefusedNotice refused={outcome.refused} />
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </>
    );
  }

  const locations = storage.data?.locations ?? [];
  // Items already on the chosen location are named afterwards rather than blocking the rest.
  const needed = (id: string) => items.filter((item) => item.locationId !== id).reduce((sum, item) => sum + item.sizeBytes, 0);
  const usable = (id: string | undefined) => {
    const location = locations.find((entry) => entry.id === id);
    return location && locationProblem(location, needed(location.id)) === null ? location : undefined;
  };
  const elsewhere = locations.filter((location) => items.some((item) => item.locationId !== location.id));
  const selected = usable(chosen) ?? usable(preferredLocation(elsewhere, selection.bytes));
  const staying = selected ? items.filter((item) => item.locationId === selected.id).length : 0;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (selected) move.mutate({ keys: items.map((item) => item.key), locationId: selected.id }, { onSuccess: setOutcome });
      }}
    >
      <DialogBody className="grid gap-4">
        <p className="text-small text-ink">
          <span className="tabular font-medium">{tallyText(selection)}</span> selected. Each is copied to the location you choose, the copy
          is checked, and only then is the original removed. Nothing is lost if a move stops halfway.
        </p>
        {storage.isPending ? (
          <PlanSkeleton />
        ) : storage.isError ? (
          <Notice tone="danger">{errorMessage(storage.error)}</Notice>
        ) : elsewhere.length === 0 ? (
          <p className="text-small text-ink-muted">
            Everything selected is already on the only storage location.{" "}
            <Link to="/storage" className="text-primary underline underline-offset-2">
              Add another in Storage
            </Link>{" "}
            to move things onto it.
          </p>
        ) : (
          <div>
            <p className="mb-1.5 text-small font-semibold text-ink">Move to</p>
            <LocationPicker
              label="Move to"
              locations={elsewhere}
              value={selected?.id}
              onChange={setChosen}
              requiredBytes={selected ? needed(selected.id) : selection.bytes}
            />
            {selected ? (
              <p className="tabular mt-2 text-small text-ink-muted">
                {formatBytes(needed(selected.id))} will be copied to “{selected.name}”.
                {staying > 0
                  ? ` ${plural(staying, "item")} already there ${staying === 1 ? "stays" : "stay"} as ${staying === 1 ? "it is" : "they are"}.`
                  : ""}
              </p>
            ) : (
              <p className="mt-2 text-small text-ink">None of the locations can take this selection right now.</p>
            )}
          </div>
        )}
        {move.isError ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {errorMessage(move.error)}
          </Notice>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={move.isPending} disabled={!selected}>
          Move {plural(items.length - staying, "item")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MoveItemsDialog({
  items,
  open,
  onOpenChange,
}: {
  items: ManagedItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={items.length === 1 ? `Move “${items[0]!.title}”` : `Move ${plural(items.length, "item")}`}>
        {open ? <MoveSteps items={items} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
