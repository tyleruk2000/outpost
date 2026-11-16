/**
 * HTTPS on the home network.
 *
 * Browsers allow location, service workers, the screen wake lock and installing to the
 * Home Screen only on a secure address: `https`, or the computer itself. A phone
 * reaching Outpost at `http://192.168.1.20:8080` gets none of them. This module gives
 * the owner a secure address without a domain name or the internet: Outpost makes its
 * own certificate authority, signs a certificate for the addresses it is reached by,
 * and serves the app a second time over HTTPS on a port of its own. Each device is
 * then told, once and by hand, to trust that authority.
 *
 * Who may do what, with no accounts: turning HTTPS on or off and naming another address
 * are ordinary settings. Replacing or deleting the authority breaks HTTPS on every
 * device that trusted it, so those two are accepted only from the computer Outpost runs
 * on, on the same terms as "erase everything" (`core/local.ts`).
 *
 * A person who already has a certificate for this server can have the listener use
 * that instead (`own.ts`). Its key is a secret, and most requests reach Outpost over
 * plain HTTP, where anyone on the network could read an upload. So a key is taken by
 * upload without a question only from the computer Outpost runs on, or over a
 * connection that is already HTTPS. From another device over plain http it is taken only
 * when the request says, in a field of its own, that the person accepts the key
 * crossing the network unencrypted; that is logged, with the address it came from. The
 * folder remains the way in where a key never crosses the network. Choosing which certificate is presented is an ordinary
 * setting. Deleting the person's certificate and key follows the rule for deleting the
 * authority.
 *
 * No private key leaves `tls/` in the data directory. The only things served from that
 * folder are public certificates: the authority's, and the root a person's own
 * certificate chains to when they gave it.
 */
import type { TLSSocket } from "node:tls";
import fastifyMultipart from "@fastify/multipart";
import { type HttpsAuthorityRight, type HttpsKeyRight, type HttpsStatus, PLAIN_HTTP_ACCEPTED_FIELD } from "@outpost/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest, forbidden, notFound } from "../../core/errors.ts";
import { isLocalRequest } from "../../core/local.ts";
import { MOST_FILE_BYTES } from "./own.ts";
import { createHttpsService } from "./service.ts";

/** The start-up option that lets the irreversible actions be asked for from any device. */
const REMOTE_OPTION = "OUTPOST_ALLOW_REMOTE_ERASE";

