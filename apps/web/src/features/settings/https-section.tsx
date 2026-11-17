import { type HttpsStatus, localByReason, type Settings } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CircleAlert, CircleCheck, Download, MonitorSmartphone } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton, Spinner, Switch } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useServerConnection } from "@/lib/events";
import { notify } from "@/lib/notify";
import { usePageVisible } from "@/lib/page-visible";
import { formatDate } from "@/lib/utils";
import type { SecureWay } from "./https-own";
import { guessDevice, HTTPS_STATUS_KEY as STATUS_KEY } from "./https-shared";
import { SettingRow, SettingsSection, TextSetting } from "./parts";

// Most of a visit to Settings never needs these: the steps for each kind of device show only once
// HTTPS has been turned on, and a certificate of one's own only when asked for. They load then.
const TrustSteps = lazy(() => import("./https-steps").then((module) => ({ default: module.TrustSteps })));
const OwnCertificateInUse = lazy(() => import("./https-own").then((module) => ({ default: module.OwnCertificateInUse })));
const WaysIn = lazy(() => import("./https-own").then((module) => ({ default: module.WaysIn })));

/**
 * Whether HTTPS is up. Starting takes a moment, longest the first time, when the keys are
 * made; the server says when it is done (`https.changed`). Only while that word cannot
 * arrive is it asked for every two seconds, and not while the page is hidden.
 */
export function useHttpsStatus(enabled: boolean) {
  const shown = usePageVisible();
  const connected = useServerConnection();
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api.get<HttpsStatus>("/api/https"),
    refetchInterval: (query) =>
      shown && !connected && enabled && query.state.data && !query.state.data.listening && !query.state.data.problem ? 2000 : false,
  });
}

const loading = (
  <div className="grid gap-2" aria-busy>
    <Skeleton className="h-5" />
    <Skeleton className="h-5 w-2/3" />
  </div>
);

/**
 * The way in to a certificate of one's own, for a server still on Outpost's own (or with
 * HTTPS off). One closed line: a person who wants the simple case reads no further, and
 * what is under it is loaded when it is first opened.
 */
