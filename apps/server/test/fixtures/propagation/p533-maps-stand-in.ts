/**
 * Stand-ins for the ITU's P.533 maps, for the end-to-end suite: three small files under
 * the ITU's names, made up here and nothing like the real ones, and the list of them in
 * the shape Outpost's manifest gives (OUTPOST_P533_MAPS_MANIFEST). They let the download
 * be followed from the planner to "Manage and clean up" without the internet and
 * without 137 MB. The engine is never run on them.
 */
import { createHash } from "node:crypto";
import type http from "node:http";

const NAMES = ["ionos11.bin", "COEFF11W.txt", "P1239-3 Decile Factors.txt"];

export const P533_STAND_IN_FILES = new Map(
  NAMES.map((name, index) => [`P372/Data/${name}`, Buffer.from(`Stand-in ${index} for ${name}; not the ITU's data.\n`.repeat(40 + index))]),
);

export function p533StandInManifest(baseUrl: string) {
  let offset = 0;
  const whole = createHash("sha256");
  const files = [...P533_STAND_IN_FILES].map(([path, bytes]) => {
    const entry = {
      name: path.split("/").pop()!,
      path,
      offset,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    offset += bytes.length;
    whole.update(bytes);
    return entry;
  });
  return { baseUrl, bytes: offset, sha256: whole.digest("hex"), files };
}

/** Answers GET /p533/<path in the ITU's repository>. */
export function serveP533StandIn(request: http.IncomingMessage, response: http.ServerResponse): void {
  const path = decodeURIComponent((request.url ?? "").replace(/^\/p533\//, ""));
  const body = P533_STAND_IN_FILES.get(path);
  if (!body) {
    response.statusCode = 404;
    response.end();
    return;
  }
  response.setHeader("Content-Length", body.length);
  response.end(body);
}
