/**
 * The household PIN: an optional lock on changing and deleting (docs/security.md).
 *
 * With no PIN, nothing here does anything and every device may change everything, as
 * before. With one, every device still reads; a request that would change something
 * (any method but GET, HEAD and OPTIONS, under /api/) is refused with `locked` unless it
 * comes from a device unlocked with the PIN, or is one of the few in READ_BY_POST.
 *
 * This is one check for every route, by method, held in one hook after the request guard
 * (core/guard.ts), so that a route added later is covered without a line of its own. It
 * is not a substitute for the guard's checks: those still apply to every device, unlocked
 * or not. The places that ask for this computer (`core/local.ts`, `core/setting-right.ts`)
 * ask as well, not instead. `/mcp` reads only, and `/dav/` changes nothing, so reading
 * stays open there too.
 */
import type { AccessResponse } from "@outpost/shared";
import { PIN_PATTERN } from "@outpost/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { limitKey } from "../../core/address-key.ts";
import type { AppContext } from "../../core/context.ts";
import { AppError, badRequest } from "../../core/errors.ts";
import { type AccessService, createAccessService, createAttemptLimit, DEVICE_COOKIE, DEVICE_DAYS } from "./service.ts";

export type { AccessService } from "./service.ts";

declare module "../../core/context.ts" {
  interface Services {
    access: AccessService;
  }
}

/**
 * The requests a device that is not unlocked may still make although they are not GETs:
 * unlocking and locking, questions asked by POST because they carry a body (they work
 * something out and keep nothing), and the notes a screen makes that it was opened.
 * Anything added here must change nothing a person would miss.
 */
export const READ_BY_POST = new Set<string>([
  "/api/access/unlock",
  "/api/access/lock",
  "/api/answers",
  "/api/retrieval/context",
  "/api/retrieval/explain",
  "/api/retrieval/passages",
  "/api/retrieval/projection",
  "/api/maps/estimate",
  "/api/maps/imagery/estimate",
  "/api/reference/estimate",
  "/api/maps/route-search/preview",
  "/api/radio/propagation/predict",
  "/api/radio/propagation/listing",
  "/api/radio/propagation/compare",
  "/api/radio/propagation/second-model/compare",
  "/api/radio/observations/compare",
  "/api/manage/plan",
  "/api/portable/plan",
  "/api/learning/visits",
  "/api/emergency-plans/:id/opened",
  "/api/household-binder/made",
]);

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const pin = z.string().regex(PIN_PATTERN, "A PIN is 4 to 12 digits.");
const setBody = z.object({ pin, current: z.string().max(64).optional() }).strict();
const unlockBody = z.object({ pin: z.string().max(64) }).strict();
const removeBody = z.object({ current: z.string().max(64) }).strict();

export const LOCKED_MESSAGE =
  "This device can read but not change anything: changing and deleting need the household PIN. Enter it to unlock this device.";

function cookieOf(request: FastifyRequest): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === DEVICE_COOKIE) return part.slice(at + 1).trim() || undefined;
  }
  return undefined;
}

function setCookie(request: FastifyRequest, reply: FastifyReply, token: string | null): void {
  const secure = request.protocol === "https" ? "; Secure" : "";
  const value = token ?? "";
  const age = token ? DEVICE_DAYS * 24 * 60 * 60 : 0;
  reply.header("Set-Cookie", `${DEVICE_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`);
}

export async function registerAccess(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const access = createAccessService(ctx);
  ctx.services.access = access;
  const attempts = createAttemptLimit();

  // ── The one check, for every route ──

  app.addHook("onRequest", async (request) => {
    if (READ_METHODS.has(request.method)) return;
    // As the request guard does: from the route that will handle it, so "/%61pi/…" is "/api/…".
    const route = request.routeOptions?.url;
    let pathname = request.url.split("?")[0] ?? "";
    try {
      pathname = decodeURIComponent(pathname);
    } catch {
      // The router will reject it.
    }
    if (!(route ? route.startsWith("/api/") : pathname.startsWith("/api/"))) return;
    if (route && READ_BY_POST.has(route)) return;
    if (!access.pinOn()) return;
    if (access.deviceOf(cookieOf(request))) return;
    throw new AppError("locked", LOCKED_MESSAGE);
  });

  /** Checks a PIN typed on this device, counting wrong ones by address. */
  async function checked(request: FastifyRequest, reply: FastifyReply, candidate: string): Promise<void> {
    const key = limitKey(request.socket.remoteAddress ?? "");
    const wait = attempts.wait(key);
    if (wait > 0) {
      reply.header("Retry-After", String(wait));
      throw new AppError(
        "too_many",
        `Too many wrong PINs from this device. Try again in ${wait < 90 ? `${wait} seconds` : `${Math.ceil(wait / 60)} minutes`}.`,
        { retryAfter: wait },
      );
    }
    if (!(await access.check(candidate))) {
      attempts.failed(key);
      throw new AppError("forbidden", "That is not the household PIN.", { wrongPin: true });
    }
  }

  const answer = (request: FastifyRequest, token?: string | null): AccessResponse => ({
    access: access.state(token === undefined ? cookieOf(request) : (token ?? undefined)),
  });

  // ── Routes ──

  app.get("/api/access", async (request) => answer(request));

  app.post("/api/access/unlock", async (request, reply) => {
    const body = unlockBody.parse(request.body ?? {});
    if (!access.pinOn()) return answer(request);
    await checked(request, reply, body.pin);
    // A device unlocked again gets a new token; the old one goes.
    access.lock(cookieOf(request));
    const token = access.unlock();
    setCookie(request, reply, token);
    return answer(request, token);
  });

  app.post("/api/access/lock", async (request, reply) => {
    access.lock(cookieOf(request));
    setCookie(request, reply, null);
    return answer(request, null);
  });

  /** Sets a PIN where there is none, or changes it on an unlocked device that knows the one in use. */
  app.post("/api/access/pin", async (request, reply) => {
    const body = setBody.parse(request.body ?? {});
    if (access.pinOn()) {
      if (body.current === undefined) throw badRequest("Enter the PIN in use now to change it.");
      await checked(request, reply, body.current);
    }
    await access.setPin(body.pin);
    // Every other device is locked by a new PIN; this one, whose person has just typed it, is not.
    const token = access.unlock();
    setCookie(request, reply, token);
    ctx.log.info("The household PIN was set; every other device is locked until it is entered there.");
    return answer(request, token);
  });

  app.post("/api/access/remove", async (request, reply) => {
    const body = removeBody.parse(request.body ?? {});
    if (!access.pinOn()) return answer(request);
    await checked(request, reply, body.current);
    access.removePin();
    setCookie(request, reply, null);
    ctx.log.info("The household PIN was removed; every device may change things again.");
    return answer(request, null);
  });

  app.post("/api/access/lock-others", async (request) => {
    const locked = access.lockOthers(cookieOf(request));
    return { ...answer(request), locked };
  });
}
