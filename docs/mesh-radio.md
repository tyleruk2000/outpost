# Mesh radio: the board beyond the Wi-Fi

> **Not tried with a real radio.** Everything on this page was built from the radio
> projects' published documentation and tested against stand-ins written for the tests
> (a Meshtastic radio speaking MQTT, a MeshCore companion radio on a socket). Nobody has
> yet connected a real radio to it. Expect the first real radio to find something.

The household's message board (see [messages.md](messages.md)) can reach beyond the
home Wi-Fi through a cheap LoRa radio running **Meshtastic** or **MeshCore** firmware.
Outpost works with these radios; it is not part of either project. Meshtastic® is a
registered trademark of Meshtastic LLC; Outpost is not affiliated with or endorsed by
Meshtastic or MeshCore.

A radio channel is a channel of the board. On **Messages**, a switch above the board
shows **Home** (the household's own) and each radio channel that is set up. What is
written on a radio channel goes out by radio, with the writer's name in front; what the
radio hears on it shows there, marked as having come by radio, with the sender as the
radio names them. **Nothing is relayed between Home and a radio channel by itself**: a
message goes where the person wrote it.

## Read this first

- **A mesh's default public channel can be read by anyone with a radio in range.** Write
  nothing private there. Meshtastic's own app says of its default channel that it "is
  encrypted with a well-known default key, so anyone running Meshtastic on the same
  preset can read it".
- **A private channel is as private as its key**, and the key is set on the radio, in
  the radio's own app, not in Outpost. Outpost never sees or keeps a channel's key.
- **Messages by radio can be lost or delayed.** This is not a way to call for help in an
  emergency in place of the emergency services.
- **These radios are licence-free only on the bands and powers each country allows.**
  Choose your region on the radio as Meshtastic's page on
  [regional settings](https://meshtastic.org/docs/configuration/radio/lora/#region)
  says ("Check your national band plan before transmitting"). Outpost does not set the
  radio's region, frequency or power.

## Three ways in

| Way in | Radio | Firmware mode | Built | Tested against |
| --- | --- | --- | --- | --- |
| Meshtastic, **Outpost is the broker** | A Meshtastic radio on the home Wi-Fi (ESP32 only: "JSON is not supported on the nRF52 platform") | MQTT on, JSON output on, encryption off | Yes | A stand-in radio (an MQTT client) on the test machine |
| Meshtastic, **the household's broker** | The same, connected to a broker the household already runs (Mosquitto, Home Assistant's) | The same | Yes | Mosquitto 2.1 (on a Mac, and eclipse-mosquitto:2 in Docker) with passwords, an access list, TLS and dynamic security, a stand-in radio publishing to it |
| MeshCore, **by USB cable** | A MeshCore radio plugged into the computer | Companion radio, USB | Yes | Not tested: the device list and stty's arguments are; opening a device is not |
| MeshCore, **by its network port** | A MeshCore radio on Wi-Fi or Ethernet | Companion radio, Wi-Fi or Ethernet build (port 5000) | Yes | A stand-in companion on a socket |
| Meshtastic by USB cable or its own port 4403 | | | **No** | See "Licence position" |

Each is off until a person sets it up in **Settings → Mesh radio**, and while it is off
there is no listener, no timer and no open device. Turning a way in on or off, choosing a
device and opening the broker's port are accepted only from the computer Outpost runs
on (the same test erase-everything uses, `core/local.ts`), because each opens a port or a
device on it. From another device the controls are disabled, and the screen says why
and gives the line that allows it. To change the set-up from every device, add this to
Outpost's `.env` and restart it (in Docker: `sudo docker compose up -d` in the folder
with `compose.yaml`):

```sh
OUTPOST_ALLOW_REMOTE_SETTINGS=true
```

In a container no request looks as if it comes from the computer itself, even in a
browser on it, so this is the way there. The older `OUTPOST_ALLOW_REMOTE_ERASE=true`
still allows it too.

### Meshtastic, with Outpost as the broker

