/**
 * The bundled set, imported by the screen on its own so that it is a chunk of its own:
 * the screen opens at once and the list follows. It is not in `@outpost/shared`'s index,
 * so that the app's first load, which takes that index, does not carry it.
 */
import { RADIO_FREQUENCIES, RADIO_FREQUENCY_GUIDES } from "@outpost/shared/radio-frequencies-data";

export const bundled = () => ({ entries: [...RADIO_FREQUENCIES], guides: [...RADIO_FREQUENCY_GUIDES] });
