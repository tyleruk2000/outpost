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
 * The authority's private key never leaves `tls/` in the data directory. The only
 * thing served from that folder is the authority's public certificate.
 */
import type { HttpsAuthorityRight, HttpsStatus } from "@outpost/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { forbidden, notFound } from "../../core/errors.ts";
import { isLocalRequest } from "../../core/local.ts";
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

  const status = (request: FastifyRequest): HttpsStatus => ({ ...service.status(), authorityRight: authorityRight(request) });

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
    if (format === "pem") {
      return reply
        .header("Content-Type", "application/x-pem-file")
        .header("Content-Disposition", 'attachment; filename="outpost-authority.pem"')
        .send(certificate.pem);
    }
    return reply.header("Content-Type", "application/x-x509-ca-cert").send(certificate.der);
  });

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
}
