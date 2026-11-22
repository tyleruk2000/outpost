/**
 * What the system says about the computer itself: memory, temperature, the Raspberry
 * Pi's power and throttling flags, and the wear of an eMMC card. Everything is read from
 * files the kernel keeps (`/proc`, `/sys`); anything a system does not have is null, and
 * the status screen says that the system does not say, which is not a fault.
 *
 * Sources, read on 21 November 2026:
 *  - Raspberry Pi documentation, "Frequency management and thermal control": the Arm cores
 *    are throttled back progressively between 80 °C and 85 °C, and the GPU too at 85 °C.
 *    https://www.raspberrypi.com/documentation/computers/raspberry-pi.html
 *  - Raspberry Pi documentation, `vcgencmd get_throttled`: the bits read here (0 under-voltage
 *    now, 1 Arm frequency capped, 2 throttled now, 3 soft temperature limit; 16 to 19 the
 *    same "has occurred" since start-up). https://www.raspberrypi.com/documentation/computers/os.html
 *    The kernel's firmware driver gives the same value in
 *    /sys/devices/platform/soc/soc:firmware/get_throttled, which a container can read.
 *  - The eMMC lifetime registers the kernel shows as `life_time` and `pre_eol_info`: 0x01 is
 *    0 to 10% of the device's life used, in steps of 10%; pre-EOL 0x01 normal, 0x02 warning
 *    (80% of reserved blocks used), 0x03 urgent (90%).
 *    https://netmodule-linux.readthedocs.io/en/latest/howto/mmc.html and the kernel patch that
 *    added them, https://lore.kernel.org/lkml/20161222033734.7052-1-js07.lee@samsung.com/
 *    SD cards have no such registers, and the kernel shows none for them.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Reads a file the kernel keeps, or null. Replaceable in tests. */
export type ReadFile = (file: string) => string | null;

export const readSystemFile: ReadFile = (file) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

export type ListDir = (dir: string) => string[];

export const listSystemDir: ListDir = (dir) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

export interface Memory {
  totalBytes: number;
  /** What programs could still be given without the system swapping: MemAvailable on Linux. */
  availableBytes: number;
  /**
   * Whether `availableBytes` means that. Linux says so (MemAvailable), and so does Windows. macOS does not: the free
   * memory Node is told leaves out what the system keeps of files it has read and gives back at once when asked, so
   * a Mac that is doing well looks nearly full.
   */
  availableKnown: boolean;
  /** A limit put on Outpost's own container, when there is one and it is lower than the computer's memory. */
  limitBytes: number | null;
  /** What Outpost's container uses against that limit. */
  usedInLimitBytes: number | null;
  processBytes: number;
}

export function readMemory(read: ReadFile = readSystemFile, platform: NodeJS.Platform = process.platform): Memory {
  const info = read("/proc/meminfo");
  const field = (name: string) => {
    const match = info ? new RegExp(`^${name}:\\s+(\\d+) kB`, "m").exec(info) : null;
    return match ? Number(match[1]) * 1024 : null;
  };
  const totalBytes = field("MemTotal") ?? os.totalmem();
  const memAvailable = field("MemAvailable");
  const availableBytes = memAvailable ?? os.freemem();
  const availableKnown = memAvailable !== null || platform === "win32";
  // cgroup v2 first, then v1. "max" (or a v1 figure near 2^63) is no limit.
  const limitText = (read("/sys/fs/cgroup/memory.max") ?? read("/sys/fs/cgroup/memory/memory.limit_in_bytes"))?.trim();
  const limit = limitText && /^\d+$/.test(limitText) ? Number(limitText) : null;
  const limitBytes = limit !== null && limit < totalBytes ? limit : null;
  const usedText = (read("/sys/fs/cgroup/memory.current") ?? read("/sys/fs/cgroup/memory/memory.usage_in_bytes"))?.trim();
  const usedInLimitBytes = limitBytes !== null && usedText && /^\d+$/.test(usedText) ? Number(usedText) : null;
  return { totalBytes, availableBytes, availableKnown, limitBytes, usedInLimitBytes, processBytes: process.memoryUsage.rss() };
}

