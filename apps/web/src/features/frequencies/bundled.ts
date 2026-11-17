/**
 * The bundled set, imported by the screen on its own so that it is a chunk of its own:
 * the screen opens at once and the list follows.
 */
import { RADIO_FREQUENCIES, RADIO_FREQUENCY_GUIDES } from "@outpost/shared";

export const bundled = () => ({ entries: [...RADIO_FREQUENCIES], guides: [...RADIO_FREQUENCY_GUIDES] });
