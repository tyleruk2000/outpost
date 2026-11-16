/**
 * Files: encrypt one chosen from this device, or decrypt one, and save the result.
 *
 * The file is read a piece at a time and never sent anywhere. The result is held by the
 * browser until it is saved, so the size that can be handled is bounded by what the
 * browser will hold; `MAX_FILE_BYTES` is the largest size this was tested with.
 */
import { formatBytes } from "@outpost/shared";
import { CircleAlert, Download, FileLock, FileUp, LockKeyholeOpen } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Checkbox, Progress, Segmented } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { type DecryptedFile, getEngine, type MessageNeeds } from "./engine";
import { download, keyLabel, safeDownloadName } from "./format";
import { canUsePrivate, type Shelf, useUnlocked } from "./keys-data";
import {
  emptyNewPassphrase,
  type NewPassphraseState,
  newPassphraseVerdict,
  Panel,
  PassphraseInput,
  RecipientPicker,
  SignatureReport,
  UnlockForm,
} from "./parts";
import { unlockedKey } from "./session";
import { OptionalPassphrase, SignerPicker } from "./text-tab";

/**
 * The largest file taken for encrypting. A file of this size was encrypted and decrypted
 * through this screen in Chromium and came back identical; see docs/encryption.md for the
 * times and what limits it.
 */
export const MAX_FILE_BYTES = 512 * 1024 * 1024;
/** An encrypted file is a little larger than what is in it, and one written as text is larger by a third. */
export const MAX_ENCRYPTED_FILE_BYTES = Math.ceil(MAX_FILE_BYTES * 1.4);
const NO_SIGNER = "none";

type Mode = "encrypt" | "decrypt";

function FileChooser({ file, onFile, label, limit }: { file: File | null; onFile(file: File | null): void; label: string; limit: number }) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [tooLarge, setTooLarge] = useState<File | null>(null);
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-ink">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => input.current?.click()}>
          <FileUp /> {file ? "Choose another file" : "Choose a file"}
        </Button>
        {file ? (
          <p className="min-w-0 text-small text-ink">
            <span className="break-all font-medium">{file.name}</span>{" "}
            <span className="tabular text-ink-muted">{formatBytes(file.size)}</span>
          </p>
        ) : (
          <p className="text-small text-ink-muted">Up to {formatBytes(limit)}. It is read on this device and not uploaded.</p>
        )}
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const chosen = event.target.files?.[0] ?? null;
          event.target.value = "";
          if (chosen && chosen.size > limit) {
            setTooLarge(chosen);
            onFile(null);
            return;
          }
          setTooLarge(null);
          onFile(chosen);
        }}
      />
      {tooLarge ? (
        <p role="alert" className="text-small text-danger">
          “{tooLarge.name}” is {formatBytes(tooLarge.size)}, and this screen takes up to {formatBytes(limit)}: the result is held by the
          browser until it is saved, and that is the largest size it has been tested with. For a larger file use GnuPG on the computer
          itself (gpg --encrypt, gpg --decrypt), which works with files of any size.
        </p>
      ) : null}
    </div>
  );
}

function Working({ read, total, label }: { read: number; total: number; label: string }) {
  return (
    <div className="grid gap-1.5">
      <Progress value={total > 0 ? read / total : null} label={label} />
      <p className="tabular text-small text-ink-muted" role="status">
        {label}: {formatBytes(read)} of {formatBytes(total)}
      </p>
    </div>
  );
}

