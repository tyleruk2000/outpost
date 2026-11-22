/**
 * A button that reads files from this device and hands each one's text to the screen,
 * which sends it to the server: how a screen takes back what "Take everything out"
 * wrote. Each file is read and sent in turn; what each one made is said in one message,
 * and a file that could not be read is said by name, without stopping the others.
 */
import { formatBytes } from "@outpost/shared";
import { FileUp } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

export function BringInFile({
  children,
  accept,
  maxBytes,
  multiple = false,
  onFile,
  className,
}: {
  children: ReactNode;
  accept: string;
  maxBytes: number;
  multiple?: boolean;
  /** Sends one file's text; answers with what it made, in words ("Shack added."). */
  onFile: (text: string, name: string) => Promise<string>;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const read = async (files: File[]) => {
    setBusy(true);
    const said: string[] = [];
    try {
      for (const file of files) {
        if (file.size > maxBytes) {
          notify.error(`${file.name} is larger than ${formatBytes(maxBytes)}, so it was not read.`);
          continue;
        }
        try {
          said.push(await onFile(await file.text(), file.name));
        } catch (error) {
          notify.error(`${file.name}: ${errorMessage(error)}`);
        }
      }
    } finally {
      setBusy(false);
    }
    if (said.length > 0) toast.success(said.join(" "));
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length > 0) void read(files);
        }}
      />
      <Button className={className} loading={busy} onClick={() => input.current?.click()}>
        <FileUp /> {children}
      </Button>
    </>
  );
}
