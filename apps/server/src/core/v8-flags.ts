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
 *
 * Checked again on Node 26.13.1 (V8 14.6.202.34-node.40), 22 November 2026, and kept:
 * - The code is still reached there. Two workers started from TypeScript still compile
 *   two wasm-to-JS wrappers without the flag and none with it (`--log-code`), and type
 *   stripping is still WebAssembly (amaro 1.1.11).
 * - The code that failed is still there. V8 14.6's `WasmEngine::FreeDeadCodeLocked` still
 *   hands dead import wrappers to `WasmImportWrapperCache::Free`, the call in the crash
 *   stack (deps/v8/src/wasm/wasm-engine.cc in Node's v26.13.1 source). The cache around it
 *   was reworked (wrappers are now counted handles), which may or may not have removed
 *   the race; nothing in it says so.
 * - Without the flag, 2,000 fresh processes each starting 2 to 8 such workers at once
 *   (some with 32 and 64 MB heaps, 12 at a time on 12 cores) ended normally, and a full
 *   server test run beside the web tests (load average over 200) had no engine crash.
 *   So did 1,450 on Node 24, where the fault was seen, so this shows nothing either way.
 * The fault is not shown to be fixed, so the flag stays.
 */
import v8 from "node:v8";
import { isBundled } from "./paths.ts";

/** Also given to the test runner's processes (vitest.config.ts), which do not start from index.ts. */
export const WASM_WRAPPER_FLAG = "--wasm-wrapper-tiering-budget=1000000000";

if (!isBundled) v8.setFlagsFromString(WASM_WRAPPER_FLAG);
