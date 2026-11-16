/**
 * What to do when the trainer cannot be heard. Shown on every tab that plays or keys a
 * tone, once something has asked for sound: a browser that has not let the page play
 * yet says so, and the line about a phone's silent switch and volume is always there
 * beside the tone settings, because a page cannot tell that a phone is muted.
 */
import { VolumeX } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Notice } from "@/components/page";
import { getSidetone, type SoundState } from "./sidetone";

export function useSoundState(): SoundState {
  const tone = getSidetone();
  return useSyncExternalStore(
    (listener) => tone.subscribe(listener),
    () => tone.soundState(),
  );
}

/** The plain line about a muted phone, for beside the tone and volume. */
export const MUTED_PHONE_HINT =
  "No sound? On an iPhone, check the silent switch on its side is not showing orange, and turn the volume up with the buttons on the side. On any phone or computer, check the browser tab is not muted.";

export function SoundNotice({ className }: { className?: string }) {
  const state = useSoundState();
  if (state === "unsupported")
    return (
      <Notice tone="warning" icon={<VolumeX />} title="This browser cannot play the tone" className={className}>
        It has no Web Audio. Keying and decoding still work; for sound, open Outpost in a current Safari, Chrome, Firefox or Edge.
      </Notice>
    );
  if (state !== "suspended") return null;
  return (
    <Notice tone="warning" icon={<VolumeX />} title="The browser has not let this page play sound yet" className={className}>
      Tap Play or a key once more: browsers start sound only from a press. {MUTED_PHONE_HINT}
    </Notice>
  );
}
