/**
 * Network shares connected from the Storage screen.
 *
 * On a Mac run directly, Outpost asks macOS to mount an SMB share (the same way the
 * Finder does), remembers which share it was, and can connect it again later. The
 * mounted share appears under /Volumes, which is already a storage root, and becomes a
 * storage location through the ordinary "add location" path.
 *
 * What Outpost keeps is the server, the share and the user name. It never keeps the
 * password: not in the database, a file, a log line, an error message or an event. If
 * the person asks for it to be remembered, the helper puts it in the macOS Keychain
 * and reads it back from there itself, so on a reconnect the password does not pass
 * through this process at all.
 *
 * Anywhere else (a container, Linux) nothing is mounted from here; the web app writes
 * out instructions instead.
 */
import {
  type DiscoveredServer,
  formatShareServer,
  isValidShareName,
  isValidSharePassword,
  isValidShareUser,
  type MountedShare,
  type NetworkShare,
  type NetworkShareStatus,
  parseShareServer,
  type ServerSharesResponse,
  type ShareHostMode,
  type ShareInstructionHints,
  shareHostKind,
} from "@outpost/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../../core/context.ts";
import { AppError, badRequest, conflict, notFound } from "../../../core/errors.ts";
import { isInside } from "../../../core/fs-safe.ts";
import { newId } from "../../../core/ids.ts";
import { downloads, networkShares } from "../../../db/schema.ts";
import { type HostLookup, localName, lookupHost, type PortProbe, probePort, resolveShareHost, urlHost } from "./address.ts";
import {
  browseFileServers,
  type CommandRunner,
  forgetPassword,
  type KeychainRef,
  listSmbMounts,
  mountShare,
  runCommand,
  type SmbMount,
  unmountVolume,
} from "./commands.ts";
import { detectHost, shareHostMode } from "./host.ts";
import { listServerShares, pickDiskShares, type ShareLister } from "./smb-list.ts";

export type ShareRow = typeof networkShares.$inferSelect;
type ShareError = NonNullable<ShareRow["lastError"]>;

/** Everything that reaches outside the process, so tests can stand in for all of it. */
export interface SharesDeps {
  mode: ShareHostMode;
  run: CommandRunner;
  lookup: HostLookup;
  probe: PortProbe;
  /** Asks a server which shares it offers. */
  listShares: ShareLister;
  /** Lets a share be connected from this computer itself. For testing only. */
  allowLoopback: boolean;
}

export interface ConnectInput {
  server: string;
  port?: number | null;
  share: string;
  /** Left out, with the password, for a guest. */
  userName?: string;
  password?: string;
  guest?: boolean;
  rememberPassword?: boolean;
}

export interface ListInput {
  server: string;
  port?: number | null;
  userName?: string;
  password?: string;
  guest?: boolean;
}

export interface ShareResult {
  share: NetworkShare;
  /** Something the person should know that is not an error. */
  note?: string;
}

export interface SharesService {
  /** Replaceable in tests. */
  deps: SharesDeps;
  list(): Promise<NetworkShare[]>;
  hints(): ShareInstructionHints;
  /** The shared folders a server offers to this user, for choosing one instead of typing its name. */
  serverShares(input: ListInput): Promise<ServerSharesResponse>;
  /** Network volumes connected on this Mac already, whoever connected them. */
  mounted(): Promise<MountedShare[]>;
  /** Starts using a volume that is connected already, found by where it is mounted. */
  adopt(mountPath: string): Promise<ShareResult>;
  connect(input: ConnectInput): Promise<ShareResult>;
  reconnect(id: string, input: { password?: string; rememberPassword?: boolean }): Promise<ShareResult>;
  /** Unmounts. Refuses while work is in progress on the share unless `confirm` is set. */
  disconnect(id: string, options: { confirm: boolean }): Promise<ShareResult>;
  /** Disconnects, removes the remembered password and forgets the share. */
  forget(id: string, options: { confirm: boolean }): Promise<void>;
  discover(): Promise<{ supported: boolean; servers: DiscoveredServer[] }>;
  /**
   * Connects again every share that should be connected and has a remembered password.
   * True when one of them is still not connected, so that it is worth trying again later.
   */
  reconnectRemembered(): Promise<boolean>;
}

declare module "../../../core/context.ts" {
  interface Services {
    shares: SharesService;
  }
}

