/**
 * Test-only: writes a small zip archive (deflate, no extras), enough for the GeoNames
 * importer's tests to have something real to open.
 */
import zlib from "node:zlib";

export function buildZip(files: Array<{ name: string; content: string | Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8");
    const packed = zlib.deflateRawSync(raw);
    const crc = zlib.crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** One line of a GeoNames dump: nineteen tab-separated columns. */
export function geonamesLine(place: {
  id: number;
  name: string;
  ascii?: string;
  alternates?: string;
  lat: number;
  lon: number;
  featureClass: string;
  featureCode: string;
  country: string;
  admin1?: string;
  population?: number;
  elevation?: number;
  dem?: number;
}): string {
  return [
    place.id,
    place.name,
    place.ascii ?? place.name,
    place.alternates ?? "",
    place.lat,
    place.lon,
    place.featureClass,
    place.featureCode,
    place.country,
    "",
    place.admin1 ?? "",
    "",
    "",
    "",
    place.population ?? 0,
    place.elevation ?? "",
    place.dem ?? "",
    "Europe/London",
    "2026-01-01",
  ].join("\t");
}