function Result({ blob, name, onClear, children }: { blob: Blob; name: string; onClear(): void; children?: React.ReactNode }) {
  return (
    <Panel>
      <div className="grid gap-4">
        <p className="text-small text-ink">
          <span className="break-all font-medium">{name}</span> <span className="tabular text-ink-muted">{formatBytes(blob.size)}</span> is
          ready. It is held in this tab until you save it or leave.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => download(blob, name)}>
            <Download /> Save {name}
          </Button>
          <Button onClick={onClear}>Clear</Button>
        </div>
        {children}
      </div>
    </Panel>
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

function EncryptFile({ shelf }: { shelf: Shelf }) {
  const unlocked = useUnlocked();
  const armorId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [recipients, setRecipients] = useState<Set<string>>(new Set());
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState<NewPassphraseState>(emptyNewPassphrase);
  const [signer, setSigner] = useState(NO_SIGNER);
  const [armor, setArmor] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chosen = shelf.keys.filter((entry) => recipients.has(entry.fingerprint));
  const passphraseOk = !usePassphrase || newPassphraseVerdict(passphrase, "advice").ok;
  const signerReady = signer === NO_SIGNER || unlocked.has(signer);
  const busy = progress !== null;
  const ready = file !== null && (chosen.length > 0 || usePassphrase) && passphraseOk && signerReady && !busy;

  const encrypt = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      const engine = await getEngine();
      const signWith = signer === NO_SIGNER ? undefined : (unlockedKey(signer) ?? undefined);
      if (signer !== NO_SIGNER && !signWith) throw new Error("The signing key was locked again. Unlock it and try again.");
      const blob = await engine.encryptFile(
        file,
        file.name,
        {
          recipients: chosen.map((entry) => entry.publicKey),
          passphrase: usePassphrase ? passphrase.passphrase : undefined,
          signWith,
          armor,
        },
        setProgress,
      );
      setResult({ blob, name: `${safeDownloadName(file.name, "file")}.${armor ? "asc" : "gpg"}` });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="grid gap-5">
      <FileChooser
        file={file}
        limit={MAX_FILE_BYTES}
        label="File to encrypt"
        onFile={(next) => {
          setFile(next);
          setResult(null);
          setError(null);
        }}
      />
      <RecipientPicker keys={shelf.keys} selected={recipients} onChange={setRecipients} />
      <OptionalPassphrase
        enabled={usePassphrase}
        onEnabled={setUsePassphrase}
        state={passphrase}
        onChange={setPassphrase}
        alone={chosen.length === 0}
        what="the file"
      />
      <SignerPicker shelf={shelf} value={signer} onChange={setSigner} optional />
      <div className="flex min-h-11 items-center gap-2.5 md:min-h-0">
        <Checkbox id={armorId} checked={armor} onCheckedChange={(next) => setArmor(next === true)} />
        <label htmlFor={armorId} className="cursor-pointer text-small text-ink">
          Write it as text (.asc), a third larger, for pasting into a message. Otherwise a compact .gpg file.
        </label>
      </div>
      <ErrorNotice error={error} />
      {busy && file ? <Working read={progress ?? 0} total={file.size} label="Encrypting" /> : null}
      <div>
        <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void encrypt()}>
          {busy ? null : <FileLock />} Encrypt file
        </Button>
      </div>
      {result ? (
        <Result blob={result.blob} name={result.name} onClear={() => setResult(null)}>
          <p className="text-small text-ink-muted">
            The original file is untouched and still unencrypted where it was. The name of the file is stored inside the encrypted one; its
            size shows from the outside.
          </p>
        </Result>
      ) : null}
    </div>
  );
}

// ── Decrypt ─────────────────────────────────────────────────────────────────