const KEYCHAIN_SERVICE = "Outpost network share";
const DEFAULT_PORT = 445;
const PROBE_TIMEOUT_MS = 4_000;
const MOUNT_TIMEOUT_MS = 45_000;
/** Used when the quick check could not say whether the server is there. */
const MOUNT_TIMEOUT_UNSURE_MS = 20_000;
const LIST_TIMEOUT_MS = 12_000;
/** How a share connected from the Finder's Network list names its server. */
const BONJOUR_SUFFIX = "._smb._tcp.local";

// errno values macOS answers a failed mount with.
const AUTH_ERRORS = new Set([13 /* EACCES */, 80 /* EAUTH */, 81 /* ENEEDAUTH */]);
const SHARE_ERRORS = new Set([2 /* ENOENT */, 60 /* ETIMEDOUT, once the server has answered */]);
const NETWORK_ERRORS = new Set([50, 51, 61, 64, 65]); // ENETDOWN, ENETUNREACH, ECONNREFUSED, EHOSTDOWN, EHOSTUNREACH

const statusDetails: Record<NetworkShareStatus, (row: ShareRow) => string | null> = {
  connected: () => null,
  disconnected: (row) => (row.passwordInKeychain || row.userName === "" ? null : "Enter the password to connect it."),
  wrong_password: () => "The server did not accept the user name and password. Enter the password again.",
  server_not_found: () => "The server did not answer last time. It may be switched off or on another network.",
  share_not_found: () => "The server answered, but this share could not be opened. Its name may have changed.",
  needs_password: () => "The password is not in the Keychain. Enter it to connect.",
  failed: () => "It could not be connected last time.",
};

function keychainFor(target: { server: string; port: number; share: string; userName: string }): KeychainRef {
  const where = formatShareServer(target.server, target.port === DEFAULT_PORT ? null : target.port);
  return {
    service: KEYCHAIN_SERVICE,
    account: `${target.userName}@${where}/${target.share}`,
    label: `Outpost: //${where}/${target.share}`,
  };
}

/** Thrown for a failed attempt; `details.reason` is what the row remembers. */
function shareError(reason: ShareError, message: string): AppError {
  const code = reason === "wrong_password" ? "forbidden" : reason === "needs_password" ? "bad_request" : "storage_unavailable";
  return new AppError(code, message, { reason });
}

