# Releases and updates

How a release is made and signed, and how an installation updates from one. The
person's side is in [updating.md](../updating.md).

## The signing scheme

Releases are signed with [minisign](https://jedisct1.github.io/minisign/) (Ed25519). The
public key is in the repository twice, and a server test checks they match:

- `apps/server/src/modules/update/release-key.ts`, built into the server, which checks a
  release before keeping it;
- `deploy/release-key.pub`, which `deploy/pi/install.sh` copies to
  `/usr/local/lib/outpost/release-key.pub` for the update service, which checks it again
  before installing (it trusts nothing in the container's data volume).

The server verifies with Node's own Ed25519 (`modules/update/minisign.ts`). Signatures
must be minisign's hashed form (`ED`, what `minisign -S` makes); the legacy form is read
for small files only. `OUTPOST_RELEASE_KEY` replaces the built-in key, for someone who
signs their own releases.

### Making the key (once)

The key does not exist yet: both files are empty, Updates says releases cannot be
checked, and `install.sh` does not add the update service.

```sh
minisign -G -p outpost-release.pub -s outpost-release.key
```

Keep `outpost-release.key` and its password off the repository and off any computer that
builds untrusted code. Put `outpost-release.pub` in `deploy/release-key.pub` and its
second line in `RELEASE_KEY`.

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

A platform's release file is an uncompressed zip,
`outpost-<release>-linux-<arch>.outpost-update`, holding `release.json`,
`release.json.minisig` and the image (`docker save outpost:<release> | gzip`). The
release page also serves `latest.json` (the manifest with each platform's `url`) and
`latest.json.minisig`. `OUTPOST_UPDATE_URL` points at the release page (default: the
GitHub repository's latest release).

## Making a release

```sh
docker buildx build --platform linux/arm64 -t outpost:0.2.0 --load .
docker save outpost:0.2.0 | gzip > image.tar.gz
node scripts/make-release.mjs --release 0.2.0 --platform linux/arm64 --image image.tar.gz --notes "…"
minisign -S -s outpost-release.key -m release.json -t "outpost 0.2.0"
node scripts/make-release.mjs --bundle --release 0.2.0 --platform linux/arm64 --image image.tar.gz
```

The first run writes `release.json`; `--bundle` checks the signature against
`deploy/release-key.pub` and writes the `.outpost-update` file. Repeat per platform, then
write and sign `latest.json` with `--latest <release file URL>`. Upload the release files,
`latest.json` and its signature.

## How an update is installed

The `update` folder in the data directory is the hand-over (`modules/update/index.ts`).
Outpost unpacks a checked release into `staged/`. Installing makes and reads back a
backup (`before-<release>-<time>.zip`), writes `pending.json`, then one line to
`request`: an id and the release.

`deploy/pi/update.sh`, run as root by `outpost-update.path` when `request` appears,
copies the staged files to a folder of root's own, checks the signature (`minisign -V`)
and the image's SHA-256, loads the image and checks its tag, sets `OUTPOST_IMAGE` in the
checkout's `.env`, runs `docker compose up -d --no-build outpost`, and waits up to 180
seconds for a healthy container on the new image. If it is not healthy it puts
`OUTPOST_IMAGE` back and restarts. It writes `<id> ok|rolled-back|failed <release>
<words>` to `result`, which Outpost reads at start and on each status request. It never
removes an image or a file of Outpost's.

The service does not roll the database back: a new version may migrate it, and the
older version then finds it ahead of itself. The backup made first is offered for
restoring on the Updates screen after a roll-back.

What has been tried is in [testing-status.md](../testing-status.md).
