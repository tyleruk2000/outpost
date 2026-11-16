/**
 * Repeaters on the Maps screen: whether they are switched on (remembered in this
 * browser), keeping them drawn for the view, opening one when it is pressed, and
 * handing it to the line-of-sight check.
 *
 * The Maps screen mounts this with one call and shows the card it returns. Everything
 * else about repeaters lives in this folder.
 */
import {
  bearingDegrees,
  formatMHz,
  haversineMeters,
  REPEATER_STATUS_NAMES,
  type RepeaterDetailResponse,
  toMaidenhead,
} from "@outpost/shared";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useStoredState } from "@/features/maps/hooks";
import { formatBearing, formatDistance, type LatLon } from "@/features/maps/lib/geo";
import type { MapEngine } from "@/features/maps/map/engine";
import { EMPTY } from "@/features/maps/map/overlays";
import { MapCard } from "@/features/maps/map-chrome";
import type { SightEnd } from "@/features/maps/radio/use-sight";
import { useRepeater, useRepeaterOverlay, useRepeatersOverview } from "../data";
import { accessParts, isApproximate, modesLine, precisionText, shiftWords, sourceOf } from "../words";
import { nearestHit, overlayBox, REPEATER_SOURCE, repeatersData } from "./layers";

const KEY = "outpost.maps.repeaters";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

/** How much of the bottom of the map the repeater's card covers: on a phone it is most of the lower half. */
const cardCover = () => (window.matchMedia("(min-width: 48rem)").matches ? 0 : 290);

/** The two ends a line-of-sight check starts with. The first is null when the person is to choose it on the map. */
export type SightStart = [SightEnd | null, SightEnd];

export interface RepeatersOnMap {
  on: boolean;
  setOn(on: boolean): void;
  /** The card for the repeater that is open, or for having none to show. Null when there is nothing to say. */
  card: ReactNode | null;
}

/** The end of a line-of-sight path that a repeater makes, named so that the check says what its position is worth. */
export function sightEndOf(repeater: RepeaterDetailResponse["repeater"]): SightEnd | null {
  if (repeater.lat === null || repeater.lon === null) return null;
  const precision = precisionText(repeater);
  return {
    position: { lat: repeater.lat, lon: repeater.lon },
    name: isApproximate(repeater)
      ? `${repeater.callsign}: approximate listed position, ${precision}`
      : `${repeater.callsign}: listed position`,
  };
}

