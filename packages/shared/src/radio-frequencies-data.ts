/**
 * The bundled set of frequencies to listen to, kind by kind. Each kind's entries are in
 * a file of its own under `radio-frequencies/`; the shape is in `radio-frequencies.ts`.
 *
 * How the set is kept: an entry goes in only with the page it was checked against and
 * the day, read from the station, broadcaster, regulator or official body itself (never
 * from memory, a hobbyist list or a compiled schedule). To correct one, edit its file,
 * re-read its source, and change the source's `checked` day. The web suite's data test
 * (apps/web/src/features/frequencies/data.test.ts) fails on an entry with no source, no
 * date, a frequency outside the band it names, an unknown place, or a duplicate.
 */
import type { FrequencyEntry, FrequencyGuide } from "./radio-frequencies.ts";
import { AMATEUR, AMATEUR_GUIDES } from "./radio-frequencies/amateur.ts";
import { BANDS, BANDS_GUIDES } from "./radio-frequencies/bands.ts";
import { BROADCASTERS, BROADCASTERS_GUIDES } from "./radio-frequencies/broadcasters.ts";
import { DISTRESS, DISTRESS_GUIDES } from "./radio-frequencies/distress.ts";
import { EMERGENCY, EMERGENCY_GUIDES } from "./radio-frequencies/emergency.ts";
import { LICENCE_FREE, LICENCE_FREE_GUIDES } from "./radio-frequencies/licence-free.ts";
import { TIME_SIGNALS, TIME_SIGNALS_GUIDES } from "./radio-frequencies/time-signals.ts";
import { WEATHER, WEATHER_GUIDES } from "./radio-frequencies/weather.ts";

/** Every entry, kind by kind in the order of FREQUENCY_KINDS. */
export const RADIO_FREQUENCIES: readonly FrequencyEntry[] = [
  ...TIME_SIGNALS,
  ...EMERGENCY,
  ...BROADCASTERS,
  ...WEATHER,
  ...DISTRESS,
  ...AMATEUR,
  ...LICENCE_FREE,
  ...BANDS,
];

export const RADIO_FREQUENCY_GUIDES: readonly FrequencyGuide[] = [
  ...TIME_SIGNALS_GUIDES,
  ...EMERGENCY_GUIDES,
  ...BROADCASTERS_GUIDES,
  ...WEATHER_GUIDES,
  ...DISTRESS_GUIDES,
  ...AMATEUR_GUIDES,
  ...LICENCE_FREE_GUIDES,
  ...BANDS_GUIDES,
];
