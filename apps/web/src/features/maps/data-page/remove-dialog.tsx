/**
 * Removing one piece of map data, one way for every kind: what stops working, what is freed and
 * where, said first. A file on a storage location (a map, terrain, satellite pictures, a country
 * file) asks whether to delete it or leave it where it is; removing roads asks whether to delete
 * the kept country file too, unticked. Nothing is deleted without the person's choice.
 */
import { formatBytes, type MapDataBundleKind, type MapDataItem, type MapDataPlace } from "@outpost/shared";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/misc";
import { ChoiceList } from "@/features/downloads/choice-list";
import { usePacks, useRemovePack } from "@/features/layers/data";
import { errorMessage } from "@/lib/api";
import { useRemovePlaces, useRemoveRegion } from "../data";
import { useRemoveRoadNetwork } from "../road-route/data";
import { useRemoveStreets } from "../road-route/streets-data";
import { useMapData } from "./use-map-data";
import { BUNDLE_NAMES, BUNDLE_STOPS, keptFileFor } from "./words";

/** "Frees 30 MB on NAS." */
export function freesLine(item: MapDataItem): string {
  if (item.sizeBytes === null) return "";
  return `Frees ${formatBytes(item.sizeBytes)} ${item.locationName ? `on ${item.locationName}` : "in Outpost's own data"}.`;
}

