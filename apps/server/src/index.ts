import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const { app } = await buildApp(config);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info(`${signal} received, shutting down`);
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}

await app.listen({ host: config.host, port: config.port });

const shown = config.host === "0.0.0.0" || config.host === "::" ? "localhost" : config.host;
app.log.info(`Outpost is ready at http://${shown}:${config.port}`);
if (config.lanAccess) app.log.info("LAN access is on: other devices on your network can reach this server.");
