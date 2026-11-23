/**
 * The streets service Outpost asks for door-to-door, walking and cycling routes and for
 * reachable areas: Valhalla in its own container (docker/valhalla), on a network of its
 * own with Outpost, never published. It is optional, and most installations do not have it.
 *
 * Two things tell Outpost about it:
 *  - the folder it shares with Outpost (`OUTPOST_VALHALLA_DIR`, the `valhalla-tiles`
 *    volume): the service writes `status.json` there as it starts and as it builds, and
 *    reads the `request.json` Outpost leaves there. No `status.json`: not installed, and
 *    nothing is asked of the network at all;
 *  - its address (`OUTPOST_VALHALLA_URL`, the Compose service name by default), asked
 *    `/status` only once the folder says streets are built, at most every few seconds.
 *
 * The address must be this computer or its own network: routes and places a person asks
 * about never leave for the internet.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { StreetsState } from "@outpost/shared";
import { z } from "zod";

/** The most `status.json` or `tileset.json` may be: anything larger is not the service's. */
const STATUS_MAX_BYTES = 256 * 1024;
const PROBE_EVERY_MS = 5_000;
const PROBE_TIMEOUT_MS = 2_500;

const tilesetFileSchema = z
  .object({
    name: z.string().max(400).catch("Streets"),
    extracts: z
      .array(z.object({ file: z.string().max(400), bytes: z.number().nonnegative() }))
      .max(50)
      .catch([]),
    builtAt: z.number().catch(0),
    tarBytes: z.number().nonnegative().catch(0),
    valhalla: z.string().max(40).nullable().catch(null),
    regions: z
      .array(
        z.object({
          regionId: z.string().max(120).nullable().catch(null),
          name: z.string().max(200),
          country: z.string().max(2).nullable().catch(null),
          dataDate: z.string().max(10).nullable().catch(null),
        }),
      )
      .max(50)
      .optional()
      .catch(undefined),
  })
  .passthrough();
export type TilesetFile = z.infer<typeof tilesetFileSchema>;

const statusSchema = z.object({
  state: z.enum(["idle", "building", "ready", "failed"]),
  id: z.string().max(100).nullable().catch(null),
  name: z.string().max(400).nullable().catch(null),
  stage: z.string().max(40).nullable().catch(null),
  message: z.string().max(2000).nullable().catch(null),
  startedAt: z.number().nullable().catch(null),
  finishedAt: z.number().nullable().catch(null),
  current: tilesetFileSchema.nullable().catch(null),
});
export type SidecarStatus = z.infer<typeof statusSchema>;

/** Reads a small JSON file the service wrote; undefined when it is not there, null when it cannot be read. */
export function readSmallJson(file: string): unknown {
  let fd: number;
  try {
    fd = fs.openSync(file, "r");
  } catch {
    return undefined;
  }
  try {
    const size = fs.fstatSync(fd).size;
    if (size > STATUS_MAX_BYTES) return null;
    const buffer = Buffer.alloc(size);
    fs.readSync(fd, buffer, 0, size, 0);
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

const PRIVATE_V4 = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./];

/** Why this address may not be used for the streets service, or undefined when it may. */
export function addressProblem(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `The streets service's address (OUTPOST_VALHALLA_URL) is not an address: “${url.slice(0, 200)}”.`;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    return "The streets service's address (OUTPOST_VALHALLA_URL) must start with http:// or https://.";
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const own = net.isIPv4(host)
    ? PRIVATE_V4.some((pattern) => pattern.test(host))
    : net.isIPv6(host)
      ? host === "::1" || /^f[cd]/.test(host) || host.startsWith("fe80:")
      : !host.includes(".") || /\.(local|internal|lan|home\.arpa)$/.test(host);
  return own
    ? undefined
    : `The streets service's address (OUTPOST_VALHALLA_URL) is ${host}, which is not this computer or its own network. Routes and places asked about must not leave it: use the Compose service (http://valhalla:8002) or a private address.`;
}

export interface StreetsConnection {
  readonly baseUrl: string;
  /** The folder shared with the service. */
  readonly dir: string;
  /** The service has written its status here: the add-on is part of this installation. */
  installed(): boolean;
  /** What the service last said, checked; null when it has said nothing readable. */
  status(): SidecarStatus | null;
  /** True when the service answered `/status` in the last few seconds. Asks only when streets are built. */
  isUp(): Promise<boolean>;
  /** Where streets stand, in one word and plain words. */
  describe(): Promise<{ state: StreetsState; message: string | null }>;
  /** Forget the last answer, so the next question asks again (after a build). */
  forget(): void;
}

export function createStreetsConnection(options: { url: string; dir: string }): StreetsConnection {
  const baseUrl = options.url.replace(/\/+$/, "");
  const dir = options.dir;
  const statusFile = path.join(dir, "status.json");
  const badAddress = addressProblem(baseUrl);
  let lastCheck = { at: 0, up: false, problem: undefined as string | undefined };

  function status(): SidecarStatus | null {
    const raw = readSmallJson(statusFile);
    if (raw === undefined || raw === null) return null;
    const parsed = statusSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  async function probe(): Promise<{ up: boolean; problem: string | undefined }> {
    try {
      const response = await fetch(`${baseUrl}/status`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), redirect: "error" });
      const text = await response.text();
      if (!response.ok) return { up: false, problem: `The streets service answered ${response.status}.` };
      const body = JSON.parse(text.slice(0, 4096)) as { version?: unknown };
      return typeof body.version === "string"
        ? { up: true, problem: undefined }
        : { up: false, problem: "Something answers at the streets service's address, but it is not Valhalla." };
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code === "ENOTFOUND" || code === "EAI_AGAIN")
        return {
          up: false,
          problem: `The streets service (${new URL(baseUrl).hostname}) is not running. With Docker, start it with COMPOSE_PROFILES=routes and “docker compose up -d”.`,
        };
      return {
        up: false,
        problem: `The streets service at ${baseUrl} is not answering. It may still be starting; otherwise check its container (“docker compose ps valhalla”).`,
      };
    }
  }

  async function isUp(): Promise<boolean> {
    if (badAddress || !fs.existsSync(statusFile)) return false;
    if (!status()?.current) return false;
    if (Date.now() - lastCheck.at < PROBE_EVERY_MS) return lastCheck.up;
    const result = await probe();
    lastCheck = { at: Date.now(), ...result };
    return result.up;
  }

  return {
    baseUrl,
    dir,
    installed: () => !badAddress && fs.existsSync(statusFile),
    status,
    isUp,
    async describe() {
      if (badAddress) return { state: "problem", message: badAddress };
      if (!fs.existsSync(statusFile))
        return {
          state: "not-installed",
          message:
            "Streets for routes are not installed. They are an optional add-on: with Docker, set COMPOSE_PROFILES=routes (or install with --street-routes) and start it again.",
        };
      const said = status();
      if (!said) return { state: "problem", message: "The streets service's status cannot be read. Restart its container." };
      if (!said.current)
        return { state: "no-streets", message: "Walking and cycling is not built yet. Add it for a place under Offline maps." };
      const up = await isUp();
      if (up) return { state: "ready", message: null };
      return { state: "not-answering", message: lastCheck.problem ?? "The streets service is not answering." };
    },
    forget() {
      lastCheck = { at: 0, up: false, problem: undefined };
    },
  };
}
