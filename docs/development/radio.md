# Radio, for developers

Routes are in [api.md](../api.md); the guide is [radio.md](../radio.md).

## Repeater sources

`catalog/repeater-sources.json`, overridden by `<data>/catalog/repeaters/repeater-sources.json`:

```json
{
  "schemaVersion": 1,
  "regions": [{ "id": "valley", "name": "Our valley", "bbox": [-3.4, 54.3, -2.9, 54.7] }],
  "sources": [{
    "id": "club-list", "region": "valley", "publisher": "Fell Radio Club",
    "name": "Club repeater list", "covers": "The club's own repeaters.",
    "pageUrl": "https://club.example.org/repeaters", "kind": "fetch",
    "why": "It is our own list.", "termsUrl": "https://club.example.org/repeaters",
    "termsNote": "Ours to use.", "termsRead": "2026-11-16",
    "fetch": { "url": "https://club.example.org/repeaters.csv", "waitSeconds": 10 }
  }]
}
```

A shipped `id` is replaced; `"replaceShipped": true` drops them all. `kind` is `fetch`
(needs `fetch.url`), `link` (needs `steps`) or `none`. Shipped sources must be `https` with
a wait of at least ten seconds; a private address needs `OUTPOST_ALLOW_PRIVATE_DOWNLOADS=true`.
`pnpm catalog:validate` checks the file. Scale: `OUTPOST_SCALE=1 pnpm exec vitest run
test/repeaters-scale.test.ts` in `apps/server`.

## Reference sheets and frequencies

- Sheets are Markdown in `catalog/bundled/radio/`, listed in
  `catalog/manifests/outpost-reference.json`. To correct one: edit it, re-check each changed
  figure at its source, update **Checked**, raise `version` and `lastVerified`, then run
  `pnpm catalog:validate` and the catalogue tests. Rules: [catalog/README.md](../../catalog/README.md).
- Frequencies are in `packages/shared/src/radio-frequencies/` (one file per kind; shape and
  the `heardFromAfar` rule in `radio-frequencies.ts`). Set `checked` (and `schedule` for
  shortwave), then `cd apps/web && pnpm exec vitest run src/features/frequencies`
  (`FREQ_KIND=weather` for one kind). Keep a closed station, with its date.

## LogBook73 books

`pnpm catalog:import-logbook73 /path/to/LogBook73` writes `catalog/bundled/logbook73/`,
`catalog/manifests/logbook73.json` and its packs, then run `pnpm catalog:validate` and both
test suites. Chapter text is not edited; chapter links become `outpost:entry/<id>/<chapter>`
([catalog/README.md](../../catalog/README.md#links-into-the-catalogue)). It refuses a dirty
checkout and reports dead links; `version` moves only when a book changes. Signal figures
port LogBook73's `RadioViz` (MIT).

## Mesh radio

Code: `apps/server/src/modules/mesh/`. Set-up in the settings rows `mesh.config` and
`mesh.heard` (not in the settings schema); passwords in `<data>/mesh/secrets.json` (0600,
scrypt hash of the broker password).

The MQTT 3.1.1 broker (`mesh/mqtt/`) requires a password; QoS 0 and 1 only (QoS 2 closes the
connection); no retained messages, wills or kept sessions. Limits: 64 KiB a packet, 8
connections (2 unauthenticated per address), 20 publishes a second (bursts of 50), 32
subscriptions, 10 s to sign in, 5 wrong passwords a minute per address. Only this computer
and private addresses may connect. As a client it subscribes to `<root>/2/json/#` and
`<root>/2/e/#`, publishes to `<root>/2/json/mqtt/`, and reads at most 20 messages a second.

Licences (read 17 November 2026; [sources.md](../sources.md#mesh-radio-read-2026-11-17)):
Meshtastic's firmware and protobufs are GPL-3; only its documented MQTT JSON interface is
built (`meshtastic/json.ts`). Its binary API (USB, port 4403) is not, since its field
numbers exist only in the GPL `mesh.proto`. MeshCore (MIT) frames and commands are written
fresh from its `ArduinoSerialInterface.cpp` and `companion_protocol.md`.

## Board transports

`apps/server/src/modules/board/transport.ts`, on `ctx.services.board`: `addTransport({ name,
carries(channel), send(message), refuse? })`, `receive({ channel, source, externalId,
author, body, … })` (stored once per source and id), `onMessage(listener)` and `setMeta(id,
meta)` (at most 4 KB; announces `board.changed` with `delivery`). Messages live in
`board_messages` (`source`, `external_id`, `meta`) and files in `board_files` and `board/`.
