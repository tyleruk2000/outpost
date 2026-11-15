/**
 * Network shares (a NAS): what the Storage screen and the server say to each other, the
 * rules for what may be typed into the form, and the text Outpost writes out for
 * set-ups where it cannot connect a share itself.
 *
 * A share's password is never part of anything in this file except the one request
 * that carries it to the server (`ConnectShareRequest`). No response contains it.
 */

/** What this Outpost can do about network shares, decided by where it runs. */
export type ShareHostMode =
  /** Run directly on a Mac: Outpost connects the share itself. */
  | "macos"
  /** In a container: Docker has to mount the share; Outpost writes out the Compose lines. */
  | "docker"
  /** Run directly on Linux: mounting needs root; Outpost writes out the fstab line. */
  | "linux"
  /** Anything else (Windows, a portable drive): nothing to offer. */
  | "unsupported";

export type NetworkShareStatus =
  | "connected"
  /** Not mounted, and nothing is known to be wrong. */
  | "disconnected"
  | "wrong_password"
  | "server_not_found"
  | "share_not_found"
  /** No password is remembered, so a person has to type it to reconnect. */
  | "needs_password"
  | "failed";

export interface NetworkShare {
  id: string;
  /** Host name or address as it was typed. */
  server: string;
  /** Only when the server does not use the usual port. */
  port: number | null;
  share: string;
  userName: string;
  /** The password is in this Mac's Keychain. Outpost itself never has it. */
  passwordRemembered: boolean;
  status: NetworkShareStatus;
  /** One plain sentence about the status, when there is something to say. */
  statusDetail: string | null;
  /** Folder the share appears at while it is connected. */
  mountPath: string | null;
  /** Storage locations that live on this share. */
  locations: Array<{ id: string; name: string }>;
  lastConnectedAt: number | null;
  createdAt: number;
}

export interface NetworkSharesResponse {
  mode: ShareHostMode;
  shares: NetworkShare[];
  /** Facts the written instructions need, so they match this installation. */
  hints: ShareInstructionHints;
}

export interface ShareInstructionHints {
  /** The user the server runs as, for mount options. Null where that has no meaning. */
  uid: number | null;
  gid: number | null;
  /** A storage root to mount shares under, e.g. "/mnt" or "/storage". */
  mountBase: string | null;
}

export interface ConnectShareRequest {
  server: string;
  port?: number | null;
  share: string;
  userName: string;
  password: string;
  /** Keep the password in the Keychain so the share can be reconnected without asking. */
  rememberPassword: boolean;
}

export interface ReconnectShareRequest {
  /** Leave out to use the password remembered in the Keychain. */
  password?: string;
  rememberPassword?: boolean;
}

/** Sent back with a 409 when disconnecting would interrupt something. */
export interface ShareBusyDetails {
  reason: "work_in_progress";
  work: string[];
}

export interface DiscoveredServer {
  /** Name the server advertises, e.g. "Workshop NAS". */
  name: string;
  /** Host name to connect to, e.g. "workshop-nas.local". */
  host: string;
  port: number | null;
}

export interface DiscoverServersResponse {
  /** False where Outpost has no way to look (anything but a Mac run directly). */
  supported: boolean;
  servers: DiscoveredServer[];
}

// ── What may be typed ───────────────────────────────────────────────────────

const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const IPV4 = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^[0-9a-f:]{2,39}$/i;
/** Letters, digits, spaces and `. _ - $`; no slashes, quotes or control characters. */
const SHARE_NAME = /^[\p{L}\p{N}_$-](?:[\p{L}\p{N} ._$-]{0,78}[\p{L}\p{N}_$-])?$/u;
const USER_NAME = /^[\p{L}\p{N}_](?:[\p{L}\p{N} ._@-]{0,62}[\p{L}\p{N}._@$-])?$/u;
// biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters is the point
const CONTROL = /[\u0000-\u001f\u007f]/;

