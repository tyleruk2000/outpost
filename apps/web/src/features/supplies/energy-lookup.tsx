/**
 * Energy from USDA FoodData Central's table, in the add and change form: as a food's name
 * is typed, the foods in the table that match are offered (asked of this Outpost, which
 * holds the table; nothing goes further), and choosing one fills its energy per 100 g. The
 * weight of one is filled only when the unit is itself a weight (kg, g, lb, oz); for a tin
 * or a pack the form asks for it. Nothing is filled until a food is chosen, and a figure
 * typed from the label always wins: offers are only made while there is none.
 */
import { type EnergyNote, type FoodMatch, type FoodSearchResponse, gramsInUnit } from "@outpost/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

/** The words typed, once the person has paused: a search on every key would be work thrown away. */
function useSettled(value: string, delay = 250): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export const useFoodMatches = (name: string, enabled: boolean) => {
  const query = useSettled(name.trim());
  return useQuery({
    queryKey: ["supplies", "foods", query.toLowerCase()],
    queryFn: ({ signal }) => api.get<FoodSearchResponse>("/api/supplies/foods", { q: query, limit: 5 }, signal),
    enabled: enabled && query.length >= 2,
    // The table does not change while Outpost runs.
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
  });
};

/** The note kept with an item whose figure came from the table. */
export function noteOf(source: string, match: FoodMatch): EnergyNote {
  // "USDA FoodData Central, SR Legacy (April 2018)"
  const found = /^USDA FoodData Central, (.+?) \((.+)\)$/.exec(source);
  return {
    dataset: found?.[1] ?? "SR Legacy",
    release: found?.[2] ?? "April 2018",
    fdcId: match.fdcId,
    description: match.description,
    kcalPer100g: match.kcalPer100g,
  };
}

/** What choosing a food fills in: its energy per 100 g, and the weight of one only where the unit is a weight. */
export function filledFrom(match: FoodMatch, unit: string, gramsTyped: string): { kcalPer100g: string; gramsPerUnit: string } {
  const grams = gramsInUnit(unit);
  return { kcalPer100g: String(match.kcalPer100g), gramsPerUnit: grams !== null ? String(grams) : gramsTyped };
}

const PROTECTED = "Check the label; products differ.";

/** The foods offered for the name typed, under the name field. */
export function FoodOffers({ name, onChoose }: { name: string; onChoose: (match: FoodMatch, source: string) => void }) {
  const typed = name.trim();
  const found = useFoodMatches(name, typed.length >= 2);
  if (typed.length < 2) return null;
  if (found.isError) return <p className="text-small text-danger">The table of foods could not be read: {errorMessage(found.error)}</p>;
  if (!found.data)
    return (
      <p role="status" className="text-small text-ink-muted">
        Looking for “{typed}” in the table of foods…
      </p>
    );
  const { matches, source } = found.data;
  if (matches.length === 0)
    return (
      <p role="status" className="text-small text-ink-muted">
        No food in the table matches “{typed}”. Give the energy from the label below, or leave it.
      </p>
    );
  return (
    <section aria-label="Energy from USDA FoodData Central" className="grid gap-1.5">
      <p role="status" className="text-small text-ink-muted">
        Energy per 100 g from {source}. Choose one to fill it in, or give the label's figure below.
      </p>
      <ul className="divide-y divide-border border-y border-border">
        {matches.map((match) => (
          <li key={match.fdcId}>
            <button
              type="button"
              onClick={() => onChoose(match, source)}
              className="flex min-h-11 w-full items-baseline justify-between gap-3 py-2 text-left text-small text-ink hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span className="min-w-0">{match.description}</span>
              <span className="tabular shrink-0 text-ink-muted">{formatNumber(match.kcalPer100g)} kcal</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Where the figure came from, under the energy, while it is still the table's. */
export function EnergySource({ note, onAnother }: { note: EnergyNote; onAnother: () => void }) {
  return (
    <p className="text-small text-ink-muted">
      From USDA FoodData Central ({note.dataset}, {note.release}), per 100 g of “{note.description}”. {PROTECTED}{" "}
      <Button variant="link" size="sm" className="text-small" onClick={onAnother}>
        Choose another food
      </Button>
    </p>
  );
}

/** What the weight field says once a food is chosen and the unit is not a weight. */
export function weightWanted(unit: string, note: EnergyNote): string {
  const one = unit.trim() || "one";
  const drained = /drained/i.test(note.description);
  return `Give the weight of one ${one} from the label: it is not counted until you do.${
    drained ? " The food chosen is drained, so give the drained weight." : ""
  }`;
}
