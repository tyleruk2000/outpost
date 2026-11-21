/**
 * How to set up each end, in the app (rule 7 of the epic): the decoder, on a Raspberry Pi,
 * a Mac or Windows, and the address and port to give Outpost. Every command is marked:
 * either it was run and seen to work on the Mac Outpost is developed on (with the version,
 * on 21 November 2026), or it is untried. Facts from outside are from the documents named
 * beside them, read on 21 November 2026.
 */
import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { copyText } from "@/lib/clipboard";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

type Tried = string | false;

/** Lines to copy, with whether they were run. */
function Cmd({ lines, tried, label }: { lines: string[]; tried: Tried; label: string }) {
  const text = lines.join("\n");
  return (
    <div className="mt-1.5 grid gap-1">
      <div className="flex items-start gap-2">
        <pre className="min-w-0 flex-1 overflow-x-auto rounded-control bg-surface px-2.5 py-1.5 font-mono text-[0.8125rem] text-ink">
          {text}
        </pre>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Copy ${label}`}
          onClick={() =>
            void copyText(text).then((done) =>
              done ? toast.success("Copied.") : notify.error("This browser would not copy it. Select it and copy it by hand."),
            )
          }
        >
          <Copy aria-hidden /> Copy
        </Button>
      </div>
      <p className={cn("text-micro", tried ? "text-success" : "text-warning")}>
        {tried ? `Tried: ${tried}.` : "Untried: not yet run by Outpost's makers."}
      </p>
    </div>
  );
}

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="grid gap-1">
      <p className="text-small font-medium text-ink">{title}</p>
      <div className="grid gap-1 text-small text-ink">{children}</div>
    </li>
  );
}

const ON_MAC = "run on a Mac (macOS, Homebrew) on 21 Nov 2026";

function Platforms({ pi, mac, windows }: { pi: ReactNode; mac: ReactNode; windows: ReactNode }) {
  return (
    <Tabs defaultValue="pi">
      <TabsList aria-label="Where the decoder runs">
        <TabsTrigger value="pi">Raspberry Pi</TabsTrigger>
        <TabsTrigger value="mac">Mac</TabsTrigger>
        <TabsTrigger value="windows">Windows</TabsTrigger>
      </TabsList>
      <TabsContent value="pi" className="mt-3">
        <ol className="grid list-decimal gap-3 pl-5">{pi}</ol>
      </TabsContent>
      <TabsContent value="mac" className="mt-3">
        <ol className="grid list-decimal gap-3 pl-5">{mac}</ol>
      </TabsContent>
      <TabsContent value="windows" className="mt-3">
        <ol className="grid list-decimal gap-3 pl-5">{windows}</ol>
      </TabsContent>
    </Tabs>
  );
}

// ── The pieces every guide shares ──

const RECEIVE_ONLY_CONF = ["ACHANNELS 1", "MYCALL NOCALL", "MODEM 1200", "AGWPORT 0", "KISSPORT 8001"];

function DireWolfConf({ adevice, tried }: { adevice: string; tried: Tried }) {
  return (
    <>
      <p>
        A file called direwolf.conf, for listening only. The output device is null, so Dire Wolf cannot send audio to the radio; there is no
        PTT line, no PBEACON, no DIGIPEAT and no IGSERVER, so it never beacons, repeats or reaches the internet. The KISS port is what
        Outpost reads.
      </p>
      <Cmd lines={[adevice, ...RECEIVE_ONLY_CONF]} tried={tried} label="the Dire Wolf configuration" />
    </>
  );
}

function OutpostEnd({ host, port, note }: { host: string; port: number; note?: string }) {
  return (
    <Step title="In Outpost">
      <p>
        Settings, Receivers: add one with the address <span className="font-mono">{host}</span> and port{" "}
        <span className="font-mono tabular">{port}</span>. It says Connected, and when the last packet came.{note ? ` ${note}` : ""}
      </p>
    </Step>
  );
}

const SLEEP_MAC = (
  <p>
    While the Mac sleeps nothing is heard. Keep it awake while the decoder runs by starting it with caffeinate in front, as below. macOS may
    ask whether the program may accept incoming network connections: allow it, or Outpost on the Pi cannot connect.
  </p>
);

const SLEEP_WINDOWS = (
  <p>
    The first time it opens its port, Windows Defender Firewall asks whether to allow it: allow it on private networks. While Windows sleeps
    nothing is heard: in Settings, System, Power, set sleep to Never while it runs.
  </p>
);

// ── APRS ──

export function AprsGuide() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-1 text-small text-ink">
        <p>
          <span className="font-medium">Frequency.</span> 144.800 MHz in Europe (IARU Region 1 VHF Handbook, version 10.03, February 2026);
          145.175 MHz in Australia (WIA band plan 2026). In North America 144.390 MHz is the one Dire Wolf's own SDR example tunes to;
          Outpost could not read a national band plan that names it.
        </p>
        <p>
          <span className="font-medium">The radio.</span> Tuned to that frequency, squelch left open ("Leave squelch open", Dire Wolf's
          guide), the volume set by the audio level below. The radio needs no transmit setting: it only listens.
        </p>
        <p>
          <span className="font-medium">The audio level.</span> Dire Wolf writes it for each packet, as "audio level = 52(13/8)". Its guide
          suggests setting the volume so that most stations average around 50.
        </p>
      </div>
      <Platforms
        pi={
          <>
            <Step title="Install Dire Wolf">
              <p>
                The easy way: run Outpost's installer with --decoders, then switch Dire Wolf on in Settings, Receivers, choosing the sound
                device there.
              </p>
              <p>By hand:</p>
              <Cmd lines={["sudo apt install direwolf"]} tried={false} label="the install command" />
            </Step>
            <Step title="Find the sound interface (a Digirig, an AIOC cable)">
              <p>It is listed as a card; card 1, device 0 is plughw:1,0 (Dire Wolf's guide, "Audio Device selection – Linux ALSA").</p>
              <Cmd lines={["arecord -l"]} tried={false} label="the command that lists sound devices" />
            </Step>
            <Step title="Configure it to listen only">
              <DireWolfConf adevice="ADEVICE plughw:1,0 null" tried={false} />
            </Step>
            <Step title="Start it">
              <Cmd lines={["direwolf -c direwolf.conf"]} tried={false} label="the start command" />
            </Step>
            <Step title="An RTL-SDR instead of a radio">
              <p>
                rtl_fm tunes the SDR and hands its audio to Dire Wolf, which reads it from standard input (Dire Wolf's "Raspberry Pi SDR
                IGate").
              </p>
              <DireWolfConf adevice="ADEVICE stdin null" tried={ON_MAC} />
              <Cmd lines={["rtl_fm -f 144.80M - | direwolf -c direwolf.conf -r 24000 -D 1 -"]} tried={false} label="the SDR command" />
            </Step>
            <OutpostEnd
              host="host.docker.internal"
              port={8001}
              note="That is the Pi itself, seen from inside Outpost's container. Dire Wolf on another computer: that computer's address instead."
            />
          </>
        }
        mac={
          <>
            <Step title="Install Dire Wolf">
              <Cmd lines={["brew install direwolf"]} tried={`${ON_MAC}, Dire Wolf 1.8.1`} label="the install command" />
            </Step>
            <Step title="Find the sound interface">
              <p>
                Started with no ADEVICE line, Dire Wolf lists every sound device by name ("Number of devices = 4 … Name = …") and stops.
                Pick the USB one; a part of its name is enough (Dire Wolf's guide, "Audio Device selection").
              </p>
              <Cmd
                lines={["direwolf -c direwolf.conf"]}
                tried={`${ON_MAC}: it listed the devices`}
                label="the command that lists sound devices"
              />
            </Step>
            <Step title="Configure it to listen only">
              <DireWolfConf adevice='ADEVICE "USB" null' tried={false} />
            </Step>
            <Step title="Start it, kept awake">
              {SLEEP_MAC}
              <Cmd lines={["caffeinate -i direwolf -c direwolf.conf"]} tried={false} label="the start command" />
              <p className="text-ink-muted">
                Dire Wolf's KISS port takes connections from other computers, not only this one (seen listening on every address on the
                Mac).
              </p>
            </Step>
            <Step title="Check it without a radio">
              <p>
                Dire Wolf's gen_packets makes the sound of the packets written in packets.txt, one a line
                ("M0ABC-9&gt;APRS:!5130.00N/00010.00W&gt;Walking"); Dire Wolf then decodes them from standard input, as from an SDR, and
                Outpost connected to port 8001 shows them.
              </p>
              <DireWolfConf adevice="ADEVICE stdin null" tried={ON_MAC} />
              <Cmd
                lines={["gen_packets -r 44100 -o packets.wav packets.txt", "cat packets.wav | direwolf -c direwolf.conf -r 44100 -t 0 -"]}
                tried={`${ON_MAC}: Outpost's tests are built from the packets it decoded`}
                label="the test commands"
              />
            </Step>
            <OutpostEnd host="the Mac's address, such as 192.168.1.20 or my-mac.local" port={8001} />
          </>
        }
        windows={
          <>
            <Step title="Install Dire Wolf">
              <p>
                Download the Windows zip from the releases of github.com/wb2osz/direwolf, unzip it, and open a Command Prompt in that
                folder.
              </p>
            </Step>
            <Step title="Find the sound interface">
              <p>
                When Dire Wolf starts it lists the audio devices with numbers; a part of the name is steadier than the number (Dire Wolf's
                guide, "Audio Device selection - Windows").
              </p>
            </Step>
            <Step title="Configure it to listen only">
              <DireWolfConf adevice='ADEVICE "USB" null' tried={false} />
            </Step>
            <Step title="Start it">
              {SLEEP_WINDOWS}
              <Cmd lines={["direwolf.exe -c direwolf.conf"]} tried={false} label="the start command" />
            </Step>
            <OutpostEnd host="the PC's address, such as 192.168.1.30" port={8001} />
          </>
        }
      />
      <p className="text-small text-ink-muted">
        Examples, not requirements: a Digirig with the cable for your radio, an AIOC cable, an RTL-SDR, or a hardware modem that offers KISS
        over the network (a Mobilinkd or NinoTNC, untried). A UV-5R cannot beacon a position on its own; the person going out needs a radio
        or tracker that can, and an amateur licence to send it.
      </p>
    </div>
  );
}

