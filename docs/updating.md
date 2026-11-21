# Updating Outpost

**Settings → Updates** shows the version running and what updating from the app can do on
this kind of installation. Your library, notes and settings are kept through an update.

## What each kind of installation allows

| Installation | What the app does |
| --- | --- |
| Docker on a Raspberry Pi set up with `deploy/pi/install.sh` | Checks a release, makes a backup, and hands it to the update service on the Pi, which installs it and goes back to the version before if the new one does not start healthy. |
| Docker without the update service | Checks a release and keeps it, and shows the commands to install it on the host. A container cannot replace the program it runs. |
| The portable app | Nothing to install. Stop Outpost and copy the new portable app over the old one; the library on the drive is kept. |
| Run from a copy of the source | Nothing to install. Update the checkout (`git pull`, `pnpm install`) and start Outpost again. |

Updating is offered on the computer Outpost runs on, like restoring a backup, or from any
device when Outpost was started with `OUTPOST_ALLOW_REMOTE_ERASE=true`. Other devices see
the version and any update under way.

## Getting a release

Three ways, each checked the same way before anything is kept:

- **From the release page.** **Check for a newer version** asks the release page whether
  there is one. This needs the internet, and Outpost asks only when you press. If there
  is a newer release, **Fetch** downloads it.
- **From a release file.** **Choose a file** sends a file ending `.outpost-update` from
  the device you are using.
- **From a USB stick or other storage.** Put the release file at the top of a storage
  location, or in a folder named `outpost-updates` on it, and connect it (add a USB stick
  under Storage first). The files found are listed; **Check it** reads one where it is and
  leaves it there.

A release file is for one kind of computer: `linux-arm64` for a Raspberry Pi 4 or 5,
`linux-amd64` for most other computers.

### The check

A release file holds the release's description, its signature, and the program itself
(a Docker image). Outpost checks that the description is signed by Outpost's release key,
that the release is newer than the one running and is for this kind of computer, and that
the image matches the checksum in the signed description. A file that fails any of these
is refused with the reason, and nothing from it is kept. One that passes is kept in
Outpost's data folder, ready to install; **Remove it** deletes that copy.

If the screen says **Releases cannot be checked yet**, this build of Outpost has no
release key, and updates have to be installed the way the installation was set up.

## Installing

**Install** asks first, then:

1. A backup of everything Outpost keeps is made into its data folder and read back.
   The two newest of these are kept. If the backup fails, nothing is changed.
2. The update service on the Pi checks the signature again with its own copy of the
   release key, and the image's checksum, then loads the image.
3. It starts Outpost from the new image. Outpost is unavailable to everyone for a minute
   or two.
4. If the new version does not report healthy within three minutes, the service starts
   the version before again.

When Outpost is back, **Settings → Updates** says what happened. If the update was undone,
the new version may already have changed the database as it started. **Restore the backup
from before** stages the backup made in step 1, as a restore from Settings → Backup does,
for the next restart.

If the screen says the update service has not answered, see that it is installed (run
`deploy/pi/install.sh` again) and read its log on the Pi: `journalctl -u outpost-update`.

Re-running `deploy/pi/install.sh` after an update starts the installed release as it is
rather than building from the checkout. To build from the checkout again, remove the
`OUTPOST_IMAGE` line from `.env`.

## Docker without the update service

Check the release in the app, then on the host, from the folder with `compose.yaml`:

```sh
docker load -i <data volume>/update/staged/image.tar.gz
# set OUTPOST_IMAGE=outpost:<release> in .env
docker compose up -d --no-build
```

`docker volume inspect outpost_outpost-data` gives the data volume's folder. Make a backup
from Settings → Backup first. To go back, put `OUTPOST_IMAGE` back as it was and run the
last command again.

## Not tried

- Installing on a real Raspberry Pi: loading a real image and replacing the running
  container.
- Fetching a release from the release page: no release has been published or signed yet.
