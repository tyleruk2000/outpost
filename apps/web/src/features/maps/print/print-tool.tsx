/**
 * "Print or save as PDF": a paper map of part of the map, on one page, for when the
 * phone is flat.
 *
 * Two steps. First, on the map: a box the shape of the page says what will be on it.
 * It is the same box, with the same handles, as the one for downloading a region, held
 * to the page's shape; paper, which way up and the scale are chosen here because they
 * decide that shape and size. Then the page itself (print-dialog.tsx): a preview, what
 * to put on it, and the file.
 *
 * Loaded when the tool is first taken up, so the rest of the maps screen does not carry it.
 */
import type { Bbox } from "@outpost/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented, Select } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useStoredState } from "../hooks";
import type { ReadoutFormat } from "../lib/coords";
import { formatBboxSize } from "../lib/geo";
import type { StyleInput } from "../lib/style";
import type { MapEngine } from "../map/engine";
import { MapCard } from "../map-chrome";
import { mapCardFoot } from "../ui";
import { isOrientation, isPaperId, type Orientation, PAPER_IDS, PAPERS, type PaperId, pageGeometry, paperName } from "./paper";
import { RESOLUTIONS, type Resolution } from "./pieces";
import { PrintDialog } from "./print-dialog";
import { boxAtScale, formatScale, frameOfBox, MAX_SCALE, MIN_SCALE, type PixelSize, ROUND_SCALES, scaleOfBox, shapeBox } from "./scale";

interface Prefs {
  paper: PaperId;
  orientation: Orientation;
  resolution: Resolution;
}

/** Remembered in this browser, like the other map preferences. */
const PREFS_KEY = "outpost.maps.print";
const isPrefs = (value: unknown): value is Prefs =>
  Boolean(value) &&
  isPaperId((value as Prefs).paper) &&
  isOrientation((value as Prefs).orientation) &&
  (RESOLUTIONS as readonly unknown[]).includes((value as Prefs).resolution);

const SCALE_USES: Record<number, string> = {
  10000: "A town or a village",
  25000: "Walking",
  50000: "Walking and cycling",
  100000: "Cycling and touring",
  250000: "A region",
};

/** A scale to three figures, which is how it is printed, so that the page is drawn at exactly the scale it states. */
function tidyScale(scale: number): number {
  const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(clamped)) - 2);
  return Math.round(clamped / magnitude) * magnitude;
}

/** A box about the same middle at the nearest scale that can be written in three figures. */
function tidyBox(bbox: Bbox, pixels: PixelSize): Bbox {
  return boxAtScale(frameOfBox(bbox, pixels).center, tidyScale(scaleOfBox(bbox, pixels)), pixels);
}

/**
 * The page-shaped box that fits in the middle of what the map shows, with room round it for its handles.
 * The middle is the map's own centre, which on a phone is the middle of the part the sheet leaves in view,
 * not of the whole rectangle the map is drawn in.
 */
function boxInView(engine: MapEngine, pixels: PixelSize): Bbox {
  const [west, south, east, north] = engine.getBounds();
  const centre = engine.getCenter();
  const [halfWidth, halfHeight] = [(east - west) * 0.36, (north - south) * 0.36];
  const view: Bbox = [
    Math.max(-180, centre.lon - halfWidth),
    centre.lat - halfHeight,
    Math.min(180, centre.lon + halfWidth),
    centre.lat + halfHeight,
  ];
  return tidyBox(shapeBox(view, pixels.width / pixels.height, "inside"), pixels);
}

