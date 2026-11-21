/**
 * The household's mesh radios on the map (outpost-xeu3): each radio's last reported
 * position, in the "Heard on the radio" group. Two switches, both off to begin with: the
 * group's row (remembered on this device) draws the marks, and each radio's own switch
 * (kept by the server, the same for every device) decides whether its place is shared at
 * all, since it shows where someone is. Kept fresh by `mesh.changed`; asked for only while
 * the map is open.
 */
import type { MeshPosition, MeshPositionsResponse } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import { Switch } from "@/components/ui/misc";
import { HEARD_SOURCES, type HeardSource, heardFeature, rememberHeard } from "@/features/heard/heard";
import { useStoredState } from "@/features/maps/hooks";
import type { MapEngine } from "@/features/maps/map/engine";
import { EMPTY, type FeatureCollection } from "@/features/maps/map/overlays";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { usePageVisible } from "@/lib/page-visible";
import { timeAgo } from "@/lib/utils";

const POSITIONS_KEY = ["mesh", "positions"];
const KEY = "outpost.maps.heard.mesh";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export const radioName = (radio: Pick<MeshPosition, "id" | "longName" | "shortName">) =>
  radio.longName?.trim() || radio.shortName?.trim() || radio.id;

export const useMeshPositions = (enabled = true) =>
  useQuery({
    queryKey: POSITIONS_KEY,
    queryFn: () => api.get<MeshPositionsResponse>("/api/mesh/positions"),
    staleTime: Number.POSITIVE_INFINITY,
    enabled,
  });

export function useSetOnMap() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, onMap }: { id: string; onMap: boolean }) =>
      api.put<MeshPositionsResponse>(`/api/mesh/radios/${encodeURIComponent(id)}/map`, { onMap }),
    onSuccess: (data) => client.setQueryData(POSITIONS_KEY, data),
    onError: (error) => notify.error(errorMessage(error)),
  });
}

/** The marks for the radios switched on, faded by age. */
export function meshFeatures(radios: MeshPosition[], now = Date.now()): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: radios.flatMap((radio) =>
      radio.onMap && radio.position
        ? [heardFeature({ source: "mesh", id: radio.id, name: radioName(radio), at: radio.at, ...radio.position }, now)]
        : [],
    ),
  };
}

function RadioList({ radios }: { radios: MeshPosition[] }) {
  const setOnMap = useSetOnMap();
  const base = useId();
  if (radios.length === 0)
    return (
      <p className="text-small text-ink-muted">
        No radio of the mesh has reported where it is yet. A radio sends its position from time to time once it has a fix.
      </p>
    );
  return (
    <>
      <p className="text-small text-ink-muted">
        Each radio is off the map until switched on here, for every device: it shows where someone is.
      </p>
      <ul aria-label="Radios that have reported a position" className="mt-1 grid gap-1">
        {radios.map((radio, index) => (
          <li key={radio.id} className="flex items-center gap-3">
            <label htmlFor={`${base}-${index}`} className="min-w-0 flex-1 text-small text-ink">
              {radioName(radio)} <span className="text-ink-muted">reported {timeAgo(radio.at)}</span>
            </label>
            <Switch
              id={`${base}-${index}`}
              checked={setOnMap.isPending && setOnMap.variables?.id === radio.id ? setOnMap.variables.onMap : radio.onMap}
              onCheckedChange={(onMap) => setOnMap.mutate({ id: radio.id, onMap })}
              aria-label={`Show ${radioName(radio)} on the map`}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

export function useMeshOnMap({ engine }: { engine: MapEngine | null }): { source: HeardSource | null; radios: MeshPosition[] } {
  const [on, setOn] = useStoredState(KEY, isBoolean, false);
  const positions = useMeshPositions();
  const data = positions.data;
  const radios = useMemo(() => data?.radios ?? [], [data]);
  const shown = useMemo(() => radios.filter((radio) => radio.onMap && radio.position), [radios]);
  // Ages in the labels stay true: drawn again each minute while the page is in view, never while it is hidden.
  const visible = usePageVisible();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!visible || !on) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [visible, on]);
  useEffect(() => {
    if (!engine) return;
    void tick;
    const marks = on ? meshFeatures(shown) : EMPTY;
    engine.setOverlay(HEARD_SOURCES.mesh, marks);
    rememberHeard(HEARD_SOURCES.mesh, marks);
  }, [engine, on, shown, tick]);

  // A household with no radio that has reported a place is not shown an empty group.
  if (!positions.isError && radios.length === 0 && !on) return { source: null, radios };
  return {
    radios: on ? shown : [],
    source: {
      id: "mesh",
      label: "Mesh radios",
      count: positions.data ? shown.length : null,
      on,
      onChange: setOn,
      below: positions.isError ? (
        <p role="alert" className="text-small text-danger">
          {errorMessage(positions.error)}
        </p>
      ) : positions.data ? (
        <RadioList radios={radios} />
      ) : null,
    },
  };
}
