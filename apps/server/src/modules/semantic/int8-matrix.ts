/**
 * The vectors of one model held in memory as 8-bit numbers, and the nearest rows to a
 * question found with the processor's vector instructions.
 *
 * A stored vector is 384 numbers between -1 and 1, four bytes each. Held as they are,
 * 60,000 passages take about 90 MB and comparing a question with all of them takes about
 * 20 ms on a laptop and 60 on a Raspberry Pi. Each row is kept instead as whole numbers
 * from -127 to 127 with one scale for the row (its largest number over 127): a quarter of
 * the memory (about 23 MB), and the comparison becomes integer arithmetic, which
 * WebAssembly's SIMD instructions do sixteen numbers at a time: about 1 ms on a laptop.
 *
 * Eight bits move a similarity by a few thousandths, enough to swap two passages that
 * are all but tied. So the rows found here are candidates: `vector-index.ts` takes more
 * than it needs and works out their exact similarity from the stored vectors.
 *
 * The WebAssembly is written out below byte by byte (it is 200 bytes) so that nothing
 * needs a compiler. Where WebAssembly SIMD is missing, the same arithmetic runs in
 * JavaScript, about twenty times slower.
 */

/** Rows are padded to a multiple of this many bytes: one SIMD register. */
const LANE = 16;

const leb = (value: number): number[] => {
  const out: number[] = [];
  let rest = value;
  do {
    let byte = rest & 0x7f;
    rest >>>= 7;
    if (rest) byte |= 0x80;
    out.push(byte);
  } while (rest);
  return out;
};

/**
 * scan(rows, stride, matrix, query, out): for each row r, out[r] = the dot product of the
 * `stride` signed bytes at matrix + r × stride with those at query, as a 32-bit integer.
 *
 *   (func (param $rows i32) (param $stride i32) (param $matrix i32) (param $query i32) (param $out i32)
 *     (local $r i32) (local $d i32) (local $p i32) (local $acc v128) (local $v v128) (local $q v128)
 *     p = matrix
 *     block  loop
 *       br_if 1 (r >= rows)
 *       acc = 0; d = 0
 *       loop
 *         v = v128.load(p + d); q = v128.load(query + d)
 *         acc += i32x4.extadd_pairwise_i16x8_s(i16x8.extmul_low_i8x16_s(v, q))
 *         acc += i32x4.extadd_pairwise_i16x8_s(i16x8.extmul_high_i8x16_s(v, q))
 *         d += 16; br_if 0 (d < stride)
 *       end
 *       out[r] = lane 0 + lane 1 + lane 2 + lane 3 of acc
 *       p += stride; r += 1; br 0
 *     end  end)
 */
function scanModule(): Uint8Array {
  const SIMD = 0xfd;
  const get = (local: number) => [0x20, local];
  const set = (local: number) => [0x21, local];
  const tee = (local: number) => [0x22, local];
  const accumulate = (extmul: number) => [...get(9), ...get(10), SIMD, extmul, 0x01, SIMD, 0x7e, SIMD, 0xae, 0x01];
  const lane = (index: number) => [...get(8), SIMD, 0x1b, index];
  const code = [
    ...[2, 3, 0x7f, 3, 0x7b], // locals: three i32, three v128
    ...get(2),
    ...set(7),
    ...[0x02, 0x40, 0x03, 0x40], // block, loop
    ...get(5),
    ...get(0),
    ...[0x4f, 0x0d, 1], // i32.ge_u, br_if 1
    ...[SIMD, 0x0c, ...new Array(16).fill(0)],
    ...set(8),
    ...[0x41, 0],
    ...set(6),
    ...[0x03, 0x40], // loop
    ...get(7),
    ...get(6),
    ...[0x6a, SIMD, 0x00, 0, 0], // i32.add, v128.load
    ...set(9),
    ...get(3),
    ...get(6),
    ...[0x6a, SIMD, 0x00, 0, 0],
    ...set(10),
    ...get(8),
    ...accumulate(0x9c),
    ...accumulate(0x9d),
    ...set(8),
    ...get(6),
    ...[0x41, LANE, 0x6a],
    ...tee(6),
    ...get(1),
    ...[0x49, 0x0d, 0, 0x0b], // i32.lt_u, br_if 0, end
    ...get(4),
    ...get(5),
    ...[0x41, 2, 0x74, 0x6a], // out + r * 4
    ...lane(0),
    ...lane(1),
    0x6a,
    ...lane(2),
    0x6a,
    ...lane(3),
    0x6a,
    ...[0x36, 2, 0], // i32.store
    ...get(7),
    ...get(1),
    0x6a,
    ...set(7),
    ...get(5),
    ...[0x41, 1, 0x6a],
    ...set(5),
    ...[0x0c, 0, 0x0b, 0x0b, 0x0b], // br 0, end loop, end block, end
  ];
  const section = (id: number, content: number[]) => [id, ...leb(content.length), ...content];
  const name = (text: string) => [text.length, ...[...text].map((character) => character.charCodeAt(0))];
  return new Uint8Array([
    ...[0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0],
    ...section(1, [1, 0x60, 5, 0x7f, 0x7f, 0x7f, 0x7f, 0x7f, 0]),
    ...section(3, [1, 0]),
    ...section(5, [1, 0, 1]),
    ...section(7, [2, ...name("memory"), 2, 0, ...name("scan"), 0, 0]),
    ...section(10, [1, ...leb(code.length), ...code]),
  ]);
}

type Scan = (rows: number, stride: number, matrix: number, query: number, out: number) => void;