With no internet there is no public broker, so the broker is the household's own. In
**Settings → Mesh radio → Meshtastic**, choose **Outpost is the broker**, keep port 1883
or choose another, give a user name and a password (**Suggest one** makes one up), list
the channels to carry (LongFast, index 0, to start), and save. The screen then shows the
address to give the radio. On the radio, in its own app:

1. **Network**: Wi-Fi on, joined to the home network.
2. **MQTT**: MQTT on; server address the computer's address with the port, as the
   screen shows it (`192.168.1.20:1883`); the user name and password set in Outpost;
   **Encryption off**; **JSON output on**; TLS off. Leave the root topic as the radio
   has it (`msh/EU_868` or your region's); Outpost learns it from the radio.
3. **Channels**: on each channel to carry, **Uplink on** and **Downlink on**. Add a
   channel named **mqtt** with **Downlink on** (its key does not matter) and restart the
   radio. Meshtastic's MQTT page says this channel is how a radio takes JSON to send.

The status line then says "A radio connected since 14:02 (from 192.168.1.40)", and
"Last heard 3 minutes ago" once it has published. "The radio is sending, but not as
JSON" means JSON output is off. A channel heard that is not carried is listed with an
**Add** button.

Outpost's broker does only what a radio needs (see "What the broker does" below). Outpost
listens on the same address as its web server. If Outpost is not open to the network
(`OUTPOST_LAN_ACCESS` off), it listens on this computer only and a radio on Wi-Fi cannot
reach it; the screen says so.

### Meshtastic, through the household's broker

**Which broker.** Outpost's own needs nothing else and carries the radios only. Use your
own Mosquitto if you already run one, or want other things (Home Assistant, sensors) on
it too. Only one program can have a port: while the household's broker is chosen,
Outpost's own is off and leaves port 1883 alone. The screen says which is in use.

Choose **Use the household's broker** and give its address, port, the user name and
password Outpost signs in with, and the radio's root topic (`msh/EU_868` unless changed
on the radio). Outpost subscribes to `<root>/2/json/#` and `<root>/2/e/#`, publishes to
`<root>/2/json/mqtt/`, sends a keep-alive every two minutes, and tries again with a
growing wait (2 seconds to 5 minutes) while the broker is away. It reads at most 20
messages a second from the broker, as its own broker takes from one radio; the screen
counts any it left.

- **Find a broker** looks at ports 1883 and 8883 on this computer (in a container, also
  on the computer the container runs on, through its gateway) and at the address typed,
  and says what answers: a broker that asks for a password, one that lets anyone in, or
  nothing. It signs in to nothing.
- **Test** signs in as the form says (the saved password if none is typed), subscribes
  to the radio's topics, sends one check message under the root topic and waits for it to
  come back, then listens up to 8 seconds for a radio. Each step is said in words: a wrong
  password, a broker that will not let the account read, a check message that did not come
  back (Mosquitto's access-list file says yes to a subscription it then does not deliver,
  so this is the step that tells), nothing heard yet.
- **TLS**: tick it, use the broker's TLS port (usually 8883), and paste the household's
  CA certificate if the broker's certificate was made with one. The certificate is always
  checked, against the name or address typed.
- **Status**: connected since when, the last message heard, which radios have published
  and how many messages in the last minute. When the broker drops, the screen says what to
  check.
- **Switching** between Outpost's broker and the household's says, before you save, what
  to change on the radio: its server address, user name and password.

Outpost does not install, start, stop, upgrade or change the household's Mosquitto, its
files or its container: other things may depend on it.

#### Your own Mosquitto

The same steps, with the values filled in, are in Settings under **A guide to running your
own Mosquitto for the radio**. Tried with Mosquitto 2.1.4 in Docker (`eclipse-mosquitto:2`)
and 2.1.2 on a Mac; the Raspberry Pi OS and Windows installs are untried.

1. **Install.** Docker, a `compose.yaml` of its own:

   ```yaml
   services:
     mosquitto:
       image: eclipse-mosquitto:2
       container_name: mosquitto
       restart: unless-stopped
       ports:
         - "1883:1883"
       volumes:
         - ./config:/mosquitto/config
         - ./data:/mosquitto/data
   ```

   A Mac: `brew install mosquitto`. Raspberry Pi OS: `sudo apt install mosquitto
   mosquitto-clients` (untried). Windows: the installer from mosquitto.org (untried).
