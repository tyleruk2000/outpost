/**
 * How to make each kind of device trust a certificate authority, how to check that it
 * worked, and how to take it back.
 *
 * The same steps serve two certificates: the authority Outpost makes for itself, and
 * the root of an authority of the person's own when they brought their own certificate.
 *
 * The menu names and commands are the makers' own, read in November 2026;
 * docs/deployment.md gives the source of each and says which are from a help page and
 * which only from the words in a program's source. On a Mac the two downloads were
 * added to and removed from a keychain made for the purpose, and the checking commands
 * were run. Nothing here was tried on an iPhone, an Android phone, a Windows or a Linux
 * computer, and menus move between versions.
 */
import { ChevronRight, Download } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/misc";

export type Device = "apple-mobile" | "android" | "mac" | "windows" | "linux" | "firefox";

/** The device this browser most likely runs on, so that its steps can be opened first. */
export function guessDevice(agent: string, touchPoints: number): Device | null {
  if (/iPhone|iPad|iPod/.test(agent)) return "apple-mobile";
  // An iPad asks for desktop sites by default, and then says it is a Mac; a Mac has no touch screen.
  if (/Macintosh/.test(agent) && touchPoints > 1) return "apple-mobile";
  if (/Android/.test(agent)) return "android";
  // On Linux, Firefox keeps a list of its own and does not read the system's.
  if (/Firefox\//.test(agent) && /Linux|X11/.test(agent)) return "firefox";
  if (/Macintosh|Mac OS X/.test(agent)) return "mac";
  if (/Windows/.test(agent)) return "windows";
  if (/Linux|X11/.test(agent) && !/CrOS/.test(agent)) return "linux";
  return null;
}

/** The certificate a device is asked to trust, and where to get it. */
export interface TrustedCertificate {
  /** How devices list it once it is installed. */
  name: string;
  /** Where its two forms are downloaded: DER, which devices install, and PEM, for Linux and commands. Null when Outpost does not hold it. */
  downloads: { der: string; pem: string } | null;
  /** The names the two files have once downloaded. */
  files: { der: string; pem: string };
  /** An https address of this server, for the commands that check it worked. */
  address: string;
}

const Menu = ({ children }: { children: ReactNode }) => <span className="font-medium text-ink">{children}</span>;
const Mono = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[0.8125rem] text-ink [overflow-wrap:anywhere]">{children}</span>
);

/** A command to copy. A long one wraps, so that none of it is hidden; copying it still gives one line. */
function Command({ children }: { children: string }) {
  return (
    <pre className="mt-1.5 rounded-control bg-surface-strong px-3 py-2 font-mono text-[0.8125rem] leading-relaxed whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
      {children}
    </pre>
  );
}

/** The first step everywhere: get the file onto the device, in the form that device wants. */
function Get({ certificate, form, verb = "Click" }: { certificate: TrustedCertificate; form: "der" | "pem"; verb?: "Click" | "Tap" }) {
  if (!certificate.downloads) {
    return (
      <>
        Copy your authority’s root certificate to this device as a file ({form === "pem" ? "PEM" : "a .crt, .cer or .pem file"}). Outpost
        was not given it, so it cannot offer it here.
      </>
    );
  }
  return (
    <>
      {verb}{" "}
      <a
        href={certificate.downloads[form]}
        className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 [&_svg]:size-3.5"
      >
        <Download aria-hidden />
        Download the certificate
      </a>{" "}
      (<Mono>{certificate.files[form]}</Mono>).
    </>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="text-small text-ink-muted">
      <h4 className="font-medium text-ink">{title}</h4>
      <div className="mt-0.5 grid gap-1.5">{children}</div>
    </div>
  );
}

function Steps({
  children,
  command,
  check,
  undo,
  note,
}: {
  children: ReactNode;
  command?: ReactNode;
  check: ReactNode;
  undo: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="grid gap-4 pb-5 pl-6">
      {/* The steps are what a person follows with another device in the other hand: full size, full ink. */}
      <ol className="grid list-decimal gap-2 pl-5 text-body text-ink marker:text-ink-muted">{children}</ol>
      {command ? <Part title="With a command instead">{command}</Part> : null}
      <Part title="Check it worked">{check}</Part>
      <Part title="To remove it again">{undo}</Part>
      {note ? <p className="text-small text-ink-muted">{note}</p> : null}
    </div>
  );
}

