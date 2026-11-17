/**
 * Keys: making a pair, the list of my keys and other people's, and everything that
 * can be done with one. Private keys are made here in the browser and leave it only in
 * the form their passphrase protects.
 */
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Download, Ellipsis, FileUp, KeyRound, LockKeyholeOpen, Plus, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState, Notice, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Checkbox, Segmented, Select } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { notify } from "@/lib/notify";
import { formatDate } from "@/lib/utils";
import { removeDevicePrivateKey, saveDevicePrivateKey, setKeyChecked } from "./device-keys";
import { getEngine, type KeyAlgorithm, type KeyInfo } from "./engine";
import { download, formatFingerprint, keyLabel, slug } from "./format";
import {
  canUsePrivate,
  deleteKeyFromOutpost,
  encryptionKeys,
  protectedPrivateKey,
  putPrivateKeyOnOutpost,
  putPublicKey,
  removePrivateKeyFromOutpost,
  type Shelf,
  type ShelfKey,
  useUnlocked,
} from "./keys-data";
import {
  ArmorOutput,
  emptyNewPassphrase,
  Fingerprint,
  IDLE_MINUTES,
  KeyBadges,
  NewPassphrase,
  type NewPassphraseState,
  newPassphraseVerdict,
  Panel,
  PassphraseInput,
  UnlockForm,
} from "./parts";
import { assessPassphrase } from "./passphrase";
import { lock, unlockedKey } from "./session";

const YEAR = 365 * 86400;
type Expiry = "1" | "2" | "5" | "never";
type Keeping = "device" | "outpost";

const OUTPOST_WARNING =
  "Anyone on your network can copy a key kept on Outpost and try passphrases against it for as long as they like, so it is only as safe as its passphrase.";

const publicFileName = (info: KeyInfo) => `${slug(keyLabel(info), "key")}-public-${info.keyId.slice(-8)}.asc`;
const privateFileName = (info: KeyInfo) => `${slug(keyLabel(info), "key")}-PRIVATE-${info.keyId.slice(-8)}.asc`;
const revocationFileName = (info: KeyInfo) => `${slug(keyLabel(info), "key")}-revocation-${info.keyId.slice(-8)}.asc`;

function useRefreshShelf() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: encryptionKeys.shelf });
}

