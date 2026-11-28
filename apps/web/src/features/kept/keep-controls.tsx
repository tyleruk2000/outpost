/**
 * The "Keep on this phone" actions, as they appear on a page of notes, on a route, on
 * the list of saved places and beside the map. Each screen mounts one of these and
 * knows nothing more about keeping.
 */
import { type Bbox, formatBytes, type MapAreaSize, type NoteRef, type TrackDto } from "@outpost/shared";
import { useMutation } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MenuItem } from "@/components/ui/menu";
import { Checkbox, Progress, Select } from "@/components/ui/misc";
import { useMapOverview, useMapSources } from "@/features/maps/data";
import { detailLabel } from "@/features/maps/lib/detail";
import { formatBboxSize, isValidBbox } from "@/features/maps/lib/geo";
import type { MapEngine } from "@/features/maps/map/engine";
import { Fact, PanelHeading } from "@/features/maps/ui";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatNumber, plural } from "@/lib/utils";
import {
  areaRefusal,
  dismissAreaWork,
  measureArea,
  roomLeft,
  startArea,
  stopArea,
  tooManyTiles,
  tooManyTilesRefusal,
  useAreaWork,
} from "./area";
import { DEVICE, DeviceIcon, KEEP_ON_THIS_DEVICE } from "./device";
import { isEarlierCopy, keepMedical, keepNote, keepPlaces, keepTrack, MEDICAL_ID, PLACES_ID } from "./keep";
import { type KeptMedical, keepingSupported, outOfRoomMessage, removeKept, useKept } from "./store";

const KEPT_PATH = "/kept";
const HTTPS_SETTINGS = "/settings#https";
const failed = (error: unknown) => notify.error(outOfRoomMessage(error) ?? errorMessage(error));

/** What a keeping action says where this browser cannot keep anything (a plain http address): why, and where to put it right. */
export const KEEPING_NEEDS_HTTPS = `Keeping things on this ${DEVICE} needs Outpost opened at an HTTPS address, which this one is not. Settings, “HTTPS on your network”, says how to give it one.`;

function useExplain(): () => void {
  const navigate = useNavigate();
  return () => toast(KEEPING_NEEDS_HTTPS, { action: { label: "Open Settings", onClick: () => navigate(HTTPS_SETTINGS) } });
}

/** Runs one keeping action and says whether it is still running. Plain state: these controls sit in panels of other screens. */
function useKeeping<T>(action: () => Promise<T>, done: (result: T) => void): { busy: boolean; run: () => void } {
  const [busy, setBusy] = useState(false);
  const explain = useExplain();
  return {
    busy,
    run: () => {
      if (!keepingSupported()) return explain();
      setBusy(true);
      action()
        .then(done, failed)
        .finally(() => setBusy(false));
    },
  };
}

/** In a page's menu: keep the page and the pages inside it, or take the copy off again. */
export function KeepNoteMenuItem({ note }: { note: NoteRef }) {
  const kept = useKept();
  const explain = useExplain();
  if (!keepingSupported()) {
    return (
      <MenuItem onSelect={explain}>
        <DeviceIcon /> {KEEP_ON_THIS_DEVICE}
      </MenuItem>
    );
  }
  const own = kept?.find((item) => item.kind === "note" && item.id === note.id);
  const through = own ? undefined : kept?.find((item) => item.kind === "note" && item.pages.some((page) => page.id === note.id));
  if (own) {
    return (
      <MenuItem
        onSelect={() =>
          void removeKept("note", note.id).then(
            () => toast(`“${own.title || "Untitled"}” is no longer kept on this ${DEVICE}. The page itself is untouched.`),
            failed,
          )
        }
      >
        <DeviceIcon /> Remove from this {DEVICE}
      </MenuItem>
    );
  }
  if (through) {
    return (
      <MenuItem disabled>
        <CircleCheck /> Kept with “{through.title || "Untitled"}”
      </MenuItem>
    );
  }
  return (
    <MenuItem
      onSelect={() => {
        const working = toast.loading(`Keeping this page on this ${DEVICE}`);
        keepNote(note.id).then(
          (item) => {
            const inside = item.pages.length - 1;
            toast.success(
              `“${item.title || "Untitled"}”${inside > 0 ? ` and the ${plural(inside, "page")} inside it are` : " is"} kept on this ${DEVICE} (${formatBytes(item.bytes)}).${
                item.skipped > 0
                  ? ` ${plural(item.skipped, "attached file")} over 50 MB ${item.skipped === 1 ? "was" : "were"} left out.`
                  : ""
              }`,
              { id: working },
            );
          },
          (error) => notify.error(outOfRoomMessage(error) ?? errorMessage(error), { id: working }),
        );
      }}
    >
      <DeviceIcon /> {KEEP_ON_THIS_DEVICE}
    </MenuItem>
  );
}