2. **Passwords and an access list.** The image's own settings file lets anyone in (seen on
   Mosquitto 2.1.4: `listener 1883`, `allow_anonymous true`). Replace `config/mosquitto.conf`:

   ```
   listener 1883
   allow_anonymous false
   password_file /mosquitto/config/passwd
   acl_file /mosquitto/config/acl
   persistence true
   persistence_location /mosquitto/data/
   ```

   and write `config/acl`, Outpost on every radio topic and each radio on its own root:

   ```
   user outpost
   topic readwrite msh/#

   user radio-1
   topic readwrite msh/EU_868/#
   ```
3. **Accounts**, one for Outpost and one per radio, then a restart:

   ```sh
   sudo docker compose up -d
   sudo docker exec -it mosquitto sh -c 'touch /mosquitto/config/passwd && chmod 0700 /mosquitto/config/passwd /mosquitto/config/acl'
   sudo docker exec -it mosquitto mosquitto_passwd /mosquitto/config/passwd outpost
   sudo docker exec -it mosquitto mosquitto_passwd /mosquitto/config/passwd radio-1
   sudo docker exec -it mosquitto chown mosquitto:mosquitto /mosquitto/config/passwd /mosquitto/config/acl
   sudo docker restart mosquitto
   ```
4. **Check.** `mosquitto_sub -h 127.0.0.1 -t 'msh/#' -W 3` must say "not authorised";
   `mosquitto_sub -h 127.0.0.1 -u outpost -P '…' -t 'msh/EU_868/#' -v` waits for messages.
   Then type the values into Outpost and press **Test**.
5. **The radio**: the broker's address on the home network (never `127.0.0.1`, which is
   the radio itself), `radio-1` and its password, the root topic, JSON on, encryption off.
6. **Outpost in Docker on the same computer**: inside Outpost's container `127.0.0.1` is
   the container. Use the computer's address on the home network, or the container's
   gateway (`172.19.0.1` on one Raspberry Pi; Find shows it).

**TLS.** A certificate authority of your own and a certificate for the broker, made out
to the address or name Outpost and the radio use:

```sh
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 3650 -subj "/CN=Household CA"
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=mosquitto"
printf "subjectAltName=IP:192.168.1.5,DNS:raspberrypi.local\n" > san.ext
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 825 -extfile san.ext
```

Then a second listener (`listener 8883`, `cafile`, `certfile`, `keyfile`), port 8883
published, and in Outpost: port 8883, TLS on, `ca.crt` pasted. Tried: signing in with the
CA, a refusal without it ("not signed by an authority Outpost trusts"), TLS to the plain
port and plain to the TLS port, each said in words. On the radio, TLS is untried:
Meshtastic's MQTT page says only that with TLS on the radio "attempt[s] to establish a
secure connection using TLS" (meshtastic.org/docs/configuration/module/mqtt, read 21
November 2026), not whether it checks the certificate.

**Dynamic security** (mosquitto.org/documentation/dynamic-security). With the plugin on
in place of `password_file` and `acl_file`:

```
plugin /usr/lib/mosquitto_dynamic_security.so
plugin_opt_config_file /mosquitto/data/dynamic-security.json
```

Mosquitto 2.1 makes the file on its first start, with an `admin` account whose password
is in `dynamic-security.json.pw` and a `democlient` allowed every topic (delete it). Give
Outpost an account limited to the radio topics, and, to let it add radio accounts from
the screen, the `dynsec-admin` role:

```sh
sudo docker exec mosquitto cat /mosquitto/data/dynamic-security.json.pw
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec deleteClient democlient
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec createRole outpost
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec addRoleACL outpost publishClientSend 'msh/#' allow
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec addRoleACL outpost subscribePattern 'msh/#' allow
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec createClient outpost
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec addClientRole outpost outpost
sudo docker exec -it mosquitto mosquitto_ctrl -u admin dynsec addClientRole outpost dynsec-admin
```