// ── Aircraft ──

export function AircraftGuide() {
  return (
    <div className="grid gap-4">
      <p className="text-small text-ink">
        An SDR dongle with an aerial for 1090 MHz, and readsb (or dump1090) offering its BaseStation (SBS) text on port 30003, which Outpost
        reads. Outpost reads SBS rather than Beast because SBS carries the decoder's own result, the position already worked out. No
        tracking website is used, for positions or for looking anything up.
      </p>
      <Platforms
        pi={
          <>
            <Step title="Install readsb">
              <p>
                Outpost's installer with --decoders installs it switched off; switch it on in Settings, Receivers. By hand, readsb's own
                install script:
              </p>
              <Cmd
                lines={['sudo bash -c "$(wget -O - https://github.com/wiedehopf/adsb-scripts/raw/master/readsb-install.sh)"']}
                tried={false}
                label="the install command"
              />
            </Step>
            <Step title="Offer SBS">
              <Cmd lines={["readsb --device-type rtlsdr --net --net-sbs-port 30003"]} tried={false} label="the start command" />
            </Step>
            <OutpostEnd host="host.docker.internal" port={30003} />
          </>
        }
        mac={
          <>
            <Step title="Install readsb">
              <Cmd lines={["brew install readsb"]} tried={`${ON_MAC}, readsb 3.16`} label="the install command" />
            </Step>
            <Step title="Start it with the SDR, offering SBS">
              {SLEEP_MAC}
              <Cmd
                lines={["caffeinate -i readsb --device-type rtlsdr --net --net-sbs-port 30003"]}
                tried={false}
                label="the start command"
              />
            </Step>
            <Step title="Check it without an SDR">
              <p>readsb can be given Mode S messages on a raw input port instead of an SDR, and writes what it decodes on the SBS port.</p>
              <Cmd
                lines={["readsb --net-only --net-ri-port=30001 --net-sbs-port=30003"]}
                tried={`${ON_MAC}: Outpost's tests are built from what it wrote`}
                label="the test command"
              />
            </Step>
            <OutpostEnd host="the Mac's address" port={30003} />
          </>
        }
        windows={
          <>
            <Step title="A decoder">
              <p>
                Outpost's makers found no maintained Windows build of readsb or dump1090 that they could check. Any decoder that offers SBS
                on a port will do; give Outpost its address and port.
              </p>
            </Step>
            {SLEEP_WINDOWS}
            <OutpostEnd host="the PC's address" port={30003} />
          </>
        }
      />
      <p className="text-small text-ink-muted">
        Not for navigation or separation. Aircraft are many: Settings on the Heard on the radio screen keep only the last so many hours.
      </p>
    </div>
  );
}

