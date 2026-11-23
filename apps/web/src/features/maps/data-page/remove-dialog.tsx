/**
 * Removing one piece of map data, with what stops working and what is freed said first. A file
 * on a storage location (a map, terrain, satellite pictures, a country file) asks whether to
 * delete it or leave it where it is; nothing is deleted without that choice.
 */
import { formatBytes, type MapDataItem } from "@outpost/shared";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ChoiceList } from "@/features/downloads/choice-list";
import { usePacks, useRemovePack } from "@/features/layers/data";
import { useRemovePlaces, useRemoveRegion } from "../data";
import { useRemoveRoadNetwork } from "../road-route/data";

const WHAT_STOPS: Record<MapDataItem["kind"], string> = {
  map: "The map will show only outlines here unless another map covers the area.",
  terrain: "Hill shading, contour lines and heights will no longer be drawn for this area.",
  imagery: "The satellite pictures will no longer be drawn under the map here.",
  extract: "Roads and places made from it keep working. Rebuilding or refreshing them will download the country file again.",
  names: "Search will no longer find these places by name. The list can be downloaded again at any time.",
  roads: "Routes can no longer be planned through it. Saved routes keep their directions.",
  places: "Its places leave the map and the lists of what is nearest.",
};

/** A file on a storage location: removed through the collections, with the file deleted or left. */
function RemoveFile({ item, open, onOpenChange }: { item: MapDataItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [choice, setChoice] = useState<"delete" | "keep">();
  const [needsChoice, setNeedsChoice] = useState(false);
  const remove = useRemoveRegion();
  const available = item.state !== "location-offline";
  const where = item.locationName ?? "its storage location";
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setChoice(undefined);
          setNeedsChoice(false);
        }
        onOpenChange(next);
      }}
      title={`Remove “${item.title}”?`}
      description={WHAT_STOPS[item.kind]}
      confirmLabel={choice === "delete" ? "Remove and delete the file" : choice === "keep" ? "Remove, keep the file" : "Remove"}
      loading={remove.isPending}
      onConfirm={() => {
        if (!choice) return setNeedsChoice(true);
        if (!item.collectionId) return;
        remove.mutate(
          { id: item.collectionId, deleteFiles: choice === "delete" },
          {
            onSuccess: () => {
              onOpenChange(false);
              toast.success(
                choice === "delete"
                  ? `Removed “${item.title}” and deleted its file.`
                  : `Removed “${item.title}”. Its file was left on ${where}.`,
              );
            },
          },
        );
      }}
    >
      <ChoiceList
        label="What happens to the file"
        value={choice}
        onChange={(value) => {
          setChoice(value);
          setNeedsChoice(false);
        }}
        choices={[
          {
            value: "delete",
            title: "Delete the file",
            detail: available
              ? `Frees ${formatBytes(item.sizeBytes)} on ${where}`
              : `${where} is not connected, so the file cannot be deleted now`,
            disabled: !available,
          },
          { value: "keep", title: "Keep the file", detail: `Outpost stops using it; the file stays on ${where}` },
        ]}
      />
      {needsChoice ? (
        <p role="alert" className="mt-2 text-small text-danger">
          Choose what happens to the file first.
        </p>
      ) : null}
    </ConfirmDialog>
  );
}

function RemoveNames({ item, open, onOpenChange }: { item: MapDataItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const remove = useRemovePlaces();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Remove “${item.title}”?`}
      description={WHAT_STOPS.names}
      confirmLabel="Remove place names"
      loading={remove.isPending}
      onConfirm={() =>
        item.collectionId &&
        remove.mutate({ id: item.collectionId } as Parameters<typeof remove.mutate>[0], {
          onSuccess: () => {
            onOpenChange(false);
            toast.success(`Removed “${item.title}”.`);
          },
        })
      }
    />
  );
}

function RemoveRoads({ item, open, onOpenChange }: { item: MapDataItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const remove = useRemoveRoadNetwork();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Remove “${item.title}”?`}
      description={`${WHAT_STOPS.roads} A kept country file stays where it is.`}
      confirmLabel="Remove roads"
      loading={remove.isPending}
      onConfirm={() =>
        item.networkId &&
        remove.mutate(item.networkId, {
          onSuccess: () => {
            onOpenChange(false);
            toast.success(`Removed “${item.title}”.`);
          },
        })
      }
    />
  );
}

function RemovePlaces({ item, open, onOpenChange }: { item: MapDataItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const remove = useRemovePack();
  const packs = usePacks();
  const pack = packs.data?.find((each) => each.id === item.packId);
  const imported = pack?.origin === "import";
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Remove “${item.title}”?`}
      description={`${WHAT_STOPS.places} ${imported ? "The file you imported is left where it is." : "It can be downloaded again."}`}
      confirmLabel="Remove"
      loading={remove.isPending}
      onConfirm={() =>
        item.packId &&
        remove.mutate(
          { id: item.packId, deleteFiles: !imported },
          {
            onSuccess: () => {
              onOpenChange(false);
              toast.success(`Removed “${item.title}”.`);
            },
          },
        )
      }
    />
  );
}

export function RemoveDialog(props: { item: MapDataItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (props.item.kind === "roads") return <RemoveRoads {...props} />;
  if (props.item.kind === "places") return <RemovePlaces {...props} />;
  if (props.item.kind === "names") return <RemoveNames {...props} />;
  return <RemoveFile {...props} />;
}

/** Whether a row's thing can be removed from here: what is here, not what is on its way. */
export function removable(item: MapDataItem): boolean {
  if (item.downloadId || (item.taskId && !item.collectionId && !item.networkId && !item.packId)) return false;
  if (item.kind === "roads") return item.networkId !== null;
  if (item.kind === "places") return item.packId !== null;
  return item.collectionId !== null && item.state !== "moving";
}
