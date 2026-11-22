/**
 * A port nothing is listening on at this moment, from the system (listen on port 0, read
 * back the port it gave, let it go). For a setting that must name a port before anything
 * listens on it, such as the mesh broker's: a fixed number clashes when two runs of the
 * suite, or two test files, share the machine.
 */
import net from "node:net";

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}
