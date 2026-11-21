/**
 * The one card for anything heard on the radio, opened from the map (outpost-ywbh.10).
 * The same parts in the same order for every source: what it is; which receiver heard
 * it, and how; how old the report is, in words and as a time; its trail; the distance
 * and bearing from Home; what the source says of it; then the map's own tools from
 * there, pinning it as one of the household's, and removing it.
 */
import type { HeardSourceId } from "@outpost/shared";
import { Pin, PinOff, Ruler, Sun, Trash2, Waypoints, Wifi } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Joined } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MapCard } from "@/features/maps/map-chrome";
import { formatDateTime, timeAgo } from "@/lib/utils";
import { usePin, useRemoveStation } from "./data";
import { fromHome, type Home, sourceName } from "./words";

export interface LatLonPoint {
  lat: number;
  lon: number;
}

export interface HeardItem {
  source: HeardSourceId;
  /** A station's id, or a mesh radio's. */
  id: string;
  name: string;
  /** Its own name, when it is pinned under another. */
  heardAs: string | null;
  kindWords: string | null;
  receiver: string | null;
  path: string | null;
  at: number;
  position: LatLonPoint | null;
  /** Positions along its trail; null where the source keeps only the last. */
  trail: Array<LatLonPoint & { at: number }> | null;
  facts: Array<string | null>;
  comment: string | null;
  more?: ReactNode;
  /** Mesh radios are pinned and named in the mesh radio's own settings. */
  pinnable: boolean;
  pinned: boolean;
  pinName: string | null;
  removable: boolean;
}

export interface HeardTools {
  measure(position: LatLonPoint): void;
  sight(position: LatLonPoint): void;
  range(position: LatLonPoint, name: string): void;
  sun(position: LatLonPoint, name: string): void;
}

function trailWords(item: HeardItem): string {
  if (item.trail === null) return "Only its last position is kept.";
  if (item.trail.length <= 1) return "One position heard so far.";
  const first = item.trail[0]!;
  return `Trail of ${item.trail.length} positions, the first ${timeAgo(first.at)}, drawn on the map.`;
}

function PinForm({ item, onDone }: { item: HeardItem; onDone: () => void }) {
  const pin = usePin();
  const [name, setName] = useState(item.pinName ?? item.name);
  const id = useId();
  return (
    <form
      className="mt-2 grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        pin.mutate({ id: item.id, pinned: true, name: name.trim() || null }, { onSuccess: onDone });
      }}
    >
      <label htmlFor={id} className="text-small font-medium text-ink">
        Name on the map
      </label>
      <Input id={id} value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="primary" loading={pin.isPending}>
          Pin it
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function HeardCard({ item, home, tools, onClose }: { item: HeardItem; home: Home | null; tools?: HeardTools; onClose: () => void }) {
  const [pinning, setPinning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const pin = usePin();
  const remove = useRemoveStation();
  const distance = item.position ? fromHome(home, item.position) : null;
  const position = item.position;
  return (
    <MapCard title={<span className="font-title">{item.name}</span>} onClose={onClose} closeLabel="Close this card">
      <div className="grid gap-1 text-small">
        <p className="text-ink-muted">
          <Joined parts={[item.kindWords, sourceName(item.source), item.heardAs ? `heard as ${item.heardAs}` : null].filter(Boolean)} />
        </p>
        <p className="text-ink">
          <Joined parts={[item.receiver ? `Heard by ${item.receiver}` : null, item.path].filter(Boolean)} />
        </p>
        <p className="text-ink">
          <span className="font-medium">Last heard {timeAgo(item.at)}</span>
          <span className="text-ink-muted"> · {formatDateTime(item.at)}</span>
        </p>
        <p className="text-ink-muted">{trailWords(item)}</p>
        <p className="text-ink">
          {distance ?? (home ? "No position heard yet." : "Mark a saved place as home to see how far away it is.")}
        </p>
        {item.facts.some(Boolean) ? (
          <p className="text-ink">
            <Joined parts={item.facts.filter(Boolean)} />
          </p>
        ) : null}
        {item.comment ? <p className="text-ink-muted [overflow-wrap:anywhere]">“{item.comment}”</p> : null}
        {item.more}
      </div>

      {position && tools ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => tools.measure(position)}>
            <Ruler aria-hidden /> Measure from here
          </Button>
          <Button size="sm" variant="ghost" onClick={() => tools.sight(position)}>
            <Waypoints aria-hidden /> Line of sight
          </Button>
          <Button size="sm" variant="ghost" onClick={() => tools.range(position, item.name)}>
            <Wifi aria-hidden /> Estimated range
          </Button>
          <Button size="sm" variant="ghost" onClick={() => tools.sun(position, item.name)}>
            <Sun aria-hidden /> Sun times
          </Button>
        </div>
      ) : null}

      {pinning ? (
        <PinForm item={item} onDone={() => setPinning(false)} />
      ) : item.pinnable || item.removable ? (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border pt-2">
          {item.pinnable ? (
            item.pinned ? (
              <Button size="sm" variant="ghost" loading={pin.isPending} onClick={() => pin.mutate({ id: item.id, pinned: false })}>
                <PinOff aria-hidden /> Unpin
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setPinning(true)}>
                <Pin aria-hidden /> Pin as one of ours
              </Button>
            )
          ) : null}
          {item.removable ? (
            <Button size="sm" variant="danger-ghost" onClick={() => setRemoving(true)}>
              <Trash2 aria-hidden /> Remove
            </Button>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${item.name}?`}
        description="Its last report and its whole trail are removed from Outpost. If it is heard again, it comes back as new."
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(item.id, {
            onSuccess: () => {
              setRemoving(false);
              onClose();
            },
          })
        }
      />
    </MapCard>
  );
}
