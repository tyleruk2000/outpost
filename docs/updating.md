# Updating Outpost

**Settings → Updates** shows the version running and what updating from the app can do
here. Your library, notes and settings are kept through an update. Updating is offered
at the computer Outpost runs on, or from any device when Outpost was started with
`OUTPOST_ALLOW_REMOTE_ERASE=true`; others see the version and any update under way.

## What each kind of installation allows

| Installation | What the app does |
| --- | --- |
| Docker on a Raspberry Pi set up with `deploy/pi/install.sh` | Checks a release, makes a backup, and hands it to the Pi's update service, which installs it and goes back if the new version does not start healthy. |
| Docker without the update service | Checks and keeps a release, and shows the commands to install it on the host. |
| The portable app | Stop Outpost and copy the new portable app over the old one; the drive's library is kept. |
| From source | `git pull`, `pnpm install`, and start Outpost again. |

## Getting a release

- **Check for a newer version** asks the release page (this needs the internet, and
  happens only when pressed); **Fetch** downloads one.
- **Choose a file** sends an `.outpost-update` file from your device.
- **From a USB stick**: put the file at the top of a storage location, or in a folder
  `outpost-updates` on it. Found files are listed; **Check it** reads one where it is.

A release file is for one kind of computer: `linux-arm64` for a Raspberry Pi 4 or 5,
`linux-amd64` for most others. Outpost checks that its description is signed by
Outpost's release key, that it is newer and for this computer, and that the image
matches the signed checksum. A file that fails is refused with the reason. One that
passes is kept, ready to install; **Remove it** deletes it. **Releases cannot be checked
yet** means this build has no release key.

## Installing

**Install** asks first, then:

1. Makes a backup into the data folder and reads it back (the newest two are kept). If
   it fails, nothing changes.
2. The Pi's update service checks the signature and checksum again and loads the image.
3. Outpost restarts from it, unavailable for a minute or two.
4. If it does not report healthy within three minutes, the previous version starts again.

**Settings → Updates** then says what happened. If the update was undone, the new version
may already have changed the database: **Restore the backup from before** stages the
backup from step 1 for the next restart.

If the update service has not answered, run `deploy/pi/install.sh` again and read
`journalctl -u outpost-update` on the Pi. After an update, `install.sh` starts the
installed release rather than building; remove `OUTPOST_IMAGE` from `.env` to build from
the checkout again.

## Docker without the update service

Check the release in the app, make a backup, then on the host, beside `compose.yaml`:

```sh
docker load -i <data volume>/update/staged/image.tar.gz
# set OUTPOST_IMAGE=outpost:<release> in .env
docker compose up -d --no-build
```

`docker volume inspect outpost_outpost-data` gives the volume's folder. To go back, put
`OUTPOST_IMAGE` back and run the last command again.
