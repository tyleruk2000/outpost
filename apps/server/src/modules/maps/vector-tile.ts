/**
 * Reading a map tile's shapes on the server: just enough of the Mapbox Vector Tile format (version 2.1) to get the
 * lines and polygons of the layers asked for, with their properties. The walking reach reads the roads, paths and
 * water of the installed map this way; nothing else on the server draws a map.
 *
 * The format is protocol buffers: a tile is a list of layers, each with features whose properties are indexes into
 * the layer's lists of keys and values, and whose geometry is a list of commands (move to, line to, close) with
 * zigzag-encoded offsets, in tile units of 0 to `extent` (usually 4096). See the specification,
 * https://github.com/mapbox/vector-tile-spec/tree/master/2.1.
 */

export interface TileFeature {
  /** 1 a point, 2 a line, 3 a polygon. */
  type: number;
  properties: Record<string, string | number | boolean>;
  /** Each part as a flat list of x, y pairs in tile units. For a polygon, its rings (outer rings clockwise). */
  parts: number[][];
}

export interface TileLayer {
  extent: number;
  features: TileFeature[];
}

class Reader {
  position = 0;
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  varint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (this.position >= this.bytes.length) throw new Error("This map tile ends part way through a number.");
      const byte = this.bytes[this.position++]!;
      // Beyond 2^53 nothing here is exact anyway; ids are the only numbers that large, and they are not read.
      result += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) return result;
      shift += 7;
      if (shift > 63) throw new Error("This map tile has a number that is too long.");
    }
  }

  /** A field's number and wire type. */
  tag(): { field: number; wire: number } {
    const key = this.varint();
    return { field: Math.floor(key / 8), wire: key & 7 };
  }

  sub(): Reader {
    const length = this.varint();
    const end = this.position + length;
    if (end > this.bytes.length) throw new Error("This map tile is shorter than it says.");
    const inner = new Reader(this.bytes.subarray(this.position, end));
    this.position = end;
    return inner;
  }

  skip(wire: number): void {
    if (wire === 0) this.varint();
    else if (wire === 1) this.position += 8;
    else if (wire === 2) this.position += this.varint();
    else if (wire === 5) this.position += 4;
    else throw new Error("This map tile has a field of a kind the format does not have.");
  }

  get done(): boolean {
    return this.position >= this.bytes.length;
  }
}

const decoder = new TextDecoder();
const zigzag = (value: number) => (value % 2 === 1 ? -(value + 1) / 2 : value / 2);

function readValue(reader: Reader): string | number | boolean {
  let value: string | number | boolean = "";
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1 && wire === 2) {
      const inner = reader.sub();
      value = decoder.decode(inner.bytes);
    } else if (field === 2 && wire === 5) {
      value = new DataView(reader.bytes.buffer, reader.bytes.byteOffset + reader.position, 4).getFloat32(0, true);
      reader.position += 4;
    } else if (field === 3 && wire === 1) {
      value = new DataView(reader.bytes.buffer, reader.bytes.byteOffset + reader.position, 8).getFloat64(0, true);
      reader.position += 8;
    } else if ((field === 4 || field === 5) && wire === 0) value = reader.varint();
    else if (field === 6 && wire === 0) value = zigzag(reader.varint());
    else if (field === 7 && wire === 0) value = reader.varint() !== 0;
    else reader.skip(wire);
  }
  return value;
}

function packed(reader: Reader): number[] {
  const inner = reader.sub();
  const values: number[] = [];
  while (!inner.done) values.push(inner.varint());
  return values;
}

function geometryOf(commands: number[]): number[][] {
  const parts: number[][] = [];
  let current: number[] | null = null;
  let x = 0;
  let y = 0;
  let index = 0;
  while (index < commands.length) {
    const command = commands[index++]!;
    const id = command & 7;
    const count = command >> 3;
    if (id === 7) {
      // Close: the ring's first point again, so that every ring is closed as stored.
      if (current && current.length >= 2) current.push(current[0]!, current[1]!);
      continue;
    }
    for (let n = 0; n < count && index + 1 < commands.length; n += 1) {
      x += zigzag(commands[index++]!);
      y += zigzag(commands[index++]!);
      if (id === 1) {
        current = [x, y];
        parts.push(current);
      } else if (current) current.push(x, y);
    }
  }
  return parts;
}

/** The layers named, from a tile's bytes (already decompressed). Layers not asked for are skipped without reading. */
export function readVectorTile(bytes: Uint8Array, wanted: ReadonlySet<string>): Map<string, TileLayer> {
  const layers = new Map<string, TileLayer>();
  const tile = new Reader(bytes);
  while (!tile.done) {
    const { field, wire } = tile.tag();
    if (field !== 3 || wire !== 2) {
      tile.skip(wire);
      continue;
    }
    const layer = tile.sub();
    let name = "";
    let extent = 4096;
    const keys: string[] = [];
    const values: Array<string | number | boolean> = [];
    const raw: Reader[] = [];
    while (!layer.done) {
      const entry = layer.tag();
      if (entry.field === 1 && entry.wire === 2) name = decoder.decode(layer.sub().bytes);
      else if (entry.field === 2 && entry.wire === 2) raw.push(layer.sub());
      else if (entry.field === 3 && entry.wire === 2) keys.push(decoder.decode(layer.sub().bytes));
      else if (entry.field === 4 && entry.wire === 2) values.push(readValue(layer.sub()));
      else if (entry.field === 5 && entry.wire === 0) extent = layer.varint();
      else layer.skip(entry.wire);
    }
    if (!wanted.has(name)) continue;
    const features: TileFeature[] = [];
    for (const reader of raw) {
      let type = 0;
      let tags: number[] = [];
      let commands: number[] = [];
      while (!reader.done) {
        const entry = reader.tag();
        if (entry.field === 2 && entry.wire === 2) tags = packed(reader);
        else if (entry.field === 3 && entry.wire === 0) type = reader.varint();
        else if (entry.field === 4 && entry.wire === 2) commands = packed(reader);
        else reader.skip(entry.wire);
      }
      const properties: TileFeature["properties"] = {};
      for (let index = 0; index + 1 < tags.length; index += 2) {
        const key = keys[tags[index]!];
        const value = values[tags[index + 1]!];
        if (key !== undefined && value !== undefined) properties[key] = value;
      }
      features.push({ type, properties, parts: geometryOf(commands) });
    }
    layers.set(name, { extent, features });
  }
  return layers;
}
