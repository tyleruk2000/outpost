/**
 * Protecting backups with a passphrase: the row in Settings that says whether they are
 * protected, the dialog that sets or changes the passphrase, and the field a restore
 * asks for it with.
 *
 * The passphrase is typed twice and sent once, to be turned into a key; Outpost keeps
 * no copy of it. It is only asked for where it may be sent: at the computer Outpost
 * runs on, or from another device over HTTPS.
 */

import { BACKUP_PASSPHRASE_HEADER, BACKUP_PASSPHRASE_SHORT, type BackupProtection, type BackupStatus } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, KeyRound, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { OnThisPi } from "@/components/on-this-pi";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ApiError, api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatDateTime } from "@/lib/utils";
import { PassphraseInput } from "../encryption/parts";
import { suggestPassphrase } from "../encryption/passphrase";
import { SettingRow } from "./parts";

/** How a protected backup file starts. Which kind a file is is decided by this, not by its name. */
const MAGIC = "OPBACKUP";

/** Whether the file a person chose is a protected backup, from its first bytes. */
export function startsAsProtected(file: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(false);
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      resolve(bytes.length === MAGIC.length && [...MAGIC].every((letter, index) => bytes[index] === letter.charCodeAt(0)));
    };
    reader.readAsArrayBuffer(file.slice(0, MAGIC.length));
  });
}

/** The header an uploaded backup's passphrase is sent in: its UTF-8 bytes in base64, since a header holds only plain letters. */
export function passphraseHeader(passphrase: string): Record<string, string> {
  const bytes = new TextEncoder().encode(passphrase);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { [BACKUP_PASSPHRASE_HEADER]: btoa(binary) };
}

/** Why a restore was refused, when it was the passphrase and not the file. */
export function passphraseProblem(error: unknown): "passphrase_required" | "wrong_passphrase" | null {
  const reason = error instanceof ApiError ? error.details?.reason : undefined;
  return reason === "passphrase_required" || reason === "wrong_passphrase" ? reason : null;
}

/** Where a passphrase can be typed, said on a device where it cannot. */
export function whereToType(right: BackupProtection["right"]): string {
  return right.reason === "insecure"
    ? "This page is open over plain http, so a passphrase typed here would cross your network unencrypted. Do this at the computer Outpost runs on, or open Outpost at an address beginning https."
    : "This can only be done at the computer Outpost runs on.";
}

/**
 * The passphrase of a protected backup, asked for in the dialog that restores it.
 * `problem` is what the server said about the last one tried.
 */
export function RestorePassphrase({
  value,
  onChange,
  problem,
  earlier,
  right,
}: {
  value: string;
  onChange(value: string): void;
  problem?: string;
  /** The backup was made under a passphrase that is not the one in use now. */
  earlier?: boolean;
  right?: BackupProtection["right"];
}) {
  if (right && !right.allowed) {
    return (
      <Notice tone="info" icon={<KeyRound aria-hidden />} title="This backup is protected">
        {whereToType(right)}
        <OnThisPi />
      </Notice>
    );
  }
  return (
    <Field
      label="Passphrase of this backup"
      hint={
        earlier
          ? "It was made under an earlier passphrase, not the one in use now. Give the one that was set when it was made."
          : "The one that was set when it was made. It is used once, to open the backup, and is not kept."
      }
      error={problem}
    >
      {(ids) => <PassphraseInput {...ids} value={value} onChange={(event) => onChange(event.target.value)} autoFocus />}
    </Field>
  );
}

/** What is said under a new passphrase once something is typed. Nothing here refuses one. */
function lengthNote(passphrase: string, suggested: string | null): { tone: "plain" | "short"; text: string } | null {
  const length = [...passphrase].length;
  if (length === 0) return null;
  if (suggested && passphrase === suggested) {
    return { tone: "plain", text: "Made by this browser at random. Write it down now and keep the paper somewhere safe." };
  }
  if (length < BACKUP_PASSPHRASE_SHORT) {
    return {
      tone: "short",
      text: `${length} ${length === 1 ? "character" : "characters"} is short. Anyone who gets a backup file can try passphrases against it for as long as they like, and one this short can be found that way. It will be accepted if you keep it.`,
    };
  }
  return null;
}

