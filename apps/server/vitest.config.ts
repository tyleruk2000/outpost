import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    // No test may reach a real Ollama on this machine: connections to its port are refused, and fail the test.
    setupFiles: ["./test/no-ollama.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    pool: "forks",
    // The server under test runs in these processes and starts worker threads from TypeScript
    // files. See src/core/v8-flags.ts for the engine fault this steers round; index.ts sets the
    // same thing for a real server, and the tests do not start from index.ts.
    execArgv: ["--wasm-wrapper-tiering-budget=1000000000"],
  },
});
