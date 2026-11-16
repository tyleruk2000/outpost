import type { HttpsStatus, Settings } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Download, MonitorSmartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton, Spinner, Switch } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { guessDevice, TrustSteps } from "./https-steps";
import { SettingRow, SettingsSection, TextSetting } from "./parts";

const STATUS_KEY = ["https", "status"];
const CERTIFICATE_FILE = "outpost-authority.crt";
const mono = "font-mono text-[0.8125rem] text-ink [overflow-wrap:anywhere]";

/** The host in the address bar, as a certificate would list it: no brackets round an IPv6 address. */
const hostOf = (location: Location) => location.hostname.replace(/^\[|\]$/g, "").toLowerCase();

/** ".local, .lan and .home" from the authority's list of name endings. */
function endings(names: string[]): string {
  const dotted = names.filter((name) => ["local", "lan", "home", "internal", "home.arpa"].includes(name)).map((name) => `.${name}`);
  return dotted.length > 1 ? `${dotted.slice(0, -1).join(", ")} or ${dotted[dotted.length - 1]}` : (dotted[0] ?? "");
}

/**
 * HTTPS for the home network: whether it is on, the addresses to use, the certificate
 * each device has to be told to trust, and how. The title and the section's id are
 * fixed: other screens send people to "Settings → HTTPS on your network" at
 * `/settings#https` when something needs a secure address.
 */
