/**
 * Settings → Receivers: the decoders' ports Outpost reads what is heard from (APRS,
 * aircraft, ships). Each is an address and a port; Outpost connects and only reads. Adding
 * or changing one is held to the computer Outpost runs on, as the mesh radio's set-up is;
 * from another device the list is there to read, and the form says why it is not.
 */
import { type HeardReceiver, type HeardReceiverInput, RECEIVER_FORMATS, RECEIVER_KINDS, type ReceiverKind } from "@outpost/shared";
import { CircleAlert, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { NotFromThisDevice, rightReason } from "@/components/setting-right";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select, Skeleton, Switch } from "@/components/ui/misc";
import { SettingsSection } from "@/features/settings/parts";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useReceivers, useRemoveReceiver, useSaveReceiver } from "./data";
import { ListenOnly } from "./licence";
import { PiDecoders } from "./pi-decoders";
import { PowerCut } from "./power-cut";
import { KIND_NAMES, lastPacketWords, stateWords, UNTRIED } from "./words";

const ADD: Record<ReceiverKind, string> = { aprs: "Add an APRS receiver", adsb: "Add an aircraft receiver", ais: "Add a ship receiver" };

const WHY_ID = "receivers-not-from-this-device";
const SCOPE = "the receivers, the mesh radio set-up and the switch that lets other programs use Outpost's tools";

const blank = (kind: ReceiverKind): HeardReceiverInput => ({
  kind,
  name: kind === "aprs" ? "APRS radio" : kind === "adsb" ? "Aircraft receiver" : "Ship receiver",
  host: "",
  port: RECEIVER_FORMATS[kind].port,
  transport: "tcp",
  enabled: true,
});

