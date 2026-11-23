/**
 * The route card as a PDF, under a planned or saved route: folded to one button until
 * asked for. Once open, the installed maps are read, the overview map is drawn off screen
 * on this device, and the card is laid out with the print kit, with the three things every
 * PDF made in Outpost offers: save it, add it to the library, share it.
 */

import { FileText } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Segmented, Spinner } from "@/components/ui/misc";
import { AID_PAPER_KEY, type AidPaper, isAidPaper, likelyPaper } from "@/features/encryption/paper-aids";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { kitPdfOf, useKitPdf } from "@/features/print-kit/use-kit-pdf";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { useMapOverview, useMapSources } from "../data";
import { regionsCacheKey } from "../lib/tiles";
import { readStored, writeStored } from "../lib/view";
import { PAPERS } from "../print/paper";
import { routeCardDocument } from "./route-card";
import { type CardRoute, type RouteMap, routeOverviewMap } from "./route-map";

/** What the PDF is called in the library: a road route, a door-to-door drive, a walk or a ride. */
const kindOf = (route: CardRoute) =>
  !("mode" in route) ? "Road route" : route.mode === "drive-door" ? "Door to door" : route.mode === "walk" ? "Walk" : "Ride";

export function RouteCardPdf({ route, name, from }: { route: CardRoute; name: string; from: { what: string; path: string } }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button className="justify-self-start" onClick={() => setOpen(true)}>
        <FileText aria-hidden /> Printable route card (PDF)
      </Button>
    );
  }
  return <RouteCardOpen route={route} name={name} from={from} />;
}

type MapState = { status: "drawing" } | { status: "drawn"; map: RouteMap | null; note: string | null };

function RouteCardOpen({ route, name, from }: { route: CardRoute; name: string; from: { what: string; path: string } }) {
  const [paper, setPaper] = useState<AidPaper>(() => readStored(AID_PAPER_KEY, isAidPaper, likelyPaper(navigator.language)));
  const sources = useMapSources();
  const overview = useMapOverview();
  const [map, setMap] = useState<MapState>({ status: "drawing" });
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  // The installed maps are read before the map is drawn, so a card made before they had loaded still has its map.
  const latest = useRef({ sources, overview });
  latest.current = { sources, overview };
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setMap({ status: "drawing" });
    (async () => {
      const { sources: s, overview: o } = latest.current;
      const [sourcesNow, overviewNow] = await Promise.all([
        s.data ? Promise.resolve(s.data) : s.refetch().then((result) => result.data),
        o.data ? Promise.resolve(o.data) : o.refetch().then((result) => result.data),
      ]);
      const regions = overviewNow?.regions ?? [];
      return routeOverviewMap(
        route,
        { sources: sourcesNow, regions, cacheKey: regionsCacheKey(regions), origin: window.location.origin },
        paper,
        { signal: controller.signal },
      );
    })()
      .then((drawn) => live && setMap({ status: "drawn", map: drawn, note: drawn.missing }))
      .catch(
        (error: unknown) =>
          live && setMap({ status: "drawn", map: null, note: `The overview map could not be drawn: ${errorMessage(error)}` }),
      );
    return () => {
      live = false;
      controller.abort();
    };
  }, [route, paper]);

  const drawn = map.status === "drawn";
  const drawnMap = map.status === "drawn" ? map.map : null;
  // Dated by the day it was planned, which the route holds: the same card made twice is the same file.
  const make = useMemo(
    () => (drawn ? () => routeCardDocument({ route, name, paper, map: drawnMap, made: new Date(route.plannedAt) }) : null),
    [drawn, drawnMap, route, name, paper],
  );
  const made = useKitPdf(make, { title: `${kindOf(route)} ${name}`, kind: kindOf(route), from });

  return (
    <section aria-label="Route card as a PDF" className="grid gap-3 border-t border-border pt-3" data-testid="road-route-card">
      <div>
        <h4 ref={heading} tabIndex={-1} className="text-body font-semibold text-ink focus:outline-none">
          Printable route card
        </h4>
        <p className="mt-0.5 text-small text-ink-muted">
          An overview map of the whole route, then the directions in large type with a box to tick for each line
          {made.status === "made" ? `: ${plural(made.pages, "page")} of ${PAPERS[paper].label}` : ""}. Made on this device.
        </p>
      </div>
      {map.status === "drawing" ? (
        <p className="flex items-center gap-2.5 text-small text-ink-muted" role="status">
          <Spinner label="Drawing" /> Drawing the overview map from the maps installed here
        </p>
      ) : map.note ? (
        <p className="text-small text-ink-muted">{map.note}</p>
      ) : null}
      {made.status === "failed" ? (
        <Notice tone="danger" title="The PDF could not be made">
          {made.error}
        </Notice>
      ) : (
        <PdfActions pdf={kitPdfOf(made)} />
      )}
      <Segmented<AidPaper>
        label="Paper for the PDF"
        value={paper}
        onChange={(next) => {
          setPaper(next);
          writeStored(AID_PAPER_KEY, next);
        }}
        options={(["a4", "letter"] as const).map((id) => ({ value: id, label: PAPERS[id].label }))}
        className="justify-self-start"
      />
    </section>
  );
}
