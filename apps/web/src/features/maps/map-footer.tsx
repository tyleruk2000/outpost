/**
 * What sits along the bottom of the map: a scale bar, the coordinates of the pointer
 * (or of the middle of the map), and the credits for what is drawn.
 *
 * The scale and the coordinates follow the camera frame by frame, so they write to
 * the page directly instead of going through React state.
 */
import type { MapAttribution } from "@outpost/shared";
import { ChevronUp, Copy } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Menu, MenuCheckItem, MenuContent, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { copyText } from "@/lib/clipboard";
import { notify } from "@/lib/notify";
import { usePageVisible } from "@/lib/page-visible";
import { cn } from "@/lib/utils";
import { useGroundHeight } from "./ground-height";
import { HeightFigure, HeightInMenu } from "./height-readout";
import { useIsDesktop } from "./hooks";
import { parseAttribution } from "./lib/attribution";
import { formatPosition, READOUT_FORMATS, READOUT_LABELS, type ReadoutFormat } from "./lib/coords";
import { type LatLon, metersPerPixel, scaleBar } from "./lib/geo";
import type { MapEngine } from "./map/engine";
import { mapSurface } from "./ui";

function ScaleBar({ engine }: { engine: MapEngine }) {
  const bar = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const update = () => {
      const scale = scaleBar(metersPerPixel(engine.getCenter().lat, engine.getZoom()), 96);
      if (bar.current) bar.current.style.width = `${Math.round(scale.width)}px`;
      if (label.current) label.current.textContent = scale.label;
    };
    update();
    return engine.on("move", update);
  }, [engine]);

  return (
    <div className="outpost-scale pointer-events-none flex flex-col items-start gap-0.5" role="img" aria-label="Map scale">
      <span ref={label} className="tabular rounded-[3px] bg-page/85 px-1 text-micro font-medium text-ink" />
      {/* A ruler: ticks at both ends, on a backing that keeps it readable over any ground. */}
      <div ref={bar} className="h-1.5 border-x-2 border-b-2 border-ink shadow-[0_1px_0_1px_var(--page),0_-1px_0_0_var(--page)]" />
    </div>
  );
}

function CoordinateReadout({
  engine,
  format,
  onFormatChange,
  below,
  heights,
}: {
  engine: MapEngine;
  format: ReadoutFormat;
  onFormatChange: (format: ReadoutFormat) => void;
  /** A line about the same point, under the coordinates on the same surface. */
  below?: ReactNode;
  heights?: ReadoutHeights;
}) {
  const text = useRef<HTMLSpanElement>(null);
  const [opened, setOpened] = useState(false);
  const desktop = useIsDesktop();
  const visible = usePageVisible();
  // On a phone the folded readout has no room for a height: it is read only while the readout is opened.
  const height = useGroundHeight(engine, {
    active: Boolean(heights) && visible && (desktop || opened),
    terrain: heights?.terrain ?? false,
  });
  const source = useRef<HTMLSpanElement>(null);
  const pointer = useRef<LatLon | null>(null);

  useEffect(() => {
    const update = () => {
      const position = pointer.current ?? engine.getCenter();
      const readout = formatPosition(position.lat, position.lon, format, engine.getZoom());
      if (text.current) text.current.textContent = readout.text;
      if (source.current) {
        const where = pointer.current ? "Pointer" : "Centre";
        // Outside Great Britain there is no grid reference to give; say what is shown instead.
        source.current.textContent = format === "osgb" && readout.format !== "osgb" ? `${where}, outside the British grid` : where;
      }
    };
    update();
    const offMove = engine.on("move", update);
    const offPointer = engine.on("pointer", (position) => {
      pointer.current = position;
      update();
    });
    return () => {
      offMove();
      offPointer();
    };
  }, [engine, format]);

  const copy = async () => {
    const value = text.current?.textContent ?? "";
    if (!value) return;
    if (await copyText(value)) toast.success(`Copied ${value}`);
    else notify.error("The browser did not allow copying. Select the coordinates and copy them by hand.");
  };

  return (
    <div className={cn(mapSurface, "flex flex-col divide-y divide-border overflow-hidden")}>
      <div className="outpost-readout-coords flex items-stretch">
        <button
          type="button"
          onClick={copy}
          aria-label="Copy these coordinates"
          title="Copy"
          className="group flex min-h-9 min-w-0 flex-1 items-center gap-2 px-2.5 text-left focus-visible:-outline-offset-2 max-md:min-h-[44px]"
        >
          <span className="grid">
            <span ref={source} className="text-micro leading-tight text-ink-muted" />
            <span className="tabular font-mono text-[0.8125rem] leading-tight text-ink">
              <span ref={text} />
              {heights && desktop ? <HeightFigure reading={height} /> : null}
            </span>
          </span>
          <Copy aria-hidden className="size-3.5 shrink-0 text-ink-faint group-hover:text-ink" />
        </button>
        <Menu open={opened} onOpenChange={setOpened}>
          <MenuTrigger
            aria-label={`Coordinate format: ${READOUT_LABELS[format]}. Change`}
            title="Coordinate format"
            className="grid w-8 place-content-center border-l border-border text-ink-muted hover:bg-surface-strong hover:text-ink focus-visible:-outline-offset-2 max-md:w-[44px]"
          >
            <ChevronUp className="size-4" />
          </MenuTrigger>
          <MenuContent side="top" align="start">
            <MenuLabel>Show coordinates as</MenuLabel>
            {READOUT_FORMATS.map((option) => (
              <MenuCheckItem key={option} checked={format === option} onCheckedChange={() => onFormatChange(option)}>
                {READOUT_LABELS[option]}
              </MenuCheckItem>
            ))}
            {heights ? (
              <>
                <MenuSeparator />
                <HeightInMenu reading={height} onGetTerrain={heights.onGetTerrain} />
              </>
            ) : null}
          </MenuContent>
        </Menu>
      </div>
      {below}
    </div>
  );
}

