/**
 * The programs Outpost runs to connect and disconnect shares on a Mac, and how their
 * answers are read. Three rules hold for every one of them:
 *
 *  - It is started with `execFile` and a list of arguments, never through a shell, and
 *    by its full path.
 *  - It has a time limit, after which it is stopped.
 *  - A password is only ever written to a program's standard input. It is never an
 *    argument, never part of an environment variable, and nothing here logs what was
 *    sent to a program or what came back.
 */
import { execFile } from "node:child_process";
import { MAC_HELPER } from "./mac-helper.ts";

export interface CommandResult {
  /** Exit status, or null if the program could not be started or was stopped. */
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type CommandRunner = (
  file: string,
  args: readonly string[],
  options: { input?: string; timeoutMs: number },
) => Promise<CommandResult>;

export const runCommand: CommandRunner = (file, args, options) =>
  new Promise((resolve) => {
    const child = execFile(
      file,
      [...args],
      { timeout: options.timeoutMs, killSignal: "SIGKILL", maxBuffer: 1024 * 1024, encoding: "utf8", windowsHide: true },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === "number" ? error.code : null) : 0;
        resolve({ code, stdout, stderr, timedOut: Boolean(error?.killed) });
      },
    );
    // A program that exits before reading its input must not take the server down.
    child.stdin?.on("error", () => {});
    child.stdin?.end(options.input ?? "");
  });

const OSASCRIPT = "/usr/bin/osascript";
const MOUNT = "/sbin/mount";
const DISKUTIL = "/usr/sbin/diskutil";
const DNS_SD = "/usr/bin/dns-sd";

/** The arguments never change: what differs between calls travels on standard input. */
export const MAC_HELPER_ARGS: readonly string[] = ["-l", "JavaScript", "-e", MAC_HELPER];

export interface KeychainRef {
  service: string;
  account: string;
  label: string;
}

export interface MountRequest {
  url: string;
  user: string;
  /** Leave out to use the password remembered in the Keychain. */
  password?: string;
  remember: boolean;
  keychain: KeychainRef;
}

export type MountOutcome =
  | { kind: "mounted"; mountPoint: string | undefined; stored: boolean | undefined }
  | { kind: "already_mounted" }
  | { kind: "no_password"; keychainStatus: number }
  | { kind: "error"; errno: number }
  | { kind: "timed_out" }
  /** The helper did not run or did not answer as expected. */
  | { kind: "broken"; code: number | null };

const EEXIST = 17;

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text.trim());
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export async function mountShare(run: CommandRunner, request: MountRequest, timeoutMs: number): Promise<MountOutcome> {
  const input = JSON.stringify({ op: "mount", ...request });
  const result = await run(OSASCRIPT, MAC_HELPER_ARGS, { input, timeoutMs });
  if (result.timedOut) return { kind: "timed_out" };
  const answer = result.code === 0 ? parseJson(result.stdout) : undefined;
  if (!answer) return { kind: "broken", code: result.code };
  if (answer.status === null) return { kind: "no_password", keychainStatus: Number(answer.keychain) };
  if (answer.status === 0) {
    const points = Array.isArray(answer.mountPoints)
      ? answer.mountPoints.filter((point): point is string => typeof point === "string")
      : [];
    return { kind: "mounted", mountPoint: points[0], stored: typeof answer.stored === "boolean" ? answer.stored : undefined };
  }
  if (answer.status === EEXIST) return { kind: "already_mounted" };
  if (typeof answer.status === "number") return { kind: "error", errno: answer.status };
  return { kind: "broken", code: result.code };
}

const ITEM_NOT_FOUND = -25300;

/** Removes the remembered password. True when it is gone afterwards (or never was there). */
export async function forgetPassword(run: CommandRunner, keychain: KeychainRef): Promise<boolean> {
  const result = await run(OSASCRIPT, MAC_HELPER_ARGS, { input: JSON.stringify({ op: "forget", keychain }), timeoutMs: 20_000 });
  const answer = result.code === 0 ? parseJson(result.stdout) : undefined;
  return answer?.keychain === 0 || answer?.keychain === ITEM_NOT_FOUND;
}

