/** The two dialogs that change where a collection lives: moving it, and removing it. */
import { type CollectionDto, type CollectionJobResponse, formatBytes } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useStorage } from "@/lib/queries";
import { ChoiceList } from "../downloads/choice-list";
import { LocationPicker, locationProblem, preferredLocation } from "../downloads/location-picker";
import { type CollectionActivity, CollectionJobStatus } from "./collection-job";
import { isFinished, type RemoveChoice, removeChoices, removeLabel } from "./collection-meta";

function MoveSteps({ collection, activity, onClose }: { collection: CollectionDto; activity: CollectionActivity; onClose: () => void }) {
  const client = useQueryClient();
  const storage = useStorage();
  const [chosen, setChosen] = useState<string>();
  const [startedId, setStartedId] = useState<string>();

  const start = useMutation({
    mutationFn: (locationId: string) => api.post<CollectionJobResponse>(`/api/collections/${collection.id}/move`, { locationId }),
    onSuccess: ({ job }) => {
      setStartedId(job.id);
      activity.follow(job);
      void client.invalidateQueries({ queryKey: ["jobs"] });
      void client.invalidateQueries({ queryKey: ["collections"] });
    },
  });

  // ── Once started: progress, then the result ──
  if (startedId && activity.job?.id === startedId) {
    const finished = isFinished(activity.job);
    return (
      <>
        <DialogBody>
          <CollectionJobStatus activity={activity} dismissible={false} />
          {finished ? null : (
            <p className="mt-4 text-small text-ink-muted">
              You can close this window. The move carries on, and its progress stays on this screen and under Downloads.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant={finished ? "primary" : "secondary"} onClick={onClose}>
            {finished ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </>
    );
  }

  const others = (storage.data?.locations ?? []).filter((location) => location.id !== collection.locationId);
  const usable = (id: string | undefined) => {
    const location = others.find((item) => item.id === id);
    return location && locationProblem(location, collection.sizeBytes) === null ? location : undefined;
  };
  const selected = usable(chosen) ?? usable(preferredLocation(others, collection.sizeBytes));

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (selected) start.mutate(selected.id);
      }}
    >
      <DialogBody className="grid gap-4">
        <p className="text-small text-ink">
          <span className="tabular font-medium">{formatBytes(collection.sizeBytes)}</span> will be copied from “{collection.locationName}”
          to the location you choose. The original is removed only after the copy has been read back and found identical, so the collection
          stays readable throughout and nothing is lost if the move stops halfway.
        </p>
        <div>
          <p className="mb-1.5 text-small font-semibold text-ink">Move to</p>
          {storage.isPending ? (
            <div className="grid gap-2" aria-busy>
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : storage.isError ? (
            <Notice tone="danger">{errorMessage(storage.error)}</Notice>
          ) : others.length === 0 ? (
            <p className="text-small text-ink-muted">
              “{collection.locationName}” is the only storage location.{" "}
              <Link to="/storage" className="text-primary underline underline-offset-2">
                Add another in Storage
              </Link>{" "}
              to move collections onto it.
            </p>
          ) : (
            <>
              <LocationPicker
                label="Move to"
                locations={others}
                value={selected?.id}
                onChange={setChosen}
                requiredBytes={collection.sizeBytes}
              />
              {selected ? null : (
                <p className="mt-2 text-small text-ink">None of the other locations can take this collection right now.</p>
              )}
            </>
          )}
        </div>
        {start.isError ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {errorMessage(start.error)}
          </Notice>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={start.isPending} disabled={!selected}>
          Move collection
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MoveCollectionDialog({
  collection,
  activity,
  open,
  onOpenChange,
}: {
  collection: CollectionDto;
  activity: CollectionActivity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Move “${collection.title}”`}>
        {/* Mounted only while open, so every opening starts from the choice of location. */}
        {open ? <MoveSteps collection={collection} activity={activity} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Removing asks one thing the server also insists on: what happens to the files.
 * Neither answer is the default, so a multi-gigabyte archive is never deleted, or left
 * behind, by a reflex press of the confirm button.
 */
export function RemoveCollectionDialog({
  collection,
  open,
  onOpenChange,
  onRemoved,
}: {
  collection: CollectionDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => void;
}) {
  const client = useQueryClient();
  const { canDeleteFiles, initial } = removeChoices(collection);
  const [choice, setChoice] = useState<RemoveChoice | undefined>(initial);
  const [reminded, setReminded] = useState(false);

  useEffect(() => {
    if (open) {
      setChoice(initial);
      setReminded(false);
    }
  }, [open, initial]);

  const remove = useMutation({
    mutationFn: (deleteFiles: boolean) =>
      api.delete<{ ok: true; deletedFiles: boolean }>(`/api/collections/${collection.id}`, { deleteFiles }),
    onSuccess: (result) => {
      toast.success(
        result.deletedFiles
          ? `Removed “${collection.title}” and deleted its files.`
          : `Removed “${collection.title}” from Outpost. Its files were left in place.`,
      );
      void client.invalidateQueries({ queryKey: ["collections"] });
      void client.invalidateQueries({ queryKey: ["catalog"] });
      void client.invalidateQueries({ queryKey: ["storage"] });
      onOpenChange(false);
      onRemoved();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const size = formatBytes(collection.sizeBytes);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Remove “${collection.title}”?`}
      description="It leaves your library and no longer comes up in search. Choose what happens to its files."
      confirmLabel={removeLabel(choice)}
      confirmVariant={choice === "delete" ? "danger" : choice === "keep" ? "primary" : "secondary"}
      loading={remove.isPending}
      onConfirm={() => {
        if (choice) remove.mutate(choice === "delete");
        else setReminded(true);
      }}
    >
      <ChoiceList<RemoveChoice>
        label="What happens to the files"
        value={choice}
        onChange={(next) => {
          setChoice(next);
          setReminded(false);
        }}
        choices={[
          {
            value: "delete",
            title: "Delete the files too",
            detail: canDeleteFiles
              ? `Frees ${size} on “${collection.locationName}”. This cannot be undone; to have it again you download it again.`
              : `Not possible now: “${collection.locationName}” is not connected, so its files cannot be reached.`,
            disabled: !canDeleteFiles,
          },
          {
            value: "keep",
            title: "Only remove it from Outpost",
            detail: `Leaves the files where they are (${size} on “${collection.locationName}”).`,
          },
        ]}
      />
      {reminded && !choice ? (
        <p role="alert" className="mt-3 text-small text-danger">
          Choose one of the two before removing.
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