function RepeaterCard({
  detail,
  from,
  onSight,
  onClose,
}: {
  detail: RepeaterDetailResponse;
  /** Where distance and bearing are measured from, and what that place is called. */
  from: { position: LatLon; name: string } | null;
  onSight: (() => void) | undefined;
  onClose: () => void;
}) {
  const { repeater, list } = detail;
  const source = sourceOf(list);
  const access = accessParts(repeater);
  const placed = repeater.lat !== null && repeater.lon !== null;
  const locator = repeater.locator || (placed ? (toMaidenhead(repeater.lat!, repeater.lon!, 6) ?? "") : "");
  const meters = placed && from ? haversineMeters(from.position.lat, from.position.lon, repeater.lat!, repeater.lon!) : null;
  return (
    <MapCard title={repeater.callsign} onClose={onClose} closeLabel="Close this repeater">
      <p className="tabular mt-0.5 text-body text-ink">
        <span className="font-mono text-[0.9375rem]">{formatMHz(repeater.outputHz)} MHz</span>, {shiftWords(repeater)}
      </p>
      <p className="tabular text-small text-ink">
        {[...access, modesLine(repeater)].filter(Boolean).join(" · ") || "No access details listed"}
      </p>
      <p className="mt-1 text-small text-ink-muted">
        {[repeater.place, locator].filter(Boolean).join(" · ")}
        {meters !== null && from && meters >= 50 ? (
          <span className="tabular block text-ink">
            {isApproximate(repeater) ? "About " : ""}
            {formatDistance(meters)}, {formatBearing(bearingDegrees(from.position.lat, from.position.lon, repeater.lat!, repeater.lon!))}{" "}
            from {from.name}
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-small text-ink-muted">
        {REPEATER_STATUS_NAMES[repeater.status]}. {source.text}
        {source.age ? <span className="text-warning">, {source.age}</span> : null}.
      </p>
      {isApproximate(repeater) ? (
        <p className="mt-1 text-small text-ink-muted">
          Its position is listed only {precisionText(repeater)}, so the dot and any line of sight from it are rough.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="primary">
          <Link to={`/radio/repeaters/${repeater.id}`}>Details</Link>
        </Button>
        {onSight ? (
          <Button size="sm" onClick={onSight}>
            Check line of sight
          </Button>
        ) : null}
      </div>
    </MapCard>
  );
}

export function useRepeatersOnMap({
  engine,
  browsing,
  here,
  onSight,
}: {
  engine: MapEngine | null;
  /** No tool is in hand, so a press on the map can open a repeater. */
  browsing: boolean;
  /** Where the device is, when it is being followed. */
  here: LatLon | null;
  /** Takes up the line-of-sight tool with these ends. */
  onSight: (start: SightStart) => void;
}): RepeatersOnMap {
  const location = useLocation();
  const navigate = useNavigate();
  const [on, setStored] = useStoredState(KEY, isBoolean, false);
  const [box, setBox] = useState<string | null>(null);
  const [centre, setCentre] = useState<LatLon | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [emptyDismissed, setEmptyDismissed] = useState(false);
  const overview = useRepeatersOverview();
  const overlay = useRepeaterOverlay(on ? box : null, {});
  const detail = useRepeater(selectedId);

  // Which part of the map to ask about: now, and each time the map comes to rest.
  useEffect(() => {
    if (!engine || !on) return;
    const read = () => {
      setBox(overlayBox(engine.getBounds()));
      setCentre(engine.getCenter());
    };
    read();
    return engine.on("moveend", read);
  }, [engine, on]);

  const selected = detail.data?.repeater;
  const selectedAt = selected && selected.lat !== null && selected.lon !== null ? { lat: selected.lat, lon: selected.lon } : null;
  const ringLat = selectedAt?.lat;
  const ringLon = selectedAt?.lon;
  useEffect(() => {
    if (!engine) return;
    const ring = ringLat !== undefined && ringLon !== undefined ? { lat: ringLat, lon: ringLon } : null;
    engine.setOverlay(REPEATER_SOURCE, on ? repeatersData(overlay.data, ring) : EMPTY);
  }, [engine, on, overlay.data, ringLat, ringLon]);

  // On a phone the card covers the lower part of the map: the repeater it is about is kept clear of it.
  useEffect(() => {
    if (!engine || ringLat === undefined || ringLon === undefined) return;
    const covered = cardCover();
    const position = { lat: ringLat, lon: ringLon };
    if (covered > 0 && !engine.isInView(position, covered)) engine.panTo(position, covered);
  }, [engine, ringLat, ringLon]);

  // A press on a repeater opens it; a press on a patch goes in closer to it.
  const latest = useRef({ browsing, on, data: overlay.data });
  latest.current = { browsing, on, data: overlay.data };
  useEffect(() => {
    if (!engine) return;
    return engine.on("click", ({ point, hit }) => {
      const now = latest.current;
      // A saved place or a route under the press is what was meant.
      if (!now.browsing || !now.on || hit) return;
      const found = nearestHit(now.data, point, (position) => engine.project(position));
      if (!found) return;
      if (found.kind === "point" && found.id) setSelectedId(found.id);
      else engine.flyTo({ lat: found.lat, lon: found.lon }, Math.min(engine.getZoom() + 2, 14));
    });
  }, [engine]);

  // Putting a tool in hand, or switching repeaters off, closes the card.
  useEffect(() => {
    if (!browsing || !on) setSelectedId(null);
  }, [browsing, on]);

  const sightFrom = useCallback(
    (from: SightEnd | null) => {
      const end = selected ? sightEndOf(selected) : null;
      if (!end) return;
      setSelectedId(null);
      onSight([from, end]);
    },
    [selected, onSight],
  );

  // Links from the list and from search: /maps?repeater=…, with &sight=1 to go straight to the check.
  const handled = useRef<string | undefined>(undefined);
  const linked = new URLSearchParams(location.search).get("repeater");
  useEffect(() => {
    if (linked && handled.current !== location.key) {
      setStored(true);
      setSelectedId(linked);
    }
  }, [linked, location.key, setStored]);
  useEffect(() => {
    if (!engine || !linked || handled.current === location.key || selectedId !== linked) return;
    if (detail.isError) {
      handled.current = location.key;
      toast.error("That repeater is no longer held.");
      setSelectedId(null);
      return;
    }
    if (!detail.data) return;
    handled.current = location.key;
    const params = new URLSearchParams(location.search);
    const end = sightEndOf(detail.data.repeater);
    if (!end) {
      toast("That repeater has no position, so it is not on the map.", {
        action: { label: "Details", onClick: () => navigate(`/radio/repeaters/${linked}`) },
      });
    } else {
      engine.flyTo(end.position, Math.max(engine.getZoom(), 11), cardCover());
      if (params.get("sight")) {
        const match = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(params.get("from") ?? "");
        setSelectedId(null);
        onSight([match ? { position: { lat: Number(match[1]), lon: Number(match[2]) } } : null, end]);
      }
    }
    // The link has done its work; a reload should not do it again.
    for (const name of ["repeater", "sight", "from"]) params.delete(name);
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${location.pathname}${rest ? `?${rest}` : ""}`);
  }, [engine, linked, location.key, location.search, location.pathname, selectedId, detail.data, detail.isError, navigate, onSight]);

  const setOn = useCallback(
    (next: boolean) => {
      setStored(next);
      setEmptyDismissed(false);
      if (next && (overview.data?.withPosition ?? 0) > 0) {
        toast("Repeaters are on the map. Press one for its details.", {
          action: {
            label: "Open the list",
            onClick: () => navigate(`/radio/repeaters${centre ? `?near=${centre.lat.toFixed(4)},${centre.lon.toFixed(4)}` : ""}`),
          },
        });
      }
    },
    [setStored, overview.data, navigate, centre],
  );

  let card: ReactNode | null = null;
  if (browsing && on) {
    if (selectedId && detail.isPending) {
      card = (
        <MapCard title="Repeater" onClose={() => setSelectedId(null)}>
          <div className="mt-2 grid gap-2" aria-busy>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
            <span className="sr-only">Loading the repeater</span>
          </div>
        </MapCard>
      );
    } else if (selectedId && detail.data) {
      const from = here ? { position: here, name: "where you are" } : centre ? { position: centre, name: "the middle of the map" } : null;
      card = (
        <RepeaterCard
          detail={detail.data}
          from={from}
          onSight={selectedAt ? () => sightFrom(here ? { position: here, name: "Where you are" } : null) : undefined}
          onClose={() => setSelectedId(null)}
        />
      );
    } else if (overview.data && overview.data.withPosition === 0 && !emptyDismissed) {
      card = (
        <MapCard
          title={overview.data.total === 0 ? "No repeaters are held yet" : "None of your repeaters has a position"}
          onClose={() => setEmptyDismissed(true)}
          closeLabel="Dismiss"
        >
          <p className="mt-1 text-small text-ink-muted">
            {overview.data.total === 0
              ? "Repeaters come from a file you import or are entered by hand. Outpost does not download a list itself."
              : "They are in the list, but with no position there is nothing to draw. A position or a locator can be added to an entry."}
          </p>
          <div className="mt-3">
            <Button asChild size="sm" variant="primary">
              <Link to="/radio/repeaters">Open repeaters</Link>
            </Button>
          </div>
        </MapCard>
      );
    }
  }

  return { on, setOn, card };
}
