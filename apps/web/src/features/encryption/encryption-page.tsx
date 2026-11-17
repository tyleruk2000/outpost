/**
 * Encryption: OpenPGP keys, text and files, and ciphers to work by hand.
 *
 * Everything on this screen runs in the browser. The server keeps public keys and,
 * when asked, a private key in the form its passphrase protects (docs/security.md has
 * the whole model). The OpenPGP library is fetched only when this screen is opened.
 */
import { LockKeyhole, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { ErrorState, Notice, Page, PageHeader } from "@/components/page";
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { cryptographyAvailable } from "./engine";
import { FilesTab } from "./files-tab";
import { HandTab } from "./hand-tab";
import { useShelf } from "./keys-data";
import { KeysTab } from "./keys-tab";
import { IDLE_MINUTES } from "./parts";
import { lockAll } from "./session";
import { TextTab } from "./text-tab";

const TABS = ["keys", "text", "files", "hand"] as const;
type TabId = (typeof TABS)[number];

/** Where HTTPS is switched on. Another screen owns that setting; this one only points at it. */
export const HTTPS_SETTING = "/settings#https";

/**
 * Said once, above the tabs, on a page opened over plain HTTP: what does not work here and
 * where to turn HTTPS on, in a few lines a phone shows whole; the reason behind "Why".
 */
function NeedsHttps() {
  return (
    <Notice tone="warning" icon={<TriangleAlert />} title="Keys, text, files and encrypted pages need HTTPS" className="mb-6 max-w-[46rem]">
      <p>
        Turn it on in{" "}
        <Link to={HTTPS_SETTING} className="font-medium text-primary underline underline-offset-2">
          Settings, HTTPS on your network
        </Link>
        , then open Outpost at its https address. The ciphers under “By hand” work here.
      </p>
      <details className="mt-1.5">
        <summary className="min-h-9 cursor-pointer py-1.5 font-medium text-ink max-md:min-h-11 max-md:py-2.5">Why</summary>
        <p>
          This page was opened over plain HTTP ({window.location.host}). Browsers only allow the cryptography this needs on a page opened
          over HTTPS, or on the computer Outpost itself runs on, because over plain HTTP anyone on the network could alter the page on its
          way to you and take your passphrase. On the computer Outpost runs on, http://localhost works as it is.
        </p>
      </details>
    </Notice>
  );
}

function ShelfTab({ children }: { children(shelf: NonNullable<ReturnType<typeof useShelf>["data"]>): React.ReactNode }) {
  const available = cryptographyAvailable();
  const shelf = useShelf(available);
  if (!available) {
    return (
      <p className="max-w-[46rem] text-small text-ink-muted">
        This needs HTTPS, as the notice above says. The ciphers under “By hand” work here.
      </p>
    );
  }
  if (shelf.isPending) {
    return (
      <div className="grid gap-4" aria-busy>
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (shelf.isError) return <ErrorState error={shelf.error} onRetry={() => shelf.refetch()} />;
  return <>{children(shelf.data)}</>;
}

export default function EncryptionPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab") as TabId | null;
  const tab: TabId = requested && TABS.includes(requested) ? requested : cryptographyAvailable() ? "keys" : "hand";

  // Leaving the screen forgets every unlocked key.
  useEffect(() => () => lockAll(), []);

  return (
    <Page>
      <PageHeader
        title="Encryption"
        description="Keep text, files and pages of your notes readable only by the people you choose, with OpenPGP keys that work with GnuPG. Or work a classical cipher with pencil and paper."
      />

      {cryptographyAvailable() ? null : <NeedsHttps />}

      <Tabs
        value={tab}
        onValueChange={(next) => {
          const copy = new URLSearchParams(params);
          copy.set("tab", next);
          setParams(copy, { replace: true });
        }}
      >
        {/* Wrapped, not scrolled, with large text; a finger's height on a phone. */}
        <TabsList aria-label="Encryption">
          <TabsTrigger value="keys">Keys</TabsTrigger>
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="hand">By hand</TabsTrigger>
        </TabsList>
        <TabsContent value="keys" className="pt-6 focus:outline-none">
          <ShelfTab>{(shelf) => <KeysTab shelf={shelf} />}</ShelfTab>
        </TabsContent>
        <TabsContent value="text" className="pt-6 focus:outline-none">
          <ShelfTab>{(shelf) => <TextTab shelf={shelf} />}</ShelfTab>
        </TabsContent>
        <TabsContent value="files" className="pt-6 focus:outline-none">
          <ShelfTab>{(shelf) => <FilesTab shelf={shelf} />}</ShelfTab>
        </TabsContent>
        <TabsContent value="hand" className="pt-6 focus:outline-none">
          <HandTab />
        </TabsContent>
      </Tabs>

      <footer className="mt-12 max-w-[70ch] border-t border-border pt-5 text-small text-ink-muted">
        <p className="flex items-start gap-2">
          <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold text-ink">What this is, and is not.</strong> It protects what you encrypt while it is stored
            and while it travels, between people who have exchanged keys. It does not hide that something is encrypted, who it is encrypted
            to, or how large it is. It does not protect anything from someone at a device while a key is unlocked or a decrypted text is on
            its screen (keys are forgotten after {IDLE_MINUTES} minutes without use). To encrypt a page of your notes, open the page and
            choose “Encrypt this page” from its menu. Outpost’s use of OpenPGP has not been audited by anyone; for something that matters,
            check the result with GnuPG.
          </span>
        </p>
      </footer>
    </Page>
  );
}