/** On a route's own panel, beside "Export as GPX". */
export function KeepTrackButton({ track }: { track: TrackDto }) {
  const kept = useKept();
  const keep = useKeeping(
    () => keepTrack(track.id),
    (item) => toast.success(`“${item.title}” is kept on this ${DEVICE} (${formatBytes(item.bytes)}).`),
  );
  const isKept = kept?.some((item) => item.kind === "track" && item.id === track.id) ?? false;
  if (isKept) {
    return (
      <Button
        onClick={() => void removeKept("track", track.id).then(() => toast(`“${track.name}” is no longer kept on this ${DEVICE}.`), failed)}
      >
        <DeviceIcon /> Remove from this {DEVICE}
      </Button>
    );
  }
  return (
    <Button loading={keep.busy} onClick={keep.run}>
      <DeviceIcon /> {KEEP_ON_THIS_DEVICE}
    </Button>
  );
}

/** Under the list of saved places: they are kept as a set, all of them. */
export function KeepPlacesRow({ count }: { count: number }) {
  const kept = useKept();
  const keep = useKeeping(keepPlaces, (done) => toast.success(`${plural(done.count, "saved place")} kept on this ${DEVICE}.`));
  const item = kept?.find((entry) => entry.kind === "places");
  if (count === 0 && !item) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border px-4 py-2">
      <p className="min-w-0 text-small text-ink-muted">
        {item ? `${plural(item.count, "place")} kept on this ${DEVICE}` : `Places can be kept on this ${DEVICE} as a set`}
      </p>
      {item ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void removeKept("places", PLACES_ID).then(() => toast(`Saved places are no longer kept on this ${DEVICE}.`), failed)
          }
        >
          Remove from this {DEVICE}
        </Button>
      ) : (
        <Button size="sm" loading={keep.busy} onClick={keep.run}>
          <DeviceIcon /> {KEEP_ON_THIS_DEVICE}
        </Button>
      )}
    </div>
  );
}

/**
 * Under the list of medical sheets: kept as a set, only when asked, and after saying what
 * that means. A locked sheet travels locked and opens on the phone with its passphrase;
 * one that is not locked is readable by anyone who can open this browser. Each household's
 * sheets are a copy of their own: the row is about the household shown (`householdId`).
 */
