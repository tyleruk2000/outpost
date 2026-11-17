/**
 * The magnetic declination for the bearing method, offered from the World Magnetic Model
 * (`northsAt`, as Tools → Compass works it out) for the chosen place and the date of the
 * measurement. It fills the field while the field holds nothing of the person's own: a
 * figure they type stays, and the model's can be put back with one press.
 */
import { angleInWords, northsAt } from "@outpost/shared";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { dateToUtc, type IsoDate } from "@/features/maps/lib/sun";
import type { NumberInput } from "../tools/kit";
import { readPref, writePref } from "../tools/kit/device-pref";

/** The model's declination at noon UTC on the date, to the tenth of a degree a field holds; null without a place or a date. */
export function modelDeclination(place: { lat: number; lon: number } | null, date: IsoDate | null): number | null {
  if (!place || !date) return null;
  const declination = northsAt(place.lat, place.lon, dateToUtc(date) + 12 * 3_600_000).declination;
  return Number(declination.toFixed(1));
}

const LAST = "solar-clock.declination-model";
const asText = (value: number) => (Object.is(value, -0) ? "0" : String(value));

/**
 * Puts the model's figure in the field when it is empty or still holds the model's last
 * figure (so it follows the place and the date), and leaves a figure the person typed alone.
 */
export function useModelDeclination(input: NumberInput, model: number | null): void {
  const { text, setText } = input;
  useEffect(() => {
    if (model === null) return;
    const next = asText(model);
    const last = readPref(LAST);
    if (text.trim() === "" || text === last) {
      if (text !== next) setText(next);
      if (last !== next) writePref(LAST, next);
    }
  }, [model, text, setText]);
}

/** One line under the field: where its figure comes from, and a way back to the model's. */
export function ModelDeclinationNote({ input, model }: { input: NumberInput; model: number | null }) {
  const words = useMemo(() => (model === null ? null : angleInWords(model)), [model]);
  if (model === null || words === null) return null;
  const following = input.text === asText(model);
  return (
    <p className="mt-2 max-w-[62ch] text-small text-ink-muted">
      {following ? (
        <>
          The declination is filled in from the World Magnetic Model for this place and date: {words}. A recent map's margin is as good;
          type over it to use your own.
        </>
      ) : (
        <>
          The World Magnetic Model gives {words} for this place and date.{" "}
          <Button variant="ghost" size="sm" className="-my-1 align-baseline" onClick={() => input.setText(asText(model))}>
            Use the model's figure
          </Button>
        </>
      )}
    </p>
  );
}