export interface SmbMount {
  /** Lower case, without a port. */
  host: string;
  port: number;
  share: string;
  user: string | undefined;
  mountPoint: string;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Reads the SMB lines out of what `mount` prints, e.g. `//me@nas.local/media on /Volumes/media (smbfs, …)`. */
export function parseMountTable(output: string): SmbMount[] {
  const mounts: SmbMount[] = [];
  for (const line of output.split("\n")) {
    const match = /^\/\/(?:([^@/\s]*)@)?([^/\s]+)\/(\S+) on (\/.*) \(smbfs[,)]/.exec(line);
    if (!match) continue;
    const [, user, authority, share, mountPoint] = match as unknown as [string, string | undefined, string, string, string];
    let host = authority.toLowerCase();
    let port = 445;
    const withPort = /^(.*):(\d{1,5})$/.exec(host);
    if (withPort && (!withPort[1]!.includes(":") || withPort[1]!.endsWith("]"))) {
      host = withPort[1]!;
      port = Number(withPort[2]);
    }
    host = decode(host.replace(/^\[|\]$/g, ""));
    mounts.push({ host, port, share: decode(share), user: user ? decode(user) : undefined, mountPoint });
  }
  return mounts;
}

export async function listSmbMounts(run: CommandRunner): Promise<SmbMount[]> {
  const result = await run(MOUNT, [], { timeoutMs: 8_000 });
  return result.code === 0 ? parseMountTable(result.stdout) : [];
}

export type UnmountOutcome = { ok: true } | { ok: false; busy: boolean; usedBy: string | undefined };

/**
 * Asks macOS to disconnect a volume, politely: without "force", so that it refuses
 * while a program still has files open there, and says which program.
 */
export async function unmountVolume(run: CommandRunner, mountPoint: string): Promise<UnmountOutcome> {
  const result = await run(DISKUTIL, ["unmount", mountPoint], { timeoutMs: 45_000 });
  if (result.code === 0) return { ok: true };
  const text = `${result.stdout}\n${result.stderr}`;
  const dissent = /dissented by PID \d+ \(([^)]+)\)/.exec(text);
  return { ok: false, busy: /dissent|busy|in use/i.test(text), usedBy: dissent?.[1]?.split("/").pop() };
}

export interface AdvertisedServer {
  name: string;
  host: string;
  port: number;
}

/** Instance names from `dns-sd -B`, e.g. "19:55:44.511  Add  2  14 local.  _smb._tcp.  Workshop NAS". */
export function parseBrowse(output: string): string[] {
  const names = new Set<string>();
  for (const line of output.split("\n")) {
    const match = /^\S+\s+Add\s+\d+\s+\d+\s+\S+\s+_smb\._tcp\.\s+(.+?)\s*$/.exec(line);
    if (match) names.add(match[1]!);
  }
  return [...names];
}

/** Host and port from `dns-sd -L`, e.g. "… can be reached at workshop-nas.local.:445 (interface 14)". */
export function parseResolve(output: string): { host: string; port: number } | undefined {
  const match = /can be reached at (\S+?)\.?:(\d{1,5})(?:\s|$)/.exec(output);
  return match ? { host: match[1]!.toLowerCase(), port: Number(match[2]) } : undefined;
}

/**
 * File servers that announce themselves on the local network (Bonjour). `dns-sd`
 * keeps listening until it is stopped, so each call is given a couple of seconds and
 * what it had printed by then is used.
 */
export async function browseFileServers(run: CommandRunner): Promise<AdvertisedServer[]> {
  const browse = await run(DNS_SD, ["-B", "_smb._tcp", "local."], { timeoutMs: 1_500 });
  const names = parseBrowse(browse.stdout).slice(0, 12);
  const resolved = await Promise.all(
    names.map(async (name) => {
      const answer = await run(DNS_SD, ["-L", name, "_smb._tcp", "local."], { timeoutMs: 1_500 });
      const where = parseResolve(answer.stdout);
      return where ? { name, ...where } : undefined;
    }),
  );
  return resolved.filter((entry): entry is AdvertisedServer => entry !== undefined).sort((a, b) => a.name.localeCompare(b.name));
}