function ReceiverForm({
  initial,
  id,
  disabled,
  onDone,
}: {
  initial: HeardReceiverInput;
  id?: string;
  disabled: boolean;
  onDone: () => void;
}) {
  const [value, setValue] = useState(initial);
  const formId = useId();
  const save = useSaveReceiver();
  const udp = value.transport === "udp";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({ id, input: { ...value, name: value.name.trim(), host: value.host.trim() } }, { onSuccess: onDone });
  };
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-panel border border-border p-4" aria-describedby={disabled ? WHY_ID : undefined}>
      <Field label="What it hears">
        {(ids) => (
          <Select
            {...ids}
            value={value.kind}
            disabled={disabled || Boolean(id)}
            onChange={(kind) =>
              setValue({ ...blank(kind), name: value.name === blank(value.kind).name ? blank(kind).name : value.name, host: value.host })
            }
            options={RECEIVER_KINDS.map((kind) => ({ value: kind, label: KIND_NAMES[kind], description: RECEIVER_FORMATS[kind].format }))}
            className="w-72 max-w-full"
          />
        )}
      </Field>
      <Field label="Name">
        {(ids) => (
          <Input
            {...ids}
            value={value.name}
            maxLength={60}
            disabled={disabled}
            // The button that opened the form is gone: focus comes here, not to the page (WCAG 2.4.3).
            autoFocus
            onChange={(event) => setValue({ ...value, name: event.target.value })}
          />
        )}
      </Field>
      {value.kind === "ais" ? (
        <Field label="How the decoder sends">
          {(ids) => (
            <Select
              {...ids}
              value={value.transport}
              disabled={disabled}
              onChange={(transport) => setValue({ ...value, transport, port: transport === "udp" ? 10110 : value.port })}
              options={[
                { value: "tcp", label: "Outpost connects to it (TCP)" },
                { value: "udp", label: "It sends to Outpost (UDP)", description: "Outpost listens on a port, for this one address only" },
              ]}
              className="w-72 max-w-full"
            />
          )}
        </Field>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <Field
          label={udp ? "The decoder's address" : "Address of the computer running the decoder"}
          hint={
            udp
              ? "Its numbers, such as 192.168.1.20: datagrams from anywhere else are ignored."
              : "Such as 192.168.1.20 or radio-mac.local. On the Pi Outpost runs on, in Docker: host.docker.internal."
          }
        >
          {(ids) => (
            <Input
              {...ids}
              value={value.host}
              maxLength={253}
              required
              disabled={disabled}
              autoCapitalize="off"
              spellCheck={false}
              className="font-mono"
              onChange={(event) => setValue({ ...value, host: event.target.value })}
            />
          )}
        </Field>
        <Field label={udp ? "Port to listen on" : "Port"}>
          {(ids) => (
            <Input
              {...ids}
              type="number"
              min={1}
              max={65535}
              value={value.port}
              disabled={disabled}
              className="tabular"
              onChange={(event) => setValue({ ...value, port: Number(event.target.value) })}
            />
          )}
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Switch
          id={`${formId}-enabled`}
          checked={value.enabled}
          disabled={disabled}
          onCheckedChange={(enabled) => setValue({ ...value, enabled })}
        />
        <label htmlFor={`${formId}-enabled`} className="text-small text-ink">
          Connect now
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={disabled} loading={save.isPending}>
          {id ? "Save receiver" : "Add receiver"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ReceiverRow({ receiver, disabled }: { receiver: HeardReceiver; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const remove = useRemoveReceiver();
  const trouble = receiver.status.state === "away";
  // Back to Change when the form closes, rather than to the top of the page.
  const change = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing) change.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  if (editing)
    return (
      <li className="py-3">
        <ReceiverForm id={receiver.id} initial={receiver} disabled={disabled} onDone={() => setEditing(false)} />
      </li>
    );
  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-small font-medium text-ink">
          {receiver.name} <span className="font-normal text-ink-muted">· {KIND_NAMES[receiver.kind]}</span>
        </p>
        <p role="status" className={cn("flex items-baseline gap-1.5 text-small", trouble ? "text-warning" : "text-ink")}>
          {trouble ? <CircleAlert aria-hidden className="size-4 shrink-0 translate-y-0.5" /> : null}
          <span className="min-w-0 [overflow-wrap:anywhere]">{stateWords(receiver)}</span>
        </p>
        <p className="text-small text-ink-muted">{lastPacketWords(receiver)}</p>
      </div>
      <div className="flex gap-1">
        <Button
          ref={change}
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => setEditing(true)}
          aria-label={`Change ${receiver.name}`}
        >
          <Pencil aria-hidden /> Change
        </Button>
        <Button
          size="sm"
          variant="danger-ghost"
          disabled={disabled}
          onClick={() => setRemoving(true)}
          aria-label={`Remove ${receiver.name}`}
        >
          <Trash2 aria-hidden /> Remove
        </Button>
      </div>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${receiver.name}?`}
        description="Outpost stops reading from it. What it heard is kept until you clear it on the Heard on the radio screen."
        confirmLabel="Remove receiver"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(receiver.id, { onSuccess: () => setRemoving(false) })}
      />
    </li>
  );
}

export function ReceiversSettingsSection() {
  const receivers = useReceivers();
  const [adding, setAdding] = useState<ReceiverKind | null>(null);
  // Back to the Add button that opened the form when it closes, rather than to the top of the page.
  const addButtons = useRef(new Map<ReceiverKind, HTMLButtonElement | null>());
  const lastAdded = useRef<ReceiverKind | null>(null);
  useEffect(() => {
    if (adding) lastAdded.current = adding;
    else if (lastAdded.current) {
      addButtons.current.get(lastAdded.current)?.focus();
      lastAdded.current = null;
    }
  }, [adding]);
  const data = receivers.data;
  const disabled = !data?.right.allowed;
  return (
    <SettingsSection
      id="receivers"
      title="Receivers"
      description={
        <>
          Decoders on the network that Outpost reads APRS, aircraft and ships from. What they hear is on the{" "}
          <Link to="/radio/heard" className="text-primary underline underline-offset-2">
            Heard on the radio
          </Link>{" "}
          screen and the map.
        </>
      }
    >
      <ListenOnly />
      <p className="text-small text-ink-muted">{UNTRIED}</p>
      {receivers.isPending ? (
        <div className="grid gap-2" aria-busy>
          <Skeleton className="h-5" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      ) : receivers.isError || !data ? (
        <Notice
          tone="danger"
          action={
            <Button size="sm" onClick={() => void receivers.refetch()}>
              Try again
            </Button>
          }
        >
          {errorMessage(receivers.error)}
        </Notice>
      ) : (
        <>
          {data.right.allowed ? (
            <p className="text-small text-ink-muted">{rightReason(data.right)}</p>
          ) : (
            <NotFromThisDevice
              id={WHY_ID}
              right={data.right}
              what="Receivers"
              because="each opens a connection or a port from that computer"
              scope={SCOPE}
            />
          )}
          {data.receivers.length > 0 ? (
            <ul aria-label="Receivers" className="divide-y divide-border border-y border-border">
              {data.receivers.map((receiver) => (
                <ReceiverRow key={receiver.id} receiver={receiver} disabled={disabled} />
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-muted">
              No receiver yet, so Outpost connects to nothing. The guides on the Heard on the radio screen say how to start a decoder on a
              Raspberry Pi, a Mac or Windows.
            </p>
          )}
          {adding ? (
            <ReceiverForm initial={blank(adding)} disabled={disabled} onDone={() => setAdding(null)} />
          ) : (
            <div className="flex flex-wrap gap-2">
              {RECEIVER_KINDS.map((kind) => (
                <Button
                  key={kind}
                  ref={(button) => {
                    addButtons.current.set(kind, button);
                  }}
                  disabled={disabled}
                  onClick={() => setAdding(kind)}
                >
                  <Plus aria-hidden /> {ADD[kind]}
                </Button>
              ))}
            </div>
          )}
          {data.pi ? <PiDecoders status={data.pi} disabled={disabled} /> : null}
          <PowerCut />
        </>
      )}
    </SettingsSection>
  );
}