**Check dynamic security** in Settings then says whether it is on and Outpost may manage
it; **Add the account** makes an account for a radio with a role allowed only
`<root>/#`. Without the plugin, or without the role, the screen says so and the file
lines above are the way; Outpost cannot change them. `dynsec-admin` lets Outpost's account
manage every account on the broker: leave it out to add radios yourself with
`mosquitto_ctrl … createClient`.

### MeshCore

Flash the radio with MeshCore's **companion radio** firmware: the USB build to plug it
in, or the Wi-Fi or Ethernet build to reach it on the network ("Connect on TCP port
5000", MeshCore's FAQ). In **Settings → Mesh radio → MeshCore**:

- **By USB cable**: plug the radio in, press **Refresh**, and choose it from the list.
  The list is made by the server from the names USB radios get (on a Mac
  `/dev/cu.usbmodem…`, `/dev/cu.usbserial…`; on Linux `/dev/serial/by-id/…`,
  `/dev/ttyACM…`, `/dev/ttyUSB…`). A path cannot be typed. On Linux the account that
  runs Outpost must be allowed the device: `sudo usermod -aG dialout <account>`, then
  log in again. Close the radio's own app or any serial monitor first: only one program
  can have the device open.
- **By its network port**: give the radio's address and port (5000).
- **Channels**: slot 0 is the public channel on a new radio; add the slots to carry.

The status line says the radio's name once it has answered. When it goes (unplugged,
restarted), Outpost tries again with a growing wait while it is still set up.

## On the Messages screen

- **Home** is the board as before. A radio channel shows that channel's history, a
  short warning line, check-in buttons that post to it, and **Write**. A file cannot be
  sent by radio, and a radio channel has no Check-ins summary.
- **Radio text is short.** As you type, the screen counts bytes, not characters, of
  what will actually go, your name in front included: "37 of 200 bytes" for Meshtastic
  ("Maximum length: 200 bytes", Meshtastic's Android app), 133 for MeshCore
  (MeshCore's protocol document gives 133 characters; Outpost counts 133 bytes, which is
  never more). "é" is 2 bytes and most emoji 4. Over the limit the screen says so and
  the server refuses: **nothing is cut**.
- **Delivery is said as it is known**:
  - "Handed to the radio": Outpost's broker gave it to the radio (the radio acknowledged
    the MQTT message), or the MeshCore radio said it had sent it.
  - "Handed to the household's broker": the household's broker took it; whether the
    radio did is not known.
  - "Did not go: …" with the reason.
  - "Acknowledged by the mesh" exists in the screen's words but is **never** said by
    either way in built here: neither Meshtastic's JSON mode nor MeshCore's companion
    protocol reports delivery of a channel message.
- A message on a radio channel cannot be changed (what went by radio has gone as it
  was); it can be removed here, which removes it here only.
- A check-in sent by radio goes as text: "Sam: I'm safe (Mum's)". A position is not sent.
- Radio messages do not raise the app's toast, and do not count in the "new on the board"
  line on Home.

## Where the radios are, on the map

A Meshtastic radio with a fix sends its position from time to time (by default every 15
minutes, more often as it moves: Meshtastic's "Position" settings). Outpost keeps the
last one each radio sent and shows it on the map, under **Layers → Heard on the radio →
Mesh radios**, with the radio's name and how long ago it reported.

Both switches start off. **Mesh radios** draws the marks on this device. Each radio has
its own switch in the list under it, the same for every device on the network: until a
radio is switched on, its place is not sent to any browser, since it shows where
someone is. Marks fade in three stated steps (the last hour, 1 to 6 hours, longer), and
the label always says the age in words.

The positions are kept with the radios' names, and go with them when the board is
emptied or everything is erased. MeshCore radios' positions are not shown yet. Not tried
with a real radio: Meshtastic documents `latitude_i` and `longitude_i` (degrees times
10 million) for the position it takes to send, and Outpost reads a position it hears the
same way.

## What is kept, and where

No new table: radio messages are the board's (`board_messages`, with `source`
`meshtastic` or `meshcore`, `external_id` the radio's own id for the message, and `meta`
for who sent it and what became of one written here). They are counted, cleaned up,
backed up and erased with the board.

