import { type BackupStagedResponse, type BackupStatus, formatBytes } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, MonitorSmartphone, RotateCcw, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ApiError, api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatDateTime } from "@/lib/utils";
import { manageLink } from "../manage/manage-data";
import { AutomaticBackups } from "./automatic-backups";
import { BackupProtectionRow, passphraseHeader, passphraseProblem, RestorePassphrase, startsAsProtected } from "./backup-protection";
import { stagedText } from "./backup-text";
import { SettingRow, SettingsSection } from "./parts";
import { RESTORE_LABEL, RestoreWords } from "./restore-words";

/**
 * Reloads the page once the restarted server answers, rather than after a fixed wait that
 * a slow computer (a Raspberry Pi) can outlast. Asks once a second, for up to two minutes.
 */
async function reloadWhenBack(): Promise<void> {
  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const answers = () =>
    fetch("/api/health", { cache: "no-store" }).then(
      (response) => response.ok,
      () => false,
    );
  // The old server takes a moment to stop; until it has, its answer means nothing.
  for (let tries = 0; tries < 20 && (await answers()); tries++) await wait(500);
  for (let tries = 0; tries < 120; tries++) {
    await wait(1000);
    if (await answers()) return window.location.reload();
  }
  notify.error("Outpost has not come back after two minutes. Check the computer it runs on, then reload this page.");
}