// ── Ships ──

export function ShipsGuide() {
  return (
    <div className="grid gap-4">
      <p className="text-small text-ink">
        An SDR with a marine VHF aerial (AIS is on 161.975 and 162.025 MHz, as gpsd's AIVDM documentation gives them), and AIS-catcher or
        rtl-ais writing NMEA sentences. Outpost connects to AIS-catcher's TCP server; a decoder that only sends UDP (rtl-ais sends to port
        10110 by default) can send to Outpost instead, from the one address you give. AIS-catcher's install for each system is on its
        installation pages (jvde-github.github.io/AIS-catcher-docs).
      </p>
      <Platforms
        pi={
          <>
            <Step title="Start AIS-catcher with a TCP server for NMEA">
              <p>
                Installed by Outpost's installer with --decoders, switched on in Settings, Receivers. By hand ("-S xxx - TCP server for NMEA
                lines at port xxx", AIS-catcher's command line):
              </p>
              <Cmd lines={["AIS-catcher -S 10110"]} tried={false} label="the start command" />
            </Step>
            <OutpostEnd host="host.docker.internal" port={10110} />
          </>
        }
        mac={
          <>
            <Step title="Start AIS-catcher with a TCP server for NMEA">
              {SLEEP_MAC}
              <Cmd lines={["caffeinate -i AIS-catcher -S 10110"]} tried={false} label="the start command" />
            </Step>
            <Step title="Or send to Outpost over UDP">
              <p>
                With a ships receiver set to "It sends to Outpost (UDP)", port 10110, and the Mac's address. Outpost's Pi at 192.168.1.10
                here:
              </p>
              <Cmd lines={["AIS-catcher -u 192.168.1.10 10110"]} tried={false} label="the UDP command" />
            </Step>
            <OutpostEnd host="the Mac's address" port={10110} />
          </>
        }
        windows={
          <>
            <Step title="Start AIS-catcher with a TCP server for NMEA">
              {SLEEP_WINDOWS}
              <Cmd lines={["AIS-catcher.exe -S 10110"]} tried={false} label="the start command" />
            </Step>
            <OutpostEnd host="the PC's address" port={10110} />
          </>
        }
      />
      <p className="text-small text-ink-muted">
        Not for navigation or collision avoidance. Range is line of sight from the aerial: inland there may be nothing to hear. Outpost in
        Docker hears UDP only on a port published for it in compose.yaml (a line such as "10110:10110/udp", untried).
      </p>
    </div>
  );
}