/** Two or three choices that each need a sentence of explanation. */
function Choice<T extends string>({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: T;
  onChange(value: T): void;
  options: Array<{ value: T; label: string; detail: ReactNode }>;
}) {
  const name = useId();
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1.5 text-small font-medium text-ink">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control py-1.5">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          <span className="text-small">
            <span className="font-medium text-ink">{option.label}</span>
            <span className="block text-ink-muted">{option.detail}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

// ── Making a key ────────────────────────────────────────────────────────────

interface MadeKey {
  info: KeyInfo;
  publicKey: string;
  privateKey: string;
  revocationCertificate: string;
  keeping: Keeping;
}

function MakeKeyForm({ onMade, onCancel }: { onMade(made: MadeKey): void; onCancel(): void }) {
  const refresh = useRefreshShelf();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [algorithm, setAlgorithm] = useState<KeyAlgorithm>("curve25519");
  const [expiry, setExpiry] = useState<Expiry>("2");
  const [keeping, setKeeping] = useState<Keeping>("device");
  const [passphrase, setPassphrase] = useState<NewPassphraseState>(emptyNewPassphrase);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const facts = [name, email];
  const check = newPassphraseVerdict(passphrase, keeping === "outpost" ? "network" : "device", facts);
  const ready = name.trim().length > 0 && check.ok;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const engine = await getEngine();
      const made = await engine.generateKey({
        name,
        email: email || undefined,
        algorithm,
        expiresInSeconds: expiry === "never" ? 0 : Number(expiry) * YEAR,
        passphrase: passphrase.passphrase,
      });
      // The device first: if anything after this fails, the key still exists somewhere.
      saveDevicePrivateKey(made.info.fingerprint, made.privateKey);
      await putPublicKey(made.publicKey, true);
      if (keeping === "outpost") await putPrivateKeyOnOutpost(made.info.fingerprint, made.privateKey);
      setPassphrase(emptyNewPassphrase);
      await refresh();
      onMade({ ...made, keeping });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Make a key">
      <form onSubmit={submit} className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" hint="Written in the key for everyone you give it to.">
            {(ids) => <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required autoFocus />}
          </Field>
          <Field label="Email address" optional hint="Also written in the key. Leave it out if the key is not for email.">
            {(ids) => <Input {...ids} type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} />}
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <span className="text-small font-medium text-ink">Kind of key</span>
            <Segmented
              label="Kind of key"
              value={algorithm}
              onChange={setAlgorithm}
              options={[
                { value: "curve25519", label: "Curve25519" },
                { value: "rsa4096", label: "RSA 4096" },
              ]}
              className="justify-self-start"
            />
            <p className="text-small text-ink-muted">
              {algorithm === "curve25519"
                ? "Small and fast, and the kind GnuPG itself makes by default today."
                : "For correspondents whose software is too old for Curve25519. Slower, with a much longer public key."}
            </p>
          </div>
          <Field label="Expires" hint="An expiry date limits the harm if the key is lost: it stops being used without your doing anything.">
            {(ids) => (
              <Select<Expiry>
                {...ids}
                value={expiry}
                onChange={setExpiry}
                options={[
                  { value: "1", label: "In 1 year" },
                  { value: "2", label: "In 2 years" },
                  { value: "5", label: "In 5 years" },
                  { value: "never", label: "Never" },
                ]}
              />
            )}
          </Field>
        </div>

        <Choice<Keeping>
          legend="Keep the private key"
          value={keeping}
          onChange={setKeeping}
          options={[
            {
              value: "device",
              label: "On this device only",
              detail:
                "In this browser’s storage. To use the key on another device you carry a copy there yourself. Clearing this browser’s data erases it.",
            },
            {
              value: "outpost",
              label: "On this device and on Outpost",
              detail: `Your other devices can then fetch it. ${OUTPOST_WARNING}`,
            },
          ]}
        />

        <NewPassphrase state={passphrase} onChange={setPassphrase} demand={keeping === "outpost" ? "network" : "device"} facts={facts} />

        {error ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {error}
          </Notice>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={busy} disabled={!ready}>
            {busy ? null : <KeyRound />} Make key
          </Button>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <p className="text-small text-ink-muted">
            The key is made in this browser. Its passphrase is not sent or stored anywhere, and cannot be recovered.
          </p>
        </div>
      </form>
    </Panel>
  );
}