- `mesh.config` (a row in the settings table, not in the settings schema, so
  `PATCH /api/settings` cannot change it): the ways in as set up, without passwords.
  A restored backup keeps this computer's own row, not the backup's, and a portable
  drive leaves it and `mesh.heard` out, so a set-up never travels to another machine.
- `mesh.heard` (also a settings row): the names of radios heard (at most 200), which
  radio connects to MQTT, its root topic, and each channel's index. The radios' names
  go when the board is emptied; both rows go with erase-everything.
- `<data>/mesh/secrets.json` (folder 0700, file 0600, like the HTTPS key): a scrypt hash
  of the broker password, and the password Outpost signs in to the household broker
  with. Not in the database, so not in a backup or on a portable drive; never logged
  and never sent back by the API. Erase-everything deletes it.

## Power

With nothing set up, the mesh link starts nothing: no listener, no timer, no open
device. With a way in set up and a radio connected, Outpost does nothing between
packets: the radio's keep-alive is the radio's (the broker uses the socket's own idle
timeout, not a timer), a MeshCore radio says when messages are waiting, and a radio that
went away is tried again with a growing wait only while it is still set up. As a client
of the household's broker Outpost sends one keep-alive every two minutes.

Measured on 17 November 2026 on the development Mac (heavily loaded by other work), the
packaged server over ten minutes each, nobody using it: nothing set up, 0.15 s of
processor; Outpost as the broker with a stand-in radio connected and pinging every 15
seconds, 0.13 s; MeshCore by TCP with a stand-in companion connected, 0.12 s. All three
are the server's ordinary rest (about 0.02% of one core); the link adds nothing that
shows.

## What the broker does

A minimal MQTT 3.1.1 server written for this (`apps/server/src/modules/mesh/mqtt/`),
doing what a radio needs and refusing the rest:

- Sign-in with a user name and password is required (CONNACK 4 otherwise). Only MQTT
  3.1.1 (protocol level 4).
- Subscriptions with `+` and `#`; publishes at QoS 0 and 1; keep-alive (closed after 1.5
  times the radio's interval without a packet); clean disconnects.
- Not kept: sessions (a "clean session 0" is treated as clean), retained messages, wills.
  QoS 2 is not supported: a QoS 2 publish closes the connection, and QoS 2 asked for in a
  subscription is granted as 1.
- Limits: 64 KiB a packet, 8 connections (at most 2 from one address that have not
  signed in yet), 20 publishes a second (bursts of 50) a connection, 32 subscriptions a
  connection, 10 seconds to sign in. Past any of them the connection is closed. After 5
  wrong passwords from one address in a minute, its logins are refused without being
  checked until the minute is up.
- Only this computer and, when Outpost is open to the network, private home-network
  addresses (RFC 1918, link-local, IPv6 unique-local) may connect; others are closed
  before a byte is read.

## In a container

The broker's port must be published, as the web port is. A USB radio must be passed
through to the container. See [deployment.md](deployment.md#mesh-radio-in-a-container).

## What was and was not tested

Tested (server: `apps/server/test/mesh.test.ts`, `mesh-mqtt.test.ts`; web:
`features/mesh/mesh-settings.test.tsx`, `features/board/board-radio.test.tsx`; end to end:
`e2e/tests/mesh-radio.mobile.spec.ts`):

- The broker and client against each other and against hand-built packets: malformed
  lengths, oversized packets, a wrong password, no credentials, a second client with the
  same id, keep-alive expiry, the connect timeout, too many connections, the rate limit,
  QoS 2, wildcard topics, addresses refused.
- A stand-in Meshtastic radio publishing the documented JSON (node information and text)
  and taking the documented downlink, through Outpost's broker and through another
  broker; a message heard once, a posted one sent once, the radio's own echo not kept.
- Against a real Mosquitto (2.1.2 on a Mac, 2.1.4 in Docker), with a stand-in radio
  (mosquitto_pub and mosquitto_sub): the household broker link in and out, plain and over
  TLS with a household CA; Find, Test (right and wrong password, an access list that
  forbids the root topic), and dynamic security (status, adding a radio account, an
  account without the right).
  From inside Outpost's container on a Raspberry Pi, a Mosquitto published on the Pi
  answered at the container's gateway.
- A stand-in MeshCore companion over TCP: start-up, channel names, messages waiting,
  sending, the connection dropping and coming back. The frame reader against noise,
  frames split across reads, and an oversized frame.
- The local-only guard; the passwords absent from replies, log lines, the database and a
  backup; the 0600 file; erase-everything taking the set-up and the password.
- The settings screen's states and the Messages channel switch; one browser at phone
  width exchanging a message both ways with a stand-in radio over MQTT.

Not tested: **any real radio**, of either kind; a real serial device (that Node's terminal stream
reads and writes a terminal device was checked by hand on a pseudo-terminal; Outpost's
opening of a radio was not run); a Meshtastic radio's actual JSON for a text
message (Meshtastic's page shows only a node-information example, so a text is accepted
as a string payload or as `payload.text`); MeshCore's network port (its source for that
could not be read; it is assumed to use the same frames as USB, as its FAQ implies);
what a radio does with Outpost's broker's deviations above.

## What a person with a real radio should try first

1. A Meshtastic ESP32 radio (a Heltec V3, a LilyGO T-Beam) with Outpost as the broker:
   set the radio as above, then watch the status line go to "A radio connected" and "Last
   heard". If it never connects, the radio's own serial log shows the MQTT error.
2. Send from another Meshtastic radio on LongFast and see it arrive on Messages; check
   the sender's name appears once the radio's node information has been heard.
3. Write on the LongFast channel in Outpost and see it arrive on the other radio. If
   Outpost says "No radio is taking messages to send", the `mqtt` channel with Downlink
   on is missing or the radio was not restarted.
4. Note whether the radio publishes Outpost's message back (Outpost should not show it
   twice), and what the radio's JSON for a text message really looks like.
