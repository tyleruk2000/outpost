/**
 * "Connect a network share", as a short walk rather than a form to fill in from memory:
 * pick the server, sign in, pick one of the shared folders it offers, pick the folder on
 * it that Outpost should use. Nothing has to be typed but the user name and password.
 *
 * This is the Mac's version, where Outpost connects the share itself. In Docker and on
 * Linux it cannot, and the dialog shows written instructions instead
 * (share-instructions.tsx).
 */
import {
  type DiscoverServersResponse,
  formatShareServer,
  isValidShareName,
  isValidShareUser,
  type MountedShare,
  type MountedSharesResponse,
  type NetworkShare,
  type NetworkSharesResponse,
  parseShareAddress,
  parseShareServer,
  type ServerShare,
  type ServerSharesResponse,
  shareAddress,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, CircleAlert, CircleCheck, FolderOpen, HardDrive, Info, Network } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Badge, Spinner } from "@/components/ui/misc";
import { ApiError, api, errorMessage } from "@/lib/api";
import { cn, plural } from "@/lib/utils";
import { FolderPicker, type PickedFolder } from "./folder-picker";
import { dialogColumn, PasswordInput, phoneSheet, phoneSheetFooter, plainText, rememberDescription, StepLine, SwitchRow } from "./parts";
import { ShareInstructions } from "./share-instructions";

export interface ShareResult {
  share: NetworkShare;
  note?: string;
}

/** How the person is signing in. Held in the page only while the dialog is open. */
type SignIn = { guest: true } | { guest: false; userName: string; password: string; remember: boolean };

const signInBody = (signIn: SignIn) =>
  signIn.guest ? { guest: true } : { userName: signIn.userName, password: signIn.password, rememberPassword: signIn.remember };

const STEPS = ["Server", "Sign in", "Shared folder", "Folder to use"] as const;

/** A lesser action offered as a line of linked text, still a full-size target on a phone. */
const quietAction = "justify-start self-start justify-self-start max-md:min-h-11";

/** A row to press in a list of things to choose from. */
function ChoiceRow({
  icon,
  title,
  detail,
  trailing,
  onPick,
  disabled,
  busy,
}: {
  icon: ReactNode;
  title: string;
  detail?: ReactNode;
  trailing?: ReactNode;
  onPick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled || busy}
        className="flex min-h-11 w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-surface active:bg-surface-strong disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className={cn("shrink-0 text-ink-muted [&_svg]:size-4", disabled && "opacity-55")}>{icon}</span>
        <span className={cn("min-w-0 flex-1", disabled && "opacity-55")}>
          <span className="block text-small font-medium [overflow-wrap:anywhere] text-ink">{title}</span>
          {detail ? <span className="block text-small [overflow-wrap:anywhere] text-ink-muted">{detail}</span> : null}
        </span>
        {trailing}
        {busy ? <Spinner label="Connecting" /> : disabled ? null : <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />}
      </button>
    </li>
  );
}

function ChoiceList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-small font-medium text-ink">{label}</h3>
      <ul className="divide-y divide-border border-y border-border">{children}</ul>
    </section>
  );
}

