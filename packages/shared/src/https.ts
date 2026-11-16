/**
 * HTTPS on the home network: a second listener, with a certificate this server makes
 * for itself or one the person brought.
 */
import type { LocalBy } from "./common.ts";

/** One way of opening Outpost over HTTPS. */
export interface HttpsAddress {
  /** The whole address, such as `https://192.168.1.20:8443`. */
  url: string;
  /** The name or address in it, as the certificate lists it. */
  name: string;
  /** An address on the network, a name on the network, or the computer Outpost runs on. */
  kind: "address" | "name" | "this-computer";
}

/** The certificate authority devices are asked to trust. Only public facts about it. */
export interface HttpsAuthority {
  /** How devices list it once installed. */
  name: string;
  /** SHA-256 fingerprint, as pairs of capitals with colons: what a device shows before trusting it. */
  fingerprint: string;
  createdAt: number;
  expiresAt: number;
  /** Name endings it may sign for (`local`, `lan`, …) and, last, any single host names. */
  permittedNames: string[];
  /** Address blocks it may sign for, such as `192.168.0.0/16`. */
  permittedBlocks: string[];
}

/** Whether this request may replace or delete the certificate authority, and on what grounds. */
export interface HttpsAuthorityRight {
  allowed: boolean;
  /** `local`: asked from the computer Outpost runs on. `option`: allowed everywhere by a start-up option. */
  reason: "local" | "option" | "remote";
  /** With `local`: which rule made it so. */
  localBy?: LocalBy;
  /** The start-up option that allows it from every device. */
  option: string;
}

/** Whether this request may hand Outpost a private key by upload, and on what grounds. */
export interface HttpsKeyRight {
  allowed: boolean;
  /**
   * `local`: asked from the computer Outpost runs on. `https`: the request itself came
   * over HTTPS, so the key is not readable on the way. `remote`: neither, so the key
   * would cross the network in the clear. Then `allowed` is false and an upload is
   * still taken if it carries `PLAIN_HTTP_ACCEPTED_FIELD` set to `"yes"`: the person's
   * own statement that they accept the key being readable on the way.
   */
  reason: "local" | "https" | "remote";
  /** With `local`: which rule made it so. */
  localBy?: LocalBy;
}

/**
 * The form field with which an upload of a key from another device over plain http
 * says that the person accepts the key crossing the network unencrypted. Its value must
 * be exactly `"yes"`; anything else, or its absence, is a refusal.
 */
export const PLAIN_HTTP_ACCEPTED_FIELD = "acceptKeyOverPlainHttp";

/** What Outpost found in a certificate the person brought. Only public facts. */
export interface HttpsOwnCertificate {
  /** The first name on it: what to call it. */
  name: string;
  /** The common name of whoever issued it. */
  issuer: string;
  /** SHA-256 fingerprint of the server's certificate. */
  fingerprint: string;
  validFrom: number;
  /** The earliest end among the certificate and the chain sent with it. */
  expiresAt: number;
  /** The key's kind, such as "ECDSA P-256" or "RSA 2048". */
  key: string;
  /** Names and addresses as written on it, wildcards included. */
  names: string[];
  /** The authorities' certificates sent with it, nearest first, by name. */
  chain: string[];
  /**
   * `public`: it chains to an authority in the list of public ones that came with this
   * server's Node, so devices should accept it as they are. `private`: it chains to
   * some other authority, whose root each device has to be told to trust.
   * `self-signed`: it vouches for itself, and each device has to be told to trust it.
   * Outpost cannot see what any device trusts; this is the best it can tell.
   */
  trust: "public" | "private" | "self-signed";
  /**
   * The certificate a device has to trust: its name, and its fingerprint where it is
   * known. `held` says Outpost has it and offers it for download
   * (`/api/https/own-root.crt`); otherwise it has to come from whoever runs the authority.
   */
  anchor: { name: string; fingerprint: string | null; held: boolean };
  /** Of the names and addresses this server is reached by: the ones it covers, and the ones it does not. */
  covered: string[];
  notCovered: string[];
  /** Names on it that Outpost refuses requests for until it is started with them in OUTPOST_ALLOWED_HOSTS. */
  notAnswered: string[];
  /** Things that will stop it working on some devices or at some addresses. */
  warnings: string[];
  /** Things worth knowing that need no action. */
  notes: string[];
}

/** A certificate of the person's own: where its files go, and what is known of the one in hand. */
export interface HttpsOwn {
  /** The folder on the server whose two files Outpost uses and watches. */
  folder: string;
  /** The names the two files must have. */
  files: { certificate: string; key: string };
  /** Whether each file is there now. */
  inFolder: { certificate: boolean; key: boolean };
  /** The certificate Outpost holds and is serving, or would serve. Null while Outpost's own is in use, or when none could be read. */
  certificate: HttpsOwnCertificate | null;
  /** How near its end that certificate is. */
  expiry: "ok" | "soon" | "expired" | null;
  /**
   * Why the files in the folder cannot be used as they are now. When `certificate` is
   * set as well, Outpost is still serving the pair it read before they changed.
   */
  problem: string | null;
  keyRight: HttpsKeyRight;
}

export interface HttpsStatus {
  /** The setting: whether HTTPS is wanted. */
  enabled: boolean;
  /** The setting: whose certificate the listener presents. */
  source: "outpost" | "own";
  /** Set where HTTPS is not offered at all. */
  unavailable: "portable" | null;
  /** Whether the HTTPS listener is answering now. */
  listening: boolean;
  /** The port HTTPS is, or would be, on. */
  port: number;
  /** The port plain HTTP is on, which keeps working. */
  httpPort: number;
  /** What stopped HTTPS from starting, in words for a person. Null when nothing did. */
  problem: string | null;
  /** Addresses to open, most useful first. Empty while HTTPS is off. */
  addresses: HttpsAddress[];
  /** Names and addresses the server certificate lists. */
  names: string[];
  /** Names this server is reached by that the certificate cannot carry, and why. */
  leftOut: Array<{ name: string; reason: string }>;
  authority: HttpsAuthority | null;
  /** When the certificate being served runs out. Outpost renews its own well before then; one the person brought is theirs to renew. */
  certificateExpiresAt: number | null;
  /** In a container Outpost cannot see the addresses of the computer it runs on; a person has to name them. */
  inContainer: boolean;
  lanAccess: boolean;
  authorityRight: HttpsAuthorityRight;
  own: HttpsOwn;
}
