/**
 * Sign-in, sessions and the request-level security rules.
 *
 * Two modes:
 *  - Sign-in off (the default on localhost): every request is the local administrator.
 *  - Sign-in on (the default when LAN access is enabled): a session cookie is required
 *    for everything under /api except the few routes needed to sign in.
 *
 * In both modes every state-changing request must carry the `X-Outpost-Request` header
 * and come from the same origin. A web page on another site can make a browser send a
 * request to http://localhost:8080, but it cannot add that header without a CORS
 * preflight, which Outpost never approves.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import fastifyCookie from "@fastify/cookie";
import { eq, lt, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../core/context.ts";
import { AppError, forbidden } from "../../core/errors.ts";
import { newId, randomToken, sha256Hex } from "../../core/ids.ts";
import { sessions, users } from "../../db/schema.ts";
import { hashPassword, verifyPassword } from "./passwords.ts";

export interface Principal {
  id: string;
  username: string;
  role: "admin" | "member";
  /** Session identifier, absent for the implicit local administrator. */
  sessionId?: string;
}

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export interface AuthService {
  requireUser(request: FastifyRequest): Principal;
  requireAdmin(request: FastifyRequest): Principal;
  /** Short-lived capability used in reference-content URLs, where cookies are not sent. */
  contentToken(principal: Principal): string;
  verifyContentToken(token: string): boolean;
  setupToken: string | undefined;
}

declare module "../../core/context.ts" {
  interface Services {
    auth: AuthService;
  }
}

const COOKIE = "outpost_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CONTENT_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const LOCAL_ADMIN: Principal = { id: "local", username: "local", role: "admin" };
const OPEN_CONTENT_TOKEN = "open";

const credentials = z.object({
  username: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[\p{L}\p{N}._-]+$/u, "Use letters, numbers, dots, dashes or underscores."),
  password: z.string().min(10, "Use at least 10 characters.").max(256),
});

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function hostnameOf(header: string | undefined): string {
  if (!header) return "";
  const value = header.trim().toLowerCase();
  if (value.startsWith("[")) return value.slice(1, value.indexOf("]"));
  return value.split(":")[0] ?? "";
}

/**
 * Whether a Host header names this server. Rejecting unknown hosts defeats DNS
 * rebinding, where a hostile site re-points its own name at 127.0.0.1.
 */
export function isAllowedHost(host: string, options: { lanAccess: boolean; allowedHosts: string[] }): boolean {
  if (localHosts.has(host) || options.allowedHosts.includes(host)) return true;
  if (!options.lanAccess) return false;
  // On a LAN the server is reached by address or by a local name; neither can be rebound
  // by a public DNS zone.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return true;
  return !host.includes(".") || /\.(local|lan|home|internal|home\.arpa)$/.test(host);
}