/** The little of WebAssembly used here (the server is not typed with the browser's library). */
interface Wasm {
  validate(bytes: Uint8Array): boolean;
  Module: new (bytes: Uint8Array) => object;
  Instance: new (
    module: object,
    imports: object,
  ) => { exports: { memory: { buffer: ArrayBuffer; grow(pages: number): number }; scan: Scan } };
}
const wasm = (globalThis as unknown as { WebAssembly?: Wasm }).WebAssembly;

let compiled: object | null | undefined;
/** The compiled scan, or null where WebAssembly SIMD is not available. */
function scanCode(): object | null {
  if (compiled === undefined) {
    const bytes = scanModule();
    try {
      compiled = wasm?.validate(bytes) ? new wasm.Module(bytes) : null;
    } catch {
      compiled = null;
    }
  }
  return compiled ?? null;
}

/** Whether the fast path is in use here. */
export function simdAvailable(): boolean {
  return scanCode() !== null;
}

/** A vector as signed bytes with one scale: value ≈ byte × scale. */
export function quantise(vector: Float32Array, into: Int8Array, at = 0): number {
  let largest = 0;
  for (let index = 0; index < vector.length; index += 1) largest = Math.max(largest, Math.abs(vector[index]!));
  const scale = largest > 0 ? largest / 127 : 1;
  for (let index = 0; index < vector.length; index += 1) into[at + index] = Math.round(vector[index]! / scale);
  return scale;
}

export interface Int8Matrix {
  readonly dimensions: number;
  readonly rows: number;
  /** Bytes it holds: rows, scales and ids. */
  readonly bytes: number;
  /** Writes a row for the chunk, adding one if it has none. */
  set(chunkId: number, vector: Float32Array): void;
  has(chunkId: number): boolean;
  /** The `limit` rows nearest `vector` by their 8-bit similarity, best first. */
  nearest(vector: Float32Array, limit: number): Array<{ chunkId: number; score: number }>;
}

export function createInt8Matrix(dimensions: number, capacity = 1024, options: { simd?: boolean } = {}): Int8Matrix {
  const stride = Math.ceil(dimensions / LANE) * LANE;
  const code = options.simd === false ? null : scanCode();
  let room = 0;
  let rows = 0;
  let ids = new Int32Array(0);
  let scales = new Float32Array(0);
  const rowOf = new Map<number, number>();
  // Layout of the memory: the question (one row), then a 32-bit result per row, then the rows.
  let memory: { buffer: ArrayBuffer };
  let scan: Scan;
  let bytes: Int8Array;
  const outAt = stride;
  let matrixAt = 0;

  const allocate = (wanted: number) => {
    const total = stride + wanted * 4 + wanted * stride;
    let nextMemory: { buffer: ArrayBuffer };
    let nextScan: Scan;
    if (code) {
      // A fresh instance each time: its memory can only grow, and a matrix let go should give all of it back.
      const instance = new wasm!.Instance(code, {});
      const own = instance.exports.memory;
      own.grow(Math.max(0, Math.ceil(total / 65_536) - own.buffer.byteLength / 65_536));
      nextMemory = own;
      nextScan = instance.exports.scan;
    } else {
      nextMemory = { buffer: new ArrayBuffer(total) };
      const view = new Int8Array(nextMemory.buffer);
      const out = new Int32Array(nextMemory.buffer);
      nextScan = (count, width, matrix, query, results) => {
        for (let row = 0; row < count; row += 1) {
          const offset = matrix + row * width;
          let dot = 0;
          for (let index = 0; index < width; index += 1) dot += view[offset + index]! * view[query + index]!;
          out[(results >> 2) + row] = dot;
        }
      };
    }
    const nextMatrixAt = outAt + wanted * 4;
    const nextBytes = new Int8Array(nextMemory.buffer);
    if (rows > 0) nextBytes.set(bytes.subarray(matrixAt, matrixAt + rows * stride), nextMatrixAt);
    const nextIds = new Int32Array(wanted);
    nextIds.set(ids.subarray(0, rows));
    const nextScales = new Float32Array(wanted);
    nextScales.set(scales.subarray(0, rows));
    memory = nextMemory;
    scan = nextScan;
    bytes = nextBytes;
    matrixAt = nextMatrixAt;
    ids = nextIds;
    scales = nextScales;
    room = wanted;
  };
  allocate(Math.max(1, capacity));

  const scratch = new Int8Array(stride);
  return {
    dimensions,
    get rows() {
      return rows;
    },
    get bytes() {
      return room * (stride + 8);
    },
    has: (chunkId) => rowOf.has(chunkId),
    set(chunkId, vector) {
      let row = rowOf.get(chunkId);
      if (row === undefined) {
        if (rows === room) allocate(Math.ceil(room * 1.25) + 256);
        row = rows;
        rows += 1;
        ids[row] = chunkId;
        rowOf.set(chunkId, row);
      }
      scratch.fill(0);
      scales[row] = quantise(vector, scratch);
      bytes.set(scratch, matrixAt + row * stride);
    },
    nearest(vector, limit) {
      if (rows === 0 || limit <= 0) return [];
      scratch.fill(0);
      const queryScale = quantise(vector, scratch);
      bytes.set(scratch, 0);
      scan(rows, stride, matrixAt, 0, outAt);
      const dots = new Int32Array(memory.buffer, outAt, rows);
      const best: Array<{ chunkId: number; score: number }> = [];
      let floor = Number.NEGATIVE_INFINITY;
      for (let row = 0; row < rows; row += 1) {
        const score = dots[row]! * scales[row]! * queryScale;
        if (best.length === limit && score <= floor) continue;
        let position = best.length;
        while (position > 0 && best[position - 1]!.score < score) position -= 1;
        best.splice(position, 0, { chunkId: ids[row]!, score });
        if (best.length > limit) best.pop();
        floor = best.length === limit ? best[best.length - 1]!.score : Number.NEGATIVE_INFINITY;
      }
      return best;
    },
  };
}
