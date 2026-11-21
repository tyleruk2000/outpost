/**
 * Setting the server's clock from a browser.
 *
 * A Raspberry Pi has no clock that keeps time while it is off unless it is given a
 * battery, and without the internet nothing sets it at start-up. Check-ins, the barometer
 * log, backups' ages, sun times and the grey line all trust the server's clock, so the
 * web app compares it with the browser's on each visit and, when they disagree by more
 * than a minute, offers to set the server's from the browser's.
 *
 * Two ways of doing it, and who may:
 *
 *  - `helper`: Outpost runs in a container, which cannot set the clock of the computer it
 *    runs on (the clock is not the container's own; changing it needs a right a container
 *    is not given, and should not be given whole). deploy/pi/install.sh puts a small
 *    service on the Pi that watches one folder in Outpost's data volume. Outpost writes
 *    the correction there (`request`: an id and a number of milliseconds), the service
 *    moves the clock by that much and writes back `result`. It does nothing else, and
 *    reads nothing but that one line. The folder holds a file `helper`, written by the
 *    install script, which is how Outpost knows the service is there.
 *  - `direct`: Outpost runs on Linux with the right to set the time (as root, or given
 *    CAP_SYS_TIME), and runs `date` itself.
 *
 * Elsewhere (macOS, Windows, a container without the service, Linux without the right)
 * it cannot, and the screen says why and what to do instead.
 *
 * Moving the clock changes what every device sees, so it follows the rule the other
 * actions that affect everyone follow: accepted from the computer Outpost runs on, or
 * from any device when whoever starts Outpost sets OUTPOST_ALLOW_REMOTE_CLOCK.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ClockSetting } from "@outpost/shared";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { newId } from "../../core/ids.ts";
import { localBy, type RequestOrigin } from "../../core/local.ts";
import { detectHost } from "../storage/shares/host.ts";
import { type ReadFile, readSystemFile } from "./hardware.ts";

export const CLOCK_OPTION = "OUTPOST_ALLOW_REMOTE_CLOCK";
/** How long the helper on the host is given to answer. */
export const HELPER_WAIT_MS = 10_000;
/** No device's clock that says a time outside these is believed. */
const EARLIEST = Date.UTC(2024, 0, 1);
const LATEST = Date.UTC(2100, 0, 1);

/** Linux's capability to set the system clock: bit 25 of a process's capability sets. */
const CAP_SYS_TIME = 25n;

export function hasTimeRight(read: ReadFile = readSystemFile): boolean {
  if (process.getuid?.() === 0) return true;
  const status = read("/proc/self/status");
  const effective = status ? /^CapEff:\s*([0-9a-f]+)/im.exec(status)?.[1] : undefined;
  return effective ? ((BigInt(`0x${effective}`) >> CAP_SYS_TIME) & 1n) === 1n : false;
}

export interface ClockDeps {
  /** Where the helper's folder is. */
  helperDir: string;
  inContainer: boolean;
  platform: NodeJS.Platform;
  timeRight: () => boolean;
  /** Sets the clock to `target` (milliseconds since 1970) the direct way. */
  setDirect: (target: number) => Promise<void>;
  now: () => number;
}

export function defaultClockDeps(ctx: AppContext): ClockDeps {
  return {
    helperDir: path.join(ctx.config.dataDir, "clock"),
    inContainer: detectHost().inContainer,
    platform: process.platform,
    timeRight: () => hasTimeRight(),
    setDirect: (target) =>
      new Promise((resolve, reject) => {
        // GNU date: "@" and seconds since 1970, to the millisecond.
        execFile("date", ["-u", "-s", `@${(target / 1000).toFixed(3)}`], { timeout: 5_000 }, (error, _stdout, stderr) =>
          error ? reject(new Error(stderr.trim() || error.message)) : resolve(),
        );
      }),
    now: Date.now,
  };
}

