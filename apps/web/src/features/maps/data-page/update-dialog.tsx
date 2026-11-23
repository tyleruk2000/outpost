/**
 * Bringing map data up to date, one press at a time. Each thing says first what an update costs:
 * a map area or a list of names asks its source (named) how large and how new its newest copy is
 * on a press of Check, then downloads it on a press of Update, the one kept staying until the new
 * one is in place; roads and places are read again from the kept country file with no download,
 * or from a new country file. Nothing is checked or fetched without a press.
 */
import {
  formatBytes,
  type MapDataCheckResponse,
  type MapDataItem,
  type MapDataPlace,
  type MapDataResponse,
  type ReferenceEstimateRequest,
} from "@outpost/shared";
import { CircleAlert, CircleCheck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { usePacks } from "@/features/layers/data";
import { errorMessage } from "@/lib/api";
import { useAddMapData, useCheckUpdate, useUpdateMapData } from "./use-map-data";
import { BUNDLE_NAMES, dayText, hostsText, isHere, KIND_NAMES, keptFileFor, overAYearOld } from "./words";

const small = "max-md:min-h-11 md:pointer-coarse:min-h-11";

/** The day after, so that a kept country file from that day is not read again in place of a new one. */
const dayAfter = (date: string | null) => {
  const time = date ? Date.parse(`${date}T12:00:00Z`) : Date.now();
  return new Date(time + 86_400_000).toISOString().slice(0, 10);
};

function Started({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-1.5 text-small text-ink">
      <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
      <span>
        {children}{" "}
        <Link to="/downloads" className="text-primary underline decoration-1 underline-offset-2">
          Downloads and tasks
        </Link>{" "}
        follows it.
      </span>
    </p>
  );
}

function Failed({ error }: { error: unknown }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-small text-danger">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {errorMessage(error)}
    </p>
  );
}