function DecryptFile({ shelf }: { shelf: Shelf }) {
  const unlocked = useUnlocked();
  const [file, setFile] = useState<File | null>(null);
  const [needs, setNeeds] = useState<MessageNeeds | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<(DecryptedFile & { name: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNeeds(null);
    setResult(null);
    setError(null);
    if (!file) return;
    let cancelled = false;
    getEngine()
      .then((engine) => engine.fileNeeds(file))
      .then(
        (found) => !cancelled && setNeeds(found),
        (failure: unknown) => !cancelled && setError(errorMessage(failure)),
      );
    return () => {
      cancelled = true;
    };
  }, [file]);

  const addressed = useMemo(
    () => (needs ? shelf.keys.filter((entry) => entry.info.keyIds.some((id) => needs.keyIds.includes(id))) : []),
    [needs, shelf.keys],
  );
  const usable = addressed.filter(canUsePrivate);
  const firstLocked = usable.find((entry) => !unlocked.has(entry.fingerprint));
  const anyUnlocked = usable.some((entry) => unlocked.has(entry.fingerprint));
  const busy = progress !== null;
  const ready = file !== null && needs?.encrypted === true && !busy && (anyUnlocked || (needs.passphrase && passphrase.length > 0));

  const decrypt = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      const engine = await getEngine();
      const keys = usable.map((entry) => unlockedKey(entry.fingerprint)).filter((key) => key !== null);
      const opened = await engine.decryptFile(
        file,
        {
          keys,
          passphrase: needs?.passphrase && passphrase ? passphrase : undefined,
          verifyWith: shelf.keys.map((entry) => entry.publicKey),
        },
        setProgress,
      );
      setPassphrase("");
      const stripped = file.name.replace(/\.(gpg|pgp|asc)$/i, "");
      // The name inside the message is only a suggestion from whoever encrypted it: it is cleaned, and the browser decides where it goes.
      const name =
        safeDownloadName(opened.filename ?? "", "") ||
        safeDownloadName(stripped === file.name ? `${file.name}.decrypted` : stripped, "decrypted-file");
      setResult({ ...opened, name });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="grid gap-5">
      <FileChooser file={file} limit={MAX_ENCRYPTED_FILE_BYTES} label="File to decrypt (.gpg, .pgp or .asc)" onFile={setFile} />
      {needs?.encrypted ? (
        <div className="grid gap-4">
          {needs.keyIds.length > 0 ? (
            <p className="text-small text-ink-muted">
              {addressed.length > 0
                ? `Encrypted to ${addressed.map((entry) => `${keyLabel(entry.info)}${entry.mine ? " (your key)" : ""}`).join(", ")}.`
                : `Encrypted to a key that is not in your lists (ID ${needs.keyIds.map((id) => id.toUpperCase()).join(", ")}).`}
            </p>
          ) : null}
          {firstLocked ? <UnlockForm entry={firstLocked} /> : null}
          {needs.passphrase ? (
            <Field label={needs.keyIds.length > 0 ? "Or the file’s passphrase" : "The file’s passphrase"}>
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
            <Notice tone="warning" title="None of your keys on this device can open this file">
              It was encrypted to a key whose private half is not here.
            </Notice>
          ) : null}
        </div>
      ) : null}
      {needs && !needs.encrypted ? (
        <Notice tone="info" title="This file is not encrypted">
          It may be signed only. There is nothing in it to decrypt.
        </Notice>
      ) : null}
      <ErrorNotice error={error} />
      {busy && file ? <Working read={progress ?? 0} total={file.size} label="Decrypting" /> : null}
      <div>
        <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void decrypt()}>
          {busy ? null : <LockKeyholeOpen />} Decrypt file
        </Button>
      </div>
      {result ? (
        <Result blob={result.blob} name={result.name} onClear={() => setResult(null)}>
          <p className="text-small text-ink-muted">The whole file passed its integrity check before it was offered here.</p>
          <SignatureReport signatures={result.signatures} keys={shelf.keys} />
        </Result>
      ) : null}
    </div>
  );
}

export function FilesTab({ shelf }: { shelf: Shelf }) {
  const [mode, setMode] = useState<Mode>("encrypt");
  return (
    <div>
      <Segmented<Mode>
        label="What to do with the file"
        value={mode}
        onChange={setMode}
        options={[
          { value: "encrypt", label: "Encrypt" },
          { value: "decrypt", label: "Decrypt" },
        ]}
      />
      <div className="mt-6 max-w-[46rem]">{mode === "encrypt" ? <EncryptFile shelf={shelf} /> : <DecryptFile shelf={shelf} />}</div>
      <p className="mt-8 max-w-[70ch] text-small text-ink-muted">
        An encrypted file is saved to this device like any download. It is not added to the library: the library keeps files it can read and
        search (PDF, EPUB, Markdown, text, images), and an encrypted file is none of those to anything but its key.
      </p>
    </div>
  );
}
