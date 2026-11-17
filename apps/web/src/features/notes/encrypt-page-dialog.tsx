/**
 * Turning a page into an encrypted one. This replaces the page's content, so it says
 * exactly what will and will not be protected, asks, and only saves ciphertext that has
 * already been decrypted back to the page in this browser. If anything fails on the
 * way, the page is as it was.
 */
import { encryptedNoteDoc, type NoteDetail, type NoteDoc, type NoteResponse } from "@outpost/shared";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, LockKeyhole, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Segmented, Select, Skeleton } from "@/components/ui/misc";
import { cryptographyAvailable, getEngine } from "@/features/encryption/engine";
import { keyLabel } from "@/features/encryption/format";
import { canUsePrivate, useShelf, useUnlocked } from "@/features/encryption/keys-data";
import { attachmentCount, type PageLock, sealPage } from "@/features/encryption/pages";
import { emptyNewPassphrase, NewPassphrase, type NewPassphraseState, newPassphraseVerdict, UnlockForm } from "@/features/encryption/parts";
import { lockAll, unlockedKey } from "@/features/encryption/session";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { displayTitle, noteKeys, refreshNotes, saveNote } from "./notes-data";
import { clearDraft } from "./use-page-saver";

type Method = "passphrase" | "key";

export interface PageToEncrypt {
  content: NoteDoc;
  /** The version the content was read from; the save is refused if the page has changed since. */
  baseUpdatedAt: number;
}

export default function EncryptPageDialog({
  note,
  prepare,
  onClose,
}: {
  note: NoteDetail;
  /** Saves anything unsaved and answers with the page as it now stands. Throws if it cannot be saved first. */
  prepare(): Promise<PageToEncrypt>;
  onClose(): void;
}) {
  const client = useQueryClient();
  const available = cryptographyAvailable();
  const shelf = useShelf(available);
  const unlocked = useUnlocked();
  const [method, setMethod] = useState<Method>("passphrase");
  const [passphrase, setPassphrase] = useState<NewPassphraseState>(emptyNewPassphrase);
  const [fingerprint, setFingerprint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A key unlocked here to check the encrypted page is forgotten when the dialog goes.
  useEffect(() => () => lockAll(), []);

  const myKeys = (shelf.data?.keys ?? []).filter((entry) => entry.mine && canUsePrivate(entry) && entry.info.canEncrypt);
  const chosen = myKeys.find((entry) => entry.fingerprint === fingerprint) ?? myKeys[0];
  const pictures = attachmentCount(note.content);
  const check = newPassphraseVerdict(passphrase, "network", [note.title]);
  const ready = method === "passphrase" ? check.ok : chosen !== undefined && unlocked.has(chosen.fingerprint);
  const title = displayTitle(note.title);

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const engine = await getEngine();
      let lock: PageLock;
      if (method === "passphrase") lock = { kind: "passphrase", passphrase: passphrase.passphrase };
      else {
        const key = chosen ? unlockedKey(chosen.fingerprint) : null;
        if (!chosen || !key) throw new Error("The key was locked again. Unlock it and try again.");
        lock = { kind: "key", fingerprint: chosen.fingerprint, publicKey: chosen.publicKey, unlocked: key };
      }
      const page = await prepare();
      // Nothing is sent until this has encrypted the page and decrypted it back to the same thing.
      const armor = await sealPage(engine, page.content, lock);
      const content = encryptedNoteDoc(armor);
      const { note: saved } = await saveNote(note.id, { content, baseUpdatedAt: page.baseUpdatedAt });
      // A draft of the old text kept in this tab would otherwise outlive the encryption.
      clearDraft(note.id);
      setPassphrase(emptyNewPassphrase);
      client.setQueryData<NoteResponse>(noteKeys.detail(note.id), (data) =>
        data ? { note: { ...data.note, ...saved, content, encrypted: true, backlinks: data.note.backlinks } } : data,
      );
      await refreshNotes(client);
      toast(`“${title}” is encrypted.`);
      onClose();
    } catch (failure) {
      setError(`${errorMessage(failure)} The page has not been changed.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        title={`Encrypt “${title}”?`}
        description="The text of this page will be replaced by an encrypted copy that only its passphrase or key can open, here in the browser."
        size="lg"
      >
        {!available ? (
          <>
            <DialogBody>
              <Notice tone="warning" icon={<TriangleAlert />} title="This needs HTTPS">
                This page was opened over plain HTTP, where browsers do not allow the cryptography this needs. Turn HTTPS on under{" "}
                <Link to="/settings#https" className="font-medium text-primary underline underline-offset-2">
                  Settings, HTTPS on your network
                </Link>
                , or do this on the computer Outpost runs on.
              </Notice>
            </DialogBody>
            <DialogFooter>
              <Button onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        ) : pictures > 0 ? (
          <>
            <DialogBody>
              <Notice tone="warning" icon={<TriangleAlert />} title="This page has pictures or attached files">
                {plural(pictures, "picture or file")} on this page {pictures === 1 ? "is" : "are"} stored on Outpost as separate files,
                which anyone on your network can open and which this does not encrypt. Encrypting the text around them would look safer than
                it is, so it is not offered. Remove them from the page first; a file can be encrypted on its own under Encryption, Files.
              </Notice>
            </DialogBody>
            <DialogFooter>
              <Button onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          // Not a <form>: the key's own passphrase form sits inside it, and forms do not nest.
          <>
            <DialogBody className="grid gap-5">
              <div className="grid gap-2 text-small text-ink">
                <p>
                  <strong className="font-semibold">Encrypted:</strong> everything written on the page, with its formatting and its links.
                </p>
                <p>
                  <strong className="font-semibold">Not encrypted:</strong> the title, icon, tags and cover, where the page sits among your
                  pages, when it was last changed, and the fact that it is encrypted.
                </p>
                <p>
                  <strong className="font-semibold">Removed now:</strong> the text as it stands, from the page, from Outpost’s search
                  (including search by meaning) and from the database file; and this page from the “linked from” lists of the pages it
                  mentions.
                </p>
                <p>
                  <strong className="font-semibold">Not reached:</strong> copies made before now. Backups, portable drives, the record of a
                  drive that was brought back, exported files, a copy kept on a phone for use offline, and an unsaved draft open in another
                  browser all still hold the text in the clear. Earlier wordings of the page can also linger in unused space in the database
                  until it is compacted (Storage, Manage and clean up).
                </p>
                <p>
                  <strong className="font-semibold">No way back without the {method === "key" ? "key" : "passphrase"}:</strong> Outpost does
                  not keep it and cannot reset it.
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
                  <>
                    <NewPassphrase
                      state={passphrase}
                      onChange={setPassphrase}
                      demand="network"
                      facts={[note.title]}
                      label="Passphrase for this page"
                    />
                    <p className="text-small text-ink-muted">
                      Any device can open the page with it. Anyone on your network can copy the encrypted page and guess at leisure, so the
                      passphrase has to be long.
                    </p>
                  </>
                ) : shelf.isPending ? (
                  <Skeleton className="h-10" />
                ) : myKeys.length === 0 || !chosen ? (
                  <p className="text-small text-ink-muted">
                    You have no key of your own on this device. Make one under{" "}
                    <Link to="/encryption" className="text-primary underline underline-offset-2">
                      Encryption
                    </Link>
                    , or use a passphrase.
                  </p>
                ) : (
                  <>
                    <Field label="Key" hint="The page can then be opened only on a device that has this key’s private half.">
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
                        The key is unlocked, so the encrypted page can be checked before it is saved.
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
                {busy ? null : <LockKeyhole />} Encrypt this page
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
