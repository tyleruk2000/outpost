/**
 * What a route's own panel says about where it came from, when it was found in a route
 * source: the credit its data must keep, the element of OpenStreetMap it is, and when
 * and from where it was fetched. Also the way to give it heights once terrain is
 * installed. A route that was drawn or imported shows none of this.
 */
import { type Bbox, readTrackSource, type TrackDto, type TrackSource, type TrackWithGeometryDto } from "@outpost/shared";
import { Mountain } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { trackLines } from "../lib/profile";
import { terrainCover } from "../panels/route-editor";
import { Fact } from "../ui";
import { useFillFoundHeights } from "./data";
import { dayOf, elementLabel } from "./words";

const link = "text-primary underline decoration-1 underline-offset-2 hover:decoration-2";

/** The source of a stored route, or null for one that was drawn or imported. */
export const foundRouteSource = (geojson: TrackWithGeometryDto["geojson"] | undefined): TrackSource | null =>
  geojson ? readTrackSource(geojson) : null;

/** Rows for the route's list of facts. */
export function FoundRouteFacts({ source }: { source: TrackSource }) {
  const fetched = dayOf(source.fetchedAt);
  const asOf = dayOf(source.dataAsOf);
  return (
    <>
      <Fact label="From">
        {source.url ? (
          <a href={source.url} target="_blank" rel="noopener noreferrer" className={link}>
            {elementLabel(source)}
          </a>
        ) : (
          elementLabel(source)
        )}
        <span className="block text-ink-muted">fetched {fetched ?? "on an unknown day"}</span>
        <span className="block font-mono text-[0.8125rem] break-words text-ink-muted">from {source.server}</span>
        {asOf && asOf !== fetched ? <span className="block text-ink-muted">as the map was on {asOf}</span> : null}
      </Fact>
      <Fact label="Credit">
        <a href={source.creditUrl} target="_blank" rel="noopener noreferrer" className={link}>
          {source.attribution}
        </a>
        <span className="block text-ink-muted">
          <a href={source.licenseUrl} target="_blank" rel="noopener noreferrer" className={link}>
            {source.license}
          </a>
        </span>
      </Fact>
    </>
  );
}

/** One sentence for someone about to pass the route on. */
export function FoundRouteNote({ source }: { source: TrackSource }) {
  return (
    <p className="text-small text-ink-muted">
      This route's line is {source.attribution.replace(/^©\s*/, "")}' data. The credit is written into its GPX export; keep it there, and on
      any map you print or share with the route on it.
    </p>
  );
}

/**
 * Why a found route has no elevation profile, and the button that fills its heights in
 * when terrain now covers it. Renders nothing when there is nothing to say or do.
 */
export function FoundRouteHeights({
  track,
  geojson,
  terrain,
  hasProfile,
  reshaped,
}: {
  track: TrackDto;
  geojson: TrackWithGeometryDto["geojson"];
  terrain: Bbox | null;
  hasProfile: boolean;
  /** Its shape has since been redrawn by hand: the drawing tool's own button looks after its heights. */
  reshaped: boolean;
}) {
  const fill = useFillFoundHeights();
  if (reshaped) return null;
  const lines = trackLines(geojson);
  const missing = lines.some((line) => line.some((position) => position[2] === undefined));
  const ends = lines.flatMap((line) => [line[0]!, line.at(-1)!]).map(([lon, lat]) => ({ lat, lon }));
  const cover = terrainCover(ends, terrain);
  if (!missing) return null;
  return (
    <div className="grid gap-1.5">
      {!hasProfile && cover === "none" ? (
        <p className="text-small text-ink-muted">
          No terrain is installed where this route runs, so there are no heights to draw an elevation profile from. Nothing is downloaded to
          find them.
        </p>
      ) : hasProfile ? (
        <p className="text-small text-ink-muted">Terrain was installed for only part of this route when it was added.</p>
      ) : (
        <p className="text-small text-ink-muted">Terrain has been installed here since this route was added.</p>
      )}
      {cover !== "none" ? (
        <Button
          className="justify-self-start"
          loading={fill.isPending}
          onClick={() =>
            fill.mutate(track.id, {
              onSuccess: ({ elevation }) =>
                elevation === "none"
                  ? toast("No heights were found: the installed terrain does not reach this route.")
                  : toast.success(`Heights filled in for “${track.name}”.`),
              onError: (error) => toast.error(errorMessage(error)),
            })
          }
        >
          <Mountain /> Fill in heights from terrain
        </Button>
      ) : null}
    </div>
  );
}

/** The credit the map shows while a found route is drawn on it. */
export const ROUTE_CREDIT = {
  key: "found-routes",
  parts: [{ text: "Routes: " }, { text: "© OpenStreetMap contributors", href: "https://www.openstreetmap.org/copyright" }],
};

/** Whether any of the routes drawn on the map came from OpenStreetMap through a route source. */
export const anyFoundRoute = (tracks: Array<Pick<TrackWithGeometryDto, "geojson">>) =>
  tracks.some((track) => readTrackSource(track.geojson) !== null);
