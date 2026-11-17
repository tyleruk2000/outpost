/**
 * People inside each ring of a scenario, from an installed WorldPop grid
 * (`GET /api/reference/population/sum`), in words that cannot be read as casualties
 * (population-words.ts). This is the only thing the scenario asks of the reference
 * layers: it never lists, counts or highlights mapped infrastructure inside a ring.
 */
import { type EffectRing, type EffectsResult, type PopulationSumResponse, roundDistance } from "@outpost/shared";
import { useQueries } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import type { ReactNode } from "react";
import { Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { useLayersSummary } from "@/features/layers/data";
import { api, errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import { destination } from "./geometry";
import { FALLOUT_NO_COUNT, ringPeople } from "./population-words";
import { distanceText } from "./words";

const FAMILY: Record<EffectRing["family"], string> = {
  fireball: "Fireball",
  crater: "Crater",
  blast: "Blast",
  thermal: "Burns",
  radiation: "Initial radiation",
};

type Box = [number, number, number, number];
const overlaps = (a: Box, b: Box) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** The box round the largest ring. */
function ringsBox(at: { lat: number; lon: number }, metres: number): Box {
  return [
    destination(at, 270, metres).lon,
    destination(at, 180, metres).lat,
    destination(at, 90, metres).lon,
    destination(at, 0, metres).lat,
  ];
}

export function RingPeople({ at, result, onGetData }: { at: { lat: number; lon: number }; result: EffectsResult; onGetData: () => void }) {
  const summary = useLayersSummary();
  // Asked once the scenario has stopped changing, not on every keystroke.
  const settled = useDebounced(
    JSON.stringify({
      lat: Number(at.lat.toFixed(4)),
      lon: Number(at.lon.toFixed(4)),
      rings: result.rings.filter((ring) => ring.metres !== null).map((ring) => ({ id: ring.id, metres: roundDistance(ring.metres!) })),
    }),
    500,
  );
  const asked = JSON.parse(settled) as { lat: number; lon: number; rings: Array<{ id: string; metres: number }> };
  const sets = summary.data?.population ?? [];
  const widest = Math.max(0, ...asked.rings.map((ring) => ring.metres));
  const near = sets.filter((set) => overlaps(set.bbox as Box, ringsBox(asked, widest)));
  const answers = useQueries({
    queries: asked.rings.map((ring) => ({
      queryKey: ["layers", "population", "sum", asked.lat, asked.lon, ring.metres],
      queryFn: () =>
        api.get<PopulationSumResponse>("/api/reference/population/sum", {
          lat: asked.lat,
          lon: asked.lon,
          radiusKm: Math.min(300, ring.metres / 1000),
        }),
      enabled: near.length > 0 && ring.metres > 0,
      staleTime: 60_000,
    })),
  });

  let body: ReactNode;
  if (summary.isPending) body = <Skeleton className="h-10 w-full" />;
  else if (summary.isError)
    body = <p className="text-small text-danger">The population grids could not be read. {errorMessage(summary.error)}</p>;
  else if (near.length === 0)
    body = (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <p className="text-small text-ink-muted">
          {sets.length === 0
            ? "No population grid is installed. To see how many people live inside each ring, get WorldPop's population grid for the country (1 km cells, CC BY 4.0) from Reference data in the Layers tab."
            : `No installed population grid reaches these rings (installed: ${sets.map((set) => set.country).join(", ")}). To count the people inside them, get WorldPop's grid for this country from Reference data in the Layers tab.`}
        </p>
        <div>
          <Button onClick={onGetData}>
            <Layers aria-hidden /> Get reference data
          </Button>
        </div>
      </div>
    );
  else {
    const used = sets.filter((set) => near.includes(set));
    body = (
      <>
        <Rows className="border-y border-border">
          {result.rings
            .filter((ring) => ring.metres !== null)
            .map((ring) => {
              const index = asked.rings.findIndex((entry) => entry.id === ring.id);
              const query = index >= 0 ? answers[index] : undefined;
              const metres = index >= 0 ? asked.rings[index]!.metres : roundDistance(ring.metres!);
              return (
                <li key={ring.id} className="grid grid-cols-[minmax(0,1fr)] gap-0.5 py-2.5" data-testid="ring-people">
                  <span className="text-small font-medium text-ink">
                    {FAMILY[ring.family]}: {ring.label}, {distanceText(metres)}
                  </span>
                  {!query || query.isPending ? (
                    <Skeleton className="h-4 w-3/4" />
                  ) : query.isError ? (
                    <span className="text-small text-danger">The count could not be made. {errorMessage(query.error)}</span>
                  ) : (
                    <span className="text-small text-ink-muted">{ringPeople(metres, query.data).text}</span>
                  )}
                </li>
              );
            })}
          {result.fallout.drawn ? (
            <li className="grid grid-cols-[minmax(0,1fr)] gap-0.5 py-2.5">
              <span className="text-small font-medium text-ink">Fallout (idealised)</span>
              <span className="text-small text-ink-muted">{FALLOUT_NO_COUNT}</span>
            </li>
          ) : null}
        </Rows>
        <p className="text-small text-ink-muted">
          Counted as the people in the grid's cells whose middle lies inside each ring, rounded to two significant figures: the grid is a
          modelled estimate of where people lived, not a census, and says nothing about who would be harmed. Nothing else on the map is
          counted inside a ring.
        </p>
        <details className="text-small text-ink-muted">
          <summary className="min-h-11 cursor-pointer py-2.5 text-ink-muted hover:text-ink md:min-h-0 md:py-0">
            The population grid and its credit
          </summary>
          {used.map((set) => (
            <p key={set.id} className="mt-1">
              {set.country}: {set.product}, {set.year}. CC BY 4.0. {set.citation}
              {set.available ? "" : " Its drive is not connected."}
            </p>
          ))}
        </details>
      </>
    );
  }
  return (
    <section aria-label="People inside each ring" className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <h3 className="text-body font-semibold text-ink">People inside each ring</h3>
      {body}
    </section>
  );
}
