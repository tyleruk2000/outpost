/**
 * The name Outpost gives to the few services whose policy asks a program to say what it
 * is and how its makers can be reached (Wikimedia's query service, the public Overpass
 * servers): the application, its version and the project's web address. It says nothing
 * about the person, their library or this installation, and it is the same for every
 * copy of Outpost. Every screen that causes it to be sent shows it first, and for a
 * reference source the person ticks a box before anything is asked: not everyone wants
 * the software they run named to a third party. Everything else Outpost fetches is asked
 * for under the plain name in `core/http.ts`.
 */
import { VERSION } from "./version.ts";

export const PROJECT_CLIENT_NAME = `Outpost/${VERSION} (self-hosted offline library; +https://github.com/tyleruk2000/outpost)`;
