/**
 * "Use a certificate of your own": the second, separate choice in the HTTPS section.
 *
 * Two parts. `OwnCertificateChoice` is the way in: a closed line for the many who do
 * not need it, which opens to the two ways of handing Outpost a certificate (choosing
 * the files here, or putting them in a folder on the server). `OwnCertificateInUse` is
 * what the section shows once the listener presents the person's certificate: what
 * Outpost found in it, how long it has left, what it does not cover, and who has to
 * trust what.
 */
import { type HttpsOwnCertificate, type HttpsStatus, localByReason, PLAIN_HTTP_ACCEPTED_FIELD } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, FileUp } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { formatDate, plural } from "@/lib/utils";
import { guessDevice, HTTPS_STATUS_KEY } from "./https-shared";
import { TrustSteps } from "./https-steps";

const DAY = 24 * 60 * 60 * 1000;
const mono = "font-mono text-[0.8125rem] text-ink [overflow-wrap:anywhere]";

/** "a, b and c". */
const listed = (items: string[]) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : (items[0] ?? "");

/** Puts an answer from the server in place and tells the rest of Settings that the settings moved with it. */
function useTaken() {
  const client = useQueryClient();
  return (data: HttpsStatus) => {
    client.setQueryData(HTTPS_STATUS_KEY, data);
    void client.invalidateQueries({ queryKey: ["settings"] });
  };
}

