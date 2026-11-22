/**
 * Settings → Mesh radio: the household board reaching beyond the Wi-Fi through a LoRa
 * radio running Meshtastic or MeshCore firmware. Two parts, one per firmware, each with
 * its way in, its fields, a true line of what it is doing, and the steps to take on the
 * radio itself in the radio's own app. Then a test message per radio channel, and the
 * longer reasons behind one closed line.
 *
 * Turning a way in on or off, choosing a device and opening the broker's port can only be
 * done on the computer Outpost runs on (`right.allowed`); from another device the forms
 * are there to read, disabled, and the state and test messages still work.
 */
import {
  MESH_CHANNEL_NAME_MAX,
  MESH_DEFAULT_PORTS,
  type MeshBrokerFound,
  type MeshBrokerTestInput,
  type MeshChannel,
  type MeshCoreInput,
  type MeshCoreMode,
  type MeshLinkState,
  type MeshMeta,
  type MeshResponse,
  type MeshtasticChannelChoice,
  type MeshtasticInput,
  type MeshtasticMode,
} from "@outpost/shared";
import { CircleAlert, ExternalLink, Plus, RefreshCw, Send, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Disclosure, Notice } from "@/components/page";
import { NotFromThisDevice, REMOTE_SETTINGS_SCOPE, rightReason } from "@/components/setting-right";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Checkbox, Select, Skeleton } from "@/components/ui/misc";
import { allMessages, useBoardMessages, useDeviceName } from "@/features/board/data";
import { useHomeCountry } from "@/features/frequencies/home-country";
import { LicenceLine } from "@/features/radio/licence";
import { SettingRow, SettingsSection } from "@/features/settings/parts";
import { errorMessage } from "@/lib/api";
import { useClockStyle } from "@/lib/clock";
import { notify } from "@/lib/notify";
import { usePageVisible } from "@/lib/page-visible";
import { deviceRegion } from "@/lib/region";
import { cn } from "@/lib/utils";
import { suggestPassword, useMesh, useMeshDevices, useMeshTest, useSaveMeshCore, useSaveMeshtastic } from "./data";
import { DynamicSecurity, FindBroker, PortInUse, TestBroker } from "./household-broker";
import { MosquittoGuide } from "./mosquitto-guide";
import { rootTopicHint, suggestedRoot } from "./root-topic";
import {
  awayAdvice,
  CHOOSE_BROKER,
  deliveryWords,
  heardWords,
  INTRO,
  inUseWords,
  JSON_OFF,
  meshcoreStateWords,
  meshtasticStateWords,
  NO_LAN,
  NOT_MANAGED,
  REGION_URL,
  REMOTE,
  radiosWords,
  SAVE_ON_PURPOSE,
  switchWords,
  TRADEMARK,
  UNTRIED,
  WARNINGS,
} from "./words";

const mono = "font-mono text-[0.8125rem] text-ink [overflow-wrap:anywhere]";
const link = "text-primary underline decoration-1 underline-offset-2 hover:decoration-2";

/** Draws again once a minute while the page is in view, so that "3 minutes ago" stays true; never while it is hidden. */
function useMinuteTick() {
  const shown = usePageVisible();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!shown) return;
    setTick((tick) => tick + 1);
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [shown]);
}

const isPort = (text: string) => /^\d{1,5}$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 65_535;
const PORT_PROBLEM = "A port is a whole number from 1 to 65535.";

export function MeshSettingsSection() {
  useClockStyle();
  useMinuteTick();
  const mesh = useMesh();
  const data = mesh.data;

  return (
    <SettingsSection
      id="mesh"
      title="Mesh radio"
      description="Optional. Carries the board under Messages beyond the Wi-Fi, by a LoRa radio, with no internet."
    >
      <div className="grid gap-2 text-small text-ink-muted">
        <p>{INTRO}</p>
        <p className="font-medium text-ink">{UNTRIED}</p>
      </div>

      <LicenceLine use="licence-free" />

      <ul aria-label="Before you use it" className="grid list-disc gap-1.5 pl-5 text-small text-ink marker:text-ink-muted">
        <li>{WARNINGS.public}</li>
        <li>{WARNINGS.privateKey}</li>
        <li>{WARNINGS.lost}</li>
        <li>
          {WARNINGS.licence}{" "}
          <a href={REGION_URL} target="_blank" rel="noopener noreferrer" className={link}>
            Meshtastic's page on regional settings
            <ExternalLink aria-hidden className="ml-1 inline size-3.5 -translate-y-px" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      </ul>

      {mesh.isPending ? (
        <div className="grid gap-2" aria-busy>
          <Skeleton className="h-5" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-24" />
        </div>
      ) : mesh.isError || !data ? (
        <Notice
          tone="danger"
          action={
            <Button size="sm" onClick={() => void mesh.refetch()}>
              Try again
            </Button>
          }
        >
          {errorMessage(mesh.error)}
        </Notice>
      ) : (
        <>
          {data.right.allowed ? (
            <p className="text-small text-ink-muted">{rightReason(data.right)}</p>
          ) : (
            <NotFromThisDevice id={WHY_ID} right={data.right} what={REMOTE.what} because={REMOTE.because} scope={REMOTE_SETTINGS_SCOPE} />
          )}
          <p className="text-small text-ink-muted">{SAVE_ON_PURPOSE}</p>
          <MeshtasticPart key={JSON.stringify(data.meshtastic.config)} data={data} />
          <MeshCorePart key={JSON.stringify(data.meshcore.config)} data={data} />
          <TestMessages channels={data.channels} />
          <MoreAbout />
        </>
      )}
    </SettingsSection>
  );
}

