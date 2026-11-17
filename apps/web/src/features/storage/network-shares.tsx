/**
 * Network shares on the Storage screen.
 *
 * What this can do depends on where Outpost runs, and it says so. On a Mac run
 * directly, Outpost connects the share itself and keeps it connected. In Docker or on
 * Linux it cannot, so the same form writes out what to add instead (see
 * share-instructions.tsx).
 */
import {
  type NetworkShare,
  type NetworkShareStatus,
  type NetworkSharesResponse,
  type ShareBusyDetails,
  shareAddress,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Ellipsis, KeyRound, Network, Plug, Plus, Trash2, Unplug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ErrorState, Notice, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Skeleton } from "@/components/ui/misc";
import { ApiError, api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn, timeAgo } from "@/lib/utils";
import { ConnectShareDialog, type ShareResult, UseShareForm } from "./connect-share";
import { dialogColumn, PasswordInput, phoneSheet, rememberDescription, SwitchRow } from "./parts";

export const useShares = () =>
  useQuery({ queryKey: ["storage", "shares"], queryFn: () => api.get<NetworkSharesResponse>("/api/storage/shares") });

const statusBadges: Record<NetworkShareStatus, { label: string; tone: "success" | "neutral" | "warning" | "danger" }> = {
  connected: { label: "Connected", tone: "success" },
  disconnected: { label: "Not connected", tone: "neutral" },
  wrong_password: { label: "Wrong password", tone: "danger" },
  server_not_found: { label: "Server not found", tone: "warning" },
  share_not_found: { label: "Share not found", tone: "warning" },
  needs_password: { label: "Password needed", tone: "warning" },
  failed: { label: "Could not connect", tone: "warning" },
};

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
      else notify.error(errorMessage(error));
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

  // A guest's share needs nothing typed; anything else does unless its password is remembered and still good.
  const needsTyping = !share.guest && (!share.passwordRemembered || share.status === "wrong_password" || share.status === "needs_password");
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
            ) : share.guest ? (
              <MenuItem onSelect={() => reconnect.mutate()}>
                <Plug /> Reconnect
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
          {share.guest ? (
            ", as a guest"
          ) : (
            <>
              , as {share.userName}
              <span className="mx-2 text-border-strong max-md:hidden" aria-hidden>
                /
              </span>
              <span className="max-md:block">
                {share.passwordRemembered ? "Password in this Mac’s Keychain" : "Password not remembered"}
              </span>
            </>
          )}
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
        description={`Outpost will ${connected ? "disconnect the share, " : ""}${share.guest ? "" : "remove its password from this Mac’s Keychain and "}forget how to connect it. Files on the share are not touched${
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