/** Given on the Maps screen only: the readout then shows the height of the ground. */
export interface ReadoutHeights {
  /** Whether any terrain is installed. */
  terrain: boolean;
  /** Opens Offline maps, where terrain comes from. */
  onGetTerrain?: () => void;
}

export interface Credit {
  key: string;
  /** Text and links, as parsed from the server's credit strings. */
  parts: ReturnType<typeof parseAttribution>;
}

/** The credits for what is on screen now. */
export function creditsFor(attributions: MapAttribution[], options: { hasTiles: boolean; terrain: boolean }): Credit[] {
  const credits: Credit[] = [];
  for (const attribution of attributions) {
    // Terrain is credited only while something is drawn from it: hill shading, contour lines, or both.
    if (attribution.name === "Mapterhorn" && !options.terrain) continue;
    credits.push({ key: attribution.name, parts: parseAttribution(attribution.html) });
  }
  // The outline map underneath shows wherever no region is installed.
  credits.push({
    key: "natural-earth",
    parts: [{ text: options.hasTiles ? "Outlines: " : "" }, { text: "Natural Earth", href: "https://www.naturalearthdata.com/" }],
  });
  return credits;
}

function Attribution({ credits }: { credits: Credit[] }) {
  return (
    <p className="pointer-events-auto max-w-full rounded-[4px] bg-page/85 px-1.5 py-0.5 text-right text-micro leading-snug text-ink-muted">
      {credits.map((credit, index) => (
        <Fragment key={credit.key}>
          {index > 0 ? <span aria-hidden> · </span> : null}
          {credit.parts.map((part) =>
            part.href ? (
              <a
                key={`${part.href ?? ""}|${part.text}`}
                href={part.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink underline decoration-border-strong underline-offset-2 hover:decoration-ink"
              >
                {part.text}
              </a>
            ) : (
              <Fragment key={`${part.href ?? ""}|${part.text}`}>{part.text}</Fragment>
            ),
          )}
        </Fragment>
      ))}
    </p>
  );
}

export function MapFooter({
  engine,
  format,
  onFormatChange,
  credits,
  underReadout,
  heights,
  className,
}: {
  engine: MapEngine | null;
  format: ReadoutFormat;
  onFormatChange: (format: ReadoutFormat) => void;
  credits: Credit[];
  /** A line about the centre of the map, shown under its coordinates (on a phone, today's sunrise and sunset). */
  underReadout?: ReactNode;
  /** The height of the ground beside the coordinates (the Maps screen). */
  heights?: ReadoutHeights;
  className?: string;
}) {
  return (
    <div className={cn("pointer-events-none flex flex-wrap items-end justify-between gap-x-4 gap-y-1.5", className)}>
      <div className="outpost-readout-row flex min-w-0 items-end gap-3">
        {engine ? (
          <>
            <div className="pointer-events-auto min-w-0">
              <CoordinateReadout engine={engine} format={format} onFormatChange={onFormatChange} below={underReadout} heights={heights} />
            </div>
            <ScaleBar engine={engine} />
          </>
        ) : null}
      </div>
      <div className="outpost-credits ml-auto flex min-w-0 justify-end">
        <Attribution credits={credits} />
      </div>
    </div>
  );
}