function MadeKeyPanel({ made, onDone }: { made: MadeKey; onDone(): void }) {
  return (
    <Panel title={`${keyLabel(made.info)}’s key is ready`}>
      <div className="grid gap-5">
        <div>
          <p className="text-small text-ink-muted">Its fingerprint, which is how anyone tells this key from another with the same name:</p>
          <Fingerprint value={made.info.fingerprint} className="mt-1" />
        </div>
        <ArmorOutput
          label="Public key: the half to give out"
          value={made.publicKey}
          filename={publicFileName(made.info)}
          rows={6}
          hint="Send this to anyone who should be able to encrypt to you or check your signature. It is not secret."
        />
        <ArmorOutput
          label="Revocation certificate: keep it somewhere safe, away from this device"
          value={made.revocationCertificate}
          filename={revocationFileName(made.info)}
          rows={5}
          hint="If the private key is ever lost or stolen, giving this to your correspondents tells their software to stop using the key. It needs no passphrase, so anyone who has it can retire your key: keep it private, but it cannot read or sign anything."
        />
        <div className="grid gap-2">
          <p className="text-small text-ink">
            {made.keeping === "device"
              ? "The private key is in this browser’s storage and nowhere else. If this browser’s data is cleared, or the device is lost, the key is gone and so is everything encrypted to it."
              : "The private key is in this browser’s storage and on Outpost, protected by its passphrase in both places."}{" "}
            A copy on a USB stick in a drawer is the usual insurance.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => download(made.privateKey, privateFileName(made.info), "text/plain")}>
              <Download /> Save a copy of the private key
            </Button>
            <Button variant="primary" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ── Adding a key someone gave you, or your own from elsewhere ───────────────

function AddKeyForm({ shelf, onDone, onCancel }: { shelf: Shelf; onDone(): void; onCancel(): void }) {
  const refresh = useRefreshShelf();
  const [text, setText] = useState("");
  const [keeping, setKeeping] = useState<Keeping>("device");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const trimmed = text.trim();
  const isPrivate = /^-----BEGIN PGP PRIVATE KEY BLOCK-----/.test(trimmed);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 200_000) {
      setError("That file is too large to be a key. A key file is a few thousand characters of text.");
      return;
    }
    setError(null);
    setText(await file.text());
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const engine = await getEngine();
      if (isPrivate) {
        const info = await engine.readPrivateKey(trimmed);
        if (!info.isProtected) {
          throw new Error(
            "This private key has no passphrase, so it was not imported: Outpost only keeps private keys that are locked. Give it a passphrase where it came from (gpg --edit-key … passwd) and export it again.",
          );
        }
        // Proves the person importing it can use it, and lets the passphrase be measured before the key goes on the network.
        const unlocked = await engine.unlock(trimmed, passphrase);
        unlocked.forget();
        if (keeping === "outpost" && !assessPassphrase(passphrase, { facts: info.userIds }).networkOk) {
          throw new Error(
            `That is the right passphrase, but it is too short to protect a key kept on Outpost. ${OUTPOST_WARNING} Keep the key on this device only, or change its passphrase first.`,
          );
        }
        saveDevicePrivateKey(info.fingerprint, trimmed);
        await putPublicKey(info.publicKey, true);
        if (keeping === "outpost") await putPrivateKeyOnOutpost(info.fingerprint, trimmed);
        toast(`Imported ${keyLabel(info)}’s private key.`);
      } else if (engine.isRevocationCertificate(trimmed)) {
        let applied: ShelfKey | undefined;
        for (const entry of shelf.keys) {
          try {
            const revoked = await engine.applyRevocation(entry.publicKey, trimmed);
            await putPublicKey(revoked, entry.mine);
            applied = entry;
            break;
          } catch {
            // Not for this key; try the next.
          }
        }
        if (!applied)
          throw new Error("That is a revocation certificate, but not for any key in your lists. Add the key it belongs to first.");
        toast(`${keyLabel(applied.info)}’s key is now marked as revoked.`);
      } else {
        const info = await engine.readPublicKey(trimmed);
        await putPublicKey(info.publicKey, false);
        toast(`Added ${keyLabel(info)}’s public key. Check its fingerprint with them before relying on it.`);
      }
      setPassphrase("");
      await refresh();
      onDone();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Add a key">
      <form onSubmit={submit} className="grid gap-4">
        <Field
          label="The key, as text"
          hint="Someone’s public key, a private key of your own exported from elsewhere, or a revocation certificate. Paste it, or choose the file it is in. Nothing is looked up on the internet."
        >
          {(ids) => (
            <Textarea
              {...ids}
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={7}
              spellCheck={false}
              placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
              className="font-mono text-[0.8125rem] leading-5"
            />
          )}
        </Field>
        <input
          ref={fileInput}
          type="file"
          accept=".asc,.gpg,.pgp,.key,.txt,.rev,text/plain,application/pgp-keys"
          hidden
          aria-hidden
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void readFile(file);
          }}
        />

        {isPrivate ? (
          <div className="grid gap-4">
            <Notice tone="info" icon={<KeyRound />} title="This is a private key">
              It will be listed under My keys. It is stored exactly as it is here, still locked by its passphrase.
            </Notice>
            <Field label="Its passphrase" hint="To make sure it is yours to use. The passphrase is not stored.">
              {(ids) => <PassphraseInput {...ids} value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />}
            </Field>
            <Choice<Keeping>
              legend="Keep the private key"
              value={keeping}
              onChange={setKeeping}
              options={[
                { value: "device", label: "On this device only", detail: "In this browser’s storage." },
                {
                  value: "outpost",
                  label: "On this device and on Outpost",
                  detail: `Your other devices can then fetch it. ${OUTPOST_WARNING}`,
                },
              ]}
            />
          </div>
        ) : null}

        {error ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {error}
          </Notice>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" loading={busy} disabled={!trimmed || (isPrivate && !passphrase)}>
            {isPrivate ? "Import private key" : "Add key"}
          </Button>
          <Button onClick={() => fileInput.current?.click()} disabled={busy}>
            <FileUp /> Choose a file
          </Button>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}

