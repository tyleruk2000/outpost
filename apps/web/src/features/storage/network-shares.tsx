/**
 * Network shares on the Storage screen.
 *
 * What this can do depends on where Outpost runs, and it says so. On a Mac run
 * directly, Outpost connects the share itself and keeps it connected. In Docker or on
 * Linux it cannot, so the same form writes out what to add instead (see
 * share-instructions.tsx).
 */
import {
  type DiscoverServersResponse,
  isValidShareName,
  isValidShareUser,
  type NetworkShare,
  type NetworkShareStatus,
  type NetworkSharesResponse,
  parseShareAddress,
  parseShareServer,
  type ShareBusyDetails,
  shareAddress,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, CircleCheck, Ellipsis, Eye, EyeOff, KeyRound, Network, Plug, Plus, Trash2, Unplug } from "lucide-react";
import { type FormEvent, type Ref, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ErrorState, Notice, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Skeleton, Spinner } from "@/components/ui/misc";
import { ApiError, api, errorMessage } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import { dialogColumn, phoneSheet, phoneSheetFooter, SwitchRow } from "./parts";
import { ShareInstructions } from "./share-instructions";

export const useShares = () =>
  useQuery({ queryKey: ["storage", "shares"], queryFn: () => api.get<NetworkSharesResponse>("/api/storage/shares") });

interface ShareResult {
  share: NetworkShare;
  note?: string;
}

const statusBadges: Record<NetworkShareStatus, { label: string; tone: "success" | "neutral" | "warning" | "danger" }> = {
  connected: { label: "Connected", tone: "success" },
  disconnected: { label: "Not connected", tone: "neutral" },
  wrong_password: { label: "Wrong password", tone: "danger" },
  server_not_found: { label: "Server not found", tone: "warning" },
  share_not_found: { label: "Share not found", tone: "warning" },
  needs_password: { label: "Password needed", tone: "warning" },
  failed: { label: "Could not connect", tone: "warning" },
};

/** Typing a name must not be "corrected" by a phone keyboard. */
const plainText = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false } as const;

function PasswordInput({
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

const rememberDescription = "Kept in this Mac’s Keychain, not by Outpost, so the share can be connected again after a restart.";

// ── Using a connected share for the library ─────────────────────────────────

const folderName = /^[^/\\:*?"<>|.][^/\\:*?"<>|]*$/;

/** Turns a connected share into a storage location, in a folder of its own by default. */
function UseShareForm({ share, note, onDone }: { share: NetworkShare; note?: string; onDone: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState(`${share.share} on ${share.server}`.slice(0, 80));
  const [folder, setFolder] = useState("Outpost");
  const [makeDefault, setMakeDefault] = useState(false);
  const trimmedFolder = folder.trim();
  const folderProblem =
    trimmedFolder && !folderName.test(trimmedFolder) ? 'A folder name cannot start with a dot or contain / \\ : * ? " < > |' : undefined;
  const target = share.mountPath ? (trimmedFolder ? `${share.mountPath}/${trimmedFolder}` : share.mountPath) : undefined;

  const add = useMutation({
    mutationFn: () => api.post("/api/storage/locations", { name: name.trim(), path: target, kind: "network", makeDefault }),
    onSuccess: () => {
      toast.success(`Added “${name.trim()}”.`);
      onDone();
      return client.invalidateQueries({ queryKey: ["storage"] });
    },
  });

  const already = share.locations.length > 0;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (target && !already) add.mutate();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogBody className={dialogColumn}>
        <Notice tone="success" icon={<CircleCheck />} title="Connected">
          <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere]">{shareAddress(share)}</span> is at{" "}
          <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere]">{share.mountPath}</span>
          {share.passwordRemembered ? ". Its password is in this Mac’s Keychain." : ". Its password was not kept."}
        </Notice>
        {note ? <Notice tone="info">{note}</Notice> : null}

        {already ? (
          <p className="text-small text-ink-muted">
            {share.locations.length === 1 ? "Your storage location " : "Your storage locations "}
            <span className="font-medium text-ink">{share.locations.map((location) => `“${location.name}”`).join(", ")}</span>{" "}
            {share.locations.length === 1 ? "is on this share and is" : "are on this share and are"} available again.
          </p>
        ) : (
          <>
            <p className="text-small text-ink-muted">
              To keep part of your library here, add it as a storage location. Outpost writes only inside the folder you name, and a small
              marker file so the share is recognised when it comes back.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" hint="How this location is shown in Outpost.">
                {(ids) => <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />}
              </Field>
              <Field
                label="Folder on the share"
                hint="Made if it is not there. Leave empty to use the top of the share."
                error={folderProblem}
              >
                {(ids) => (
                  <Input {...ids} {...plainText} value={folder} onChange={(event) => setFolder(event.target.value)} maxLength={100} />
                )}
              </Field>
            </div>
            <SwitchRow
              label="Use for new downloads"
              description="You can still choose a different location for any single download."
              checked={makeDefault}
              onCheckedChange={setMakeDefault}
            />
            {add.isError ? <Notice tone="danger">{errorMessage(add.error)}</Notice> : null}
          </>
        )}
      </DialogBody>
      <DialogFooter className={phoneSheetFooter}>
        {already ? (
          <Button variant="primary" onClick={onDone}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onDone}>Not now</Button>
            <Button type="submit" variant="primary" disabled={!target || !name.trim() || Boolean(folderProblem)} loading={add.isPending}>
              Add as storage location
            </Button>
          </>
        )}
      </DialogFooter>
    </form>
  );
}

