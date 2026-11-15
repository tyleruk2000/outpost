// Stands in for nodejs.org/dist during end-to-end tests, so that writing a portable
// drive can be exercised without the internet. It serves a checksum list and, for
// every platform, a small archive whose "node" is a stub. The drive written from it is
// complete in shape but is not started by the tests.
import { createHash } from "node:crypto";
import http from "node:http";
import { gzipSync } from "node:zlib";

const port = Number(process.argv[2] ?? 8473);
const version = process.version;

function tar(name, content) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000755\0", 100);
  header.write("0000000\0", 108);
  header.write("0000000\0", 116);
  header.write(`${content.length.toString(8).padStart(11, "0")}\0`, 124);
  header.write("00000000000\0", 136);
  header.write("        ", 148);
  header.write("0", 156);
  header.write("ustar\0", 257);
  header.write("00", 263);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  return Buffer.concat([header, content, Buffer.alloc((512 - (content.length % 512)) % 512), Buffer.alloc(1024)]);
}

const stub = Buffer.from("#!/bin/sh\necho 'stub runtime used by end-to-end tests'\n");
const files = new Map();
for (const platform of ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"]) {
  files.set(`node-${version}-${platform}.tar.gz`, gzipSync(tar(`node-${version}-${platform}/bin/node`, stub)));
}
for (const platform of ["win-x64", "win-arm64"]) files.set(`${platform}/node.exe`, Buffer.from("MZ stub runtime"));
const sums = [...files].map(([name, body]) => `${createHash("sha256").update(body).digest("hex")}  ${name}`).join("\n");

http
  .createServer((request, response) => {
    if (request.url === "/health") return response.end("ok");
    if (request.url === `/${version}/SHASUMS256.txt`) return response.end(`${sums}\n`);
    const body = files.get((request.url ?? "").replace(`/${version}/`, ""));
    if (!body) {
      response.statusCode = 404;
      return response.end();
    }
    response.setHeader("Content-Length", body.length);
    response.end(body);
  })
  .listen(port, "127.0.0.1");