export function HttpsSection({
  settings,
  disabled,
  save,
}: {
  settings: Settings;
  disabled: boolean;
  save: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}) {
  const client = useQueryClient();
  const enabled = settings["https.enabled"];
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api.get<HttpsStatus>("/api/https"),
    // Starting takes a moment, longest the first time, when the keys are made. The server
    // says when it is done; asking as well covers a missed event.
    refetchInterval: (query) => (enabled && query.state.data && !query.state.data.listening && !query.state.data.problem ? 2000 : false),
  });
  const [asking, setAsking] = useState<"off" | "replace" | "delete" | null>(null);

  const change = useMutation({
    mutationFn: (action: "replace" | "delete") =>
      action === "replace" ? api.post<HttpsStatus>("/api/https/authority/replace") : api.delete<HttpsStatus>("/api/https/authority"),
    onSuccess: (data, action) => {
      client.setQueryData(STATUS_KEY, data);
      void client.invalidateQueries({ queryKey: ["settings"] });
      setAsking(null);
      toast.message(
        action === "replace"
          ? "There is a new certificate authority. Trust it on each device again."
          : "HTTPS is off and the certificate authority has been deleted.",
      );
    },
    onError: (error) => {
      setAsking(null);
      toast.error(errorMessage(error));
    },
  });

  const data = status.data;
  const overHttps = window.location.protocol === "https:";
  const host = hostOf(window.location);
  const here = data?.addresses.find((address) => address.name === host);
  const network = data?.addresses.filter((address) => address.kind !== "this-computer") ?? [];
  const own = data?.addresses.find((address) => address.name === "localhost");
  const listed = settings["https.names"];
  const starting = enabled && data && !data.unavailable && !data.listening && !data.problem;
  const plainAddress = data ? `http://${window.location.hostname}:${data.httpPort}` : "";

  return (
    <SettingsSection
      id="https"
      title="HTTPS on your network"
      description="Optional. Browsers let a page use a device’s location, keep its screen awake or work offline only at an address that begins https. This gives your network one, without a domain name or the internet."
    >
      <SettingRow
        label="Use HTTPS"
        hint={
          <>
            Serves Outpost a second time at an address beginning <span className={mono}>https://</span>
            {data ? `, on port ${data.port}` : ""}. The <span className={mono}>http://</span> address keeps working and nothing is
            redirected. Each device then has to be told once to trust this server’s certificate.
          </>
        }
        control={
          <Switch
            checked={enabled}
            disabled={disabled || Boolean(data?.unavailable)}
            onCheckedChange={(value) => (!value && overHttps ? setAsking("off") : save("https.enabled", value))}
            aria-label="Use HTTPS"
          />
        }
      />

      {status.isPending ? (
        <div className="grid gap-2" aria-busy>
          <Skeleton className="h-5" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      ) : status.isError || !data ? (
        <Notice
          tone="danger"
          action={
            <Button size="sm" onClick={() => void status.refetch()}>
              Try again
            </Button>
          }
        >
          {errorMessage(status.error)}
        </Notice>
      ) : (
        <>
          {data.unavailable === "portable" ? (
            <Notice tone="info">
              Not offered from a portable drive. It opens on the computer it is plugged into, where browsers already treat Outpost as
              secure.
            </Notice>
          ) : null}

          {enabled && data.problem ? (
            <Notice tone="danger" icon={<CircleAlert aria-hidden />} title="HTTPS is not running">
              {data.problem}
            </Notice>
          ) : null}

          {starting ? (
            <p className="flex items-center gap-2 text-small text-ink-muted" role="status">
              <Spinner label="Starting" /> Starting HTTPS. Making the keys takes a few seconds the first time, longer on a small computer.
            </p>
          ) : null}

          {enabled && data.listening ? (
            <>
              <div>
                <h3 className="text-small font-medium text-ink">Addresses to use</h3>
                {network.length > 0 ? (
                  <ul className="mt-2 divide-y divide-border border-y border-border">
                    {network.map((address) => (
                      <li key={address.url} className="flex min-h-11 items-center py-1.5">
                        <a href={address.url} className={`${mono} text-primary underline underline-offset-2`}>
                          {address.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-small text-ink-muted">
                    {data.inContainer
                      ? "Outpost runs in a container and cannot see the addresses of the computer it is on. Add the address other devices use for it under “Other names and addresses”, and publish the HTTPS port (see compose.yaml)."
                      : data.lanAccess
                        ? "Outpost found no address on a private network for this computer. If it has one, add it under “Other names and addresses”."
                        : "Only this computer can reach Outpost at the moment, and a browser on this computer already treats it as secure. HTTPS is for phones and other computers: share Outpost with your network first (see “Who can use this library”)."}
                  </p>
                )}
                {own ? (
                  <p className="mt-2 text-small text-ink-muted">
                    On this computer itself: <span className={mono}>{own.url}</span>
                  </p>
                ) : null}
                {data.inContainer && network.length > 0 ? (
                  <p className="mt-2 text-small text-ink-muted">
                    In Docker the HTTPS port has to be published as well: see the commented line in{" "}
                    <span className={mono}>compose.yaml</span>.
                  </p>
                ) : null}
              </div>

              {overHttps ? (
                <Notice tone="success" icon={<CircleCheck aria-hidden />}>
                  This browser is using the HTTPS address, and trusts the certificate.
                </Notice>
              ) : here ? (
                <p className="text-small text-ink-muted">
                  This browser is on the plain <span className={mono}>http://</span> address.{" "}
                  <a href={`${here.url}/settings#https`} className="text-primary underline underline-offset-2">
                    Open this page over HTTPS
                  </a>
                  . If the browser then warns that the connection is not private, this device does not trust the certificate yet: go back,
                  follow the steps below, and try again.
                </p>
              ) : (
                <Notice
                  tone="warning"
                  icon={<CircleAlert aria-hidden />}
                  action={
                    <Button
                      size="sm"
                      disabled={disabled}
                      onClick={() => save("https.names", [...listed.split(/[,\s]+/).filter(Boolean), host].join(", "))}
                    >
                      Add {host}
                    </Button>
                  }
                >
                  <span className={mono}>{host}</span>, the address this browser is using, is not on the certificate, so HTTPS would not be
                  trusted at it.
                </Notice>
              )}

              <SettingRow
                htmlFor="https-names"
                label="Other names and addresses"
                hint="Ways of reaching this server that Outpost has not found for itself, separated by commas: an address, or a name ending in .local or .lan. The certificate is made again when this list or the computer’s own addresses change; devices that already trust it need do nothing."
                control={
                  <TextSetting
                    id="https-names"
                    value={listed}
                    disabled={disabled}
                    onSave={(value) => save("https.names", value)}
                    placeholder="192.168.1.20, outpost.lan"
                    mono
                  />
                }
              />
              {data.leftOut.length > 0 ? (
                <div>
                  <h3 className="text-small font-medium text-ink">Not on the certificate</h3>
                  <ul className="mt-1 grid gap-1 text-small text-ink-muted">
                    {data.leftOut.map((entry) => (
                      <li key={entry.name}>
                        <span className={mono}>{entry.name}</span>: {entry.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}

          {data.authority ? (
            <>
              <div className="grid gap-3 border-t border-border pt-5">
                <h3 className="text-small font-medium text-ink">Trust the certificate on each device</h3>
                <p className="text-small text-ink-muted">
                  A device accepts the HTTPS address only once it trusts the certificate authority this server made for itself. Trusting it
                  tells the device to believe a server that holds the matching key, which is in Outpost’s data folder on this server and is
                  never sent anywhere. The authority is limited to addresses on a private network and names ending in{" "}
                  {endings(data.authority.permittedNames)}, so it cannot vouch for a site on the internet. By their makers’ documentation
                  and code, iPhone, iPad and Mac hold it to that limit, as do Chrome, Edge and Firefox on a computer; only a Mac was tried.
                  Android does not check the limit: on an Android phone, someone who copied the key from this server could pass off any site
                  as genuine.
                </p>
                <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                  <Button asChild>
                    <a href="/api/https/authority.crt" download={CERTIFICATE_FILE}>
                      <Download /> Download certificate
                    </a>
                  </Button>
                  <dl className="min-w-56 flex-1 text-small">
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="text-ink-muted">Listed on devices as</dt>
                      <dd className="text-ink">{data.authority.name}</dd>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2">
                      <dt className="text-ink-muted">Valid until</dt>
                      <dd className="tabular text-ink">{formatDate(data.authority.expiresAt)}</dd>
                    </div>
                    <div className="mt-1">
                      <dt className="text-ink-muted">SHA-256 fingerprint, to compare with what a device shows before you trust it</dt>
                      <dd className={mono}>{data.authority.fingerprint}</dd>
                    </div>
                  </dl>
                </div>
                <TrustSteps file={CERTIFICATE_FILE} open={guessDevice(navigator.userAgent, navigator.maxTouchPoints)} />
                <p className="text-small text-ink-muted">
                  The steps follow each maker’s own instructions as they stood in November 2026; menus move between versions. Removing the
                  certificate from a device takes back the trust and nothing else.
                </p>
              </div>

              <div className="grid gap-3 border-t border-border pt-5">
                <h3 className="text-small font-medium text-ink">Start again with a new certificate authority</h3>
                {data.authorityRight.allowed ? (
                  <>
                    <p className="text-small text-ink-muted">
                      For when its key may have been copied, or you no longer want HTTPS. Every device that trusted this one stops trusting
                      Outpost’s HTTPS address until it is told to trust the new one.{" "}
                      {data.authorityRight.reason === "option"
                        ? `Offered on every device because Outpost was started with ${data.authorityRight.option}=true.`
                        : "Offered here because you are at the computer Outpost runs on."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="danger-ghost" onClick={() => setAsking("replace")} disabled={Boolean(data.unavailable)}>
                        Make a new certificate authority
                      </Button>
                      <Button variant="danger-ghost" onClick={() => setAsking("delete")}>
                        Turn HTTPS off and delete it
                      </Button>
                    </div>
                  </>
                ) : (
                  <Notice tone="info" icon={<MonitorSmartphone aria-hidden />} title="Not offered on this device">
                    <p>
                      Replacing or deleting the certificate authority stops every device that trusted it from trusting Outpost’s HTTPS
                      address. Outpost has no accounts, so that can only be done at the computer Outpost runs on.
                    </p>
                    <p className="mt-1 text-ink-muted">
                      Whoever starts Outpost can allow it from every device by starting it with{" "}
                      <span className="font-mono text-[0.8125rem]">{data.authorityRight.option}=true</span>.
                    </p>
                  </Notice>
                )}
              </div>
            </>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={asking === "off"}
        onOpenChange={(open) => !open && setAsking(null)}
        title="Turn HTTPS off?"
        description={
          <>
            You are using the HTTPS address now, and it will stop answering. Carry on at <span className={mono}>{plainAddress}</span>. The
            certificate is kept, so turning HTTPS on again asks nothing of any device.
          </>
        }
        confirmLabel="Turn HTTPS off"
        onConfirm={() => {
          save("https.enabled", false);
          setAsking(null);
        }}
      />
      <ConfirmDialog
        open={asking === "replace"}
        onOpenChange={(open) => !open && setAsking(null)}
        title="Make a new certificate authority?"
        description={
          <>
            <span className="font-medium text-ink">{data?.authority?.name}</span> and its key are deleted and a new authority takes their
            place. Every phone and computer that trusted it must be told to trust the new one before HTTPS works on it again. The plain http
            address is not affected.
          </>
        }
        confirmLabel="Make a new one"
        loading={change.isPending}
        onConfirm={() => change.mutate("replace")}
      />
      <ConfirmDialog
        open={asking === "delete"}
        onOpenChange={(open) => !open && setAsking(null)}
        title="Turn HTTPS off and delete the certificate authority?"
        description={
          <>
            HTTPS stops, and <span className="font-medium text-ink">{data?.authority?.name}</span>, the server certificate and their keys
            are deleted from this server. Remove the certificate from each device that trusted it as well. Turning HTTPS on later makes a
            new authority, which every device must be told to trust.
          </>
        }
        confirmLabel="Turn off and delete"
        loading={change.isPending}
        onConfirm={() => change.mutate("delete")}
      />
    </SettingsSection>
  );
}
