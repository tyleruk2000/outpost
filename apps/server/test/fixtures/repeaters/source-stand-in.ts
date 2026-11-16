/**
 * A stand-in for a publisher of repeater lists, for the tests and the end-to-end suite.
 * It answers under `/repeater-lists/` with made-up stations in real layouts, and with
 * the ways a real publisher's server can let a fetch down: busy, refusing, a web page
 * in place of the file, a file that never finishes, one too large to read, a redirect
 * to somewhere else. No test asks a real publisher for anything.
 */
import fs from "node:fs";
import type http from "node:http";
import path from "node:path";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, name), "utf8");

export interface RepeaterSourceStandIn {
  handle(request: http.IncomingMessage, response: http.ServerResponse): void;
  /** Every request made of it: the path, and how the client named itself. */
  requests: Array<{ path: string; userAgent: string; cookie: string | undefined }>;
  /** What `/repeater-lists/north.csv` answers with next; reset by setting it back. */
  north: string;
}

export function createRepeaterSourceStandIn(options: { elsewhere?: string } = {}): RepeaterSourceStandIn {
  const standIn: RepeaterSourceStandIn = {
    requests: [],
    north: fixture("etcc-status.csv"),
    handle(request, response) {
      const url = new URL(request.url ?? "/", "http://stand-in");
      standIn.requests.push({ path: url.pathname, userAgent: String(request.headers["user-agent"] ?? ""), cookie: request.headers.cookie });
      const send = (status: number, type: string, body: string, headers: Record<string, string> = {}) => {
        response.writeHead(status, { "content-type": type, ...headers });
        response.end(body);
      };
      switch (url.pathname) {
        case "/repeater-lists/north.csv":
          return send(200, "text/csv", standIn.north, { "last-modified": "Thu, 01 Oct 2026 09:00:00 GMT" });
        case "/repeater-lists/world.json":
          return send(200, "application/json", fixture("hearham.json"));
        case "/repeater-lists/busy":
          return send(503, "text/plain", "busy", { "retry-after": "120" });
        case "/repeater-lists/refused":
          return send(403, "text/html", "403 - Forbidden | Access to this page is forbidden.");
        case "/repeater-lists/gone":
          return send(404, "text/plain", "not here");
        case "/repeater-lists/browser-check":
          // What a site behind a browser check sends a program: a page, with the status of success.
          return send(
            200,
            "text/html; charset=UTF-8",
            "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body></body></html>",
          );
        case "/repeater-lists/page-as-text":
          return send(200, "text/plain", "<!doctype html><html><body>Please sign in</body></html>");
        case "/repeater-lists/not-a-list":
          return send(200, "text/plain", "Nothing to see here.\nTry again tomorrow.\n");
        case "/repeater-lists/empty":
          return send(200, "text/csv", "");
        case "/repeater-lists/elsewhere":
          response.writeHead(302, { location: options.elsewhere ?? "http://localhost:1/repeater-lists/north.csv" });
          return response.end();
        case "/repeater-lists/huge": {
          response.writeHead(200, { "content-type": "text/csv" });
          const line = `${"QZ0AAA,145.000000,".repeat(200)}\n`;
          let sent = 0;
          const more = () => {
            while (sent < 40 * 1024 * 1024) {
              sent += line.length;
              if (!response.write(line)) return void response.once("drain", more);
            }
            response.end();
          };
          response.on("error", () => undefined);
          return more();
        }
        case "/repeater-lists/slow":
          // The headings arrive and the rest never does.
          response.writeHead(200, { "content-type": "text/csv" });
          response.write('"callsign","TX MHz","RX MHz",\n');
          return;
        default:
          return send(404, "text/plain", "no such list");
      }
    },
  };
  return standIn;
}
