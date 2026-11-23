/**
 * Removing one piece of map data, one way for every kind: what stops working, what is freed and
 * where, said first. A file on a storage location (a map, terrain, satellite pictures, a country
 * file) asks whether to delete it or leave it where it is; removing roads asks whether to delete
 * the kept country file too, unticked. Nothing is deleted without the person's choice.
 */
import { formatBytes, type MapDataItem } from "@outpost/shared";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/misc";
import { ChoiceList } from "@/features/downloads/choice-list";
import { usePacks, useRemovePack } from "@/features/layers/data";
import { useRemovePlaces, useRemoveRegion } from "../data";
import { useRemoveRoadNetwork } from "../road-route/data";
import { useMapData } from "./use-map-data";
import { keptFileFor } from "./words";

/** "Frees 30 MB on NAS." */
export function freesLine(item: MapDataItem): string {
  if (item.sizeBytes === null) return "";
  return `Frees ${formatBytes(item.sizeBytes)} ${item.locationName ? `on ${item.locationName}` : "in Outpost's own data"}.`;
}

const WHAT_STOPS: Record<MapDataItem["kind"], string> = {
  map: "The map will show only outlines here unless another map covers the area.",
  terrain: "Hill shading, contour lines and heights will no longer be drawn for this area.",
  imagery: "The satellite pictures will no longer be drawn under the map here.",
  extract: "Roads and places made from it keep working. Rebuilding or refreshing them will download the country file again.",
  names: "Search will no longer find these places by name. The list can be downloaded again at any time.",
  roads: "Routes can no longer be planned through it. Saved routes keep their directions.",
  places: "Its places leave the map and the lists of what is nearest.",
  streets: "Door-to-door, walking and cycling routes and street-level reachable areas stop. Drives still plan on the main roads.",
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
      description={`${WHAT_STOPS.names} ${freesLine(item)}`}
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
  const removeFile = useRemoveRegion();
  const data = useMapData();
  const kept = keptFileFor(data.data, item.regionId);
  const [alsoFile, setAlsoFile] = useState(false);
  const where = kept?.locationName ?? "its storage location";
  const reachable = kept !== null && kept.state === "ready";
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (next) setAlsoFile(false);
        onOpenChange(next);
      }}
      title={`Remove “${item.title}”?`}
      description={`${WHAT_STOPS.roads} ${freesLine(item)}${kept ? "" : " A kept country file stays where it is."}`}
      confirmLabel={alsoFile ? "Remove roads and the country file" : "Remove roads"}
      loading={remove.isPending || removeFile.isPending}
      onConfirm={() =>
        item.networkId &&
        remove.mutate(item.networkId, {
          onSuccess: () => {
            if (!(alsoFile && kept?.collectionId)) {
              onOpenChange(false);
              toast.success(`Removed “${item.title}”.${kept ? ` The country file stays on ${where}.` : ""}`);
              return;
            }
            removeFile.mutate(
              { id: kept.collectionId, deleteFiles: true },
              {
                onSuccess: () => {
                  onOpenChange(false);
                  toast.success(`Removed “${item.title}” and deleted its country file from ${where}.`);
                },
              },
            );
          },
        })
      }
    >
      {kept ? (
        <div className="grid gap-1.5 text-small">
          <label htmlFor={`also-file-${item.key}`} className="flex cursor-pointer items-start gap-2.5 text-ink">
            <Checkbox
              id={`also-file-${item.key}`}
              checked={alsoFile}
              disabled={!reachable}
              onCheckedChange={(checked) => setAlsoFile(checked === true)}
              className="mt-0.5"
            />
            <span>
              Also delete the kept country file ({formatBytes(kept.sizeBytes)} on {where})?
            </span>
          </label>
          <p className="pl-7 text-ink-muted">
            {reachable
              ? "Places to find made from it keep working. Building roads again, or refreshing the places, would download it again."
              : `${where} is not connected, so the file cannot be deleted now.`}
          </p>
        </div>
      ) : null}
    </ConfirmDialog>
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
      description={`${WHAT_STOPS.places} ${imported ? "The file you imported is left where it is." : `${freesLine(item)} It can be downloaded again.`}`}
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
