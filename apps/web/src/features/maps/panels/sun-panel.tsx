/**
 * The Sun tab of the map's panel: sun times for the centre of the map, without having to
 * save a place, search for one, or know about the long press. The tab's name is on screen
 * whenever the map is, on a phone as well, which is the point of it.
 *
 * The centre is the same point the readout at the bottom of the map gives, and the one the
 * cross marks on a touch screen while the sheet is lowered. It is read when the map comes to
 * rest, not on every frame.
 */
import { LocateFixed } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText, type LocateState } from "../hooks";
import { formatPosition, type ReadoutFormat } from "../lib/coords";
import type { CameraView } from "../lib/view";
import type { MapEngine } from "../map/engine";
import { Locator } from "../radio/locator";
import { PanelHeading } from "../ui";
import { SunTimes } from "./sun";

const link = "text-primary underline decoration-1 underline-offset-2 hover:decoration-2";

/** Where the map is looking, once it has come to rest. */
function useRestingView(engine: MapEngine | null): CameraView | null {
  const [view, setView] = useState<CameraView | null>(() => engine?.getView() ?? null);
  useEffect(() => {
    if (!engine) return setView(null);
    setView(engine.getView());
    return engine.on("moveend", setView);
  }, [engine]);
  return view;
}

/**
 * Sun times where the device is. The map's own "Show where I am" does the finding; over
 * plain HTTP a browser refuses, and this says so here, where someone looking for sun times
 * where they are will be reading, with the way to put it right.
 */
function WhereYouAre({ locate, onLocate }: { locate: LocateState; onLocate: () => void }) {
  return (
    <section className="grid gap-1.5 border-t border-border pt-3">
      <h4 className="text-small font-medium text-ink">Where you are</h4>
      {window.isSecureContext ? (
        <>
          <p className="text-small text-ink-muted">
            {locate === "following"
              ? "The map has been moved to where this device is. Until you move it again, the times above are for where you are."
              : "Outpost can move the map to where this device is, so that the times above are for where you are."}
          </p>
          <Button size="sm" onClick={onLocate} className="justify-self-start">
            <LocateFixed />
            {locate === "off" ? "Show where I am" : locate === "waiting" ? "Finding your position. Stop" : "Stop showing where I am"}
          </Button>
        </>
      ) : (
        <p className="text-small text-ink-muted">
          Browsers share a device’s location only with pages opened over HTTPS, or on the computer Outpost runs on. This page was opened
          over plain HTTP, so Outpost cannot find where you are. How to set that up is under{" "}
          <Link to="/settings#https" className={link}>
            Settings → HTTPS on your network
          </Link>
          . Until then, move the map until its centre is where you are.
        </p>
      )}
    </section>
  );
}

export function SunPanel({
  engine,
  format,
  locate,
  onLocate,
  zone,
}: {
  /** Null until the map is drawn, and for good when it cannot be. */
  engine: MapEngine | null;
  format: ReadoutFormat;
  /** Undefined when the browser has no geolocation at all. */
  locate: LocateState | undefined;
  onLocate: () => void;
  /** The time zone of the device's clock; read from the browser unless given. */
  zone?: string;
}) {
  const view = useRestingView(engine);
  const coordinates = view ? formatPosition(view.lat, view.lon, format, view.zoom).text : "";

  return (
    <div className="scroll-quiet grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 py-4">
      {view ? (
        <>
          {/* Kept short: on a small phone the half-raised sheet has to show the line with sunrise and sunset under it. */}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <PanelHeading className="w-full">Sun at the centre of the map</PanelHeading>
            <button
              type="button"
              onClick={async () => {
                if (await copyText(coordinates)) toast.success(`Copied ${coordinates}`);
              }}
              title="Copy"
              aria-label={`Copy coordinates ${coordinates}`}
              className="tabular rounded-[3px] font-mono text-[0.8125rem] text-ink underline decoration-border-strong decoration-dotted underline-offset-4 hover:decoration-ink"
            >
              {coordinates}
            </button>
            {/* Already the locator when that is the format coordinates are shown in. */}
            {format === "maidenhead" ? null : <Locator position={view} />}
          </div>
          <SunTimes position={view} zone={zone} />
          {locate === undefined ? null : <WhereYouAre locate={locate} onLocate={onLocate} />}
          <p className="border-t border-border pt-3 text-small text-ink-muted">
            Move the map and the times follow its centre.
            {/* The cross is drawn for touch screens only, and on a phone only while the sheet is out of its way. */}
            <span className="hidden [@media(pointer:coarse)]:inline">
              {" "}
              <span className="md:hidden">With this panel lowered, a cross marks the centre.</span>
              <span className="max-md:hidden">A cross marks the centre.</span>
            </span>{" "}
            A saved place and a search result each have a Sun line of their own, and a right-click on the map, or a press held on it, offers
            “Sun times here”.
          </p>
        </>
      ) : (
        <p className="text-small text-ink-muted">
          Sun times here are for the centre of the map, and the map is not drawn. A saved place has a Sun line of its own when it is opened.
        </p>
      )}
    </div>
  );
}