const WHAT_STOPS: Record<MapDataItem["kind"], string> = {
  map: "The map will show only outlines here unless another map covers the area.",
  terrain: "Hill shading, contour lines and heights will no longer be drawn for this area.",
  imagery: "The satellite pictures will no longer be drawn under the map here.",
  extract: "Routes and nearby places made from it keep working. Rebuilding or updating them downloads the source file again.",
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
      description={`${WHAT_STOPS.roads} ${freesLine(item)}${kept ? "" : " A kept source file stays where it is."}`}
      confirmLabel={alsoFile ? "Remove routes and the source file" : "Remove routes"}
      loading={remove.isPending || removeFile.isPending}
      onConfirm={() =>
        item.networkId &&
        remove.mutate(item.networkId, {
          onSuccess: () => {
            if (!(alsoFile && kept?.collectionId)) {
              onOpenChange(false);
              toast.success(`Removed “${item.title}”.${kept ? ` The source file stays on ${where}.` : ""}`);
              return;
            }
            removeFile.mutate(
              { id: kept.collectionId, deleteFiles: true },
              {
                onSuccess: () => {
                  onOpenChange(false);
                  toast.success(`Removed “${item.title}” and deleted its source file from ${where}.`);
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
              Also delete the kept source file ({formatBytes(kept.sizeBytes)} on {where})?
            </span>
          </label>
          <p className="pl-7 text-ink-muted">
            {reachable
              ? "Nearby places made from it keep working. Building routes again, or updating the places, would download it again."
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

/** The streets in use: one set for every country it covers, so removing it removes it from each. */
function RemoveStreets({ item, open, onOpenChange }: { item: MapDataItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const remove = useRemoveStreets();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Remove “${item.title}”?`}
      description={`${WHAT_STOPS.streets} ${item.sizeBytes !== null ? `Frees ${formatBytes(item.sizeBytes)}.` : ""} The source files they were built from stay.`}
      confirmLabel="Remove streets"
      loading={remove.isPending}
      onConfirm={() =>
        remove.mutate(undefined, {
          onSuccess: () => {
            onOpenChange(false);
            toast.success(`Removed “${item.title}”.`);
          },
        })
      }
    />
  );
}

export function RemoveDialog(props: { item: MapDataItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (props.item.kind === "streets") return <RemoveStreets {...props} />;
  if (props.item.kind === "roads") return <RemoveRoads {...props} />;
  if (props.item.kind === "places") return <RemovePlaces {...props} />;
  if (props.item.kind === "names") return <RemoveNames {...props} />;
  return <RemoveFile {...props} />;
}

/** Whether a row's thing can be removed from here: what is here, not what is on its way. */
export function removable(item: MapDataItem): boolean {
  if (item.downloadId || (item.taskId && !item.collectionId && !item.networkId && !item.packId)) return false;
  if (item.kind === "streets") return item.key === "streets:current" && item.state === "ready";
  if (item.kind === "roads") return item.networkId !== null;
  if (item.kind === "places") return item.packId !== null;
  return item.collectionId !== null && item.state !== "moving";
}

// ── By place: one dialog for every kind ──

/** A line of the place's removal: one bundle, or the source file, with what it frees. */
export interface RemoveLine {
  key: MapDataBundleKind | "source";
  name: string;
  items: MapDataItem[];
  bytes: number;
  /** Ticked when the dialog opens: everything but the source file, which is kept unless asked. */
  ticked: boolean;
}

/** What "Remove France…" offers: each bundle with something here, and the source file, with sizes. */
export function removeLines(place: MapDataPlace): RemoveLine[] {
  const lines: RemoveLine[] = [];
  for (const bundle of place.bundles) {
    const items = place.items.filter((item) => bundle.items.includes(item.key) && removable(item));
    if (items.length === 0) continue;
    lines.push({
      key: bundle.kind,
      name: BUNDLE_NAMES[bundle.kind],
      items,
      bytes: items.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0),
      ticked: true,
    });
  }
  const files = place.items.filter((item) => item.kind === "extract" && removable(item));
  if (files.length > 0)
    lines.push({
      key: "source",
      name: "Source file",
      items: files,
      bytes: files.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0),
      ticked: false,
    });
  return lines;
}

/** "Remove · frees 3.1 GB". */
export function freesTotal(lines: RemoveLine[], ticked: Set<string>): number {
  return lines.filter((line) => ticked.has(line.key)).reduce((sum, line) => sum + line.bytes, 0);
}

/** Removing a place, or some of what it has: ticks, what stops working, and what is freed. */
export function RemovePlaceDialog({
  place,
  open,
  onOpenChange,
}: {
  place: MapDataPlace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const lines = place ? removeLines(place) : [];
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  if (open && place && opened !== place.key) {
    setOpened(place.key);
    setTicked(new Set(lines.filter((line) => line.ticked).map((line) => line.key)));
    setFailed(null);
  }
  if (!open && opened !== null) setOpened(null);

  const removeFile = useRemoveRegion();
  const removeNames = useRemovePlaces();
  const removeRoads = useRemoveRoadNetwork();
  const removePack = useRemovePack();
  const removeStreets = useRemoveStreets();
  const away = [
    ...new Set(
      lines
        .flatMap((line) => line.items)
        .filter((item) => item.state === "location-offline")
        .map((item) => item.locationName),
    ),
  ];

  async function removeOne(item: MapDataItem) {
    const deleteFiles = item.state !== "location-offline";
    if (item.kind === "streets") return removeStreets.mutateAsync(undefined);
    if (item.kind === "roads" && item.networkId) return removeRoads.mutateAsync(item.networkId);
    if (item.kind === "places" && item.packId) return removePack.mutateAsync({ id: item.packId, deleteFiles });
    if (item.kind === "names" && item.collectionId)
      return removeNames.mutateAsync({ id: item.collectionId } as Parameters<typeof removeNames.mutateAsync>[0]);
    if (item.collectionId) return removeFile.mutateAsync({ id: item.collectionId, deleteFiles });
  }

  const frees = freesTotal(lines, ticked);
  const chosen = lines.filter((line) => ticked.has(line.key));
  const everything = chosen.length === lines.length;
  const stops = chosen.filter((line) => line.key !== "source").map((line) => BUNDLE_STOPS[line.key as MapDataBundleKind]);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Remove ${place?.name ?? ""}?`}
      description={stops.length > 0 ? stops.join(" ") : "Choose what to remove."}
      confirmLabel={chosen.length === 0 ? "Remove" : `Remove · frees ${formatBytes(frees)}`}
      loading={busy}
      onConfirm={async () => {
        if (!place || chosen.length === 0) return;
        setBusy(true);
        setFailed(null);
        try {
          // The source file last: what is read from it goes first.
          const items = [...chosen.filter((line) => line.key !== "source"), ...chosen.filter((line) => line.key === "source")].flatMap(
            (line) => line.items,
          );
          let streetsDone = false;
          for (const item of items) {
            if (item.kind === "streets") {
              if (streetsDone) continue;
              streetsDone = true;
            }
            await removeOne(item);
          }
          onOpenChange(false);
          toast.success(
            everything ? `Removed ${place.name}. Freed ${formatBytes(frees)}.` : `Removed from ${place.name}. Freed ${formatBytes(frees)}.`,
          );
        } catch (error) {
          setFailed(errorMessage(error));
        } finally {
          setBusy(false);
        }
      }}
    >
      <ul aria-label={`What to remove from ${place?.name ?? ""}`} className="grid gap-1">
        {lines.map((line) => (
          <li key={line.key}>
            <label
              htmlFor={`remove-${line.key}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 text-small md:min-h-8 md:pointer-coarse:min-h-11"
            >
              <Checkbox
                id={`remove-${line.key}`}
                checked={ticked.has(line.key)}
                onCheckedChange={(on) =>
                  setTicked((current) => {
                    const next = new Set(current);
                    if (on === true) next.add(line.key);
                    else next.delete(line.key);
                    return next;
                  })
                }
              />
              <span className="flex-1 text-ink">{line.name}</span>
              <span className="tabular text-ink-muted">{formatBytes(line.bytes)}</span>
            </label>
          </li>
        ))}
      </ul>
      {lines.some((line) => line.key === "source") ? (
        <p className="mt-2 text-small text-ink-muted">
          Without the source file, building routes or nearby places again downloads it again.
        </p>
      ) : null}
      {away.length > 0 ? (
        <p className="mt-2 text-small text-warning">
          Storage not connected: {away.join(", ")}. Outpost stops using what is there; its files stay until it is back.
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="mt-2 text-small text-danger">
          Failed: {failed} Try again.
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
