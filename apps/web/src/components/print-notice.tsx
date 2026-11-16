/**
 * What a screen with a Print button says when the browser's print cannot be counted
 * on: there is none, or the app was opened from the Home Screen, or Print was pressed
 * and nothing came of it. Nothing is shown otherwise. See lib/printing.ts.
 */
import { Printer } from "lucide-react";
import type { ReactNode } from "react";
import { Notice } from "@/components/page";
import type { Printing } from "@/lib/printing";

export function PrintNotice({
  printing,
  instead,
  className,
}: {
  printing: Pick<Printing, "canPrint" | "standalone" | "unanswered">;
  /** The other way this screen offers, as a sentence: "Save the PDF and print that." */
  instead: ReactNode;
  className?: string;
}) {
  if (!printing.canPrint) {
    return (
      <Notice tone="info" icon={<Printer />} title="This browser cannot print from a page" className={className}>
        {instead}
      </Notice>
    );
  }
  if (printing.unanswered) {
    return (
      <Notice
        tone="warning"
        icon={<Printer />}
        title="If no print dialogue opened, this browser does not print from a button"
        className={className}
      >
        {instead}
      </Notice>
    );
  }
  if (printing.standalone) {
    return (
      <Notice
        tone="info"
        icon={<Printer />}
        title="Opened from the Home Screen, a phone does not always print from a button"
        className={className}
      >
        {instead}
      </Notice>
    );
  }
  return null;
}
