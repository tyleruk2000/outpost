# Outpost's tools for other programs (MCP)

The tools a model in Chat uses to look things up in Outpost (the library, places on the
map, supplies, emergency plans, the weather as last fetched, radio, the catalogue and,
if you allow it, the message board) can also be used by other programs on the home
network: a desktop assistant, a code editor, anything that speaks the Model Context
Protocol (MCP). Outpost answers them at one address, `/mcp`.

The tools only read. None creates, changes or removes anything, starts a download or
asks anything on the internet; the one request a tool can make is `search_library` sending
its search words to the embedding server search by meaning uses, when one is set up
([ai.md](ai.md#looking-things-up-in-outpost)). Which tools are offered follows the same switches as in
Chat (Settings, "Looking things up in Outpost", "What the tools may read"); notes'
encrypted pages are never read.

This page covers how to switch it on, who can reach it, how to point two programs at it,
exactly which parts of the protocol are answered, and what has not been tried.

**Not tried with a real MCP client or a real model.** Everything below was written from
the protocol's pages and each program's own documentation, and tested with requests
written by hand (`apps/server/test/mcp.test.ts`). Nobody has yet connected Claude Code,
VS Code or any other client to it.

## Switching it on

It is off until it is turned on. In Settings, under "Looking things up in Outpost",
turn on **Let other programs on the home network use these tools**.

That switch can only be changed **at the computer Outpost runs on** (from
`http://localhost:8080`, or from that computer's own network address), unless Outpost
was started with `OUTPOST_ALLOW_REMOTE_SETTINGS=true`. Every other device sees it
greyed out, with the reason and the line to add to `.env`. In a container no request
looks as if it comes from the computer itself, so there the option is the only way. The reason is that it changes who can read what: the rest of Settings is open to
every device on the network, and a switch that lets any program read the household's
supplies and plans should not be turned on from a phone in passing. It is kept in its
own row (`tools.mcp`), not in the ordinary settings; "Put everything back to its
defaults" and "Erase everything" turn it off. The request behind it is
`PUT /api/tools/mcp` with `{"enabled": true}`, refused from any other device.

While it is off, `/mcp` answers every request with `403 Forbidden` and a JSON-RPC error
saying it is switched off and where to switch it on.

## The warning

At the switch, Settings says:

> With this on, any program on your home network that speaks MCP (the Model Context
> Protocol) can ask Outpost these questions, and whatever that program is connected to
> receives the answers: a desktop assistant using a model in the cloud would send your
> household's supplies and plans there.

That is the whole risk in one sentence. Outpost cannot tell what a program does with an
answer. A program that uses a model on your own computer keeps it at home; one that
uses a model in the cloud sends each answer to that company, with whatever is in it:
where your saved places are, what you hold, the people and meeting points written in
your plans. Turn off the areas you would not want to leave the house before you turn
this on.

## The address to give a program

Settings shows the addresses under the switch:

- `http://127.0.0.1:8080/mcp` for a program on the computer Outpost runs on.
- `http://<this computer's address>:8080/mcp` (for example
  `http://192.168.1.20:8080/mcp`) for a program on another computer at home. These are
  listed only when Outpost is shared with the network (`OUTPOST_LAN_ACCESS`), and only
  this computer's private IPv4 addresses.

The port is the one Outpost was started on (`OUTPOST_PORT`, 8080 unless changed). The
address is plain HTTP, like the rest of Outpost on the home network.

## Connecting a program

Written only from each program's own documentation, read on 17 November 2026. **Neither
has been tried against Outpost.**

### Claude Code

From code.claude.com/docs/en/mcp. A remote HTTP server is added with
`claude mcp add --transport http <name> <url>`:

```sh
claude mcp add --transport http outpost http://192.168.1.20:8080/mcp
```

The page lists three scopes, chosen with `-s` or `--scope`: `local` (the default,
"available only to you in the current project", kept in `~/.claude.json`), `project`
("shared with everyone in the project via the `.mcp.json` file", at the project's root)
and `user` ("available to you across all projects", also in `~/.claude.json`). In
`.mcp.json`:

```json
{
  "mcpServers": {
    "outpost": { "type": "http", "url": "http://192.168.1.20:8080/mcp" }
  }
}
```

The page says: "A JSON entry that has a `url` but no `type` is a configuration error".

### VS Code

From code.visualstudio.com/docs/agents/reference/mcp-configuration. A server goes in
`.vscode/mcp.json` in a workspace, or in the `mcp.json` of your user profile:

```json
{
  "servers": {
    "outpost": { "type": "http", "url": "http://192.168.1.20:8080/mcp" }
  }
}
```

The page says these two files are deprecated for new Copilot setups ("For new Copilot
configurations, use these native destinations, not `.vscode/mcp.json` or profile
`mcp.json`"), which use `~/.copilot/mcp-config.json` instead; that file's format is on
the same page. The same can be done without editing a file: run **Chat: Open
Customizations**, select **MCP Servers**, then **Add Server**, and give the address
(the page also names the command **MCP: Add Server**).

## Who may call it

Outpost has **no tokens or accounts**: there is nothing to sign in with, here or
anywhere else in Outpost. The protocol's transport page says "Servers SHOULD implement
proper authentication for all connections"; this one does not, and leans instead on
where a request comes from and on what a web page cannot make a browser send. Every one
of these is checked on every request, before its body is read:

| Rule | Answer when broken |
| --- | --- |
| Switched on (at the computer Outpost runs on, or anywhere with `OUTPOST_ALLOW_REMOTE_SETTINGS`) | 403 |
| The connection comes from loopback (`127.0.0.0/8`, `::1`), a private IPv4 address (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`, `fe80::/10`) or IPv6 unique-local (`fc00::/7`). Anything else, public addresses and the documentation and carrier-grade NAT ranges included, is refused | 403 |
| No forwarding header (`Forwarded`, `X-Forwarded-For`, `X-Real-IP`, `X-Forwarded-Host`): through a proxy, where a request came from cannot be told | 403 |
| The `Host` header names an address Outpost answers to (the request guard, `core/guard.ts`, for every route), which defeats DNS rebinding | 403 |
| An `Origin` header, when sent, is this server's own origin: scheme, host and port (a page on another site sends its own, and so does a page of another program on another port of this computer) | 403 |
| `Sec-Fetch-Site`, when sent, is `same-origin` or `none` | 403 |
| The allowance per address (below) | 429, with `Retry-After` |
| `Content-Type: application/json`. A page on another site can make a browser send `text/plain` without asking first, never `application/json` | 415 |
| The body is at most 256 KB | 413 |

A refusal is a JSON-RPC error with no `id`, as the transport page allows. Every answer
carries `Cache-Control: no-store`.

The rules the protocol sets, as read on its site on 17 November 2026
(modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http):

> Servers MUST validate the Origin header on all incoming connections to prevent DNS
> rebinding attacks. If the Origin header is present and invalid, servers MUST respond
> with HTTP 403 Forbidden.

> When running locally, servers SHOULD bind only to localhost (127.0.0.1) rather than all
> network interfaces (0.0.0.0).

Outpost binds to localhost unless whoever starts it shares it with the network
(`OUTPOST_LAN_ACCESS`), and then `/mcp` is reachable from the network like every other
page. And from the tools page: "Servers MUST: Validate all tool inputs; Implement proper
access controls; Rate limit tool invocations; Sanitize tool outputs". Here: every
call's arguments are checked against the tool's schema before it runs; the area
switches decide which tools exist at all; the allowance below; and what a tool returns
is plain text of at most 3,000 characters with control characters other than line
breaks and tabs removed.

### The allowance

Each address may send a burst of 20 requests, then one more each second (60 a minute).
An IPv6 address counts by its /64: a device can take a new address in its /64 whenever it
likes, and would otherwise start a fresh allowance each time.
Past that, `429 Too Many Requests` with `Retry-After` in seconds. It is worked out from
timestamps when a request comes in: no timer runs, and at most 300 addresses are
remembered (the one heard from least recently is forgotten first). No connection is
held open: every answer is a single JSON body.

## What is implemented

The protocol revision implemented is **2026-07-28**, which the versioning page
(modelcontextprotocol.io/specification/versioning, read 17 November 2026) calls current:
"The current protocol version is 2026-07-28." It is stateless: there is no
`initialize`, and every request carries its version and the client's capabilities in
`params._meta`.

The server is **dual-era**, as that revision's versioning page
(modelcontextprotocol.io/specification/2026-07-28/basic/versioning) describes, so that
programs still on the earlier revisions work too: **2025-11-25**, **2025-06-18** and
**2025-03-26**. In the page's words: "A request carrying modern per-request `_meta` is
served statelessly according to this revision. An `initialize` request selects legacy
semantics". Here:

- A request whose `_meta` has `io.modelcontextprotocol/protocolVersion`, or whose
  `MCP-Protocol-Version` header is `2026-07-28`, is served as 2026-07-28.
- `initialize`, and any other request without that, is served as the earlier revisions.
  No session is kept between requests: every request is answered on its own, which the
  earlier revisions allow (a server MAY leave out `Mcp-Session-Id`).

### Methods

| Method | Answer |
| --- | --- |
| `initialize` (earlier revisions) | `protocolVersion`, `capabilities: {tools: {listChanged: false}}`, `serverInfo: {name: "outpost", title, version}`, `instructions`. The version asked for when it is 2025-11-25, 2025-06-18 or 2025-03-26; otherwise 2025-11-25, the newest of them ("Otherwise, the server MUST respond with another protocol version it supports. This SHOULD be the latest"; 2026-07-28 has no `initialize`) |
| `notifications/initialized`, `notifications/cancelled`, any other notification | `202 Accepted`, no body. A cancel does nothing: each call is answered within its own request, and closing that request's connection stops a tool that is still working |
| `ping` | `{}` |
| `server/discover` | `supportedVersions` (all four), `capabilities: {tools: {}}`, `instructions`, and on 2026-07-28 `resultType` and `_meta["io.modelcontextprotocol/serverInfo"]` |
| `tools/list` | Every tool whose area is switched on, in a fixed order: `name`, `title`, `description`, `inputSchema` (JSON Schema 2020-12, from the tool's own checks) and `annotations` (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false`). No paging: there are fewer than twenty |
| `tools/call` | `content: [{type: "text", text}]` and `isError`. Arguments that do not fit, or a tool that could not answer, come back as `isError: true` with words the model can act on. A tool that does not exist, or whose area is switched off, is the JSON-RPC error `-32602` "Unknown tool: …" |

On 2026-07-28 every result also carries `resultType: "complete"` and
`_meta["io.modelcontextprotocol/serverInfo"]`.

### Errors

| Case | Code | HTTP |
| --- | --- | --- |
| The body is not JSON | `-32700` | 400 |
| Not a JSON-RPC 2.0 message, an `id` of `null`, no method, `params` not an object, or a batch (an array) | `-32600` | 400 |
| An unknown method | `-32601` | 404 on 2026-07-28, 200 on the earlier revisions |
| `tools/call` without a name, an unknown tool, `initialize` without `protocolVersion` | `-32602` | 200 |
| 2026-07-28 without `_meta["io.modelcontextprotocol/protocolVersion"]` or `_meta["io.modelcontextprotocol/clientCapabilities"]` | `-32602` | 400 |
| 2026-07-28 with `MCP-Protocol-Version`, `Mcp-Method` (every request) or `Mcp-Name` (`tools/call`; a `=?base64?…?=` value is decoded first) missing or not matching the body | `-32020` (HeaderMismatch) | 400 |
| A `_meta` version that is not 2026-07-28 | `-32022` "Unsupported protocol version", `data: {supported, requested}` | 400 |
| An earlier-revision request whose `MCP-Protocol-Version` header names none of the earlier revisions (no header is taken as 2025-03-26) | `-32600` | 400 |
| `GET`, `DELETE`, `PUT` or `PATCH` on `/mcp` | `-32600` | 405, `Allow: POST` |

A request carrying an `Mcp-Session-Id` header is answered the same as one without; no
session id is ever given out.

### What is not built

Optional parts of the protocol that Outpost does not answer:

- SSE streams: every answer is one `application/json` body, never `text/event-stream`;
  `GET /mcp` is 405, not a stream.
- Sessions (`Mcp-Session-Id`) and resumable streams (`Last-Event-ID`).
- `subscriptions/listen` and list-changed notifications: switching an area on or off is
  seen at the next `tools/list`.
- Resources and prompts (`resources/*`, `prompts/*`), and logging, completion and
  progress notifications.
- Multi round-trip requests (MRTR) and elicitation; sampling and roots.
- Batches of several messages in one request (2025-03-26 allowed them; later revisions
  do not).
- The deprecated HTTP+SSE transport of 2024-11-05.
- Authorization (OAuth or any other): see "Who may call it".
- `x-mcp-header` parameters: no tool asks for its arguments to be mirrored into headers.

## Trying it by hand

With it switched on, from the computer Outpost runs on:

```sh
# The earlier revisions: initialize, then list and call.
curl -s http://127.0.0.1:8080/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

curl -s http://127.0.0.1:8080/mcp -H 'Content-Type: application/json' -H 'MCP-Protocol-Version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

curl -s http://127.0.0.1:8080/mcp -H 'Content-Type: application/json' -H 'MCP-Protocol-Version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_library","arguments":{"query":"water"}}}'

# 2026-07-28: no initialize; the version in _meta and in the headers.
curl -s http://127.0.0.1:8080/mcp -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: server/discover' \
  -d '{"jsonrpc":"2.0","id":4,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'

curl -s http://127.0.0.1:8080/mcp -H 'Content-Type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' -H 'Mcp-Method: tools/call' -H 'Mcp-Name: search_library' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"search_library","arguments":{"query":"water"},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
```

The code is in `apps/server/src/modules/tools/mcp.ts`; the tools themselves are in the
same folder (`registry.ts`), shared with Chat.
