/**
 * Opening an encrypted medical sheet, and encrypting a plain one: the passphrase or the
 * key, asked for here and used in this browser only. The same rules as an encrypted page
 * of notes (features/notes/encrypt-page-dialog.tsx): it says exactly what is and is not
 * protected, and nothing is saved until the message has been decrypted back to the sheet.
 */
import type { MedicalRecord, MedicalSheet } from "@outpost/shared";
import { CircleAlert, LockKeyhole, TriangleAlert } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Segmented, Select, Skeleton } from "@/components/ui/misc";
import { cryptographyAvailable, getEngine, type MessageNeeds } from "@/features/encryption/engine";
import { keyLabel } from "@/features/encryption/format";
import { canUsePrivate, type ShelfKey, useShelf, useUnlocked } from "@/features/encryption/keys-data";
import {
  emptyNewPassphrase,
  NewPassphrase,
  type NewPassphraseState,
  newPassphraseVerdict,
  PassphraseInput,
  UnlockForm,
} from "@/features/encryption/parts";
import { unlockedKey } from "@/features/encryption/session";
import { errorMessage } from "@/lib/api";
import { useSaveSheet } from "./data";
import { holdOpened, lockSheet, openSheet, type SheetLock, sealSheet } from "./medical-crypto";

function NeedsHttps() {
  return (
    <Notice tone="warning" icon={<TriangleAlert />} title="This needs HTTPS">
      This screen was opened over plain HTTP, where browsers do not allow the cryptography this needs. Turn HTTPS on under{" "}
      <Link to="/settings#https" className="font-medium text-primary underline underline-offset-2">
        Settings, HTTPS on your network
      </Link>
      , or do this on the computer Outpost runs on.
    </Notice>
  );
}