function OwnCertificateChoice({ data, secure, refresh }: { data: HttpsStatus; secure: SecureWay; refresh: () => void }) {
  const [opened, setOpened] = useState(false);
  return (
    <details className="group border-t border-border pt-3" onToggle={(event) => event.currentTarget.open && setOpened(true)}>
      <summary className="flex min-h-11 cursor-default items-center gap-2 py-2 text-small font-medium text-ink marker:content-none hover:text-primary [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 text-ink-muted transition-transform duration-150 group-open:rotate-90" />
        Use a certificate of your own instead
      </summary>
      <div className="grid gap-5 pb-2 pl-6">
        <p className="text-small text-ink-muted">
          For when you already have a certificate for this server: from a public authority for a name you own, from an authority you or your
          organisation run, or from a tool such as mkcert. HTTPS then presents that certificate in place of Outpost’s own. Outpost’s
          certificate authority is kept as it is, and going back to it is one press. Most people do not need this.
        </p>
        {opened ? (
          <Suspense fallback={loading}>
            <WaysIn data={data} secure={secure} refresh={refresh} />
          </Suspense>
        ) : null}
      </div>
    </details>
  );
}

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
 *
 * The order is the order a person needs things in after turning it on: the addresses,
 * then what to do on each device, then the upkeep (other names, starting again). The
 * simple case, Outpost's own certificate, is all that shows unless a person opens "Use
 * a certificate of your own instead"; once they use one, that takes the place of
 * Outpost's own part (`https-own.tsx`).
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
  const status = useHttpsStatus(enabled);
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
      notify.error(errorMessage(error));
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
  const usingOwn = data?.source === "own";
  const refresh = () => void status.refetch();
  // The better ways to give a key, for a device on plain http: this page over HTTPS, or HTTPS turned on.
  const secure = {
    open: enabled && data?.listening && here && !overHttps ? `${here.url}/settings#https` : null,
    turnOn: !enabled && data && !data.unavailable && data.source === "outpost" && !disabled ? () => save("https.enabled", true) : null,
  };
  // An address of this server for the commands in the steps: one on the network if there is one.
  const exampleAddress = network[0]?.url ?? own?.url ?? `https://localhost:${data?.port ?? 8443}`;
  /**
   * Where a phone or another computer opens this page: the plain address of the first
   * way in from the network. Not shown to a browser that is already on such an address.
   */
  const elsewhere =
    data && network[0] && !network.some((address) => address.name === host)
      ? `http://${new URL(network[0].url).hostname}:${data.httpPort}/settings#https`
      : null;

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
            redirected. Each device then has to be told once to trust this server’s certificate, unless you bring a certificate devices
            already trust.
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
        loading
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
                ) : usingOwn ? (
                  <p className="mt-1 text-small text-ink-muted">
                    None of the names on your certificate is an address other devices can use for this server yet. See “Where it will not
                    work” below.
                  </p>
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
                  .{" "}
                  {usingOwn
                    ? "If the browser then warns that the connection is not private, this device does not trust your certificate yet: go back and see below for what it has to trust."
                    : "If the browser then warns that the connection is not private, this device does not trust the certificate yet: go back, follow the steps for it below, and try again."}
                </p>
              ) : usingOwn ? (
                <p className="text-small text-ink-muted">
                  This browser is on the plain <span className={mono}>http://</span> address, at <span className={mono}>{host}</span>, which
                  is not a name on your certificate. Use one of the addresses above for HTTPS.
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
            </>
          ) : null}

          {usingOwn && !data.unavailable ? (
            <Suspense fallback={loading}>
              <OwnCertificateInUse
                data={data}
                disabled={disabled}
                address={exampleAddress}
                secure={secure}
                refresh={refresh}
                goBack={() => save("https.certificate", "outpost")}
              />
            </Suspense>
          ) : null}

          {data.authority && !usingOwn ? (
            <div className="grid gap-3 border-t border-border pt-5">
              <h3 className="text-body font-semibold text-ink">Trust the certificate on each device</h3>
              <p className="text-small text-ink-muted">
                Until a phone or computer has been told to trust this server’s certificate, its browser warns that the connection is not
                private. It is done once on each device, on the device itself: download the certificate there, then follow the steps for
                that kind of device.
              </p>
              {elsewhere ? (
                <p className="text-small text-ink-muted">
                  On a phone or another computer, open this page there first: <span className={mono}>{elsewhere}</span>
                </p>
              ) : null}
              <Suspense fallback={loading}>
                <TrustSteps
                  certificate={{
                    name: data.authority.name,
                    downloads: { der: "/api/https/outpost-authority.crt", pem: "/api/https/outpost-authority.pem" },
                    files: { der: "outpost-authority.crt", pem: "outpost-authority.pem" },
                    address: exampleAddress,
                  }}
                  open={guessDevice(navigator.userAgent, navigator.maxTouchPoints)}
                />
              </Suspense>
              <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                <div className="grid gap-1.5">
                  <Button asChild>
                    <a href="/api/https/outpost-authority.crt">
                      <Download /> Download certificate
                    </a>
                  </Button>
                  <a href="/api/https/outpost-authority.pem" className="text-small text-primary underline underline-offset-2">
                    As text (PEM), for Linux and commands
                  </a>
                </div>
                <dl className="min-w-[min(14rem,100%)] flex-1 text-small">
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
              <details className="group">
                <summary className="flex min-h-11 cursor-default items-center gap-2 py-2 text-small font-medium text-ink marker:content-none hover:text-primary [&::-webkit-details-marker]:hidden">
                  <ChevronRight aria-hidden className="size-4 text-ink-muted transition-transform duration-150 group-open:rotate-90" />
                  What trusting it means
                </summary>
                <p className="pb-2 pl-6 text-small text-ink-muted">
                  Trusting it tells the device to believe a server that holds the matching key, which is in Outpost’s data folder on this
                  server and is never sent anywhere. The authority is limited to addresses on a private network and names ending in{" "}
                  {endings(data.authority.permittedNames)}, so it cannot vouch for a site on the internet. By their makers’ documentation
                  and code, iPhone, iPad and Mac hold it to that limit, as do Chrome, Edge and Firefox on a computer; only a Mac was tried.
                  Android does not check the limit: on an Android phone, someone who copied the key from this server could pass off any site
                  as genuine.
                </p>
              </details>
              <p className="text-small text-ink-muted">
                The steps follow each maker’s own instructions as they stood in November 2026; menus move between versions. Removing the
                certificate from a device takes back the trust and nothing else.
              </p>
            </div>
          ) : null}

          {enabled && data.listening ? (
            <>
              <SettingRow
                htmlFor="https-names"
                label="Other names and addresses"
                hint={
                  usingOwn
                    ? "Names and addresses you use for this server that Outpost has not found for itself, separated by commas. With a certificate of your own this does not change the certificate: it tells Outpost which addresses to check it against and list."
                    : "Ways of reaching this server that Outpost has not found for itself, separated by commas: an address, or a name ending in .local or .lan. The certificate is made again when this list or the computer’s own addresses change; devices that already trust it need do nothing."
                }
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

          {!data.unavailable && !usingOwn ? <OwnCertificateChoice data={data} secure={secure} refresh={refresh} /> : null}

          {data.authority && !usingOwn ? (
            <div className="grid gap-3 border-t border-border pt-5">
              <h3 className="text-small font-medium text-ink">Start again with a new certificate authority</h3>
              {data.authorityRight.allowed ? (
                <>
                  <p className="text-small text-ink-muted">
                    For when its key may have been copied, or you no longer want HTTPS. Every device that trusted this one stops trusting
                    Outpost’s HTTPS address until it is told to trust the new one.{" "}
                    {data.authorityRight.reason === "option"
                      ? `Offered on every device because Outpost was started with ${data.authorityRight.option}=true.`
                      : `Offered here because ${localByReason(data.authorityRight.localBy)}.`}
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