/** Deleting the person's two files from the server: a button, and the question it asks first. */
function DeleteOwn({ data }: { data: HttpsStatus }) {
  const taken = useTaken();
  const [asking, setAsking] = useState(false);
  const inUse = data.source === "own";
  const remove = useMutation({
    mutationFn: () => api.delete<HttpsStatus>("/api/https/own"),
    onSuccess: (answer) => {
      taken(answer);
      setAsking(false);
      toast.message(
        inUse
          ? "Your certificate and its key have been deleted from this server. HTTPS is off."
          : "Your certificate and its key have been deleted from this server.",
      );
    },
    onError: (error) => {
      setAsking(false);
      toast.error(errorMessage(error));
    },
  });
  const { own } = data;
  // Offered where deleting the authority is: once gone, HTTPS cannot be put back from another device.
  if (!data.authorityRight.allowed || !(own.inFolder.certificate || own.inFolder.key)) return null;
  return (
    <>
      <Button variant="danger-ghost" onClick={() => setAsking(true)}>
        Delete your certificate from this server
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={(open) => !open && setAsking(false)}
        title="Delete your certificate and its key from this server?"
        description={
          <>
            <span className={mono}>{own.files.certificate}</span> and <span className={mono}>{own.files.key}</span> are deleted from{" "}
            <span className={mono}>{own.folder}</span>. Copies you keep elsewhere are not touched.{" "}
            {inUse
              ? "HTTPS is turned off. Outpost does not switch to its own certificate by itself: turn HTTPS on again when you want that."
              : "HTTPS is not using them, so nothing else changes."}
          </>
        }
        confirmLabel={inUse ? "Delete and turn HTTPS off" : "Delete"}
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

// ── Handing a certificate over ──

function FilePick({
  label,
  hint,
  file,
  onFile,
  accept,
}: {
  label: string;
  hint: ReactNode;
  file: File | null;
  onFile: (file: File | null) => void;
  accept: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-[min(12rem,100%)] flex-1">
        <label htmlFor={id} className="text-small font-medium text-ink">
          {label}
        </label>
        <p className="mt-0.5 text-small text-ink-muted">{file ? <span className="break-all text-ink">{file.name}</span> : hint}</p>
      </div>
      <Button onClick={() => input.current?.click()}>
        <FileUp /> {file ? "Choose another" : "Choose file"}
      </Button>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          onFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
    </div>
  );
}

/**
 * The better ways to give a key from a device on plain http, which this section can
 * offer: `open`, the address of this page over HTTPS; `turnOn`, turning HTTPS on.
 */
export interface SecureWay {
  open: string | null;
  turnOn: (() => void) | null;
}

/**
 * What a person on another device over plain http is told before choosing any file:
 * what sending the key from here gives away, and the two ways that do not.
 */
function PlainHttpWarning({ data, secure }: { data: HttpsStatus; secure: SecureWay }) {
  return (
    <Notice tone="warning" icon={<CircleAlert aria-hidden />} title="This page is open over plain http">
      <p>
        Sent from here, the private key crosses your network unencrypted, and so does the password of a .pfx or .p12 file. Anyone able to
        listen on this network could copy the key, and with it later pass off another server as this Outpost to every device that trusts the
        certificate.
      </p>
      <p className="mt-2">Two ways keep it private:</p>
      <ul className="mt-1 grid list-disc gap-1 pl-5">
        <li>
          {secure.open ? (
            <>
              <a href={secure.open} className="text-primary underline underline-offset-2">
                Open this page over HTTPS
              </a>{" "}
              and choose the files there.
            </>
          ) : secure.turnOn ? (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <Button size="sm" onClick={secure.turnOn}>
                Turn on HTTPS
              </Button>
              then open this page at its https address and choose the files there.
            </span>
          ) : (
            "Open this page at an address beginning https and choose the files there."
          )}
        </li>
        <li>
          Put the two files in <span className={mono}>{data.own.folder}</span> on the computer Outpost runs on, as described below.
        </li>
      </ul>
    </Notice>
  );
}

/**
 * Choosing the files in the browser. From the computer Outpost runs on, or over HTTPS,
 * the key does not cross the network in the clear and nothing is asked. From another
 * device over plain http it does, so the person is told what that gives away and has
 * to say they accept it before the files can be sent; the server holds to the same
 * rule whatever this screen shows.
 */
function GiveFiles({ data, secure, onDone }: { data: HttpsStatus; secure: SecureWay; onDone?: () => void }) {
  const taken = useTaken();
  const [certificate, setCertificate] = useState<File | null>(null);
  const [key, setKey] = useState<File | null>(null);
  const [chain, setChain] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const passwordId = useId();
  const acceptId = useId();
  // One file that holds everything, behind a password.
  const container = /\.(pfx|p12)$/i.test(certificate?.name ?? "");
  const overPlainHttp = !data.own.keyRight.allowed;
  // New files would write over the pair in the folder, which deletes that key: from another device the server refuses it.
  const replaceRefused = (data.own.inFolder.certificate || data.own.inFolder.key) && !data.authorityRight.allowed;

  const give = useMutation({
    mutationFn: () => {
      const form = new FormData();
      if (overPlainHttp && accepted) form.append(PLAIN_HTTP_ACCEPTED_FIELD, "yes");
      if (certificate) form.append("certificate", certificate);
      if (key && !container) form.append("key", key);
      if (chain && !container) form.append("chain", chain);
      if (container) form.append("password", password);
      return api.upload<HttpsStatus>("/api/https/own", form);
    },
    onSuccess: (answer) => {
      taken(answer);
      setCertificate(null);
      setKey(null);
      setChain(null);
      setPassword("");
      setAccepted(false);
      toast.message("HTTPS is using your certificate.");
      onDone?.();
    },
  });

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        give.mutate();
      }}
    >
      {overPlainHttp ? (
        <>
          <PlainHttpWarning data={data} secure={secure} />
          <div className="flex min-h-11 items-start gap-3">
            <Checkbox
              id={acceptId}
              checked={accepted}
              onCheckedChange={(checked) => {
                setAccepted(checked === true);
                give.reset();
              }}
              className="mt-[13px]"
            />
            <label htmlFor={acceptId} className="min-w-0 flex-1 py-3 text-small text-ink">
              I accept that my private key, and the password of its file if it has one, will cross my network unencrypted, where anyone
              listening could copy them.
            </label>
          </div>
        </>
      ) : null}
      <FilePick
        label="Certificate file"
        hint="PEM, usually fullchain.pem or a .crt or .cer file: the server’s certificate, with its chain after it if you have that. Or one .pfx or .p12 file, which holds the key as well."
        accept=".pem,.crt,.cer,.cert,.der,.pfx,.p12,application/x-pem-file,application/x-x509-ca-cert,application/x-pkcs12"
        file={certificate}
        onFile={(file) => {
          setCertificate(file);
          give.reset();
        }}
      />
      {container ? (
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="min-w-[min(12rem,100%)] flex-1">
            <label htmlFor={passwordId} className="text-small font-medium text-ink">
              Password of the file
            </label>
            <p className="mt-0.5 text-small text-ink-muted">
              The one it was exported with. It is used once, to open the file, and is not kept.
            </p>
          </div>
          <Input
            id={passwordId}
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-72 max-w-full"
          />
        </div>
      ) : (
        <>
          <FilePick
            label="Key file"
            hint="The private key the certificate was made with, usually privkey.pem or a .key file. Not needed if it is in the certificate file."
            accept=".pem,.key,.der,application/x-pem-file"
            file={key}
            onFile={(file) => {
              setKey(file);
              give.reset();
            }}
          />
          <FilePick
            label="Chain file, if it is separate"
            hint="Only when the authority’s certificates came in a file of their own (chain.pem, ca-bundle.crt). Leave empty otherwise."
            accept=".pem,.crt,.cer,.cert,.der,application/x-pem-file,application/x-x509-ca-cert"
            file={chain}
            onFile={(file) => {
              setChain(file);
              give.reset();
            }}
          />
        </>
      )}
      {replaceRefused ? (
        <Notice tone="warning" icon={<CircleAlert aria-hidden />} title="Only at the computer Outpost runs on">
          There is already a certificate and key in {data.own.folder}. Giving new ones would delete them, so they can only be replaced on
          that computer, or from every device if Outpost is started with {data.authorityRight.option}=true.
        </Notice>
      ) : null}
      {give.isError ? (
        <Notice tone="danger" icon={<CircleAlert aria-hidden />} title="Not used">
          {errorMessage(give.error)}
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          type="submit"
          variant="primary"
          disabled={!certificate || (overPlainHttp && !accepted) || replaceRefused}
          loading={give.isPending}
        >
          Use this certificate
        </Button>
        <p className="min-w-[min(12rem,100%)] flex-1 text-small text-ink-muted">
          Outpost checks it first and keeps nothing it cannot use.{" "}
          {data.own.keyRight.reason === "https"
            ? "Offered here because this page is open over HTTPS."
            : data.own.keyRight.reason === "local"
              ? `Offered here because ${localByReason(data.own.keyRight.localBy)}.`
              : "Sent over plain http only once you have ticked the box above."}
        </p>
      </div>
    </form>
  );
}

/** The folder on the server: where it is, whether the two files are there, and the button that takes them up. */
function FromFolder({ data, refresh }: { data: HttpsStatus; refresh: () => void }) {
  const taken = useTaken();
  const use = useMutation({
    mutationFn: () => api.post<HttpsStatus>("/api/https/own/use"),
    onSuccess: (answer) => {
      taken(answer);
      toast.message("HTTPS is using the certificate from the folder.");
    },
    onError: () => refresh(),
  });
  // The files may have arrived since the page was opened.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when this part comes into view
  useEffect(() => refresh(), []);
  const { folder, files, inFolder } = data.own;
  const row = (name: string, there: boolean) => (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 py-1.5">
      <span className={mono}>
        {folder}/{name}
      </span>
      <span className={there ? "text-small text-success" : "text-small text-ink-muted"}>{there ? "There" : "Not there yet"}</span>
    </li>
  );
  return (
    <div className="grid gap-3">
      <p className="text-small text-ink-muted">
        Put the certificate (with its chain) and its key on the server, in PEM form, under exactly these two names. The key never crosses
        the network this way, so it can be done from any device, and it is the way for Docker, a Raspberry Pi, and a script that renews the
        certificate: Outpost looks at the folder every five minutes (every half minute while a file is missing or cannot be used) and takes
        up new files by itself.
      </p>
      <ul className="divide-y divide-border border-y border-border">
        {row(files.certificate, inFolder.certificate)}
        {row(files.key, inFolder.key)}
      </ul>
      {data.inContainer ? (
        <p className="text-small text-ink-muted">
          That is the path inside the container. On the computer itself it is the <span className={mono}>tls/own</span> folder of Outpost’s
          data volume.
        </p>
      ) : null}
      {use.isError ? (
        <Notice tone="danger" icon={<CircleAlert aria-hidden />} title="Not used">
          {errorMessage(use.error)}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => use.mutate()} loading={use.isPending}>
          Use them
        </Button>
        {data.source === "outpost" ? <DeleteOwn data={data} /> : null}
      </div>
    </div>
  );
}

export function WaysIn({
  data,
  secure,
  refresh,
  onDone,
}: {
  data: HttpsStatus;
  secure: SecureWay;
  refresh: () => void;
  onDone?: () => void;
}) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <h4 className="text-small font-medium text-ink">Choose the files here</h4>
        <GiveFiles data={data} secure={secure} onDone={onDone} />
      </div>
      <div className="grid gap-3">
        <h4 className="text-small font-medium text-ink">Or put the files in a folder on the server</h4>
        <FromFolder data={data} refresh={refresh} />
      </div>
    </div>
  );
}

