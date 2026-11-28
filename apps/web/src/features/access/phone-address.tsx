/**
 * Settings → Who can use this library, once it is shared with the network: the address to
 * give the phones, and a QR code a phone scans to open it. The code is made in this browser
 * by the QR feature's own encoder (features/qr); nothing is sent anywhere to make it.
 */
import type { HttpsStatus } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { addressesFor } from "@/features/contacts/phones-page";
import { encodeQr } from "@/features/qr/encoder";
import { CodePicture } from "@/features/qr/qr-output";
import { api } from "@/lib/api";

export function PhoneAddress({ origin = window.location.origin }: { origin?: string }) {
  const https = useQuery({ queryKey: ["https"], queryFn: () => api.get<HttpsStatus>("/api/https") });
  // The https addresses first, then the one this page is open at: never this computer's own (localhost).
  const best = addressesFor(https.data, origin, "/")[0]?.url ?? null;
  const code = useMemo(() => (best ? encodeQr(best, { ecLevel: "M" }) : null), [best]);

  if (https.isPending) return null;
  if (!best || !code) {
    return (
      <div className="grid gap-1">
        <h3 className="text-small font-medium text-ink">Address for phones</h3>
        <p className="max-w-[70ch] text-small text-ink-muted">
          This page is open at an address only this computer can use, so the one for phones cannot be shown here. Open Outpost at its
          network address instead. On a Raspberry Pi, <span className="font-mono text-[0.8125rem] text-ink">deploy/pi/install.sh</span>{" "}
          printed it at the end, under “On your network”, and <span className="font-mono text-[0.8125rem] text-ink">hostname -I</span> on
          the Pi prints its number again.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="grid gap-1">
        <h3 className="text-small font-medium text-ink">Address for phones</h3>
        <p className="font-mono text-[0.8125rem] break-all text-ink">{best}</p>
        <p className="max-w-[60ch] text-small text-ink-muted">
          Scan the code with a phone’s camera on the same network, or type the address, then add it to the Home Screen.
        </p>
      </div>
      <div className="w-36 overflow-hidden rounded-panel border border-border-strong">
        <CodePicture code={code} label={`QR code: ${best}`} />
      </div>
    </div>
  );
}
