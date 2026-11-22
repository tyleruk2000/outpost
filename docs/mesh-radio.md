# Mesh radio: the board beyond the Wi-Fi

The household's [message board](messages.md) can reach beyond the home Wi-Fi through a
LoRa radio running **Meshtastic** or **MeshCore**. Not yet tried with a real radio: expect
the first one to find something. Meshtastic® is a registered trademark of Meshtastic LLC;
Outpost works with these radios and is not affiliated with or endorsed by Meshtastic or
MeshCore.

A radio channel is a channel of the board. On **Messages**, a switch shows **Home** and
each radio channel set up. What is written on a radio channel goes out by radio with the
writer's name in front; what the radio hears there shows as having come by radio. Nothing
is relayed between Home and a radio channel by itself.

## Read this first

- **A mesh's default channel can be read by anyone with a radio in range.** Meshtastic's
  own app says its default channel "is encrypted with a well-known default key, so anyone
  running Meshtastic on the same preset can read it". Write nothing private there.
- **A private channel is as private as its key**, which is set in the radio's own app.
  Outpost never sees it.
- **Messages by radio can be lost or delayed.** This is not a way to call the emergency
  services.
- **These radios are licence-free only on the bands and powers each country allows.** Set
  your region on the radio ("Check your national band plan before transmitting",
  Meshtastic's [regional settings](https://meshtastic.org/docs/configuration/radio/lora/#region)).
  Outpost does not set the radio's region, frequency or power. Settings → Mesh radio carries
  the same licence note as the other radio screens, linking to
  [What needs a radio licence](radio-licences.md).

## Three ways in

| Way in | Radio | Firmware |
| --- | --- | --- |
| Meshtastic, **Outpost is the broker** | An ESP32 Meshtastic radio on the home Wi-Fi (nRF52 radios cannot output JSON) | MQTT on, JSON output on, encryption off |
| Meshtastic, **the household's broker** | The same, on a broker you already run (Mosquitto, Home Assistant's) | The same |
| MeshCore, **by USB cable** or **by its network port** | A MeshCore radio plugged in, or on Wi-Fi or Ethernet (port 5000) | Companion radio |

Meshtastic by USB or port 4403 is not offered (see the end of this page).

Each is off until set up in **Settings → Mesh radio**, and only at the computer Outpost runs
on. To allow it from every device (needed in a container), add to Outpost's `.env` and
restart:

```sh
OUTPOST_ALLOW_REMOTE_SETTINGS=true
```

### Meshtastic, with Outpost as the broker

In **Settings → Mesh radio → Meshtastic**, choose **Outpost is the broker**, keep port 1883
or choose another, give a user name and password (**Suggest one** makes one up), list the
channels to carry (LongFast, index 0, to start) and save. Then, in the radio's own app:

1. **Network**: Wi-Fi on, joined to the home network.
2. **MQTT**: on; server the address the screen shows (`192.168.1.20:1883`); the user name
   and password; **Encryption off**; **JSON output on**; TLS off. Leave the root topic
   (`msh/EU_868` or your region's).
3. **Channels**: **Uplink on** and **Downlink on** for each channel to carry. Add a channel
   named **mqtt** with **Downlink on** and restart the radio; this is how it takes messages
   to send.

The status line then says "A radio connected" and "Last heard". "The radio is sending,
but not as JSON" means JSON output is off. If Outpost is not open to the network
(`OUTPOST_LAN_ACCESS` off), a radio cannot reach it; the screen says so.

### Meshtastic, through the household's broker

Use this if you already run Mosquitto. While it is chosen, Outpost's own broker is off.
Choose **Use the household's broker** and give its address, port, the account Outpost
signs in with, and the radio's root topic.

- **Find a broker** says what answers on ports 1883 and 8883 here and at the address
  typed. It signs in to nothing.
- **Test** signs in, sends a check message and waits for it, then listens 8 seconds for a
  radio, saying which step failed.
- **TLS**: tick it, use the TLS port (usually 8883), and paste the household's CA
  certificate if needed. The certificate is always checked.

Outpost never installs or changes the household's Mosquitto. **A guide to running your
own Mosquitto for the radio**, in Settings, has every step with your values filled in:
passwords and an access list, TLS, and dynamic security (with which **Add the account**
makes radio accounts from the screen). Give the radio the broker's home-network address,
never `127.0.0.1`; from Outpost in Docker on the same computer, use the computer's address
or the container's gateway (**Find** shows it).

### MeshCore

Flash the radio with MeshCore's **companion radio** firmware (USB, or the Wi-Fi or Ethernet
build). In **Settings → Mesh radio → MeshCore**:

- **By USB cable**: plug it in, press **Refresh** and choose it. On Linux the account
  running Outpost needs the device: `sudo usermod -aG dialout <account>`, then log in
  again. Close the radio's own app first: only one program can open it.
- **By its network port**: the radio's address and port 5000.
- **Channels**: slot 0 is the public channel on a new radio; add the slots to carry.

Outpost reconnects if the radio is unplugged or restarted.

## On the Messages screen

- A radio channel has check-in buttons and **Write**, but cannot send files.
- **Radio text is short.** The screen counts bytes, your name included: 200 for
  Meshtastic, 133 for MeshCore ("é" is 2 bytes, most emoji 4). Over the limit it is
  refused, never cut.
- **Delivery is said as known**: "Handed to the radio", "Handed to the household's broker",
  or "Did not go: …". Neither system reports delivery across the mesh.
- A radio message cannot be changed, only removed here. A check-in goes as text, without a
  position. Radio messages raise no toast.

## Where the radios are, on the map

A Meshtastic radio with a fix sends its position from time to time (every 15 minutes by
default). Outpost shows the last one under **Layers → Heard on the radio → Mesh radios**,
with the radio's name and the age of the report. **Mesh radios** draws them on this device;
each radio also has its own switch, the same on every device, and until it is on that
radio's place is sent to no browser. MeshCore positions are not shown yet.

## What is kept

Radio messages are the board's, backed up and erased with it. The set-up stays with this
computer: a restored backup or a portable drive does not carry it. Passwords are kept in a
file only Outpost can read, outside the database and backups, and are never logged or sent
back. The household broker's password goes only to the address, port and user name it was
saved with (and only over TLS if it was saved with TLS): change any of them, or turn TLS
off, and type the password again. **Erase everything** removes all of it.

## In a container

Publish the broker's port as the web port is, and pass a USB radio through. See
[deployment.md](deployment.md#mesh-radio-in-a-container).

## If it does not work

- A radio that never connects shows the MQTT error in its own serial log.
- "No radio is taking messages to send": the `mqtt` channel with Downlink on is missing, or
  the radio was not restarted.

The broker's limits and why Meshtastic by USB is not built: [development/radio.md](development/radio.md#mesh-radio).
