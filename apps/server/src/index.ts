// First, before any other module is loaded: see the file for why.
import "./core/v8-flags.ts";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { closeThenExit } from "./core/stop.ts";

const config = loadConfig();
const { app } = await buildApp(config);

// Asked once, the server stops in order and exits (core/stop.ts). Asked again while it is
// doing so, the listener is gone and the signal ends the process at once.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info(`${signal} received, shutting down`);
    closeThenExit(app, 0);
  });
}

// From a portable drive the usual port may be taken by something on the host computer;
// try the next few rather than failing on a machine nobody can reconfigure.
let port = config.port;
for (let attempt = 0; ; attempt += 1) {
  try {
    await app.listen({ host: config.host, port });
    break;
  } catch (error) {
    if (!config.portable || (error as NodeJS.ErrnoException).code !== "EADDRINUSE" || attempt >= 20) throw error;
    port += 1;
  }
}

const shown = config.host === "0.0.0.0" || config.host === "::" ? "localhost" : config.host;
const address = `http://${shown}:${port}`;
app.log.info(`Outpost is ready at ${address}`);
if (config.portable) console.log(`\n  Outpost is ready: ${address}\n`);

if (process.env.OUTPOST_OPEN_BROWSER === "true") {
  const { spawn } = await import("node:child_process");
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [address]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", address]]
        : ["xdg-open", [address]];
  // Best effort: a machine without a desktop simply does not open a browser.
  spawn(command as string, args as string[], { stdio: "ignore", detached: true })
    .on("error", () => {})
    .unref();
}
if (config.lanAccess) app.log.info("LAN access is on: other devices on your network can reach this server.");
