/**
 * The connection under Outpost's MQTT client: plain TCP, or TLS where the household's
 * broker offers it (Mosquitto's `listener 8883` with `certfile` and `keyfile`). With TLS the
 * broker's certificate is checked as a browser checks a web site's: against the household's
 * own certificate authority when one is given (its `ca.crt`, pasted in Settings), otherwise
 * against the authorities this computer trusts, and for the name or address typed. There is
 * no way to turn the check off for a sign-in: a password sent to a broker that is not the one
 * meant is lost. Only "Find" looks at a certificate without trusting it, and sends nothing.
 *
 * Every failure is put in plain words, with what to try.
 */
import net from "node:net";
import tls from "node:tls";

export interface TlsChoice {
  /** The household's certificate authority, PEM. Null: the authorities this computer trusts. */
  ca?: string | null;
  /** False only to look at a broker's certificate without sending anything (Find). */
  verify?: boolean;
}

/** A socket, and the event that says it is ready for the first packet. */
export function openSocket(
  host: string,
  port: number,
  choice: TlsChoice | null,
): { socket: net.Socket; ready: "connect" | "secureConnect" } {
  if (!choice) return { socket: net.connect({ host, port }), ready: "connect" };
  const socket = tls.connect({
    host,
    port,
    // A name is checked against the certificate; an address is checked against its IP entries (SNI takes names only).
    servername: net.isIP(host) ? undefined : host,
    ca: choice.ca ? [choice.ca] : undefined,
    rejectUnauthorized: choice.verify !== false,
    minVersion: "TLSv1.2",
  });
  return { socket, ready: "secureConnect" };
}

const UNTRUSTED = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_GET_ISSUER_CERT",
]);

/** What went wrong opening the connection, in words, with what to try. */
export function describeSocketError(error: NodeJS.ErrnoException, host: string, port: number, usingTls: boolean): string {
  const code = error.code ?? "";
  if (UNTRUSTED.has(code))
    return "The broker's certificate is not signed by an authority Outpost trusts. Paste the household's CA certificate (the ca.crt Mosquitto's certificate was made with) under TLS.";
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID")
    return `The broker's certificate is not made out to ${host}. Use the name or address it was made for, or make one that includes ${host}.`;
  if (code === "CERT_HAS_EXPIRED") return "The broker's certificate has expired. Make a new one for Mosquitto.";
  if (code === "CERT_NOT_YET_VALID") return "The broker's certificate is not valid yet: check the clock on both computers.";
  if (usingTls && (code.startsWith("ERR_SSL") || /wrong version number|packet length too long|unknown protocol/i.test(error.message)))
    return `Nothing on ${host}:${port} speaks TLS. Mosquitto's TLS listener is usually on port 8883; 1883 is the plain one.`;
  switch (code) {
    case "ECONNREFUSED":
      return `Nothing is accepting connections at ${host}:${port}.`;
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `The broker's address, ${host}, could not be found.`;
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return `${host} cannot be reached from this computer.`;
    case "ETIMEDOUT":
      return "The broker did not answer in time.";
    case "ECONNRESET":
      return usingTls
        ? "The broker closed the connection during the TLS greeting."
        : "The broker closed the connection. If its port uses TLS, turn TLS on here.";
    default:
      return `The connection to the broker failed: ${error.message}`;
  }
}