export type ShareHostKind = "ipv4" | "ipv6" | "name";

/** Says what kind of host this is, or undefined when it is not a host at all. */
export function shareHostKind(host: string): ShareHostKind | undefined {
  if (IPV4.test(host)) return "ipv4";
  // Only digits and dots but not an address: "1.2.3", "2130706433" and the like.
  if (/^[\d.]+$/.test(host)) return undefined;
  if (host.includes(":")) return IPV6.test(host) && host.split(":").length >= 3 ? "ipv6" : undefined;
  if (host.length > 253) return undefined;
  return host.split(".").every((label) => HOST_LABEL.test(label)) ? "name" : undefined;
}

export interface ParsedShareServer {
  host: string;
  port: number | null;
}

/**
 * Reads what a person typed into "Server": a host name or address, optionally with
 * `:port`. An IPv6 address with a port is written `[address]:port`.
 */
export function parseShareServer(input: string): ParsedShareServer | undefined {
  let text = input.trim().toLowerCase();
  if (text.endsWith(".") && !text.endsWith("..")) text = text.slice(0, -1);
  let port: number | null = null;
  const bracketed = /^\[([^\]]+)\](?::(\d{1,5}))?$/.exec(text);
  if (bracketed) {
    text = bracketed[1]!;
    if (bracketed[2]) port = Number(bracketed[2]);
    if (shareHostKind(text) !== "ipv6") return undefined;
  } else {
    const withPort = /^([^:]+):(\d{1,5})$/.exec(text);
    if (withPort) {
      text = withPort[1]!;
      port = Number(withPort[2]);
    }
  }
  if (port !== null && (port < 1 || port > 65535)) return undefined;
  if (!shareHostKind(text)) return undefined;
  return { host: text, port };
}

