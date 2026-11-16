/**
 * How to trust Outpost's certificate on each kind of device, and how to take that back.
 *
 * The menu names are the vendors' own, read from their documentation in November 2026
 * (Android's and Firefox's from the words in their source, where no help page gives
 * them); docs/deployment.md lists each source. None of it has been tried on a real
 * iPhone, Android phone or Windows computer, and the menus move between versions.
 */
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export type Device = "apple-mobile" | "android" | "mac" | "windows" | "firefox";

/** The device this browser most likely runs on, so that its steps can be opened first. */
export function guessDevice(agent: string, touchPoints: number): Device | null {
  if (/iPhone|iPad|iPod/.test(agent)) return "apple-mobile";
  // An iPad asks for desktop sites by default, and then says it is a Mac; a Mac has no touch screen.
  if (/Macintosh/.test(agent) && touchPoints > 1) return "apple-mobile";
  if (/Android/.test(agent)) return "android";
  if (/Firefox\//.test(agent) && /Linux|X11/.test(agent)) return "firefox";
  if (/Macintosh|Mac OS X/.test(agent)) return "mac";
  if (/Windows/.test(agent)) return "windows";
  return null;
}

const Menu = ({ children }: { children: ReactNode }) => <span className="font-medium text-ink">{children}</span>;

function Steps({ children, undo, note }: { children: ReactNode; undo: ReactNode; note?: ReactNode }) {
  return (
    <div className="grid gap-2 pb-4 pl-6 text-small text-ink-muted">
      <ol className="grid list-decimal gap-1.5 pl-5 marker:text-ink-muted">{children}</ol>
      {note ? <p>{note}</p> : null}
      <p>
        <span className="font-medium text-ink">To remove it again:</span> {undo}
      </p>
    </div>
  );
}

const DEVICES: Array<{ id: Device; name: string; steps: (file: string) => ReactNode }> = [
  {
    id: "apple-mobile",
    name: "iPhone and iPad",
    steps: () => (
      <Steps
        note="An iPhone with Stolen Device Protection on, away from a familiar place, will not install a profile until that protection is turned off. A downloaded profile that is not installed within 8 minutes is discarded; download it again."
        undo={
          <>
            go to <Menu>Settings › General › VPN &amp; Device Management</Menu>, select the profile, and tap <Menu>Delete Profile</Menu>.
          </>
        }
      >
        <li>
          Open this page in <Menu>Safari</Menu> on the iPhone or iPad, tap <Menu>Download certificate</Menu>, and allow the download if
          Safari asks.
        </li>
        <li>
          Open the <Menu>Settings</Menu> app and tap <Menu>Profile Downloaded</Menu>.
        </li>
        <li>
          Tap <Menu>Install</Menu> in the upper-right corner and follow the instructions. The certificate is installed, but not yet trusted
          for web sites.
        </li>
        <li>
          Go to <Menu>Settings › General › About › Certificate Trust Settings</Menu>. Under{" "}
          <Menu>Enable full trust for root certificates</Menu>, turn on trust for the certificate.
        </li>
      </Steps>
    ),
  },
  {
    id: "android",
    name: "Android",
    steps: (file) => (
      <Steps
        note="These are the names on a Pixel with Android 14 or later; other makers move them, and searching Settings for “certificate” finds the screen. Chrome uses the certificate once it is installed. Firefox for Android uses it only when “Use third party CA certificates” is on in its hidden settings. Other apps do not use it."
        undo={
          <>
            on the same <Menu>Encryption &amp; credentials</Menu> screen, tap <Menu>Trusted credentials</Menu>, then <Menu>User</Menu>,
            select the certificate, and tap <Menu>Uninstall</Menu>.
          </>
        }
      >
        <li>
          Tap <Menu>Download certificate</Menu>. The file, <span className="font-mono text-[0.8125rem]">{file}</span>, is saved with your
          downloads. Opening it does not install it: Android only installs this kind of certificate from Settings.
        </li>
        <li>
          Open <Menu>Settings</Menu> and tap <Menu>Security &amp; privacy › More security settings › Encryption &amp; credentials</Menu>.
        </li>
        <li>
          Tap <Menu>Install a certificate</Menu>, then <Menu>CA certificate</Menu>. Android warns that your data won’t be private; read what
          trusting it means above, then tap <Menu>Install anyway</Menu>.
        </li>
        <li>Choose the downloaded file. If the phone has no PIN, pattern or password, Android asks you to set one first.</li>
      </Steps>
    ),
  },
  {
    id: "mac",
    name: "Mac",
    steps: () => (
      <Steps
        note="Safari and Chrome use this setting, and so does Firefox unless it has been told not to trust certificates you install."
        undo={
          <>
            in Keychain Access, double-click the certificate and set its trust back to <Menu>Use System Defaults</Menu>, or delete the
            certificate.
          </>
        }
      >
        <li>
          Click <Menu>Download certificate</Menu>.
        </li>
        <li>
          Open <Menu>Keychain Access</Menu> (search for it in Spotlight). Select the <Menu>login</Menu> keychain, for you alone, or{" "}
          <Menu>System</Menu>, for everyone who uses this Mac, and drag the downloaded file onto the Keychain Access window.
        </li>
        <li>
          Double-click the certificate in the list. Next to <Menu>Trust</Menu>, click the arrow, and for{" "}
          <Menu>Secure Sockets Layer (SSL)</Menu> choose <Menu>Always Trust</Menu>.
        </li>
        <li>Close the window. Your Mac may ask for your password to save the change.</li>
      </Steps>
    ),
  },
  {
    id: "windows",
    name: "Windows",
    steps: () => (
      <Steps
        note="Edge and Chrome use this store, and so does Firefox unless it has been told not to trust certificates you install."
        undo={
          <>
            choose <Menu>Run</Menu> from the Start menu and enter <span className="font-mono text-[0.8125rem]">certmgr.msc</span>. Under{" "}
            <Menu>Certificates - Current User › Trusted Root Certification Authorities › Certificates</Menu>, select the certificate and
            delete it.
          </>
        }
      >
        <li>
          Click <Menu>Download certificate</Menu> and open the file. In the window that appears, choose <Menu>Install Certificate…</Menu>
        </li>
        <li>
          Leave the store location as <Menu>Current User</Menu> and select <Menu>Next</Menu>.
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
    id: "firefox",
    name: "Firefox on a computer",
    steps: () => (
      <Steps
        undo={
          <>
            on the same <Menu>Authorities</Menu> tab, select the certificate and click <Menu>Delete or Distrust…</Menu>
          </>
        }
      >
        <li>
          On Windows and on a Mac, Firefox uses certificates you have trusted in the system, so the steps for those are enough. On Linux, or
          if that has been turned off, carry on here.
        </li>
        <li>
          Click <Menu>Download certificate</Menu> and save the file.
        </li>
        <li>
          Open Firefox’s <Menu>Settings</Menu>, choose <Menu>Privacy and security</Menu>, and under <Menu>Certificates</Menu> click{" "}
          <Menu>Manage certificates</Menu>.
        </li>
        <li>
          On the <Menu>Authorities</Menu> tab click <Menu>Import…</Menu> and choose the file. Tick{" "}
          <Menu>Trust this CA to identify websites</Menu> and confirm.
        </li>
      </Steps>
    ),
  },
];

/** The steps for each device, each behind its name, with this device's own already open. */
export function TrustSteps({ file, open }: { file: string; open: Device | null }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {DEVICES.map((device) => (
        <details key={device.id} className="group" open={device.id === open}>
          <summary className="flex min-h-11 cursor-default items-center gap-2 py-2 text-small font-medium text-ink marker:content-none hover:text-primary [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="size-4 text-ink-muted transition-transform duration-150 group-open:rotate-90" />
            {device.name}
          </summary>
          {device.steps(file)}
        </details>
      ))}
    </div>
  );
}
