/**
 * A radio on a USB cable, with no package: on macOS and Linux a serial device is a file
 * in `/dev`.
 *
 * Which device is used is chosen from a list this file makes itself, of the names USB
 * radios get (`listDevices`); a path typed in a browser is never opened, and a stored
 * choice is checked against the list again before it is opened. The device is set up by
 * the system's own `stty` with fixed arguments (no shell, an absolute path, nothing a
 * person typed among them), then opened without becoming the process's controlling
 * terminal and read through Node's terminal stream, which waits on the device in the
 * event loop: nothing polls it.
 *
 * Not tried with a real radio: the tests use a stand-in over a socket.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Duplex } from "node:stream";
import tty from "node:tty";
import type { MeshDevice } from "@outpost/shared";

/** The speed the radio's USB serial is set to. MeshCore's FAQ uses 115200 in its serial examples; a USB CDC device does not use it. */
export const SERIAL_BAUD = 115200;

export type Platform = "darwin" | "linux" | "other";

export const platformOf = (value: NodeJS.Platform = process.platform): Platform =>
  value === "darwin" ? "darwin" : value === "linux" ? "linux" : "other";

/** The names a USB radio's serial device gets: CDC-ACM and USB-serial bridge chips. */
const PATTERNS: Record<Platform, Array<{ dir: string; match: RegExp }>> = {
  // macOS makes a `tty.` and a `cu.` device for each; `cu.` is the one to open without waiting for a carrier.
  darwin: [{ dir: "/dev", match: /^cu\.(usbmodem|usbserial|SLAB_USBtoUART|wchusbserial)[\w.-]*$/ }],
  linux: [
    { dir: "/dev/serial/by-id", match: /^[\w.:+-]+$/ },
    { dir: "/dev", match: /^tty(ACM|USB)\d{1,3}$/ },
  ],
  other: [],
};

/** Reads one folder's names; a folder that is not there has none. */
export type ReadDir = (dir: string) => string[];
const readDir: ReadDir = (dir) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

/**
 * The devices that may be a radio, made from `/dev` alone. On Linux the stable names in
 * `/dev/serial/by-id` come first, and the `ttyACM`/`ttyUSB` device each points at is not
 * listed again.
 */
export function listDevices(
  platform: Platform = platformOf(),
  read: ReadDir = readDir,
  resolve: (file: string) => string | null = realpath,
): MeshDevice[] {
  const devices: MeshDevice[] = [];
  const seen = new Set<string>();
  for (const { dir, match } of PATTERNS[platform]) {
    for (const name of read(dir).sort()) {
      if (!match.test(name)) continue;
      const file = path.posix.join(dir, name);
      const target = resolve(file) ?? file;
      if (seen.has(target)) continue;
      seen.add(target);
      devices.push({ path: file, label: dir === "/dev/serial/by-id" ? `${name} (${path.posix.basename(target)})` : name });
    }
  }
  return devices;
}

function realpath(file: string): string | null {
  try {
    return fs.realpathSync(file);
  } catch {
    return null;
  }
}

/** Whether a stored or asked-for path is one of the devices listed now. */
export function isListedDevice(file: string, devices: MeshDevice[] = listDevices()): boolean {
  return devices.some((device) => device.path === file);
}

/** The fixed arguments `stty` is given: raw bytes, no echo, the speed. `-f` on macOS, `-F` on Linux. */
export function sttyArguments(file: string, platform: Platform): string[] {
  return [
    platform === "darwin" ? "-f" : "-F",
    file,
    String(SERIAL_BAUD),
    "raw",
    "-echo",
    "-echoe",
    "-echok",
    "-ixon",
    "-ixoff",
    "-crtscts",
    "clocal",
  ];
}

const STTY = ["/bin/stty", "/usr/bin/stty"];

function runStty(file: string, platform: Platform): Promise<void> {
  const program = STTY.find((candidate) => fs.existsSync(candidate));
  if (!program) return Promise.reject(new Error("This computer has no stty to set up a serial device with."));
  return new Promise((resolve, reject) => {
    execFile(program, sttyArguments(file, platform), { timeout: 5000 }, (error, _out, stderr) => {
      if (error)
        reject(
          new Error(
            `The device could not be set up: ${String(stderr || error.message)
              .trim()
              .slice(0, 200)}`,
          ),
        );
      else resolve();
    });
  });
}

/**
 * Opens a listed device for reading and writing. Refuses one that is not in the list
 * made now. The account that runs Outpost needs to be allowed the device (on Linux, in
 * the `dialout` group; docs/mesh-radio.md).
 */
export async function openSerial(file: string, platform: Platform = platformOf()): Promise<Duplex> {
  if (platform === "other") throw new Error("A radio on a USB cable can be used on macOS and Linux.");
  if (!isListedDevice(file, listDevices(platform)))
    throw new Error("That device is not one of the radios plugged in now. Choose it again from the list.");
  await runStty(file, platform);
  let fd: number;
  try {
    fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_NOCTTY | fs.constants.O_NONBLOCK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM")
      throw new Error("Outpost is not allowed to open the device. On Linux, add the account that runs it to the dialout group.");
    if (code === "EBUSY")
      throw new Error("Another program has the device open. Close it (the radio's own app, a serial monitor) and try again.");
    throw new Error(`The device could not be opened (${code ?? "unknown"}).`);
  }
  if (!tty.isatty(fd)) {
    fs.closeSync(fd);
    throw new Error("That device is not a serial port.");
  }
  // A terminal stream reads and writes the same descriptor through the event loop.
  const stream = new tty.ReadStream(fd);
  stream.setRawMode(true);
  return stream;
}