export default function PrintTool({
  engine,
  style,
  format,
  onClose,
}: {
  engine: MapEngine;
  /** The style of the map on screen: what is installed and how the map is set. */
  style: Omit<StyleInput, "overlays">;
  format: ReadoutFormat;
  onClose: () => void;
}) {
  const [prefs, setPrefs] = useStoredState<Prefs>(PREFS_KEY, isPrefs, { paper: "a4", orientation: "portrait", resolution: 300 });
  const geometry = useMemo(() => pageGeometry(prefs.paper, prefs.orientation), [prefs.paper, prefs.orientation]);
  const pixels = geometry.mapPixels;
  const [box, setBox] = useState<Bbox>(() => boxInView(engine, pixels));
  /** A round scale being held to, or null when the scale is whatever the box makes it. */
  const [held, setHeld] = useState<number | null>(null);
  const [step, setStep] = useState<"area" | "page">("area");
  const scale = held ?? tidyScale(scaleOfBox(box, pixels));

  // The box on the map: held to the page's shape while its handles are moved, and gone when the tool is put down.
  useEffect(() => {
    const aspect = pixels.width / pixels.height;
    engine.setBoxShape((bbox, handle) => shapeBox(bbox, aspect, handle));
    return () => engine.setBoxShape(null);
  }, [engine, pixels]);
  useEffect(() => {
    engine.setBox(box, step === "area");
  }, [engine, box, step]);
  useEffect(() => () => engine.setBox(null, false), [engine]);

  useEffect(
    () =>
      engine.on("box", (result) => {
        if (!result.ok) {
          toast.error(
            result.reason === "antimeridian"
              ? "A page cannot cross the 180° meridian. Keep the box to one side of it."
              : "That is too small an area to print. Make the box larger.",
          );
          return;
        }
        // Moving a handle sets the scale by hand.
        setHeld(null);
        setBox(tidyBox(result.bbox, pixels));
      }),
    [engine, pixels],
  );

  /** Puts a new box on the map and brings all of it into view, clear of this card, which lies over the foot of the map. */
  const card = useRef<HTMLDivElement>(null);
  // The handles on the box's lower edge reach 7 px below it, so the room kept is the card's height and a little more.
  const clearOfCard = () => (card.current?.offsetHeight ?? 0) + 20;
  const place = (next: Bbox) => {
    setBox(next);
    engine.fitBounds(next, { maxZoom: 17, clearBottom: clearOfCard() });
  };
  // The box it starts with was fitted to the whole map; once the card has its height (a frame on, when what
  // gives way to a card on a phone has done so), make room for that too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the tool is taken up
  useEffect(() => {
    const frame = requestAnimationFrame(() => engine.fitBounds(box, { maxZoom: 17, clearBottom: clearOfCard() }));
    return () => cancelAnimationFrame(frame);
  }, [engine]);

  const repaper = (change: Partial<Pick<Prefs, "paper" | "orientation">>) => {
    const next = { ...prefs, ...change };
    setPrefs(next);
    // The same middle at the same scale, in the new page's shape.
    place(boxAtScale(frameOfBox(box, pixels).center, scale, pageGeometry(next.paper, next.orientation).mapPixels));
  };

  const rescale = (choice: string) => {
    if (choice === "fit") return setHeld(null);
    const next = Number(choice);
    setHeld(next);
    place(boxAtScale(frameOfBox(box, pixels).center, next, pixels));
  };

  return (
    <>
      <div ref={card} className="pointer-events-none flex w-full justify-center max-md:min-h-[52px] max-md:shrink">
        <MapCard title="Print or save as PDF" onClose={onClose} closeLabel="Stop: put the page away">
          {/* Left out on a phone, where this card shares a small screen with the box it is about. */}
          <p className="mt-1 text-small text-ink-muted max-md:hidden">
            The box is the page. Drag its corners and edges, or move the map and choose “Centre the box here”.
          </p>
          <div className="mt-3 grid gap-2 max-md:mt-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="Paper"
                value={prefs.paper}
                onChange={(paper) => repaper({ paper })}
                options={PAPER_IDS.map((id) => ({ value: id, label: PAPERS[id].label, description: PAPERS[id].millimetres }))}
                className="w-auto min-w-[7.5rem] flex-1"
              />
              <Segmented
                label="Which way up"
                value={prefs.orientation}
                onChange={(orientation) => repaper({ orientation })}
                options={[
                  { value: "portrait", label: "Portrait" },
                  { value: "landscape", label: "Landscape" },
                ]}
              />
            </div>
            <Select
              aria-label="Scale"
              value={held === null ? "fit" : String(held)}
              onChange={rescale}
              options={[
                {
                  value: "fit",
                  label: held === null ? `Fit the box: ${formatScale(scale)}` : "Fit the box",
                  description: "Whatever scale the box you draw comes to",
                },
                ...ROUND_SCALES.map((value) => ({ value: String(value), label: formatScale(value), description: SCALE_USES[value] })),
              ]}
            />
          </div>
          <p className="tabular mt-2 text-small text-ink" aria-live="polite">
            <span className="md:hidden">The box is the page: </span>
            {formatBboxSize(box)} on {paperName(prefs.paper, prefs.orientation)} at {formatScale(scale)}
          </p>
          <div className={cn(mapCardFoot, "mt-3 max-md:mt-1")}>
            <Button variant="primary" onClick={() => setStep("page")}>
              Preview the page
            </Button>
            <Button onClick={() => place(boxAtScale(engine.getCenter(), scale, pixels))}>Centre the box here</Button>
          </div>
        </MapCard>
      </div>

      {step === "page" ? (
        <PrintDialog
          geometry={geometry}
          bbox={box}
          scale={scale}
          style={style}
          format={format}
          resolution={prefs.resolution}
          onResolutionChange={(resolution) => setPrefs({ ...prefs, resolution })}
          onBack={() => setStep("area")}
        />
      ) : null}
    </>
  );
}