export interface Temperature {
  celsius: number;
  /** What the kernel calls the sensor ("cpu-thermal"). */
  sensor: string;
}

/** The processor's temperature, from the first thermal zone that gives one; null where the system has none (macOS, most containers on a Mac). */
export function readTemperature(read: ReadFile = readSystemFile, list: ListDir = listSystemDir): Temperature | null {
  const zones = list("/sys/class/thermal")
    .filter((name) => /^thermal_zone\d+$/.test(name))
    .sort((a, b) => Number(a.slice(12)) - Number(b.slice(12)));
  let first: Temperature | null = null;
  for (const zone of zones) {
    const raw = read(path.join("/sys/class/thermal", zone, "temp"))?.trim();
    if (!raw || !/^-?\d+$/.test(raw)) continue;
    const reading = { celsius: Number(raw) / 1000, sensor: read(path.join("/sys/class/thermal", zone, "type"))?.trim() || zone };
    // The processor's own sensor, where the zones are named.
    if (/cpu|soc|x86_pkg/i.test(reading.sensor)) return reading;
    first ??= reading;
  }
  return first;
}

/** The Raspberry Pi's throttling flags, as `vcgencmd get_throttled` gives them. Null on anything else. */
export interface Throttling {
  underVoltageNow: boolean;
  cappedNow: boolean;
  throttledNow: boolean;
  underVoltageSinceStart: boolean;
  throttledSinceStart: boolean;
}

export function readThrottling(read: ReadFile = readSystemFile): Throttling | null {
  const raw = read("/sys/devices/platform/soc/soc:firmware/get_throttled")?.trim();
  if (!raw || !/^(0x)?[0-9a-f]+$/i.test(raw)) return null;
  const bits = Number.parseInt(raw.replace(/^0x/i, ""), 16);
  return {
    underVoltageNow: (bits & 0x1) !== 0,
    cappedNow: (bits & 0x2) !== 0,
    throttledNow: (bits & 0x4) !== 0,
    underVoltageSinceStart: (bits & 0x10000) !== 0,
    throttledSinceStart: (bits & 0x40000) !== 0 || (bits & 0x20000) !== 0,
  };
}

/** A memory card the kernel knows: an SD card, which says nothing of its wear, or an eMMC, which does. */
export interface CardWear {
  device: string;
  type: "SD" | "MMC" | string;
  name: string | null;
  /** The share of its life used, as the card estimates it, in tens of per cent: [0, 10] for 0x01. Null when it does not say. */
  lifeUsedPercent: [number, number] | null;
  /** The card's reserved blocks: normal, warning (80% used) or urgent (90%). Null when it does not say. */
  reserve: "normal" | "warning" | "urgent" | null;
}

const hex = (text: string | null | undefined) => {
  const value = text?.trim();
  return value && /^0x[0-9a-f]+$/i.test(value) ? Number.parseInt(value, 16) : null;
};

export function readCardWear(read: ReadFile = readSystemFile, list: ListDir = listSystemDir): CardWear[] {
  const cards: CardWear[] = [];
  for (const device of list("/sys/block").filter((name) => /^mmcblk\d+$/.test(name))) {
    const base = path.join("/sys/block", device, "device");
    const type = read(path.join(base, "type"))?.trim();
    if (!type) continue;
    // `life_time` is two values, for two kinds of block on the card; the worse is the one that matters.
    const life = (read(path.join(base, "life_time")) ?? "")
      .trim()
      .split(/\s+/)
      .map(hex)
      .filter((value): value is number => value !== null && value >= 1 && value <= 0x0a);
    const worst = life.length > 0 ? Math.max(...life) : null;
    const eol = hex(read(path.join(base, "pre_eol_info")));
    cards.push({
      device,
      type,
      name: read(path.join(base, "name"))?.trim() || null,
      lifeUsedPercent: worst === null ? null : [(worst - 1) * 10, worst * 10],
      reserve: eol === 1 ? "normal" : eol === 2 ? "warning" : eol === 3 ? "urgent" : null,
    });
  }
  return cards;
}
