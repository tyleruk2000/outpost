# Releases and updates

How a release is made and signed, what is in it, and how an installation updates
itself from one. The person's side is in [updating.md](../updating.md).

## The signing scheme

Releases are signed with [minisign](https://jedisct1.github.io/minisign/) (Ed25519).
The public key is in the repository twice, and the two must be the same (a server test
checks):

- `apps/server/src/modules/update/release-key.ts`, built into the server, which checks
  a release before keeping it;
- `deploy/release-key.pub`, which `deploy/pi/install.sh` copies to
  `/usr/local/lib/outpost/release-key.pub` for the update service, which checks the
  release again before installing it. The data volume belongs to the container, so the
  service trusts nothing in it.

The server checks signatures with Node's own Ed25519 (`modules/update/minisign.ts`), so
no program is needed in the image. Signatures must be minisign's hashed form (`ED`, what
`minisign -S` makes); the older form is read for small files only.

`OUTPOST_RELEASE_KEY` (the public key's text) replaces the built-in key, for someone who
builds and signs releases of their own.

### Making the key (once)

The key does not exist yet. Until it does, both files are empty, the Updates section says
releases cannot be checked, and `install.sh` does not add the update service.

```sh
minisign -G -p outpost-release.pub -s outpost-release.key
```

Keep `outpost-release.key` and its password off the repository and off any computer that
builds untrusted code. Put the contents of `outpost-release.pub` in
`deploy/release-key.pub`, and its second line in `RELEASE_KEY`.

## What a release is

`release.json`:

```json
{
  "format": "outpost-release",
  "version": 1,
  "release": "0.2.0",
  "publishedAt": "2026-12-01T00:00:00Z",
  "notes": "One paragraph for the Updates screen.",
  "platforms": {
    "linux/arm64": { "file": "image.tar.gz", "bytes": 212000000, "sha256": "…", "image": "outpost:0.2.0" }
  }
}
```

The release file for one platform is a zip, stored without compression,
`outpost-<release>-linux-<arch>.outpost-update`, holding `release.json`,
`release.json.minisig` and the image (`docker save outpost:<release> | gzip`). The release
page also serves `latest.json` (the same manifest, with `url` set in each platform to its
release file's address) and `latest.json.minisig`. `OUTPOST_UPDATE_URL` says where the
release page is; it defaults to the GitHub repository's latest release.

## Making a release

```sh
docker buildx build --platform linux/arm64 -t outpost:0.2.0 --load .
docker save outpost:0.2.0 | gzip > image.tar.gz
node scripts/make-release.mjs --release 0.2.0 --platform linux/arm64 --image image.tar.gz --notes "…"
minisign -S -s outpost-release.key -m release.json -t "outpost 0.2.0"
node scripts/make-release.mjs --bundle --release 0.2.0 --platform linux/arm64 --image image.tar.gz
```

The first run writes `release.json`; after signing, `--bundle` checks the signature
against `deploy/release-key.pub` and writes the `.outpost-update` file. Repeat for each
platform, then write `latest.json` the same way with `--latest <release file URL>` and
sign it too. Upload the release files, `latest.json` and `latest.json.minisig` to the
release.

## How an update is installed

The `update` folder in the data directory is the hand-over (see
`modules/update/index.ts` for each file). Outpost unpacks a checked release into
`staged/`. Installing makes and reads back a backup (`before-<release>-<time>.zip`),
writes `pending.json`, then one line to `request`: an id and the release.

`deploy/pi/update.sh`, run as root by `outpost-update.path` when `request` appears:
copies the staged files to a folder of root's own, checks the signature with `minisign
-V` and the image's SHA-256 against the signed manifest, loads the image and checks the
tag it loaded, sets `OUTPOST_IMAGE` in the checkout's `.env`, runs `docker compose up -d
--no-build outpost`, and waits up to 180 seconds for the container to report healthy on
the new image. If it does not, it puts `OUTPOST_IMAGE` back and starts the container
again. It writes `<id> ok|rolled-back|failed <release> <words>` to `result`, which
Outpost reads at start and on each status request. It never removes an image or a file
of Outpost's.

The database is not rolled back by the service: a new version may migrate it as it
starts, and the version before then finds it ahead of itself. The backup made first is
offered for restoring on the Updates screen after a roll-back.

## Tried and not tried

Tried: minisign 0.11 (Debian bookworm) verifies signatures made by `minisign.ts`'s
signer, and `minisign.ts` verifies signatures minisign made (hashed and legacy; the
files are in `apps/server/test/fixtures/minisign`). `update.sh` was run in a Debian
bookworm container with minisign and a stand-in for Docker: installed, refused a changed
manifest, and rolled back a version that never became healthy. `install.sh --dry-run`
prints the service's units.

Not tried: a real image loaded and a running container replaced on a Raspberry Pi;
`scripts/make-release.mjs` against a real image (it was run with a stand-in file and a throwaway key); fetching from a real release page.