export async function registerHttps(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const service = createHttpsService(app, ctx);
  ctx.services.https = service;

  /** Whether this request may replace or delete the certificate authority. */
  function authorityRight(request: FastifyRequest): HttpsAuthorityRight {
    if (ctx.config.allowRemoteErase) return { allowed: true, reason: "option", option: REMOTE_OPTION };
    const local = isLocalRequest(request.raw, ctx.config);
    return { allowed: local, reason: local ? "local" : "remote", option: REMOTE_OPTION };
  }

  function assertAuthorityRight(request: FastifyRequest): void {
    if (authorityRight(request).allowed) return;
    throw forbidden(
      `Every device that trusts this certificate authority would stop trusting Outpost, so it can only be replaced or deleted at the computer Outpost runs on. Whoever starts Outpost can allow it from every device with ${REMOTE_OPTION}=true.`,
    );
  }

  /**
   * Whether this request may carry a private key without the person's statement that
   * they accept it crossing the network in the clear. Not the start-up option that allows
   * erasing from anywhere: that option is about who may destroy something, and this is
   * about a secret crossing the network unencrypted, which no option makes safe.
   */
  function keyRight(request: FastifyRequest): HttpsKeyRight {
    if (isLocalRequest(request.raw, ctx.config)) return { allowed: true, reason: "local" };
    const overHttps = (request.raw.socket as Partial<TLSSocket>).encrypted === true;
    return { allowed: overHttps, reason: overHttps ? "https" : "remote" };
  }

  const status = (request: FastifyRequest): HttpsStatus => {
    const current = service.status();
    return { ...current, authorityRight: authorityRight(request), own: { ...current.own, keyRight: keyRight(request) } };
  };

  /** A public certificate, as a file for a device (DER) or for a command (PEM). */
  function sendCertificate(reply: FastifyReply, certificate: { pem: string; der: Buffer }, format: "der" | "pem", name: string) {
    if (format === "pem") {
      return reply
        .header("Content-Type", "application/x-pem-file")
        .header("Content-Disposition", `attachment; filename="${name}.pem"`)
        .send(certificate.pem);
    }
    return reply.header("Content-Type", "application/x-x509-ca-cert").send(certificate.der);
  }

  app.get("/api/https", async (request) => status(request));

  /**
   * The authority's public certificate, for a device to install and trust. DER is what
   * every device's installer reads; PEM (`?format=pem`) is for tools such as curl.
   *
   * The DER form is sent the way Apple's own example of handing an iPhone a root
   * certificate sends it: this content type and no Content-Disposition, so that Safari
   * treats it as a certificate to install and not as a file to put away. The address
   * ends in the file's name, which is what other browsers save it as.
   */
  app.get("/api/https/outpost-authority.crt", async (request, reply) => {
    const { format } = z.object({ format: z.enum(["der", "pem"]).default("der") }).parse(request.query);
    const certificate = service.authorityCertificate();
    if (!certificate) throw notFound("The certificate authority (turn HTTPS on in Settings to make one)");
    return sendCertificate(reply, certificate, format, "outpost-authority");
  });

  /** The same certificate as PEM, at an address that says so: what Linux and command-line tools want. */
  app.get("/api/https/outpost-authority.pem", async (_request, reply) => {
    const certificate = service.authorityCertificate();
    if (!certificate) throw notFound("The certificate authority (turn HTTPS on in Settings to make one)");
    return sendCertificate(reply, certificate, "pem", "outpost-authority");
  });

  /**
   * For a certificate the person brought: the certificate their devices have to trust,
   * when it was among the files they gave (their authority's root, or a self-signed
   * certificate itself). Public, like the one above; sent the same two ways.
   */
  const ownRoot = (format: "der" | "pem") => async (_request: FastifyRequest, reply: FastifyReply) => {
    const certificate = service.ownAnchor();
    if (!certificate)
      throw notFound("The root certificate of your own certificate (Outpost holds it only when it was in the files you gave)");
    return sendCertificate(reply, certificate, format, "own-root");
  };
  app.get("/api/https/own-root.crt", ownRoot("der"));
  app.get("/api/https/own-root.pem", ownRoot("pem"));

  app.post("/api/https/authority/replace", async (request) => {
    assertAuthorityRight(request);
    await service.replaceAuthority();
    return status(request);
  });

  app.delete("/api/https/authority", async (request) => {
    assertAuthorityRight(request);
    await service.removeAuthority();
    return status(request);
  });

  // ── A certificate of the person's own ──

  // Another module may have registered the multipart parser already; twice is an error.
  if (!app.hasContentTypeParser("multipart/form-data")) {
    await app.register(fastifyMultipart, { limits: { fileSize: ctx.config.maxUploadBytes } });
  }

  /**
   * A certificate and its key, given in Settings: one to three files (the certificate,
   * the key, the chain; or one file holding all of them, PEM or PKCS#12) and, for
   * PKCS#12, the `password` field. What is in which file does not matter.
   */
  app.post("/api/https/own", async (request) => {
    const right = keyRight(request);
    if (!request.isMultipart()) throw badRequest("Send the certificate and its key as a multipart/form-data upload.");
    const files: Buffer[] = [];
    let password: string | undefined;
    let accepted = false;
    try {
      for await (const part of request.parts({ limits: { fileSize: MOST_FILE_BYTES, files: 3, fields: 3, fieldSize: 1024 } })) {
        if (part.type === "field") {
          if (part.fieldname === "password" && typeof part.value === "string") password = part.value;
          if (part.fieldname === PLAIN_HTTP_ACCEPTED_FIELD) accepted = part.value === "yes";
          continue;
        }
        // Bounded by the size limit above, so reading it whole is safe.
        files.push(await part.toBuffer());
      }
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === "FST_REQ_FILE_TOO_LARGE") throw new AppError("too_large", "One of the files is too large to be a certificate or a key.");
      if (code === "FST_FILES_LIMIT") throw badRequest("Give at most three files: the certificate, its key, and its chain.");
      throw error;
    }
    // Read whole before this is decided, so that the order of the fields does not matter.
    // What is refused is not kept: it goes out of scope here.
    if (!right.allowed && !accepted) {
      throw forbidden(
        `A private key sent from this device crosses your network unencrypted, where anyone on it could copy it, so Outpost takes it only when you say you accept that (the ${PLAIN_HTTP_ACCEPTED_FIELD} field). Better: turn on HTTPS and send it over an address beginning https, or put the two files in ${service.status().own.folder} on the computer Outpost runs on and press “Use them”.`,
      );
    }
    if (files.length === 0) throw badRequest("No file was sent. Choose the certificate and its key.");
    await service.importOwn({ files, password });
    if (!right.allowed) {
      // The address only: never the key, the password or the certificate.
      ctx.log.warn(
        `HTTPS: a private key was accepted over plain http from another device, ${request.raw.socket.remoteAddress ?? "address unknown"}, because the person said they accept that it crossed the network unencrypted.`,
      );
    }
    return status(request);
  });

  /** The two files already in the folder. No key crosses the network, so any device may ask. */
  app.post("/api/https/own/use", async (request) => {
    await service.useOwnFromFolder();
    return status(request);
  });

  app.delete("/api/https/own", async (request) => {
    if (!authorityRight(request).allowed) {
      throw forbidden(
        `Once the certificate and its key are deleted, HTTPS cannot be put back from another device, so they can only be deleted at the computer Outpost runs on. Whoever starts Outpost can allow it from every device with ${REMOTE_OPTION}=true.`,
      );
    }
    await service.removeOwn();
    return status(request);
  });
}