/** How the clock could be set here, and whether this request may. */
export function clockSetting(request: RequestOrigin, ctx: AppContext, deps: ClockDeps): ClockSetting {
  const how = fs.existsSync(path.join(deps.helperDir, "helper"))
    ? "helper"
    : deps.platform === "linux" && !deps.inContainer && deps.timeRight()
      ? "direct"
      : null;
  if (how === null) return { possible: false, how, allowed: false, reason: notPossible(deps), option: CLOCK_OPTION };
  const allowed = ctx.config.allowRemoteClock || localBy(request, ctx.config) !== null;
  return {
    possible: true,
    how,
    allowed,
    reason: allowed
      ? null
      : `Only the computer Outpost runs on may set its clock, because it changes the time for every device. To allow it from other devices, start Outpost with ${CLOCK_OPTION}=true (with Docker, put that line in the .env file and run docker compose up -d).`,
    option: CLOCK_OPTION,
  };
}

function notPossible(deps: ClockDeps): string {
  if (deps.inContainer)
    return "Outpost runs in a container, and a container cannot set the clock of the computer it runs on. On a Raspberry Pi, run deploy/pi/install.sh again: it adds a small service that lets Outpost set the clock and nothing else. Otherwise set the clock on that computer itself.";
  if (deps.platform === "darwin") return "Outpost cannot set a Mac's clock. Set it in System Settings, General, Date & Time.";
  if (deps.platform === "win32") return "Outpost cannot set the clock on Windows. Set it in Settings, Time & language, Date & time.";
  if (deps.platform === "linux")
    return "Outpost is not allowed to set this computer's clock: that needs the system's permission to set the time (CAP_SYS_TIME), which Outpost was not started with. Set the clock on the computer itself, for example with sudo date -s '2026-11-21 12:00', or start Outpost with that permission.";
  return "Outpost cannot set the clock on this system. Set it on the computer itself.";
}

/** Moves the server's clock to the device's. Returns how far it moved, in milliseconds. */
export async function setClock(
  request: RequestOrigin,
  ctx: AppContext,
  deps: ClockDeps,
  deviceNow: number,
): Promise<{ now: number; movedMs: number }> {
  const setting = clockSetting(request, ctx, deps);
  if (!setting.possible || !setting.allowed) throw new AppError("forbidden", setting.reason ?? "The clock cannot be set from here.");
  if (deviceNow < EARLIEST || deviceNow > LATEST)
    throw badRequest(
      "This device's own clock does not look right either, so the server's was left as it is. Set this device's clock first.",
    );
  const before = deps.now();
  const offset = Math.round(deviceNow - before);
  if (setting.how === "direct") {
    try {
      await deps.setDirect(deviceNow);
    } catch (error) {
      throw new AppError("internal", `The clock could not be set: ${(error as Error).message}`);
    }
  } else {
    await askHelper(deps, offset);
  }
  const now = deps.now();
  ctx.log.info({ movedMs: offset }, "the server's clock was set from a browser");
  return { now, movedMs: offset };
}

/** Writes the correction for the helper on the host, and waits for its answer. */
async function askHelper(deps: ClockDeps, offset: number): Promise<void> {
  const id = newId();
  const requestFile = path.join(deps.helperDir, "request");
  const resultFile = path.join(deps.helperDir, "result");
  await fs.promises.rm(resultFile, { force: true });
  // Written whole and then renamed, so the helper never reads half a line.
  const partial = path.join(deps.helperDir, `request.${id}.partial`);
  await fs.promises.writeFile(partial, `${id} ${offset}\n`);
  await fs.promises.rename(partial, requestFile);
  const deadline = Date.now() + HELPER_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const answer = await fs.promises.readFile(resultFile, "utf8").catch(() => null);
    if (!answer) continue;
    const [answeredId, outcome, ...rest] = answer.trim().split(" ");
    if (answeredId !== id) continue;
    await fs.promises.rm(resultFile, { force: true });
    if (outcome === "ok") return;
    throw new AppError("internal", `The service on this computer that sets the clock could not: ${rest.join(" ") || "it gave no reason"}.`);
  }
  await fs.promises.rm(requestFile, { force: true });
  throw new AppError(
    "internal",
    "The service on this computer that sets the clock did not answer within ten seconds, and nothing was changed. On the Raspberry Pi, see whether it is running: systemctl status outpost-clock.path",
  );
}