/** Writes a host and optional port back the way a person would type it. */
export function formatShareServer(host: string, port?: number | null): string {
  if (!port) return host;
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

export const isValidShareName = (name: string) => SHARE_NAME.test(name) && name !== "." && name !== "..";
export const isValidShareUser = (name: string) => USER_NAME.test(name);
export const isValidSharePassword = (password: string) => password.length >= 1 && password.length <= 255 && !CONTROL.test(password);

/**
 * Picks the server and share out of an address pasted whole, such as
 * `smb://nas.local/media` or `\\nas\media`. Returns undefined for anything else.
 */
export function parseShareAddress(input: string): { server: string; share: string } | undefined {
  const text = input.trim();
  const match = /^(?:smb:\/\/|\/\/|\\\\)(?:[^@/\\]*@)?([^/\\]+)[/\\]([^/\\]+)[/\\]?$/i.exec(text);
  if (!match) return undefined;
  let share = match[2]!;
  try {
    share = decodeURIComponent(share);
  } catch {
    // Not percent-encoded; use it as it is.
  }
  return parseShareServer(match[1]!) && isValidShareName(share) ? { server: match[1]!.toLowerCase(), share } : undefined;
}

/** How a share is named in lists: `//server/share`. */
export function shareAddress(share: { server: string; port?: number | null; share: string }): string {
  return `//${formatShareServer(share.server, share.port)}/${share.share}`;
}

// ── Instructions for set-ups where Outpost cannot connect the share itself ──

export interface ShareInstructionInput {
  protocol: "smb" | "nfs";
  host: string;
  port?: number | null;
  /** SMB: the share's name. */
  share?: string;
  /** SMB: the account on the NAS. */
  userName?: string;
  /** NFS: the exported path on the server, e.g. "/volume1/outpost". */
  exportPath?: string;
}

export interface InstructionStep {
  title: string;
  /** What to do, in a sentence or two. */
  body: string;
  /** Text to copy, exactly as it should be used. */
  code?: string;
  /** Where the copied text goes, e.g. "compose.yaml". */
  codeLabel?: string;
  /** A second block for the same step (a command after a file, say). */
  more?: { code: string; codeLabel: string };
}

/** Stands in for the password. Outpost never asks for it on these set-ups. */
export const PASSWORD_PLACEHOLDER = "put-the-password-here";

/** A short name safe in a path, a volume name and a file name. */
export function shareSlug(input: ShareInstructionInput): string {
  const source = input.protocol === "smb" ? (input.share ?? "") : ((input.exportPath ?? "").split("/").filter(Boolean).pop() ?? "");
  const slug = source
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "nas";
}

const isValidExportPath = (value: string) => /^\/[A-Za-z0-9._/-]{0,200}$/.test(value) && !value.split("/").includes("..");

/** Says what is wrong with the form, or returns undefined when instructions can be written. */
export function shareInstructionProblem(input: ShareInstructionInput): string | undefined {
  if (!shareHostKind(input.host)) return "Enter the server's name or address, for example nas.local or 192.168.1.20.";
  if (input.port != null && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) return "That port is not valid.";
  if (input.protocol === "smb") {
    if (!isValidShareName(input.share ?? "")) return "Enter the share's name as the NAS shows it, without slashes.";
    if (!isValidShareUser(input.userName ?? "")) return "Enter the user name for the share.";
  } else if (!isValidExportPath(input.exportPath ?? "")) {
    return "Enter the exported folder as the NAS shows it, starting with a slash, for example /volume1/outpost.";
  }
  return undefined;
}

const uncHost = (host: string) => (host.includes(":") ? `[${host}]` : host);

/**
 * The Compose changes that make Docker mount a share for Outpost. The shapes are the
 * ones in docs/storage.md ("A share mounted by Docker").
 */
export function dockerShareInstructions(input: ShareInstructionInput, hints: ShareInstructionHints): InstructionStep[] {
  const slug = shareSlug(input);
  const volume = `nas-${slug}`;
  const inside = `${(hints.mountBase ?? "/storage").replace(/\/+$/, "")}/${slug}`;
  const uid = hints.uid ?? 1000;
  const gid = hints.gid ?? 1000;
  const steps: InstructionStep[] = [];

  let volumeBlock: string;
  if (input.protocol === "smb") {
    steps.push({
      title: "Give Docker the user name and password",
      body: "In the folder that holds compose.yaml, add these two lines to the file named .env (create it if it is not there), with the real password in place of the placeholder. Keep that file readable only by you. Docker uses it to mount the share; it is not passed to Outpost. A password with a comma in it cannot be given this way.",
      code: `NAS_USER=${input.userName}\nNAS_PASSWORD=${PASSWORD_PLACEHOLDER}`,
      codeLabel: ".env",
    });
    const options = [
      `addr=${input.host}`,
      ...(input.port ? [`port=${input.port}`] : []),
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Compose fills these in from .env; they are meant literally
      "username=${NAS_USER}",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: as above
      "password=${NAS_PASSWORD}",
      `uid=${uid}`,
      `gid=${gid}`,
      "file_mode=0664",
      "dir_mode=0775",
      "vers=3.0",
    ].join(",");
    volumeBlock = [
      "volumes:",
      `  ${volume}:`,
      "    driver: local",
      "    driver_opts:",
      "      type: cifs",
      `      o: "${options}"`,
      `      device: "//${uncHost(input.host)}/${input.share}"`,
    ].join("\n");
  } else {
    const options = [`addr=${input.host}`, ...(input.port ? [`port=${input.port}`] : []), "rw", "nfsvers=4.1", "soft", "timeo=150"].join(
      ",",
    );
    volumeBlock = [
      "volumes:",
      `  ${volume}:`,
      "    driver: local",
      "    driver_opts:",
      "      type: nfs",
      `      o: "${options}"`,
      `      device: ":${input.exportPath}"`,
    ].join("\n");
  }

  steps.push({
    title: "Describe the share as a volume",
    body: "Add this to compose.yaml. If the file already has a top-level volumes: section, add only the indented lines to it. If Docker cannot find the NAS by name, put its IP address after addr= instead.",
    code: volumeBlock,
    codeLabel: "compose.yaml",
  });
  steps.push({
    title: "Give the volume to both services",
    body: "Add these lines under the volumes: of the outpost service and of the kiwix service. The reader for reference collections needs the same folder, read-only.",
    code: [
      "services:",
      "  outpost:",
      "    volumes:",
      `      - ${volume}:${inside}`,
      "  kiwix:",
      "    volumes:",
      `      - ${volume}:${inside}:ro`,
    ].join("\n"),
    codeLabel: "compose.yaml",
  });
  steps.push({
    title: "Start it again, then add the folder here",
    body: `Run this where compose.yaml is. When Outpost is back, choose Add location on this screen and pick ${inside}.`,
    code: "docker compose up -d",
    codeLabel: "Terminal",
  });
  return steps;
}

/**
 * The steps that make Linux mount a share at start-up. The shapes are the ones in
 * docs/storage.md ("A share mounted by the host").
 */
export function linuxShareInstructions(input: ShareInstructionInput, hints: ShareInstructionHints): InstructionStep[] {
  const slug = shareSlug(input);
  const folder = `${(hints.mountBase ?? "/mnt").replace(/\/+$/, "")}/${slug}`;
  const uid = hints.uid ?? 1000;
  const gid = hints.gid ?? 1000;
  const steps: InstructionStep[] = [];

  if (input.protocol === "smb") {
    const credentials = `/root/.outpost-smb-${slug}`;
    steps.push({
      title: "Put the user name and password in a file only root can read",
      body: `Create ${credentials} with these two lines, with the real password in place of the placeholder, then close it to everyone but root. The password stays in that file; Outpost never sees it.`,
      code: `username=${input.userName}\npassword=${PASSWORD_PLACEHOLDER}`,
      codeLabel: credentials,
      more: { code: `sudo nano ${credentials}\nsudo chmod 600 ${credentials}`, codeLabel: "Terminal" },
    });
    const options = [
      `credentials=${credentials}`,
      ...(input.port ? [`port=${input.port}`] : []),
      `uid=${uid}`,
      `gid=${gid}`,
      "file_mode=0664",
      "dir_mode=0775",
      "vers=3.0",
      "nofail",
    ].join(",");
    // fstab separates fields with spaces, so a space in a share name is written \040.
    const device = `//${uncHost(input.host)}/${(input.share ?? "").replaceAll(" ", "\\040")}`;
    steps.push({
      title: "Tell Linux about the share",
      body: "Add this line to the end of /etc/fstab (sudo nano /etc/fstab). Mounting SMB shares needs the cifs-utils package.",
      code: `${device}  ${folder}  cifs  ${options}  0  0`,
      codeLabel: "/etc/fstab",
    });
  } else {
    steps.push({
      title: "Tell Linux about the share",
      body: "Add this line to the end of /etc/fstab (sudo nano /etc/fstab). Mounting NFS shares needs the nfs-common package (nfs-utils on some systems).",
      code: `${uncHost(input.host)}:${input.exportPath}  ${folder}  nfs  rw,nfsvers=4.1,soft,timeo=150,nofail${input.port ? `,port=${input.port}` : ""}  0  0`,
      codeLabel: "/etc/fstab",
    });
  }
  steps.push({
    title: "Make the folder and connect it",
    body:
      input.protocol === "smb"
        ? "The share is connected now and again each time the computer starts."
        : `The share is connected now and again each time the computer starts. Outpost runs as user ${uid}; the NAS must let that user write to the folder.`,
    code: `sudo mkdir -p ${folder}\nsudo mount ${folder}`,
    codeLabel: "Terminal",
  });
  steps.push({
    title: "Add the folder here",
    body: `Choose Add location on this screen and pick ${folder}.`,
  });
  return steps;
}