export function BackupSection() {
  const client = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File>();
  /** Whether the chosen file is a protected backup, the passphrase typed for it, and what was wrong with the last one tried. */
  const [locked, setLocked] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [problem, setProblem] = useState<string>();
  const choose = (file: File | undefined) => {
    setPassphrase("");
    setProblem(undefined);
    setLocked(false);
    setChosen(file);
    if (file) void startsAsProtected(file).then(setLocked);
  };
  /**
   * After "Download backup": when the last backup saved from here had been made before the press (0 for none). The
   * server records each one once it has been sent in full; until a newer one is recorded, the status is asked for
   * again every second and a half, for up to two minutes.
   */
  const [asked, setAsked] = useState<number | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const status = useQuery({
    queryKey: ["backup", "status"],
    queryFn: () => api.get<BackupStatus>("/api/backup/status"),
    refetchInterval: (query) => (asked !== null && !gaveUp && (query.state.data?.lastDownload?.at ?? 0) === asked ? 1500 : false),
  });
  const lastDownload = status.data?.lastDownload ?? null;
  const made = asked !== null && lastDownload !== null && lastDownload.at !== asked;
  useEffect(() => {
    if (asked === null) return;
    const timer = window.setTimeout(() => setGaveUp(true), 120_000);
    return () => window.clearTimeout(timer);
  }, [asked]);
  const refresh = () => client.invalidateQueries({ queryKey: ["backup"] });

  const restore = useMutation({
    mutationFn: async (file: File) => {
      const response = await fetch("/api/backup/restore", {
        method: "POST",
        headers: {
          "X-Outpost-Request": "1",
          "Content-Type": locked ? "application/vnd.outpost.backup" : "application/zip",
          ...(locked ? passphraseHeader(passphrase) : {}),
        },
        body: file,
      });
      const body = await response.json();
      if (!response.ok)
        throw new ApiError(
          response.status,
          body.error?.code ?? "http",
          body.error?.message ?? "The backup could not be read.",
          body.error?.details,
        );
      return body;
    },
    onSuccess: (staged: BackupStagedResponse) => {
      choose(undefined);
      toast.success(stagedText(staged.createdAt, staged.supervised));
      return refresh();
    },
    onError: (error) => {
      // A passphrase that was wrong or missing is said beside the field, and the file stays chosen for another try.
      if (passphraseProblem(error)) {
        setLocked(true);
        return setProblem(errorMessage(error));
      }
      choose(undefined);
      notify.error(errorMessage(error));
    },
  });
  const cancel = useMutation({ mutationFn: () => api.delete("/api/backup/restore"), onSuccess: refresh });
  const restart = useMutation({
    mutationFn: () => api.post("/api/system/restart"),
    onSuccess: () => {
      toast.message("Outpost is restarting. This page will reload by itself once it is back.");
      void reloadWhenBack();
    },
    onError: (error) => notify.error(errorMessage(error)),
  });

  // Restoring replaces everything at once, so it is offered where "erase everything" is.
  const right = status.data?.right;
  const mayRestore = right?.allowed !== false;
  const passphraseRight = status.data?.protection.right;
  /** A protected backup cannot be sent from a device that may not send its passphrase. */
  const cannotOpen = locked && passphraseRight?.allowed === false;

  return (
    <>
      <SettingsSection
        id="backup"
        title="Backup"
        description="Notes, tags, saved places, settings and the library index. Collections, maps and original documents stay where they are stored and are not copied."
      >
        <SettingRow
          label="Save a backup"
          hint={
            <>
              {status.data?.protection.on
                ? "One file, encrypted with your passphrase (.zip.enc). Keep it somewhere other than this device."
                : "One .zip file. Keep it somewhere other than this device."}
              {lastDownload && !made ? ` Last saved ${formatDateTime(lastDownload.at)}.` : null}
            </>
          }
          control={
            <Button asChild>
              <a
                href="/api/backup/download"
                download
                onClick={() => {
                  setGaveUp(false);
                  setAsked(lastDownload?.at ?? 0);
                }}
              >
                <Download /> Download backup
              </a>
            </Button>
          }
        />
        {/* Said where the button is, not only in a toast: what was made, where it went, and what is not in it. */}
        <div aria-live="polite" className="empty:hidden">
          {asked === null ? null : made && lastDownload ? (
            <Notice tone="success" title="Backup made">
              {lastDownload.name}, {formatBytes(lastDownload.bytes)}, made {formatDateTime(lastDownload.at)}. Your browser put it where it
              keeps downloads: the Downloads folder on a computer, or Files, then Downloads, on an iPhone or iPad. It holds notes, tags,
              saved places, settings and the library index; original documents, collections and maps are not in it, so keep those where they
              are stored too.
            </Notice>
          ) : gaveUp ? (
            <Notice tone="warning">
              Outpost has not finished sending the backup. If your browser shows no download, press Download backup again.
            </Notice>
          ) : (
            <Notice>Making the backup. Your browser saves it as soon as it is ready.</Notice>
          )}
        </div>
        <BackupProtectionRow status={status.data} isPending={status.isPending} error={status.error} onRetry={() => status.refetch()} />
        <SettingRow
          label="Restore from a backup"
          hint="Replaces what this Outpost holds with the backup, once it has been checked and Outpost has started again. What is here now is kept in a dated folder in the data folder, not deleted."
          control={
            mayRestore ? (
              <>
                <Button onClick={() => fileRef.current?.click()} loading={restore.isPending}>
                  <Upload /> Choose backup
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".zip,.enc,application/zip"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Backup file"
                  onChange={(event) => {
                    choose(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </>
            ) : null
          }
        />
        {right && !right.allowed ? (
          <Notice tone="info" icon={<MonitorSmartphone />} title="Restoring is not offered on this device">
            <p>
              Outpost has no accounts, so it cannot tell who is asking. Restoring a backup, deleting a stored one and keeping fewer of them
              can only be done at the computer Outpost runs on. Open Outpost there to do it.
            </p>
            <p className="mt-1 text-ink-muted">
              Whoever starts Outpost can allow it from every device by starting it with{" "}
              <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere]">{right.option}=true</span>.
            </p>
          </Notice>
        ) : null}
        {status.data?.restorePending ? (
          <Notice
            tone="warning"
            icon={<RotateCcw />}
            title="A restore is waiting for a restart"
            action={
              <span className="flex shrink-0 gap-2">
                <Button size="sm" variant="ghost" onClick={() => cancel.mutate()} loading={cancel.isPending}>
                  Cancel restore
                </Button>
                {status.data.supervised && mayRestore ? (
                  <Button size="sm" variant="primary" onClick={() => restart.mutate()} loading={restart.isPending}>
                    Restart now
                  </Button>
                ) : null}
              </span>
            }
          >
            {!status.data.supervised
              ? "The backup has been checked. Stop Outpost and start it again to switch to it."
              : mayRestore
                ? "The backup has been checked. Restart Outpost to switch to it."
                : "The backup has been checked. Restarting stops Outpost for everyone using it, so it can only be done at the computer Outpost runs on. Open Outpost there and restart it to switch to the backup."}
          </Notice>
        ) : null}
        {status.data && status.data.previousData.length > 0 ? (
          <p className="text-small text-ink-muted">
            Data from before earlier restores is kept in the data directory:{" "}
            <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere] text-ink">{status.data.previousData.join(", ")}</span>.
            Delete them from{" "}
            <Link to={manageLink("leftovers")} className="text-primary underline underline-offset-2">
              Leftovers
            </Link>{" "}
            when you no longer need them.
          </p>
        ) : null}
        <SettingRow
          label="Clean up or start again"
          hint="See what is taking the space, remove what was downloaded, clear leftovers, or erase everything."
          control={
            <Button asChild size="sm">
              <Link to={manageLink("clean-up")}>Manage and clean up</Link>
            </Button>
          }
        />
        <ConfirmDialog
          open={Boolean(chosen)}
          onOpenChange={(open) => !open && !restore.isPending && choose(undefined)}
          title="Restore from this backup?"
          description={
            <RestoreWords
              lead={
                <>
                  <span className="font-medium text-ink [overflow-wrap:anywhere]">{chosen?.name}</span> is sent to Outpost and checked
                  first.
                </>
              }
            />
          }
          confirmLabel={RESTORE_LABEL}
          confirmVariant="primary"
          loading={restore.isPending}
          onConfirm={() => {
            if (!chosen || cannotOpen) return;
            if (locked && passphrase === "") return setProblem("Type the passphrase this backup was made under.");
            setProblem(undefined);
            restore.mutate(chosen);
          }}
        >
          {locked ? <RestorePassphrase value={passphrase} onChange={setPassphrase} problem={problem} right={passphraseRight} /> : null}
        </ConfirmDialog>
      </SettingsSection>
      <AutomaticBackups />
    </>
  );
}
