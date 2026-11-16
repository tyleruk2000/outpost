/** Pieces the Encryption screen and encrypted pages share. */
import { Check, CircleAlert, CircleHelp, Copy, Download, Eye, EyeOff, LockKeyhole, ShieldCheck, TriangleAlert } from "lucide-react";
import { type FormEvent, type InputHTMLAttributes, type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge, Checkbox } from "@/components/ui/misc";
import { copyText } from "@/features/downloads/copy";
import { errorMessage } from "@/lib/api";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import type { SignatureResult } from "./engine";
import { download, fingerprintGroups, formatFingerprint, keyLabel } from "./format";
import { canUsePrivate, type ShelfKey, unlock } from "./keys-data";
import { assessPassphrase, type PassphraseVerdict, suggestPassphrase } from "./passphrase";
import { UNLOCK_IDLE_MS } from "./session";

export const IDLE_MINUTES = Math.round(UNLOCK_IDLE_MS / 60_000);

// ── Fingerprints ────────────────────────────────────────────────────────────

/** A fingerprint in full, in groups of four with a wider gap in the middle, for comparing by eye or aloud. */
export function Fingerprint({ value, className }: { value: string; className?: string }) {
  const groups = fingerprintGroups(value);
  const half = groups.length / 2;
  return (
    <span
      role="img"
      aria-label={`Fingerprint ${groups.join(" ")}`}
      data-fingerprint={value}
      className={cn("inline-flex flex-wrap gap-x-[1.25ch] gap-y-0.5 font-mono text-[0.8125rem] leading-5 text-ink", className)}
    >
      {[groups.slice(0, half), groups.slice(half)].map((side) => (
        <span key={side.join("")} className="flex gap-x-[0.75ch] whitespace-nowrap" aria-hidden>
          {side.map((group, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the groups of one fingerprint never reorder, and two may be alike
            <span key={index}>{group}</span>
          ))}
        </span>
      ))}
    </span>
  );
}

export function CopyButton({
  text,
  label = "Copy",
  done = "Copied",
  size = "sm",
}: {
  text: string;
  label?: string;
  done?: string;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size={size}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else toast.error("This browser would not copy that. Select the text and copy it by hand.");
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? done : label}
    </Button>
  );
}

export const copyFingerprint = (fingerprint: string) => formatFingerprint(fingerprint);

// ── Passphrases ─────────────────────────────────────────────────────────────

