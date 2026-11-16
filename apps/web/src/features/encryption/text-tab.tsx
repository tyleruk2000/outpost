/** Text: encrypt, decrypt, sign, and check a signature. All of it happens in this browser. */
import { CircleAlert, LockKeyhole, LockKeyholeOpen, PenLine, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Checkbox, Segmented, Select } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { type DecryptedText, getEngine, type MessageNeeds } from "./engine";
import { keyLabel } from "./format";
import { canUsePrivate, type Shelf, type ShelfKey, useUnlocked } from "./keys-data";
import {
  ArmorOutput,
  CopyButton,
  emptyNewPassphrase,
  NewPassphrase,
  type NewPassphraseState,
  newPassphraseVerdict,
  Panel,
  PassphraseInput,
  RecipientPicker,
  SignatureReport,
  UnlockForm,
} from "./parts";
import { unlockedKey } from "./session";

type Mode = "encrypt" | "decrypt" | "sign" | "verify";
const NO_SIGNER = "none";

/** My keys that can sign here. */
export const signingKeys = (shelf: Shelf): ShelfKey[] =>
  shelf.keys.filter((entry) => entry.mine && canUsePrivate(entry) && entry.info.canSign);

/** Choosing which of my keys signs, with its passphrase asked for in place when it is locked. */
export function SignerPicker({
  shelf,
  value,
  onChange,
  optional,
  label = "Sign as",
}: {
  shelf: Shelf;
  value: string;
  onChange(fingerprint: string): void;
  optional?: boolean;
  label?: string;
}) {
  const unlocked = useUnlocked();
  const signers = signingKeys(shelf);
  const chosen = signers.find((entry) => entry.fingerprint === value);
  if (signers.length === 0) {
    return (
      <p className="text-small text-ink-muted">
        {optional ? "Not signed: " : ""}you have no key of your own on this device to sign with. Make or import one on the Keys tab.
      </p>
    );
  }
  return (
    <div className="grid gap-3">
      <Field
        label={label}
        hint={
          optional
            ? "A signature lets the reader check that the text is yours and was not changed. It also shows them which key wrote it."
            : undefined
        }
      >
        {(ids) => (
          <Select
            {...ids}
            value={value}
            onChange={onChange}
            options={[
              ...(optional ? [{ value: NO_SIGNER, label: "Do not sign" }] : []),
              ...signers.map((entry) => ({
                value: entry.fingerprint,
                label: `${keyLabel(entry.info)}${entry.info.email ? ` (${entry.info.email})` : ""}`,
              })),
            ]}
            className="md:max-w-sm"
          />
        )}
      </Field>
      {chosen && !unlocked.has(chosen.fingerprint) ? <UnlockForm entry={chosen} /> : null}
      {chosen && unlocked.has(chosen.fingerprint) ? (
        <p className="flex items-center gap-1.5 text-small text-ink-muted">
          <LockKeyholeOpen className="size-3.5" aria-hidden /> {keyLabel(chosen.info)}’s key is unlocked.
        </p>
      ) : null}
    </div>
  );
}

/** A passphrase that can open a message on its own, switched on by a tick box. */
export function OptionalPassphrase({
  enabled,
  onEnabled,
  state,
  onChange,
  alone,
  what,
}: {
  enabled: boolean;
  onEnabled(enabled: boolean): void;
  state: NewPassphraseState;
  onChange(state: NewPassphraseState): void;
  /** True when no key is chosen, so the passphrase is the only way in. */
  alone: boolean;
  what: string;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex min-h-11 items-center gap-2.5 md:min-h-0">
        <Checkbox id="encryption-use-passphrase" checked={enabled} onCheckedChange={(next) => onEnabled(next === true)} />
        <label htmlFor="encryption-use-passphrase" className="cursor-pointer text-small text-ink">
          Let a passphrase open it{alone ? "" : " as well"}
        </label>
      </div>
      {enabled ? (
        <>
          <NewPassphrase state={state} onChange={onChange} demand="advice" />
          <p className="text-small text-ink-muted">
            Anyone with the passphrase can open {what}, with no key at all (GnuPG: gpg --decrypt). Agree it with the reader some other way
            than the one {what} travels by.
          </p>
        </>
      ) : null}
    </div>
  );
}

function ErrorNotice({ error }: { error: string | null }) {
  return error ? (
    <Notice tone="danger" icon={<CircleAlert />}>
      {error}
    </Notice>
  ) : null;
}

