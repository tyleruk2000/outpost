/**
 * Uploads: the parser is registered in one place with one fixed limit, and every route
 * that takes a file says how large a file it takes. So the order the modules are
 * registered in cannot change what any route accepts.
 *
 * Before this, eight modules each registered the parser "unless it was there already",
 * with three different limits between them: whichever came first in `modules/index.ts`
 * set the limit for any route that gave none of its own.
 */
import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { DEFAULT_UPLOAD_FILE_BYTES, registerMultipart } from "../src/core/multipart.ts";
import { multipart } from "./fixtures/documents/builders.ts";

/** A module as the real ones are: it asks for the parser, and has a route with a limit of its own. */
const moduleTaking = (name: string, fileSize: number) => async (app: FastifyInstance) => {
  await registerMultipart(app);
  app.post(`/${name}`, async (request) => {
    let bytes = 0;
    for await (const part of request.parts({ limits: { fileSize, files: 1 } })) {
      if (part.type === "file") bytes += (await part.toBuffer()).length;
    }
    return { bytes };
  });
};
/** And one that forgot to say what it takes. */
const forgetful = async (app: FastifyInstance) => {
  await registerMultipart(app);
  app.post("/forgetful", async (request) => {
    let bytes = 0;
    for await (const part of request.parts()) if (part.type === "file") bytes += (await part.toBuffer()).length;
    return { bytes };
  });
};

async function sent(app: FastifyInstance, url: string, size: number): Promise<number> {
  const { payload, headers } = multipart({}, [{ name: "file.bin", content: Buffer.alloc(size, "a") }]);
  return (await app.inject({ method: "POST", url, payload, headers })).statusCode;
}

describe("the multipart parser", () => {
  it("gives every route the same limits whatever order the modules are registered in", async () => {
    const small = moduleTaking("small", 10_000);
    const large = moduleTaking("large", 3 * DEFAULT_UPLOAD_FILE_BYTES);
    const answers: string[] = [];
    for (const order of [
      [small, large, forgetful],
      [large, forgetful, small],
      [forgetful, small, large],
    ]) {
      const app = Fastify({ bodyLimit: 20 * 1024 * 1024 });
      for (const register of order) await register(app);
      await app.ready();
      const tried: number[] = [];
      for (const [url, size] of [
        ["/small", 9_000],
        ["/small", 11_000],
        ["/large", 2 * DEFAULT_UPLOAD_FILE_BYTES],
        ["/large", 3 * DEFAULT_UPLOAD_FILE_BYTES + 1],
        // A route with no limit of its own is held to the parser's, which is the same whoever registered it.
        ["/forgetful", DEFAULT_UPLOAD_FILE_BYTES - 1000],
        ["/forgetful", DEFAULT_UPLOAD_FILE_BYTES + 1000],
      ] as const) {
        tried.push(await sent(app, url, size));
      }
      answers.push(tried.join(" "));
      await app.close();
    }
    expect(answers).toEqual(Array(3).fill("200 413 200 413 200 413"));
  });

  it("is registered by the core alone, and every route that reads an upload gives its own file size", () => {
    const root = path.join(import.meta.dirname, "../src");
    const files = (fs.readdirSync(root, { recursive: true }) as string[]).filter((name) => name.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(200);
    const registering: string[] = [];
    const unlimited: string[] = [];
    let readers = 0;
    for (const name of files) {
      const text = fs.readFileSync(path.join(root, name), "utf8");
      // The one file that may name the parser; its own words about the routes are not routes.
      if (name === path.join("core", "multipart.ts")) continue;
      if (text.includes("@fastify/multipart")) registering.push(name);
      // A call that reads an upload, and the few lines after it, where its options are written.
      for (const match of text.matchAll(/request\.(?:parts|file|files|saveRequestFiles)\(/g)) {
        readers += 1;
        const call = text.slice(match.index, match.index + 400);
        if (!/limits:\s*\{[^}]*\bfileSize\b/.test(call)) unlimited.push(`${name}: ${call.split("\n")[0]}`);
      }
    }
    expect(registering).toEqual([]);
    expect(unlimited).toEqual([]);
    // The modules that take a file: if this falls, the search above has stopped finding them.
    expect(readers).toBeGreaterThanOrEqual(8);
  });
});