// ── One key in a list ───────────────────────────────────────────────────────

type RowDialog = null | "export-private" | "revocation" | "keep-on-outpost" | "stop-on-outpost" | "remove-from-device" | "delete";

function whereKept(entry: ShelfKey): string {
  if (entry.privateOnDevice && entry.privateOnOutpost) return "Private key: on this device and on Outpost";
  if (entry.privateOnDevice) return "Private key: on this device only";
  if (entry.privateOnOutpost) return "Private key: on Outpost, fetched when you unlock it here";
  return "Private key: not on this device or on Outpost. Import it here to decrypt or sign.";
}

function KeyRow({ entry }: { entry: ShelfKey }) {
  const refresh = useRefreshShelf();
  const unlocked = useUnlocked();
  const [dialog, setDialog] = useState<RowDialog>(null);
  const [busy, setBusy] = useState(false);
  const { info } = entry;
  const label = keyLabel(info);
  const usable = canUsePrivate(entry);
  const isUnlocked = unlocked.has(entry.fingerprint);
  const checkId = useId();
  // The tick answers at once; the list catches up when it has read the keys again.
  const [checkedAt, setCheckedAt] = useState(entry.checkedAt);
  useEffect(() => setCheckedAt(entry.checkedAt), [entry.checkedAt]);

  const run = async (work: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await work();
      await refresh();
      setDialog(null);
      if (done) toast(done);
    } catch (failure) {
      notify.error(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-5" data-key={entry.fingerprint}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="text-lead font-semibold text-ink">{label}</h3>
            <KeyBadges entry={entry} />
            {isUnlocked ? (
              <span className="inline-flex items-center gap-1.5 text-small text-ink-muted">
                <LockKeyholeOpen className="size-3.5" aria-hidden /> Unlocked
                <button type="button" className="text-primary underline underline-offset-2" onClick={() => lock(entry.fingerprint)}>
                  Lock now
                </button>
              </span>
            ) : null}
          </div>
          {info.userIds.length > 0 ? <p className="mt-0.5 text-small text-ink-muted break-words">{info.userIds.join(", ")}</p> : null}
          <Fingerprint value={entry.fingerprint} className="mt-2" />
          <p className="mt-2 text-small text-ink-muted">
            {info.algorithm}. Made {formatDate(info.createdAt)}
            {info.expiresAt ? `, ${info.status === "expired" ? "expired" : "expires"} ${formatDate(info.expiresAt)}` : ", no expiry date"}.
            {info.gnupgReadable ? "" : " Written in the newer OpenPGP encoding, which GnuPG does not read."}
            {entry.onShelf ? "" : " Its public key is not on Outpost, so other devices cannot see it."}
          </p>
          {entry.mine ? (
            <p className="mt-1 text-small text-ink-muted">{whereKept(entry)}</p>
          ) : (
            <div className="mt-2 flex min-h-11 items-center gap-2.5 md:min-h-0">
              <Checkbox
                id={checkId}
                checked={checkedAt !== null}
                onCheckedChange={(next) => {
                  setCheckedAt(next === true ? Date.now() : null);
                  setKeyChecked(entry.fingerprint, next === true);
                }}
              />
              <label htmlFor={checkId} className="cursor-pointer text-small text-ink">
                {checkedAt !== null
                  ? `Fingerprint checked with ${label} on ${formatDate(checkedAt)} (remembered on this device)`
                  : `I have compared this fingerprint with ${label}, in person or by a call`}
              </label>
            </div>
          )}
        </div>

        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${label}’s key`}>
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem
              onSelect={async () => {
                if (await copyText(entry.publicKey)) toast("Public key copied.");
                else notify.error("This browser would not copy that. Save the key as a file instead.");
              }}
            >
              Copy public key
            </MenuItem>
            <MenuItem onSelect={() => download(entry.publicKey, publicFileName(info), "text/plain")}>Save public key as a file</MenuItem>
            <MenuItem
              onSelect={async () => {
                if (await copyText(formatFingerprint(entry.fingerprint))) toast("Fingerprint copied.");
              }}
            >
              Copy fingerprint
            </MenuItem>
            {entry.onShelf ? null : (
              <MenuItem onSelect={() => void run(() => putPublicKey(entry.publicKey, true), "Its public key is on Outpost again.")}>
                Put its public key on Outpost
              </MenuItem>
            )}
            {entry.mine && usable ? (
              <>
                <MenuSeparator />
                <MenuItem onSelect={() => setDialog("revocation")}>Make a revocation certificate…</MenuItem>
                <MenuItem onSelect={() => setDialog("export-private")}>Save a copy of the private key…</MenuItem>
                {entry.privateOnOutpost ? (
                  <MenuItem onSelect={() => setDialog("stop-on-outpost")}>Stop keeping the private key on Outpost…</MenuItem>
                ) : (
                  <MenuItem onSelect={() => setDialog("keep-on-outpost")}>Keep the private key on Outpost too…</MenuItem>
                )}
                {entry.privateOnDevice ? (
                  <MenuItem onSelect={() => setDialog("remove-from-device")}>Remove the private key from this device…</MenuItem>
                ) : null}
              </>
            ) : null}
            <MenuSeparator />
            <MenuItem danger onSelect={() => setDialog("delete")}>
              <Trash2 /> Delete key…
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <ConfirmDialog
        open={dialog === "export-private"}
        onOpenChange={(open) => setDialog(open ? "export-private" : null)}
        title={`Save a copy of ${label}’s private key?`}
        description="The file holds the private key, still locked by its passphrase. Anyone who gets the file can try passphrases against it for as long as they like, so keep it somewhere only you can reach: a USB stick in a drawer, not a shared folder. GnuPG can import it with gpg --import."
        confirmLabel="Save the file"
        confirmVariant="primary"
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            download(await protectedPrivateKey(entry), privateFileName(info), "text/plain");
          })
        }
      />

      <ConfirmDialog
        open={dialog === "stop-on-outpost"}
        onOpenChange={(open) => setDialog(open ? "stop-on-outpost" : null)}
        title="Stop keeping this private key on Outpost?"
        description={
          entry.privateOnDevice
            ? "It stays on this device. Other devices that have not fetched it yet will no longer be able to. Backups and portable drives made while it was on Outpost still hold the protected key."
            : "This device does not have the private key in its own storage, so it will first be copied here, and then removed from Outpost. Backups and portable drives made while it was on Outpost still hold the protected key."
        }
        confirmLabel="Remove it from Outpost"
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!entry.privateOnDevice) saveDevicePrivateKey(entry.fingerprint, await protectedPrivateKey(entry));
            await removePrivateKeyFromOutpost(entry.fingerprint);
          }, "The private key is no longer kept on Outpost.")
        }
      />

      <ConfirmDialog
        open={dialog === "remove-from-device"}
        onOpenChange={(open) => setDialog(open ? "remove-from-device" : null)}
        title="Remove this private key from this device?"
        description={
          entry.privateOnOutpost
            ? "It stays on Outpost, and is fetched from there the next time you unlock it here."
            : "It is not kept on Outpost, so unless you have saved a copy this is the last one. Without the private key, nothing encrypted to it (messages, files, pages of your notes) can ever be decrypted again."
        }
        confirmLabel={entry.privateOnOutpost ? "Remove it from this device" : "Remove the last copy"}
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            lock(entry.fingerprint);
            removeDevicePrivateKey(entry.fingerprint);
          }, "The private key is no longer on this device.")
        }
      />

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title={`Delete ${label}’s key?`}
        description={
          entry.mine
            ? `The public key is removed from Outpost${usable ? ", and the private key from this device and from Outpost" : ""}. Anything encrypted to this key (messages, files, pages of your notes) can then no longer be decrypted, unless you saved a copy of the private key or another device still has it. Copies on other devices, in backups and on portable drives are not touched.`
            : `You will not be able to encrypt to ${label} or check their signatures until you add the key again. Nothing already encrypted is affected.`
        }
        confirmLabel="Delete key"
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            lock(entry.fingerprint);
            if (entry.onShelf) await deleteKeyFromOutpost(entry.fingerprint);
            removeDevicePrivateKey(entry.fingerprint);
            setKeyChecked(entry.fingerprint, false);
          }, `Deleted ${label}’s key.`)
        }
      />

      {dialog === "revocation" ? <RevocationDialog entry={entry} onClose={() => setDialog(null)} /> : null}
      {dialog === "keep-on-outpost" ? <KeepOnOutpostDialog entry={entry} onClose={() => setDialog(null)} /> : null}
    </li>
  );
}

function RevocationDialog({ entry, onClose }: { entry: ShelfKey; onClose(): void }) {
  const refresh = useRefreshShelf();
  const unlocked = useUnlocked();
  const [certificate, setCertificate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = keyLabel(entry.info);

  const make = async () => {
    setError(null);
    try {
      const key = unlockedKey(entry.fingerprint);
      if (!key) return;
      setCertificate(await (await getEngine()).revocationCertificate(key));
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const revokeNow = async () => {
    if (!certificate) return;
    setBusy(true);
    try {
      const engine = await getEngine();
      await putPublicKey(await engine.applyRevocation(entry.publicKey, certificate), true);
      await refresh();
      toast(`${label}’s key is revoked. Give the revoked public key to your correspondents so that their software stops using it.`);
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Revocation certificate for ${label}’s key`}
        description="A short signed statement that this key should no longer be used. Making one changes nothing: it only takes effect when you give it to people, or apply it here."
        size="lg"
      >
        <DialogBody className="grid gap-4">
          {certificate ? (
            <>
              <ArmorOutput
                label="Revocation certificate"
                value={certificate}
                filename={revocationFileName(entry.info)}
                rows={6}
                hint="Keep it somewhere safe and apart from the private key. If the key is lost or stolen, send this to everyone who has your public key (GnuPG: gpg --import). It cannot be undone once they have it."
              />
              {entry.info.status === "revoked" ? null : (
                <Notice tone="warning" title="Revoke the key now, here?">
                  <p>
                    Only if the key is already lost, stolen or no longer wanted. Outpost will mark it revoked and stop encrypting to it. You
                    can still decrypt what was encrypted to it before.
                  </p>
                  <Button size="sm" className="mt-2" onClick={() => setConfirming(true)}>
                    Revoke this key now…
                  </Button>
                </Notice>
              )}
            </>
          ) : unlocked.has(entry.fingerprint) ? (
            <p className="text-small text-ink-muted">The key is unlocked.</p>
          ) : (
            <UnlockForm entry={entry} autoFocus submitLabel="Unlock and make certificate" onUnlocked={() => void make()} />
          )}
          {error ? (
            <Notice tone="danger" icon={<CircleAlert />}>
              {error}
            </Notice>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {!certificate && unlocked.has(entry.fingerprint) ? (
            <Button variant="primary" onClick={() => void make()}>
              Make certificate
            </Button>
          ) : null}
          <Button onClick={onClose}>{certificate ? "Done" : "Cancel"}</Button>
        </DialogFooter>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Revoke ${label}’s key?`}
          description="This cannot be undone. The key will be marked revoked on Outpost for every device, and nothing new can be encrypted to it or signed with it in a way others will accept."
          confirmLabel="Revoke key"
          loading={busy}
          onConfirm={() => void revokeNow()}
        />
      </DialogContent>
    </Dialog>
  );
}

function KeepOnOutpostDialog({ entry, onClose }: { entry: ShelfKey; onClose(): void }) {
  const refresh = useRefreshShelf();
  const [current, setCurrent] = useState("");
  const [needsNew, setNeedsNew] = useState(false);
  const [next, setNext] = useState<NewPassphraseState>(emptyNewPassphrase);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = keyLabel(entry.info);
  const check = newPassphraseVerdict(next, "network", entry.info.userIds);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const engine = await getEngine();
      let protectedKey = await protectedPrivateKey(entry);
      // Unlocking proves the passphrase typed here is the key's, so it is the right thing to measure.
      (await engine.unlock(protectedKey, current)).forget();
      if (!assessPassphrase(current, { facts: entry.info.userIds }).networkOk) {
        if (!needsNew) {
          setNeedsNew(true);
          return;
        }
        if (!check.ok) return;
        protectedKey = await engine.changePassphrase(protectedKey, current, next.passphrase);
        lock(entry.fingerprint);
        saveDevicePrivateKey(entry.fingerprint, protectedKey);
      }
      if (!entry.onShelf) await putPublicKey(entry.publicKey, true);
      await putPrivateKeyOnOutpost(entry.fingerprint, protectedKey);
      await refresh();
      toast(`${label}’s private key is now kept on Outpost as well, protected by its passphrase.`);
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={`Keep ${label}’s private key on Outpost too?`}
        description={`Your other devices can then fetch it. ${OUTPOST_WARNING}`}
      >
        <form onSubmit={submit} className="contents">
          <DialogBody className="grid gap-4">
            <Field label="The key’s passphrase" hint="Typed here so that it can be measured. It is not sent or stored.">
              {(ids) => (
                <PassphraseInput
                  {...ids}
                  value={current}
                  autoFocus
                  onChange={(event) => {
                    setCurrent(event.target.value);
                    setNeedsNew(false);
                  }}
                />
              )}
            </Field>
            {needsNew ? (
              <>
                <Notice tone="warning" title="That passphrase is too short for a key kept on the network">
                  It is right for the key, but it would not hold up against unlimited guessing. Give the key a longer one; it replaces the
                  old passphrase on this device too.
                </Notice>
                <NewPassphrase state={next} onChange={setNext} demand="network" facts={entry.info.userIds} label="New passphrase" />
              </>
            ) : null}
            {error ? (
              <Notice tone="danger" icon={<CircleAlert />}>
                {error}
              </Notice>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!current || (needsNew && !check.ok)}>
              {needsNew ? "Change passphrase and keep on Outpost" : "Keep on Outpost"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── The tab ─────────────────────────────────────────────────────────────────

export function KeysTab({ shelf }: { shelf: Shelf }) {
  const refresh = useRefreshShelf();
  const [panel, setPanel] = useState<null | "make" | "add">(null);
  const [made, setMade] = useState<MadeKey | null>(null);
  const mine = shelf.keys.filter((entry) => entry.mine);
  const others = shelf.keys.filter((entry) => !entry.mine);

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="primary"
        onClick={() => {
          setMade(null);
          setPanel("make");
        }}
      >
        <Plus /> Make a key
      </Button>
      <Button
        onClick={() => {
          setMade(null);
          setPanel("add");
        }}
      >
        <FileUp /> Add a key
      </Button>
    </div>
  );

  return (
    <div>
      <p className="max-w-[70ch] text-body text-ink-muted">
        A key is a pair. The <strong className="font-semibold text-ink">public key</strong> is the half you give out: with it, anyone can
        encrypt something only you can read, and check that a signature is yours. The{" "}
        <strong className="font-semibold text-ink">private key</strong> never leaves you. It is locked by a passphrase, and it is what
        decrypts and signs.
      </p>

      <div className="mt-6 grid gap-6">
        {panel === "make" ? (
          <MakeKeyForm
            onCancel={() => setPanel(null)}
            onMade={(result) => {
              setPanel(null);
              setMade(result);
            }}
          />
        ) : null}
        {panel === "add" ? <AddKeyForm shelf={shelf} onCancel={() => setPanel(null)} onDone={() => setPanel(null)} /> : null}
        {made ? <MadeKeyPanel made={made} onDone={() => setMade(null)} /> : null}
      </div>

      {shelf.keys.length === 0 && panel === null && !made ? (
        <EmptyState title="No keys yet" action={actions} className="mt-6" seed={11}>
          Make a key of your own to receive encrypted messages and sign what you write, or add the public key of someone you want to write
          to.
        </EmptyState>
      ) : (
        <>
          <Section
            title="My keys"
            description="Keys you can decrypt and sign with, where their private half is here."
            actions={panel === null ? actions : undefined}
            className="mt-8!"
          >
            {mine.length === 0 ? (
              <p className="border-y border-border py-5 text-small text-ink-muted">
                You have no key of your own yet. Other people need your public key before they can encrypt anything to you.
              </p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {mine.map((entry) => (
                  <KeyRow key={entry.fingerprint} entry={entry} />
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Other people’s keys"
            description="Public keys only: you can encrypt to these people and check their signatures. A key is only as good as your certainty about whose it is."
          >
            {others.length === 0 ? (
              <p className="border-y border-border py-5 text-small text-ink-muted">
                Nobody else’s key is here yet. Ask for their public key as a file or as text, then use “Add a key”.
              </p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {others.map((entry) => (
                  <KeyRow key={entry.fingerprint} entry={entry} />
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      {shelf.unreadable.length > 0 ? (
        <Section
          title="Keys that could not be read"
          description="Stored on Outpost or in this browser, but not usable. They can only be removed."
        >
          <ul className="divide-y divide-border border-y border-border">
            {shelf.unreadable.map((entry) => (
              <li key={entry.fingerprint} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Fingerprint value={entry.fingerprint} />
                  <p className="text-small text-ink-muted">{entry.reason}</p>
                </div>
                <Button
                  size="sm"
                  variant="danger-ghost"
                  onClick={async () => {
                    try {
                      await deleteKeyFromOutpost(entry.fingerprint).catch(() => undefined);
                      removeDevicePrivateKey(entry.fingerprint);
                      await refresh();
                    } catch (failure) {
                      notify.error(errorMessage(failure));
                    }
                  }}
                >
                  <Trash2 /> Remove
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <p className="mt-8 max-w-[70ch] text-small text-ink-muted">
        An unlocked key is kept in this tab’s memory for {IDLE_MINUTES} minutes after its last use, and forgotten when you leave this
        screen. Passphrases are never stored. Outpost has no accounts, so everyone on your network sees these lists and can add to them or
        delete from them; what they cannot do is use a private key without its passphrase.
      </p>
    </div>
  );
}