/** Asks for what opens the sheet, and opens it. */
export function OpenSheet({ sheet }: { sheet: MedicalSheet }) {
  const available = cryptographyAvailable();
  const shelf = useShelf(available);
  const unlocked = useUnlocked();
  const [needs, setNeeds] = useState<MessageNeeds | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armor = sheet.armor ?? "";

  useEffect(() => {
    if (!available || !armor) return;
    let live = true;
    getEngine()
      .then((engine) => engine.messageNeeds(armor))
      .then(
        (found) => live && setNeeds(found),
        (failure: unknown) => live && setError(errorMessage(failure)),
      );
    return () => {
      live = false;
    };
  }, [armor, available]);

  const open = async (lock: SheetLock) => {
    setBusy(true);
    setError(null);
    try {
      const record = await openSheet(await getEngine(), armor, lock);
      setPassphrase("");
      holdOpened(sheet.id, { armor, record, lock });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const mine: ShelfKey | undefined = needs
    ? (shelf.data?.keys ?? []).find((entry) => canUsePrivate(entry) && entry.info.keyIds.some((id) => needs.keyIds.includes(id)))
    : undefined;
  const mineUnlocked = mine ? unlocked.has(mine.fingerprint) : false;
  const mineFingerprint = mine?.fingerprint;
  const minePublic = mine?.publicKey;
  // Opened once, when the key it is encrypted to is unlocked.
  // biome-ignore lint/correctness/useExhaustiveDependencies: not again for each change of what `open` closes over
  useEffect(() => {
    if (!mineFingerprint || !minePublic || !mineUnlocked) return;
    const key = unlockedKey(mineFingerprint);
    if (key) void open({ kind: "key", fingerprint: mineFingerprint, publicKey: minePublic, unlocked: key });
  }, [mineFingerprint, minePublic, mineUnlocked]);

  if (!available) return <NeedsHttps />;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (passphrase) void open({ kind: "passphrase", passphrase });
  };
  return (
    <div className="grid gap-4 rounded-panel border border-border p-5">
      <p className="flex items-center gap-2 text-lead text-ink">
        <LockKeyhole aria-hidden className="size-5 text-ink-muted" /> This sheet is encrypted
      </p>
      <p className="text-small text-ink-muted">
        It is opened here, in this browser, and kept open in this tab for five minutes after its last use. Nothing decrypted is sent to
        Outpost.
      </p>
      {!needs && !error ? <Skeleton className="h-10" /> : null}
      {needs?.passphrase ? (
        <form onSubmit={submit} className="grid gap-2">
          <Field label="Passphrase for this sheet">
            {(ids) => (
              <div className="flex flex-wrap gap-2">
                <PassphraseInput
                  {...ids}
                  className="min-w-[14rem] flex-1"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                />
                <Button type="submit" variant="primary" loading={busy} disabled={!passphrase}>
                  Open
                </Button>
              </div>
            )}
          </Field>
        </form>
      ) : null}
      {needs && needs.keyIds.length > 0 ? (
        mine ? (
          mineUnlocked ? (
            <p className="text-small text-ink-muted">Opening with {keyLabel(mine.info)}’s key…</p>
          ) : (
            <UnlockForm entry={mine} submitLabel="Unlock and open" />
          )
        ) : !needs.passphrase ? (
          <p className="text-small text-ink">
            It is encrypted to a key whose private half is not on this device or on Outpost. Open it on the device that has the key.
          </p>
        ) : null
      ) : null}
      {error ? (
        <Notice tone="danger" icon={<CircleAlert />}>
          {error}
        </Notice>
      ) : null}
    </div>
  );
}

type Method = "passphrase" | "key";

/** Encrypting a plain sheet: what it protects and what it cannot reach, then a passphrase or a key. */
export function EncryptSheetDialog({
  sheet,
  name,
  record,
  onClose,
}: {
  sheet: MedicalSheet;
  name: string;
  record: MedicalRecord;
  onClose(): void;
}) {
  const available = cryptographyAvailable();
  const shelf = useShelf(available);
  const unlocked = useUnlocked();
  const save = useSaveSheet();
  const [method, setMethod] = useState<Method>("passphrase");
  const [passphrase, setPassphrase] = useState<NewPassphraseState>(emptyNewPassphrase);
  const [fingerprint, setFingerprint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myKeys = (shelf.data?.keys ?? []).filter((entry) => entry.mine && canUsePrivate(entry) && entry.info.canEncrypt);
  const chosen = myKeys.find((entry) => entry.fingerprint === fingerprint) ?? myKeys[0];
  const check = newPassphraseVerdict(passphrase, "network", [name]);
  const ready = method === "passphrase" ? check.ok : chosen !== undefined && unlocked.has(chosen.fingerprint);

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      let lock: SheetLock;
      if (method === "passphrase") lock = { kind: "passphrase", passphrase: passphrase.passphrase };
      else {
        const key = chosen ? unlockedKey(chosen.fingerprint) : null;
        if (!chosen || !key) throw new Error("The key was locked again. Unlock it and try again.");
        lock = { kind: "key", fingerprint: chosen.fingerprint, publicKey: chosen.publicKey, unlocked: key };
      }
      const armor = await sealSheet(await getEngine(), name, record, lock);
      // Held first, so that the sheet is open here when its encrypted version arrives.
      holdOpened(sheet.id, { armor, record, lock });
      try {
        await save.mutateAsync({ id: sheet.id, input: { memberId: sheet.memberId, name, armor, baseUpdatedAt: sheet.updatedAt } });
      } catch (failure) {
        lockSheet(sheet.id);
        throw failure;
      }
      setPassphrase(emptyNewPassphrase);
      onClose();
    } catch (failure) {
      setError(`${errorMessage(failure)} The sheet has not been changed.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        title={`Encrypt ${name}’s sheet?`}
        description="The sheet will be replaced by an encrypted copy that only its passphrase or key can open, here in the browser."
        size="lg"
      >
        {!available ? (
          <>
            <DialogBody>
              <NeedsHttps />
            </DialogBody>
            <DialogFooter>
              <Button onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogBody className="grid gap-5">
              <div className="grid gap-2 text-small text-ink">
                <p>
                  <strong className="font-semibold">Encrypted:</strong> everything on the sheet except the name.
                </p>
                <p>
                  <strong className="font-semibold">Not encrypted:</strong> the person’s name, when the sheet was last changed, and the fact
                  that it is encrypted.
                </p>
                <p>
                  <strong className="font-semibold">Removed now:</strong> the sheet as it stands, from the database, from search and from
                  what a language model can read.
                </p>
                <p>
                  <strong className="font-semibold">Not reached:</strong> copies made before now. Backups, portable drives, printed copies,
                  PDFs saved or added to the library, and a binder made earlier all still hold it in the clear. Earlier versions can linger
                  in unused space in the database until it is compacted (Storage, Manage and clean up).
                </p>
                <p>
                  <strong className="font-semibold">No way back without the {method === "key" ? "key" : "passphrase"}:</strong> Outpost does
                  not keep it and cannot reset it. Until the sheet is opened on a device, it cannot count medicines down or go on a grab
                  card.
                </p>
              </div>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <span className="text-small font-medium text-ink">Lock it with</span>
                  <Segmented<Method>
                    label="Lock it with"
                    value={method}
                    onChange={setMethod}
                    options={[
                      { value: "passphrase", label: "A passphrase" },
                      { value: "key", label: "One of my keys" },
                    ]}
                    className="justify-self-start"
                  />
                </div>
                {method === "passphrase" ? (
                  <NewPassphrase
                    state={passphrase}
                    onChange={setPassphrase}
                    demand="network"
                    facts={[name]}
                    label="Passphrase for this sheet"
                  />
                ) : shelf.isPending ? (
                  <Skeleton className="h-10" />
                ) : !chosen ? (
                  <p className="text-small text-ink-muted">
                    You have no key of your own on this device. Make one under{" "}
                    <Link to="/encryption" className="text-primary underline underline-offset-2">
                      Encryption
                    </Link>
                    , or use a passphrase.
                  </p>
                ) : (
                  <>
                    <Field label="Key" hint="The sheet can then be opened only on a device that has this key’s private half.">
                      {(ids) => (
                        <Select
                          {...ids}
                          value={chosen.fingerprint}
                          onChange={setFingerprint}
                          options={myKeys.map((entry) => ({ value: entry.fingerprint, label: keyLabel(entry.info) }))}
                        />
                      )}
                    </Field>
                    {unlocked.has(chosen.fingerprint) ? (
                      <p className="text-small text-ink-muted">
                        The key is unlocked, so the encrypted sheet can be checked before it is saved.
                      </p>
                    ) : (
                      <UnlockForm entry={chosen} submitLabel="Unlock" />
                    )}
                  </>
                )}
              </div>
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
              <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void submit()}>
                {busy ? null : <LockKeyhole />} Encrypt this sheet
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
