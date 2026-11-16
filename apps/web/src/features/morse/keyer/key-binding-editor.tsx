/**
 * Choosing the keys that key the trainer: press the button, then the key. A USB paddle
 * interface that types keys is set up the same way, by pressing the paddle instead.
 */
import { Keyboard } from "lucide-react";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { applyMorsePrefs, type KeyType, keyCodeLabel, useMorsePrefs } from "../prefs";

type Slot = "keyDit" | "keyDah" | "keyStraight";

function BindButton({ slot, label, code }: { slot: Slot; label: string; code: string }) {
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === "Escape") {
        setCapturing(false);
        return;
      }
      applyMorsePrefs({ [slot]: event.code });
      setCapturing(false);
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [capturing, slot]);

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-small font-medium text-ink">{label}</span>
      <button
        type="button"
        onClick={() => setCapturing(true)}
        aria-label={
          capturing ? `${label}: press a key, or Escape to keep ${keyCodeLabel(code)}` : `${label}: ${keyCodeLabel(code)}. Change`
        }
        className={cn(
          "inline-flex h-9 min-w-28 items-center justify-center gap-1.5 rounded-control border px-3 text-small max-md:h-11",
          capturing ? "border-primary bg-primary-soft text-primary-soft-ink" : "border-border-strong bg-page text-ink hover:bg-surface",
        )}
      >
        {capturing ? (
          "Press a key…"
        ) : (
          <>
            <Keyboard aria-hidden className="size-4" />
            <kbd className="font-sans">{keyCodeLabel(code)}</kbd>
          </>
        )}
      </button>
    </div>
  );
}

export function KeyBindingEditor({ keyType }: { keyType: KeyType }) {
  const prefs = useMorsePrefs();
  return (
    <div className="grid gap-3">
      {keyType === "straight" ? (
        <BindButton slot="keyStraight" label="Key" code={prefs.keyStraight} />
      ) : (
        <>
          <BindButton slot="keyDit" label="Dit paddle" code={prefs.keyDit} />
          <BindButton slot="keyDah" label="Dah paddle" code={prefs.keyDah} />
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="morse-swap" className="text-small font-medium text-ink">
              Swap paddles
            </label>
            <Switch id="morse-swap" checked={prefs.swapPaddles} onCheckedChange={(checked) => applyMorsePrefs({ swapPaddles: checked })} />
          </div>
        </>
      )}
      <p className="text-small text-ink-muted">
        A USB paddle interface that types keys works here: press the paddle when asked for a key, and it becomes your key.
      </p>
    </div>
  );
}