export function createSharesService(ctx: AppContext, overrides: Partial<SharesDeps> = {}): SharesService {
  const { db, config } = ctx;
  const deps: SharesDeps = {
    mode: shareHostMode(detectHost(), { portable: config.portable }),
    // The automated tests never start a real program: they bring their own runner.
    run: config.env === "test" ? async () => ({ code: null, stdout: "", stderr: "", timedOut: false }) : runCommand,
    lookup: lookupHost,
    probe: probePort,
    // Nor do they open connections of their own.
    listShares: config.env === "test" ? async () => ({ kind: "failed", detail: "no network in tests" }) : listServerShares,
    allowLoopback: config.allowPrivateDownloads,
    ...overrides,
  };

  // A typed password that keeps being wrong is held back for a while. Outpost has no
  // sign-in, so without this anyone who can open it could try passwords against the
  // file server through it, and could lock the real owner's account on that server.
  // The count is per server and user, whichever way the password was tried: looking at
  // a server's shares and connecting one of them draw on the same five tries.
  /** Wrong typed passwords per server and user, kept in memory only. */
  const wrongGuesses = new Map<string, { count: number; blockedUntil: number }>();
  const FREE_GUESSES = 5;
  // Keyed by the address the server resolved to, so that another name for the same server is not five more tries.
  const guessKeyFor = (address: string, port: number, userName: string) => `${address.toLowerCase()}:${port}/${userName.toLowerCase()}`;

  /** Refuses, without reaching the server, while this user's tries are being held back. */
  function assertNotHeld(guessKey: string): void {
    const held = wrongGuesses.get(guessKey);
    if (!held || held.blockedUntil <= Date.now()) return;
    const seconds = Math.ceil((held.blockedUntil - Date.now()) / 1000);
    throw new AppError("forbidden", `Too many wrong passwords for this user on this server. Try again in ${seconds} seconds.`, {
      reason: "wrong_password",
      retryAfterSeconds: seconds,
    });
  }

  function countWrongGuess(guessKey: string): void {
    const entry = wrongGuesses.get(guessKey) ?? { count: 0, blockedUntil: 0 };
    entry.count += 1;
    // Five tries are free; after that each further miss doubles the wait, from a minute up to an hour.
    if (entry.count >= FREE_GUESSES) entry.blockedUntil = Date.now() + Math.min(60_000 * 2 ** (entry.count - FREE_GUESSES), 3_600_000);
    if (wrongGuesses.size > 500) wrongGuesses.clear();
    wrongGuesses.set(guessKey, entry);
  }

  // One mount or unmount at a time: they change the same rows and the same folders.
  let queue: Promise<unknown> = Promise.resolve();
  function exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  }

  function requireMac(): void {
    if (deps.mode === "macos") return;
    throw new AppError(
      "unsupported",
      deps.mode === "docker"
        ? "Outpost runs in a container here and cannot connect a share itself. Docker has to mount it; the Storage screen writes out the lines to add."
        : deps.mode === "linux"
          ? "On Linux, connecting a share needs administrator rights that Outpost does not have. The Storage screen writes out what to add instead."
          : "This Outpost cannot connect network shares.",
    );
  }

  function getRow(id: string): ShareRow {
    const row = db.select().from(networkShares).where(eq(networkShares.id, id)).get();
    if (!row) throw notFound("Network share");
    return row;
  }

  function patch(id: string, values: Partial<ShareRow>): ShareRow {
    db.update(networkShares)
      .set({ ...values, updatedAt: Date.now() })
      .where(eq(networkShares.id, id))
      .run();
    return getRow(id);
  }

  /** Names a mount of this share may carry in the system's list. */
  function hostNames(target: { server: string; lastAddress?: string | null }): Set<string> {
    const names = new Set([target.server]);
    if (target.lastAddress) names.add(target.lastAddress.split("%")[0]!.toLowerCase());
    // A share connected from the Finder's Network list is named after its Bonjour service.
    if (shareHostKind(target.server) === "name") names.add(`${target.server.split(".")[0]}._smb._tcp.local`);
    return names;
  }

  function findMount(
    target: { server: string; port: number; share: string; lastAddress?: string | null; mountPath?: string | null },
    mounts: SmbMount[],
  ): SmbMount | undefined {
    const names = hostNames(target);
    const matching = mounts.filter(
      (mount) => mount.port === target.port && mount.share.toLowerCase() === target.share.toLowerCase() && names.has(mount.host),
    );
    return matching.find((mount) => mount.mountPoint === target.mountPath) ?? matching[0];
  }

  function toDto(row: ShareRow, mount: SmbMount | undefined): NetworkShare {
    const status: NetworkShareStatus = mount ? "connected" : (row.lastError ?? "disconnected");
    const base = mount?.mountPoint ?? row.mountPath;
    const locations = base
      ? ctx.services.storage
          .list()
          // While the share is away, a folder that is reachable at its old path belongs to something else.
          .filter((location) => isInside(base, location.path) && (mount || location.status === "unavailable"))
          .map((location) => ({ id: location.id, name: location.name }))
      : [];
    return {
      id: row.id,
      server: row.server,
      port: row.port === DEFAULT_PORT ? null : row.port,
      share: row.share,
      userName: row.userName,
      guest: row.userName === "",
      passwordRemembered: row.passwordInKeychain,
      status,
      statusDetail: statusDetails[status](row),
      mountPath: mount?.mountPoint ?? null,
      locations,
      lastConnectedAt: row.lastConnectedAt,
      createdAt: row.createdAt,
    };
  }

  async function mountsNow(): Promise<SmbMount[]> {
    return deps.mode === "macos" ? listSmbMounts(deps.run) : [];
  }

  async function describe(row: ShareRow): Promise<NetworkShare> {
    return toDto(row, findMount(row, await mountsNow()));
  }

  /** What is being written to, or about to be, on storage locations under this folder. */
  function workInProgress(mountPoint: string): string[] {
    const ids = ctx.services.storage
      .list()
      .filter((location) => isInside(mountPoint, location.path))
      .map((location) => location.id);
    if (ids.length === 0) return [];
    const work = new Set<string>();
    const active = db
      .select({ title: downloads.title })
      .from(downloads)
      .where(and(inArray(downloads.locationId, ids), inArray(downloads.state, ["queued", "running", "verifying"])))
      .all();
    for (const download of active) work.add(`Download: ${download.title}`);
    for (const job of ctx.jobs.list({ states: ["queued", "running"], limit: 200 })) {
      // Jobs name the location they work on in their payload; ids are unique enough to search for.
      const payload = JSON.stringify(job.payload);
      if (ids.some((id) => payload.includes(id)) || payload.includes(mountPoint)) work.add(job.title);
    }
    return [...work];
  }

  async function afterChange(): Promise<void> {
    await ctx.services.storage.refresh().catch((error) => ctx.log.error({ err: error }, "storage check failed"));
    ctx.events.publish({ type: "storage.changed" });
  }

  interface Target {
    server: string;
    port: number;
    share: string;
    /** Empty for a guest. */
    userName: string;
  }

  /**
   * Finds the one address to use for a server and sees whether it answers. Refuses a
   * server that is not on the home network before anything is sent to it.
   */
  async function reach(server: string, port: number): Promise<{ address: string; reachable: "open" | "unreachable" }> {
    const where = formatShareServer(server, port === DEFAULT_PORT ? null : port);
    const resolved = await resolveShareHost(server, { allowLoopback: deps.allowLoopback, lookup: deps.lookup });
    if (!resolved.ok) {
      if (resolved.reason === "not_private") {
        throw shareError(
          "failed",
          `Outpost only connects to file servers on your own network. ${server} is at ${resolved.addresses[0]}, which is not a private address.`,
        );
      }
      throw shareError(
        "server_not_found",
        `No computer called ${server} was found on this network. Check the name, or use its address, for example 192.168.1.20.`,
      );
    }
    const { address } = resolved.address;
    const reachable = await deps.probe(address, port, PROBE_TIMEOUT_MS);
    if (reachable === "timeout") {
      throw shareError("server_not_found", `${where} did not answer. Check that it is switched on and on the same network as this Mac.`);
    }
    if (reachable === "refused") {
      throw shareError(
        "server_not_found",
        `${server} is there, but it is not offering file sharing (SMB) on port ${port}. Turn on SMB file sharing on it.`,
      );
    }
    return { address, reachable };
  }

  /** The server and port a request names, or a plain refusal. */
  function parseServer(input: { server: string; port?: number | null }): { host: string; port: number } {
    const parsed = parseShareServer(input.server);
    if (!parsed) throw badRequest("Enter the server's name or address, for example nas.local or 192.168.1.20.");
    const port = input.port ?? parsed.port ?? DEFAULT_PORT;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw badRequest("That port is not valid.");
    return { host: parsed.host, port };
  }

  /** The user name and password a request carries, checked; both absent for a guest. */
  function parseSignIn(input: { userName?: string; password?: string; guest?: boolean }): {
    userName: string;
    password: string | undefined;
  } {
    if (input.guest === true) return { userName: "", password: undefined };
    const userName = (input.userName ?? "").trim();
    if (!isValidShareUser(userName))
      throw badRequest("That user name has characters Outpost does not accept. Use letters, digits, dots, dashes and underscores.");
    if (!isValidSharePassword(input.password ?? "")) throw badRequest("Enter the password. It cannot contain line breaks.");
    return { userName, password: input.password };
  }

  /** The server a mounted volume belongs to, as a person would type it, if it can be typed. */
  function serverOfMount(mount: SmbMount): string | undefined {
    const host = mount.host.endsWith(BONJOUR_SUFFIX) ? `${mount.host.slice(0, -BONJOUR_SUFFIX.length)}.local` : mount.host;
    return shareHostKind(host) ? host : undefined;
  }

  /** Why Outpost cannot use a mounted volume, or null if it can. */
  function mountProblem(mount: SmbMount): string | null {
    if (!config.storageRoots.some((root) => isInside(root, mount.mountPoint))) {
      return "It is outside the folders Outpost is allowed to use.";
    }
    if (!serverOfMount(mount) || !isValidShareName(mount.share) || (mount.user !== undefined && !isValidShareUser(mount.user))) {
      return "Its name has characters Outpost does not accept. Use Add location to pick a folder on it instead.";
    }
    return null;
  }

  /**
   * Mounts a share and records the outcome. `row` is the remembered share, if there is
   * one; a first attempt that fails leaves nothing behind. `unattended` is for the
   * retries nobody is waiting on: those only go ahead when the server plainly answers.
   */
  async function attach(
    target: Target,
    row: ShareRow | undefined,
    password: string | undefined,
    remember: boolean,
    unattended = false,
  ): Promise<ShareResult> {
    const fail = (reason: ShareError, message: string): never => {
      if (row) patch(row.id, { lastError: reason });
      throw shareError(reason, message);
    };
    const save = (values: Partial<ShareRow>): ShareRow => {
      const now = Date.now();
      const common = { ...values, userName: target.userName, lastError: null, autoConnect: true, lastConnectedAt: now };
      if (row) return patch(row.id, common);
      const id = newId();
      db.insert(networkShares)
        .values({ id, server: target.server, port: target.port, share: target.share, createdAt: now, updatedAt: now, ...common })
        .run();
      return getRow(id);
    };
    const where = formatShareServer(target.server, target.port === DEFAULT_PORT ? null : target.port);

    const guest = target.userName === "";

    // Already connected, by Outpost earlier or by someone in the Finder: use that.
    const before = findMount({ ...target, lastAddress: row?.lastAddress, mountPath: row?.mountPath }, await mountsNow());
    if (before) {
      const saved = save({ mountPath: before.mountPoint });
      await afterChange();
      return {
        share: toDto(saved, before),
        note:
          password !== undefined
            ? "This share was already connected on this Mac, so Outpost is using that connection. The password was not checked or saved."
            : undefined,
      };
    }

    const { address, reachable } = await reach(target.server, target.port).catch((error: unknown) => {
      // Remember why on the share's row, then pass the same message on.
      if (row && error instanceof AppError && typeof error.details?.reason === "string")
        patch(row.id, { lastError: error.details.reason as ShareError });
      throw error;
    });
    if (reachable !== "open" && unattended) {
      return fail("server_not_found", `${where} could not be reached. Check that it is switched on and on the same network as this Mac.`);
    }
    // Finding the server is not a try at its password; what follows is.
    const guessKey = guessKeyFor(address, target.port, target.userName);
    if (password !== undefined) assertNotHeld(guessKey);

    // Outpost checks the sign-in itself before asking macOS to mount anything. macOS will
    // happily reuse a sign-in it already has with a server, so "the mount worked" is not
    // on its own proof that this password, or a guest, was accepted. (The helper also asks
    // for a fresh sign-in every time; this is the second lock on the same door.) When the
    // password comes from the Keychain, Outpost never has it, and only the helper checks.
    if (reachable === "open" && (guest || password !== undefined)) {
      const checked = await deps.listShares(
        { address, port: target.port, user: guest ? undefined : target.userName, password },
        LIST_TIMEOUT_MS,
      );
      if (checked.kind === "wrong_password" || checked.kind === "unknown_user") {
        countWrongGuess(guessKey);
        return fail("wrong_password", "The server did not accept that user name and password.");
      }
      if (checked.kind === "guest_refused") {
        return fail("failed", `${target.server} does not let guests in. Connect "${target.share}" with a user name and password.`);
      }
      // Anything else (signed in, or a server this check cannot talk to) is left to the mount to settle.
    }

    const keychain = keychainFor(target);
    const outcome = await mountShare(
      deps.run,
      {
        url: `smb://${urlHost(address)}${target.port === DEFAULT_PORT ? "" : `:${target.port}`}/${encodeURIComponent(target.share)}`,
        user: target.userName,
        password,
        remember,
        keychain,
        guest,
      },
      reachable === "open" ? MOUNT_TIMEOUT_MS : MOUNT_TIMEOUT_UNSURE_MS,
    );

    switch (outcome.kind) {
      case "timed_out":
        return fail(
          "server_not_found",
          `${where} did not answer in time. Check that it is switched on and on the same network as this Mac.`,
        );
      case "broken":
        ctx.log.error({ code: outcome.code }, "the share helper did not run");
        return fail("failed", "macOS could not be asked to connect the share. The server log has the exit code.");
      case "no_password":
        if (outcome.keychainStatus === -25300 && row) patch(row.id, { passwordInKeychain: false });
        return fail(
          "needs_password",
          outcome.keychainStatus === -25300
            ? "The password is no longer in the Keychain. Enter it to connect."
            : "The Keychain could not be read. It may be locked, or nobody is logged in at this Mac. Enter the password to connect.",
        );
      case "error":
        if (AUTH_ERRORS.has(outcome.errno)) {
          if (guest)
            return fail("failed", `${target.server} does not let guests open "${target.share}". Connect it with a user name and password.`);
          if (password !== undefined) countWrongGuess(guessKey);
          return fail("wrong_password", "The server did not accept that user name and password.");
        }
        if (SHARE_ERRORS.has(outcome.errno) && reachable === "open") {
          return fail(
            "share_not_found",
            guest
              ? `${target.server} answered, but there is no share called "${target.share}" that a guest can open. Connect it with a user name and password.`
              : `${target.server} answered, but there is no share called "${target.share}" that this user can open. Check the share's name.`,
          );
        }
        if (NETWORK_ERRORS.has(outcome.errno) || SHARE_ERRORS.has(outcome.errno)) {
          return fail(
            "server_not_found",
            `${where} could not be reached. Check that it is switched on and on the same network as this Mac.`,
          );
        }
        return fail("failed", `macOS could not connect the share (error ${outcome.errno}).`);
      case "already_mounted":
      case "mounted":
        break;
    }

    if (password !== undefined && outcome.kind === "mounted") wrongGuesses.delete(guessKey);
    const mountPoint =
      (outcome.kind === "mounted" ? outcome.mountPoint : undefined) ??
      findMount({ ...target, lastAddress: address }, await mountsNow())?.mountPoint;
    if (!mountPoint) return fail("failed", "macOS says the share is connected, but Outpost could not find where. Try again.");

    let passwordInKeychain = guest ? false : (row?.passwordInKeychain ?? false);
    let note: string | undefined;
    if (password !== undefined && outcome.kind === "mounted") {
      // A password was typed: the Keychain now holds it, or should hold nothing.
      if (row && (row.userName !== target.userName || !remember) && row.passwordInKeychain) {
        await forgetPassword(deps.run, keychainFor({ ...target, userName: row.userName }));
        passwordInKeychain = false;
      }
      if (remember) {
        passwordInKeychain = outcome.stored === true;
        if (!passwordInKeychain)
          note = "Connected, but the password could not be saved in the Keychain. You will be asked for it next time.";
      }
    } else if (password !== undefined && remember) {
      note = "This share was already connected on this Mac. The password was not checked or saved.";
    }

    const saved = save({ mountPath: mountPoint, lastAddress: address, passwordInKeychain });
    await afterChange();
    const user = guest ? undefined : target.userName;
    return { share: toDto(saved, { host: address, port: target.port, share: target.share, user, mountPoint }), note };
  }

  async function detach(row: ShareRow, confirm: boolean): Promise<void> {
    const mount = findMount(row, await mountsNow());
    if (!mount) return;
    const work = workInProgress(mount.mountPoint);
    if (work.length > 0 && !confirm) {
      throw conflict(
        `${work.length === 1 ? "Something is" : `${work.length} things are`} still using this share. Disconnecting now will interrupt ${work.length === 1 ? "it" : "them"}.`,
        { reason: "work_in_progress", work },
      );
    }
    const outcome = await unmountVolume(deps.run, mount.mountPoint);
    if (!outcome.ok) {
      throw conflict(
        outcome.busy
          ? `macOS would not disconnect the share because ${outcome.usedBy ?? "a program"} still has files open on it. Nothing was interrupted. Let that finish, then try again.`
          : "macOS would not disconnect the share, most likely because a program (possibly Outpost itself) still has files open on it. Nothing was changed or interrupted. Pause or close what is using it and try again.",
        { reason: "in_use" },
      );
    }
  }

  const service: SharesService = {
    deps,

    async list() {
      const rows = db.select().from(networkShares).orderBy(networkShares.createdAt).all();
      if (rows.length === 0) return [];
      const mounts = await mountsNow();
      return rows.map((row) => {
        const mount = findMount(row, mounts);
        // Connected behind Outpost's back (from the Finder, say): take note of where.
        const current =
          mount && (mount.mountPoint !== row.mountPath || row.lastError)
            ? patch(row.id, { mountPath: mount.mountPoint, lastError: null })
            : row;
        return toDto(current, mount);
      });
    },

    hints() {
      const uid = typeof process.getuid === "function" ? process.getuid() : null;
      const gid = typeof process.getgid === "function" ? process.getgid() : null;
      const outside = config.storageRoots.filter((root) => !isInside(config.dataDir, root));
      const mountBase =
        deps.mode === "docker"
          ? (config.storageRoots[0] ?? null)
          : outside.includes("/mnt")
            ? "/mnt"
            : (outside[outside.length - 1] ?? null);
      return { uid, gid, mountBase };
    },

    async serverShares(input) {
      requireMac();
      const { host, port } = parseServer(input);
      const { userName, password } = parseSignIn(input);
      const guest = userName === "";
      const where = formatShareServer(host, port === DEFAULT_PORT ? null : port);
      const { address } = await reach(host, port);
      // Looking with a typed password is a try at that password like any other.
      const guessKey = guessKeyFor(address, port, userName);
      if (!guest) assertNotHeld(guessKey);

      const outcome = await deps.listShares({ address, port, user: guest ? undefined : userName, password }, LIST_TIMEOUT_MS);
      const typeIt = "You can still connect a share by typing its name.";
      switch (outcome.kind) {
        case "listed":
          break;
        case "wrong_password":
          countWrongGuess(guessKey);
          throw shareError("wrong_password", "The server did not accept that user name and password.");
        case "unknown_user":
          // The server let an unknown name in as a guest. That is still a wrong guess at who has an account.
          countWrongGuess(guessKey);
          throw shareError("wrong_password", `${host} has no user called ${userName}. Check the user name.`);
        case "guest_refused":
          throw new AppError("forbidden", `${host} does not let guests look at its shared folders. Enter a user name and password.`, {
            reason: "guest_refused",
          });
        case "account_unusable":
          throw new AppError(
            "forbidden",
            {
              locked: `${host} has locked this account, usually after too many wrong passwords. Unlock it on the server, or wait and try again.`,
              disabled: `This account is switched off on ${host}.`,
              expired: `This account or its password has expired on ${host}. Change the password on the server first.`,
              restricted: `${host} does not let this account sign in over the network.`,
            }[outcome.why],
            { reason: "failed" },
          );
        case "no_answer":
          throw shareError(
            "server_not_found",
            `${where} did not answer. Check that it is switched on and on the same network as this Mac.`,
          );
        case "not_allowed":
          throw new AppError(
            "storage_unavailable",
            `${host} accepted the sign-in, but does not let this account see its list of shared folders. ${typeIt}`,
            {
              reason: "cannot_list",
            },
          );
        case "unsupported":
          throw new AppError(
            "storage_unavailable",
            `Outpost could not read the list of shared folders from ${host}: ${
              outcome.why === "signing"
                ? "it does not give its list to guests"
                : outcome.why === "sign_in"
                  ? "it asks for a kind of sign-in that Outpost cannot use for reading the list"
                  : "it only speaks a version of SMB that Outpost cannot read the list with"
            }. ${typeIt}`,
            { reason: "cannot_list" },
          );
        case "failed":
          // What went wrong is in the server's own terms: for the log, not for the person.
          ctx.log.warn({ detail: outcome.detail }, "a file server's shares could not be listed");
          throw new AppError("storage_unavailable", `Outpost could not read the list of shared folders from ${host}. ${typeIt}`, {
            reason: "cannot_list",
          });
      }
      // The password was right: earlier misses are forgiven.
      if (!guest) wrongGuesses.delete(guessKey);

      // Share names come from the server. Only ones that pass the same rule as a typed name are offered.
      const { shares, unusable } = pickDiskShares(outcome.shares, isValidShareName);
      const mounts = await mountsNow();
      const rows = db.select().from(networkShares).all();
      return {
        shares: shares.map((share) => {
          const known = rows.find(
            (row) => row.server === host && row.port === port && row.share.toLowerCase() === share.name.toLowerCase(),
          );
          const mount = findMount({ server: host, port, share: share.name, lastAddress: known?.lastAddress ?? address }, mounts);
          return { ...share, mountPath: mount?.mountPoint ?? null };
        }),
        unusable,
      };
    },

    async mounted() {
      if (deps.mode !== "macos") return [];
      // Only volumes inside the folders Outpost may use are named. Anyone who can open
      // Outpost can read this list, and what else is connected to this Mac is not theirs to see.
      const mounts = (await mountsNow()).filter((mount) => config.storageRoots.some((root) => isInside(root, mount.mountPoint)));
      const rows = db.select().from(networkShares).all();
      return mounts.map((mount) => {
        const problem = mountProblem(mount);
        return {
          server: serverOfMount(mount) ?? mount.host,
          port: mount.port === DEFAULT_PORT ? null : mount.port,
          share: mount.share,
          userName: mount.user ?? null,
          mountPath: mount.mountPoint,
          usable: problem === null,
          problem,
          shareId: rows.find((row) => findMount(row, [mount]))?.id ?? null,
        };
      });
    },

    async adopt(mountPath) {
      requireMac();
      return exclusive(async () => {
        // Only a volume in the system's own list of SMB mounts, never a path taken on trust.
        const mount = (await mountsNow()).find((candidate) => candidate.mountPoint === mountPath);
        if (!mount) throw new AppError("not_found", "That volume is no longer connected on this Mac.");
        const problem = mountProblem(mount);
        if (problem) throw badRequest(`Outpost cannot use that volume. ${problem}`);
        const row = db
          .select()
          .from(networkShares)
          .all()
          .find((candidate) => findMount(candidate, [mount]));
        const target = row
          ? { server: row.server, port: row.port, share: row.share, userName: row.userName }
          : { server: serverOfMount(mount)!, port: mount.port, share: mount.share, userName: mount.user ?? "" };
        // attach() finds the same mount and records it; nothing is mounted and no password is involved.
        return attach(target, row, undefined, false);
      });
    },

    async connect(input) {
      requireMac();
      const { host, port } = parseServer(input);
      const share = input.share.trim();
      if (!isValidShareName(share)) throw badRequest("Enter the share's name as the server shows it, without slashes.");
      const { userName, password } = parseSignIn(input);
      const target = { server: host, port, share, userName };
      return exclusive(() => {
        const row = db
          .select()
          .from(networkShares)
          .where(and(eq(networkShares.server, target.server), eq(networkShares.port, port)))
          .all()
          .find((candidate) => candidate.share.toLowerCase() === share.toLowerCase());
        return attach(row ? { ...target, share: row.share } : target, row, password, userName !== "" && input.rememberPassword === true);
      });
    },

    async reconnect(id, input) {
      requireMac();
      if (input.password !== undefined && !isValidSharePassword(input.password)) {
        throw badRequest("Enter the password. It cannot contain line breaks.");
      }
      return exclusive(async () => {
        const row = getRow(id);
        const guest = row.userName === "" && input.password === undefined;
        if (!guest && input.password === undefined && !row.passwordInKeychain && !findMount(row, await mountsNow())) {
          patch(row.id, { lastError: "needs_password" });
          throw shareError("needs_password", "Enter the password to connect this share.");
        }
        const remember = input.password !== undefined && (input.rememberPassword ?? row.passwordInKeychain);
        return attach(row, row, input.password, remember);
      });
    },

    async disconnect(id, options) {
      requireMac();
      return exclusive(async () => {
        const row = getRow(id);
        await detach(row, options.confirm);
        // Stay disconnected until someone asks: do not reconnect at the next start.
        const saved = patch(row.id, { autoConnect: false, lastError: null });
        await afterChange();
        return { share: await describe(saved) };
      });
    },

    async forget(id, options) {
      return exclusive(async () => {
        const row = getRow(id);
        if (deps.mode === "macos") {
          await detach(row, options.confirm);
          // A guest's share never had a password to remember.
          if (row.userName !== "" && !(await forgetPassword(deps.run, keychainFor(row)))) {
            await afterChange();
            throw new AppError(
              "storage_unavailable",
              "The saved password could not be removed from the Keychain, so the share was kept. Try again, or delete the item named “Outpost network share” in Keychain Access.",
            );
          }
        }
        db.delete(networkShares).where(eq(networkShares.id, id)).run();
        await afterChange();
      });
    },

    async discover() {
      if (deps.mode !== "macos") return { supported: false, servers: [] };
      const found = await browseFileServers(deps.run);
      const servers: DiscoveredServer[] = [];
      for (const entry of found) {
        // Names come from the network; only a `.local` name, which is reached by multicast
        // DNS, is offered. A name under another domain would send a query the device chose
        // to the computer's DNS server when connected to.
        if (shareHostKind(entry.host) !== "name" || !localName(entry.host)) continue;
        // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
        const name = entry.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80);
        servers.push({ name: name || entry.host, host: entry.host, port: entry.port === DEFAULT_PORT ? null : entry.port });
      }
      return { supported: true, servers };
    },

    async reconnectRemembered() {
      if (deps.mode !== "macos") return false;
      const wanted = db
        .select()
        .from(networkShares)
        .where(eq(networkShares.autoConnect, true))
        .all()
        // Only shares that can be connected without asking anyone: a remembered password, or a guest.
        // A refused password will be refused again; asking repeatedly can lock the account on the NAS.
        .filter((row) => (row.passwordInKeychain || row.userName === "") && row.lastError !== "wrong_password");
      if (wanted.length === 0) return false;
      const mounts = await mountsNow();
      let missing = false;
      for (const row of wanted) {
        if (findMount(row, mounts)) continue;
        await exclusive(() => attach(row, getRow(row.id), undefined, false, true)).then(
          () => ctx.log.info({ share: row.id }, "network share reconnected"),
          (error: unknown) => {
            missing = true;
            const reason = error instanceof AppError ? (error.details?.reason ?? error.code) : "error";
            // Said once per reason, not every five minutes while a NAS is switched off.
            if (reason !== row.lastError) ctx.log.warn({ share: row.id, reason }, "network share could not be reconnected");
          },
        );
      }
      return missing;
    },
  };

  return service;
}