/** A passphrase field that never offers to remember what is typed, with a button to show it. */
export function PassphraseInput({
  shown,
  onShownChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { shown?: boolean; onShownChange?(shown: boolean): void }) {
  const [own, setOwn] = useState(false);
  const visible = shown ?? own;
  const toggle = () => (onShownChange ? onShownChange(!visible) : setOwn(!visible));
  return (
    <div className={cn("relative", className)}>
      <Input
        {...props}
        type={visible ? "text" : "password"}
        // Not a login: a password manager offering to save or fill this would put the passphrase somewhere else.
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        className={cn("pr-11", visible && "font-mono text-[0.9375rem]")}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={visible ? "Hide passphrase" : "Show passphrase"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-control text-ink-muted hover:text-ink"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export interface NewPassphraseState {
  passphrase: string;
  again: string;
  /** The passphrase this form last suggested, so that its exact strength can be credited. */
  suggested: string | null;
}
export const emptyNewPassphrase: NewPassphraseState = { passphrase: "", again: "", suggested: null };

/** What a new passphrase has to be good enough for. "advice" refuses nothing: it only says what it sees. */
export type PassphraseDemand = "device" | "network" | "advice";

export function newPassphraseVerdict(state: NewPassphraseState, demand: PassphraseDemand, facts: readonly string[] = []) {
  const verdict = assessPassphrase(state.passphrase, { suggested: state.suggested, facts });
  const strongEnough = demand === "advice" ? state.passphrase.length > 0 : demand === "network" ? verdict.networkOk : verdict.deviceOk;
  const matches = state.passphrase === state.again;
  return { verdict, strongEnough, matches, ok: strongEnough && matches && state.passphrase.length > 0 };
}

/** Choosing a passphrase: typed twice, or suggested and shown so that it can be written down. */
export function NewPassphrase({
  state,
  onChange,
  demand,
  facts,
  label = "Passphrase",
}: {
  state: NewPassphraseState;
  onChange(next: NewPassphraseState): void;
  demand: PassphraseDemand;
  facts?: readonly string[];
  label?: string;
}) {
  const [shown, setShown] = useState(false);
  const { verdict, strongEnough, matches } = newPassphraseVerdict(state, demand, facts);
  const typed = state.passphrase.length > 0;
  return (
    <div className="grid gap-3">
      <Field
        label={label}
        hint={
          typed ? (
            <PassphraseSummary verdict={verdict} ok={strongEnough} />
          ) : (
            "Long beats clever. Outpost can suggest one that is strong for certain."
          )
        }
      >
        {(ids) => (
          <div className="flex flex-wrap gap-2">
            <PassphraseInput
              {...ids}
              className="min-w-[14rem] flex-1"
              value={state.passphrase}
              shown={shown}
              onShownChange={setShown}
              onChange={(event) => onChange({ ...state, passphrase: event.target.value })}
            />
            <Button
              onClick={() => {
                const suggested = suggestPassphrase();
                // Shown, because the only way to keep it is to write it down.
                setShown(true);
                onChange({ passphrase: suggested, again: suggested, suggested });
              }}
            >
              Suggest one
            </Button>
          </div>
        )}
      </Field>
      <Field label={`${label}, again`} error={typed && state.again.length > 0 && !matches ? "The two do not match." : undefined}>
        {(ids) => (
          <PassphraseInput
            {...ids}
            value={state.again}
            shown={shown}
            onShownChange={setShown}
            onChange={(event) => onChange({ ...state, again: event.target.value })}
          />
        )}
      </Field>
    </div>
  );
}

function PassphraseSummary({ verdict, ok }: { verdict: PassphraseVerdict; ok: boolean }) {
  return (
    <span className={cn("flex items-start gap-1.5", ok ? "text-ink-muted" : "text-warning")}>
      {ok ? <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
      <span className={ok ? undefined : "text-ink"}>{verdict.summary}</span>
    </span>
  );
}

// ── Armoured output ─────────────────────────────────────────────────────────

/** Armoured text to take away: shown whole, with Copy and Save. */
export function ArmorOutput({
  label,
  value,
  filename,
  rows = 9,
  hint,
}: {
  label: string;
  value: string;
  filename: string;
  rows?: number;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      {(ids) => (
        <div className="grid gap-2">
          <Textarea {...ids} readOnly value={value} rows={rows} spellCheck={false} className="font-mono text-[0.8125rem] leading-5" />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={value} />
            <Button size="sm" onClick={() => download(value, filename, "text/plain")}>
              <Download /> Save as a file
            </Button>
          </div>
        </div>
      )}
    </Field>
  );
}

// ── Keys in lists ───────────────────────────────────────────────────────────

/** What a key can do on this device, and anything wrong with it, in words. */
export function KeyBadges({ entry }: { entry: ShelfKey }) {
  const { info } = entry;
  return (
    <>
      {info.status === "revoked" ? (
        <Badge tone="danger">
          <CircleAlert /> Revoked
        </Badge>
      ) : info.status === "expired" ? (
        <Badge tone="warning">
          <TriangleAlert /> Expired{info.expiresAt ? ` ${formatDate(info.expiresAt)}` : ""}
        </Badge>
      ) : info.status === "invalid" ? (
        <Badge tone="danger">
          <CircleAlert /> Not valid
        </Badge>
      ) : null}
      {entry.mine ? (
        canUsePrivate(entry) ? (
          <Badge tone="primary">Decrypts and signs here</Badge>
        ) : (
          <Badge>Encrypts only: private key not here</Badge>
        )
      ) : (
        <Badge>Encrypts and checks signatures only</Badge>
      )}
    </>
  );
}

/** Asks for a key's passphrase and unlocks it for the idle time. */
export function UnlockForm({
  entry,
  onUnlocked,
  submitLabel = "Unlock",
  autoFocus,
}: {
  entry: ShelfKey;
  onUnlocked?(): void;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      await unlock(entry, passphrase);
      setPassphrase("");
      onUnlocked?.();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="grid gap-2">
      <Field
        label={`Passphrase for ${keyLabel(entry.info)}’s key`}
        error={error ?? undefined}
        hint={`The key stays unlocked in this tab for ${IDLE_MINUTES} minutes after its last use, and is forgotten when you leave this screen.`}
      >
        {(ids) => (
          <div className="flex flex-wrap gap-2">
            <PassphraseInput
              {...ids}
              className="min-w-[14rem] flex-1"
              value={passphrase}
              autoFocus={autoFocus}
              onChange={(event) => setPassphrase(event.target.value)}
            />
            <Button type="submit" variant="primary" loading={busy} disabled={!passphrase}>
              {busy ? null : <LockKeyhole />} {submitLabel}
            </Button>
          </div>
        )}
      </Field>
    </form>
  );
}

/** Keys to encrypt to, as a list of tick boxes. */
export function RecipientPicker({
  keys,
  selected,
  onChange,
  legend = "Encrypt to",
}: {
  keys: ShelfKey[];
  selected: ReadonlySet<string>;
  onChange(next: Set<string>): void;
  legend?: string;
}) {
  const id = useId();
  const usable = keys.filter((entry) => entry.info.canEncrypt);
  const unusable = keys.length - usable.length;
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1.5 text-small font-medium text-ink">{legend}</legend>
      {usable.length === 0 ? (
        <p className="text-small text-ink-muted">
          There is no key to encrypt to yet. Make one, or add someone’s public key, on the Keys tab.
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {usable.map((entry) => {
            const checked = selected.has(entry.fingerprint);
            const inputId = `${id}-${entry.fingerprint}`;
            return (
              <li key={entry.fingerprint} className="flex min-h-11 items-center gap-3 py-2">
                <Checkbox
                  id={inputId}
                  checked={checked}
                  onCheckedChange={(next) => {
                    const copy = new Set(selected);
                    if (next === true) copy.add(entry.fingerprint);
                    else copy.delete(entry.fingerprint);
                    onChange(copy);
                  }}
                />
                <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer text-small">
                  <span className="font-medium text-ink">{keyLabel(entry.info)}</span>
                  {entry.mine ? <span className="text-ink-muted"> (your key)</span> : null}
                  {entry.info.email ? <span className="text-ink-muted"> {entry.info.email}</span> : null}
                  <span className="block font-mono text-[0.75rem] text-ink-muted">
                    … {fingerprintGroups(entry.fingerprint).slice(-4).join(" ")}
                  </span>
                </label>
                {!entry.mine && entry.checkedAt === null ? <Badge tone="warning">Not checked</Badge> : null}
              </li>
            );
          })}
        </ul>
      )}
      {unusable > 0 ? (
        <p className="text-small text-ink-muted">
          {unusable === 1 ? "One key is" : `${unusable} keys are`} left out because {unusable === 1 ? "it is" : "they are"} expired, revoked
          or cannot encrypt.
        </p>
      ) : null}
    </fieldset>
  );
}

// ── Signatures ──────────────────────────────────────────────────────────────

/**
 * What a signature check found, stated exactly. A good signature proves which key
 * signed and that the text is unchanged. It proves who signed only as far as someone
 * has checked whose key that is, so the two are never run together.
 */
export function SignatureReport({ signatures, keys }: { signatures: readonly SignatureResult[]; keys: readonly ShelfKey[] }) {
  if (signatures.length === 0) {
    return (
      <SignatureLine tone="neutral" icon={<CircleHelp />} title="Not signed">
        Nothing says who wrote this. Anyone who has the key it was encrypted to, or the passphrase, could have made it.
      </SignatureLine>
    );
  }
  return (
    <div className="grid gap-2">
      {signatures.map((signature) => {
        const signer = signature.fingerprint ? keys.find((entry) => entry.fingerprint === signature.fingerprint) : undefined;
        const when = signature.signedAt ? ` on ${formatDateTime(signature.signedAt)}` : "";
        const key = `${signature.keyId}-${signature.status}`;
        if (signature.status === "unknown-key" || !signer) {
          return (
            <SignatureLine key={key} tone="neutral" icon={<CircleHelp />} title="Signature not checked">
              It was made by a key with the ID <span className="font-mono text-[0.8125rem]">{signature.keyId.toUpperCase()}</span>, which is
              not among your keys, so there was nothing to check it against. This says nothing either way about the text. Add the signer’s
              public key and check again.
            </SignatureLine>
          );
        }
        const name = keyLabel(signer.info);
        if (signature.status === "bad") {
          return (
            <SignatureLine key={key} tone="danger" icon={<CircleAlert />} title="Bad signature">
              The signature names {name}’s key, but it does not match this text: the text or the signature was changed after signing, or it
              was never signed by that key. Do not rely on it.
            </SignatureLine>
          );
        }
        if (signature.status === "unusable-key") {
          return (
            <SignatureLine key={key} tone="warning" icon={<TriangleAlert />} title="Signature by a key that is no longer good">
              It was made{when} by {name}’s key, which is expired or revoked{signature.detail ? ` (${signature.detail})` : ""}. Treat the
              text as unsigned.
            </SignatureLine>
          );
        }
        return (
          <SignatureLine key={key} tone="success" icon={<ShieldCheck />} title="Good signature">
            <p>
              This text is exactly what was signed{when} by the key <Fingerprint value={signer.fingerprint} className="align-middle" />.
            </p>
            <p className="mt-1">
              {signer.mine && canUsePrivate(signer)
                ? `That is your own key (${name}).`
                : signer.checkedAt !== null
                  ? `You marked that key as checked with its owner, ${name}, on ${formatDate(signer.checkedAt)}.`
                  : `The key says it belongs to ${signer.info.userIds[0] ?? name}, but nobody at this device has checked that. Until the fingerprint has been compared with its owner, this proves only that the holder of that key signed it.`}
            </p>
          </SignatureLine>
        );
      })}
    </div>
  );
}

function SignatureLine({
  tone,
  icon,
  title,
  children,
}: {
  tone: "success" | "danger" | "warning" | "neutral";
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const tones = {
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
    neutral: "bg-surface text-ink-muted",
  };
  return (
    <div data-signature={tone} className={cn("flex items-start gap-3 rounded-panel px-4 py-3 text-small", tones[tone])}>
      <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 text-ink">{children}</div>
      </div>
    </div>
  );
}

/** A bordered working area inside a tab: a form in progress, or its result. */
export function Panel({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-panel border border-border p-4 md:p-5", className)}>
      {title ? <h3 className="mb-3 text-body font-semibold text-ink">{title}</h3> : null}
      {children}
    </div>
  );
}