function PassphraseDialog({
  open,
  onOpenChange,
  changing,
  onDone,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  changing: boolean;
  onDone(protection: BackupProtection): void;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [again, setAgain] = useState("");
  const [suggested, setSuggested] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const clear = () => {
    setPassphrase("");
    setAgain("");
    setSuggested(null);
    setShown(false);
  };
  const save = useMutation({
    mutationFn: () => api.put<BackupProtection>("/api/backup/protection", { passphrase }),
    onSuccess: (protection) => {
      clear();
      onDone(protection);
    },
  });
  const close = (next: boolean) => {
    if (save.isPending) return;
    if (!next) {
      clear();
      save.reset();
    }
    onOpenChange(next);
  };
  const note = lengthNote(passphrase, suggested);
  const matches = passphrase === again;
  const ready = passphrase.length > 0 && matches;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title={changing ? "Change the passphrase for backups" : "Set a passphrase for backups"} size="md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) save.mutate();
          }}
        >
          <DialogBody className="grid gap-4">
            <Notice tone="warning" icon={<TriangleAlert aria-hidden />}>
              A protected backup cannot be opened without this passphrase, and Outpost cannot recover it for you.
            </Notice>
            {changing ? (
              <p className="text-small text-ink-muted">
                The new passphrase is for backups made from now on. The ones already made still open with the passphrase they were made
                under, so keep that one too for as long as you keep them.
              </p>
            ) : null}
            <Field
              label="Passphrase"
              hint={
                note ? (
                  <span className={note.tone === "short" ? "flex items-start gap-1.5 text-ink" : undefined}>
                    {note.tone === "short" ? <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden /> : null}
                    <span>{note.text}</span>
                  </span>
                ) : (
                  "Long is better than clever. Outpost can suggest one."
                )
              }
            >
              {(ids) => (
                <div className="flex flex-wrap gap-2">
                  <PassphraseInput
                    {...ids}
                    className="min-w-[14rem] flex-1"
                    value={passphrase}
                    shown={shown}
                    onShownChange={setShown}
                    onChange={(event) => setPassphrase(event.target.value)}
                    autoFocus
                  />
                  <Button
                    onClick={() => {
                      const made = suggestPassphrase();
                      // Shown, because the only way to keep it is to write it down.
                      setShown(true);
                      setSuggested(made);
                      setPassphrase(made);
                      setAgain(made);
                    }}
                  >
                    Suggest one
                  </Button>
                </div>
              )}
            </Field>
            <Field label="Passphrase, again" error={again.length > 0 && !matches ? "The two do not match." : undefined}>
              {(ids) => (
                <PassphraseInput
                  {...ids}
                  value={again}
                  shown={shown}
                  onShownChange={setShown}
                  onChange={(event) => setAgain(event.target.value)}
                />
              )}
            </Field>
            {save.isError ? (
              <Notice tone="danger" icon={<CircleAlert aria-hidden />} title="The passphrase was not set">
                {errorMessage(save.error)}
              </Notice>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => close(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!ready} loading={save.isPending}>
              {changing ? "Change passphrase" : "Protect backups"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The row in the Backup section: whether backups are protected, and the buttons that change it. */
export function BackupProtectionRow({
  status,
  isPending,
  error,
  onRetry,
}: {
  status: BackupStatus | undefined;
  isPending: boolean;
  error: unknown;
  onRetry(): void;
}) {
  const client = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [stopping, setStopping] = useState(false);
  const refresh = () => client.invalidateQueries({ queryKey: ["backup"] });
  const stop = useMutation({
    mutationFn: () => api.delete<BackupProtection>("/api/backup/protection"),
    onSuccess: () => {
      setStopping(false);
      toast.message("Backups made from now on are not protected. The ones already made still need their passphrase.");
      return refresh();
    },
    onError: (failure) => {
      setStopping(false);
      notify.error(errorMessage(failure));
    },
  });

  const label = "Protect backups with a passphrase";
  if (isPending) return <SettingRow label={label} control={<Skeleton className="h-9 w-40" aria-busy />} />;
  if (!status) return <ErrorState error={error} onRetry={onRetry} />;
  const { protection } = status;
  const allowed = protection.right.allowed;

  return (
    <>
      <SettingRow
        label={label}
        hint={
          <>
            {protection.on ? (
              <>
                On since {protection.setAt ? formatDateTime(protection.setAt) : "an earlier time"}. Every backup made since then, by hand or
                on the schedule, is encrypted and opens only with the passphrase. Outpost keeps no copy of it and cannot recover it. Backups
                made before the passphrase was last changed still open with the one they were made under.
              </>
            ) : (
              <>
                Off. A backup is a zip file that anyone who has it can read. With a passphrase set, every backup made from then on is
                encrypted, and a restore asks for the passphrase.
              </>
            )}
            {allowed ? null : <span className="mt-1 block text-ink">{whereToType(protection.right)}</span>}
          </>
        }
        control={
          allowed ? (
            <span className="flex flex-col items-end gap-2 max-md:items-start">
              <Button onClick={() => setAsking(true)}>
                <KeyRound /> {protection.on ? "Change passphrase" : "Set a passphrase"}
              </Button>
              {protection.on ? <Button onClick={() => setStopping(true)}>Stop protecting</Button> : null}
            </span>
          ) : null
        }
      />
      {allowed ? null : <OnThisPi />}
      <PassphraseDialog
        open={asking}
        onOpenChange={setAsking}
        changing={protection.on}
        onDone={() => {
          setAsking(false);
          toast.success("Backups made from now on are protected with that passphrase.");
          void refresh();
        }}
      />
      <ConfirmDialog
        open={stopping}
        onOpenChange={(open) => !open && setStopping(false)}
        title="Stop protecting backups?"
        description="Backups made from now on will be zip files that anyone who has them can read. The protected backups already made are not changed: they stay encrypted and still need the passphrase they were made under."
        confirmLabel="Stop protecting"
        loading={stop.isPending}
        onConfirm={() => stop.mutate()}
      />
    </>
  );
}