function loadSecret(dataDir: string): Buffer {
  const file = path.join(dataDir, "secret.key");
  try {
    return fs.readFileSync(file);
  } catch {
    fs.mkdirSync(dataDir, { recursive: true });
    const secret = Buffer.from(randomToken(48));
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

export async function registerAuth(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { config, db } = ctx;
  const secret = loadSecret(config.dataDir);
  await app.register(fastifyCookie);

  const userCount = () => db.select({ n: sql<number>`count(*)` }).from(users).get()?.n ?? 0;

  // With LAN access on, the first-run form is reachable by anyone on the network, so
  // creating the first administrator also needs a token only the installer can read.
  let setupToken: string | undefined;
  if (config.authRequired && userCount() === 0 && config.lanAccess) {
    setupToken = randomToken(9);
    ctx.log.warn(`First-run setup token: ${setupToken} (needed to create the administrator account)`);
  }

  const sign = (value: string) => createHmac("sha256", secret).update(value).digest("base64url");

  const service: AuthService = {
    requireUser(request) {
      if (!request.principal) throw new AppError("unauthenticated", "Sign in to continue.");
      return request.principal;
    },
    requireAdmin(request) {
      const principal = service.requireUser(request);
      if (principal.role !== "admin") throw forbidden("Only an administrator can do that.");
      return principal;
    },
    contentToken(principal) {
      if (!config.authRequired) return OPEN_CONTENT_TOKEN;
      const expires = (Date.now() + CONTENT_TOKEN_TTL_MS).toString(36);
      const body = `${principal.id}.${expires}`;
      return `${body}.${sign(body)}`;
    },
    verifyContentToken(token) {
      if (!config.authRequired) return token === OPEN_CONTENT_TOKEN;
      const [id, expires, signature] = token.split(".");
      if (!id || !expires || !signature) return false;
      const expected = Buffer.from(sign(`${id}.${expires}`));
      const given = Buffer.from(signature);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
      return Number.parseInt(expires, 36) > Date.now();
    },
    get setupToken() {
      return setupToken;
    },
  };
  ctx.services.auth = service;

  function principalFor(request: FastifyRequest): Principal | undefined {
    if (!config.authRequired) return LOCAL_ADMIN;
    const token = request.cookies[COOKIE];
    if (!token) return undefined;
    const sessionId = sha256Hex(token);
    const row = db
      .select({ id: users.id, username: users.username, role: users.role, expiresAt: sessions.expiresAt })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.id, sessionId))
      .get();
    if (!row || row.expiresAt < Date.now()) return undefined;
    return { id: row.id, username: row.username, role: row.role, sessionId };
  }

  const publicApi = new Set(["/api/health", "/api/auth/session", "/api/auth/login", "/api/auth/setup"]);

  app.addHook("onRequest", async (request, reply) => {
    const pathname = request.url.split("?")[0] ?? "";

    if (!isAllowedHost(hostnameOf(request.headers.host), config)) {
      throw new AppError(
        "forbidden",
        "This address is not one Outpost answers to. Add it to OUTPOST_ALLOWED_HOSTS to use it.",
      );
    }

    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    reply.header("X-Frame-Options", "SAMEORIGIN");

    if (!pathname.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");

    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (request.headers["x-outpost-request"] !== "1") {
        throw forbidden("This request did not come from the Outpost app.");
      }
      const site = request.headers["sec-fetch-site"];
      if (site && site !== "same-origin" && site !== "none") {
        throw forbidden("Requests from other sites are not accepted.");
      }
      const origin = request.headers.origin;
      if (origin && hostnameOf(new URL(origin).host) !== hostnameOf(request.headers.host)) {
        throw forbidden("Requests from other sites are not accepted.");
      }
    }

    request.principal = principalFor(request);
    if (!request.principal && !publicApi.has(pathname)) {
      throw new AppError("unauthenticated", "Sign in to continue.");
    }
  });

  // ── Sign-in attempts are slowed down per address after repeated failures ──
  const failures = new Map<string, { count: number; blockedUntil: number }>();
  function throttle(ip: string): void {
    const entry = failures.get(ip);
    if (entry && entry.blockedUntil > Date.now()) {
      const seconds = Math.ceil((entry.blockedUntil - Date.now()) / 1000);
      throw new AppError("forbidden", `Too many attempts. Try again in ${seconds} seconds.`);
    }
  }
  function recordFailure(ip: string): void {
    const entry = failures.get(ip) ?? { count: 0, blockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= 5) entry.blockedUntil = Date.now() + Math.min(2 ** (entry.count - 5) * 5_000, 15 * 60_000);
    failures.set(ip, entry);
  }

  function startSession(userId: string, request: FastifyRequest, reply: import("fastify").FastifyReply): void {
    const token = randomToken();
    const now = Date.now();
    db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
    db.insert(sessions)
      .values({
        id: sha256Hex(token),
        userId,
        createdAt: now,
        expiresAt: now + SESSION_TTL_MS,
        userAgent: request.headers["user-agent"]?.slice(0, 200),
      })
      .run();
    db.update(users).set({ lastLoginAt: now }).where(eq(users.id, userId)).run();
    reply.setCookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: config.secureCookies,
      maxAge: SESSION_TTL_MS / 1000,
    });
  }

  app.get("/api/auth/session", async (request) => ({
    authRequired: config.authRequired,
    setupRequired: config.authRequired && userCount() === 0,
    setupTokenRequired: Boolean(setupToken),
    lanAccess: config.lanAccess,
    user: request.principal
      ? { id: request.principal.id, username: request.principal.username, role: request.principal.role }
      : null,
  }));

  app.post("/api/auth/setup", async (request, reply) => {
    if (!config.authRequired) throw new AppError("conflict", "Sign-in is turned off for this installation.");
    if (userCount() > 0) throw new AppError("conflict", "An administrator account already exists.");
    const body = credentials.extend({ setupToken: z.string().optional() }).parse(request.body);
    if (setupToken && body.setupToken !== setupToken) {
      throw forbidden("That setup token is not correct. It is printed in the server log.");
    }
    const id = newId();
    db.insert(users)
      .values({
        id,
        username: body.username,
        passwordHash: await hashPassword(body.password),
        role: "admin",
        createdAt: Date.now(),
      })
      .run();
    setupToken = undefined;
    startSession(id, request, reply);
    return { user: { id, username: body.username, role: "admin" as const } };
  });

  app.post("/api/auth/login", async (request, reply) => {
    throttle(request.ip);
    const body = z.object({ username: z.string().max(64), password: z.string().max(256) }).parse(request.body);
    const user = db.select().from(users).where(eq(users.username, body.username.trim())).get();
    // Hash even when the user does not exist so timing does not reveal which names are real.
    const ok = user
      ? await verifyPassword(body.password, user.passwordHash)
      : (await hashPassword(body.password), false);
    if (!user || !ok) {
      recordFailure(request.ip);
      throw new AppError("unauthenticated", "That username or password is not correct.");
    }
    failures.delete(request.ip);
    startSession(user.id, request, reply);
    return { user: { id: user.id, username: user.username, role: user.role } };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    if (request.principal?.sessionId) {
      db.delete(sessions).where(eq(sessions.id, request.principal.sessionId)).run();
    }
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/users", async (request) => {
    service.requireAdmin(request);
    return {
      users: db
        .select({ id: users.id, username: users.username, role: users.role, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
        .from(users)
        .all(),
    };
  });

  app.post("/api/users", async (request) => {
    service.requireAdmin(request);
    const body = credentials.extend({ role: z.enum(["admin", "member"]) }).parse(request.body);
    if (db.select().from(users).where(eq(users.username, body.username)).get()) {
      throw new AppError("conflict", "That username is already taken.");
    }
    const id = newId();
    db.insert(users)
      .values({ id, username: body.username, passwordHash: await hashPassword(body.password), role: body.role, createdAt: Date.now() })
      .run();
    return { user: { id, username: body.username, role: body.role } };
  });

  app.post<{ Params: { id: string } }>("/api/users/:id/password", async (request) => {
    const principal = service.requireUser(request);
    if (principal.id !== request.params.id) service.requireAdmin(request);
    const body = z.object({ password: credentials.shape.password }).parse(request.body);
    const result = db
      .update(users)
      .set({ passwordHash: await hashPassword(body.password) })
      .where(eq(users.id, request.params.id))
      .run();
    if (result.changes === 0) throw new AppError("not_found", "User was not found.");
    // Signing out other devices is the point of changing a password.
    db.delete(sessions).where(eq(sessions.userId, request.params.id)).run();
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/users/:id", async (request) => {
    const principal = service.requireAdmin(request);
    if (principal.id === request.params.id) throw new AppError("conflict", "You cannot delete your own account.");
    const target = db.select().from(users).where(eq(users.id, request.params.id)).get();
    if (!target) throw new AppError("not_found", "User was not found.");
    if (target.role === "admin") {
      const admins = db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.role, "admin")).get()?.n ?? 0;
      if (admins <= 1) throw new AppError("conflict", "Keep at least one administrator.");
    }
    db.delete(users).where(eq(users.id, request.params.id)).run();
    return { ok: true };
  });
}
