/**
 * Satellite imagery on a printed page: one tick box, starting ticked when the map on
 * screen shows imagery. The page says the day each picture was taken, under the map,
 * and carries each picture's credit with the others.
 */
import type { Bbox, ImageryStyleSource } from "@outpost/shared";
import type { PrintContext, PrintOverlay } from "../print/overlays";

const overlaps = (a: Bbox, b: Bbox) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** The imagery sets a page shows: those over it, at a zoom they are drawn at. */
export function imageryOnPage(context: Pick<PrintContext, "sources" | "bbox" | "zoom">): ImageryStyleSource[] {
  return (context.sources?.imagery ?? []).filter((set) => overlaps(set.bounds, context.bbox) && context.zoom >= set.minzoom - 0.5);
}

export const SATELLITE_OVERLAY: PrintOverlay = {
  id: "satellite",
  label: "Satellite imagery",
  unavailable: (context) =>
    (context.sources?.imagery?.length ?? 0) === 0
      ? "No satellite imagery is downloaded."
      : imageryOnPage(context).length === 0
        ? "No satellite imagery is downloaded for this area."
        : undefined,
  hint: (context) => {
    const days = [...new Set(imageryOnPage(context).map((set) => set.imageDateText))];
    return days.length > 0 ? `Pictures of ${days.join(" and ")}, under the roads and names.` : undefined;
  },
  initially: (context) => context.live.satellite ?? false,
  apply: (draft, context) => {
    draft.satellite = true;
    const days = [
      ...new Set(
        imageryOnPage(context)
          .reverse()
          .map((set) => set.imageDateText),
      ),
    ];
    if (days.length > 0) {
      // "on 12 July 2026" for a day, "in July 2004" for a month.
      const when = days.map((day) => `${/^\d/.test(day) ? "on" : "in"} ${day}`).join(" and ");
      draft.notes.push(
        `The satellite ${days.length === 1 ? "picture was" : "pictures were"} taken ${when}, not on the day this page was made.`,
      );
    }
  },
};