// ── Connecting ──────────────────────────────────────────────────────────────

/** File servers that announce themselves on the network, so the name need not be typed. */
function FoundServers({ onPick, picked }: { onPick: (host: string) => void; picked: string }) {
  // Not under the "storage" key: a live update must not start another two-second search.
  const found = useQuery({
    queryKey: ["storage-discovery"],
    queryFn: () => api.get<DiscoverServersResponse>("/api/storage/shares/discover"),
    staleTime: 60_000,
    retry: false,
  });
  if (found.isPending) {
    return (
      <p className="flex items-center gap-2.5 text-small text-ink-muted">
        <Spinner label="Looking" /> Looking for file servers on your network…
      </p>
    );
  }
  const servers = found.data?.servers ?? [];
  if (servers.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-small font-medium text-ink">Found on your network</p>
      <ul className="divide-y divide-border border-y border-border">
        {servers.map((server) => {
          const address = server.port ? `${server.host}:${server.port}` : server.host;
          const chosen = picked.trim().toLowerCase() === address;
          return (
            <li key={address}>
              <button
                type="button"
                onClick={() => onPick(address)}
                aria-pressed={chosen}
                className="flex min-h-11 w-full items-center gap-3 px-1 py-2 text-left hover:bg-surface active:bg-surface-strong"
              >
                <Network aria-hidden className="size-4 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small font-medium text-ink">{server.name}</span>
                  <span className="block truncate font-mono text-[0.8125rem] text-ink-muted">{address}</span>
                </span>
                {chosen ? <Check aria-hidden className="size-4 shrink-0 text-primary" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ConnectForm({ onConnected, onCancel }: { onConnected: (result: ShareResult) => void; onCancel: () => void }) {
  const client = useQueryClient();
  const [server, setServer] = useState("");
  const [share, setShare] = useState("");
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [checked, setChecked] = useState(false);

  const parsed = parseShareServer(server);
  const problems = {
    server: server.trim() && !parsed ? "This does not look like a name or address. Try nas.local or 192.168.1.20." : undefined,
    share: share.trim() && !isValidShareName(share.trim()) ? "Use the share’s name on its own, without slashes." : undefined,
    userName: userName.trim() && !isValidShareUser(userName.trim()) ? "Use letters, digits, dots, dashes and underscores." : undefined,
  };

  const connect = useMutation({
    mutationFn: () =>
      api.post<ShareResult>("/api/storage/shares", {
        server: server.trim(),
        share: share.trim(),
        userName: userName.trim(),
        password,
        rememberPassword: remember,
      }),
    onSuccess: (result) => {
      // The password has done its job; it is not kept in the page.
      setPassword("");
      onConnected(result);
      return client.invalidateQueries({ queryKey: ["storage"] });
    },
  });

  // The answer appears at the end of a long form: bring it into view when it arrives.
  const outcome = useRef<HTMLDivElement>(null);
  const failedAt = connect.isError ? connect.submittedAt : 0;
  useEffect(() => {
    if (failedAt) outcome.current?.scrollIntoView({ block: "nearest" });
  }, [failedAt]);

  /** A whole address pasted into "Server" (smb://nas/media) is split into its parts. */
  const takeAddress = (text: string) => {
    const whole = parseShareAddress(text);
    if (!whole) return false;
    setServer(whole.server);
    if (!share.trim()) setShare(whole.share);
    return true;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setChecked(true);
    if (!parsed || problems.share || problems.userName || !share.trim() || !userName.trim() || !password) return;
    connect.mutate();
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <DialogBody className={dialogColumn}>
        <p className="text-small text-ink-muted">
          Outpost asks this Mac to connect the shared folder, the way the Finder does, and keeps it connected. It works with SMB, the file
          sharing every NAS offers.
        </p>
        <FoundServers onPick={setServer} picked={server} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Server"
            hint="The NAS’s name or address, for example nas.local or 192.168.1.20."
            error={problems.server ?? (checked && !server.trim() ? "Enter the server." : undefined)}
          >
            {(ids) => (
              <Input
                {...ids}
                {...plainText}
                value={server}
                onChange={(event) => setServer(event.target.value)}
                onBlur={(event) => takeAddress(event.target.value)}
                onPaste={(event) => {
                  if (takeAddress(event.clipboardData.getData("text"))) event.preventDefault();
                }}
                inputMode="url"
                autoComplete="off"
                enterKeyHint="next"
                maxLength={260}
              />
            )}
          </Field>
          <Field
            label="Share"
            hint="The shared folder’s name on the NAS, for example media."
            error={problems.share ?? (checked && !share.trim() ? "Enter the share’s name." : undefined)}
          >
            {(ids) => (
              <Input
                {...ids}
                {...plainText}
                value={share}
                onChange={(event) => setShare(event.target.value)}
                autoComplete="off"
                enterKeyHint="next"
                maxLength={80}
              />
            )}
          </Field>
          <Field label="User name" error={problems.userName ?? (checked && !userName.trim() ? "Enter the user name." : undefined)}>
            {(ids) => (
              <Input
                {...ids}
                {...plainText}
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
                autoComplete="username"
                enterKeyHint="next"
                maxLength={64}
              />
            )}
          </Field>
          <Field label="Password" error={checked && !password ? "Enter the password." : undefined}>
            {(ids) => <PasswordInput {...ids} value={password} onChange={setPassword} />}
          </Field>
        </div>
        <SwitchRow label="Remember the password" description={rememberDescription} checked={remember} onCheckedChange={setRemember} />
        <div ref={outcome} className="empty:hidden">
          {connect.isError ? (
            <Notice tone="danger" icon={<CircleAlert />} title="Not connected">
              {errorMessage(connect.error)}
            </Notice>
          ) : null}
        </div>
      </DialogBody>
      <DialogFooter className={phoneSheetFooter}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={connect.isPending}>
          {connect.isPending ? "Connecting" : "Connect"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ConnectShareDialog({
  open,
  onOpenChange,
  shares,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shares: NetworkSharesResponse;
}) {
  const [result, setResult] = useState<ShareResult>();
  // A fresh form each time it is opened.
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (open) {
      setResult(undefined);
      setSession((value) => value + 1);
    }
  }, [open]);

  const close = () => onOpenChange(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Connect a network share" size="lg" className={phoneSheet}>
        {shares.mode === "macos" ? (
          result ? (
            <UseShareForm share={result.share} note={result.note} onDone={close} />
          ) : (
            <ConnectForm key={session} onConnected={setResult} onCancel={close} />
          )
        ) : (
          <ShareInstructions key={session} mode={shares.mode} hints={shares.hints} onClose={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── A remembered share ──────────────────────────────────────────────────────

function PasswordDialog({
  share,
  open,
  onOpenChange,
  reason,
}: {
  share: NetworkShare;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Why the password is being asked for, when an attempt has just failed. */
  reason?: string;
}) {
  const client = useQueryClient();
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const field = useRef<HTMLInputElement>(null);
  const reconnect = useMutation({
    mutationFn: () => api.post<ShareResult>(`/api/storage/shares/${share.id}/reconnect`, { password, rememberPassword: remember }),
    onSuccess: (result) => {
      setPassword("");
      onOpenChange(false);
      toast.success(result.note ?? `Connected ${shareAddress(share)}.`);
      return client.invalidateQueries({ queryKey: ["storage"] });
    },
    onError: () => client.invalidateQueries({ queryKey: ["storage", "shares"] }),
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on open
  useEffect(() => {
    if (open) {
      setPassword("");
      setRemember(true);
      reconnect.reset();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Enter the password"
        size="sm"
        onOpenAutoFocus={(event) => {
          // Straight to the one thing there is to type, not to the close button.
          event.preventDefault();
          field.current?.focus();
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (password) reconnect.mutate();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className={cn(dialogColumn, "gap-4")}>
            <p className="text-small text-ink-muted">
              For <span className="font-medium text-ink">{share.userName}</span> on{" "}
              <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere] text-ink">{shareAddress(share)}</span>.
            </p>
            <Field label="Password">{(ids) => <PasswordInput {...ids} value={password} onChange={setPassword} ref={field} />}</Field>
            <SwitchRow label="Remember the password" description={rememberDescription} checked={remember} onCheckedChange={setRemember} />
            {reconnect.isError ? (
              <Notice tone="danger" icon={<CircleAlert />}>
                {errorMessage(reconnect.error)}
              </Notice>
            ) : reason ? (
              <Notice tone="warning" icon={<CircleAlert />}>
                {reason}
              </Notice>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!password} loading={reconnect.isPending}>
              Connect
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function busyWork(error: unknown): string[] | undefined {
  if (!(error instanceof ApiError) || error.status !== 409) return undefined;
  const details = error.details as Partial<ShareBusyDetails> | undefined;
  return details?.reason === "work_in_progress" && Array.isArray(details.work) ? details.work : undefined;
}

/** What is still using the share, named, so "anyway" is an informed choice. */
function WorkList({ work }: { work: string[] }) {
  return (
    <Notice
      tone="warning"
      icon={<CircleAlert />}
      title={work.length === 1 ? "Something is still using this share" : "Work is still using this share"}
    >
      <ul className="list-disc space-y-0.5 pl-4">
        {work.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="mt-1.5">It will be interrupted. Downloads carry on by themselves when the share is connected again.</p>
    </Notice>
  );
}

function ShareRow({ share }: { share: NetworkShare }) {
  const client = useQueryClient();
  const [askPassword, setAskPassword] = useState<{ reason?: string }>();
  const [disconnecting, setDisconnecting] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [using, setUsing] = useState(false);
  const connected = share.status === "connected";
  const badge = statusBadges[share.status];
  const address = shareAddress(share);
  const invalidate = () => client.invalidateQueries({ queryKey: ["storage"] });

  const reconnect = useMutation({
    mutationFn: () => api.post<ShareResult>(`/api/storage/shares/${share.id}/reconnect`, {}),
    onSuccess: () => {
      toast.success(`Connected ${address}.`);
      return invalidate();
    },
    onError: (error) => {
      void client.invalidateQueries({ queryKey: ["storage", "shares"] });
      const reason = error instanceof ApiError ? error.details?.reason : undefined;
      // A password problem is fixed by typing it, so go straight there.
      if (reason === "wrong_password" || reason === "needs_password") setAskPassword({ reason: errorMessage(error) });
      else toast.error(errorMessage(error));
    },
  });
  const disconnect = useMutation({
    mutationFn: (confirm: boolean) => api.post<ShareResult>(`/api/storage/shares/${share.id}/disconnect`, { confirm }),
    onSuccess: () => {
      setDisconnecting(false);
      toast.success(`Disconnected ${address}. Nothing on it was changed.`);
      return invalidate();
    },
  });
  const forget = useMutation({
    mutationFn: (confirm: boolean) => api.delete(`/api/storage/shares/${share.id}`, { confirm }),
    onSuccess: () => {
      setForgetting(false);
      toast.success(`Forgot ${address}. Its files were left in place.`);
      return invalidate();
    },
  });

  const needsTyping = !share.passwordRemembered || share.status === "wrong_password" || share.status === "needs_password";
  const disconnectWork = busyWork(disconnect.error);
  const forgetWork = busyWork(forget.error);
  const onShare = share.locations.map((location) => `“${location.name}”`).join(", ");

  return (
    <li className="py-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <Network aria-hidden className="mt-1 size-5 shrink-0 text-ink-muted" strokeWidth={1.6} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-lead font-semibold break-words text-ink">{share.share}</h3>
            <Badge tone={badge.tone}>
              {connected ? <Check aria-hidden /> : <CircleAlert aria-hidden />} {badge.label}
            </Badge>
          </div>
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="max-md:size-11" aria-label={`Actions for ${address}`}>
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent>
            {connected ? (
              <MenuItem onSelect={() => setDisconnecting(true)}>
                <Unplug /> Disconnect
              </MenuItem>
            ) : (
              <MenuItem onSelect={() => setAskPassword({})}>
                <KeyRound /> Connect with a password
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem danger onSelect={() => setForgetting(true)}>
              <Trash2 /> Forget this share
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      {/* Under the title, not beside it: on a phone these lines get the full width. */}
      <div className="md:pl-9">
        <p className="mt-1 text-small text-ink-muted">
          On{" "}
          <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere] text-ink">
            {share.port ? `${share.server}:${share.port}` : share.server}
          </span>
          , as {share.userName}
          <span className="mx-2 text-border-strong max-md:hidden" aria-hidden>
            /
          </span>
          <span className="max-md:block">{share.passwordRemembered ? "Password in this Mac’s Keychain" : "Password not remembered"}</span>
        </p>
        {connected && share.mountPath ? (
          <p className="mt-1 text-small text-ink-muted">
            Appears at <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere] text-ink">{share.mountPath}</span>
            {share.locations.length > 0 ? `, and holds ${onShare}` : null}
          </p>
        ) : (
          <p className="mt-1 text-small text-ink-muted">
            {share.statusDetail ? `${share.statusDetail} ` : null}
            {share.locations.length > 0 ? `${onShare} ${share.locations.length === 1 ? "is" : "are"} on it. ` : null}
            {share.lastConnectedAt ? `Last connected ${timeAgo(share.lastConnectedAt)}.` : null}
          </p>
        )}
      </div>

      {connected && share.locations.length === 0 ? (
        <div className="mt-3 md:pl-9">
          <Button onClick={() => setUsing(true)}>
            <Plus /> Add as storage location
          </Button>
        </div>
      ) : !connected ? (
        <div className="mt-3 md:pl-9">
          <Button onClick={() => (needsTyping ? setAskPassword({}) : reconnect.mutate())} loading={reconnect.isPending}>
            {reconnect.isPending ? null : <Plug />} {needsTyping ? "Enter password to reconnect" : "Reconnect"}
          </Button>
        </div>
      ) : null}

      <PasswordDialog
        share={share}
        open={askPassword !== undefined}
        onOpenChange={(open) => !open && setAskPassword(undefined)}
        reason={askPassword?.reason}
      />

      <Dialog open={using} onOpenChange={setUsing}>
        <DialogContent title="Add as storage location" size="lg" className={phoneSheet}>
          {using ? <UseShareForm share={share} onDone={() => setUsing(false)} /> : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={disconnecting}
        onOpenChange={(open) => {
          setDisconnecting(open);
          if (!open) disconnect.reset();
        }}
        title={`Disconnect ${address}?`}
        description={
          share.locations.length > 0
            ? `${onShare} will show as disconnected until you reconnect the share. Nothing is deleted, and Outpost will not connect it again until you ask.`
            : "Nothing on the share is changed, and Outpost will not connect it again until you ask."
        }
        confirmLabel={disconnectWork ? "Disconnect anyway" : "Disconnect"}
        confirmVariant={disconnectWork ? "danger" : "primary"}
        onConfirm={() => disconnect.mutate(Boolean(disconnectWork))}
        loading={disconnect.isPending}
      >
        {disconnectWork ? (
          <WorkList work={disconnectWork} />
        ) : disconnect.isError ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {errorMessage(disconnect.error)}
          </Notice>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={forgetting}
        onOpenChange={(open) => {
          setForgetting(open);
          if (!open) forget.reset();
        }}
        title={`Forget ${address}?`}
        description={`Outpost will ${connected ? "disconnect the share, " : ""}remove its password from this Mac’s Keychain and forget how to connect it. Files on the share are not touched${
          share.locations.length > 0 ? `, and ${onShare} stays in Outpost, shown as disconnected` : ""
        }.`}
        confirmLabel={forgetWork ? "Forget anyway" : "Forget share"}
        onConfirm={() => forget.mutate(Boolean(forgetWork))}
        loading={forget.isPending}
      >
        {forgetWork ? (
          <WorkList work={forgetWork} />
        ) : forget.isError ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {errorMessage(forget.error)}
          </Notice>
        ) : null}
      </ConfirmDialog>
    </li>
  );
}

// ── The section ─────────────────────────────────────────────────────────────

export function NetworkSharesSection() {
  const shares = useShares();
  const [connecting, setConnecting] = useState(false);
  const data = shares.data;
  // Where there is nothing Outpost can do or say about shares, there is no section.
  if (data?.mode === "unsupported") return null;

  const canMount = data?.mode === "macos";
  return (
    <Section
      title="Network shares"
      description={
        !data || canMount
          ? "Connect a shared folder on a NAS from here. Outpost keeps it connected and can store your library on it."
          : "A shared folder on a NAS can hold your library."
      }
    >
      {shares.isPending ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-14" />
        </div>
      ) : shares.isError ? (
        <ErrorState error={shares.error} onRetry={() => shares.refetch()} />
      ) : data ? (
        <>
          {canMount ? (
            data.shares.length > 0 ? (
              <ul className="mb-4 divide-y divide-border border-y border-border">
                {data.shares.map((share) => (
                  <ShareRow key={share.id} share={share} />
                ))}
              </ul>
            ) : (
              <p className="mb-4 max-w-[70ch] text-small text-ink-muted">
                No share is connected through Outpost yet. You need the NAS’s name or address, the name of the shared folder, and a user
                name and password for it.
              </p>
            )
          ) : (
            <p className="mb-4 max-w-[70ch] text-small text-ink-muted">
              {data.mode === "docker"
                ? "Outpost runs in a container here, and a container is not allowed to connect a share by itself: Docker has to. Enter the share’s details and Outpost writes out the exact lines to add to your Compose file."
                : "On Linux, connecting a share needs administrator rights, which Outpost does not have. Enter the share’s details and Outpost writes out the exact lines to add to the system."}
            </p>
          )}
          <Button onClick={() => setConnecting(true)}>
            <Network /> Connect a network share
          </Button>
          <ConnectShareDialog open={connecting} onOpenChange={setConnecting} shares={data} />
        </>
      ) : null}
    </Section>
  );
}
