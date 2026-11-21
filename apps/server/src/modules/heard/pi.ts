/**
 * The decoders on the Raspberry Pi Outpost runs on (outpost-ywbh.3). Outpost runs in a
 * container without administrator rights, so it cannot start a program on the Pi. The
 * installer (deploy/pi/install.sh, with --decoders) installs Dire Wolf, readsb and
 * AIS-catcher switched off, and a helper that does one thing: start or stop one of those
 * three services, with a sound device or SDR from the list it made itself.
 *
 * As for the clock (deploy/pi/set-clock.sh), the two meet in one folder of Outpost's data
 * volume, `decoders/`: the installer writes `helper` there to say it is installed;
 * Outpost leaves `request` (which decoder, start or stop, which device); a path unit on
 * the Pi sees it and runs the helper as root, which trusts nothing in it beyond those
 * three words, and writes `status.json` (what is installed and running, the devices
 * found, the decoder's last lines for the audio level) and removes the request.
 *
 * Not yet tried on a real Pi.
 */
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PI_DECODERS, type PiDecoderInput, type PiDecodersStatus } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { AppError } from "../../core/errors.ts";

const MOST_STATUS_BYTES = 64 * 1024;
const MOST_LOG_LINES = 20;

export const DEVICE_PATTERN = /^[A-Za-z0-9:,._-]{1,64}$/;

export function createPiDecoders(ctx: AppContext) {
  const dir = path.join(ctx.config.dataDir, "decoders");
  const exists = (name: string) =>
    stat(path.join(dir, name)).then(
      () => true,
      () => false,
    );

  async function status(): Promise<PiDecodersStatus | null> {
    if (!(await exists("helper"))) return null;
    const pending = await exists("request");
    let parsed: Record<string, unknown> = {};
    try {
      const file = path.join(dir, "status.json");
      if ((await stat(file)).size <= MOST_STATUS_BYTES) parsed = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    } catch {
      // Not written yet, or half written: said as nothing known.
    }
    const text = (value: unknown, max = 200) => (typeof value === "string" ? value.slice(0, max) : null);
    const decoders = Array.isArray(parsed.decoders) ? (parsed.decoders as Array<Record<string, unknown>>) : [];
    const devices = Array.isArray(parsed.devices) ? (parsed.devices as Array<Record<string, unknown>>) : [];
    return {
      at: typeof parsed.at === "number" ? parsed.at * 1000 : null,
      pending,
      lastError: text(parsed.error),
      decoders: PI_DECODERS.map((id) => {
        const entry = decoders.find((item) => item.id === id) ?? {};
        return {
          id,
          installed: entry.installed === true,
          running: entry.running === true,
          device: text(entry.device, 64),
          log: Array.isArray(entry.log)
            ? entry.log.slice(-MOST_LOG_LINES).flatMap((line) => (typeof line === "string" ? [line.slice(0, 200)] : []))
            : [],
        };
      }),
      devices: devices
        .slice(0, 32)
        .flatMap((device) =>
          typeof device.id === "string" && DEVICE_PATTERN.test(device.id) && (device.kind === "sound" || device.kind === "sdr")
            ? [{ id: device.id, name: text(device.name, 120) ?? device.id, kind: device.kind as "sound" | "sdr" }]
            : [],
        ),
    };
  }

  async function request(input: PiDecoderInput): Promise<PiDecodersStatus> {
    const now = await status();
    if (!now)
      throw new AppError(
        "not_found",
        "The decoders are not installed on this computer. On a Raspberry Pi, run the installer again with --decoders.",
      );
    if (input.action === "start" && input.device && !now.devices.some((device) => device.id === input.device))
      throw new AppError("bad_request", "That device is not one the Pi listed. Press Look again and choose from the list.");
    await mkdir(dir, { recursive: true });
    const temporary = path.join(dir, "request.tmp");
    // Three words and nothing else: the helper reads these and checks each against its own list.
    await writeFile(temporary, `${input.action} ${input.decoder} ${input.device ?? "-"}\n`, "utf8");
    await rename(temporary, path.join(dir, "request"));
    return { ...now, pending: true };
  }

  return { status, request };
}