export function KeepMedicalRow({
  householdId = MEDICAL_ID,
  householdName = null,
  count,
  open,
}: {
  householdId?: string;
  /** The household's name when there are several, else null: an earlier copy under its id counts as its own only if it matches. */
  householdName?: string | null;
  count: number;
  open: number;
}) {
  const kept = useKept();
  const [asking, setAsking] = useState(false);
  const keep = useKeeping(
    () => keepMedical(householdId),
    (done) => toast.success(`${plural(done.count, "medical sheet")} kept on this ${DEVICE}.`),
  );
  const item = kept?.find(
    (entry): entry is KeptMedical =>
      entry.kind === "medical" && entry.id === householdId && (!isEarlierCopy(entry) || (entry.householdName ?? null) === householdName),
  );
  if ((count === 0 && !item) || !keepingSupported()) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border pt-3">
      <p className="min-w-0 text-small text-ink-muted">
        {item
          ? `${plural(item.count, "sheet")} kept on this ${DEVICE}, for when the server is out of reach`
          : `The sheets can be kept on this ${DEVICE}, for when the server is out of reach`}
      </p>
      {item ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void removeKept("medical", householdId).then(() => toast(`The medical sheets are no longer kept on this ${DEVICE}.`), failed)
          }
        >
          Remove from this {DEVICE}
        </Button>
      ) : (
        <Button size="sm" loading={keep.busy} onClick={() => (open > 0 ? setAsking(true) : keep.run())}>
          <DeviceIcon /> {KEEP_ON_THIS_DEVICE}
        </Button>
      )}
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`Keep the medical sheets on this ${DEVICE}?`}
        description={`${plural(open, "sheet is", "sheets are")} not locked, so ${open === 1 ? "it is" : "they are"} kept readable: anyone who can open this browser on this ${DEVICE} can read ${open === 1 ? "it" : "them"}. A locked sheet stays locked here and opens with its passphrase. Lock a sheet first to keep it locked.`}
        confirmLabel={KEEP_ON_THIS_DEVICE}
        onConfirm={() => {
          setAsking(false);
          keep.run();
        }}
      />
    </div>
  );
}

const ZOOM_CHOICES = [10, 12, 13, 14, 15];

/**
 * Asks the browser to keep what is stored for Outpost when it is short of room, and says
 * the answer. A browser that grants it without asking says yes at once; one that asks the
 * person (Firefox) shows its own question. Asked once an area starts being kept.
 */
async function askToPersist(): Promise<void> {
  try {
    if (!navigator.storage?.persist) return;
    if (await navigator.storage.persisted()) return;
    const granted = await navigator.storage.persist();
    if (granted) toast.success("This browser will keep what is stored for Outpost when it is short of room.");
    else
      toast(
        `This browser did not agree to keep what is stored for Outpost when it is short of room: it may clear it. Adding Outpost to the Home Screen can change that.`,
      );
  } catch {
    // Not answered: nothing to say.
  }
}

/** The part of the map to keep: what is in view, or the whole of an installed region (`region:<id>`). */
type AreaChoice = "view" | `region:${string}`;

/**
 * In the maps panel: keep the part of the map that is in view, or a whole installed
 * region. The size is measured by the server from the installed maps before anything is
 * fetched.
 */