/** Counts down the seconds a refused password has to wait, so the button can say when. */
function useWait(error: unknown): number {
  const seconds = error instanceof ApiError && typeof error.details?.retryAfterSeconds === "number" ? error.details.retryAfterSeconds : 0;
  const [left, setLeft] = useState(0);
  useEffect(() => {
    setLeft(seconds);
    if (seconds <= 0) return;
    const until = Date.now() + seconds * 1000;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLeft(remaining);
      // The wait is over: nothing is left to count.
      if (remaining === 0) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);
  return left;
}

const waitText = (seconds: number) => (seconds >= 90 ? `${Math.ceil(seconds / 60)} minutes` : plural(seconds, "second"));

// ── Step 1: which server ────────────────────────────────────────────────────

function ServerStep({
  initial,
  onServer,
  onAdopted,
  onCancel,
}: {
  initial: string;
  onServer: (server: string) => void;
  onAdopted: (result: ShareResult) => void;
  onCancel: () => void;
}) {
  const client = useQueryClient();
  const [typed, setTyped] = useState(initial);
  const [checked, setChecked] = useState(false);
  const mounted = useQuery({
    queryKey: ["storage", "shares", "mounted"],
    queryFn: () => api.get<MountedSharesResponse>("/api/storage/shares/mounted"),
  });
  // Not under the "storage" key: a live update must not start another search of the network.
  const found = useQuery({
    queryKey: ["storage-discovery"],
    queryFn: () => api.get<DiscoverServersResponse>("/api/storage/shares/discover"),
    staleTime: 60_000,
    retry: false,
  });
  const adopt = useMutation({
    mutationFn: (mount: MountedShare) => api.post<ShareResult>("/api/storage/shares/adopt", { mountPath: mount.mountPath }),
    onSuccess: (result) => {
      onAdopted(result);
      return client.invalidateQueries({ queryKey: ["storage"] });
    },
  });

  const parsed = parseShareServer(typed);
  const problem = typed.trim() && !parsed ? "This does not look like a name or address. Try nas.local or 192.168.1.20." : undefined;
  /** A whole address pasted in (smb://nas/media) is cut down to its server. */
  const takeAddress = (text: string) => {
    const whole = parseShareAddress(text);
    if (whole) setTyped(whole.server);
    return Boolean(whole);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setChecked(true);
    if (parsed) onServer(formatShareServer(parsed.host, parsed.port));
  };

  // What can be used with a tap comes first; what Outpost already has, and what it cannot use, after.
  const rank = (mount: MountedShare) => (!mount.usable ? 2 : mount.shareId ? 1 : 0);
  const mounts = [...(mounted.data?.mounts ?? [])].sort((a, b) => rank(a) - rank(b));
  const servers = found.data?.servers ?? [];
  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <DialogBody className={dialogColumn}>
        <p className="text-small text-ink-muted">
          Choose the NAS or computer that has the shared folder. Outpost asks this Mac to connect it, the way the Finder does, and keeps it
          connected.
        </p>

        {mounts.length > 0 ? (
          <ChoiceList label="Already connected on this Mac">
            {mounts.map((mount) => (
              <ChoiceRow
                key={mount.mountPath}
                icon={<HardDrive aria-hidden />}
                title={mount.share}
                detail={
                  <>
                    <span className="block">
                      On {formatShareServer(mount.server, mount.port)}
                      {mount.shareId ? ", already in Outpost" : null}
                    </span>
                    {mount.usable ? (
                      <span className="block font-mono text-[0.8125rem]">{mount.mountPath}</span>
                    ) : (
                      <span className="block">{mount.problem}</span>
                    )}
                  </>
                }
                disabled={!mount.usable || (adopt.isPending && adopt.variables?.mountPath !== mount.mountPath)}
                busy={adopt.isPending && adopt.variables?.mountPath === mount.mountPath}
                onPick={() => adopt.mutate(mount)}
              />
            ))}
          </ChoiceList>
        ) : null}
        {adopt.isError ? (
          <Notice tone="danger" icon={<CircleAlert />}>
            {errorMessage(adopt.error)}
          </Notice>
        ) : null}

        {found.isPending ? (
          <p className="flex min-h-11 items-center gap-2.5 text-small text-ink-muted">
            <Spinner label="Looking" /> Looking for file servers on your network…
          </p>
        ) : servers.length > 0 ? (
          <ChoiceList label="Found on your network">
            {servers.map((server) => {
              const address = formatShareServer(server.host, server.port);
              return (
                <ChoiceRow
                  key={address}
                  icon={<Network aria-hidden />}
                  title={server.name}
                  detail={<span className="font-mono text-[0.8125rem]">{address}</span>}
                  onPick={() => onServer(address)}
                />
              );
            })}
          </ChoiceList>
        ) : (
          <p className="text-small text-ink-muted">No file server announced itself on your network. Type its name or address below.</p>
        )}

        <Field
          label={servers.length > 0 || mounts.length > 0 ? "Or type its name or address" : "Server"}
          hint="For example nas.local or 192.168.1.20."
          error={problem ?? (checked && !typed.trim() ? "Enter the server, or choose one above." : undefined)}
        >
          {(ids) => (
            <Input
              {...ids}
              {...plainText}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onBlur={(event) => takeAddress(event.target.value)}
              onPaste={(event) => {
                if (takeAddress(event.clipboardData.getData("text"))) event.preventDefault();
              }}
              inputMode="url"
              autoComplete="off"
              enterKeyHint="go"
              maxLength={260}
            />
          )}
        </Field>
      </DialogBody>
      <DialogFooter className={phoneSheetFooter}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!parsed}>
          Continue
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Step 2: sign in, and ask the server what it shares ──────────────────────

function SignInStep({
  server,
  initial,
  onListed,
  onTypeName,
  onBack,
}: {
  server: string;
  initial?: SignIn;
  onListed: (signIn: SignIn, listing: ServerSharesResponse) => void;
  /** Go on without a list: it could not be read, or the person would rather type the name. */
  onTypeName: (signIn: SignIn, why?: string) => void;
  onBack: () => void;
}) {
  const known = initial && !initial.guest ? initial : undefined;
  const [userName, setUserName] = useState(known?.userName ?? "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(known?.remember ?? true);
  const [checked, setChecked] = useState(false);
  const userProblem =
    userName.trim() && !isValidShareUser(userName.trim()) ? "Use letters, digits, dots, dashes and underscores." : undefined;
  const typedSignIn = (): SignIn => ({ guest: false, userName: userName.trim(), password, remember });

  const look = useMutation({
    mutationFn: (signIn: SignIn) =>
      api.post<ServerSharesResponse>(
        "/api/storage/shares/list",
        signIn.guest ? { server, guest: true } : { server, userName: signIn.userName, password: signIn.password },
      ),
    onSuccess: (listing, signIn) => onListed(signIn, listing),
    onError: (error, signIn) => {
      // The sign-in may be fine even though the list cannot be read: carry on by name.
      if (error instanceof ApiError && error.details?.reason === "cannot_list") onTypeName(signIn, errorMessage(error));
    },
  });
  const wait = useWait(look.error);
  const asGuest = look.isPending && look.variables?.guest === true;

  const outcome = useRef<HTMLDivElement>(null);
  const failedAt = look.isError ? look.submittedAt : 0;
  useEffect(() => {
    if (failedAt) outcome.current?.scrollIntoView({ block: "nearest" });
  }, [failedAt]);

  const ready = Boolean(userName.trim()) && !userProblem && Boolean(password);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setChecked(true);
    if (ready && wait === 0) look.mutate(typedSignIn());
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <DialogBody className={dialogColumn}>
        <p className="text-small text-ink-muted">
          Sign in to <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere] text-ink">{server}</span> with an account it
          knows, and Outpost will show the shared folders that account can open.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="User name" error={userProblem ?? (checked && !userName.trim() ? "Enter the user name." : undefined)}>
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
          {look.isError && !(look.error instanceof ApiError && look.error.details?.reason === "cannot_list") ? (
            <Notice tone="danger" icon={<CircleAlert />} title="Not signed in">
              {wait > 0
                ? `Too many wrong passwords for this user on this server. Try again in ${waitText(wait)}.`
                : errorMessage(look.error)}
            </Notice>
          ) : null}
        </div>

        <div className="grid gap-1">
          <Button
            variant="link"
            className={quietAction}
            loading={asGuest}
            disabled={look.isPending}
            onClick={() => look.mutate({ guest: true })}
          >
            Try without a password (guest)
          </Button>
          <Button
            variant="link"
            className={quietAction}
            disabled={look.isPending}
            onClick={() => {
              setChecked(true);
              if (ready) onTypeName(typedSignIn());
            }}
          >
            Type the share’s name instead
          </Button>
        </div>
      </DialogBody>
      <DialogFooter className={phoneSheetFooter}>
        <Button onClick={onBack} disabled={look.isPending}>
          Back
        </Button>
        <Button type="submit" variant="primary" loading={look.isPending && !asGuest} disabled={wait > 0 || asGuest}>
          {look.isPending && !asGuest ? "Looking" : wait > 0 ? `Wait ${waitText(wait)}` : "Show shared folders"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Step 3: which shared folder ─────────────────────────────────────────────

function SharesStep({
  server,
  signIn,
  listing,
  reason,
  onConnected,
  onBack,
}: {
  server: string;
  signIn: SignIn;
  /** What the server offers, or undefined when its list could not be read. */
  listing: ServerSharesResponse | undefined;
  /** Why there is no list, in the server's words. */
  reason?: string;
  onConnected: (result: ShareResult) => void;
  onBack: () => void;
}) {
  const client = useQueryClient();
  const [showHidden, setShowHidden] = useState(false);
  const [typing, setTyping] = useState(!listing);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);

  const connect = useMutation({
    mutationFn: (share: string) => api.post<ShareResult>("/api/storage/shares", { server, share, ...signInBody(signIn) }),
    onSuccess: (result) => {
      onConnected(result);
      return client.invalidateQueries({ queryKey: ["storage"] });
    },
  });
  const wait = useWait(connect.error);
  const outcome = useRef<HTMLDivElement>(null);
  const failedAt = connect.isError ? connect.submittedAt : 0;
  useEffect(() => {
    if (failedAt) outcome.current?.scrollIntoView({ block: "nearest" });
  }, [failedAt]);

  const all = listing?.shares ?? [];
  const hidden = all.filter((share) => share.hidden);
  const shown = showHidden ? all : all.filter((share) => !share.hidden);
  const typedProblem = typed.trim() && !isValidShareName(typed.trim()) ? "Use the share’s name on its own, without slashes." : undefined;
  const detail = (share: ServerShare) => {
    const parts = [share.comment, share.hidden ? "Hidden share" : null].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : undefined;
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setChecked(true);
        if (typed.trim() && !typedProblem && wait === 0) connect.mutate(typed.trim());
      }}
      className="flex min-h-0 flex-1 flex-col"
      noValidate
    >
      <DialogBody className={dialogColumn}>
        {listing ? (
          <>
            <p className="text-small text-ink-muted">
              {signIn.guest ? "As a guest, " : null}
              <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere] text-ink">{server}</span> offers{" "}
              {shown.length > 0 ? "these shared folders" : hidden.length > 0 ? "only hidden shared folders" : "no shared folders"}
              {signIn.guest ? "" : ` to ${signIn.userName}`}.{shown.length > 0 ? " Choose the one to connect." : null}
            </p>
            {shown.length > 0 ? (
              <ul className="divide-y divide-border border-y border-border" aria-label={`Shared folders on ${server}`}>
                {shown.map((share) => (
                  <ChoiceRow
                    key={share.name}
                    icon={<FolderOpen aria-hidden />}
                    title={share.name}
                    detail={detail(share)}
                    trailing={
                      share.mountPath ? (
                        <Badge tone="success">
                          <Check aria-hidden /> Connected
                        </Badge>
                      ) : null
                    }
                    busy={connect.isPending && connect.variables === share.name}
                    disabled={(connect.isPending && connect.variables !== share.name) || wait > 0}
                    onPick={() => connect.mutate(share.name)}
                  />
                ))}
              </ul>
            ) : (
              <Notice tone="info" icon={<Info />} title="Nothing to choose from">
                {hidden.length > 0
                  ? "Every shared folder this account can see is marked hidden on the server."
                  : "The server did not list a shared folder for this account. It may keep its shares out of the list, or this account may not be allowed any."}
              </Notice>
            )}
            {!showHidden && hidden.length > 0 ? (
              <Button variant="link" className={quietAction} onClick={() => setShowHidden(true)}>
                Show {plural(hidden.length, "hidden share")}
              </Button>
            ) : null}
            {listing.unusable > 0 ? (
              <p className="text-small text-ink-muted">
                {plural(listing.unusable, "share")} {listing.unusable === 1 ? "is" : "are"} not shown because{" "}
                {listing.unusable === 1 ? "its name has" : "their names have"} characters Outpost does not accept.
              </p>
            ) : null}
          </>
        ) : (
          <Notice tone="info" icon={<Info />} title="The list of shared folders could not be read">
            {reason ?? "Type the share’s name as the server shows it."}
          </Notice>
        )}

        {typing ? (
          <div className="grid gap-3">
            <Field
              label="Share"
              hint="The shared folder’s name as the server shows it, for example media."
              error={typedProblem ?? (checked && !typed.trim() ? "Enter the share’s name." : undefined)}
            >
              {(ids) => (
                <Input
                  {...ids}
                  {...plainText}
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  autoComplete="off"
                  enterKeyHint="go"
                  maxLength={80}
                />
              )}
            </Field>
            <Button
              type="submit"
              className="justify-self-start"
              loading={connect.isPending && connect.variables === typed.trim()}
              disabled={connect.isPending || wait > 0}
            >
              Connect this share
            </Button>
          </div>
        ) : (
          <Button variant="link" className={quietAction} onClick={() => setTyping(true)}>
            Not in the list? Type its name
          </Button>
        )}

        <div ref={outcome} className="empty:hidden">
          {connect.isError ? (
            <Notice tone="danger" icon={<CircleAlert />} title="Not connected">
              {wait > 0
                ? `Too many wrong passwords for this user on this server. Try again in ${waitText(wait)}.`
                : errorMessage(connect.error)}
            </Notice>
          ) : null}
        </div>
      </DialogBody>
      <DialogFooter className={cn("justify-start", phoneSheetFooter)}>
        <Button onClick={onBack} disabled={connect.isPending}>
          Back
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Step 4: which folder on it ──────────────────────────────────────────────

/** Turns a connected share into a storage location, in a folder of its own by default. */
export function UseShareForm({ share, note, onDone }: { share: NetworkShare; note?: string; onDone: () => void }) {
  const client = useQueryClient();
  const [name, setName] = useState(`${share.share} on ${share.server}`.slice(0, 80));
  const [folder, setFolder] = useState<PickedFolder>({ path: undefined, writable: false });
  const [makeDefault, setMakeDefault] = useState(false);

  const add = useMutation({
    mutationFn: () => api.post("/api/storage/locations", { name: name.trim(), path: folder.path, kind: "network", makeDefault }),
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
        if (folder.path && !already) add.mutate();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogBody className={dialogColumn}>
        <Notice tone="success" icon={<CircleCheck />} title="Connected">
          <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere]">{shareAddress(share)}</span> is at{" "}
          <span className="font-mono text-[0.8125rem] [overflow-wrap:anywhere]">{share.mountPath}</span>
          {share.guest
            ? ", as a guest."
            : share.passwordRemembered
              ? ". Its password is in this Mac’s Keychain."
              : ". Its password was not kept."}
        </Notice>
        {note ? <Notice tone="info">{note}</Notice> : null}

        {already ? (
          <p className="text-small text-ink-muted">
            {share.locations.length === 1 ? "Your storage location " : "Your storage locations "}
            <span className="font-medium text-ink">{share.locations.map((location) => `“${location.name}”`).join(", ")}</span>{" "}
            {share.locations.length === 1 ? "is" : "are"} on this share. There is nothing more to set up.
          </p>
        ) : share.mountPath ? (
          <>
            <p className="text-small text-ink-muted">
              Choose the folder on the share that Outpost should keep its files in. A folder of its own is suggested, so that nothing
              already on the share is mixed up with it. Outpost writes only inside the folder you choose.
            </p>
            <FolderPicker
              label="Folder on the share"
              onChange={setFolder}
              startAt={share.mountPath}
              floor={share.mountPath}
              preferFolder="Outpost"
            />
            <Field label="Name" hint="How this location is shown in Outpost.">
              {(ids) => (
                <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" maxLength={80} required />
              )}
            </Field>
            <SwitchRow
              label="Use for new downloads"
              description="You can still choose a different location for any single download."
              checked={makeDefault}
              onCheckedChange={setMakeDefault}
            />
            {add.isError ? <Notice tone="danger">{errorMessage(add.error)}</Notice> : null}
          </>
        ) : null}
      </DialogBody>
      <DialogFooter className={phoneSheetFooter}>
        {already ? (
          <Button variant="primary" onClick={onDone}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onDone}>Not now</Button>
            <Button type="submit" variant="primary" disabled={!folder.path || !folder.writable || !name.trim()} loading={add.isPending}>
              Add location
            </Button>
          </>
        )}
      </DialogFooter>
    </form>
  );
}