// ── Encrypt ─────────────────────────────────────────────────────────────────

function EncryptText({ shelf }: { shelf: Shelf }) {
  const unlocked = useUnlocked();
  const [text, setText] = useState("");
  const [recipients, setRecipients] = useState<Set<string>>(new Set());
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState<NewPassphraseState>(emptyNewPassphrase);
  const [signer, setSigner] = useState(NO_SIGNER);
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = shelf.keys.filter((entry) => recipients.has(entry.fingerprint));
  const passphraseOk = !usePassphrase || newPassphraseVerdict(passphrase, "advice").ok;
  const signerReady = signer === NO_SIGNER || unlocked.has(signer);
  const ready = text.length > 0 && (chosen.length > 0 || usePassphrase) && passphraseOk && signerReady;
  const readableByMe = usePassphrase || chosen.some((entry) => entry.mine && canUsePrivate(entry));

  const encrypt = async () => {
    setBusy(true);
    setError(null);
    try {
      const engine = await getEngine();
      const signWith = signer === NO_SIGNER ? undefined : (unlockedKey(signer) ?? undefined);
      if (signer !== NO_SIGNER && !signWith) throw new Error("The signing key was locked again. Unlock it and try again.");
      setOutput(
        await engine.encryptText(text, {
          recipients: chosen.map((entry) => entry.publicKey),
          passphrase: usePassphrase ? passphrase.passphrase : undefined,
          signWith,
        }),
      );
    } catch (failure) {
      setOutput(null);
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <Field label="Text to encrypt">
        {(ids) => (
          <Textarea
            {...ids}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setOutput(null);
            }}
            rows={7}
          />
        )}
      </Field>
      <RecipientPicker
        keys={shelf.keys}
        selected={recipients}
        onChange={(next) => {
          setRecipients(next);
          setOutput(null);
        }}
      />
      {chosen.length > 0 && !readableByMe ? (
        <p className="text-small text-ink-muted">
          You will not be able to read the result yourself: it is encrypted only to other people. Tick a key of your own as well if you want
          to.
        </p>
      ) : null}
      <OptionalPassphrase
        enabled={usePassphrase}
        onEnabled={(next) => {
          setUsePassphrase(next);
          setOutput(null);
        }}
        state={passphrase}
        onChange={(next) => {
          setPassphrase(next);
          setOutput(null);
        }}
        alone={chosen.length === 0}
        what="the message"
      />
      <SignerPicker
        shelf={shelf}
        value={signer}
        onChange={(next) => {
          setSigner(next);
          setOutput(null);
        }}
        optional
      />
      <ErrorNotice error={error} />
      <div>
        <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void encrypt()}>
          {busy ? null : <LockKeyhole />} Encrypt
        </Button>
      </div>
      {output ? (
        <Panel>
          <ArmorOutput
            label="Encrypted message"
            value={output}
            filename="message.asc"
            rows={10}
            hint="Send this whole block, dashes included, by any means you like. Who it is encrypted to, and roughly how long it is, can be read from the outside; what it says cannot."
          />
        </Panel>
      ) : null}
    </div>
  );
}

// ── Decrypt ─────────────────────────────────────────────────────────────────