export function KeepAreaSection({ engine }: { engine: MapEngine | null }) {
  const sources = useMapSources();
  const overview = useMapOverview();
  const installed = (overview.data?.regions ?? []).filter((region) => region.tileType !== "terrain");
  const [part, setPart] = useState<AreaChoice>("view");
  const region = part.startsWith("region:") ? installed.find((entry) => `region:${entry.id}` === part) : undefined;
  const work = useAreaWork();
  const terrainId = useId();
  const basemap = sources.data?.sources.basemap;
  const hasTerrain = Boolean(sources.data?.hasTerrain);
  const deepest = basemap?.maxzoom ?? 0;
  const [maxZoom, setMaxZoom] = useState<number>();
  // A detail the server said the area fits to, offered with the usual ones until another is chosen.
  const [fitted, setFitted] = useState<number>();
  const choices = [...new Set([...ZOOM_CHOICES.filter((zoom) => zoom < deepest), deepest, ...(fitted === undefined ? [] : [fitted])])]
    .filter((zoom) => zoom > 0)
    .sort((a, b) => a - b);
  const [terrain, setTerrain] = useState(true);
  const [title, setTitle] = useState("");
  const [box, setBox] = useState<Bbox>();
  const [refusal, setRefusal] = useState<string>();
  const zoom = maxZoom ?? Math.min(14, deepest);

  const measure = useMutation({
    mutationFn: async ({ bbox, detail }: { bbox: Bbox; detail: number }): Promise<{ size: MapAreaSize; room: number | null }> => ({
      size: await measureArea(bbox, detail, terrain && hasTerrain),
      room: await roomLeft(),
    }),
    onSuccess: ({ size, room }) => setRefusal(areaRefusal(size, room, region?.name)),
  });
  const start = useMutation({ mutationFn: startArea });
  const resetMeasure = measure.reset;

  // The box drawn on the map is this section's; it goes when the section does.
  useEffect(() => {
    engine?.setBox(box ?? null, false);
    return () => engine?.setBox(null, false);
  }, [engine, box]);

  const forget = () => {
    setBox(undefined);
    setRefusal(undefined);
    resetMeasure();
  };

  const check = () => {
    if (region) {
      const [west, south, east, north] = region.bounds;
      const bbox: Bbox = [Math.max(-180, west), Math.max(-85, south), Math.min(180, east), Math.min(85, north)];
      setBox(bbox);
      setRefusal(undefined);
      engine?.fitBounds(bbox, { maxZoom: 12 });
      measure.mutate({ bbox, detail: zoom });
      return;
    }
    if (!engine) return;
    const view = engine.getBounds();
    const bbox: Bbox = [Math.max(-180, view[0]), Math.max(-85, view[1]), Math.min(180, view[2]), Math.min(85, view[3])];
    if (!isValidBbox(bbox)) {
      setRefusal("The view spans more than the whole world. Zoom in, then try again.");
      return;
    }
    setBox(bbox);
    setRefusal(undefined);
    measure.mutate({ bbox, detail: zoom });
  };

  // Measured again at the detail the server said the same box fits to.
  const measureAt = (detail: number) => {
    if (!box) return;
    setFitted(detail);
    setMaxZoom(detail);
    setRefusal(undefined);
    measure.mutate({ bbox: box, detail });
  };

  const size = measure.data?.size;
  const tooMany = measure.isError ? tooManyTiles(measure.error) : null;

  return (
    <section aria-label={`Map areas on this ${DEVICE}`}>
      <PanelHeading>Map areas on this {DEVICE}</PanelHeading>
      <p className="mt-1 text-small text-ink-muted">
        Keeps the part of the map in view, or a whole region installed above, in this browser, so it still draws when this {DEVICE} cannot
        reach the server, with heights and the estimated radio range where terrain comes too. It is copied from the maps installed above;
        nothing is downloaded from the internet.{" "}
        <Link to={KEPT_PATH} className="text-primary underline decoration-1 underline-offset-2">
          What is kept
        </Link>
      </p>

      {work.length > 0 ? (
        <ul className="mt-3 divide-y divide-border border-y border-border" aria-label="Areas being kept">
          {work.map((item) => (
            <li key={item.id} className="py-3">
              <p className="text-small font-medium text-ink">{item.title}</p>
              {item.state === "running" ? (
                <>
                  <Progress
                    className="mt-2"
                    tone="lamp"
                    value={item.positions ? item.done / item.positions : null}
                    label={`Keeping ${item.title}`}
                  />
                  <p className="tabular mt-1 text-small text-ink-muted">
                    {formatNumber(item.done)} of {formatNumber(item.positions)} tiles looked at, {formatBytes(item.bytes)} kept
                  </p>
                  <Button size="sm" variant="ghost" className="mt-1 -ml-2.5" onClick={() => stopArea(item.id)}>
                    Stop
                  </Button>
                </>
              ) : (
                <>
                  <p className="mt-1 text-small text-ink-muted">
                    {item.state === "stopped" ? "Stopped." : item.message} {formatNumber(item.done)} of {formatNumber(item.positions)} tiles
                    were looked at. Carry on from{" "}
                    <Link to={KEPT_PATH} className="text-primary underline decoration-1 underline-offset-2">
                      On this {DEVICE}
                    </Link>
                    .
                  </p>
                  <Button size="sm" variant="ghost" className="mt-1 -ml-2.5" onClick={() => dismissAreaWork(item.id)}>
                    Dismiss
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {!keepingSupported() ? (
        <Notice tone="info" className="mt-3">
          Keeping a map area on this {DEVICE} needs Outpost opened at an HTTPS address, which this one is not.{" "}
          <Link to={HTTPS_SETTINGS} className="font-medium underline underline-offset-2">
            Settings, HTTPS on your network
          </Link>{" "}
          says how to give it one.
        </Notice>
      ) : !basemap ? (
        <p className="mt-3 text-small text-ink-muted">
          No map is on the server yet: an area is kept from its maps.{" "}
          <Link to="/maps/data?add=1" className="font-medium underline underline-offset-2">
            Add a place on Offline maps
          </Link>{" "}
          first.
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          {installed.length > 0 ? (
            <Select
              aria-label="What to keep"
              value={part}
              onChange={(value) => {
                setPart(value as AreaChoice);
                setFitted(undefined);
                forget();
              }}
              options={[
                { value: "view", label: "The part of the map in view" },
                ...installed.map((entry) => ({ value: `region:${entry.id}`, label: `All of ${entry.name}` })),
              ]}
            />
          ) : null}
          <Select
            aria-label="Detail to keep"
            value={String(zoom)}
            onChange={(value) => {
              setMaxZoom(Number(value));
              forget();
            }}
            options={choices.map((choice) => ({ value: String(choice), label: `${detailLabel(choice)} (zoom ${choice})` }))}
          />
          {hasTerrain ? (
            <div className="flex items-center gap-3">
              <Checkbox
                id={terrainId}
                checked={terrain}
                onCheckedChange={(checked) => {
                  setTerrain(checked === true);
                  forget();
                }}
              />
              <label htmlFor={terrainId} className="text-small text-ink">
                With terrain, for hill shading and contour lines
              </label>
            </div>
          ) : null}

          {measure.isPending ? (
            <p className="text-small text-ink-muted" aria-busy>
              Measuring {region ? region.name : "the area in view"}
            </p>
          ) : tooMany ? (
            <Notice
              tone="warning"
              action={
                tooMany.fitsZoom !== null ? (
                  <Button size="sm" variant="ghost" onClick={() => measureAt(tooMany.fitsZoom!)}>
                    Measure at zoom {tooMany.fitsZoom}
                  </Button>
                ) : undefined
              }
            >
              {tooManyTilesRefusal(tooMany, region?.name)}
            </Notice>
          ) : measure.isError ? (
            <Notice tone="danger">{errorMessage(measure.error)}</Notice>
          ) : size && box ? (
            <dl>
              <Fact label="Area">{formatBboxSize(box)}</Fact>
              {size.map ? (
                <Fact label="Map">
                  {formatBytes(size.map.bytes)}
                  <span className="block text-ink-muted">
                    {plural(size.map.tiles, "tile")}, zoom {size.map.minZoom} to {size.map.maxZoom}
                  </span>
                </Fact>
              ) : null}
              {size.terrain ? (
                <Fact label="Terrain">
                  {formatBytes(size.terrain.bytes)}
                  <span className="block text-ink-muted">to zoom {size.terrain.maxZoom}</span>
                </Fact>
              ) : null}
              <Fact label={`On this ${DEVICE}`}>
                <span className="font-semibold">about {formatBytes(size.totalBytes)}</span>
                <span className="block text-ink-muted">and up to 2 MB of lettering and symbols</span>
              </Fact>
              {measure.data?.room !== null && measure.data?.room !== undefined ? (
                <Fact label="Room the browser reports">{formatBytes(measure.data.room)}</Fact>
              ) : null}
            </dl>
          ) : null}

          {refusal ? <Notice tone="warning">{refusal}</Notice> : null}

          {size && box && !refusal ? (
            <>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={80}
                placeholder="A name for this area"
                aria-label="A name for this area"
                className="text-small"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  loading={start.isPending}
                  onClick={() =>
                    start.mutate(
                      { title: title.trim() || (region ? region.name : `Map area, ${formatBboxSize(box)}`), bbox: box, size },
                      {
                        onSuccess: () => {
                          setTitle("");
                          forget();
                          void askToPersist();
                        },
                        onError: failed,
                      },
                    )
                  }
                >
                  <DeviceIcon /> Keep this area
                </Button>
                <Button onClick={forget}>Cancel</Button>
              </div>
            </>
          ) : (
            <Button className="justify-self-start" disabled={!engine && !region} loading={measure.isPending} onClick={check}>
              {region ? `Measure all of ${region.name}` : "Measure the area in view"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
