# Outpost's tools for other programs (MCP)

The tools a model in Chat uses to look things up in Outpost
([ai.md](ai.md#looking-things-up-in-outpost)) can also be used by other programs on the
home network that speak the Model Context Protocol (MCP): a desktop assistant, a code
editor. Outpost answers them at `/mcp`.

The tools only read, and follow the same area switches as Chat (**Settings → Looking
things up in Outpost**). Encrypted note pages are never read.

## Switching it on

Off until turned on: **Settings → Looking things up in Outpost → Let other programs on the
home network use these tools**.

It can be switched **only at the computer Outpost runs on** (from `http://localhost:8080`
or that computer's own address), because it changes who can read the household's
supplies and plans. Other devices see it greyed out. In a container no request looks as
if it comes from the computer itself; there, start Outpost with
`OUTPOST_ALLOW_REMOTE_SETTINGS=true`. **Put everything back to its defaults** and **Erase
everything** turn it off.

While it is off, `/mcp` refuses every request (`403`).

## The warning

> With this on, any program on your home network that speaks MCP (the Model Context
> Protocol) can ask Outpost these questions, and whatever that program is connected to
> receives the answers: a desktop assistant using a model in the cloud would send your
> household's supplies and plans there.

Outpost cannot tell what a program does with an answer. Turn off the areas you would not
want to leave the house before you turn this on.

## The address to give a program

Settings shows it under the switch:

- `http://127.0.0.1:8080/mcp` for a program on the computer Outpost runs on;
- `http://<this computer's address>:8080/mcp` (for example `http://192.168.1.20:8080/mcp`)
  from another computer at home, listed only when Outpost is shared with the network.

The port is the one Outpost runs on (8080 unless changed). It is plain HTTP.

## Connecting a program

From each program's own documentation, read on 17 November 2026.

### Claude Code

```sh
claude mcp add --transport http outpost http://192.168.1.20:8080/mcp
```

Add `--scope project` to share it through the project's `.mcp.json`, or `--scope user`
for all your projects. In `.mcp.json` (the `type` is required):

```json
{
  "mcpServers": {
    "outpost": { "type": "http", "url": "http://192.168.1.20:8080/mcp" }
  }
}
```

### VS Code

Run **MCP: Add Server** (or **Chat: Open Customizations → MCP Servers → Add Server**) and
give the address, or put it in `.vscode/mcp.json`:

```json
{
  "servers": {
    "outpost": { "type": "http", "url": "http://192.168.1.20:8080/mcp" }
  }
}
```

VS Code's page says new Copilot set-ups use `~/.copilot/mcp-config.json` instead; its
format is on the same page.

## Who may call it

There are **no tokens or accounts**. Instead, every request must: come from this computer
or a private home-network address (never a public one); not come through a proxy; be
addressed to a name Outpost answers to; come from no web page of another site; be
`application/json`, at most 256 KB; and keep within 20 requests in a burst, then one a
second per address (past that, `429` with `Retry-After`). Anything else is refused.

Anything on your home network that passes those rules can read what the switched-on areas
hold. See [security.md](security.md#the-mcp-endpoint).

## What is implemented

MCP revisions 2026-07-28 (current) and the earlier 2025-11-25, 2025-06-18 and 2025-03-26:
`initialize`, `ping`, `server/discover`, `tools/list` and `tools/call`. Every answer is one
JSON body; there are no streams, sessions, resources, prompts or OAuth. The full detail of
methods, errors and what is not built is in
[development/answers-and-search.md](development/answers-and-search.md#mcp).

## Trying it by hand

With it switched on, from the computer Outpost runs on:

```sh
curl -s http://127.0.0.1:8080/mcp -H 'Content-Type: application/json' -H 'MCP-Protocol-Version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

curl -s http://127.0.0.1:8080/mcp -H 'Content-Type: application/json' -H 'MCP-Protocol-Version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_library","arguments":{"query":"water"}}}'
```
