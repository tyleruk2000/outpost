/**
 * What has to stay powered at home for the map of who is out to keep working in a power
 * cut (outpost-ywbh.9), for each way of setting up a receiver. The devices are offered by
 * the names they have in Power and batteries, where each figure is the maker's own with
 * its source; where no maker publishes one, it says so.
 */
import { Link } from "react-router";
import { Disclosure } from "@/components/page";

const SETUPS = [
  {
    name: "A radio on a Digirig, or an SDR, plugged into the Pi",
    keep: "The Raspberry Pi, with the radio or SDR on it; and the Wi-Fi the phones reach Outpost by.",
    devices:
      "Raspberry Pi; RTL-SDR Blog V4 or V3 for an SDR. The radio on its own battery. A Digirig's maker publishes no current: measure it with a USB meter, or leave room for it.",
  },
  {
    name: "A radio or SDR on a Mac or Windows computer",
    keep: "The Raspberry Pi, the computer with the decoder (kept from sleeping), the radio, and the router between them.",
    devices:
      "Raspberry Pi; the computer; the router. A laptop on its own battery lasts as long as its battery does with the decoder running.",
  },
  {
    name: "A mesh radio on the Wi-Fi",
    keep: "The Raspberry Pi, the mesh radio, and the router: the radio reaches Outpost over the Wi-Fi.",
    devices: "Raspberry Pi; Heltec WiFi LoRa 32 V3 (Meshtastic) with its Wi-Fi on; the router.",
  },
];

export function PowerCut() {
  return (
    <Disclosure summary="In a power cut: what must stay on at home">
      <div className="grid gap-3 text-small text-ink">
        <p>
          Someone goes out with an APRS or Meshtastic radio and the people at home watch the map. That works in a power cut only while these
          have power:
        </p>
        <ul className="grid gap-2">
          {SETUPS.map((setup) => (
            <li key={setup.name}>
              <p className="font-medium">{setup.name}</p>
              <p>{setup.keep}</p>
              <p className="text-ink-muted">In Power and batteries: {setup.devices}</p>
            </li>
          ))}
        </ul>
        <p>
          The router can be left out: the Pi can make a Wi-Fi network of its own for the phones (the installer's hotspot.sh, explained in
          the set-up guide). A mesh radio on the Wi-Fi then has to join that network instead, and a decoder on another computer has to be on
          it too.
        </p>
        <p>
          <Link to="/tools/power" className="text-primary underline underline-offset-2">
            Work out how long a battery lasts in Power and batteries
          </Link>
          . Add the devices above; the figures there are each maker's own, with its source, and none was measured by Outpost.
        </p>
      </div>
    </Disclosure>
  );
}
