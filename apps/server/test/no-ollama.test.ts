/**
 * The guard that keeps every test off a real Ollama (no-ollama.ts) is itself tested here:
 * a connection to the port Ollama listens on is refused whether or not anything is there,
 * and is written down so that the test which tried it fails.
 */
import http from "node:http";
import { expect, it } from "vitest";
import { takeOllamaAttempts } from "./no-ollama.ts";

it("refuses a connection to the port a real Ollama listens on, and remembers that it was tried", async () => {
  await expect(fetch("http://127.0.0.1:11434/api/version")).rejects.toThrow();
  const refused = await new Promise<NodeJS.ErrnoException>((resolve) => {
    http.get("http://localhost:11434/v1/models", () => resolve(new Error("answered"))).on("error", resolve);
  });
  expect(refused.code).toBe("ECONNREFUSED");
  // Taken here, so that this one test does not fail for having tried; any other test that tried would.
  expect(takeOllamaAttempts()).toEqual(["127.0.0.1:11434", "localhost:11434"]);
});

it("leaves every other address alone", async () => {
  const server = http.createServer((_request, response) => response.end("ok"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe("ok");
  await new Promise((resolve) => server.close(resolve));
  expect(takeOllamaAttempts()).toEqual([]);
});
