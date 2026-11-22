/**
 * The first pages of a made PDF as they print, drawn by pdf.js from the file's own bytes:
 * what is shown is what was made. pdf.js is loaded with the preview, not before.
 */
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/misc";

export function PdfPagesPreview({
  bytes,
  pages,
  label,
}: {
  bytes: Uint8Array;
  pages: number;
  label: (page: number, of: number) => string;
}) {
  const [images, setImages] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setImages(null);
    setFailed(false);
    (async () => {
      const [{ getDocument }, { pdfOptions }] = await Promise.all([import("pdfjs-dist"), import("@/features/library/pdf-assets")]);
      const pdf = await getDocument({ ...pdfOptions, data: bytes.slice() }).promise;
      const out: string[] = [];
      for (let number = 1; number <= Math.min(pages, pdf.numPages); number += 1) {
        const page = await pdf.getPage(number);
        const viewport = page.getViewport({ scale: 1.6 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        out.push(canvas.toDataURL("image/png"));
      }
      await pdf.cleanup();
      return out;
    })()
      .then((made) => {
        if (live) setImages(made);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [bytes, pages]);
  if (failed)
    return <p className="text-small text-ink-muted">The pages could not be shown here. The PDF itself is made: save it to see them.</p>;
  if (!images) return <Skeleton className="aspect-[1/1.41] w-full" />;
  return (
    <div className="grid gap-4" data-testid="paper-preview">
      {images.map((src, index) => (
        <img
          // biome-ignore lint/suspicious/noArrayIndexKey: pages are in order
          key={index}
          src={src}
          alt={label(index + 1, images.length)}
          className="h-auto w-full rounded-panel border border-border-strong bg-page"
        />
      ))}
    </div>
  );
}