// ── A certificate in use ──

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

/** Who has to trust what, as far as Outpost can tell, with the steps where steps are needed. */
function WhoTrustsIt({ certificate, address }: { certificate: HttpsOwnCertificate; address: string }) {
  const { anchor, trust } = certificate;
  if (trust === "public") {
    return (
      <div className="grid gap-2">
        <h3 className="text-small font-medium text-ink">Devices need nothing installed</h3>
        <p className="text-small text-ink-muted">
          It was issued by a public certificate authority (its chain ends at <span className="text-ink">{anchor.name}</span>), so phones and
          computers should accept it as they are. That is as far as Outpost can tell: it compared the chain with the list of public
          authorities that came with this server’s software, and it cannot see what any one device trusts.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <h3 className="text-small font-medium text-ink">
        {trust === "self-signed" ? "Each device has to trust this certificate" : "Each device has to trust your authority’s root"}
      </h3>
      <p className="text-small text-ink-muted">
        {trust === "self-signed" ? (
          <>
            It is signed by itself, not by an authority, so a device accepts it only once it has been told to trust this very certificate,{" "}
            <span className="text-ink">{anchor.name}</span>.
          </>
        ) : (
          <>
            It was issued by an authority that is not on the list of public ones that came with this server’s software, so as far as Outpost
            can tell it is a private one: yours, or your organisation’s. A device accepts it only once it trusts that authority’s root
            certificate, <span className="text-ink">{anchor.name}</span>. It is your authority’s root that devices must trust, not
            Outpost’s.
          </>
        )}{" "}
        A device that already trusts it has nothing to do; Outpost cannot see which do.
        {anchor.held
          ? ""
          : " The root was not in the files you gave, so Outpost cannot offer it for download: get it from whoever runs the authority. For mkcert it is rootCA.pem, in the folder that mkcert -CAROOT prints."}
      </p>
      {anchor.fingerprint ? (
        <dl className="text-small">
          <dt className="text-ink-muted">SHA-256 fingerprint of {trust === "self-signed" ? "the certificate" : "that root"}, to compare</dt>
          <dd className={mono}>{anchor.fingerprint}</dd>
        </dl>
      ) : null}
      <TrustSteps
        certificate={{
          name: anchor.name,
          downloads: anchor.held ? { der: "/api/https/own-root.crt", pem: "/api/https/own-root.pem" } : null,
          files: { der: "own-root.crt", pem: "own-root.pem" },
          address,
        }}
        open={guessDevice(navigator.userAgent, navigator.maxTouchPoints)}
      />
    </div>
  );
}

/**
 * What the section shows while HTTPS is set to the person's own certificate: the
 * certificate, what is wrong with it if anything, and the two ways out.
 */
export function OwnCertificateInUse({
  data,
  disabled,
  address,
  secure,
  refresh,
  goBack,
}: {
  data: HttpsStatus;
  disabled: boolean;
  secure: SecureWay;
  /** An https address of this server, for the commands in the steps. */
  address: string;
  refresh: () => void;
  /** Sets HTTPS back to Outpost's own certificate. */
  goBack: () => void;
}) {
  const [replacing, setReplacing] = useState(false);
  const { own } = data;
  const certificate = own.certificate;
  const daysLeft = certificate ? Math.floor((certificate.expiresAt - Date.now()) / DAY) : 0;

  return (
    <div className="grid gap-5 border-t border-border pt-5">
      <div className="grid gap-3">
        <h3 className="text-small font-medium text-ink">Your certificate</h3>
        {certificate ? (
          <dl className="grid gap-1 text-small">
            <Fact label="For">
              <span className={mono}>{certificate.names.join(", ")}</span>
            </Fact>
            <Fact label="Issued by">{certificate.issuer}</Fact>
            <Fact label="Valid until">
              <span className="tabular">{formatDate(certificate.expiresAt)}</span>
              {own.expiry === "expired" ? " (expired)" : ` (${plural(Math.max(daysLeft, 0), "day")} left)`}
            </Fact>
            <Fact label="Key">{certificate.key}</Fact>
            <div>
              <dt className="text-ink-muted">SHA-256 fingerprint</dt>
              <dd className={mono}>{certificate.fingerprint}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-small text-ink-muted">
            {data.enabled
              ? "HTTPS is set to use a certificate of your own, and there is none Outpost can use. Give it one below, or go back to Outpost’s own."
              : `HTTPS is off. When it is turned on it will use the certificate of your own in ${own.folder}.`}
          </p>
        )}

        {certificate && own.expiry === "expired" ? (
          <Notice tone="danger" icon={<CircleAlert aria-hidden />} title="Your certificate has expired">
            Outpost is still serving it, so browsers now warn that it has expired. That warning is the true one: Outpost does not put a
            different certificate in its place by itself. Renew it and replace the two files in <span className={mono}>{own.folder}</span>,
            give the new one here, or go back to Outpost’s own certificate. The plain http address is not affected.
          </Notice>
        ) : certificate && own.expiry === "soon" ? (
          <Notice
            tone="warning"
            icon={<CircleAlert aria-hidden />}
            title={`Your certificate expires in ${plural(Math.max(daysLeft, 0), "day")}`}
          >
            Renew it before then. If a script renews it, check that the script still runs and writes the new files to{" "}
            <span className={mono}>{own.folder}</span>; Outpost takes them up within half a minute.
          </Notice>
        ) : null}
        {own.problem ? (
          <Notice tone="warning" icon={<CircleAlert aria-hidden />} title="The files in the folder cannot be used as they are">
            {own.problem}
          </Notice>
        ) : null}
      </div>

      {certificate ? (
        <>
          {certificate.notCovered.length > 0 || certificate.notAnswered.length > 0 || certificate.warnings.length > 0 ? (
            <div className="grid gap-2">
              <h3 className="text-small font-medium text-ink">Where it will not work</h3>
              <ul className="grid gap-2 text-small text-ink-muted">
                {certificate.notCovered.length > 0 ? (
                  <li>
                    It does not cover <span className={mono}>{listed(certificate.notCovered)}</span>, which this server is also reached by.
                    At {certificate.notCovered.length === 1 ? "that address" : "those addresses"} a browser will warn that the certificate
                    is for another site. Use an address listed above.
                  </li>
                ) : null}
                {certificate.notAnswered.length > 0 ? (
                  <li>
                    Outpost does not answer to <span className={mono}>{listed(certificate.notAnswered)}</span> yet, so a request addressed
                    there is refused.{" "}
                    {data.lanAccess ? (
                      <>
                        Which names it answers to is decided where Outpost is started: add{" "}
                        <span className={mono}>OUTPOST_ALLOWED_HOSTS={certificate.notAnswered.join(",")}</span> to its settings there and
                        start it again.
                      </>
                    ) : (
                      "Outpost is not shared with your network, so it answers only to this computer’s own names. Share it first (see “Who can use this library”)."
                    )}
                  </li>
                ) : null}
                {certificate.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {certificate.notes.length > 0 ? (
            <ul className="grid gap-1 text-small text-ink-muted">
              {certificate.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
          <WhoTrustsIt certificate={certificate} address={address} />
        </>
      ) : null}

      <div className="grid gap-3 border-t border-border pt-5">
        <h3 className="text-small font-medium text-ink">Renew it, replace it, or go back</h3>
        <p className="text-small text-ink-muted">
          To renew, replace <span className={mono}>{own.files.certificate}</span> and <span className={mono}>{own.files.key}</span> in{" "}
          <span className={mono}>{own.folder}</span>; Outpost takes the new ones up within half a minute, without a restart. Going back to
          Outpost’s own certificate is one press and loses nothing: your two files stay in the folder
          {data.authority
            ? ", and Outpost’s certificate authority and the devices that trust it are as they were."
            : ". Outpost has no certificate authority of its own yet, so it will make one, which each device then has to be told to trust."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setReplacing((open) => !open)} aria-expanded={replacing}>
            Give Outpost another certificate
          </Button>
          <Button onClick={goBack} disabled={disabled}>
            Go back to Outpost’s own certificate
          </Button>
          <DeleteOwn data={data} />
        </div>
        {replacing || (!certificate && data.enabled) ? (
          <div className="pt-2">
            <WaysIn data={data} secure={secure} refresh={refresh} onDone={() => setReplacing(false)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