// ── Pieces shared by both parts ──

function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-border pt-5">
      <h3 id={id} className="text-body font-semibold text-ink">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** What a way in is doing, said as the server reports it, and when the radio was last heard. */
function StateLine({ words, state, lastHeardAt }: { words: string; state: MeshLinkState; lastHeardAt: number | null }) {
  const tone = state === "failed" ? "text-danger" : state === "away" ? "text-warning" : "text-ink";
  return (
    <div role="status" className="text-small">
      <p className={cn("flex items-baseline gap-1.5 font-medium", tone)}>
        {state === "failed" || state === "away" ? <CircleAlert aria-hidden className="size-4 shrink-0 translate-y-0.5" /> : null}
        <span className="min-w-0 [overflow-wrap:anywhere]">{words}</span>
      </p>
      {state === "off" ? null : <p className="text-ink-muted">{heardWords(lastHeardAt)}</p>}
    </div>
  );
}

/** The id of the notice that says why the set-up cannot be changed from this device; each disabled form points to it. */
const WHY_ID = "mesh-not-from-this-device";

function SaveRow({
  problem,
  pending,
  onSave,
  allowed,
}: {
  problem: string | null;
  pending: boolean;
  onSave: () => void;
  allowed: boolean;
}) {
  return (
    // In the flow of the page: at the left under the fields it saves, as every form's button is.
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button variant="primary" loading={pending} disabled={!allowed || problem !== null} onClick={onSave}>
        Save
      </Button>
      {!allowed ? (
        <p className="min-w-0 flex-1 text-small text-ink-muted">{REMOTE.short}</p>
      ) : problem ? (
        <p role="alert" className="min-w-0 flex-1 text-small text-danger">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

function PasswordField({
  label,
  value,
  set,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  set: boolean;
  onChange: (value: string) => void;
  optional?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="grid gap-1.5 sm:col-span-2">
      <Field
        label={label}
        optional={optional}
        hint={
          shown && value
            ? "Shown so that you can type it into the radio's app. Kept once you press Save, and never shown again."
            : set
              ? "Set; type a new one to change it."
              : "Not set."
        }
      >
        {(ids) => (
          <div className="flex flex-wrap gap-2">
            <Input
              {...ids}
              type={shown ? "text" : "password"}
              value={value}
              autoComplete="new-password"
              spellCheck={false}
              onChange={(event) => onChange(event.target.value)}
              className={cn("min-w-[12rem] flex-1", shown && "font-mono text-small")}
            />
            <Button
              onClick={() => {
                onChange(suggestPassword());
                setShown(true);
              }}
            >
              Suggest one
            </Button>
          </div>
        )}
      </Field>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  monoText,
  inputMode,
  optional,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  hint?: ReactNode;
  monoText?: boolean;
  inputMode?: "numeric";
  optional?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={error ?? undefined} optional={optional}>
      {(ids) => (
        <Input
          {...ids}
          value={value}
          inputMode={inputMode}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          className={cn(monoText && "font-mono text-small", inputMode === "numeric" && "tabular")}
        />
      )}
    </Field>
  );
}

const Steps = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid gap-2">
    <h4 className="text-small font-medium text-ink">{label}</h4>
    <ol className="grid list-decimal gap-2 pl-5 text-small text-ink marker:text-ink-muted">{children}</ol>
  </div>
);

// ── Meshtastic, by MQTT ──

interface ChannelDraft {
  key: string;
  name: string;
  index: string;
}

let draftKeys = 0;
function draftKey(): string {
  draftKeys += 1;
  return `c${draftKeys}`;
}

function channelProblem(channels: ChannelDraft[]): string | null {
  const names = new Set<string>();
  const indexes = new Set<number>();
  for (const channel of channels) {
    const name = channel.name.trim();
    if (!name) return "Give each channel carried its name as the radio has it.";
    if (name.length > MESH_CHANNEL_NAME_MAX) return `A channel's name is at most ${MESH_CHANNEL_NAME_MAX} characters.`;
    if (names.has(name.toLowerCase())) return `${name} is listed twice.`;
    names.add(name.toLowerCase());
    if (!/^[0-7]$/.test(channel.index.trim())) return `${name}: its number on the radio is from 0 to 7.`;
    const index = Number(channel.index);
    if (indexes.has(index)) return `Two channels have the number ${index}; each has its own on the radio.`;
    indexes.add(index);
  }
  return null;
}

function MeshtasticPart({ data }: { data: MeshResponse }) {
  const { config, status } = data.meshtastic;
  const allowed = data.right.allowed;
  const save = useSaveMeshtastic();
  const [mode, setMode] = useState<MeshtasticMode>(config.mode);
  const [brokerPort, setBrokerPort] = useState(String(config.broker.port || MESH_DEFAULT_PORTS.mqtt));
  const [brokerUser, setBrokerUser] = useState(config.broker.userName);
  const [brokerPassword, setBrokerPassword] = useState("");
  const [host, setHost] = useState(config.client.host);
  const [clientPort, setClientPort] = useState(String(config.client.port || MESH_DEFAULT_PORTS.mqtt));
  const [clientUser, setClientUser] = useState(config.client.userName);
  const [clientPassword, setClientPassword] = useState("");
  const [rootTopic, setRootTopic] = useState(config.client.rootTopic || "msh/EU_868");
  // Before a household broker is saved, the root topic starts on the one for Home's country (else the device's), until typed in.
  const home = useHomeCountry();
  const region = deviceRegion();
  const suggested = suggestedRoot(home, region);
  const [rootTyped, setRootTyped] = useState(Boolean(config.client.host));
  useEffect(() => {
    if (!rootTyped && suggested) setRootTopic(suggested);
  }, [rootTyped, suggested]);
  const [tls, setTls] = useState(config.client.tls);
  const [ca, setCa] = useState(config.client.ca ?? "");
  const [channels, setChannels] = useState<ChannelDraft[]>(() =>
    (config.channels.length > 0 ? config.channels : [{ name: "LongFast", index: 0 }]).map((channel) => ({
      key: draftKey(),
      name: channel.name,
      index: String(channel.index),
    })),
  );
  const modeId = useId();
  const headingId = useId();

  const portText = mode === "broker" ? brokerPort : clientPort;
  const portError = mode !== "off" && !isPort(portText) ? PORT_PROBLEM : null;
  const problem =
    mode === "off"
      ? null
      : (portError ??
        (mode === "client" && !host.trim() ? "Type the address of the household's broker." : null) ??
        (mode === "client" && !rootTopic.trim() ? "Type the radio's root topic." : null) ??
        (channels.length === 0 ? "Carry at least one channel." : channelProblem(channels)));

  const submit = () => {
    const carried: MeshtasticChannelChoice[] = channels.map((channel) => ({ name: channel.name.trim(), index: Number(channel.index) }));
    const input: MeshtasticInput = { mode };
    if (mode === "broker")
      input.broker = { port: Number(brokerPort), userName: brokerUser.trim(), ...(brokerPassword ? { password: brokerPassword } : {}) };
    if (mode === "client")
      input.client = {
        host: host.trim(),
        port: Number(clientPort),
        userName: clientUser.trim(),
        rootTopic: rootTopic.trim(),
        tls,
        ca: tls ? ca.trim() || null : config.client.ca,
        ...(clientPassword ? { password: clientPassword } : {}),
      };
    if (mode !== "off") input.channels = carried;
    save.mutate(input, {
      onSuccess: () => toast.success(mode === "off" ? "Meshtastic is off." : "Saved. Outpost is starting the link."),
      onError: (error) => notify.error(errorMessage(error)),
    });
  };

  const carry = (name: string) => {
    const used = new Set(channels.map((channel) => Number(channel.index)));
    const free = [0, 1, 2, 3, 4, 5, 6, 7].find((index) => !used.has(index)) ?? 0;
    setChannels([...channels, { key: draftKey(), name, index: String(free) }]);
  };

  const addresses = status.brokerAddresses.map((address) => `${address}:${isPort(brokerPort) ? Number(brokerPort) : config.broker.port}`);
  const carriedNames = channels.map((channel) => channel.name.trim()).filter(Boolean);
  const switching =
    mode === "off"
      ? null
      : switchWords(config, { mode, host: host.trim(), port: portText, userName: clientUser.trim() }, addresses[0] ?? null);
  const testInput: MeshBrokerTestInput | null =
    host.trim() && isPort(clientPort) && rootTopic.trim()
      ? {
          host: host.trim(),
          port: Number(clientPort),
          userName: clientUser.trim(),
          rootTopic: rootTopic.trim(),
          tls,
          ...(tls && ca.trim() ? { ca: ca.trim() } : {}),
          ...(clientPassword ? { password: clientPassword } : {}),
        }
      : null;
  const fillFromFound = (found: MeshBrokerFound) => {
    setMode("client");
    setHost(found.host);
    setClientPort(String(found.port));
    setTls(found.tls);
  };

  return (
    <Part id={headingId} title="Meshtastic, by MQTT">
      <StateLine words={meshtasticStateWords(config, status)} state={status.state} lastHeardAt={status.lastHeardAt} />
      <LinkDetails config={config} status={status} />
      {status.portInUse ? (
        <PortInUse
          port={status.portInUse.port}
          freePort={status.portInUse.freePort}
          disabled={!allowed}
          onFreePort={(free) => {
            setMode("broker");
            setBrokerPort(String(free));
          }}
          onUseExisting={() =>
            fillFromFound({
              host: "127.0.0.1",
              port: status.portInUse?.port ?? 1883,
              tls: false,
              where: "this-computer",
              answer: "needs-login",
              words: "",
            })
          }
        />
      ) : null}
      {status.state !== "off" && status.json === false ? (
        <Notice tone="warning" icon={<CircleAlert aria-hidden />}>
          {JSON_OFF}
        </Notice>
      ) : null}
      {config.mode === "broker" && !data.lanAccess ? (
        <Notice tone="warning" icon={<CircleAlert aria-hidden />}>
          {NO_LAN}
        </Notice>
      ) : null}
      {status.otherChannels.length > 0 ? (
        <div className="grid gap-1.5 text-small">
          <p className="text-ink">Also heard: {status.otherChannels.join(", ")}</p>
          <ul aria-label="Channels heard and not carried" className="flex flex-wrap gap-2">
            {status.otherChannels.map((name) => (
              <li key={name}>
                <Button
                  size="sm"
                  disabled={!allowed || mode === "off" || carriedNames.includes(name)}
                  onClick={() => carry(name)}
                  aria-label={`Add ${name} to the channels carried`}
                >
                  <Plus aria-hidden /> Add {name}
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-ink-muted">Added to the list below; check its number on the radio, then save.</p>
        </div>
      ) : null}

      <fieldset
        disabled={!allowed}
        aria-describedby={allowed ? undefined : WHY_ID}
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
      >
        <SettingRow
          htmlFor={modeId}
          label="How Outpost reaches the radio"
          hint={`A radio on the home Wi-Fi sends what it hears to an MQTT broker and takes what the broker gives it. ${CHOOSE_BROKER}`}
          control={
            <Select
              id={modeId}
              value={mode}
              disabled={!allowed}
              onChange={setMode}
              className="w-64 max-w-full"
              options={[
                { value: "off", label: "Off" },
                { value: "broker", label: "Outpost is the broker" },
                { value: "client", label: "Use the household's broker" },
              ]}
            />
          }
        />

        {mode === "broker" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Port" value={brokerPort} onChange={setBrokerPort} error={portError} inputMode="numeric" />
            <TextField label="User name" value={brokerUser} onChange={setBrokerUser} />
            <PasswordField label="Password" value={brokerPassword} set={config.broker.passwordSet} onChange={setBrokerPassword} />
          </div>
        ) : null}
        {mode === "broker" && data.inContainer ? (
          <p className="text-small text-ink-muted">
            Outpost runs in a container: a radio reaches this broker only if compose.yaml publishes the port (
            <span className={mono}>
              - "{isPort(brokerPort) ? brokerPort : 1883}:{isPort(brokerPort) ? brokerPort : 1883}"
            </span>
            ). If a Mosquitto on this computer already has port 1883, Docker cannot give it to Outpost too: use that Mosquitto instead.
          </p>
        ) : null}

        {mode === "client" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="The broker's address" value={host} onChange={setHost} monoText hint="For example 192.168.1.5." />
            <TextField label="Port" value={clientPort} onChange={setClientPort} error={portError} inputMode="numeric" />
            <TextField label="User name" value={clientUser} onChange={setClientUser} optional />
            <TextField
              label="Root topic"
              value={rootTopic}
              onChange={(value) => {
                setRootTyped(true);
                setRootTopic(value);
              }}
              monoText
              hint={status.heardRoot ? `The radio was last heard under ${status.heardRoot}.` : rootTopicHint(home, region)}
            />
            <PasswordField label="Password" value={clientPassword} set={config.client.passwordSet} onChange={setClientPassword} optional />
            <TlsFields tls={tls} onTls={setTls} ca={ca} onCa={setCa} />
          </div>
        ) : null}
        {mode === "client" ? (
          <div className="grid gap-4">
            <FindBroker host={host} port={isPort(clientPort) ? Number(clientPort) : null} disabled={!allowed} onUse={fillFromFound} />
            <TestBroker input={testInput} disabled={!allowed} />
            <p className="text-small text-ink-muted">{NOT_MANAGED}</p>
          </div>
        ) : null}

        {mode !== "off" ? <ChannelsEditor channels={channels} onChange={setChannels} /> : null}

        {switching ? (
          <Notice tone="warning" icon={<CircleAlert aria-hidden />} title="Before you save: what changes on the radio">
            <ul className="grid list-disc gap-1 pl-5">
              {switching.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        <SaveRow allowed={allowed} problem={problem} pending={save.isPending} onSave={submit} />
      </fieldset>

      {mode === "client" ? (
        <DynamicSecurity
          saved={config.mode === "client" && Boolean(config.client.host)}
          disabled={!allowed}
          rootTopic={rootTopic.trim() || "msh/EU_868"}
        />
      ) : null}
      {mode !== "off" ? <MosquittoGuide rootTopic={rootTopic} outpostUser={clientUser} /> : null}

      {mode !== "off" ? (
        <MeshtasticSteps
          mode={mode}
          addresses={addresses}
          inContainer={data.inContainer}
          host={host.trim()}
          port={portText}
          userName={(mode === "broker" ? brokerUser : clientUser).trim()}
          rootTopic={rootTopic.trim()}
          channels={carriedNames}
          tls={mode === "client" && tls}
        />
      ) : null}
    </Part>
  );
}

/** Which broker is in use, who has published, how much, and what to do when it is down. */
function LinkDetails({ config, status }: { config: MeshResponse["meshtastic"]["config"]; status: MeshResponse["meshtastic"]["status"] }) {
  const inUse = inUseWords(config);
  if (!inUse) return null;
  const radios = radiosWords(status);
  return (
    <div className="grid gap-1 text-small text-ink-muted">
      <p>{inUse}</p>
      {status.state === "connected" || status.state === "listening" ? (
        <p>
          {radios.length > 0 ? `Published: ${radios.join("; ")}. ` : "No radio has published since the link started. "}
          {status.perMinute} message{status.perMinute === 1 ? "" : "s"} in the last minute.
        </p>
      ) : null}
      {status.dropped > 0 ? (
        <p className="text-warning">
          {status.dropped} message{status.dropped === 1 ? "" : "s"} from the broker left unread: more came than the 20 a second Outpost
          takes.
        </p>
      ) : null}
      {status.state === "away" ? <p>{awayAdvice(config)}</p> : null}
    </div>
  );
}

/** TLS to the household's broker, and the household's own certificate authority to check it with. */
function TlsFields({ tls, onTls, ca, onCa }: { tls: boolean; onTls: (on: boolean) => void; ca: string; onCa: (ca: string) => void }) {
  const id = useId();
  return (
    <div className="grid gap-3 sm:col-span-2">
      <div className="flex items-start gap-2">
        <Checkbox id={id} checked={tls} onCheckedChange={(value) => onTls(value === true)} className="mt-0.5" />
        <label htmlFor={id} className="text-small text-ink">
          Use TLS
          <span className="block text-ink-muted">
            Encrypts the sign-in and the messages on the home network. Mosquitto's TLS port is usually 8883. The broker's certificate is
            always checked.
          </span>
        </label>
      </div>
      {tls ? (
        <Field
          label="The household's CA certificate"
          optional
          hint="Paste the ca.crt the broker's certificate was made with. Leave it empty for a certificate from a public authority."
        >
          {(ids) => (
            <Textarea
              {...ids}
              value={ca}
              rows={4}
              spellCheck={false}
              placeholder="-----BEGIN CERTIFICATE-----"
              onChange={(event) => onCa(event.target.value)}
              className="font-mono text-[0.8125rem]"
            />
          )}
        </Field>
      ) : null}
    </div>
  );
}

function ChannelsEditor({ channels, onChange }: { channels: ChannelDraft[]; onChange: (next: ChannelDraft[]) => void }) {
  const update = (key: string, change: Partial<ChannelDraft>) =>
    onChange(channels.map((channel) => (channel.key === key ? { ...channel, ...change } : channel)));
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="text-small font-medium text-ink">Channels carried</legend>
      <p className="text-small text-ink-muted">
        Each shows as a channel under Messages. The name and number are as the radio has them: its first channel, number 0, is usually
        LongFast.
      </p>
      {channels.length > 0 ? (
        <ul className="divide-y divide-border border-y border-border">
          {channels.map((channel, position) => (
            <li key={channel.key} className="flex flex-wrap items-end gap-x-3 gap-y-2 py-2.5">
              <Field label="Name" className="min-w-[10rem] flex-[2]">
                {(ids) => (
                  <Input
                    {...ids}
                    value={channel.name}
                    maxLength={MESH_CHANNEL_NAME_MAX}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => update(channel.key, { name: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Number on the radio" className="w-36">
                {(ids) => (
                  <Input
                    {...ids}
                    value={channel.index}
                    inputMode="numeric"
                    className="tabular"
                    onChange={(event) => update(channel.key, { index: event.target.value })}
                  />
                )}
              </Field>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Stop carrying ${channel.name.trim() || `channel ${position + 1}`}`}
                onClick={() => onChange(channels.filter((entry) => entry.key !== channel.key))}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <Button
          variant="ghost"
          className="-ml-2.5"
          onClick={() => onChange([...channels, { key: draftKey(), name: "", index: String(channels.length) }])}
        >
          <Plus aria-hidden /> Add a channel
        </Button>
      </div>
    </fieldset>
  );
}

function MeshtasticSteps({
  mode,
  addresses,
  inContainer,
  host,
  port,
  userName,
  rootTopic,
  channels,
  tls,
}: {
  mode: "broker" | "client";
  addresses: string[];
  inContainer: boolean;
  host: string;
  port: string;
  userName: string;
  rootTopic: string;
  channels: string[];
  tls: boolean;
}) {
  const server =
    mode === "client" ? (
      <span className={mono}>{host ? `${host}:${port}` : "the household's broker, with its port"}</span>
    ) : addresses.length === 1 ? (
      <span className={mono}>{addresses[0]}</span>
    ) : addresses.length > 1 ? (
      <>
        one of this computer's addresses on the home network:{" "}
        {addresses.map((address, index) => (
          <span key={address}>
            {index > 0 ? ", " : ""}
            <span className={mono}>{address}</span>
          </span>
        ))}{" "}
        (the first is usually right)
      </>
    ) : (
      <>
        this computer's address on the home network with the port <span className={mono}>{port}</span>.{" "}
        {inContainer
          ? "Outpost runs in a container and cannot see the computer's addresses; publish the port in the container's settings too."
          : "Outpost found none for itself."}
      </>
    );
  const named = channels.length > 0 ? channels.join(", ") : "each channel carried";
  return (
    <Steps label="On the radio, in Meshtastic's own app">
      <li>
        <span className="font-medium">Settings → Network:</span> turn Wi-Fi on and join it to the home network.
      </li>
      <li>
        <span className="font-medium">Settings → MQTT:</span>
        <ul className="mt-1 grid list-disc gap-1 pl-5 marker:text-ink-muted">
          <li>MQTT on.</li>
          <li>Server address: {server}.</li>
          <li>
            User name {userName ? <span className={mono}>{userName}</span> : "as set here"}, and the password set here
            {mode === "client" ? " for the household's broker" : ""}.
          </li>
          {mode === "client" ? (
            <li>
              Root topic <span className={mono}>{rootTopic || "msh/EU_868"}</span>, the same as here.
            </li>
          ) : null}
          <li>Encryption off.</li>
          <li>
            <span className="font-medium">JSON output on.</span> Meshtastic says “JSON is not supported on the nRF52 platform”, so this
            works with ESP32 radios only.
          </li>
          <li>{tls ? "TLS on (not tried with a real radio)." : "TLS off."}</li>
        </ul>
      </li>
      <li>On {named}: Uplink on and Downlink on.</li>
      <li>
        Add a channel named <span className={mono}>mqtt</span> with Downlink on; its key can be anything. Meshtastic's documented way of
        sending JSON to the radio needs it.
      </li>
      <li>Reboot the radio.</li>
    </Steps>
  );
}

// ── MeshCore ──

function MeshCorePart({ data }: { data: MeshResponse }) {
  const { config, status } = data.meshcore;
  const allowed = data.right.allowed;
  const save = useSaveMeshCore();
  const [mode, setMode] = useState<MeshCoreMode>(config.mode);
  const [device, setDevice] = useState<string | null>(config.device);
  const [host, setHost] = useState(config.host);
  const [port, setPort] = useState(String(config.port || MESH_DEFAULT_PORTS.meshcoreTcp));
  const [slots, setSlots] = useState<Array<{ key: string; value: string }>>(() =>
    (config.channels.length > 0 ? config.channels : [0]).map((slot) => ({ key: draftKey(), value: String(slot) })),
  );
  const devices = useMeshDevices(mode === "serial");
  const modeId = useId();
  const deviceId = useId();
  const headingId = useId();

  const portError = mode === "tcp" && !isPort(port) ? PORT_PROBLEM : null;
  const slotProblem = (() => {
    if (slots.length === 0) return "Carry at least one channel slot.";
    const seen = new Set<number>();
    for (const slot of slots) {
      if (!/^\d{1,2}$/.test(slot.value.trim())) return "A channel slot is a whole number, 0 for the public channel.";
      const value = Number(slot.value);
      if (seen.has(value)) return `Slot ${value} is listed twice.`;
      seen.add(value);
    }
    return null;
  })();
  const problem =
    mode === "off"
      ? null
      : mode === "serial" && !device
        ? "Choose the radio's device."
        : mode === "tcp" && !host.trim()
          ? "Type the radio's address on the home network."
          : (portError ?? slotProblem);

  const submit = () => {
    const input: MeshCoreInput = { mode };
    if (mode === "serial") input.device = device;
    if (mode === "tcp") {
      input.host = host.trim();
      input.port = Number(port);
    }
    if (mode !== "off") input.channels = slots.map((slot) => Number(slot.value));
    save.mutate(input, {
      onSuccess: () => toast.success(mode === "off" ? "MeshCore is off." : "Saved. Outpost is starting the link."),
      onError: (error) => notify.error(errorMessage(error)),
    });
  };

  const slotName = (value: string) => status.radioChannels.find((channel) => String(channel.index) === value.trim())?.name;
  const list = devices.data?.devices ?? [];
  // A device saved earlier that is not plugged in now is still offered, so that the choice is not lost silently.
  const options = [
    ...list.map((entry) => ({ value: entry.path, label: entry.label })),
    ...(device && !list.some((entry) => entry.path === device) ? [{ value: device, label: `${device} (not found now)` }] : []),
  ];

  return (
    <Part id={headingId} title="MeshCore">
      <StateLine words={meshcoreStateWords(status)} state={status.state} lastHeardAt={status.lastHeardAt} />
      <fieldset
        disabled={!allowed}
        aria-describedby={allowed ? undefined : WHY_ID}
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
      >
        <SettingRow
          htmlFor={modeId}
          label="How Outpost reaches the radio"
          hint="A MeshCore radio with companion firmware, plugged into this computer or on the home network."
          control={
            <Select
              id={modeId}
              value={mode}
              disabled={!allowed}
              onChange={setMode}
              className="w-64 max-w-full"
              options={[
                { value: "off", label: "Off" },
                { value: "serial", label: "By USB cable" },
                { value: "tcp", label: "By its network port" },
              ]}
            />
          }
        />

        {mode === "serial" ? (
          <div className="grid gap-2">
            <label htmlFor={deviceId} className="text-small font-medium text-ink">
              Device
            </label>
            {devices.isPending ? (
              <Skeleton className="h-9" />
            ) : devices.isError ? (
              <p role="alert" className="text-small text-danger">
                {errorMessage(devices.error)}
              </p>
            ) : options.length > 0 ? (
              <Select
                id={deviceId}
                value={device ?? undefined}
                placeholder="Choose the radio"
                disabled={!allowed}
                onChange={setDevice}
                options={options}
                className="w-full font-mono"
              />
            ) : (
              <p id={deviceId} className="text-small text-ink-muted">
                No likely radio is plugged in. Plug it in with a USB cable that carries data, then press Refresh.
              </p>
            )}
            {data.inContainer ? (
              <p className="text-small text-ink-muted">
                Outpost runs in a container: the device must be passed through to it by the container's own settings (see{" "}
                <Link
                  to="/help/deployment#h-mesh-radio-in-a-container"
                  className="text-primary underline decoration-1 underline-offset-2 hover:decoration-2"
                >
                  Mesh radio in a container
                </Link>
                , in the guide to installing Outpost).
              </p>
            ) : null}
            <div>
              <Button size="sm" variant="secondary" loading={devices.isFetching} onClick={() => void devices.refetch()}>
                <RefreshCw aria-hidden /> Refresh
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "tcp" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="The radio's address" value={host} onChange={setHost} monoText hint="For example 192.168.1.60." />
            <TextField label="Port" value={port} onChange={setPort} error={portError} inputMode="numeric" />
          </div>
        ) : null}

        {mode !== "off" ? (
          <fieldset className="grid min-w-0 gap-2">
            <legend className="text-small font-medium text-ink">Channel slots carried</legend>
            <p className="text-small text-ink-muted">
              Slot 0 is the public channel on a new radio. Each shows as a channel under Messages.
            </p>
            <ul className="divide-y divide-border border-y border-border">
              {slots.map((slot) => (
                <li key={slot.key} className="flex flex-wrap items-end gap-x-3 gap-y-2 py-2.5">
                  <Field label="Slot" className="w-28">
                    {(ids) => (
                      <Input
                        {...ids}
                        value={slot.value}
                        inputMode="numeric"
                        className="tabular"
                        onChange={(event) =>
                          setSlots(slots.map((entry) => (entry.key === slot.key ? { ...entry, value: event.target.value } : entry)))
                        }
                      />
                    )}
                  </Field>
                  <span className="min-h-9 min-w-0 flex-1 py-2 text-small text-ink-muted max-md:min-h-11 max-md:py-3">
                    {slotName(slot.value) ? `On the radio: ${slotName(slot.value)}` : ""}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Stop carrying slot ${slot.value.trim() || "with no number"}`}
                    onClick={() => setSlots(slots.filter((entry) => entry.key !== slot.key))}
                  >
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
            <div>
              <Button
                variant="ghost"
                className="-ml-2.5"
                onClick={() => setSlots([...slots, { key: draftKey(), value: String(slots.length) }])}
              >
                <Plus aria-hidden /> Add a slot
              </Button>
            </div>
          </fieldset>
        ) : null}

        <SaveRow allowed={allowed} problem={problem} pending={save.isPending} onSave={submit} />
      </fieldset>

      {mode === "serial" ? (
        <Steps label="On the radio">
          <li>Flash it with MeshCore's companion firmware for USB.</li>
          <li>Plug it into this computer with a USB cable.</li>
          <li>Choose it under Device here, and save.</li>
        </Steps>
      ) : mode === "tcp" ? (
        <Steps label="On the radio">
          <li>
            Flash it with MeshCore's Wi-Fi or Ethernet companion build, which listens on port{" "}
            <span className={mono}>{MESH_DEFAULT_PORTS.meshcoreTcp}</span>.
          </li>
          <li>Join it to the home network and find its address there.</li>
          <li>Type that address here, and save.</li>
        </Steps>
      ) : null}
    </Part>
  );
}

// ── Test messages ──

function TestMessages({ channels }: { channels: MeshChannel[] }) {
  const name = useDeviceName();
  return (
    <section aria-labelledby="mesh-test-title" className="grid grid-cols-[minmax(0,1fr)] gap-3 border-t border-border pt-5">
      <h3 id="mesh-test-title" className="text-body font-semibold text-ink">
        A test message
      </h3>
      {channels.length === 0 ? (
        <p className="text-small text-ink-muted">
          Once a way in above carries a channel, a short test message can be sent on it from here.
        </p>
      ) : name === null ? (
        <p className="text-small text-ink-muted">
          A test message goes under this device's name on the board, and none is chosen yet. Choose one under{" "}
          <Link to="/messages" className={link}>
            Messages
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="text-small text-ink-muted">
            Sent as {name}, on the board like any other message, and out by radio. Then this says what became of it.
          </p>
          <ul className="divide-y divide-border border-y border-border">
            {channels.map((channel) => (
              <TestRow key={channel.id} channel={channel} name={name} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function TestRow({ channel, name }: { channel: MeshChannel; name: string }) {
  const test = useMeshTest();
  const sent = test.data?.message ?? null;
  // The delivery changes after the answer: `board.changed` refreshes this channel's history, where it is read from.
  const history = useBoardMessages(channel.id, { enabled: sent !== null });
  const now = (sent && allMessages(history.data).find((entry) => entry.id === sent.id)) || sent;
  const outcome = now ? deliveryWords(now.meta as MeshMeta | null) : null;
  return (
    <li className="grid gap-1 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 text-small">
          <span className="font-medium text-ink">{channel.label}</span>{" "}
          <span className="text-ink-muted">
            {channel.transport === "meshtastic" ? "Meshtastic" : "MeshCore"}
            {channel.linkUp ? "" : ", link not up"}
          </span>
        </p>
        <Button
          size="sm"
          loading={test.isPending}
          aria-label={`Send a test message on ${channel.label}`}
          onClick={() => test.mutate({ channel: channel.id, author: name }, { onError: (error) => notify.error(errorMessage(error)) })}
        >
          <Send aria-hidden /> Send a test message
        </Button>
      </div>
      {outcome ? (
        <p role="status" className={cn("text-small", outcome.failed ? "text-danger" : "text-ink")}>
          Test message: {outcome.text}
        </p>
      ) : null}
    </li>
  );
}

// ── The longer reasons ──

function MoreAbout() {
  return (
    <Disclosure summary="What each way in needs, and more" className="border-t border-border pt-3">
      <div className="grid gap-3 text-ink-muted">
        <p>
          <span className="font-medium text-ink">Outpost is the broker:</span> a Meshtastic radio with Wi-Fi (an ESP32 radio, since JSON
          output is not offered on nRF52 radios) on the same home network, and Outpost shared with that network so the radio can reach the
          port.
        </p>
        <p>
          <span className="font-medium text-ink">The household's broker:</span> an MQTT broker the household already runs, which the radio
          publishes to and Outpost connects to with its own user name and password.
        </p>
        <p>
          <span className="font-medium text-ink">MeshCore by USB cable:</span> a radio with MeshCore's companion firmware for USB, plugged
          into the computer Outpost runs on. <span className="font-medium text-ink">By its network port:</span> the Wi-Fi or Ethernet
          companion build, on the home network.
        </p>
        <p>
          Outpost keeps the broker's password outside its database and outside backups, and never shows it again once saved. To change it,
          type a new one. It goes only to the address, port and user name it was saved with: change any of them and type it again.
        </p>
        <p>
          Nothing is passed between Home and a radio channel by itself: a message written on Home stays on the home network, and one heard
          by radio stays on its channel.
        </p>
        <p>{TRADEMARK}</p>
        <p>
          More in the guide,{" "}
          <Link to="/help/mesh-radio" className="text-primary underline decoration-1 underline-offset-2 hover:decoration-2">
            Mesh radio
          </Link>
          .
        </p>
      </div>
    </Disclosure>
  );
}
