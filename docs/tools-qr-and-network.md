# QR codes and devices on this network

## QR codes (`/tools/qr`)

Makes a code a phone's camera reads, from text or a web address, a Wi-Fi network (name,
security, password, hidden or not), a contact (typed or from Contacts), a phone number, an
email address, or a saved place.

The code is made in the browser. What you type stays on this page: it is not sent to the
server, stored, logged or put in the address, and spell checking is off in every field.
The only requests are ones you choose: listing your contacts or saved places, and **Add to
library**.

For Wi-Fi, choose WPA for WPA2 and WPA3 personal networks too. A contact holds only the
fields you tick (from Contacts: the name, first number and first email); each extra field
makes the code denser. A saved place's code holds its position but not its name, which is on
the printed sheet.

Saved places, routes and radio ranges on Maps have their own **QR code** too
([map-places.md](map-places.md#a-place-a-route-or-a-range-on-a-phone-by-qr-code)).

### On the screen

The code is black on white in both themes, with the margin readers need. Under it is what
it holds and what a phone does with it. A Wi-Fi password is written in words only if you
tick **Write the password in words, here and on the printed sheet**.

- **Error correction**: L, M (the default), Q or H: about 7%, 15%, 25% or 30% of the code
  can be lost and still read.
- **How large to print**: at least 5 cm wide, not counting the margin, to read from arm's
  length. That is a rule of thumb (a tenth of the reading distance), not part of the
  standard. Dense codes need more room or less in them.
- **Save as PNG**, **Save as SVG**, **Copy picture** (secure pages only), **Copy text** and
  **Print**.
- **The sheet as a PDF**: one page of A4 or US Letter with the code 8 cm wide, through
  **Save as PDF**, **Add to library** and **Share**. **Add to library** asks first for a
  Wi-Fi code (the code holds the password whether or not it is written; the library is
  readable by everyone on the network and is in every backup) and for a contact.

QR Code is a registered trademark of DENSO WAVE INCORPORATED.

## Devices on this network (`/tools/network`)

Lists what answers on **the networks the computer running Outpost is itself on**: a NAS, a
printer, a radio's network interface, a Raspberry Pi whose address you forgot. Nothing
else.

### What is looked at

- **Swept**: private and link-local IPv4 networks (`10.0.0.0/8`, `172.16.0.0/12`,
  `192.168.0.0/16`, `169.254.0.0/16`); on one larger than 1,022 addresses, only the /24 the
  computer is in.
- **Listened on, never swept**: IPv6 local networks.
- **Not looked at**: public addresses, `100.64.0.0/10`, loopback, VPN tunnels, and any
  network beyond a router. The screen gives the reason for each.

### What a scan sends

Discovery only:

1. What devices announce over Bonjour/mDNS is read (the questions every phone asks to find
   a printer).
2. Each address gets **one ping**; if no answer, **one connection attempt on port 80**, then
   **one on port 443**, closed at once with nothing sent. No other port is tried.
3. At most 20 probes a second. One scan at a time, with progress, and it can be stopped. A
   home /24 takes one to two minutes.
4. The computer's neighbour table is read, so a device that ignored the probes still shows.
5. Unnamed devices get the name the computer's resolver (usually the router) has. If the
   computer uses a public DNS service, that service is asked, as for any program.

Names devices announce are never looked up through public DNS. Nothing is logged in to,
tested for weaknesses or captured.

A device offering a web page gets a link, **Open its web page**, which your browser opens;
Outpost never fetches it.

### On each kind of computer

- **macOS**: everything works without special rights.
- **Linux and a Raspberry Pi**: ping is used if it works without root. Announcements need
  Avahi (the `avahi-utils` package).
- **In a container**: Outpost sees Docker's own network, not your home's, so no scan is
  offered. On Linux, with host networking (`network_mode: host` in `compose.yaml`), set
  `OUTPOST_HOST_NETWORK=true` to allow it. Docker Desktop on a Mac or Windows cannot do
  this.

Where something is missing, the screen says what and what it means, and the scan goes on
with the rest.

### What is kept, and who sees it

Each device is kept with its addresses, name and when it was first and last seen; give it a
name and note of your own. The last twenty scans are kept, to say what is new or gone.

Device names can be people's names ("Anna's iPhone"), so the list is shown on this screen
only: it is not in search and not written to the log. It leaves Outpost only through **Copy
the list** or **Save as CSV**. It is in backups, counted under Storage, and removed by
**Erase everything**; forget a device, or all of them, on the screen.

Phones often make up a hardware address per network, and may reappear as new devices.

### Who made each device

The first half of a hardware address identifies its maker in the IEEE's registry. The IEEE
states no licence to pass the file on, so **none of it comes with Outpost**. To show makers,
press **Fetch the registry from the IEEE** (about 3.9 MB, from
`standards-oui.ieee.org` only). It is kept in the data directory and can be removed. This is
the only part of the screen that uses the internet.

### Who can start a scan

Anyone who can open Outpost, as with every other action; see
[security.md](security.md#devices-on-this-network). To allow it only from the computer
itself, start Outpost with `OUTPOST_NETWORK_SCAN_LOCAL_ONLY=true`.

| Variable | Default | What it does |
| --- | --- | --- |
| `OUTPOST_HOST_NETWORK` | off | In a container with host networking, offer a scan. |
| `OUTPOST_NETWORK_SCAN_LOCAL_ONLY` | off | Only the computer Outpost runs on may start a scan. |
| `OUTPOST_IEEE_OUI_URL` | the IEEE's address | Where the registry is fetched from, for a mirror. |