function DecryptText({ shelf, onSignedOnly }: { shelf: Shelf; onSignedOnly(text: string): void }) {
  const unlocked = useUnlocked();
  const [armored, setArmored] = useState("");
  const [needs, setNeeds] = useState<MessageNeeds | null>(null);
  const [needsError, setNeedsError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [result, setResult] = useState<DecryptedText | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = armored.trim();
  useEffect(() => {
    setNeeds(null);
    setNeedsError(null);
    setResult(null);
    setError(null);
    if (!trimmed) return;
    let cancelled = false;
    getEngine()
      .then((engine) => engine.messageNeeds(trimmed))
      .then(
        (found) => !cancelled && setNeeds(found),
        (failure: unknown) => !cancelled && setNeedsError(errorMessage(failure)),
      );
    return () => {
      cancelled = true;
    };
  }, [trimmed]);

  /** My keys this message is encrypted to, usable ones first. */
  const addressed = useMemo(
    () =>
      needs
        ? shelf.keys
            .filter((entry) => entry.info.keyIds.some((id) => needs.keyIds.includes(id)))
            .sort((a, b) => Number(canUsePrivate(b)) - Number(canUsePrivate(a)))
        : [],
    [needs, shelf.keys],
  );
  const usable = addressed.filter(canUsePrivate);
  const firstLocked = usable.find((entry) => !unlocked.has(entry.fingerprint));
  const anyUnlocked = usable.some((entry) => unlocked.has(entry.fingerprint));
  const hidden = needs?.keyIds.includes("0000000000000000") ?? false;
  const ready = needs?.encrypted === true && (anyUnlocked || (needs.passphrase && passphrase.length > 0));

  const decrypt = async () => {
    setBusy(true);
    setError(null);
    try {
      const engine = await getEngine();
      const keys = usable.map((entry) => unlockedKey(entry.fingerprint)).filter((key) => key !== null);
      const opened = await engine.decryptText(trimmed, {
        keys,
        passphrase: needs?.passphrase && passphrase ? passphrase : undefined,
        verifyWith: shelf.keys.map((entry) => entry.publicKey),
      });
      setPassphrase("");
      setResult(opened);
    } catch (failure) {
      setResult(null);
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <Field
        label="Encrypted message"
        error={needsError ?? undefined}
        hint="Paste the whole block, from -----BEGIN PGP MESSAGE----- to -----END PGP MESSAGE-----."
      >
        {(ids) => (
          <Textarea
            {...ids}
            value={armored}
            onChange={(event) => setArmored(event.target.value)}
            rows={8}
            spellCheck={false}
            className="font-mono text-[0.8125rem] leading-5"
          />
        )}
      </Field>

      {needs && !needs.encrypted ? (
        <Notice
          tone="info"
          title="This is signed, not encrypted"
          action={
            <Button size="sm" onClick={() => onSignedOnly(trimmed)}>
              Check its signature
            </Button>
          }
        >
          The text in it is readable by anyone. What can be checked is who signed it.
        </Notice>
      ) : null}

      {needs?.encrypted ? (
        <div className="grid gap-4">
          {needs.keyIds.length > 0 ? (
            <div className="text-small">
              <p className="font-medium text-ink">Encrypted to</p>
              <ul className="mt-1 grid gap-1 text-ink-muted">
                {addressed.map((entry) => (
                  <li key={entry.fingerprint}>
                    {keyLabel(entry.info)}
                    {entry.mine
                      ? canUsePrivate(entry)
                        ? unlocked.has(entry.fingerprint)
                          ? " (your key, unlocked)"
                          : " (your key, locked)"
                        : " (your key, but its private half is not on this device)"
                      : " (their key: only they can open it with it)"}
                  </li>
                ))}
                {needs.keyIds
                  .filter((id) => id !== "0000000000000000" && !addressed.some((entry) => entry.info.keyIds.includes(id)))
                  .map((id) => (
                    <li key={id}>
                      A key with the ID <span className="font-mono text-[0.8125rem]">{id.toUpperCase()}</span>, which is not in your lists
                    </li>
                  ))}
                {hidden ? <li>A recipient whose key is deliberately not named</li> : null}
              </ul>
            </div>
          ) : null}
          {firstLocked ? <UnlockForm entry={firstLocked} /> : null}
          {needs.passphrase ? (
            <Field label={needs.keyIds.length > 0 ? "Or the message’s passphrase" : "The message’s passphrase"}>
              {(ids) => (
                <PassphraseInput
                  {...ids}
                  className="md:max-w-sm"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
              )}
            </Field>
          ) : null}
          {!needs.passphrase && usable.length === 0 ? (
            <Notice tone="warning" title="None of your keys on this device can open this">
              It was encrypted to a key whose private half is not here. Only the holder of that key can read it.
            </Notice>
          ) : null}
        </div>
      ) : null}

      <ErrorNotice error={error} />
      <div>
        <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void decrypt()}>
          {busy ? null : <LockKeyholeOpen />} Decrypt
        </Button>
      </div>

      {result ? (
        <Panel>
          <div className="grid gap-4">
            <Field label="Decrypted text">
              {(ids) => (
                <Textarea {...ids} readOnly value={result.text} rows={Math.min(16, Math.max(4, result.text.split("\n").length + 1))} />
              )}
            </Field>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={result.text} />
              <Button size="sm" onClick={() => setResult(null)}>
                Clear from the screen
              </Button>
            </div>
            <SignatureReport signatures={result.signatures} keys={shelf.keys} />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

// ── Sign ────────────────────────────────────────────────────────────────────

function SignText({ shelf }: { shelf: Shelf }) {
  const unlocked = useUnlocked();
  const signers = signingKeys(shelf);
  const [text, setText] = useState("");
  const [signer, setSigner] = useState(signers[0]?.fingerprint ?? "");
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = text.trim().length > 0 && signer !== "" && unlocked.has(signer);

  const sign = async () => {
    setBusy(true);
    setError(null);
    try {
      const key = unlockedKey(signer);
      if (!key) throw new Error("The signing key was locked again. Unlock it and try again.");
      setOutput(await (await getEngine()).signText(text, key));
    } catch (failure) {
      setOutput(null);
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <Field
        label="Text to sign"
        hint="The text stays readable by anyone. The signature under it lets them check that it is yours and was not changed."
      >
        {(ids) => (
          <Textarea
            {...ids}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setOutput(null);
            }}
            rows={7}
          />
        )}
      </Field>
      <SignerPicker
        shelf={shelf}
        value={signer}
        onChange={(next) => {
          setSigner(next);
          setOutput(null);
        }}
      />
      <ErrorNotice error={error} />
      <div>
        <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void sign()}>
          {busy ? null : <PenLine />} Sign
        </Button>
      </div>
      {output ? (
        <Panel>
          <ArmorOutput
            label="Signed text"
            value={output}
            filename="signed.asc"
            rows={12}
            hint="Send the whole block. Spaces at the ends of lines are not covered by a signature of this kind; everything else is."
          />
        </Panel>
      ) : null}
    </div>
  );
}

// ── Check a signature ───────────────────────────────────────────────────────

function VerifyText({ shelf, initial }: { shelf: Shelf; initial: string }) {
  const [armored, setArmored] = useState(initial);
  const [result, setResult] = useState<DecryptedText | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await (await getEngine()).verifyText(
          armored,
          shelf.keys.map((entry) => entry.publicKey),
        ),
      );
    } catch (failure) {
      setResult(null);
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5">
      <Field
        label="Signed text"
        hint="Paste the whole block, from -----BEGIN PGP SIGNED MESSAGE----- to -----END PGP SIGNATURE-----. It is checked against every key in your lists."
      >
        {(ids) => (
          <Textarea
            {...ids}
            value={armored}
            onChange={(event) => {
              setArmored(event.target.value);
              setResult(null);
            }}
            rows={10}
            spellCheck={false}
            className="font-mono text-[0.8125rem] leading-5"
          />
        )}
      </Field>
      <ErrorNotice error={error} />
      <div>
        <Button variant="primary" loading={busy} disabled={!armored.trim()} onClick={() => void verify()}>
          {busy ? null : <ShieldCheck />} Check signature
        </Button>
      </div>
      {result ? (
        <Panel>
          <div className="grid gap-4">
            <SignatureReport signatures={result.signatures} keys={shelf.keys} />
            <Field label="The text that was signed">
              {(ids) => (
                <Textarea {...ids} readOnly value={result.text} rows={Math.min(16, Math.max(3, result.text.split("\n").length + 1))} />
              )}
            </Field>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

export function TextTab({ shelf }: { shelf: Shelf }) {
  const [mode, setMode] = useState<Mode>("encrypt");
  const [toVerify, setToVerify] = useState("");
  return (
    <div>
      <Segmented<Mode>
        label="What to do with the text"
        value={mode}
        onChange={setMode}
        options={[
          { value: "encrypt", label: "Encrypt" },
          { value: "decrypt", label: "Decrypt" },
          { value: "sign", label: "Sign" },
          { value: "verify", label: "Check a signature" },
        ]}
        className="max-w-full flex-wrap"
      />
      <div className="mt-6 max-w-[46rem]">
        {mode === "encrypt" ? <EncryptText shelf={shelf} /> : null}
        {mode === "decrypt" ? (
          <DecryptText
            shelf={shelf}
            onSignedOnly={(text) => {
              setToVerify(text);
              setMode("verify");
            }}
          />
        ) : null}
        {mode === "sign" ? <SignText shelf={shelf} /> : null}
        {mode === "verify" ? <VerifyText key={toVerify} shelf={shelf} initial={toVerify} /> : null}
      </div>
    </div>
  );
}
