/**
 * The decoders on the Raspberry Pi Outpost runs on (outpost-ywbh.3), switched on and off
 * with one press. Shown only where the installer set up its helper (deploy/pi/install.sh
 * --decoders). The helper does the starting and stopping; Outpost leaves it a request and
 * shows what it says back: what is running, the devices it found, and the decoder's last
 * lines, which for Dire Wolf give the audio level to set the radio's volume by.
 */
import { PI_DECODERS, type PiDecoder, type PiDecodersStatus } from "@outpost/shared";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/misc";
import { ScrollBox } from "@/features/radio/scroll-box";
import { timeAgo } from "@/lib/utils";
import { usePiDecoder } from "./data";

const NAMES: Record<PiDecoder, { name: string; what: string; kind: "sound" | "sdr"; port: string }> = {
  direwolf: { name: "Dire Wolf", what: "APRS, from a radio on a sound interface or an SDR", kind: "sound", port: "KISS on port 8001" },
  readsb: { name: "readsb", what: "Aircraft, from an SDR on 1090 MHz", kind: "sdr", port: "SBS on port 30003" },
  "ais-catcher": { name: "AIS-catcher", what: "Ships, from an SDR on the marine band", kind: "sdr", port: "NMEA on port 10110" },
};

export function PiDecoders({ status, disabled }: { status: PiDecodersStatus; disabled: boolean }) {
  const request = usePiDecoder();
  const [devices, setDevices] = useState<Partial<Record<PiDecoder, string>>>({});
  return (
    <section aria-labelledby="pi-decoders" className="grid gap-3 border-t border-border pt-5">
      <h3 id="pi-decoders" className="text-body font-semibold text-ink">
        Decoders on this Raspberry Pi
      </h3>
      <p className="text-small text-ink-muted">
        Installed by the installer and switched off until you switch one on here. Not yet tried on a real Pi.
        {status.at ? ` The Pi last reported ${timeAgo(status.at)}.` : " The Pi has not reported yet."}
        {status.pending ? " A request is waiting for the Pi to act on it." : ""}
      </p>
      {status.lastError ? (
        <p role="alert" className="text-small text-danger">
          {status.lastError}
        </p>
      ) : null}
      <ul className="divide-y divide-border border-y border-border">
        {PI_DECODERS.map((id) => {
          const decoder = status.decoders.find((entry) => entry.id === id)!;
          const about = NAMES[id];
          const choices = status.devices.filter((device) => device.kind === about.kind || (id === "direwolf" && device.kind === "sdr"));
          const chosen = devices[id] ?? decoder.device ?? choices[0]?.id;
          return (
            <li key={id} className="grid gap-2 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-small font-medium text-ink">
                    {about.name} <span className="font-normal text-ink-muted">· {about.what}</span>
                  </p>
                  <p className="text-small text-ink">
                    {!decoder.installed
                      ? "Not installed on this Pi."
                      : decoder.running
                        ? `Running${decoder.device ? ` on ${decoder.device}` : ""}, offering ${about.port}.`
                        : "Installed, switched off."}
                  </p>
                </div>
                {decoder.installed ? (
                  decoder.running ? (
                    <Button
                      size="sm"
                      disabled={disabled}
                      loading={request.isPending}
                      onClick={() => request.mutate({ decoder: id, action: "stop" })}
                    >
                      Switch off
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={disabled || !chosen}
                      loading={request.isPending}
                      onClick={() => request.mutate({ decoder: id, action: "start", device: chosen ?? null })}
                    >
                      Switch on
                    </Button>
                  )
                ) : null}
              </div>
              {decoder.installed && !decoder.running ? (
                choices.length > 0 ? (
                  <Select
                    aria-label={`Device for ${about.name}`}
                    value={chosen}
                    disabled={disabled}
                    onChange={(device) => setDevices({ ...devices, [id]: device })}
                    options={choices.map((device) => ({ value: device.id, label: device.name }))}
                    className="w-80 max-w-full"
                  />
                ) : (
                  <p className="text-small text-ink-muted">
                    The Pi found no {about.kind === "sound" ? "sound device or SDR" : "SDR"}. Plug it in, then look again.
                  </p>
                )
              ) : null}
              {decoder.log.length > 0 ? (
                <ScrollBox
                  label={`What ${about.name} last wrote`}
                  className="max-h-40 overflow-auto rounded-control bg-surface px-2 py-1.5"
                >
                  <pre className="font-mono text-micro text-ink">{decoder.log.join("\n")}</pre>
                </ScrollBox>
              ) : null}
              {id === "direwolf" && decoder.running ? (
                <p className="text-small text-ink-muted">
                  Each packet heard shows "audio level = 52(13/8)". Turn the radio's volume until most stations show about 50, as Dire
                  Wolf's guide suggests.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => request.mutate({ decoder: "direwolf", action: "refresh" })}>
          <RefreshCw aria-hidden /> Look again
        </Button>
      </div>
    </section>
  );
}
