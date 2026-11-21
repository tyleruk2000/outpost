/**
 * A QR code on a card (a saved place, a route, an estimated range) that a phone scans to
 * take it away: as a link that opens it in Outpost on the same network, as a `geo:` link
 * that any map app opens with no network at all, or as a link to its GPX file for another
 * app. The code is made here, in the browser, by the QR feature's own encoder; nothing is
 * sent anywhere to make it.
 */
import type { HttpsStatus } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { Copy, QrCode as QrIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Segmented, Select } from "@/components/ui/misc";
import { addressesFor } from "@/features/contacts/phones-page";
import { api } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { useSystem } from "@/lib/queries";
import { encodeQr } from "./encoder";
import { geoPayload } from "./payloads";
import { CodePicture } from "./qr-output";

export interface ShareTarget {
  /** What is being shared, as the dialog's title names it: "Scafell Pike". */
  name: string;
  /** The address inside Outpost that opens it: "/maps?marker=…". */
  outpostPath: string;
  /** A point for map apps. */
  geo?: { lat: number; lon: number };
  /** The address inside Outpost of its GPX file. */
  gpxPath?: string;
  /** A sentence about what the phone will see in Outpost, where it is not the thing itself. */
  outpostNote?: string;
}

type Way = "outpost" | "geo" | "gpx";

const WAY_LABELS: Record<Way, string> = { outpost: "Open in Outpost", geo: "Map apps (geo:)", gpx: "GPX file" };

/** What the code holds for one way, or why there is nothing to hold. */
export function shareText(way: Way, target: ShareTarget, base: string | null): { text: string } | { missing: "address" | "nothing" } {
  if (way === "geo") return target.geo ? { text: geoPayload(target.geo.lat, target.geo.lon) } : { missing: "nothing" };
  const path = way === "gpx" ? target.gpxPath : target.outpostPath;
  if (!path) return { missing: "nothing" };
  return base ? { text: `${base}${path}` } : { missing: "address" };
}

export function ShareCodeButton({ target, size = "sm" }: { target: ShareTarget; size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={size === "sm" ? "ghost" : undefined}>
          <QrIcon /> QR code
        </Button>
      </DialogTrigger>
      {open ? <ShareCodeDialog target={target} /> : null}
    </Dialog>
  );
}

function ShareCodeDialog({ target }: { target: ShareTarget }) {
  const ways = (["outpost", "geo", "gpx"] as const).filter((way) =>
    way === "outpost" ? true : way === "geo" ? Boolean(target.geo) : Boolean(target.gpxPath),
  );
  const [way, setWay] = useState<Way>("outpost");
  const https = useQuery({ queryKey: ["https"], queryFn: () => api.get<HttpsStatus>("/api/https") });
  const system = useSystem();
  // The origin of every address a phone could open: the https ones first, then the one this page is open at.
  const bases = useMemo(
    () => addressesFor(https.data, window.location.origin, "").map((address) => ({ ...address, url: address.url.replace(/\/$/, "") })),
    [https.data],
  );
  const [baseIndex, setBaseIndex] = useState(0);
  const base = bases[Math.min(baseIndex, bases.length - 1)] ?? null;
  const held = shareText(way, target, base?.url ?? null);
  const code = useMemo(() => ("text" in held ? encodeQr(held.text, { ecLevel: "M" }) : null), [held]);
  const local = system.data?.lanAccess === false;

  return (
    <DialogContent title={`QR code for ${target.name}`} size="sm">
      <DialogBody className="grid gap-3">
        {ways.length > 1 ? (
          <Segmented
            label="What the code opens"
            value={way}
            onChange={setWay}
            options={ways.map((value) => ({ value, label: WAY_LABELS[value] }))}
          />
        ) : null}
        <p className="text-small text-ink-muted">
          {way === "outpost"
            ? "A phone on the same network scans it to open this in Outpost there."
            : way === "geo"
              ? "Any map app on a phone opens the point, with no network at all."
              : "A phone on the same network downloads the GPX file, to open in another map app."}
          {way === "outpost" && target.outpostNote ? ` ${target.outpostNote}` : ""}
        </p>
        {"missing" in held ? (
          <Notice tone="info" title="No address a phone can use">
            This page is open on the computer Outpost runs on, at an address a phone cannot reach. Open Outpost at its network address, or
            turn on{" "}
            <Link to="/settings#https" className="text-primary underline underline-offset-2">
              HTTPS on your network
            </Link>
            , which lists the addresses.
            {target.geo ? " A geo: link needs no address." : ""}
          </Notice>
        ) : code ? (
          <>
            <div className="mx-auto w-full max-w-64 overflow-hidden rounded-panel border border-border-strong">
              <CodePicture code={code} label={`QR code: ${held.text}`} />
            </div>
            <p className="font-mono text-[0.8125rem] break-all text-ink">{held.text}</p>
            {way !== "geo" && bases.length > 1 ? (
              <div className="grid gap-1">
                <span className="text-small font-medium text-ink">Address</span>
                <Select
                  aria-label="Address"
                  value={String(Math.min(baseIndex, bases.length - 1))}
                  onChange={(value) => setBaseIndex(Number(value))}
                  options={bases.map((option, index) => ({
                    value: String(index),
                    label: option.url,
                    description: option.secure ? "Encrypted" : "Not encrypted",
                  }))}
                />
              </div>
            ) : null}
            {way !== "geo" && local ? (
              <Notice tone="warning" title="Outpost answers this computer only">
                Phones on the network cannot open it until it is shared with the network: see{" "}
                <Link to="/settings#access" className="text-primary underline underline-offset-2">
                  Who can use this library
                </Link>{" "}
                in Settings.
              </Notice>
            ) : null}
          </>
        ) : null}
      </DialogBody>
      <DialogFooter>
        {"text" in held ? (
          <Button
            onClick={async () => {
              if (await copyText(held.text)) toast.success("Copied.");
            }}
          >
            <Copy /> Copy
          </Button>
        ) : null}
      </DialogFooter>
    </DialogContent>
  );
}