/** What every device has in common once it is done. */
const Padlock = ({ address, browser }: { address: string; browser: string }) => (
  <p>
    Open <Mono>{address}</Mono> in {browser}. The page opens with no warning, and this section then says that this browser trusts the
    certificate.
  </p>
);

const DEVICES: Array<{ id: Device; name: string; steps: (certificate: TrustedCertificate) => ReactNode }> = [
  {
    id: "apple-mobile",
    name: "iPhone and iPad",
    steps: (certificate) => (
      <Steps
        check={<Padlock address={certificate.address} browser="Safari" />}
        undo={
          <p>
            Go to <Menu>Settings › General › VPN &amp; Device Management</Menu>, select the profile, and tap <Menu>Delete Profile</Menu>.
          </p>
        }
        note="A downloaded profile that is not installed within 8 minutes is discarded; download it again. With Stolen Device Protection on, away from a familiar place, an iPhone will not install a profile until that protection is turned off."
      >
        <li>
          Open this page in <Menu>Safari</Menu> on the iPhone or iPad. <Get certificate={certificate} form="der" verb="Tap" /> Allow the
          download if Safari asks.
        </li>
        <li>
          Open the <Menu>Settings</Menu> app and tap <Menu>Profile Downloaded</Menu>.
        </li>
        <li>
          Tap <Menu>Install</Menu> in the upper-right corner and follow the instructions. The certificate is now installed, but not yet
          trusted for web sites.
        </li>
        <li>
          Go to <Menu>Settings › General › About › Certificate Trust Settings</Menu>. Under{" "}
          <Menu>Enable full trust for root certificates</Menu>, turn on trust for <Menu>{certificate.name}</Menu>.
        </li>
      </Steps>
    ),
  },
  {
    id: "android",
    name: "Android",
    steps: (certificate) => (
      <Steps
        check={<Padlock address={certificate.address} browser="Chrome" />}
        undo={
          <p>
            On the same <Menu>Encryption &amp; credentials</Menu> screen, tap <Menu>Trusted credentials</Menu>, then <Menu>User</Menu>, tap
            the certificate, and tap <Menu>Uninstall</Menu>.
          </p>
        }
        note="These are the names on a Pixel with Android 14 or later. Other makers move them; searching Settings for “certificate” finds the screen. Chrome uses the certificate once it is installed. Firefox for Android uses it only when “Use third party CA certificates” is on in its hidden settings. Other apps do not use it."
      >
        <li>
          <Get certificate={certificate} form="der" verb="Tap" /> It is saved with your downloads. Opening it does not install it: Android
          installs this kind of certificate only from Settings.
        </li>
        <li>
          Open <Menu>Settings</Menu> and tap <Menu>Security &amp; privacy › More security settings › Encryption &amp; credentials</Menu>.
          (On some versions the middle one reads <Menu>More security &amp; privacy</Menu>.)
        </li>
        <li>
          Tap <Menu>Install a certificate</Menu>, then <Menu>CA certificate</Menu>. Android warns that{" "}
          <Menu>Your data won’t be private</Menu>; that is what trusting any certificate authority means. Tap <Menu>Install anyway</Menu>.
        </li>
        <li>Choose the downloaded file. If the phone has no PIN, pattern or password, Android asks you to set one first.</li>
      </Steps>
    ),
  },
  {
    id: "mac",
    name: "Mac",
    steps: (certificate) => (
      <Steps
        command={
          <>
            <p>
              In Terminal, for you alone (macOS asks for your password). <Mono>-p ssl</Mono> trusts it for web sites and nothing else:
            </p>
            <Command>{`security add-trusted-cert -r trustRoot -p ssl -k ~/Library/Keychains/login.keychain-db ~/Downloads/${certificate.files.der}`}</Command>
            <p>For everyone who uses this Mac:</p>
            <Command>{`sudo security add-trusted-cert -d -r trustRoot -p ssl -k /Library/Keychains/System.keychain ~/Downloads/${certificate.files.der}`}</Command>
          </>
        }
        check={
          <>
            <Padlock address={certificate.address} browser="Safari or Chrome" />
            <p>
              Or in Terminal, which answers “certificate verification successful”. Its lines about Certificate Transparency do not apply:
            </p>
            <Command>{`security verify-cert ${certificate.address}`}</Command>
          </>
        }
        undo={
          <>
            <p>
              In Keychain Access, double-click the certificate and set its trust back to <Menu>Use System Defaults</Menu>, or select it and
              delete it. Or in Terminal (add <Mono>sudo</Mono> and <Mono>-d</Mono> to the first if you trusted it for everyone):
            </p>
            <Command>{`security remove-trusted-cert ~/Downloads/${certificate.files.der}\nsecurity delete-certificate -c "${certificate.name}"`}</Command>
          </>
        }
        note="Safari and Chrome use this setting. Firefox reads the System keychain, not login: if Firefox still warns, choose System above or follow the steps for Firefox."
      >
        <li>
          <Get certificate={certificate} form="der" />
        </li>
        <li>
          Open <Menu>Keychain Access</Menu>: search for it in Spotlight, then press Return. Select the <Menu>login</Menu> keychain, for you
          alone, or <Menu>System</Menu>, for everyone who uses this Mac, and drag the downloaded file onto the Keychain Access window.
        </li>
        <li>
          Double-click <Menu>{certificate.name}</Menu> in the list. Next to <Menu>Trust</Menu>, click the arrow, and for{" "}
          <Menu>Secure Sockets Layer (SSL)</Menu> choose <Menu>Always Trust</Menu>.
        </li>
        <li>Close the window. Your Mac may ask for your password to save the change.</li>
      </Steps>
    ),
  },
  {
    id: "windows",
    name: "Windows",
    steps: (certificate) => (
      <Steps
        command={
          <>
            <p>In Command Prompt, for your account:</p>
            <Command>{`certutil -user -addstore Root "%USERPROFILE%\\Downloads\\${certificate.files.der}"`}</Command>
            <p>
              For everyone who uses this computer, leave out <Mono>-user</Mono> and run it in a Command Prompt opened as administrator. In
              PowerShell the same is:
            </p>
            <Command>{`Import-Certificate -FilePath "$HOME\\Downloads\\${certificate.files.der}" -CertStoreLocation Cert:\\CurrentUser\\Root`}</Command>
          </>
        }
        check={
          <>
            <Padlock address={certificate.address} browser="Edge or Chrome" />
            <p>Or list it in the store by its name:</p>
            <Command>{`certutil -user -store Root "${certificate.name}"`}</Command>
          </>
        }
        undo={
          <>
            <p>
              Choose <Menu>Run</Menu> from the Start menu and enter <Mono>certmgr.msc</Mono>. Under{" "}
              <Menu>Certificates - Current User › Trusted Root Certification Authorities › Certificates</Menu>, select the certificate and
              delete it. Or with a command:
            </p>
            <Command>{`certutil -user -delstore Root "${certificate.name}"`}</Command>
          </>
        }
        note="Edge and Chrome use this store. Firefox’s own documentation names only the store for the whole computer: if Firefox still warns, install it for everyone (Local Machine) or follow the steps for Firefox."
      >
        <li>
          <Get certificate={certificate} form="der" /> Open the file. In the window that appears, choose <Menu>Install Certificate…</Menu>
        </li>
        <li>
          Leave the store location as <Menu>Current User</Menu> (or choose <Menu>Local Machine</Menu>, for everyone who uses this computer)
          and select <Menu>Next</Menu>.
        </li>
        <li>
          Choose <Menu>Place all certificates in the following store</Menu>, select <Menu>Trusted Root Certification Authorities</Menu>, and
          finish the wizard.
        </li>
        <li>
          On the security warning about installing the certificate, select <Menu>Yes</Menu>.
        </li>
      </Steps>
    ),
  },
  {
    id: "linux",
    name: "Linux",
    steps: (certificate) => (
      <Steps
        check={
          <>
            <p>A program that uses the system’s list, such as curl, now connects without complaint:</p>
            <Command>{`curl ${certificate.address}/api/health`}</Command>
            <p>
              Before installing anything, the same can be tried against the file alone:{" "}
              <Mono>
                curl --cacert ~/Downloads/{certificate.files.pem} {certificate.address}/api/health
              </Mono>
            </p>
          </>
        }
        undo={
          <>
            <p>Delete the file you copied and run the same update command again. On Debian and Ubuntu:</p>
            <Command>{`sudo rm /usr/local/share/ca-certificates/${certificate.files.der}\nsudo update-ca-certificates --fresh`}</Command>
            <p>
              On Arch: <Mono>sudo trust anchor --remove ~/Downloads/{certificate.files.pem}</Mono>. In Chrome’s certificate manager or
              Firefox’s, select the certificate and delete it.
            </p>
          </>
        }
        note="The system’s list covers command-line tools and most programs. Browsers installed as a snap or a flatpak may not see it at all."
      >
        <li>
          <Get certificate={certificate} form="pem" /> This is the text form (PEM), which is what Linux wants.
        </li>
        <li>
          Add it to the system’s list. On <Menu>Debian and Ubuntu</Menu> the copy must have a name ending in <Mono>.crt</Mono>:
          <Command>{`sudo cp ~/Downloads/${certificate.files.pem} /usr/local/share/ca-certificates/${certificate.files.der}\nsudo update-ca-certificates`}</Command>
          On <Menu>Fedora, RHEL and CentOS</Menu>:
          <Command>{`sudo cp ~/Downloads/${certificate.files.pem} /etc/pki/ca-trust/source/anchors/\nsudo update-ca-trust`}</Command>
          On <Menu>Arch</Menu>:<Command>{`sudo trust anchor ~/Downloads/${certificate.files.pem}\nsudo update-ca-trust`}</Command>
          On <Menu>openSUSE</Menu>:
          <Command>{`sudo cp ~/Downloads/${certificate.files.pem} /etc/pki/trust/anchors/\nsudo update-ca-certificates`}</Command>
        </li>
        <li>
          Browsers may keep a list of their own. In <Menu>Chrome</Menu> and browsers built on it, open{" "}
          <Mono>chrome://certificate-manager</Mono>, choose <Menu>Local certificates</Menu>, and under <Menu>Custom</Menu> open{" "}
          <Menu>Installed by you</Menu> and <Menu>Import</Menu> the file as one of the <Menu>Trusted Certificates</Menu>. For{" "}
          <Menu>Firefox</Menu>, follow its own steps below.
        </li>
      </Steps>
    ),
  },
  {
    id: "firefox",
    name: "Firefox, on any computer",
    steps: (certificate) => (
      <Steps
        check={<Padlock address={certificate.address} browser="Firefox" />}
        undo={
          <p>
            On the same <Menu>Authorities</Menu> tab, select the certificate and click <Menu>Delete or Distrust…</Menu>
          </p>
        }
        note="On Windows and on a Mac, Firefox 120 and later already uses certificates trusted in the system (Settings › Privacy and security › Certificates › “Allow Firefox to automatically trust third-party root certificates you install”), so the steps for those are usually enough. On Linux, or when Firefox still warns, use these."
      >
        <li>
          <Get certificate={certificate} form="der" />
        </li>
        <li>
          Open Firefox’s <Menu>Settings</Menu>, choose <Menu>Privacy and security</Menu>, and under <Menu>Certificates</Menu> click{" "}
          <Menu>Manage certificates</Menu>. (Before Firefox 149 the button reads <Menu>View Certificates…</Menu>)
        </li>
        <li>
          On the <Menu>Authorities</Menu> tab click <Menu>Import…</Menu> and choose the file.
        </li>
        <li>
          Tick <Menu>Trust this CA to identify websites.</Menu> and confirm.
        </li>
      </Steps>
    ),
  },
];

/** The steps for each device, each behind its name, with this device's own already open. */
export function TrustSteps({ certificate, open }: { certificate: TrustedCertificate; open: Device | null }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {DEVICES.map((device) => (
        <details key={device.id} className="group" open={device.id === open}>
          <summary className="flex min-h-11 cursor-default items-center gap-2 py-2 text-body font-medium text-ink marker:content-none hover:text-primary [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="size-4 text-ink-muted transition-transform duration-150 group-open:rotate-90" />
            {device.name}
            {device.id === open ? <Badge tone="primary">This device</Badge> : null}
          </summary>
          {device.steps(certificate)}
        </details>
      ))}
    </div>
  );
}
