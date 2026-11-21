/**
 * The lines of position and the fix from Celestial navigation, on the map. The screen
 * keeps its last plot on this device and opens the map at `/maps?celnav=1`; the map then
 * draws it and shows a card saying what it is, until the card is closed.
 */
import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { MapEngine } from "@/features/maps/map/engine";
import { EMPTY } from "@/features/maps/map/overlays";
import { MapCard } from "@/features/maps/map-chrome";
import { readPref } from "@/features/tools/kit/device-pref";
import { CELNAV_SOURCE, celnavData } from "./map-layers";
import { formatLatLon, PLOT_KEY, readPlot } from "./sights";

export function useCelnavOnMap({ engine }: { engine: MapEngine | null }): { card: ReactNode | null } {
  const location = useLocation();
  const navigate = useNavigate();
  const asked = new URLSearchParams(location.search).get("celnav") === "1";
  const [plot, setPlot] = useState(() => (asked ? readPlot(readPref(PLOT_KEY)) : null));

  // biome-ignore lint/correctness/useExhaustiveDependencies: read again on each arrival with ?celnav=1, not on every change
  useEffect(() => {
    if (asked) setPlot(readPlot(readPref(PLOT_KEY)));
  }, [location.key]);

  const shown = asked ? plot : null;
  useEffect(() => {
    if (engine) engine.setOverlay(CELNAV_SOURCE, shown ? celnavData(shown) : EMPTY);
  }, [engine, shown]);

  if (!asked) return { card: null };
  const close = () => {
    const params = new URLSearchParams(location.search);
    params.delete("celnav");
    navigate({ search: params.toString() }, { replace: true });
  };
  return {
    card: (
      <MapCard title="Lines of position" onClose={close} closeLabel="Hide the lines of position">
        {shown ? (
          <div className="grid gap-2 text-small text-ink">
            <p>
              {shown.lines.length} {shown.lines.length === 1 ? "line" : "lines"} from your sights.{" "}
              {shown.fix
                ? `The fix is ${formatLatLon(shown.fix.lat, "lat")}, ${formatLatLon(shown.fix.lon, "lon")}; the shaded ellipse is where it lies nineteen times in twenty, if each sight is as good as allowed for.`
                : "Two lines that cross are needed for a fix."}
            </p>
            <p className="text-ink-muted">The open circle is the position the sights were worked from.</p>
            <Link to="/tools/celestial-navigation" className="font-medium text-primary underline underline-offset-2">
              Back to the sights
            </Link>
          </div>
        ) : (
          <p className="text-small text-ink">
            No sights have been worked on this device yet.{" "}
            <Link to="/tools/celestial-navigation" className="font-medium text-primary underline underline-offset-2">
              Open Celestial navigation
            </Link>
          </p>
        )}
      </MapCard>
    ),
  };
}
