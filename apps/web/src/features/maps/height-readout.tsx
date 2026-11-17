/**
 * The height of the ground in the readout at the foot of the map: a figure after the
 * coordinates while it is folded ("54.5109, -3.5001 · 312 m"), and a few lines when it
 * is opened, where there is room to say what the figure is and where it came from.
 *
 * The folded figure shows only a height that is known: never a zero, a guess or an
 * error. Where there is no terrain the opened readout says what heights need instead.
 */
import { Mountain } from "lucide-react";
import { MenuItem } from "@/components/ui/menu";
import { formatHeight, useHeightUnit } from "@/lib/heights";
import { formatNumber } from "@/lib/utils";
import type { GroundHeight } from "./ground-height";

/** What a height read from terrain is, said once: in the tooltip of the figure and under it in the opened readout. */
export function heightNote(cellMeters: number | null): string {
  const cells = cellMeters === null ? "" : ` cells about ${formatNumber(Math.round(cellMeters))} m across`;
  return `The ground thereabouts, read from terrain${cells ? ` in${cells}` : ""}: not a surveyed spot height. Above mean sea level, as the terrain data gives it.`;
}

/** " · 312 m" after the coordinates, or nothing. */
export function HeightFigure({ reading }: { reading: GroundHeight }) {
  useHeightUnit();
  if (reading.state !== "known") return null;
  return (
    <span data-ground-height title={heightNote(reading.cellMeters)} className="whitespace-nowrap">
      <span aria-hidden className="text-ink-faint">
        {" · "}
      </span>
      {formatHeight(reading.meters)}
    </span>
  );
}

/** The height in the opened readout, for the centre of the map. */
export function HeightInMenu({ reading, onGetTerrain }: { reading: GroundHeight; onGetTerrain?: () => void }) {
  useHeightUnit();
  if (reading.state === "none") {
    return (
      <>
        <p data-ground-height-note className="max-w-64 px-2.5 py-1.5 text-small text-ink-muted">
          Heights need terrain for this area. It comes with a map region, under Offline maps.
        </p>
        {onGetTerrain ? (
          <MenuItem onSelect={onGetTerrain}>
            <Mountain aria-hidden />
            Get terrain
          </MenuItem>
        ) : null}
      </>
    );
  }
  return (
    <div data-ground-height-note className="max-w-64 px-2.5 py-1.5" aria-live="polite">
      <p className="flex items-baseline justify-between gap-3 text-small">
        <span className="text-ink-muted">Height at the centre</span>
        <span className="tabular font-mono text-[0.8125rem] text-ink">
          {reading.state === "known" ? formatHeight(reading.meters) : reading.state === "failed" ? "Not read" : "…"}
        </span>
      </p>
      <p className="mt-1 text-micro leading-snug text-ink-muted">
        {reading.state === "failed"
          ? "The height could not be read just now. Close this and open it again to try again."
          : heightNote(reading.state === "known" ? reading.cellMeters : null)}
      </p>
    </div>
  );
}