5. A MeshCore USB companion: plug in, Refresh, choose it, and exchange a message on the
   public channel; then unplug and plug in again and see it come back.

## Licence position

Read on 17 November 2026 (quotations in [sources.md](sources.md#mesh-radio-read-2026-11-17)).

- **Meshtastic**: its firmware and its protocol definition files (`meshtastic/protobufs`)
  are under the GNU GPL version 3. No Meshtastic code, protocol file or code generated
  from one is in this repository. What is built is the MQTT JSON interface as
  Meshtastic's public documentation page "MQTT" describes it: topics, field names and
  the downlink message, in `apps/server/src/modules/mesh/meshtastic/json.ts`, each rule
  commented with what the page says.
- **Meshtastic's binary client API** (USB serial and TCP port 4403) was **not built**.
  Its documentation page gives the framing (0x94 0xc3, a two-byte length) but no field
  numbers: it sends the reader to `mesh.proto` in the GPL-licensed protobufs repository.
  Sending and receiving a text message needs the field numbers of `ToRadio`,
  `FromRadio`, `MeshPacket`, `Data` and the port numbers, which are published only
  there. Taking them from those files into this MIT repository would be copying from
  GPL material, which this project does not do; so that route stops here.
- **Meshtastic's name**: its trademark page says third parties may not use the marks "as
  a trademark for your product" and that a site must say "clearly that it is not
  affiliated with or endorsed by Meshtastic". Outpost says it "works with" radios
  running Meshtastic, with that sentence on the settings screen and here.
- **MeshCore**: its repository is under the MIT licence ("Copyright (c) 2025 Scott
  Powell / rippleradios.com"). Outpost implements the frame format read in its
  `src/helpers/ArduinoSerialInterface.cpp` and the commands in its
  `docs/companion_protocol.md`, in `apps/server/src/modules/mesh/meshcore/frames.ts` and
  `session.ts`, written fresh; no MeshCore code is copied, so no notice is needed in the
  code, and the source is credited here and in sources.md.
- **MQTT**: written from the OASIS MQTT 3.1.1 standard; no MQTT library's code is used.
