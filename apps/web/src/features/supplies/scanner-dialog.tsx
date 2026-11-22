/**
 * Scan a barcode: to find an item already in the supplies (and change how many there
 * are), or to start a new one with its barcode filled in.
 *
 * Three ways in, always all on the screen: typing the number (a scanner that types like
 * a keyboard types into the same field and presses Enter), a photo of the barcode
 * (which works at any address), and the live camera, which browsers allow only on a
 * secure page; where it is not allowed the screen says so and how to get it.
 *
 * Nothing is looked up on the internet: a barcode the supplies do not know is a new
 * item whose name the person types, and it is known from then on.
 */
import type { BarcodeLookup, SupplyItem, SupplyItemInput } from "@outpost/shared";
import { localDay } from "@outpost/shared";
import { Camera, CameraOff, ImageUp, ScanBarcode, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { cameraState, formatWords, readPhoto, scanCamera } from "./barcode/camera";
import { lookupBarcode, useSupplies, useUpdateItem } from "./data";
import { Adjuster, ItemFacts, itemPath } from "./stock-view";

const link = "text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";

type Found = { lookup: BarcodeLookup; how: string };

/** Whether the device is mostly touched: there, putting the cursor in the field would raise the keyboard over the camera. */
const touch = () => typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

export function ScannerDialog({ onClose, onNew }: { onClose: () => void; onNew: (start: Partial<SupplyItemInput>) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"looking" | "photo" | "camera" | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const photo = useRef<HTMLInputElement>(null);
  const scanning = useRef<AbortController | null>(null);
  const camera = cameraState();
  const used = useUpdateItem();
  // The rows found are shown as the stock has them now, so that plus and minus here change the number at once.
  const stock = useSupplies();
  const live = (row: SupplyItem) => stock.data?.items.find((entry) => entry.id === row.id) ?? row;

  useEffect(() => () => scanning.current?.abort(), []);

  const look = async (value: string, how: string) => {
    const text = value.replace(/\s+/g, "");
    if (!text) return setProblem("Type the number under the bars, or scan it.");
    setProblem(null);
    setBusy("looking");
    try {
      setFound({ lookup: await lookupBarcode(text), how });
      setCode(text);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const startCamera = async () => {
    if (!video.current) return;
    const stop = new AbortController();
    scanning.current = stop;
    setProblem(null);
    setFound(null);
    setBusy("camera");
    try {
      const read = await scanCamera(video.current, stop.signal);
      if (read) await look(read.text, `Read by the camera (${formatWords(read.format)})`);
      else if (!stop.signal.aborted) setProblem("The camera was stopped while the page was hidden. Use the camera again to go on.");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setProblem(
        name === "NotAllowedError"
          ? "The camera was not allowed. Allow it for this page in the browser's settings, or type the number, or take a photo."
          : name === "NotFoundError"
            ? "This device has no camera Outpost can use. Type the number, or choose a photo."
            : `The camera could not be started: ${errorMessage(error)}`,
      );
    } finally {
      if (scanning.current === stop) scanning.current = null;
      setBusy((current) => (current === "camera" ? null : current));
    }
  };

  const stopCamera = () => {
    scanning.current?.abort();
    scanning.current = null;
    setBusy(null);
  };

  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setFound(null);
    setBusy("photo");
    try {
      const read = await readPhoto(file);
      if (read) await look(read.text, `Read from the photo (${formatWords(read.format)})`);
      else
        setProblem(
          "No barcode could be read in that photo. Take it closer, square on, with the bars sharp and filling about half the width, or type the number.",
        );
    } catch (error) {
      setProblem(`That photo could not be read: ${errorMessage(error)}`);
    } finally {
      setBusy((current) => (current === "photo" ? null : current));
      if (photo.current) photo.current.value = "";
    }
  };

  const again = () => {
    setFound(null);
    setCode("");
    setProblem(null);
    field.current?.focus();
  };

  const product = found?.lookup.product;
  const today = localDay();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="lg"
        title="Scan a barcode"
        description="Find something already in your supplies, or start a new item with its barcode filled in."
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          // On a touch screen the dialog itself takes the focus, so that no keyboard rises over the camera, but the
          // focus still moves into the dialog rather than staying on the screen behind it.
          if (!touch()) field.current?.focus();
          else (event.target as HTMLElement | null)?.focus();
        }}
      >
        <DialogBody className="grid gap-5">
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void look(code, "Typed");
            }}
          >
            <Field
              label="Barcode number"
              hint="Type it, or use a barcode scanner that types like a keyboard: it fills this in and presses Enter."
            >
              {(ids) => (
                <div className="flex gap-2">
                  <Input
                    {...ids}
                    ref={field}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                    enterKeyHint="search"
                    maxLength={64}
                    className="font-mono h-11 min-w-0 flex-1 text-lead"
                  />
                  <Button type="submit" variant="primary" className="h-11" loading={busy === "looking"}>
                    <Search />
                    Find
                  </Button>
                </div>
              )}
            </Field>
          </form>

          {found ? (
            <section aria-live="polite" className="grid gap-3 rounded-panel border border-border p-4">
              <p className="text-small text-ink-muted">
                {found.how}: <span className="font-mono text-ink">{found.lookup.code}</span>
              </p>
              {found.lookup.items.length > 0 ? (
                <>
                  <h3 className="text-lead font-semibold text-ink">In your supplies</h3>
                  <ul className="divide-y divide-border border-y border-border">
                    {found.lookup.items.map(live).map((item) => (
                      <li key={item.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <Link to={itemPath(item.id)} className="text-body font-medium text-ink hover:text-primary" onClick={onClose}>
                            {item.name}
                          </Link>
                          <ItemFacts item={item} today={today} />
                          {item.quantity > 0 ? (
                            <Button
                              variant="link"
                              size="sm"
                              className="max-md:min-h-11"
                              onClick={() =>
                                used.mutate(
                                  { id: item.id, input: { quantity: 0 } },
                                  {
                                    onSuccess: (saved) =>
                                      setFound(
                                        (current) =>
                                          current && {
                                            ...current,
                                            lookup: {
                                              ...current.lookup,
                                              items: current.lookup.items.map((row) => (row.id === saved.id ? saved : row)),
                                            },
                                          },
                                      ),
                                    onError: (error) => setProblem(errorMessage(error)),
                                  },
                                )
                              }
                            >
                              All used up
                            </Button>
                          ) : null}
                        </div>
                        <Adjuster item={item} />
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => onNew({ ...found.lookup.items[0]!, quantity: 1, date: null })}>Add another batch of it</Button>
                  </div>
                </>
              ) : product ? (
                <>
                  <h3 className="text-lead font-semibold text-ink">{product.name}</h3>
                  <p className="text-body text-ink-muted">
                    None in your supplies now, but it has been before. Add it again with what was known of it.
                  </p>
                  <Button variant="primary" className="justify-self-start" onClick={() => onNew({ ...product, quantity: 1 })}>
                    Add {product.name}
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lead font-semibold text-ink">Not in your supplies yet</h3>
                  <p className="text-body text-ink-muted">
                    New item: type its name. Outpost looks nothing up on the internet; it remembers this barcode from now on.
                  </p>
                  <Button variant="primary" className="justify-self-start" onClick={() => onNew({ barcode: found.lookup.code })}>
                    New item with this barcode
                  </Button>
                </>
              )}
            </section>
          ) : null}

          {problem ? <Notice tone="warning">{problem}</Notice> : null}

          <section className="grid gap-3">
            <h3 className="text-body font-semibold text-ink">With the camera</h3>
            {camera === "available" ? (
              <>
                <div className={busy === "camera" ? "relative overflow-hidden rounded-panel border border-border bg-surface" : "hidden"}>
                  {/* The camera's picture, while it is looking: no sound, nothing recorded. */}
                  <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline aria-label="What the camera sees" />
                  <div aria-hidden className="pointer-events-none absolute inset-x-[12%] top-1/2 h-px bg-primary" />
                </div>
                {busy === "camera" ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Spinner label="Looking for a barcode" />
                    <span className="text-small text-ink-muted">
                      Hold the bars across the line, about a hand's width away, in good light.
                    </span>
                    <Button onClick={stopCamera}>
                      <CameraOff />
                      Stop the camera
                    </Button>
                  </div>
                ) : (
                  <Button className="justify-self-start" onClick={() => void startCamera()} disabled={busy !== null}>
                    <Camera />
                    Use the camera
                  </Button>
                )}
              </>
            ) : camera === "insecure" ? (
              <Notice tone="info" icon={<CameraOff />} title="The camera is not available at this address">
                Browsers let a page use the live camera only when it is opened over HTTPS, or on the computer Outpost runs on. This page was
                opened over plain HTTP ({window.location.host}). To scan with the camera, turn on{" "}
                <Link to="/settings#https" className={link} onClick={onClose}>
                  Settings → HTTPS on your network
                </Link>{" "}
                and open Outpost at its https address. Until then, take a photo of the barcode below, or type the number.
              </Notice>
            ) : (
              <p className="text-small text-ink-muted">
                This browser offers no camera to the page. Take a photo of the barcode below, or type the number.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={photo}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                id="supplies-barcode-photo"
                onChange={(event) => void fromPhoto(event.target.files?.[0])}
              />
              <Button asChild variant={camera === "available" ? "secondary" : "primary"}>
                <label htmlFor="supplies-barcode-photo" className="cursor-pointer" aria-disabled={busy !== null || undefined}>
                  <ImageUp />
                  Take or choose a photo of it
                </label>
              </Button>
              {busy === "photo" ? <Spinner label="Reading the photo" /> : null}
            </div>
            <p className="text-small text-ink-muted">
              Reads EAN-13, EAN-8, UPC-A and Code 128: the codes on food and most things in a shop. Square on, sharp, in good light.
            </p>
          </section>
        </DialogBody>
        <DialogFooter>
          {found ? (
            <Button onClick={again}>
              <ScanBarcode />
              Scan another
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
