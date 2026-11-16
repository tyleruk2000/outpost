/**
 * One setting of the JavaScript engine, made before anything else is loaded, and only
 * when the server runs from its TypeScript source.
 *
 * Node 24's engine (V8 13.6) can end the whole process with "Check failed: end > addr"
 * when two threads run the same WebAssembly and each, at the same moment, replaces the
 * slow first version of a call from WebAssembly into JavaScript with a compiled one
 * (`Runtime_TierUpWasmToJSWrapper`: the compiled pieces are shared by every thread of
 * the process, and one thread freeing a piece while the other is taking it up trips a
 * check in `ThreadIsolation::TryLookupJitPageLocked`). Four crash reports of exactly
 * that stack were on the machine this was written on, each from a worker thread of a
 * test process, two to four seconds after the process started.
 *
 * Run from source, every worker thread runs WebAssembly as it starts, because that is
 * how Node takes the types out of TypeScript; two GPX files read at once are two such
 * threads starting together. The packaged app's workers are plain JavaScript, and its
 * GPX worker runs no WebAssembly at all, so this is not set there.
 *
 * The replacement is an optimisation and nothing depends on it, so here it is put off
 * for good: a call is replaced only after this many uses. With it no compiled piece is
 * made (seen with `--log-code`: two for a pair of workers before, none after), so the
 * code that failed is never reached. The crash itself was not reproduced in 1,450
 * attempts: this is a way round a fault that was seen, not a cure that was watched
 * working. It can go when Node moves to a V8 whose wrapper cache is not 13.6's.
 */
import v8 from "node:v8";
import { isBundled } from "./paths.ts";

/** Also given to the test runner's processes (vitest.config.ts), which do not start from index.ts. */
export const WASM_WRAPPER_FLAG = "--wasm-wrapper-tiering-budget=1000000000";

if (!isBundled) v8.setFlagsFromString(WASM_WRAPPER_FLAG);