/** A map, terrain, GeoNames list or country file: asked about on a press, then downloaded again on another. */
function DownloadAgain({ item }: { item: MapDataItem }) {
  const check = useCheckUpdate();
  const update = useUpdateMapData();
  const hosts = item.update?.hosts ?? [];
  const where = item.locationName ?? "its storage location";
  const found: MapDataCheckResponse | undefined = check.data;
  const newest = found ? dayText(found.dataDate) : null;
  if (update.isSuccess)
    return (
      <Started>
        {update.data.downloadIds.length === 0
          ? "A newer one is kept already: nothing was downloaded."
          : `Downloading. The one you have stays, and is used, until the new one is in place and checked; then it is deleted.`}
      </Started>
    );
  return (
    <div className="grid gap-2">
      {!found ? (
        <p className="text-small text-ink-muted">
          Check asks {hostsText(hosts)} how large and how new the newest copy is. Nothing is downloaded until you press Update.
        </p>
      ) : (
        <p className="tabular text-small text-ink">
          {found.newer === false
            ? `This is the newest already${newest ? ` (${newest})` : ""}.`
            : `${found.newer ? "A newer one is there" : "The source gives no date to compare"}${newest ? `, from ${newest}` : ""}: ${
                found.sizeBytes ? formatBytes(found.sizeBytes) : "size not given"
              } to download from ${hostsText(found.hosts)}, onto ${where}. The one you have is deleted once the new one is in place.`}
        </p>
      )}
      {check.isError ? <Failed error={check.error} /> : null}
      {update.isError ? <Failed error={update.error} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={found ? undefined : "primary"}
          className={small}
          loading={check.isPending}
          onClick={() => item.collectionId && check.mutate(item.collectionId)}
          aria-label={`Check for a newer copy: ${item.title}`}
        >
          {found ? "Check again" : "Check"}
        </Button>
        {found && found.newer !== false ? (
          <Button
            size="sm"
            variant="primary"
            className={small}
            loading={update.isPending}
            onClick={() => item.collectionId && update.mutate(item.collectionId)}
            aria-label={`Update: ${item.title}`}
          >
            Update
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Roads or places: read again from the kept country file (no download), or from a new one. */
function FromCountryFile({ item, data }: { item: MapDataItem; data: MapDataResponse }) {
  const add = useAddMapData();
  const kept = keptFileFor(data, item.regionId);
  const read = data.countries.find((country) => country.lastRead?.regionId === item.regionId)?.lastRead ?? null;
  const geofabrik = hostsText(item.update?.hosts ?? []);
  const kinds = item.kind === "roads" ? (["roads"] as const) : (["places"] as const);
  const send = (fresh: boolean) =>
    item.regionId &&
    add.mutate({
      regionId: item.regionId,
      kinds: [...kinds],
      keep: kept !== null,
      ...(kept?.locationId ? { locationId: kept.locationId } : {}),
      ...(item.kind === "places" && item.layers.length > 0 ? { layers: item.layers } : {}),
      ...(fresh && kept ? { newerThan: dayAfter(kept.dataDate) } : {}),
    });
  if (add.isSuccess)
    return (
      <Started>
        {add.data.countryFile?.source === "kept"
          ? "Reading the kept file again. What you have is used until the new one is built."
          : "Downloading the source file. What you have is used until the new one is built."}
      </Started>
    );
  const size = kept?.sizeBytes ?? read?.bytes ?? null;
  return (
    <div className="grid gap-2">
      <p className="text-small text-ink-muted">
        {kept
          ? `No download: read from the kept file (${dayText(kept.dataDate) ?? "date not known"}). Or download a newer source file${
              size ? ` (about ${formatBytes(size)})` : ""
            } from ${geofabrik} and keep it in its place.`
          : `Downloads the source file again${size ? ` (about ${formatBytes(size)})` : ""} from ${geofabrik}; it is read, then deleted.`}
      </p>
      {add.isError ? <Failed error={add.error} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          className={small}
          loading={add.isPending && !add.variables?.newerThan}
          onClick={() => send(false)}
          aria-label={`${kept ? "Read the kept file" : "Update"}: ${item.title}, ${KIND_NAMES[item.kind].toLowerCase()}`}
        >
          {kept ? "Read the kept file" : "Update"}
        </Button>
        {kept ? (
          <Button size="sm" className={small} loading={add.isPending && Boolean(add.variables?.newerThan)} onClick={() => send(true)}>
            Download a newer file
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Updated elsewhere: where, and for a layer from its own source, the way there. */
function Elsewhere({
  item,
  onUpdatePlaces,
}: {
  item: MapDataItem;
  onUpdatePlaces?: ((request: ReferenceEstimateRequest) => void) | undefined;
}) {
  const packs = usePacks(item.kind === "places" && item.packId !== null);
  const pack = packs.data?.find((each) => each.id === item.packId);
  if (item.kind === "places" && pack?.request && onUpdatePlaces)
    return (
      <div>
        <Button size="sm" className={small} onClick={() => pack.request && onUpdatePlaces(pack.request)}>
          Check for an update
        </Button>
      </div>
    );
  return <p className="text-small text-ink-muted">{item.update?.note ?? "Outpost cannot fetch this again: add a newer copy instead."}</p>;
}

export function UpdateEntry({
  item,
  data,
  onUpdatePlaces,
}: {
  item: MapDataItem;
  data: MapDataResponse;
  onUpdatePlaces?: ((request: ReferenceEstimateRequest) => void) | undefined;
}) {
  const way = item.update?.how;
  return (
    <li className="grid gap-2 py-3">
      <p className="text-small">
        <span className="font-medium text-ink">{item.title}</span>
        <span className="text-ink-muted">
          {" "}
          · {KIND_NAMES[item.kind]}
          {item.dataDate ? ` · from ${dayText(item.dataDate)}` : ""}
        </span>
      </p>
      {way === "download" ? (
        <DownloadAgain item={item} />
      ) : way === "country-file" ? (
        <FromCountryFile item={item} data={data} />
      ) : (
        <Elsewhere item={item} onUpdatePlaces={onUpdatePlaces} />
      )}
    </li>
  );
}

/** Review updates (several things) or Update (one), each saying what it costs before anything is fetched. */
export function UpdatesDialog({
  items,
  data,
  open,
  onOpenChange,
  onUpdatePlaces,
  review = false,
}: {
  items: MapDataItem[];
  data: MapDataResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdatePlaces?: (request: ReferenceEstimateRequest) => void;
  /** Review updates: what is over a year old, however many. Otherwise the one thing whose Update was pressed. */
  review?: boolean;
}) {
  const one = !review && items.length === 1 ? items[0]! : null;
  // Keep the list as opened: an update that finishes must not take its row (and its message) away.
  const [shown, setShown] = useState(items);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setShown(items);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={one ? `Update “${one.title}”` : "Review updates"}
        description="Nothing is checked or downloaded until you press. What you have stays in use until its replacement is in place."
        size="lg"
      >
        <DialogBody>
          <Rows aria-label={one ? "What updating it takes" : "What is over a year old"} className="border-y-0">
            {shown.map((item) => (
              <UpdateEntry key={item.key} item={item} data={data} onUpdatePlaces={onUpdatePlaces} />
            ))}
          </Rows>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── By place ──

/** What updating a place covers: what is over a year old when reviewing, everything that can be updated for one place. */
export function updateItems(place: MapDataPlace, review: boolean, now = Date.now()): MapDataItem[] {
  return place.items.filter(
    (item) => isHere(item) && Boolean(item.update) && !item.ageless && (!review || overAYearOld(item.dataDate, now)),
  );
}

/** "France · Map from 1 Jun 2025". */
export function placeUpdateLine(place: MapDataPlace, items: MapDataItem[]): string {
  const oldest = [...items].sort((a, b) => (a.dataDate ?? "").localeCompare(b.dataDate ?? ""))[0];
  if (!oldest) return place.name;
  const bundle = place.bundles.find((each) => each.items.includes(oldest.key));
  const what = bundle ? BUNDLE_NAMES[bundle.kind] : KIND_NAMES[oldest.kind];
  const day = dayText(oldest.dataDate);
  return `${place.name} · ${what}${day ? ` from ${day}` : ""}`;
}

/**
 * Updates by place: each place with what is over a year old (or, for one place, everything that
 * can be updated), each saying what it costs on a press of Check, with Update for each and
 * Update all. What is held stays in use until its replacement is in place.
 */
export function PlaceUpdatesDialog({
  places,
  review,
  data,
  open,
  onOpenChange,
  onUpdatePlaces,
}: {
  places: MapDataPlace[];
  review: boolean;
  data: MapDataResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdatePlaces?: (request: ReferenceEstimateRequest) => void;
}) {
  const [shown, setShown] = useState(places);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setShown(places);
  }
  const update = useUpdateMapData();
  const add = useAddMapData();
  const [all, setAll] = useState<"idle" | "busy" | "done">("idle");
  const [failed, setFailed] = useState<unknown>(null);
  const groups = shown.map((place) => ({ place, items: updateItems(place, review) })).filter((group) => group.items.length > 0);
  const every = groups.flatMap((group) => group.items).filter((item) => item.update?.how !== "elsewhere");
  const one = !review && groups.length === 1 ? groups[0]!.place : null;

  const updateAll = async () => {
    setAll("busy");
    setFailed(null);
    try {
      const regions = new Set<string>();
      for (const item of every) {
        if (item.update?.how === "download" && item.collectionId) await update.mutateAsync(item.collectionId);
        else if (item.update?.how === "country-file" && item.regionId && !regions.has(item.regionId)) {
          // Roads and nearby places of one region come from one new source file: asked for once.
          regions.add(item.regionId);
          const kinds = groups
            .flatMap((group) => group.items)
            .filter((each) => each.regionId === item.regionId && each.update?.how === "country-file")
            .map((each) => (each.kind === "roads" ? "roads" : "places"));
          const kept = keptFileFor(data, item.regionId);
          await add.mutateAsync({
            regionId: item.regionId,
            kinds: [...new Set(kinds)] as Array<"roads" | "places">,
            keep: kept !== null,
            ...(kept?.locationId ? { locationId: kept.locationId } : {}),
            ...(kept ? { newerThan: dayAfter(kept.dataDate) } : {}),
          });
        }
      }
      setAll("done");
    } catch (error) {
      setFailed(error);
      setAll("idle");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={one ? `Update ${one.name}` : "Check for updates"}
        description="Nothing is checked or downloaded until you press. What you have stays in use until its replacement is in place."
        size="lg"
      >
        <DialogBody className="grid gap-6">
          {groups.length === 0 ? <p className="text-small text-ink-muted">Everything is up to date.</p> : null}
          {groups.map(({ place, items }) => (
            <section key={place.key} aria-label={place.name} className="grid gap-1">
              <h3 className="text-body font-medium text-ink">{placeUpdateLine(place, items)}</h3>
              <Rows aria-label={`What updating ${place.name} takes`} className="border-y-0">
                {items.map((item) => (
                  <UpdateEntry key={item.key} item={item} data={data} onUpdatePlaces={onUpdatePlaces} />
                ))}
              </Rows>
            </section>
          ))}
          {all === "done" ? (
            <Started>Everything chosen is downloading. What you have stays in use until each new one is in place.</Started>
          ) : null}
          {failed ? <Failed error={failed} /> : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
          {every.length > 1 && all !== "done" ? (
            <Button variant="primary" loading={all === "busy"} onClick={updateAll}>
              Update all
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
