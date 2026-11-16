# QR codes and devices on this network

Two small tools under Tools: one makes QR codes on the device, the other lists what
answers on the network the computer running Outpost is on.

## QR codes (`/tools/qr`)

Makes a code a phone's camera reads, from: text or a web address; a Wi-Fi network (name,
security, password, hidden or not); a contact, typed or chosen from Contacts; a phone
number; an email address; a saved place from the map.

### Made on this device, and nothing typed leaves it

The code is made in the browser by Outpost's own encoder
(`apps/web/src/features/qr/encoder.ts`). What is typed on this screen stays in the
page's memory: it is not sent to the server, not stored there or in the browser's
storage, not logged, and not put in the address. Spell checking and autocomplete are
switched off in every field (some browsers send a field's words to a spelling service),
and the Wi-Fi password field is marked so that password managers do not offer to keep
it. The screen says so in one line.

The only requests the screen makes are ones a person chooses: listing their own
contacts or saved places when they start from one (the contact list is fetched whole and
narrowed in the browser, so a name typed to find someone is not sent), fetching the one
contact chosen, and "Add to library", which sends the printed sheet. The end-to-end test
`e2e/tests/qr.mobile.spec.ts` makes a Wi-Fi code at phone width and asserts that no
request left the page meanwhile (other than the browser fetching the app's own files
under `/assets/`), and that nothing typed is in the address or the browser's storage.

### What goes in each code

The forms follow ZXing's "Barcode Contents" page
(<https://github.com/zxing/zxing/wiki/Barcode-Contents>, read 16 November 2026), which
is where the conventions phone readers follow are written down:

- **Wi-Fi**: `WIFI:T:WPA;S:<name>;P:<password>;H:true;;`. `T` is `WPA` (which phones
  read as WPA, WPA2 or WPA3 personal), `WEP` or `nopass`; `P` is left out for an open
  network; `H:true` only for a hidden one. In the page's words: "Special characters `\`,
  `;`, `,`, `"` and `:` should be escaped with a backslash (`\`) as in MECARD encoding."
  The Wi-Fi Alliance also defines a `WIFI:` URI in its WPA3 specification (registered
  with IANA as the provisional `wifi` scheme, which points to it), with percent-encoding
  instead of backslashes; the specification's text could not be read without a download
  form, so it was not used. ZXing's form is the one camera apps read.
- **Contact**: a vCard 3.0 with only the fields chosen (no PRODID, UID or REV, which
  would make the code larger), escaped exactly as Outpost's own vCard writer escapes
  (`escapeText` in `apps/server/src/modules/contacts/vcard.ts`; the browser has its own
  copy so that a typed contact never goes to the server). From Contacts, the name is
  always in, the first phone number and first email are ticked, and every other field
  (organisation, other numbers, addresses, web addresses, the note) can be ticked in;
  the screen says that each one more makes the code denser.
- **Phone**: `tel:` with the number less spaces and brackets; a "(0)" after a country
  code is dropped, since it is not dialled from abroad.
- **Email**: `mailto:` with the address.
- **Saved place**: `geo:lat,lon` (RFC 5870) to six decimal places. The name of the
  place is not in the code (`geo:` has no field for one); it is on the sheet.

### The encoder

Written from ISO/IEC 18004:2015: numeric, alphanumeric and byte modes, with the text
split into the shortest mix of them (a shortest-path search over the characters, the
method Annex J outlines); byte mode carries UTF-8 with no ECI header, which is what phone
readers expect; versions 1 to 40 at all four levels of error correction; Reed-Solomon
over GF(256) with the polynomial 0x11D; the block structure of Table 9; the eight masks
scored by the four penalty rules; format information (BCH(15,5), masked with 0x5412) and
version information (BCH(18,6)) from version 7. No library is used at run time.

How it is checked (`encoder.test.ts`, `render.test.ts`, `qr-page.test.tsx`):

- The data and error-correction codewords of ISO/IEC 18004's Annex I example
  ("01234567", version 1-M) and of Thonky's QR code tutorial ("HELLO WORLD", 1-M).
- The format information strings for each level, the version information of versions
  7 and 40, and the alignment pattern positions of versions 2, 7, 32, 36 and 40.
- The capacities of Table 7 at the limits: 7,089 digits, 4,296 alphanumeric characters
  and 2,953 bytes at 40-L, 1,273 bytes at 40-H, 17 bytes at 1-L; one more does not fit.
- Every symbol made in the tests is read back by an independent decoder, jsQR (a
  development dependency only): ten versions from 1 to 40 at each of the four levels,
  each of the eight masks, text in Greek, Japanese, Arabic, Russian, Hindi, accented
  Latin and emoji at every level, mixed-mode text, a Wi-Fi code and a vCard. The screen
  tests read the code from the SVG on the screen the same way.
- By hand, once: a PNG saved from the screen and the PDF sheet (rendered by macOS Quick
  Look) were both read back by jsQR to the exact Wi-Fi text, with a Greek network name.

Not checked: a real phone's camera reading a code from a screen or from paper. No phone
was available to the build; decoding was verified only with jsQR, which is not the
reader built into iOS or Android.

### On the screen

The code is drawn as SVG, black on white in both themes (readers expect dark squares on
a light ground), with the four-module margin the standard asks for. Under it: what it
holds, a line each, and what a phone does with it. A Wi-Fi password is written in words
only when "Write the password in words, here and on the printed sheet" is ticked;
otherwise it says "in the code, not written here".

- **Error correction**: L, M (the default), Q or H, each explained in one sentence by
  how much of the code can be lost and still read (about 7%, 15%, 25% and 30%, as the
  standard puts it).
- **How large to print**: "at least 5 cm wide, not counting the white margin, for a
  phone to read it from arm's length (about 50 cm)". That is a rule of thumb, not part
  of the standard, which leaves size to the reader: the code a tenth as wide as the
  distance it is read from, as QR code publishers give it (Bitly, "What's the minimum
  size for a QR code?"; Scanova, "QR code scanning distance"; read 16 November 2026).
  The screen says it is a rule of thumb, and for a code over 45 modules wide adds that
  it needs more room or less in it. The PDF and the browser's print put the code 8 cm
  wide.
- **Save as PNG** and **Save as SVG** (made in the browser, saved from memory),
  **Copy picture** where the browser allows it (only on a secure page: the screen says
  so otherwise, and points to "HTTPS on your network" in Settings), **Copy text** (works
  on a plain http page), and **Print**.
- **The sheet as a PDF**: one page of A4 or US Letter with the heading, the code drawn
  as vector squares 8 cm wide, and the lines of what it holds, through the shared
  **Save as PDF**, **Add to library** and **Share**. The file is dated by the day it is
  made. "Add to library" asks first for a Wi-Fi code (the code holds the password
  whether or not it is written in words; the library is readable by everyone on the
  network and is in every backup) and for a contact (another person's details).

QR Code is a registered trademark of DENSO WAVE INCORPORATED.

## Devices on this network (`/tools/network`)

A list of what answers on **the networks the computer running Outpost is itself on**:
a NAS, a printer, a radio's network interface, a Raspberry Pi whose address has been
forgotten. Nothing else.

### What is looked at

The server reads the computer's own interfaces (`os.networkInterfaces()`) when the
screen is opened and again when a scan starts. Nothing in a request can name a range:
`POST /api/network/scan` takes no body. The rules (`apps/server/src/modules/network/subnets.ts`,
each tested in `apps/server/test/network-subnets.test.ts`):

- **Swept**, one address at a time: IPv4 private networks (RFC 1918: `10.0.0.0/8`,
  `172.16.0.0/12`, `192.168.0.0/16`) and link-local ones (RFC 3927: `169.254.0.0/16`).
- **Narrowed**: a network larger than a /22 (1,022 addresses) is swept only in the /24
  the computer is in. The screen says so, with the sizes.
- **Listened on, never swept**: IPv6 unique-local (RFC 4193: `fc00::/7`) and link-local
  (RFC 4291: `fe80::/10`) networks. A /64 has 2^64 addresses; what the computer already
  knows of and what announces itself is listed.
- **Not looked at**, with the reason on the screen: a public address (IPv4 or IPv6), the
  shared range carriers and VPNs use (RFC 6598: `100.64.0.0/10`), loopback, a tunnel
  (an interface named `utun`, `tun`, `tap`, `wg`, `tailscale`, `zt`, `ppp`, `ipsec`,
  `gif` or `stf`: a VPN leads to a network somewhere else), Apple's peer-to-peer Wi-Fi
  link (`awdl`, `llw`), and a /31 or /32. Another network reached through a router is
  never looked at: only the networks of the computer's own interfaces are, and an
  address found that is not on one of them (in the neighbour table, or announced) is
  dropped.

### What a scan sends

Discovery only, in this order (`scan.ts`):

1. Meanwhile, what devices already announce is read from the computer's own listener
   for Bonjour/mDNS (below). That listener sends only the standard questions every
   phone sends to find a printer; nothing is sent to a device.
2. Each address of each swept network is sent **one ping** (one ICMP echo request). An
   address that does not answer is sent **one connection attempt on port 80**, and if
   that is not answered either (no reply at all, not even a refusal), **one on port
   443**. A connection that opens is closed at once; nothing is sent over it. A refusal
   counts as an answer: something is there. These two ports are the whole list
   (`NETWORK_SCAN_LIMITS.ports`); they are there for devices that ignore ping.
3. **At most 20 probes a second and 8 waiting at once**, each waiting 1 second for an
   answer. One scan at a time (a second is refused with `409`); a scan is a job, shown
   with its progress, and can be stopped. A scan stopped part of the way keeps nothing.
   A /24 is 253 pings and up to 506 connection attempts. Each probe that gets no answer
   waits its second, eight at a time, so on a home /24 that is mostly empty a scan takes
   one to two minutes.
4. The computer's **neighbour table** is read (ARP for IPv4, NDP for IPv6). Every probe
   above first made the computer ask "who has this address?" on the local network, so
   a device that ignored the probe itself is still there, with its hardware address.
5. A device that did not announce a name of its own is given the one the **system's
   resolver** has for its address (`dns.lookupService`, which is the operating system's
   `getnameinfo`: `/etc/hosts`, mDNS on macOS, and the DNS server the computer is set
   to use, usually the router). Nothing else is asked. If the computer is set to use a
   public DNS service, that service is asked for the names of private addresses, as it
   is whenever any program on the computer does this.

Not done, by design: no other port is tried, no service is asked anything, nothing is
logged in to, nothing is checked for weaknesses, no traffic is captured, and no
special rights are asked for or assumed. The screen says all of this in a few lines
before the first scan.

A device that offers a web page (it announces `_http._tcp` or `_https._tcp`, or a
connection on port 80 or 443 opened during the scan) gets a plain link, "Open its web
page". The link is opened by the person's browser; Outpost never fetches it. A device
that answered the ping is not tried on port 80, so no link is guessed for it.

### On each kind of computer

What is used, all of it without special rights (`system.ts`):

| | macOS | Linux and a Raspberry Pi | In a container (the Docker image) |
| --- | --- | --- | --- |
| Ping | `/sbin/ping` (macOS lets anyone send a ping) | `ping` if installed and usable without root, found out once by pinging 127.0.0.1 (Debian and Raspberry Pi OS usually install it with the right to; not checked here) | not installed: connection attempts only |
| Connection attempts | Node's `net.connect` | the same | the same |
| Neighbour table | `arp -an`, `ndp -an` | `ip neigh show`, or `/proc/net/arp` (IPv4 only) without iproute2 | `/proc/net/arp` |
| Router | `route -n get default` | `/proc/net/route` | `/proc/net/route` |
| Announcements | `dns-sd` (first the kinds of service announced, then the devices announcing each, then where each is: at most 40 kinds and 80 devices, each question given 1.5 seconds) | `avahi-browse --all --resolve --parsable --terminate` if Avahi is installed (the `avahi-utils` package) | none |
| Names | the system's resolver | the same | the same |

Where something is missing, the screen says what and what it means ("Ping cannot be
used here…", "Avahi is not installed…"); the scan goes on with the rest. Programs are
started with `execFile` by full path with a list of arguments, never through a shell,
each with a time limit (as the network-share feature does,
`modules/storage/shares/commands.ts`). The parsers of each program's output are tested
against recorded samples with made-up addresses
(`apps/server/test/network-neighbours.test.ts`).

**In a container** the app sees the container's own network, which Docker made, not
the home's (`host.inContainer` in `GET /api/system`). The screen says so and offers no
scan, rather than showing a list of nothing. On Linux, a container run with host
networking (`network_mode: host` in `compose.yaml`) does see the computer's network;
set `OUTPOST_HOST_NETWORK=true` to tell Outpost so. Docker Desktop on a Mac or Windows
runs containers in a virtual machine, and its host networking does not put a container
on the home network in this way.

What was tried on which: the parsers against recorded output for each system; the scan
against a made-up network in the tests; one real scan of the network of the Mac it was
built on (below). Not tried on Linux, a Raspberry Pi or in a container with host
networking.

### What is kept, and who sees it

Each device found is kept (`network_devices`, migration 0016) with its addresses,
hardware address, the name it gave itself, what it announces, when it was first and
last seen, and whether it is this computer or the router. A person can give it a name
of their own and a note. A device is known by its hardware address where the neighbour
table has one, else by its address. The last twenty scans are kept (`network_scans`)
with what they found and sent, which is how the screen says what is new since the scan
before and what was not seen in the last one.

Device names can be people's names ("Anna's iPhone"). So the list is shown on this
screen only: it is **not put in search**, nothing about devices is written to the log
(a finished scan logs its counts), and it leaves Outpost only when someone presses
"Copy the list" or "Save as CSV" (a CSV cell that a spreadsheet would read as a formula
is written as text). It is counted under Storage → Database and in what "Erase
everything" would take, it is removed by "Erase everything", and a device can be
forgotten one at a time or all at once on the screen. It is in the database, and so in
backups.

Phones and many computers now make up a hardware address for each network they join
(it has the "locally administered" bit set). The screen says so for such a device, and
no maker is looked up for it. Such a phone may also change it from time to time, and is
then listed as a new device.

### Who made each device

The first half of a hardware address is a prefix the IEEE Registration Authority
assigns to a maker. The IEEE publishes the list (MA-L, the large blocks) at
<https://standards-oui.ieee.org/oui/oui.csv>, offered for download from
<https://standards.ieee.org/products-programs/regauth/>. Read on 16 November 2026, the
pages state no licence or permission to pass the file on, and the site's footer says
"© Copyright 2026 IEEE – All rights reserved". So **none of it is bundled with
Outpost**. A person who wants makers shown presses "Fetch the registry from the IEEE"
(about 3.9 MB: 3,876,189 bytes when looked at on 16 November 2026), once; it is fetched
through the guarded HTTP client from that host only (every redirect held to it), kept
in the data directory as `network/oui.csv`, and can be removed again. Without it, no
maker is shown. Only the large blocks are read; the medium and small blocks (MA-M,
MA-S) are in other files and are not fetched. This is the only thing on the screen that
uses the internet.

### The real scan, once

On 16 November 2026 the scan was run once by hand on the Mac it was built on (macOS,
with ping, the neighbour tables, `dns-sd` and the router all available), against its
own home network: one /24 swept, and the IPv6 link-local and unique-local networks
listened on. It found 24 devices, 11 of them with a name, 4 with a made-up hardware
address and 3 seen only over IPv6; it sent 725 probes and took 122 seconds. No device's
name, address or hardware address from it is in this repository.

That run showed one fault, since fixed: three devices were marked "this computer",
because macOS gives its loopback and tunnel interfaces link-local addresses (`fe80::1`)
that the router uses too, and neighbours on those other links were counted. Now only
the interfaces being looked at count, for this computer's own addresses and for the
neighbour table (tested with a made-up computer that has such a tunnel). The real scan
was not run again after the fix.

### Starting a scan from another device

Anyone who can open Outpost can start a scan, as with every other action: it is not
limited to the computer itself (`isLocalRequest`). See
[security.md](security.md#devices-on-this-network) for why.

### Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `OUTPOST_HOST_NETWORK` | off | Tells Outpost, in a container, that the container shares the computer's network (host networking), so that a scan is offered. |
| `OUTPOST_IEEE_OUI_URL` | the IEEE's address | Where the registry is fetched from, for a mirror or for tests. |
| `OUTPOST_NETWORK_STAND_IN` | unset | For tests only: a JSON file describing a made-up computer and network (`apps/server/test/fixtures/network/stand-in.ts`), used in place of this one. Nothing is sent anywhere. The end-to-end suite sets it. |
