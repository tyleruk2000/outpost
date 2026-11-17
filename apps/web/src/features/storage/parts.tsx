/** Small pieces the Storage dialogs share. */
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { type ReactNode, type Ref, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/**
 * On a phone a dialog with a form in it becomes a sheet that fills the screen: the
 * title stays at the top, the content scrolls, and the buttons stay within reach of a
 * thumb at the foot. From `md` up it is the ordinary centred dialog. Pass to
 * `DialogContent` as `className`.
 */
export const phoneSheet =
  "max-md:inset-0 max-md:h-dvh max-md:max-h-none max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:border-0 max-md:pt-[env(safe-area-inset-top)] max-md:data-[state=open]:animate-sheet max-md:[&>header]:items-center max-md:[&>header_button]:size-11";

/**
 * The scrolling part of a dialog, as a column. The children must not shrink: in a
 * flex column that scrolls, they would be squeezed together instead of scrolling.
 */
export const dialogColumn = "flex flex-col gap-5 [&>*]:shrink-0";

/** The sheet's action bar: buttons share the width, clear of the phone's home indicator. Pass to `DialogFooter`. */
export const phoneSheetFooter =
  "max-md:flex-nowrap max-md:pb-[max(0.875rem,env(safe-area-inset-bottom))] max-md:[&>button]:min-w-0 max-md:[&>button]:flex-1";

/** A setting with its explanation; the whole row is the target, not just the switch. */
export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-small font-medium text-ink">{label}</span>
        {description ? <span className="block text-small text-ink-muted">{description}</span> : null}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
    </label>
  );
}

/** The end of a long path, which is the part that tells folders apart. */
export function tailPath(path: string, keep = 2): string {
  const segments = path.split("/").filter(Boolean);
  return segments.length <= keep + 1 ? path : `…/${segments.slice(-keep).join("/")}`;
}

/** Text to use exactly as written, with where it goes and a button that copies it. */
export function CopyBlock({ label, text, className }: { label: string; text: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const pre = useRef<HTMLPreElement>(null);
  const copy = async () => {
    const copied = await copyText(text);
    if (!copied && pre.current) {
      // Leave the text selected so it can be copied by hand.
      const range = document.createRange();
      range.selectNodeContents(pre.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    setState(copied ? "copied" : "failed");
    window.setTimeout(() => setState("idle"), 2500);
  };
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-control border border-border", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface py-1 pr-1 pl-3">
        <span className="min-w-0 truncate font-mono text-[0.8125rem] text-ink-muted">{label}</span>
        <Button variant="ghost" size="sm" onClick={copy} aria-label={`Copy the text for ${label}`} className="max-md:h-11">
          {state === "copied" ? <Check /> : <Copy />}
          <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : "Copy"}</span>
        </Button>
      </div>
      <pre ref={pre} className="scroll-quiet overflow-x-auto px-3 py-2.5 font-mono text-[0.8125rem] leading-relaxed text-ink">
        {text}
      </pre>
    </div>
  );
}

/** Typing a name must not be "corrected" by a phone keyboard. */
export const plainText = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false } as const;

export const rememberDescription = "Kept in this Mac’s Keychain, not by Outpost, so the share can be connected again after a restart.";

export function PasswordInput({
  value,
  onChange,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  ref?: Ref<HTMLInputElement>;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input
        {...props}
        {...plainText}
        type={shown ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="current-password"
        maxLength={255}
        required
        className="pr-11"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setShown(!shown)}
        aria-label={shown ? "Hide the password" : "Show the password"}
        aria-pressed={shown}
        className="absolute top-1/2 right-1 -translate-y-1/2 max-md:right-0 max-md:size-11"
      >
        {shown ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}

/** Where a person is in a short sequence, in words: "Step 2 of 4 / Sign in". */
export function StepLine({ step, of, label }: { step: number; of: number; label: string }) {
  return (
    <p className="border-b border-border px-5 py-2.5 text-small text-ink-muted" aria-current="step">
      Step {step} of {of}
      <span className="mx-2 text-border-strong" aria-hidden>
        /
      </span>
      <span className="font-semibold text-ink">{label}</span>
    </p>
  );
}
