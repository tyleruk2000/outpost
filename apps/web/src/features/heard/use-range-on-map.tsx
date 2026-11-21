/**
 * The range view on the map (outpost-ywbh.8), opened from the Heard on the radio screen as
 * /maps?range=… (and &compare=… for a second test): the outline of where the receiver heard
 * from, every position it heard, and a card with the furthest named and what was kept
 * apart. Printed with the map page like the rest of what was heard.
 */
import { type ReactNode, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import type { MapEngine } from "@/features/maps/map/engine";
import { EMPTY, type FeatureCollection } from "@/features/maps/map/overlays";
import { MapCard } from "@/features/maps/map-chrome";
import type { HeardTools } from "./card";
import { useReports } from "./data";
import { HEARD_RANGE, rememberHeard } from "./heard";
import { computeRange } from "./range";
import { queryOf, type RangeChoice, RangeSummary } from "./range-view";
import type { Home } from "./words";

function parseChoice(text: string | null): RangeChoice | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<RangeChoice>;
    if (typeof value.receiverId !== "string" || typeof value.from !== "number" || typeof value.to !== "number") return null;
    return {
      receiverId: value.receiverId,
      stationId: typeof value.stationId === "string" ? value.stationId : null,
      from: value.from,
      to: value.to,
    };
  } catch {
    return null;
  }
}

export function useRangeOnMap({
  engine,
  home,
  tools,
}: {
  engine: MapEngine | null;
  home: Home | null;
  tools: HeardTools;
}): ReactNode | null {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const choice = parseChoice(params.get("range"));
  const compare = parseChoice(params.get("compare"));
  const main = useReports(choice ? queryOf(choice) : {}, Boolean(choice));
  const other = useReports(compare ? queryOf(compare) : {}, Boolean(compare));
  const result = useMemo(() => (main.data && home ? computeRange(main.data.reports, home) : null), [main.data, home]);
  const second = useMemo(() => (other.data && home ? computeRange(other.data.reports, home) : null), [other.data, home]);

  useEffect(() => {
    if (!engine) return;
    if (!result) {
      engine.setOverlay(HEARD_RANGE, EMPTY);
      rememberHeard(HEARD_RANGE, EMPTY);
      return;
    }
    const data: FeatureCollection = { type: "FeatureCollection", features: [] };
    if (result.outline.length > 0)
      data.features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: result.outline } });
    if (second && second.outline.length > 0)
      data.features.push({ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: [second.outline] } });
    for (const report of [...result.direct, ...[...result.via.values()].flat()])
      data.features.push({
        type: "Feature",
        properties: { direct: result.direct.includes(report) },
        geometry: { type: "Point", coordinates: [report.lon, report.lat] },
      });
    engine.setOverlay(HEARD_RANGE, data);
    rememberHeard(HEARD_RANGE, data);
    if (result.furthest && home) {
      const lats = [home.lat, ...result.direct.map((report) => report.lat)];
      const lons = [home.lon, ...result.direct.map((report) => report.lon)];
      engine.flyTo({ lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 });
    }
  }, [engine, result, second, home]);

  useEffect(
    () => () => {
      engine?.setOverlay(HEARD_RANGE, EMPTY);
      rememberHeard(HEARD_RANGE, EMPTY);
    },
    [engine],
  );

  if (!choice) return null;
  const close = () => {
    const next = new URLSearchParams(location.search);
    next.delete("range");
    next.delete("compare");
    navigate({ search: next.toString() }, { replace: true });
  };
  return (
    <MapCard title="Range heard" onClose={close} closeLabel="Close the range view">
      {!home ? (
        <p className="text-small text-ink-muted">The range view is measured from home: mark a saved place as home first.</p>
      ) : main.isPending ? (
        <p className="text-small text-ink-muted">Working it out…</p>
      ) : result ? (
        <>
          <RangeSummary result={result} limited={main.data?.limited ?? false} />
          {second?.furthest ? (
            <p className="mt-1 text-small text-ink">
              Compared, dashed: furthest {Math.round(second.furthest.meters / 100) / 10} km against{" "}
              {result.furthest ? Math.round(result.furthest.meters / 100) / 10 : 0} km.
            </p>
          ) : null}
          <div className="mt-2">
            <Button size="sm" variant="ghost" onClick={() => tools.range({ lat: home.lat, lon: home.lon }, home.name)}>
              Estimated range from home
            </Button>
          </div>
        </>
      ) : (
        <p className="text-small text-danger">The positions could not be read.</p>
      )}
    </MapCard>
  );
}
