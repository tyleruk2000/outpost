/**
 * The few parts of the WebAssembly API the engine needs, typed here because the
 * server's TypeScript settings do not include the browser's declarations. The API
 * itself is part of Node.
 */
export interface WasmMemory {
  readonly buffer: ArrayBuffer;
}

interface WasmApi {
  Module: new (bytes: Uint8Array) => object;
  Instance: new (module: object, imports: Record<string, Record<string, unknown>>) => { exports: Record<string, unknown> };
}

export const wasm = (globalThis as unknown as { WebAssembly: WasmApi }).WebAssembly;