// ── Boards on the Wi-Fi (outpost-ywbh.5) ──

export function BoardsGuide() {
  return (
    <div className="grid gap-3 text-small text-ink">
      <p>Two kinds of small board can hear APRS on their own, with no computer, from the firmware's own documentation and source:</p>
      <div>
        <p className="font-medium">LoRa APRS: a T-Beam, a Heltec or similar with CA2RXU's LoRa_APRS_iGate firmware</p>
        <p>
          It hears LoRa APRS trackers on 433.775 MHz (the firmware's default) and has a KISS TCP server on port 8001 (its tnc_utils.cpp),
          off until "enableServer" is set in its "tnc" settings. Then it is one more APRS receiver: its address and port 8001.
        </p>
        <p className="mt-1">
          Listening only: the firmware transmits if told to. Someone with no amateur licence must leave it as it ships, receive-only, and
          check these settings: beacon "sendViaRF" and "sendViaAPRSIS" off; "aprs_is" "active" off; "digi" "mode" 0; "lora" "txActive" off
          and "rxActive" on. It ships with the callsign NOCALL-10; nothing in its code was found to refuse running with it. Untried with a
          real board.
        </p>
      </div>
      <div>
        <p className="font-medium">VHF APRS: an ESP32 with a VHF module and ESP32APRS firmware</p>
        <p>
          Not readable by Outpost today: its documentation and source offer KISS only over Bluetooth and a serial port, and TNC2 text, with
          no KISS TCP port on the network. Outpost does not use a bridge program, so this waits for the firmware.
        </p>
      </div>
      <p>
        A board runs Meshtastic or LoRa APRS firmware, not both. A Meshtastic radio cannot hear APRS (another frequency and another packet
        format), so the two meet only on Outpost's map; Outpost does not relay between them. Sending LoRa APRS on 433 MHz needs an amateur
        licence; receiving it does not. The older lora-aprs firmware by OE5BPA was archived in September 2025 and points to CA2RXU's.
      </p>
    </div>
  );
}
