/** HTTPS on the home network: a second listener, with a certificate this server makes for itself. */

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
  /** The start-up option that allows it from every device. */
  option: string;
}

export interface HttpsStatus {
  /** The setting: whether HTTPS is wanted. */
  enabled: boolean;
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
  /** When the server certificate runs out. It is renewed by itself well before then. */
  certificateExpiresAt: number | null;
  /** In a container Outpost cannot see the addresses of the computer it runs on; a person has to name them. */
  inContainer: boolean;
  lanAccess: boolean;
  authorityRight: HttpsAuthorityRight;
}