// ── The dialog ──────────────────────────────────────────────────────────────

type Step =
  | { at: "server"; server: string }
  | { at: "signin"; server: string; signIn?: SignIn }
  | { at: "shares"; server: string; signIn: SignIn; listing: ServerSharesResponse | undefined; reason?: string }
  | { at: "folder"; result: ShareResult };

const stepNumber: Record<Step["at"], number> = { server: 1, signin: 2, shares: 3, folder: 4 };

function ConnectWalk({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>({ at: "server", server: "" });
  const number = stepNumber[step.at];
  return (
    <>
      <StepLine step={number} of={STEPS.length} label={STEPS[number - 1]!} />
      {step.at === "server" ? (
        <ServerStep
          initial={step.server}
          onServer={(server) => setStep({ at: "signin", server })}
          onAdopted={(result) => setStep({ at: "folder", result })}
          onCancel={onClose}
        />
      ) : step.at === "signin" ? (
        <SignInStep
          server={step.server}
          initial={step.signIn}
          onListed={(signIn, listing) => setStep({ at: "shares", server: step.server, signIn, listing })}
          onTypeName={(signIn, reason) => setStep({ at: "shares", server: step.server, signIn, listing: undefined, reason })}
          onBack={() => setStep({ at: "server", server: step.server })}
        />
      ) : step.at === "shares" ? (
        <SharesStep
          server={step.server}
          signIn={step.signIn}
          listing={step.listing}
          reason={step.reason}
          onConnected={(result) => setStep({ at: "folder", result })}
          // The password is not carried back: it is typed again if the sign-in is changed.
          onBack={() =>
            setStep({ at: "signin", server: step.server, signIn: step.signIn.guest ? undefined : { ...step.signIn, password: "" } })
          }
        />
      ) : (
        <UseShareForm share={step.result.share} note={step.result.note} onDone={onClose} />
      )}
    </>
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
  // A fresh start each time it is opened: nothing typed before is kept.
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (open) setSession((value) => value + 1);
  }, [open]);

  const close = () => onOpenChange(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Connect a network share" size="lg" className={phoneSheet}>
        {shares.mode === "macos" ? (
          <ConnectWalk key={session} onClose={close} />
        ) : (
          <ShareInstructions key={session} mode={shares.mode} hints={shares.hints} onClose={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}
